import { supabase } from "@/integrations/supabase/client";
import type { PostAuthor } from "@/lib/social";

export interface ContactPlan {
  id: "single" | "starter" | "pro";
  name: string;
  price: number;
  contacts: number;
  featured: number;
  blurb: string;
  popular?: boolean;
}

export const CONTACT_PLANS: ContactPlan[] = [
  {
    id: "single",
    name: "Single Contact",
    price: 30,
    contacts: 1,
    featured: 0,
    blurb: "Unlock 1 talent phone & WhatsApp",
  },
  {
    id: "starter",
    name: "Starter Pack",
    price: 120,
    contacts: 5,
    featured: 0,
    blurb: "5 talent contacts",
    popular: true,
  },
  {
    id: "pro",
    name: "Pro Employer",
    price: 400,
    contacts: 20,
    featured: 1,
    blurb: "20 contacts + 1 featured job post",
  },
];

export interface JobPlan {
  id: "post" | "featured" | "renew";
  name: string;
  price: number;
  days: number;
  blurb: string;
}

/** Find Jobs paywall: employers pay to publish, feature and renew listings. */
export const JOB_PLANS: JobPlan[] = [
  { id: "post", name: "Standard Post", price: 25, days: 30, blurb: "Live for 30 days" },
  { id: "featured", name: "Featured Post", price: 50, days: 30, blurb: "Top placement for 30 days" },
  { id: "renew", name: "Renewal", price: 15, days: 30, blurb: "Add another 30 days" },
];

export interface EmployerCredits {
  contacts_remaining: number;
  featured_credits: number;
}

export interface TalentContact {
  phone: string;
  whatsapp: string | null;
  user_id: string;
}

export async function fetchCredits(userId: string): Promise<EmployerCredits> {
  const { data, error } = await supabase
    .from("employer_credits")
    .select("contacts_remaining, featured_credits")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? { contacts_remaining: 0, featured_credits: 0 };
}

export async function fetchUnlockedTalentIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("talent_unlocks")
    .select("talent_profile_id")
    .eq("employer_id", userId);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.talent_profile_id));
}

export async function fetchTalentContact(talentProfileId: string): Promise<TalentContact | null> {
  const { data, error } = await supabase
    .from("talent_contacts")
    .select("phone, whatsapp, user_id")
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function saveMyTalentContact(input: {
  talentProfileId: string;
  userId: string;
  phone: string;
  whatsapp: string | null;
}) {
  const { error } = await supabase.from("talent_contacts").upsert(
    {
      talent_profile_id: input.talentProfileId,
      user_id: input.userId,
      phone: input.phone,
      whatsapp: input.whatsapp,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "talent_profile_id" },
  );
  if (error) throw error;
}

/** Spends one contact credit server-side. Returns false when the employer has none left. */
export async function unlockTalentContact(talentProfileId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("unlock_talent_contact", {
    _talent_profile_id: talentProfileId,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function fetchSavedJobIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from("saved_jobs").select("job_id").eq("user_id", userId);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.job_id));
}

export async function toggleSavedJob(userId: string, jobId: string, saved: boolean) {
  if (saved) {
    const { error } = await supabase.from("saved_jobs").delete().eq("user_id", userId).eq("job_id", jobId);
    if (error) throw error;
    return false;
  }
  const { error } = await supabase.from("saved_jobs").insert({ user_id: userId, job_id: jobId });
  if (error) throw error;
  return true;
}

export interface EmployerJobRow {
  id: string;
  title: string;
  company: string;
  is_open: boolean;
  is_featured: boolean;
  applicants_count: number;
  created_at: string;
  expires_at: string | null;
  is_paid: boolean;
  plan: string | null;
}

export async function fetchMyJobPosts(employerId: string): Promise<EmployerJobRow[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select("id, title, company, is_open, is_featured, applicants_count, created_at, expires_at, is_paid, plan")
    .eq("employer_id", employerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as EmployerJobRow[] | null) ?? [];
}

export interface ApplicantRow {
  id: string;
  created_at: string;
  status: string | null;
  conversation_id: string | null;
  employee_id: string;
  talent_id: string | null;
  applicant: PostAuthor | null;
}

export async function fetchJobApplicants(jobId: string): Promise<ApplicantRow[]> {
  const { data, error } = await supabase
    .from("job_applications")
    .select(
      "id, created_at, status, conversation_id, employee_id, talent_id, applicant:profiles!job_applications_employee_id_fkey(id,username,display_name,photo_path,is_verified)",
    )
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as ApplicantRow[] | null) ?? [];
}

/** Finds the talent profile owned by a user, so an employer can unlock their contact. */
export async function fetchTalentProfileIdForUser(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export function maskPhone(phone: string | null | undefined) {
  if (!phone) return "0** *** ***";
  return `${phone.slice(0, 2)}** *** ***`;
}

export interface UnlockRow {
  id: string;
  created_at: string;
  talent_profile_id: string;
  talent: {
    id: string;
    expertise: string;
    location_name: string;
    rate_amount: number;
    rate_currency: string;
    rate_period: string;
  } | null;
}

/** Talent profiles this employer has already paid to unlock. */
export async function fetchMyUnlocks(employerId: string): Promise<UnlockRow[]> {
  const { data, error } = await supabase
    .from("talent_unlocks")
    .select(
      "id, created_at, talent_profile_id, talent:talent_profiles(id,expertise,location_name,rate_amount,rate_currency,rate_period)",
    )
    .eq("employer_id", employerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as UnlockRow[] | null) ?? [];
}

export async function incrementTalentView(talentProfileId: string) {
  await supabase.rpc("increment_talent_view", { _talent_profile_id: talentProfileId });
}
