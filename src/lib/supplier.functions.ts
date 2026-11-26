import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SUPER_ADMIN_EMAILS = ["findmitedutech@gmail.com", "ladepinc@gmail.com"];
const DEFAULT_FEE = 200;
type Admin = { from: (table: string) => any };

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}

async function supplierFee(db: Admin, supplierId: string) {
  const { data: supplier } = await db.from("suppliers").select("category").eq("id", supplierId).maybeSingle();
  const category = (supplier as { category?: string } | null)?.category ?? "";
  const { data: categoryRow } = await db.from("shop_categories").select("registration_fee, is_waived, is_active").eq("value", category).maybeSingle();
  const row = categoryRow as { registration_fee?: number; is_waived?: boolean; is_active?: boolean } | null;
  if (row?.is_active) {
    const amount = Number(row.registration_fee ?? DEFAULT_FEE);
    return { amount, free: Boolean(row.is_waived) || amount <= 0 };
  }
  const { data } = await db.from("app_pricing").select("amount, is_waived").eq("key", "shop_registration").maybeSingle();
  const fallback = data as { amount?: number; is_waived?: boolean } | null;
  const amount = Number(fallback?.amount ?? DEFAULT_FEE);
  return { amount, free: Boolean(fallback?.is_waived) || amount <= 0 };
}

async function activateSupplier(db: Admin, supplierId: string) {
  const { data: supplier } = await db.from("suppliers").select("subscription_expires_at").eq("id", supplierId).maybeSingle();
  const now = new Date();
  const current = (supplier as { subscription_expires_at?: string | null } | null)?.subscription_expires_at;
  const expiry = current && new Date(current) > now ? new Date(current) : now;
  expiry.setDate(expiry.getDate() + 365);
  const { error } = await db.from("suppliers").update({ subscription_status: "active", subscription_expires_at: expiry.toISOString() }).eq("id", supplierId);
  if (error) throw new Error(error.message);
  return expiry.toISOString();
}

export const startSupplierCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    supplierId: z.string().uuid(),
    momoNumber: z.string().max(20).optional(),
    callbackUrl: z.string().url(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: supplier } = await db.from("suppliers").select("id, owner_id").eq("id", data.supplierId).maybeSingle();
    if (!supplier || (supplier as { owner_id: string }).owner_id !== context.userId) throw new Error("Supplier profile not found");
    const email = ((context.claims as { email?: string } | null)?.email ?? "").toLowerCase();
    const fee = await supplierFee(db, data.supplierId);
    if (fee.free || SUPER_ADMIN_EMAILS.includes(email)) {
      const expiresAt = await activateSupplier(db, data.supplierId);
      return { activated: true as const, expiresAt, authorizationUrl: null };
    }
    const secret = process.env["PAYSTACK_SECRET_KEY"];
    if (!secret) throw new Error("Mobile Money payments are not switched on yet. Please try again later.");
    const reference = `fm_supplier_${context.userId.slice(0, 8)}_${Date.now()}`;
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email || "customer@findmit.app",
        amount: Math.round(fee.amount * 100),
        currency: "GHS",
        reference,
        callback_url: data.callbackUrl,
        channels: ["mobile_money", "card"],
        metadata: { kind: "supplier", target_id: data.supplierId, user_id: context.userId, momo_number: (data.momoNumber ?? "").replace(/\D/g, "") },
      }),
    });
    const payload = await response.json() as { status?: boolean; message?: string; data?: { authorization_url?: string } };
    if (!payload.status || !payload.data?.authorization_url) throw new Error(payload.message ?? "Could not start the payment");
    return { activated: false as const, expiresAt: null, authorizationUrl: payload.data.authorization_url };
  });

export const completeSupplierCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ reference: z.string().min(6) }).parse(input))
  .handler(async ({ data, context }) => {
    const secret = process.env["PAYSTACK_SECRET_KEY"];
    if (!secret) throw new Error("Payments are not configured yet");
    const db = await admin();
    const { data: done } = await db.from("supplier_payments").select("supplier_id").eq("reference", data.reference).maybeSingle();
    if (done) {
      const supplierId = (done as { supplier_id: string }).supplier_id;
      const { data: supplier } = await db.from("suppliers").select("name, subscription_expires_at").eq("id", supplierId).maybeSingle();
      const row = supplier as { name: string; subscription_expires_at: string } | null;
      if (!row) throw new Error("Supplier profile not found");
      return { name: row.name, expiresAt: row.subscription_expires_at };
    }
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(data.reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const payload = await response.json() as {
      status?: boolean;
      data?: { status?: string; amount?: number; channel?: string; metadata?: { kind?: string; target_id?: string; user_id?: string } };
    };
    const transaction = payload.data;
    if (!payload.status || transaction?.status !== "success") throw new Error("Payment could not be verified");
    if (transaction.metadata?.kind !== "supplier" || !transaction.metadata.target_id) throw new Error("This payment is not for a supplier");
    if (transaction.metadata.user_id !== context.userId) throw new Error("This payment belongs to another account");
    const supplierId = transaction.metadata.target_id;
    const fee = await supplierFee(db, supplierId);
    if (!fee.free && (transaction.amount ?? 0) < fee.amount * 100) throw new Error("Payment amount does not match the supplier fee");
    const { data: supplier } = await db.from("suppliers").select("owner_id, name").eq("id", supplierId).maybeSingle();
    if (!supplier || (supplier as { owner_id: string }).owner_id !== context.userId) throw new Error("Supplier profile not found");
    const { error } = await db.from("supplier_payments").insert({
      supplier_id: supplierId,
      user_id: context.userId,
      amount: Math.round((transaction.amount ?? 0) / 100),
      reference: data.reference,
      method: transaction.channel ?? null,
      status: "paid",
    });
    if (error) throw new Error(error.message);
    const expiresAt = await activateSupplier(db, supplierId);
    return { name: (supplier as { name: string }).name, expiresAt };
  });
