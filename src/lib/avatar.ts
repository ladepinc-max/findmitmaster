import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { avatarImageKey } from "./interface-image-cache";
import { useCachedImage } from "./use-cached-image";

/** Resolves a private storage path in the `avatars` bucket to a temporary URL. */
export function useAvatarUrl(path: string | null | undefined) {
  const resolve = useCallback(async () => {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    // Cache the uploaded square original; transformed signed URLs can succeed at signing
    // but fail when the image-resizing service is unavailable.
    const { data: plain } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60);
    return plain?.signedUrl ?? null;
  }, [path]);
  return useCachedImage(path ? avatarImageKey(path) : "avatar:none", path ?? null, resolve,
    path && /^https?:\/\//i.test(path) ? path : null);
}

export function forgetAvatarUrl(path: string | null | undefined) {
  // Each uploaded photo has a new path; the shared cache replaces its owner's slot on display.
}

export function initialsFrom(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
