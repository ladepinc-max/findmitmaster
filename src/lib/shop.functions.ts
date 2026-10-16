import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SUPER_ADMIN_EMAIL = "findmitedutech@gmail.com";
const DEFAULT_FEE = 200;

type Admin = { from: (t: string) => any };

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}

async function shopFee(db: Admin) {
  const { data } = await db.from("app_pricing").select("amount, is_waived").eq("key", "shop_registration").maybeSingle();
  const row = data as { amount?: number; is_waived?: boolean } | null;
  const amount = Number(row?.amount ?? DEFAULT_FEE);
  return { amount, free: Boolean(row?.is_waived) || amount <= 0 };
}

async function activate(db: Admin, shopId: string) {
  const { data: shop } = await db.from("shops").select("subscription_expires_at").eq("id", shopId).maybeSingle();
  const now = new Date();
  const cur = (shop as { subscription_expires_at?: string | null } | null)?.subscription_expires_at;
  const base = cur && new Date(cur) > now ? new Date(cur) : now;
  base.setDate(base.getDate() + 365);
  const { error } = await db
    .from("shops")
    .update({ subscription_status: "active", subscription_expires_at: base.toISOString() })
    .eq("id", shopId);
  if (error) throw new Error(error.message);
  return base.toISOString();
}

/** Starts the yearly shop payment. Activates instantly when the admin has waived the fee. */
export const startShopCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ shopId: z.string().uuid(), momoNumber: z.string().max(20).optional(), callbackUrl: z.string().url() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: shop } = await db.from("shops").select("id, owner_id").eq("id", data.shopId).maybeSingle();
    if (!shop || (shop as { owner_id: string }).owner_id !== context.userId) throw new Error("Shop not found");

    const email = ((context.claims as { email?: string } | null)?.email ?? "").toLowerCase();
    const fee = await shopFee(db);
    if (fee.free || email === SUPER_ADMIN_EMAIL) {
      const expiresAt = await activate(db, data.shopId);
      return { activated: true as const, expiresAt, authorizationUrl: null };
    }

    const secret = process.env["PAYSTACK_SECRET_KEY"];
    if (!secret) throw new Error("Mobile Money payments are not switched on yet. Please try again later.");
    const momo = (data.momoNumber ?? "").replace(/\D/g, "");
    const reference = `fm_shop_${context.userId.slice(0, 8)}_${Date.now()}`;
    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email || "customer@findmit.app",
        amount: Math.round(fee.amount * 100),
        currency: "GHS",
        reference,
        callback_url: data.callbackUrl,
        channels: ["mobile_money", "card"],
        metadata: { kind: "shop", target_id: data.shopId, user_id: context.userId, momo_number: momo },
      }),
    });
    const payload = (await res.json()) as { status?: boolean; message?: string; data?: { authorization_url?: string } };
    if (!payload.status || !payload.data?.authorization_url) throw new Error(payload.message ?? "Could not start the payment");
    return { activated: false as const, expiresAt: null, authorizationUrl: payload.data.authorization_url };
  });

/** Verifies the Paystack payment and unlocks the shop for one year. */
export const completeShopCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ reference: z.string().min(6) }).parse(d))
  .handler(async ({ data, context }) => {
    const secret = process.env["PAYSTACK_SECRET_KEY"];
    if (!secret) throw new Error("Payments are not configured yet");
    const db = await admin();

    const { data: done } = await db.from("shop_payments").select("shop_id").eq("reference", data.reference).maybeSingle();
    if (done) {
      const { data: s } = await db.from("shops").select("handle, subscription_expires_at").eq("id", (done as { shop_id: string }).shop_id).maybeSingle();
      return { handle: (s as { handle: string }).handle, expiresAt: (s as { subscription_expires_at: string }).subscription_expires_at };
    }

    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(data.reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const payload = (await res.json()) as {
      status?: boolean;
      data?: { status?: string; amount?: number; channel?: string; metadata?: { kind?: string; target_id?: string; user_id?: string } };
    };
    const tx = payload.data;
    if (!payload.status || tx?.status !== "success") throw new Error("Payment could not be verified");
    if (tx.metadata?.kind !== "shop" || !tx.metadata.target_id) throw new Error("This payment is not for a shop");
    if (tx.metadata.user_id !== context.userId) throw new Error("This payment belongs to another account");
    const fee = await shopFee(db);
    if (!fee.free && (tx.amount ?? 0) < fee.amount * 100) throw new Error("Payment amount does not match the shop fee");

    const shopId = tx.metadata.target_id;
    const { data: shop } = await db.from("shops").select("owner_id, handle").eq("id", shopId).maybeSingle();
    if (!shop || (shop as { owner_id: string }).owner_id !== context.userId) throw new Error("Shop not found");

    const { error } = await db.from("shop_payments").insert({
      shop_id: shopId,
      user_id: context.userId,
      amount: Math.round((tx.amount ?? 0) / 100),
      reference: data.reference,
      method: tx.channel ?? null,
      status: "paid",
    });
    if (error) throw new Error(error.message);
    const expiresAt = await activate(db, shopId);
    return { handle: (shop as { handle: string }).handle, expiresAt };
  });
