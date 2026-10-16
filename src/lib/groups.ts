import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { ChatMessage, MessageType, ProfileLite } from "@/lib/chat";
import { previewFor } from "@/lib/chat";

/** Group/community tables are not in the generated types yet. */
const db = supabase as unknown as SupabaseClient;

export const GROUP_MEMBER_LIMIT = 1024;
export const COMMUNITY_GROUP_LIMIT = 100;

export interface GroupSummary {
  id: string;
  name: string;
  avatar_path: string | null;
  description: string | null;
  is_community: boolean;
  community_id: string | null;
  created_by: string | null;
  last_message: string | null;
  last_message_at: string | null;
  members: number;
  role: "admin" | "member";
}

export interface CommunitySummary {
  id: string;
  name: string;
  description: string;
  avatar_path: string | null;
  created_by: string;
  announcement_chat_id: string | null;
  groups: number;
  joined: boolean;
}

export interface GroupMember extends ProfileLite {
  role: "admin" | "member";
}

/** Every group chat the user belongs to, newest activity first. */
export async function fetchGroups(meId: string): Promise<GroupSummary[]> {
  const { data: memberships, error } = await db
    .from("chat_members")
    .select("chat_id, role")
    .eq("user_id", meId);
  if (error) throw error;

  const rows = (memberships ?? []) as Array<{ chat_id: string; role: string }>;
  if (!rows.length) return [];
  const ids = rows.map((r) => r.chat_id);

  const { data: chats } = await db
    .from("chats")
    .select(
      "id, name, avatar_path, description, is_group, is_community, community_id, created_by, last_message, last_message_at, created_at",
    )
    .in("id", ids)
    .eq("is_group", true);

  const { data: counts } = await db.from("chat_members").select("chat_id").in("chat_id", ids);
  const memberCount = new Map<string, number>();
  for (const row of (counts ?? []) as Array<{ chat_id: string }>) {
    memberCount.set(row.chat_id, (memberCount.get(row.chat_id) ?? 0) + 1);
  }
  const roleOf = new Map(rows.map((r) => [r.chat_id, r.role]));

  return ((chats ?? []) as Array<Record<string, unknown>>)
    .map((c) => ({
      id: c['id'] as string,
      name: (c['name'] as string) || "Group",
      avatar_path: (c['avatar_path'] as string | null) ?? null,
      description: (c['description'] as string | null) ?? null,
      is_community: Boolean(c['is_community']),
      community_id: (c['community_id'] as string | null) ?? null,
      created_by: (c['created_by'] as string | null) ?? null,
      last_message: (c['last_message'] as string | null) ?? null,
      last_message_at:
        (c['last_message_at'] as string | null) ?? (c['created_at'] as string | null) ?? null,
      members: memberCount.get(c['id'] as string) ?? 1,
      role: (roleOf.get(c['id'] as string) === "admin" ? "admin" : "member") as "admin" | "member",
    }))
    .sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""));
}

export async function createGroup(input: {
  meId: string;
  name: string;
  description?: string;
  memberIds: string[];
  communityId?: string | null;
  isAnnouncement?: boolean;
}): Promise<string> {
  const members = Array.from(new Set(input.memberIds.filter((id) => id !== input.meId)));
  if (members.length + 1 > GROUP_MEMBER_LIMIT) {
    throw new Error(`Groups can hold up to ${GROUP_MEMBER_LIMIT} members`);
  }

  const { data, error } = await db
    .from("chats")
    .insert({
      created_by: input.meId,
      name: input.name.trim(),
      description: input.description?.trim() ?? "",
      is_group: true,
      is_community: input.isAnnouncement ?? false,
      community_id: input.communityId ?? null,
      last_message: "Group created",
      last_message_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  const chatId = data['id'] as string;

  const rows = [
    { chat_id: chatId, user_id: input.meId, role: "admin" },
    ...members.map((id) => ({ chat_id: chatId, user_id: id, role: "member" })),
  ];
  const { error: memberError } = await db.from("chat_members").insert(rows);
  if (memberError) throw memberError;
  return chatId;
}

export async function createCommunity(input: {
  meId: string;
  name: string;
  description?: string;
  memberIds: string[];
}): Promise<{ communityId: string; announcementChatId: string }> {
  const { data, error } = await db
    .from("communities")
    .insert({
      name: input.name.trim(),
      description: input.description?.trim() ?? "",
      created_by: input.meId,
    })
    .select("id")
    .single();
  if (error) throw error;
  const communityId = data['id'] as string;

  const announcementChatId = await createGroup({
    meId: input.meId,
    name: `${input.name.trim()} · Announcements`,
    description: "Only admins can post here.",
    memberIds: input.memberIds,
    communityId,
    isAnnouncement: true,
  });

  await db
    .from("communities")
    .update({ announcement_chat_id: announcementChatId })
    .eq("id", communityId);

  return { communityId, announcementChatId };
}

export async function fetchCommunities(meId: string): Promise<CommunitySummary[]> {
  const { data, error } = await db
    .from("communities")
    .select("id, name, description, avatar_path, created_by, announcement_chat_id")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  if (!rows.length) return [];

  const ids = rows.map((r) => r['id'] as string);
  const { data: groups } = await db
    .from("chats")
    .select("id, community_id")
    .in("community_id", ids);
  const groupCount = new Map<string, number>();
  const groupIds: string[] = [];
  for (const g of (groups ?? []) as Array<{ id: string; community_id: string }>) {
    groupCount.set(g.community_id, (groupCount.get(g.community_id) ?? 0) + 1);
    groupIds.push(g.id);
  }

  const joinedCommunities = new Set<string>();
  if (groupIds.length) {
    const { data: mine } = await db
      .from("chat_members")
      .select("chat_id")
      .eq("user_id", meId)
      .in("chat_id", groupIds);
    const mineIds = new Set(((mine ?? []) as Array<{ chat_id: string }>).map((m) => m.chat_id));
    for (const g of (groups ?? []) as Array<{ id: string; community_id: string }>) {
      if (mineIds.has(g.id)) joinedCommunities.add(g.community_id);
    }
  }

  return rows.map((r) => ({
    id: r['id'] as string,
    name: r['name'] as string,
    description: (r['description'] as string) ?? "",
    avatar_path: (r['avatar_path'] as string | null) ?? null,
    created_by: r['created_by'] as string,
    announcement_chat_id: (r['announcement_chat_id'] as string | null) ?? null,
    groups: groupCount.get(r['id'] as string) ?? 0,
    joined: joinedCommunities.has(r['id'] as string),
  }));
}

export async function joinChat(chatId: string, userId: string) {
  const { error } = await db
    .from("chat_members")
    .insert({ chat_id: chatId, user_id: userId, role: "member" });
  if (error && !error.message.includes("duplicate")) throw error;
}

export async function leaveChat(chatId: string, userId: string) {
  await db.from("chat_members").delete().eq("chat_id", chatId).eq("user_id", userId);
}

export async function fetchGroupMembers(chatId: string): Promise<GroupMember[]> {
  const { data, error } = await db
    .from("chat_members")
    .select(
      "role, user_id, profiles:profiles!chat_members_user_id_fkey(id, username, display_name, photo_path, last_seen, is_verified)",
    )
    .eq("chat_id", chatId);
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((row) => {
      const p = row['profiles'] as ProfileLite | null;
      if (!p) return null;
      return { ...p, role: (row['role'] === "admin" ? "admin" : "member") as "admin" | "member" };
    })
    .filter(Boolean) as GroupMember[];
}

export async function fetchGroupMessages(chatId: string): Promise<ChatMessage[]> {
  const { data, error } = await db
    .from("messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as ChatMessage[];
}

export async function sendGroupMessage(input: {
  chatId: string;
  senderId: string;
  type?: MessageType;
  content?: string;
  mediaPath?: string | null;
  mediaDuration?: number | null;
  mediaName?: string | null;
  replyTo?: string | null;
}): Promise<ChatMessage> {
  const type = input.type ?? "text";
  const { data, error } = await db
    .from("messages")
    .insert({
      chat_id: input.chatId,
      sender_id: input.senderId,
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
    .from("chats")
    .update({
      last_message: previewFor(type, input.content ?? ""),
      last_message_at: new Date().toISOString(),
    })
    .eq("id", input.chatId);

  return data as ChatMessage;
}
