import { supabase } from "@/integrations/supabase/client";

export type FolderItemType = "video" | "image" | "live_replay";

export interface ProfileFolder {
  id: string;
  user_id: string;
  name: string;
  color: string;
  icon: string;
  created_at: string;
  updated_at: string;
}

export interface FolderItem {
  id: string;
  folder_id: string;
  user_id: string;
  item_type: FolderItemType;
  item_id: string;
  title: string | null;
  added_at: string;
}

export interface ReplayView {
  id: string;
  live_session_id: string;
  student_id: string;
  watched_at: string;
  duration_watched: number;
  session: {
    id: string;
    topic: string;
    subject: string | null;
    replay_url: string | null;
    duration_seconds: number | null;
    created_at: string;
    host: { display_name: string; username: string; photo_path: string | null } | null;
  } | null;
}

export const FOLDER_COLORS = [
  { label: "FindMit green", value: "#25D366" },
  { label: "Yellow", value: "#F2C14E" },
  { label: "Red", value: "#E4572E" },
];

export async function fetchFolders(userId: string) {
  const { data, error } = await supabase
    .from("profile_folders")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as ProfileFolder[] | null) ?? [];
}

export async function fetchFolderItems(userId: string) {
  const { data, error } = await supabase
    .from("folder_items")
    .select("*")
    .eq("user_id", userId)
    .order("added_at", { ascending: false });
  if (error) throw error;
  return (data as FolderItem[] | null) ?? [];
}

export async function createFolder(userId: string, name: string, color: string) {
  const { data, error } = await supabase
    .from("profile_folders")
    .insert({ user_id: userId, name, color })
    .select("*")
    .single();
  if (error) throw error;
  return data as ProfileFolder;
}

export async function updateFolder(id: string, patch: { name?: string; color?: string }) {
  const { error } = await supabase.from("profile_folders").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteFolder(id: string) {
  const { error } = await supabase.from("profile_folders").delete().eq("id", id);
  if (error) throw error;
}

export async function addItemToFolder(params: {
  folderId: string;
  userId: string;
  itemType: FolderItemType;
  itemId: string;
  title?: string | null;
}) {
  const { error } = await supabase.from("folder_items").insert({
    folder_id: params.folderId,
    user_id: params.userId,
    item_type: params.itemType,
    item_id: params.itemId,
    title: params.title ?? null,
  });
  if (error && error.code !== "23505") throw error;
  await supabase
    .from("profile_folders")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", params.folderId);
}

export async function removeItemFromFolder(itemRowId: string) {
  const { error } = await supabase.from("folder_items").delete().eq("id", itemRowId);
  if (error) throw error;
}

/** Records that a student watched a live class (used for the Live Replays tab). */
export async function recordClassroomView(params: {
  liveSessionId: string;
  studentId: string;
  durationWatched: number;
}) {
  const { error } = await supabase.from("live_classroom_views").upsert(
    {
      live_session_id: params.liveSessionId,
      student_id: params.studentId,
      duration_watched: params.durationWatched,
      watched_at: new Date().toISOString(),
    },
    { onConflict: "live_session_id,student_id" },
  );
  if (error) throw error;
}

export async function fetchMyReplays(userId: string) {
  const { data, error } = await supabase
    .from("live_classroom_views")
    .select(
      "*, session:live_sessions(id,topic,subject,replay_url,duration_seconds,created_at,host:profiles!live_sessions_host_id_fkey(display_name,username,photo_path))",
    )
    .eq("student_id", userId)
    .order("watched_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as ReplayView[] | null) ?? [];
}

const VIEWED_KEY = "findmit.viewedPosts";

export function rememberViewedPost(postId: string) {
  try {
    const list = viewedPostIds().filter((id) => id !== postId);
    list.unshift(postId);
    localStorage.setItem(VIEWED_KEY, JSON.stringify(list.slice(0, 60)));
  } catch {
    /* ignore */
  }
}

export function viewedPostIds(): string[] {
  try {
    const raw = localStorage.getItem(VIEWED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function watchedPercent(view: ReplayView) {
  const total = view.session?.duration_seconds ?? 0;
  if (!total) return null;
  return Math.min(100, Math.round((Number(view.duration_watched) / Number(total)) * 100));
}

export function formatDuration(seconds: number | null | undefined) {
  if (!seconds) return null;
  const s = Math.round(Number(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
