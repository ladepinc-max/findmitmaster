import { supabase } from "@/integrations/supabase/client";

export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 180;

export interface TalentVideo {
  /** Storage path of the video in the `talent-videos` bucket. */
  p: string;
  /** Storage path of the generated poster frame. */
  t: string | null;
  /** Duration in seconds. */
  d: number;
}

export function parseVideos(rows: string[] | null | undefined): TalentVideo[] {
  return (rows ?? [])
    .map((row) => {
      try {
        const value = JSON.parse(row) as TalentVideo;
        return value?.p ? value : null;
      } catch {
        return row ? { p: row, t: null, d: 0 } : null;
      }
    })
    .filter((value): value is TalentVideo => value !== null);
}

export function serialiseVideos(videos: TalentVideo[]) {
  return videos.map((video) => JSON.stringify(video));
}

const cache = new Map<string, { url: string; expires: number }>();
const TTL = 60 * 60 * 4;

export async function signedTalentUrl(path: string | null | undefined) {
  if (!path) return null;
  const hit = cache.get(path);
  if (hit && hit.expires > Date.now()) return hit.url;
  const { data } = await supabase.storage.from("talent-videos").createSignedUrl(path, TTL);
  if (!data?.signedUrl) return null;
  cache.set(path, { url: data.signedUrl, expires: Date.now() + (TTL - 300) * 1000 });
  return data.signedUrl;
}

/** Reads duration and grabs a 720p-wide poster frame from a local video file. */
export function readVideoMeta(file: File): Promise<{ duration: number; poster: Blob | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    const finish = (duration: number, poster: Blob | null) => {
      URL.revokeObjectURL(url);
      resolve({ duration, poster });
    };
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      video.currentTime = Math.min(1, Math.max(0, duration / 2));
      video.onseeked = () => {
        try {
          const width = Math.min(1280, video.videoWidth || 720);
          const scale = width / (video.videoWidth || width);
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = Math.round((video.videoHeight || 720) * scale);
          const context = canvas.getContext("2d");
          if (!context) return finish(duration, null);
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => finish(duration, blob), "image/jpeg", 0.7);
        } catch {
          finish(duration, null);
        }
      };
    };
    video.onerror = () => finish(0, null);
    video.src = url;
  });
}

/** Uploads one proof video plus its poster frame and returns the stored entry. */
export async function uploadTalentVideo(userId: string, file: File): Promise<TalentVideo> {
  if (file.size > MAX_VIDEO_BYTES) throw new Error("Each video must be 50MB or less");
  const { duration, poster } = await readVideoMeta(file);
  if (duration > MAX_VIDEO_SECONDS + 1) throw new Error("Each video must be 3 minutes or less");

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const extension = file.name.split(".").pop()?.toLowerCase() || "mp4";
  const path = `${userId}/${stamp}.${extension}`;
  const { error } = await supabase.storage.from("talent-videos").upload(path, file, {
    contentType: file.type || "video/mp4",
    upsert: false,
  });
  if (error) throw error;

  let posterPath: string | null = null;
  if (poster) {
    posterPath = `${userId}/${stamp}-poster.jpg`;
    const { error: posterError } = await supabase.storage
      .from("talent-videos")
      .upload(posterPath, poster, { contentType: "image/jpeg", upsert: true });
    if (posterError) posterPath = null;
  }

  return { p: path, t: posterPath, d: Math.round(duration) };
}

/** Stores a liveness selfie in the private verification bucket. */
export async function uploadFaceCapture(userId: string, blob: Blob) {
  const path = `${userId}/face-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from("talent-verification").upload(path, blob, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  return path;
}

export function formatClock(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
