import { supabase } from "@/integrations/supabase/client";
import { rememberViewedPost } from "@/lib/folders";

export interface PostAuthor {
  id: string;
  username: string;
  display_name: string;
  photo_path: string | null;
  is_verified: boolean;
}

export interface Post {
  id: string;
  user_id: string;
  media_path: string;
  media_type: "video" | "image";
  thumbnail_path: string | null;
  duration_seconds: number | null;
  caption: string;
  hashtags: string[];
  mentions: string[];
  music_title: string | null;
  music_author: string | null;
  privacy: "everyone" | "friends" | "only_me";
  allow_comments: boolean;
  allow_duet: boolean;
  allow_stitch: boolean;
  allow_save: boolean;
  status: "draft" | "published";
  views_count: number;
  likes_count: number;
  comments_count: number;
  saves_count: number;
  shares_count: number;
  created_at: string;
  author: PostAuthor | null;
  tv_category?: TvCategory | null;
  tv_type?: "live" | "on_demand" | null;
}

export type TvCategory = "shs" | "jhs" | "primary" | "vocational" | "kids";

const POST_SELECT =
  "*, author:profiles!posts_user_id_fkey(id,username,display_name,photo_path,is_verified)";

function mapPosts(rows: unknown): Post[] {
  return (rows as Post[] | null) ?? [];
}

export async function fetchFeed(limit = 20) {
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("status", "published")
    .neq("privacy", "only_me")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return mapPosts(data);
}

export async function fetchTvPosts(category: TvCategory, limit = 100) {
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("status", "published")
    .eq("tv_category", category)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return mapPosts(data);
}

export async function fetchFollowingFeed(userId: string, limit = 20) {
  const { data: follows, error: followError } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", userId);
  if (followError) throw followError;
  const ids = (follows ?? []).map((row) => row.following_id);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("status", "published")
    .neq("privacy", "only_me")
    .in("user_id", ids)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return mapPosts(data);
}

export async function fetchTrendingPosts(limit = 30) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("status", "published")
    .neq("privacy", "only_me")
    .gte("created_at", since)
    .order("views_count", { ascending: false })
    .order("likes_count", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return mapPosts(data);
}

export async function fetchPostsByHashtag(tag: string, limit = 30) {
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("status", "published")
    .neq("privacy", "only_me")
    .contains("hashtags", [tag.toLowerCase()])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return mapPosts(data);
}

export async function fetchUserPosts(userId: string, includeDrafts = false) {
  let query = supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (!includeDrafts) query = query.eq("status", "published");
  const { data, error } = await query;
  if (error) throw error;
  return mapPosts(data);
}

export async function fetchPostsByIds(ids: string[]) {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("posts").select(POST_SELECT).in("id", ids);
  if (error) throw error;
  const rows = mapPosts(data);
  return ids.map((id) => rows.find((row) => row.id === id)).filter(Boolean) as Post[];
}


export async function fetchLikedPosts(userId: string) {
  const { data: likes, error: likeError } = await supabase
    .from("post_likes")
    .select("post_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (likeError) throw likeError;
  const ids = (likes ?? []).map((row) => row.post_id);
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("posts").select(POST_SELECT).in("id", ids);
  if (error) throw error;
  return mapPosts(data);
}

export async function fetchSavedPosts(userId: string) {
  const { data: saves, error: saveError } = await supabase
    .from("post_saves")
    .select("post_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (saveError) throw saveError;
  const ids = (saves ?? []).map((row) => row.post_id);
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("posts").select(POST_SELECT).in("id", ids);
  if (error) throw error;
  return mapPosts(data);
}

export async function fetchTaggedPosts(username: string, limit = 60) {
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("status", "published")
    .neq("privacy", "only_me")
    .contains("mentions", [username.toLowerCase()])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return mapPosts(data);
}

export async function fetchMyLikes(postIds: string[], userId: string) {
  if (postIds.length === 0) return new Set<string>();
  const { data } = await supabase
    .from("post_likes")
    .select("post_id")
    .eq("user_id", userId)
    .in("post_id", postIds);
  return new Set((data ?? []).map((row) => row.post_id));
}

export async function fetchMySaves(postIds: string[], userId: string) {
  if (postIds.length === 0) return new Set<string>();
  const { data } = await supabase
    .from("post_saves")
    .select("post_id")
    .eq("user_id", userId)
    .in("post_id", postIds);
  return new Set((data ?? []).map((row) => row.post_id));
}

export async function fetchMyFollowing(userId: string) {
  const { data } = await supabase.from("follows").select("following_id").eq("follower_id", userId);
  return new Set((data ?? []).map((row) => row.following_id));
}

export async function toggleLike(postId: string, userId: string, liked: boolean) {
  if (liked) {
    const { error } = await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", userId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("post_likes").insert({ post_id: postId, user_id: userId });
    if (error && error.code !== "23505") throw error;
  }
}

export async function toggleSave(postId: string, userId: string, saved: boolean) {
  if (saved) {
    const { error } = await supabase.from("post_saves").delete().eq("post_id", postId).eq("user_id", userId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("post_saves").insert({ post_id: postId, user_id: userId });
    if (error && error.code !== "23505") throw error;
  }
}

export async function toggleFollow(targetId: string, userId: string, following: boolean) {
  if (following) {
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", userId)
      .eq("following_id", targetId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("follows").insert({ follower_id: userId, following_id: targetId });
    if (error && error.code !== "23505") throw error;
  }
}

export async function registerView(postId: string) {
  rememberViewedPost(postId);
  await supabase.rpc("increment_post_view", { _post_id: postId });
}

export async function bumpShares(postId: string, current: number) {
  await supabase.from("posts").update({ shares_count: current + 1 }).eq("id", postId);
}

export interface PostComment {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  author: PostAuthor | null;
}

export async function fetchComments(postId: string) {
  const { data, error } = await supabase
    .from("post_comments")
    .select("*, author:profiles!post_comments_user_id_fkey(id,username,display_name,photo_path,is_verified)")
    .eq("post_id", postId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data as PostComment[] | null) ?? []);
}

export async function addComment(postId: string, userId: string, body: string) {
  const { error } = await supabase.from("post_comments").insert({ post_id: postId, user_id: userId, body });
  if (error) throw error;
}

export async function searchProfiles(term: string, excludeId?: string) {
  const value = term.trim();
  if (!value) return [] as PostAuthor[];
  let query = supabase
    .from("profiles")
    .select("id,username,display_name,photo_path,is_verified")
    .or(`username.ilike.%${value}%,display_name.ilike.%${value}%`)
    .limit(8);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query;
  return ((data as PostAuthor[] | null) ?? []);
}

export function parseHashtags(text: string) {
  return Array.from(new Set((text.match(/#[\p{L}0-9_]+/gu) ?? []).map((t) => t.slice(1).toLowerCase())));
}

export function parseMentions(text: string) {
  return Array.from(new Set((text.match(/@[a-z0-9._]+/gi) ?? []).map((t) => t.slice(1).toLowerCase())));
}

/** Trending hashtags and sounds derived from the last 7 days of real posts. */
export async function fetchTrends() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("posts")
    .select("hashtags,music_title,music_author,views_count,likes_count")
    .eq("status", "published")
    .neq("privacy", "only_me")
    .gte("created_at", since)
    .limit(500);

  const tagScores = new Map<string, number>();
  const sounds = new Map<string, { title: string; author: string | null; uses: number }>();
  for (const row of data ?? []) {
    const weight = 1 + (row.views_count ?? 0) / 100 + (row.likes_count ?? 0) / 10;
    for (const tag of row.hashtags ?? []) tagScores.set(tag, (tagScores.get(tag) ?? 0) + weight);
    if (row.music_title) {
      const key = `${row.music_title}::${row.music_author ?? ""}`;
      const existing = sounds.get(key);
      if (existing) existing.uses += 1;
      else sounds.set(key, { title: row.music_title, author: row.music_author, uses: 1 });
    }
  }

  return {
    hashtags: [...tagScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([tag, score]) => ({ tag, score: Math.round(score) })),
    sounds: [...sounds.values()].sort((a, b) => b.uses - a.uses).slice(0, 10),
  };
}
