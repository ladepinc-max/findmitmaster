import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Verifies a Paystack wallet payment and activates the package rules (duration + areas). */
export const activateWalletPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ packageId: z.string().uuid(), reference: z.string().min(6).max(120) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as unknown as { from: (t: string) => any };

    const { data: pkg } = await db
      .from("wallet_packages")
      .select("id, title, amount, duration_days, areas, is_active")
      .eq("id", data.packageId)
      .maybeSingle();
    if (!pkg || !pkg.is_active) throw new Error("This package is no longer available");

    const { data: existing } = await db
      .from("wallet_passes")
      .select("id, expires_at")
      .eq("reference", data.reference)
      .maybeSingle();
    if (existing) return { expiresAt: existing.expires_at as string, alreadyDone: true };

    const secret = process.env["PAYSTACK_SECRET_KEY"];
    if (!secret) throw new Error("Payments are not configured");
    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(data.reference)}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    const payload = (await res.json()) as { status?: boolean; data?: { status?: string; amount?: number } };
    if (!payload.status || payload.data?.status !== "success") throw new Error("Payment could not be verified");
    if ((payload.data.amount ?? 0) < Number(pkg.amount) * 100) throw new Error("Payment amount does not match the package");

    // Stack on top of any pass still running so days are never lost.
    const { data: latest } = await db
      .from("wallet_passes")
      .select("expires_at")
      .eq("user_id", context.userId)
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const start = new Date();
    const base = latest ? new Date(latest.expires_at as string) : start;
    const expires = new Date(base.getTime() + Number(pkg.duration_days) * 86400000);

    const { error } = await db.from("wallet_passes").insert({
      user_id: context.userId,
      package_id: pkg.id,
      title: pkg.title,
      amount: pkg.amount,
      areas: pkg.areas,
      reference: data.reference,
      starts_at: start.toISOString(),
      expires_at: expires.toISOString(),
    });
    if (error) throw new Error("This payment was already applied");
    return { expiresAt: expires.toISOString(), alreadyDone: false };
  });
