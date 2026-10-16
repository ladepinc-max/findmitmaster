import { supabase } from "@/integrations/supabase/client";
import type { TvCategory } from "@/lib/social";

export const TV_ORDER: TvCategory[] = ["shs", "jhs", "primary", "vocational", "kids"];

export const TV_LABELS: Record<TvCategory, string> = {
  shs: "SHS TV",
  jhs: "JHS TV",
  primary: "PRIMARY TV",
  vocational: "VOCATIONAL TV",
  kids: "KIDS TV",
};

export interface TvChannel {
  id: string;
  category: TvCategory;
  host_id: string | null;
  subject: string;
  started_at: string | null;
  scheduled_start: string | null;
  total_seconds: number;
  viewers_seed: number;
  is_live: boolean;
}

export interface TvClip {
  id: string;
  media_path: string;
  thumbnail_path: string | null;
  caption: string;
  duration_seconds: number;
  user_id: string;
  /** Cloudflare Stream HLS manifest (360p-capped playback) when the lesson was streamed. */
  hls_url?: string | null;
  stream_uid?: string | null;
}

export interface TvChannelState {
  category: TvCategory;
  channel: TvChannel | null;
  clips: TvClip[];
}

/** Seconds elapsed since the broadcast started (clamped at 0). */
export function getLivePosition(channel: TvChannel): number {
  if (!channel.started_at) return 0;
  return Math.max(0, (Date.now() - new Date(channel.started_at).getTime()) / 1000);
}

/** Seconds left before a scheduled channel opens (0 once it has started). */
export function secondsUntilStart(channel: TvChannel): number {
  const start = channel.scheduled_start ?? channel.started_at;
  if (!start) return 0;
  return Math.max(0, (new Date(start).getTime() - Date.now()) / 1000);
}

/** A channel is on air once it is published and its start time has passed. */
export function isOnAir(channel: TvChannel | null | undefined): boolean {
  if (!channel?.is_live) return false;
  return secondsUntilStart(channel) <= 0;
}

export function formatCountdown(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${mins}m`;
  const secs = total % 60;
  return mins ? `${mins}m ${secs}s` : `${secs}s`;
}

/** Which clip is on air right now, and how far into it we are (playlist loops). */
export function resolveLiveSlot(clips: TvClip[], elapsed: number) {
  if (!clips.length) return null;
  const total = clips.reduce((sum, clip) => sum + Math.max(1, clip.duration_seconds || 1), 0);
  let cursor = 0;
  // Loop back to the first clip once the playlist has played through.
  const position = total > 0 ? elapsed % total : 0;
  for (let index = 0; index < clips.length; index += 1) {
    const clip = clips[index]!;
    const length = Math.max(1, clip.duration_seconds || 1);
    if (position < cursor + length) {
      return { index, clip, offset: position - cursor };
    }
    cursor += length;
  }
  return null;
}

export function formatClock(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/** Live viewer count that drifts a little so it feels real, same shape for everyone. */
export function fakeViewers(channel: TvChannel) {
  const drift = Math.floor(Math.sin(Date.now() / 30000 + channel.viewers_seed) * 180);
  return Math.max(0, channel.viewers_seed + drift);
}

export async function fetchTvChannels(): Promise<TvChannelState[]> {
  const [{ data: channels }, { data: posts }] = await Promise.all([
    supabase.from("tv_channels").select("*"),
    supabase
      .from("posts")
      .select(
        "id, media_path, thumbnail_path, caption, duration_seconds, user_id, tv_category, tv_order, hls_url, stream_uid",
      )
      .eq("status", "published")
      .not("tv_category", "is", null)
      .order("tv_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
  ]);

  return TV_ORDER.map((category) => ({
    category,
    channel: ((channels ?? []) as unknown as TvChannel[]).find((row) => row.category === category) ?? null,
    clips: ((posts ?? []) as unknown as (TvClip & { tv_category: TvCategory })[])
      .filter((row) => row.tv_category === category)
      .map((row) => ({
        id: row.id,
        media_path: row.media_path,
        thumbnail_path: row.thumbnail_path,
        caption: row.caption,
        duration_seconds: Number(row.duration_seconds) || 60,
        user_id: row.user_id,
        hls_url: row.hls_url ?? null,
        stream_uid: row.stream_uid ?? null,
      })),
  }));
}

/** Start (or restart) a channel broadcast — now, or at a scheduled time. */
export async function startBroadcast(input: {
  category: TvCategory;
  hostId: string;
  subject: string;
  totalSeconds: number;
  /** ISO time the playlist should open. Omit to start immediately. */
  startAt?: string | null;
}) {
  const startIso = input.startAt ?? new Date().toISOString();
  const { error } = await supabase.from("tv_channels").upsert(
    {
      category: input.category,
      host_id: input.hostId,
      subject: input.subject,
      started_at: startIso,
      scheduled_start: input.startAt ?? null,
      total_seconds: input.totalSeconds,
      is_live: true,
    },
    { onConflict: "category" },
  );
  if (error) throw error;
}

export async function endBroadcast(category: TvCategory) {
  await supabase.from("tv_channels").update({ is_live: false }).eq("category", category);
}

/** Broadcast finished: take the channel offline and clear the host's own clips. */
export async function retireChannel(category: TvCategory, viewerId: string | null, clips: TvClip[]) {
  await endBroadcast(category);
  const mine = clips.filter((clip) => clip.user_id === viewerId).map((clip) => clip.id);
  if (mine.length) await supabase.from("posts").delete().in("id", mine);
}
