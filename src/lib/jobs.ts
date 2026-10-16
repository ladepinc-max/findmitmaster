import { supabase } from "@/integrations/supabase/client";
import { findOrCreateConversation, sendMessage } from "@/lib/chat";
import type { PostAuthor } from "@/lib/social";

export interface Job {
  id: string;
  employer_id: string;
  title: string;
  company: string;
  salary_amount: number;
  salary_currency: string;
  salary_period: string;
  job_type: string;
  category: string;
  vacancies: number;
  gender_requirement: string;
  age_min: number | null;
  age_max: number | null;
  location_name: string;
  location_lat: number | null;
  location_lng: number | null;
  description: string;
  skills: string[];
  is_open: boolean;
  is_featured: boolean;
  applicants_count: number;
  expires_at: string | null;
  is_paid: boolean;
  plan: string | null;
  shop_photo_path?: string | null;
  created_at: string;
  employer: PostAuthor | null;

}

export interface TalentProfile {
  id: string;
  user_id: string;
  expertise: string;
  years_experience: number;
  description: string;
  rate_amount: number;
  rate_currency: string;
  rate_period: string;
  location_name: string;
  availability: string;
  cv_path: string | null;
  created_at: string;
  gender: string;
  age: number | null;
  region: string | null;
  town: string | null;
  landmark: string | null;
  negotiable: boolean;
  skills: string[];
  video_paths: string[];
  face_path: string | null;
  face_verified: boolean;
  review_status: string;
  views_count: number;
  is_paid: boolean;
  talent: PostAuthor | null;
}

const JOB_SELECT =
  "*, employer:profiles!jobs_employer_id_fkey(id,username,display_name,photo_path,is_verified)";
const TALENT_SELECT =
  "*, talent:profiles!talent_profiles_user_id_fkey!inner(id,username,display_name,photo_path,is_verified,verification_status)";

export async function fetchJobs(term = "") {
  // Unpaid listings never appear; verified-company jobs live only in FindMit Ghana.
  let query = supabase
    .from("jobs")
    .select(JOB_SELECT)
    .eq("is_paid", true)
    .neq("company_verification_status", "verified")
    .order("created_at", { ascending: false })
    .limit(50);
  const value = term.trim();
  if (value) {
    query = query.or(
      `title.ilike.%${value}%,company.ilike.%${value}%,location_name.ilike.%${value}%,category.ilike.%${value}%`,
    );
  }
  const { data, error } = await query;
  if (error) throw error;
  return ((data as Job[] | null) ?? []);
}

export async function fetchTalent(term = "", expertise?: string | null) {
  // Unpaid listings never appear; approved FindMit graduates live only in FindMit Ghana.
  let query = supabase
    .from("talent_profiles")
    .select(TALENT_SELECT)
    .eq("is_paid", true)
    .neq("talent.verification_status", "verified")
    .order("created_at", { ascending: false })
    .limit(50);
  if (expertise) query = query.eq("expertise", expertise);
  const value = term.trim();
  if (value) {
    query = query.or(
      `expertise.ilike.%${value}%,location_name.ilike.%${value}%,town.ilike.%${value}%,description.ilike.%${value}%`,
    );
  }
  const { data, error } = await query;
  if (error) throw error;
  return ((data as TalentProfile[] | null) ?? []);
}

export type NewJob = Omit<
  Job,
  | "id"
  | "created_at"
  | "employer"
  | "is_open"
  | "salary_currency"
  | "is_featured"
  | "applicants_count"
  | "expires_at"
  | "is_paid"
  | "plan"
> & {
  salary_currency?: string;
  is_featured?: boolean;
  expires_at?: string | null;
  is_paid?: boolean;
  plan?: string | null;
};


export async function createJob(input: NewJob) {
  const { data, error } = await supabase.from("jobs").insert(input).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export type NewTalent = Omit<
  TalentProfile,
  | "id"
  | "created_at"
  | "talent"
  | "rate_currency"
  | "face_verified"
  | "review_status"
  | "views_count"
  | "is_paid"
> & {
  rate_currency?: string;
  face_verified?: boolean;
  review_status?: string;
  is_paid?: boolean;
};


export async function createTalentProfile(input: NewTalent) {
  const { data, error } = await supabase.from("talent_profiles").insert(input).select("id").single();
  if (error) throw error;
  return data.id as string;
}


/** Employee applies to a job: opens the conversation, sends the intro message, records it. */
export async function applyToJob(job: Job, employeeId: string) {
  const conversationId = await findOrCreateConversation(employeeId, job.employer_id);
  await sendMessage({
    conversationId,
    senderId: employeeId,
    receiverId: job.employer_id,
    content:
      "Hello Sir/madam,\n\nI've applied for your job vacancy on FindMit. Looking forward to work with you.\n\nTHANK YOU.",
  });
  const { error } = await supabase.from("job_applications").insert({
    job_id: job.id,
    employee_id: employeeId,
    employer_id: job.employer_id,
    conversation_id: conversationId,
    kind: "application",
  });
  if (error) throw error;
  return conversationId;
}

/** Employer hires a talent: opens the conversation, sends the intro message, records the request. */
export async function employTalent(talent: TalentProfile, employerId: string) {
  const conversationId = await findOrCreateConversation(employerId, talent.user_id);
  await sendMessage({
    conversationId,
    senderId: employerId,
    receiverId: talent.user_id,
    content: `Hi, I want to employ you for ${talent.expertise}`,
  });
  const { error } = await supabase.from("job_applications").insert({
    talent_id: talent.id,
    employee_id: talent.user_id,
    employer_id: employerId,
    conversation_id: conversationId,
    kind: "offer",
  });
  if (error) throw error;
  return conversationId;
}

const PERIOD_SUFFIX: Record<string, string> = {
  per_day: "day",
  day: "day",
  per_week: "week",
  week: "week",
  per_month: "month",
  month: "month",
  per_project: "project",
  project: "project",
};

export function formatMoney(amount: number, currency: string, period: string) {
  const value = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount);
  return `${currency} ${value}/${PERIOD_SUFFIX[period] ?? period}`;
}

/** Days left before a paid job listing stops showing, or null when it never expires. */
export function daysUntilExpiry(expiresAt: string | null | undefined) {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}
