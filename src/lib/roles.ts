import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { SUPER_ADMIN_EMAIL } from "@/lib/app-sections";

export type AppRole = "public" | "teacher" | "admin";

/** Highest role wins: admin > teacher > public. */
export async function fetchRole(userId: string, email?: string | null): Promise<AppRole> {
  if ((email ?? "").toLowerCase() === SUPER_ADMIN_EMAIL) return "admin";
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) return "public";
  const roles = ((data ?? []) as { role: string }[]).map((row) => row.role);
  if (roles.includes("admin")) return "admin";
  if (roles.includes("teacher")) return "teacher";
  return "public";
}

export function useRole() {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<AppRole>("public");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!user) {
      setRole("public");
      setLoading(authLoading);
      return;
    }
    setLoading(true);
    void fetchRole(user.id, user.email).then((next) => {
      if (!active) return;
      setRole(next);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [user, authLoading]);

  return { role, loading, isAdmin: role === "admin", isTeacher: role === "teacher" };
}

export interface TeacherApplication {
  id: string;
  user_id: string;
  name: string;
  age: number;
  current_school: string;
  ghana_card_front_url: string;
  ghana_card_back_url: string;
  personal_contact: string;
  hod_contact: string;
  facial_verification_url: string;
  match_score: number;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

export async function fetchMyTeacherApplication(userId: string) {
  const { data } = await supabase
    .from("teacher_applications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as TeacherApplication | null) ?? null;
}

export async function fetchTeacherApplications() {
  const { data, error } = await supabase
    .from("teacher_applications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as TeacherApplication[];
}

export async function countPendingTeacherApplications() {
  const { count } = await supabase
    .from("teacher_applications")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}

export async function reviewTeacherApplication(
  application: TeacherApplication,
  approve: boolean,
  reviewerId: string,
) {
  const { error } = await supabase
    .from("teacher_applications")
    .update({ status: approve ? "approved" : "rejected", reviewed_by: reviewerId })
    .eq("id", application.id);
  if (error) throw error;
  if (approve) {
    const { error: roleError } = await supabase
      .from("user_roles")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({ user_id: application.user_id, role: "teacher" as any });
    if (roleError && !roleError.message.includes("duplicate")) throw roleError;
  }
}

/** Short-lived link so admins can view a private Ghana card / selfie image. */
export async function signedUrl(bucket: string, path: string) {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}
