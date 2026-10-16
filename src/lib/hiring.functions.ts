import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  plan: z.enum(["single", "starter", "pro"]),
  reference: z.string().min(6),
});

const PLAN_VALUES: Record<string, { amount: number; contacts: number; featured: number }> = {
  single: { amount: 30, contacts: 1, featured: 0 },
  starter: { amount: 120, contacts: 5, featured: 0 },
  pro: { amount: 400, contacts: 20, featured: 1 },
};

const JOB_PLAN_VALUES: Record<string, { amount: number; days: number; featured: boolean }> = {
  post: { amount: 25, days: 30, featured: false },
  featured: { amount: 50, days: 30, featured: true },
  renew: { amount: 15, days: 30, featured: false },
};

const jobSchema = z.object({
  jobId: z.string().uuid(),
  plan: z.enum(["post", "featured", "renew"]),
  reference: z.string().min(6),
});

/** Verifies the Paystack charge for a job listing and activates/extends it. */
export const redeemJobPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => jobSchema.parse(data))
  .handler(async ({ data, context }) => {
    const plan = JOB_PLAN_VALUES[data.plan]!;
    const secret = process.env["PAYSTACK_SECRET_KEY"];
    let method: string | null = null;
    let status = "unverified";

    if (secret) {
      const response = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(data.reference)}`,
        { headers: { Authorization: `Bearer ${secret}` } },
      );
      const payload = (await response.json()) as {
        status?: boolean;
        data?: { status?: string; amount?: number; channel?: string };
      };
      const tx = payload.data;
      if (!payload.status || tx?.status !== "success") throw new Error("Payment could not be verified");
      if ((tx.amount ?? 0) < plan.amount * 100) throw new Error("Payment amount does not match the plan");
      method = tx.channel ?? null;
      status = "paid";
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: job, error: jobError } = await supabaseAdmin
      .from("jobs")
      .select("id, employer_id, expires_at, is_featured")
      .eq("id", data.jobId)
      .maybeSingle();
    if (jobError || !job) throw new Error("Job not found");
    if (job.employer_id !== context.userId) throw new Error("You can only pay for your own listing");

    const { error: purchaseError } = await supabaseAdmin.from("contact_purchases").insert({
      user_id: context.userId,
      plan: `job_${data.plan}`,
      amount: plan.amount,
      currency: "GHS",
      contacts: 0,
      featured: plan.featured ? 1 : 0,
      reference: data.reference,
      method,
      status,
    });
    if (purchaseError) throw new Error("This payment was already applied");

    const base = job.expires_at && new Date(job.expires_at) > new Date() ? new Date(job.expires_at) : new Date();
    base.setDate(base.getDate() + plan.days);

    const { error } = await supabaseAdmin
      .from("jobs")
      .update({
        expires_at: base.toISOString(),
        is_paid: true,
        plan: data.plan,
        is_featured: plan.featured || job.is_featured,
      })
      .eq("id", data.jobId);
    if (error) throw new Error(error.message);

    return { expires_at: base.toISOString() } as const;
  });

/**
 * Verifies a Paystack transaction (when a secret key is configured) and credits
 * the employer's contact balance. Credits are only ever granted server-side.
 */
export const redeemContactPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const plan = PLAN_VALUES[data.plan]!;
    const secret = process.env["PAYSTACK_SECRET_KEY"];
    let method: string | null = null;
    let status = "unverified";

    if (secret) {
      const response = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(data.reference)}`,
        { headers: { Authorization: `Bearer ${secret}` } },
      );
      const payload = (await response.json()) as {
        status?: boolean;
        data?: { status?: string; amount?: number; currency?: string; channel?: string };
      };
      const tx = payload.data;
      if (!payload.status || tx?.status !== "success") {
        throw new Error("Payment could not be verified");
      }
      if ((tx.amount ?? 0) < plan.amount * 100) {
        throw new Error("Payment amount does not match the selected plan");
      }
      method = tx.channel ?? null;
      status = "paid";
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: purchaseError } = await supabaseAdmin.from("contact_purchases").insert({
      user_id: context.userId,
      plan: data.plan,
      amount: plan.amount,
      currency: "GHS",
      contacts: plan.contacts,
      featured: plan.featured,
      reference: data.reference,
      method,
      status,
    });
    // A duplicate reference means this purchase was already redeemed.
    if (purchaseError) throw new Error("This payment was already applied");

    const { data: existing } = await supabaseAdmin
      .from("employer_credits")
      .select("contacts_remaining, featured_credits")
      .eq("user_id", context.userId)
      .maybeSingle();

    const { error } = await supabaseAdmin.from("employer_credits").upsert(
      {
        user_id: context.userId,
        contacts_remaining: (existing?.contacts_remaining ?? 0) + plan.contacts,
        featured_credits: (existing?.featured_credits ?? 0) + plan.featured,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);

    return { contacts: plan.contacts, featured: plan.featured } as const;
  });
