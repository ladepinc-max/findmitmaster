import { supabase } from "@/integrations/supabase/client";
import type { Job } from "@/lib/jobs";

export type VerificationStatus = "none" | "pending" | "verified";

/** Minimum monthly salary (GHS) a company must pay to be listed in FindMit Ghana. */
export const FINDMIT_MIN_MONTHLY_SALARY = 2500;
/** Minimum monthly salary (GHS) for ordinary job posts in Find Jobs. */
export const NORMAL_MIN_MONTHLY_SALARY = 900;

export interface VerifiedGraduate {
  id: string;
  username: string;
  display_name: string;
  photo_path: string | null;
  is_verified: boolean;
  completed_projects: number;
  skill_score: number;
  expertise: string | null;
  location_name: string | null;
  skills: string[];
}

export async function fetchVerifiedGraduates(): Promise<VerifiedGraduate[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id,username,display_name,photo_path,is_verified,completed_projects,skill_score,talent_profiles!inner(expertise,location_name,skills)",
    )
    .eq("verification_status", "verified")
    .order("skill_score", { ascending: false })
    .limit(50);
  if (error) throw error;
  return ((data as unknown[] | null) ?? []).map((row) => {
    const item = row as VerifiedGraduate & {
      talent_profiles: { expertise: string; location_name: string; skills: string[] }[] | null;
    };
    const talent = item.talent_profiles?.[0] ?? null;
    return {
      id: item.id,
      username: item.username,
      display_name: item.display_name,
      photo_path: item.photo_path,
      is_verified: item.is_verified,
      completed_projects: item.completed_projects ?? 0,
      skill_score: item.skill_score ?? 0,
      expertise: talent?.expertise ?? null,
      location_name: talent?.location_name ?? null,
      skills: talent?.skills ?? [],
    };
  });
}

export async function fetchVerifiedJobs(): Promise<Job[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select("*, employer:profiles!jobs_employer_id_fkey(id,username,display_name,photo_path,is_verified)")
    .eq("company_verification_status", "verified")
    .eq("meets_requirements", true)
    .eq("is_open", true)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return ((data as Job[] | null) ?? []);
}

export async function fetchMyVerification(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("verification_status")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return ((data?.verification_status as VerificationStatus | undefined) ?? "none");
}

export async function fetchMyCompanyApplication(userId: string) {
  const { data, error } = await supabase
    .from("company_verification_applications")
    .select("id,status,company_name,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchMyTalentApplication(userId: string) {
  const { data, error } = await supabase
    .from("talent_verification_applications")
    .select("id,status,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Uploads a supporting document into the private CV bucket and returns its path. */
export async function uploadVerificationDoc(userId: string, file: File, label: string) {
  const extension = file.name.split(".").pop() ?? "pdf";
  const path = `${userId}/${label}-${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from("cvs").upload(path, file, { upsert: true });
  if (error) throw error;
  return path;
}

/** Uploads a work video into the private talent-videos bucket and returns its path. */
export async function uploadVerificationVideo(userId: string, file: File, label: string) {
  const extension = file.name.split(".").pop() ?? "mp4";
  const path = `${userId}/${label}-${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from("talent-videos").upload(path, file, { upsert: true });
  if (error) throw error;
  return path;
}

export async function submitTalentVerification(input: {
  userId: string;
  cvPath: string | null;
  projects: string;
  reason: string;
  feeReference: string | null;
  fullName?: string;
  phone?: string;
  locationName?: string;
  ghanaCard?: string;
  skillTrade?: string;
  learningPathway?: string;
  masterTrainer?: string | null;
  yearsExperience?: string;
  evidenceOption?: "video" | "document";
  video1Path?: string | null;
  video2Path?: string | null;
  certificatePath?: string | null;
  photoPaths?: string[];
  shortBio?: string;
  findmitUserId?: string;
}) {
  const { error } = await supabase.from("talent_verification_applications").insert({
    user_id: input.userId,
    cv_path: input.cvPath,
    projects: input.projects,
    reason: input.reason,
    fee_reference: input.feeReference,
    full_name: input.fullName ?? null,
    phone: input.phone ?? null,
    location_name: input.locationName ?? null,
    ghana_card: input.ghanaCard ?? null,
    skill_trade: input.skillTrade ?? null,
    learning_pathway: input.learningPathway ?? null,
    master_trainer: input.masterTrainer ?? null,
    years_experience: input.yearsExperience ?? null,
    evidence_option: input.evidenceOption ?? "video",
    video1_path: input.video1Path ?? null,
    video2_path: input.video2Path ?? null,
    certificate_path: input.certificatePath ?? null,
    photo_paths: input.photoPaths ?? [],
    short_bio: input.shortBio ?? null,
    findmit_user_id: input.findmitUserId ?? null,
  });
  if (error) throw error;
}

export async function submitCompanyVerification(input: {
  userId: string;
  companyName: string;
  tin: string;
  industry: string;
  regionCity: string;
  companySize: string;
  website: string;
  officialEmail: string;
  ghanaCardNumber: string;
  phone: string;
  hrContactName: string;
  hrContactPosition: string;
  staffCount: number;
  ssnitProofPath: string | null;
  workersCompensationPath: string | null;
  registrationGhanaCardPath: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
}) {
  const { error } = await supabase.from("company_verification_applications").insert({
    user_id: input.userId,
    company_name: input.companyName,
    tin: input.tin,
    industry: input.industry,
    region_city: input.regionCity,
    company_size: input.companySize,
    website: input.website || null,
    official_email: input.officialEmail,
    ghana_card_number: input.ghanaCardNumber,
    phone: input.phone,
    hr_contact_name: input.hrContactName,
    hr_contact_position: input.hrContactPosition,
    staff_count: input.staffCount,
    ssnit_proof_path: input.ssnitProofPath,
    insurance_policy_path: input.workersCompensationPath,
    workers_compensation_path: input.workersCompensationPath,
    registration_ghana_card_path: input.registrationGhanaCardPath,
    documents_paths: input.registrationGhanaCardPath ? [input.registrationGhanaCardPath] : [],
    salary_min: input.salaryMin,
    salary_max: input.salaryMax,
    information_confirmed: true,
    verification_fee: 3000,
    fee_currency: "GHS",
  });
  if (error) throw error;
}

/* ---------------- admin ---------------- */

export async function isAdmin(userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

export async function fetchTalentApplications() {
  // No direct link to profiles exists, so load names separately.
  const { data, error } = await supabase
    .from("talent_verification_applications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  const ids = [...new Set((data ?? []).map((r) => r.user_id))];
  if (ids.length) {
    const { data: profs } = await supabase.from("profiles").select("id,display_name,username").in("id", ids);
    const byId = new Map((profs ?? []).map((p) => [p.id, p]));
    for (const row of data ?? []) (row as Record<string, unknown>)["applicant"] = byId.get(row.user_id) ?? null;
  }
  return (data ?? []) as (Record<string, unknown> & {
    id: string;
    user_id: string;
    status: string;
    projects: string;
    reason: string;
    created_at: string;
  })[];
}

export async function fetchCompanyApplications() {
  const { data, error } = await supabase
    .from("company_verification_applications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as (Record<string, unknown> & {
    id: string;
    user_id: string;
    company_name: string;
    tin: string;
    status: string;
    created_at: string;
  })[];
}

export async function reviewTalentApplication(id: string, userId: string, approve: boolean) {
  const { error } = await supabase
    .from("talent_verification_applications")
    .update({ status: approve ? "approved" : "rejected" })
    .eq("id", id);
  if (error) throw error;
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ verification_status: approve ? "verified" : "none" })
    .eq("id", userId);
  if (profileError) throw profileError;
}

export async function reviewCompanyApplication(id: string, userId: string, approve: boolean) {
  const { error } = await supabase
    .from("company_verification_applications")
    .update({ status: approve ? "approved" : "rejected" })
    .eq("id", id);
  if (error) throw error;
  const { error: jobsError } = await supabase
    .from("jobs")
    .update({
      company_verification_status: approve ? "verified" : "none",
      meets_requirements: approve,
    })
    .eq("employer_id", userId);
  if (jobsError) throw jobsError;
}

export type ReviewStatus = "approved" | "rejected" | "pending";

/** Sets a FindMit Ghana application to approved, rejected or back to pending. */
export async function setApplicationStatus(
  kind: "talent" | "company",
  id: string,
  userId: string,
  status: ReviewStatus,
) {
  const approved = status === "approved";
  if (kind === "talent") {
    const { error } = await supabase.from("talent_verification_applications").update({ status }).eq("id", id);
    if (error) throw error;
    const { error: e2 } = await supabase
      .from("profiles")
      .update({ verification_status: approved ? "verified" : status === "pending" ? "pending" : "none" })
      .eq("id", userId);
    if (e2) throw e2;
  } else {
    const { error } = await supabase.from("company_verification_applications").update({ status }).eq("id", id);
    if (error) throw error;
    const { error: e2 } = await supabase
      .from("jobs")
      .update({ company_verification_status: approved ? "verified" : "none", meets_requirements: approved })
      .eq("employer_id", userId);
    if (e2) throw e2;
  }
}

/** Whether this user has an approved FindMit employer application. */
export async function fetchCompanyApproved(userId: string) {
  const { data } = await supabase
    .from("company_verification_applications")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "approved")
    .limit(1);
  return (data ?? []).length > 0;
}
