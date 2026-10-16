import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ClassPerson {
  id: string;
  username: string;
  display_name: string;
  photo_path: string | null;
  is_verified: boolean;
}

export interface LiveClassroom {
  id: string;
  host_id: string;
  topic: string;
  description: string;
  current_topic: string | null;
  duration_minutes: number;
  scheduled_end_at: string | null;
  recording_path: string | null;
  teacher_share: number;
  is_live: boolean;
  viewers_count: number;
  room_name: string;
  /** Cheap HLS stream students watch (set when the teacher goes live). */
  hls_url: string | null;
  /** Cloudflare Stream live input reused across restarts of this class. */
  stream_input_uid: string | null;
  practical_price: number;
  practical_currency: string;
  started_at: string;
  ended_at: string | null;
  host: ClassPerson | null;
}

export interface ClassMessage {
  id: string;
  class_id: string;
  user_id: string;
  channel: "all" | "qa";
  body: string;
  image_path: string | null;
  upvotes: number;
  answered: boolean;
  created_at: string;
  author: ClassPerson | null;
}

export interface StageRequest {
  id: string;
  class_id: string;
  user_id: string;
  status: "pending" | "waiting" | "approved" | "rejected" | "ended";
  created_at: string;
  updated_at: string;
  student: ClassPerson | null;
}

export interface Enrollment {
  id: string;
  class_id: string;
  user_id: string;
  amount: number;
  created_at: string;
  student: ClassPerson | null;
}

export interface ClassReplay {
  id: string;
  class_id: string;
  host_id: string;
  title: string;
  video_path: string;
  duration_seconds: number | null;
  preview_seconds: number;
  price: number;
  created_at: string;
}

const PERSON = "id,username,display_name,photo_path,is_verified";
const CLASS_SELECT = `*, host:profiles!live_classes_host_id_fkey(${PERSON})`;

export const FREE_CHAT_COOLDOWN_MS = 5 * 60 * 1000;

export async function fetchClassroom(id: string) {
  const { data, error } = await supabase
    .from("live_classes")
    .select(CLASS_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as LiveClassroom | null) ?? null;
}

export async function updateClassTopic(id: string, currentTopic: string) {
  const { error } = await supabase
    .from("live_classes")
    .update({ current_topic: currentTopic })
    .eq("id", id);
  if (error) throw error;
}

export async function fetchEnrollments(classId: string) {
  const { data, error } = await supabase
    .from("class_enrollments")
    .select(`*, student:profiles!class_enrollments_user_id_fkey(${PERSON})`)
    .eq("class_id", classId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as unknown as Enrollment[] | null) ?? [];
}

export async function enrollInClass(params: {
  classId: string;
  userId: string;
  amount: number;
  reference: string;
}) {
  const { error } = await supabase.from("class_enrollments").insert({
    class_id: params.classId,
    user_id: params.userId,
    amount: params.amount,
    reference: params.reference,
  });
  if (error && error.code !== "23505") throw error;
}

export async function fetchMessages(classId: string, channel: "all" | "qa") {
  const { data, error } = await supabase
    .from("class_messages")
    .select(`*, author:profiles!class_messages_user_id_fkey(${PERSON})`)
    .eq("class_id", classId)
    .eq("channel", channel)
    .order(channel === "qa" ? "upvotes" : "created_at", { ascending: channel !== "qa" })
    .limit(200);
  if (error) throw error;
  return (data as unknown as ClassMessage[] | null) ?? [];
}

export async function sendClassMessage(params: {
  classId: string;
  userId: string;
  channel: "all" | "qa";
  body: string;
  imagePath?: string | null;
}) {
  const { error } = await supabase.from("class_messages").insert({
    class_id: params.classId,
    user_id: params.userId,
    channel: params.channel,
    body: params.body,
    image_path: params.imagePath ?? null,
  });
  if (error) throw error;
}

export async function markAnswered(messageId: string, answered: boolean) {
  const { error } = await supabase
    .from("class_messages")
    .update({ answered })
    .eq("id", messageId);
  if (error) throw error;
}

export async function toggleUpvote(messageId: string, userId: string, current: number) {
  const { error } = await supabase
    .from("class_message_votes")
    .insert({ message_id: messageId, user_id: userId });
  if (error) {
    if (error.code !== "23505") throw error;
    await supabase
      .from("class_message_votes")
      .delete()
      .eq("message_id", messageId)
      .eq("user_id", userId);
    await supabase
      .from("class_messages")
      .update({ upvotes: Math.max(0, current - 1) })
      .eq("id", messageId);
    return false;
  }
  await supabase
    .from("class_messages")
    .update({ upvotes: current + 1 })
    .eq("id", messageId);
  return true;
}

export async function fetchMyVotes(classId: string, userId: string) {
  const { data } = await supabase
    .from("class_messages")
    .select("id, class_message_votes!inner(user_id)")
    .eq("class_id", classId)
    .eq("class_message_votes.user_id", userId);
  return new Set(((data as { id: string }[] | null) ?? []).map((row) => row.id));
}

export async function fetchStageRequests(classId: string) {
  const { data, error } = await supabase
    .from("class_stage_requests")
    .select(`*, student:profiles!class_stage_requests_user_id_fkey(${PERSON})`)
    .eq("class_id", classId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as unknown as StageRequest[] | null) ?? [];
}

export async function requestStage(classId: string, userId: string) {
  const { error } = await supabase
    .from("class_stage_requests")
    .upsert(
      { class_id: classId, user_id: userId, status: "pending", updated_at: new Date().toISOString() },
      { onConflict: "class_id,user_id" },
    );
  if (error) throw error;
}

export async function setStageStatus(id: string, status: StageRequest["status"]) {
  const { error } = await supabase
    .from("class_stage_requests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function uploadClassMedia(userId: string, file: File, kind: "photo" | "replay") {
  const ext = file.name.split(".").pop() ?? (kind === "photo" ? "jpg" : "webm");
  const path = `${userId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("class-media").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

const urlCache = new Map<string, string>();

export async function signedClassUrl(path: string) {
  const hit = urlCache.get(path);
  if (hit) return hit;
  const { data } = await supabase.storage.from("class-media").createSignedUrl(path, 60 * 60 * 4);
  if (!data?.signedUrl) return null;
  urlCache.set(path, data.signedUrl);
  return data.signedUrl;
}

export function useClassMediaUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!path) {
      setUrl(null);
      return;
    }
    void signedClassUrl(path).then((value) => {
      if (active) setUrl(value);
    });
    return () => {
      active = false;
    };
  }, [path]);
  return url;
}

export async function saveReplay(params: {
  classId: string;
  hostId: string;
  title: string;
  videoPath: string;
  durationSeconds: number | null;
  price: number;
}) {
  const { error } = await supabase.from("class_replays").insert({
    class_id: params.classId,
    host_id: params.hostId,
    title: params.title,
    video_path: params.videoPath,
    duration_seconds: params.durationSeconds,
    price: params.price,
  });
  if (error) throw error;
}

export async function fetchReplays(slug?: string) {
  const query = supabase
    .from("class_replays")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data as unknown as ClassReplay[] | null) ?? [];
  if (!slug) return rows;
  const words = slug.split("-").filter(Boolean);
  return rows.filter((row) =>
    words.every((word) => row.title.toLowerCase().includes(word.toLowerCase())),
  );
}

export async function endClass(classId: string) {
  const { error } = await supabase
    .from("live_classes")
    .update({ is_live: false, ended_at: new Date().toISOString(), hls_url: null })
    .eq("id", classId);
  if (error) throw error;
}

/** Saves the HLS playback address students should watch. */
export async function setClassHlsUrl(classId: string, hlsUrl: string | null) {
  const { error } = await supabase
    .from("live_classes")
    .update({ hls_url: hlsUrl })
    .eq("id", classId);
  if (error) throw error;
}

/** Saves the Cloudflare live input + playback address for this class. */
export async function setClassStream(
  classId: string,
  streamInputUid: string | null,
  hlsUrl: string | null,
) {
  const { error } = await supabase
    .from("live_classes")
    .update({ stream_input_uid: streamInputUid, hls_url: hlsUrl })
    .eq("id", classId);
  if (error) throw error;
}

/** Splits the class fee between the teacher and findmeet. */
export function payoutSplit(amount: number, teacherShare = 0.8) {
  const teacher = Math.round(amount * teacherShare * 100) / 100;
  return { teacher, platform: Math.round((amount - teacher) * 100) / 100 };
}

export function formatCountdown(ms: number) {
  const clamped = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
