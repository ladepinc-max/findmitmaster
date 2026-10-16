import { supabase } from "@/integrations/supabase/client";
import { forgetAvatarUrl } from "@/lib/avatar";

/** Uploads a profile photo into the user's own folder and returns its storage path. */
export async function uploadAvatar(userId: string, file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${userId}/avatar-${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, {
    upsert: true,
    contentType: file.type || "image/jpeg",
  });
  if (error) throw error;
  forgetAvatarUrl(path);
  return path;
}

export function normalizeWebsite(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
