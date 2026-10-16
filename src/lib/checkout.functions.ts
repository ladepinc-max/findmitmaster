import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const JOB_CHECKOUT_FEE = 100;
export const EXPERTISE_CHECKOUT_FEE = 30;

/** Live GHS amount from the admin pricing table, falling back to the defaults above. */
async function appFee(key: "job_post" | "talent_post", fallback: number): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as unknown as { from: (t: string) => any })
    .from("app_pricing").select("amount").eq("key", key).maybeSingle();
  return Number((data as { amount?: number } | null)?.amount ?? fallback);
}

const SUPER_ADMIN_EMAIL = "findmitedutech@gmail.com";

/** Admins (and the owner account) publish for free. */
async function isFreePoster(userId: string, email: string | null | undefined) {
  if ((email ?? "").toLowerCase() === SUPER_ADMIN_EMAIL) return true;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin");
  return (data ?? []).length > 0;
}

/**
 * Starts a Paystack hosted checkout and returns the page to redirect to.
 * The hosted page is used instead of the inline popup so mobile money works reliably.
 */
export const startPaystackCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        kind: z.enum(["job", "expertise"]),
        targetId: z.string().uuid(),
        momoNumber: z.string().min(9).max(20),
        callbackUrl: z.string().url(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const secret = process.env["PAYSTACK_SECRET_KEY"];
    if (!secret) throw new Error("Payments are not configured yet");

    const email = (context.claims as { email?: string } | null)?.email ?? "";
    const amount =
      data.kind === "job"
        ? await appFee("job_post", JOB_CHECKOUT_FEE)
        : await appFee("talent_post", EXPERTISE_CHECKOUT_FEE);
    const momo = data.momoNumber.replace(/\D/g, "");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Remember the payment number so the next checkout is pre-filled.
    await supabaseAdmin
      .from("profiles")
      .update({ payment_momo_number: momo.startsWith("233") ? `0${momo.slice(3)}` : momo })
      .eq("id", context.userId);

    // Only the owner of the listing may pay for it.
    if (data.kind === "job") {
      const { data: job } = await supabaseAdmin
        .from("jobs")
        .select("id, employer_id")
        .eq("id", data.targetId)
        .maybeSingle();
      if (!job || job.employer_id !== context.userId) throw new Error("Job not found");
    } else {
      const { data: talent } = await supabaseAdmin
        .from("talent_profiles")
        .select("id, user_id")
        .eq("id", data.targetId)
        .maybeSingle();
      if (!talent || talent.user_id !== context.userId) throw new Error("Listing not found");
    }

    const reference = `fm_${data.kind}_${context.userId.slice(0, 8)}_${Date.now()}`;

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email || "customer@findmit.app",
        amount: amount * 100,
        currency: "GHS",
        reference,
        callback_url: data.callbackUrl,
        channels: ["mobile_money", "card"],
        metadata: {
          momo_number: momo,
          user_id: context.userId,
          kind: data.kind,
          target_id: data.targetId,
        },
      }),
    });

    const payload = (await response.json()) as {
      status?: boolean;
      message?: string;
      data?: { authorization_url?: string; reference?: string };
    };
    if (!payload.status || !payload.data?.authorization_url) {
      throw new Error(payload.message ?? "Could not start the payment");
    }

    return {
      authorizationUrl: payload.data.authorization_url,
      reference: payload.data.reference ?? reference,
    } as const;
  });

/**
 * Verifies the Paystack reference after the customer returns, then publishes
 * the job or expertise listing the payment was for.
 */
export const completePaystackCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ reference: z.string().min(6) }).parse(data))
  .handler(async ({ data, context }) => {
    const secret = process.env["PAYSTACK_SECRET_KEY"];
    if (!secret) throw new Error("Payments are not configured yet");

    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(data.reference)}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    const payload = (await response.json()) as {
      status?: boolean;
      data?: {
        status?: string;
        amount?: number;
        channel?: string;
        metadata?: { kind?: string; target_id?: string; user_id?: string };
      };
    };
    const tx = payload.data;
    if (!payload.status || tx?.status !== "success") throw new Error("Payment could not be verified");

    const kind = tx.metadata?.kind;
    const targetId = tx.metadata?.target_id;
    if ((kind !== "job" && kind !== "expertise") || !targetId) {
      throw new Error("This payment is not linked to a listing");
    }
    if (tx.metadata?.user_id && tx.metadata.user_id !== context.userId) {
      throw new Error("This payment belongs to another account");
    }
    const fee =
      kind === "job"
        ? await appFee("job_post", JOB_CHECKOUT_FEE)
        : await appFee("talent_post", EXPERTISE_CHECKOUT_FEE);
    if ((tx.amount ?? 0) < fee * 100) throw new Error("Payment amount does not match the posting fee");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const method = tx.channel ?? null;

    if (kind === "job") {
      const { data: job } = await supabaseAdmin
        .from("jobs")
        .select("id, employer_id, is_paid")
        .eq("id", targetId)
        .maybeSingle();
      if (!job) throw new Error("Job not found");
      if (job.employer_id !== context.userId) throw new Error("You can only publish your own listing");
      if (job.is_paid) return { kind, published: true, alreadyDone: true } as const;

      await supabaseAdmin.from("job_payments").insert({
        user_id: context.userId,
        job_id: targetId,
        amount: Math.round((tx.amount ?? 0) / 100),
        currency: "GHS",
        reference: data.reference,
        method,
        status: "paid",
      });

      const expires = new Date();
      expires.setDate(expires.getDate() + 30);
      const { error } = await supabaseAdmin
        .from("jobs")
        .update({ is_paid: true, plan: "post", expires_at: expires.toISOString() })
        .eq("id", targetId);
      if (error) throw new Error(error.message);
      return { kind, published: true, alreadyDone: false } as const;
    }

    const { data: talent } = await supabaseAdmin
      .from("talent_profiles")
      .select("id, user_id, is_paid")
      .eq("id", targetId)
      .maybeSingle();
    if (!talent) throw new Error("Expertise listing not found");
    if (talent.user_id !== context.userId) throw new Error("You can only publish your own listing");
    if (talent.is_paid) return { kind, published: true, alreadyDone: true } as const;

    await supabaseAdmin.from("expertise_payments").insert({
      user_id: context.userId,
      talent_profile_id: targetId,
      amount: fee,
      currency: "GHS",
      reference: data.reference,
      method,
      status: "paid",
    });

    const { error } = await supabaseAdmin
      .from("talent_profiles")
      .update({ is_paid: true, paid_at: new Date().toISOString(), review_status: "approved" })
      .eq("id", targetId);
    if (error) throw new Error(error.message);
    return { kind, published: true, alreadyDone: false } as const;
  });

/** Kept for symmetry: tells the UI whether this account posts for free. */
export const isFreePostingAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = (context.claims as { email?: string } | null)?.email ?? null;
    return { free: await isFreePoster(context.userId, email) } as const;
  });
