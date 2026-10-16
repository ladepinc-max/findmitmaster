import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const JOB_POST_FEE = 100;
const JOB_FALLBACK_FEE = JOB_POST_FEE;

async function jobPostFee(): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as unknown as { from: (t: string) => any })
    .from("app_pricing").select("amount").eq("key", "job_post").maybeSingle();
  return Number((data as { amount?: number } | null)?.amount ?? JOB_FALLBACK_FEE);
}

export const EXPERTISE_POST_FEE = 30;

const SUPER_ADMIN_EMAIL = "findmitedutech@gmail.com";

/** Admins (and the owner account) publish for free. */
type FreeFeature = "jobs_post" | "talent_post" | "jobs_contact";

/** Admin-granted free access for one paid feature (set in the admin's profile table). */
async function hasFreeAccess(userId: string, feature: FreeFeature) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Admin waiver: the whole section is free for everyone.
  const priceKey = { jobs_post: "job_post", talent_post: "talent_post", jobs_contact: "job_apply" }[feature];
  const { data: waiver } = await (supabaseAdmin as unknown as { from: (t: string) => any })
    .from("app_pricing").select("is_waived").eq("key", priceKey).maybeSingle();
  if ((waiver as { is_waived?: boolean } | null)?.is_waived) return true;
  const { data } = await (supabaseAdmin as unknown as { from: (t: string) => any })
    .from("user_free_access")
    .select(feature)
    .eq("user_id", userId)
    .maybeSingle();
  if ((data as Record<string, boolean> | null)?.[feature]) return true;
  // Paid FindMit Wallet packages unlock the same areas until they expire.
  const { data: passes } = await (supabaseAdmin as unknown as { from: (t: string) => any })
    .from("wallet_passes")
    .select("id")
    .eq("user_id", userId)
    .contains("areas", [feature])
    .gt("expires_at", new Date().toISOString())
    .limit(1);
  return ((passes as unknown[] | null) ?? []).length > 0;
}

async function isFreePoster(userId: string, email: string | null | undefined, feature?: FreeFeature) {
  if ((email ?? "").toLowerCase() === SUPER_ADMIN_EMAIL) return true;
  if (feature && (await hasFreeAccess(userId, feature))) return true;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Approved FindMit Ghana members post free in the area they were approved for.
  if (feature === "talent_post") {
    const { data: prof } = await supabaseAdmin.from("profiles").select("verification_status").eq("id", userId).maybeSingle();
    if (prof?.verification_status === "verified") return true;
  }
  if (feature === "jobs_post") {
    const { data: apps } = await supabaseAdmin
      .from("company_verification_applications")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "approved")
      .limit(1);
    if ((apps ?? []).length > 0) return true;
  }
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "moderator"]);
  return (data ?? []).some((row) => row.role === "admin");
}

/** Confirms the Paystack charge covers the fee. Throws when it does not. */
async function verifyPaystack(reference: string, minAmount: number) {
  const secret = process.env["PAYSTACK_SECRET_KEY"];
  if (!secret) return { method: null as string | null, status: "unverified" };
  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secret}` } },
  );
  const payload = (await response.json()) as {
    status?: boolean;
    data?: { status?: string; amount?: number; channel?: string };
  };
  const tx = payload.data;
  if (!payload.status || tx?.status !== "success") throw new Error("Payment could not be verified");
  if ((tx.amount ?? 0) < minAmount * 100) throw new Error("Payment amount does not match the posting fee");
  return { method: tx.channel ?? null, status: "paid" };
}

/** Tells the UI whether this user posts free and whether they already paid for a job post. */
export const getPostingPrivileges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = (context.claims as { email?: string } | null)?.email ?? null;
    const free = await isFreePoster(context.userId, email, "jobs_post");
    const freeTalentPost = await isFreePoster(context.userId, email, "talent_post");
    const freeContact = await hasFreeAccess(context.userId, "jobs_contact");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("job_payments")
      .select("id")
      .eq("user_id", context.userId)
      .eq("status", "paid")
      .gt("amount", 0)
      .limit(1);
    return { isAdmin: free, freeTalentPost, hasPaidJob: free || freeContact || (data ?? []).length > 0 } as const;
  });

/** Publishes a job after a verified job post payment (free for admins). */
export const publishJobPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ jobId: z.string().uuid(), reference: z.string().min(6).optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const email = (context.claims as { email?: string } | null)?.email ?? null;
    const free = await isFreePoster(context.userId, email, "jobs_post");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: job } = await supabaseAdmin
      .from("jobs")
      .select("id, employer_id")
      .eq("id", data.jobId)
      .maybeSingle();
    if (!job) throw new Error("Job not found");
    if (job.employer_id !== context.userId) throw new Error("You can only publish your own listing");

    let method: string | null = null;
    let status = "free";
    if (!free) {
      if (!data.reference) throw new Error("Payment is required before publishing");
      const verified = await verifyPaystack(data.reference, await jobPostFee());
      method = verified.method;
      status = verified.status === "paid" ? "paid" : "paid";
    }

    const { error: payError } = await supabaseAdmin.from("job_payments").insert({
      user_id: context.userId,
      job_id: data.jobId,
      amount: free ? 0 : await jobPostFee(),
      currency: "GHS",
      reference: data.reference ?? `fm_admin_job_${data.jobId}`,
      method,
      status: free ? "free" : status,
    });
    if (payError) throw new Error("This payment was already applied");

    const expires = new Date();
    expires.setDate(expires.getDate() + 30);
    const { error } = await supabaseAdmin
      .from("jobs")
      .update({ is_paid: true, plan: "post", expires_at: expires.toISOString() })
      .eq("id", data.jobId);
    if (error) throw new Error(error.message);

    return { published: true, free } as const;
  });

/** Publishes an expertise listing after a verified GHS 25 payment (free for admins). */
export const publishExpertisePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ talentProfileId: z.string().uuid(), reference: z.string().min(6).optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const email = (context.claims as { email?: string } | null)?.email ?? null;
    const free = await isFreePoster(context.userId, email, "talent_post");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: talent } = await supabaseAdmin
      .from("talent_profiles")
      .select("id, user_id")
      .eq("id", data.talentProfileId)
      .maybeSingle();
    if (!talent) throw new Error("Expertise listing not found");
    if (talent.user_id !== context.userId) throw new Error("You can only publish your own listing");

    let method: string | null = null;
    if (!free) {
      if (!data.reference) throw new Error("Payment is required before publishing");
      const verified = await verifyPaystack(data.reference, EXPERTISE_POST_FEE);
      method = verified.method;
    }

    const { error: payError } = await supabaseAdmin.from("expertise_payments").insert({
      user_id: context.userId,
      talent_profile_id: data.talentProfileId,
      amount: free ? 0 : EXPERTISE_POST_FEE,
      currency: "GHS",
      reference: data.reference ?? `fm_admin_exp_${data.talentProfileId}`,
      method,
      status: free ? "free" : "paid",
    });
    if (payError) throw new Error("This payment was already applied");

    const { error } = await supabaseAdmin
      .from("talent_profiles")
      .update({ is_paid: true, paid_at: new Date().toISOString(), review_status: "approved" })
      .eq("id", data.talentProfileId);
    if (error) throw new Error(error.message);

    return { published: true, free } as const;
  });
