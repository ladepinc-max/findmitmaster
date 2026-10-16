import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getCachedUrl, setCachedUrl } from "@/lib/signed-url-cache";

/** New chat tables are not in the generated types yet, so use an untyped view of the client. */
const db = supabase as unknown as SupabaseClient;

export const CHAT_BUCKET = "chat-media";

export type MessageType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "file"
  | "location"
  | "contact"
  | "call";

export interface ProfileLite {
  id: string;
  username: string;
  display_name: string;
  photo_path: string | null;
  last_seen: string | null;
  is_verified?: boolean;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string | null;
  message_type: MessageType;
  content: string | null;
  media_url: string | null;
  media_duration: number | null;
  media_name: string | null;
  is_read: boolean;
  created_at: string;
  delivered_at?: string | null;
  deleted_for_everyone?: boolean;
  reply_to?: string | null;
  pending?: boolean;
}

export interface ConversationSummary {
  id: string;
  other: ProfileLite;
  last_message_text: string | null;
  last_message_at: string;
  unread: number;
}

const PROFILE_FIELDS = "id, username, display_name, photo_path, last_seen, is_verified";

/** Live search over people you can chat with. */
export async function searchProfiles(term: string, meId: string): Promise<ProfileLite[]> {
  const q = term.trim();
  if (q.length < 1) return [];
  const { data, error } = await db
    .from("profiles")
    .select(PROFILE_FIELDS)
    .neq("id", meId)
    .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
    .order("display_name")
    .limit(8);
  if (error) throw error;
  return (data ?? []) as ProfileLite[];
}

/** Returns the existing 1:1 conversation with a user, or creates it. */
export async function findOrCreateConversation(meId: string, otherId: string): Promise<string> {
  const { data: existing } = await db
    .from("conversations")
    .select("id")
    .or(
      `and(participant1_id.eq.${meId},participant2_id.eq.${otherId}),and(participant1_id.eq.${otherId},participant2_id.eq.${meId})`,
    )
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data, error } = await db
    .from("conversations")
    .insert({ participant1_id: meId, participant2_id: otherId })
    .select("id")
    .single();
  if (error) {
    // Unique index race: fetch the row the other side created.
    const { data: retry } = await db
      .from("conversations")
      .select("id")
      .or(
        `and(participant1_id.eq.${meId},participant2_id.eq.${otherId}),and(participant1_id.eq.${otherId},participant2_id.eq.${meId})`,
      )
      .maybeSingle();
    if (retry?.id) return retry.id as string;
    throw error;
  }
  return data.id as string;
}

export async function fetchConversations(meId: string): Promise<ConversationSummary[]> {
  const { data, error } = await db
    .from("conversations")
    .select(
      `id, last_message_text, last_message_at, participant1_id, participant2_id,
       p1:profiles!conversations_participant1_id_fkey(${PROFILE_FIELDS}),
       p2:profiles!conversations_participant2_id_fkey(${PROFILE_FIELDS})`,
    )
    .or(`participant1_id.eq.${meId},participant2_id.eq.${meId}`)
    .order("last_message_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const ids = rows.map((r) => r['id'] as string);
  const unread = new Map<string, number>();
  if (ids.length) {
    const { data: unreadRows } = await db
      .from("messages")
      .select("conversation_id")
      .in("conversation_id", ids)
      .eq("receiver_id", meId)
      .eq("is_read", false);
    for (const row of (unreadRows ?? []) as Array<{ conversation_id: string }>) {
      unread.set(row.conversation_id, (unread.get(row.conversation_id) ?? 0) + 1);
    }
  }

  return rows
    .map((row) => {
      const p1 = row['p1'] as ProfileLite | null;
      const p2 = row['p2'] as ProfileLite | null;
      const other = (row['participant1_id'] === meId ? p2 : p1) as ProfileLite | null;
      if (!other) return null;
      return {
        id: row['id'] as string,
        other,
        last_message_text: (row['last_message_text'] as string | null) ?? null,
        last_message_at: row['last_message_at'] as string,
        unread: unread.get(row['id'] as string) ?? 0,
      } satisfies ConversationSummary;
    })
    .filter(Boolean) as ConversationSummary[];
}

export async function fetchConversation(id: string, meId: string) {
  const { data, error } = await db
    .from("conversations")
    .select(
      `id, participant1_id, participant2_id,
       p1:profiles!conversations_participant1_id_fkey(${PROFILE_FIELDS}),
       p2:profiles!conversations_participant2_id_fkey(${PROFILE_FIELDS})`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const other = (data.participant1_id === meId ? data.p2 : data.p1) as unknown as ProfileLite;
  return { id: data.id as string, other };
}

export async function fetchMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await db
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as ChatMessage[];
}

/** Fetches the next older page without changing the existing group-chat fetch. */
export async function fetchMessagesBefore(
  conversationId: string,
  before: string,
  limit = 50,
): Promise<ChatMessage[]> {
  const { data, error } = await db
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .lt("created_at", before)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as ChatMessage[]).reverse();
}

export interface SendMessageInput {
  conversationId: string;
  senderId: string;
  receiverId: string;
  type?: MessageType;
  content?: string;
  mediaPath?: string | null;
  mediaDuration?: number | null;
  mediaName?: string | null;
  replyTo?: string | null;
}

export async function sendMessage(input: SendMessageInput): Promise<ChatMessage> {
  const type = input.type ?? "text";
  const { data, error } = await db
    .from("messages")
    .insert({
      conversation_id: input.conversationId,
      sender_id: input.senderId,
      receiver_id: input.receiverId,
      message_type: type,
      content: input.content ?? "",
      body: input.content ?? "",
      media_url: input.mediaPath ?? null,
      media_duration: input.mediaDuration ?? null,
      media_name: input.mediaName ?? null,
      reply_to: input.replyTo ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;

  await db
    .from("conversations")
    .update({
      last_message_text: previewFor(type, input.content ?? ""),
      last_message_at: new Date().toISOString(),
    })
    .eq("id", input.conversationId);

  // Notify the recipient (drives the green dot on the Chat tab).
  await db.from("chat_notifications").insert({
    receiver_id: input.receiverId,
    sender_id: input.senderId,
    conversation_id: input.conversationId,
    message_type: type,
  });

  return data as ChatMessage;

}

export function previewFor(type: MessageType, content: string) {
  switch (type) {
    case "image":
      return "📷 Photo";
    case "video":
      return "🎬 Video";
    case "audio":
      return "🎤 Voice message";
    case "file":
      return "📎 Document";
    case "location":
      return "📍 Location";
    case "contact":
      return "👤 Contact";
    case "call":
      return content || "📞 Call";
    default:
      return content;
  }
}

export async function markConversationRead(conversationId: string, meId: string) {
  await db
    .from("messages")
    .update({ is_read: true })
    .eq("conversation_id", conversationId)
    .eq("receiver_id", meId)
    .eq("is_read", false);
}

export async function uploadChatMedia(userId: string, file: File | Blob, extension: string) {
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  const { error } = await db.storage.from(CHAT_BUCKET).upload(path, file, {
    contentType: (file as File).type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

const urlCache = new Map<string, { url: string; expires: number }>();

export async function signedChatUrl(path: string) {
  const hit = urlCache.get(path);
  if (hit && hit.expires > Date.now()) return hit.url;
  const stored = getCachedUrl(CHAT_BUCKET, path);
  if (stored) {
    urlCache.set(path, { url: stored, expires: Date.now() + 60 * 60 * 1000 });
    return stored;
  }
  const { data } = await db.storage.from(CHAT_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7);
  if (!data?.signedUrl) return null;
  urlCache.set(path, { url: data.signedUrl, expires: Date.now() + 6 * 86400000 });
  setCachedUrl(CHAT_BUCKET, path, data.signedUrl, 6 * 86400000);
  return data.signedUrl;
}

export function useChatMediaUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(() => (path ? urlCache.get(path)?.url ?? null : null));
  useEffect(() => {
    let active = true;
    if (!path) {
      setUrl(null);
      return;
    }
    void signedChatUrl(path).then((next) => {
      if (active) setUrl(next);
    });
    return () => {
      active = false;
    };
  }, [path]);
  return url;
}

/** Heartbeat used for the online / last seen indicator. */
export async function touchLastSeen(userId: string) {
  await db.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", userId);
}

export function isOnline(lastSeen: string | null | undefined) {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 70_000;
}

export function formatTime12h(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
}

export function formatListTime(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return formatTime12h(iso);
  const yesterday = new Date(now.getTime() - 86400000);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function formatDayLabel(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return "TODAY";
  const yesterday = new Date(now.getTime() - 86400000);
  if (date.toDateString() === yesterday.toDateString()) return "YESTERDAY";
  return date.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" }).toUpperCase();
}

export function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function lastSeenLabel(lastSeen: string | null | undefined) {
  if (!lastSeen) return "offline";
  if (isOnline(lastSeen)) return "online";
  return `last seen ${formatListTime(lastSeen).toLowerCase()}`;
}

/* ---------------------------------- calls --------------------------------- */

export type CallStatus = "ringing" | "accepted" | "declined" | "ended";
export type CallKind = "video" | "audio";

export interface CallEvent {
  id: string;
  conversation_id: string;
  caller_id: string;
  receiver_id: string;
  kind: CallKind;
  status: CallStatus;
  created_at: string;
}

export async function createCallEvent(input: {
  conversationId: string;
  callerId: string;
  receiverId: string;
  kind: CallKind;
}): Promise<CallEvent> {
  const { data, error } = await db
    .from("call_events")
    .insert({
      conversation_id: input.conversationId,
      caller_id: input.callerId,
      receiver_id: input.receiverId,
      kind: input.kind,
      status: "ringing",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as CallEvent;
}

export async function updateCallStatus(id: string, status: CallStatus) {
  await db.from("call_events").update({ status }).eq("id", id);
}

export { db as chatDb };
