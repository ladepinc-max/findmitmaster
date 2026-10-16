import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, string>();

/** Resolves a private storage path in the `avatars` bucket to a temporary URL. */
export function useAvatarUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(path ? (cache.get(path) ?? null) : null);

  useEffect(() => {
    let active = true;
    if (!path) {
      setUrl(null);
      return;
    }
    // Already a full URL (e.g. Google profile photo) — use it directly.
    if (/^https?:\/\//i.test(path)) {
      setUrl(path);
      return;
    }
    const cached = cache.get(path);
    if (cached) {
      setUrl(cached);
      return;
    }
    supabase.storage
      .from("avatars")
      .createSignedUrl(path, 60 * 60, { transform: { width: 320, quality: 85, resize: "cover" } })
      .then(({ data, error }) => {
        if (!active) return;
        if (data?.signedUrl) {
          cache.set(path, data.signedUrl);
          setUrl(data.signedUrl);
          return;
        }
        if (!error) return;
        // Fall back to the untransformed original if image resizing is unavailable.
        supabase.storage
          .from("avatars")
          .createSignedUrl(path, 60 * 60)
          .then(({ data: plain }) => {
            if (!active || !plain?.signedUrl) return;
            cache.set(path, plain.signedUrl);
            setUrl(plain.signedUrl);
          });
      });
    return () => {
      active = false;
    };
  }, [path]);

  return url;
}

export function forgetAvatarUrl(path: string | null | undefined) {
  if (path) cache.delete(path);
}

export function initialsFrom(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
