import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, { url: string; expires: number }>();
const TTL_SECONDS = 60 * 60 * 4;

/**
 * Resolves a private `posts` bucket path to a temporary URL.
 * Pass `width` to get a server-compressed image (omit it for video playback).
 */
export async function signedPostUrl(path: string, width?: number) {
  const key = width ? `${path}@${width}` : path;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.url;
  const { data } = await supabase.storage
    .from("posts")
    .createSignedUrl(
      path,
      TTL_SECONDS,
      width ? { transform: { width, quality: 60, resize: "cover" } } : undefined,
    );
  if (!data?.signedUrl) return null;
  cache.set(key, { url: data.signedUrl, expires: Date.now() + (TTL_SECONDS - 300) * 1000 });
  return data.signedUrl;
}

export function useMediaUrl(path: string | null | undefined, width?: number) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!path) {
      setUrl(null);
      return;
    }
    void signedPostUrl(path, width).then((next) => {
      if (active) setUrl(next);
    });
    return () => {
      active = false;
    };
  }, [path, width]);

  return url;
}

/** Uploads a post asset into the signed-in user's folder and returns its storage path. */
export async function uploadPostMedia(userId: string, file: File | Blob, extension: string) {
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  const { error } = await supabase.storage.from("posts").upload(path, file, {
    contentType: (file as File).type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function uploadCv(userId: string, file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "pdf";
  const path = `${userId}/cv-${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from("cvs").upload(path, file, {
    contentType: file.type || "application/pdf",
    upsert: true,
  });
  if (error) throw error;
  return path;
}

export function extensionOf(file: File, fallback: string) {
  return file.name.split(".").pop()?.toLowerCase() || fallback;
}

export function formatCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return String(value);
}

export function formatDuration(seconds: number | null | undefined) {
  if (!seconds || Number.isNaN(seconds)) return null;
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** Reads intrinsic duration of a local video file (browser only). */
export function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(video.duration) ? video.duration : null);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    video.src = url;
  });
}
