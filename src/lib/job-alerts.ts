import { supabase } from "@/integrations/supabase/client";

export interface JobAlert {
  id: string;
  user_id: string;
  label: string;
  keywords: string;
  skills: string[];
  category: string | null;
  job_type: string | null;
  min_salary: number | null;
  is_active: boolean;
  created_at: string;
}

export interface JobNotification {
  id: string;
  user_id: string;
  alert_id: string | null;
  job_id: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

export type NewJobAlert = {
  label: string;
  keywords: string;
  skills: string[];
  category: string | null;
  job_type: string | null;
  min_salary: number | null;
};

export async function fetchAlerts(userId: string) {
  const { data, error } = await supabase
    .from("job_alerts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as JobAlert[] | null) ?? [];
}

export async function createAlert(userId: string, input: NewJobAlert) {
  const { error } = await supabase.from("job_alerts").insert({ ...input, user_id: userId });
  if (error) throw error;
}

export async function setAlertActive(id: string, isActive: boolean) {
  const { error } = await supabase.from("job_alerts").update({ is_active: isActive }).eq("id", id);
  if (error) throw error;
}

export async function deleteAlert(id: string) {
  const { error } = await supabase.from("job_alerts").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchNotifications(userId: string) {
  const { data, error } = await supabase
    .from("job_notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data as JobNotification[] | null) ?? [];
}

export async function markAllRead(userId: string) {
  const { error } = await supabase
    .from("job_notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) throw error;
}

export async function markRead(id: string) {
  const { error } = await supabase.from("job_notifications").update({ is_read: true }).eq("id", id);
  if (error) throw error;
}

/** Live push of new job matches for this user. Returns an unsubscribe function. */
export function subscribeToJobNotifications(userId: string, onInsert: (row: JobNotification) => void) {
  const channel = supabase
    .channel(`job-notifications-${userId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "job_notifications", filter: `user_id=eq.${userId}` },
      (payload) => onInsert(payload.new as JobNotification),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function requestPushPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported" as const;
  if (Notification.permission === "granted") return "granted" as const;
  if (Notification.permission === "denied") return "denied" as const;
  const result = await Notification.requestPermission();
  return result === "granted" ? ("granted" as const) : ("denied" as const);
}

export function showPushNotification(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "/favicon.ico", tag: title });
  } catch {
    /* notification display is best-effort */
  }
}
