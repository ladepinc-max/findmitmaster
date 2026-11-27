import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SUPER_ADMIN_EMAILS = ["findmitedutech@gmail.com", "ladepinc@gmail.com"];
type Admin = { from: (t: string) => any };

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}

async function weeklyFee(db: Admin) {
  const { data } = await db.from("app_pricing").select("amount, is_waived").eq("key", "shop_ad_week").maybeSingle();
  const row = data as { amount?: number; is_waived?: boolean } | null;
  const amount = Number(row?.amount ?? 50);
  return { amount, free: Boolean(row?.is_waived) || amount <= 0 };
}

async function loadOwnAd(db: Admin, adId: string, userId: string) {
  const { data } = await db.from("shop_ads").select("id, owner_id, weeks, status").eq("id", adId).maybeSingle();
  const ad = data as { id: string; owner_id: string; weeks: number; status: string } | null;
  if (!ad || ad.owner_id !== userId) throw new Error("Advert not found");
  return ad;
}

async function activate(db: Admin, adId: string, weeks: number, reference: string | null) {
  const expires = new Date(Date.now() + weeks * 7 * 86400000).toISOString();
  const patch: Record<string, unknown> = { status: "active", expires_at: expires };
  if (reference) patch["paid_reference"] = reference;
  const { error } = await db.from("shop_ads").update(patch).eq("id", adId);
  if (error) throw new Error(error.message);
  return expires;
}

/** Starts payment for a shop advert; goes live instantly when the admin has waived the fee. */
export const startShopAdCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ adId: z.string().uuid(), momoNumber: z.string().max(20).optional(), callbackUrl: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const ad = await loadOwnAd(db, data.adId, context.userId);
    const email = ((context.claims as { email?: string } | null)?.email ?? "").toLowerCase();
    const fee = await weeklyFee(db);
    if (fee.free || SUPER_ADMIN_EMAILS.includes(email)) {
      const expiresAt = await activate(db, ad.id, ad.weeks, null);
      return { activated: true as const, expiresAt, authorizationUrl: null };
    }
    const secret = process.env["PAYSTACK_SECRET_KEY"];
    if (!secret) throw new Error("Mobile Money payments are not switched on yet. Please try again later.");
    const reference = `fm_ad_${context.userId.slice(0, 8)}_${Date.now()}`;
    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email || "customer@findmit.app",
        amount: Math.round(fee.amount * ad.weeks * 100),
        currency: "GHS",
        reference,
        callback_url: data.callbackUrl,
        channels: ["mobile_money", "card"],
        metadata: { kind: "shop_ad", target_id: ad.id, user_id: context.userId, momo_number: (data.momoNumber ?? "").replace(/\D/g, "") },
      }),
    });
    const payload = (await res.json()) as { status?: boolean; message?: string; data?: { authorization_url?: string } };
    if (!payload.status || !payload.data?.authorization_url) throw new Error(payload.message ?? "Could not start the payment");
    return { activated: false as const, expiresAt: null, authorizationUrl: payload.data.authorization_url };
  });

/** Verifies the Paystack payment and switches the advert on. */
export const completeShopAdCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ reference: z.string().min(6) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: done } = await db.from("shop_ads").select("expires_at").eq("paid_reference", data.reference).maybeSingle();
    if (done) return { expiresAt: (done as { expires_at: string }).expires_at };
    const secret = process.env["PAYSTACK_SECRET_KEY"];
    if (!secret) throw new Error("Payments are not configured yet");
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(data.reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const payload = (await res.json()) as { status?: boolean; data?: { status?: string; amount?: number; metadata?: { kind?: string; target_id?: string; user_id?: string } } };
    const tx = payload.data;
    if (!payload.status || tx?.status !== "success") throw new Error("Payment could not be verified");
    if (tx.metadata?.kind !== "shop_ad" || !tx.metadata.target_id) throw new Error("This payment is not for an advert");
    if (tx.metadata.user_id !== context.userId) throw new Error("This payment belongs to another account");
    const ad = await loadOwnAd(db, tx.metadata.target_id, context.userId);
    const fee = await weeklyFee(db);
    if (!fee.free && (tx.amount ?? 0) < fee.amount * ad.weeks * 100) throw new Error("Payment amount does not match the advert fee");
    const expiresAt = await activate(db, ad.id, ad.weeks, data.reference);
    return { expiresAt };
  });
