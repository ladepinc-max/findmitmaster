import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getCachedUrl, setCachedUrl } from "@/lib/signed-url-cache";

const db = supabase as unknown as SupabaseClient;
export const NEWS_BUCKET = "community-news";
/** In-app recordings only: 360p, never longer than 10 minutes. */
export const MAX_RECORD_SECONDS = 600;
export const RECORD_WIDTH = 640;
export const RECORD_HEIGHT = 360;

export type NewsStatus = "pending" | "approved" | "rejected";
export interface CommunityNews {
  id: string;
  author_id: string;
  title: string;
  description: string;
  community_name: string;
  community_id: string | null;
  media_path: string;
  media_type: "video" | "photo";
  duration_seconds: number | null;
  status: NewsStatus;
  ad_title: string | null;
  ad_tagline: string | null;
  ad_cta: string | null;
  ad_link: string | null;
  ad_rating: number | null;
  views_count: number;
  created_at: string;
  author?: { id: string; username: string | null; display_name: string | null; photo_path: string | null } | null;
}

async function withAuthors(rows: CommunityNews[]): Promise<CommunityNews[]> {
  const ids = Array.from(new Set(rows.map((r) => r.author_id)));
  if (!ids.length) return rows;
  const { data } = await db.from("profiles").select("id, username, display_name, photo_path").in("id", ids);
  const map = new Map(((data ?? []) as NonNullable<CommunityNews["author"]>[]).map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, author: map.get(r.author_id) ?? null }));
}

/** Trim, collapse spaces, Title Case — "  kaneshie   market " → "Kaneshie Market". */
export function formatCommunityName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

/** Same key the database uses to guarantee one page per community. */
export function communityKey(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const GEM_PALETTES = [
  ["#22c55e", "#facc15", "#ef4444", "#16a34a"],
  ["#0ea5e9", "#f97316", "#a3e635", "#0369a1"],
  ["#e11d48", "#fbbf24", "#14b8a6", "#9f1239"],
  ["#8b5cf6", "#22d3ee", "#f59e0b", "#5b21b6"],
  ["#f43f5e", "#84cc16", "#3b82f6", "#be123c"],
  ["#10b981", "#f472b6", "#eab308", "#047857"],
];

/** Deterministic gem logo for a community: same name → same colours and rotation. */
export function communityLogo(name: string) {
  const h = hash(communityKey(name));
  const palette = GEM_PALETTES[h % GEM_PALETTES.length] ?? GEM_PALETTES[0]!;
  const rotation = ((h >>> 8) % 4) * 90;
  const initials = formatCommunityName(name)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
  return { palette, rotation, initials };
}

function ext(blob: Blob) {
  if (blob.type.includes("mp4")) return "mp4";
  if (blob.type.includes("webm")) return "webm";
  if (blob.type.includes("png")) return "png";
  return "jpg";
}

export async function submitCommunityNews(input: {
  userId: string;
  blob: Blob;
  mediaType: "video" | "photo";
  durationSeconds: number | null;
  title: string;
  description: string;
  communityName: string;
}) {
  const path = `${input.userId}/${crypto.randomUUID()}.${ext(input.blob)}`;
  const { error: upErr } = await supabase.storage
    .from(NEWS_BUCKET)
    .upload(path, input.blob, { contentType: input.blob.type || "application/octet-stream", upsert: false });
  if (upErr) throw upErr;
  const { error } = await db.from("community_news").insert({
    author_id: input.userId,
    title: input.title.trim(),
    description: input.description.trim(),
    community_name: formatCommunityName(input.communityName),
    media_path: path,
    media_type: input.mediaType,
    duration_seconds: input.durationSeconds,
  });
  if (error) throw error;
}

export async function fetchApprovedNews(limit = 50, communityId?: string) {
  let q = db.from("community_news").select("*").eq("status", "approved").order("created_at", { ascending: false }).limit(limit);
  if (communityId) q = q.eq("community_id", communityId);
  const { data } = await q;
  return withAuthors((data ?? []) as CommunityNews[]);
}

export async function fetchNews(id: string) {
  const { data } = await db.from("community_news").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const [row] = await withAuthors([data as CommunityNews]);
  return row ?? null;
}

export async function fetchPendingNews() {
  const { data } = await db.from("community_news").select("*").eq("status", "pending").order("created_at", { ascending: true });
  return withAuthors((data ?? []) as CommunityNews[]);
}

export async function reviewNews(
  id: string,
  approve: boolean,
  ad?: { title?: string; tagline?: string; cta?: string; link?: string; rating?: number | null },
) {
  const { error } = await db.rpc("review_community_news", {
    _id: id,
    _approve: approve,
    _ad_title: ad?.title ?? null,
    _ad_tagline: ad?.tagline ?? null,
    _ad_cta: ad?.cta ?? null,
    _ad_link: ad?.link ?? null,
    _ad_rating: ad?.rating ?? null,
  });
  if (error) throw error;
}

export async function newsMediaUrl(path: string): Promise<string | null> {
  const cached = getCachedUrl(NEWS_BUCKET, path);
  if (cached) return cached;
  const { data } = await supabase.storage.from(NEWS_BUCKET).createSignedUrl(path, 60 * 60);
  if (!data?.signedUrl) return null;
  setCachedUrl(NEWS_BUCKET, path, data.signedUrl, 50 * 60 * 1000);
  return data.signedUrl;
}

export interface NewsComment {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  profile?: { display_name: string | null; username: string | null; photo_path: string | null } | null;
}

export async function fetchComments(newsId: string) {
  const { data } = await db
    .from("community_news_comments")
    .select("id, user_id, body, created_at, profile:profiles!community_news_comments_user_id_fkey(display_name, username, photo_path)")
    .eq("news_id", newsId)
    .order("created_at", { ascending: true })
    .limit(300);
  return (data ?? []) as unknown as NewsComment[];
}

export async function addComment(newsId: string, userId: string, body: string) {
  const { error } = await db.from("community_news_comments").insert({ news_id: newsId, user_id: userId, body: body.trim() });
  if (error) throw error;
}

export async function joinCommunityDiscussion(communityId: string): Promise<string> {
  const { data, error } = await db.rpc("join_community_discussion", { _community_id: communityId });
  if (error) throw error;
  return data as string;
}

export async function communityMemberCount(communityId: string): Promise<number> {
  const { data } = await db.rpc("community_member_count", { _community_id: communityId });
  return (data as number | null) ?? 0;
}

export async function fetchCommunity(id: string) {
  const { data } = await db.from("communities").select("id, name, description, discussion_chat_id").eq("id", id).maybeSingle();
  return data as { id: string; name: string; description: string; discussion_chat_id: string | null } | null;
}

export interface NewsNotice {
  id: string;
  title: string;
  body: string;
  news_id: string | null;
  created_at: string;
}
export async function fetchUnreadNotices(userId: string) {
  const { data } = await db.from("news_notifications").select("id, title, body, news_id, created_at").eq("user_id", userId).eq("is_read", false).order("created_at", { ascending: false });
  return (data ?? []) as NewsNotice[];
}
export async function markNoticeRead(id: string) {
  await db.from("news_notifications").update({ is_read: true }).eq("id", id);
}

export function clock(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}
