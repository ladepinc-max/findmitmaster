import { useEffect, useState } from "react";
import { readInterfaceImage, refreshInterfaceImage } from "./interface-image-cache";

/** Resolver must be stable; never stores signed tokens, only image bytes and the public storage path. */
export function useCachedImage(key: string, version: string | null, resolve: () => Promise<string | null>, fallback: string | null = null) {
  const [saved, setSaved] = useState<{ version: string; url: string } | null>(null);
  useEffect(() => {
    if (!version) return;
    let active = true;
    let objectUrl: string | null = null;
    const show = (blob: Blob | null) => {
      if (!active || !blob) return;
      const next = URL.createObjectURL(blob);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = next;
      setSaved({ version, url: next });
    };
    const refresh = async () => {
      if (navigator.onLine) show(await refreshInterfaceImage(key, version, resolve));
    };
    void (async () => { show(await readInterfaceImage(key, version)); await refresh(); })();
    window.addEventListener("online", refresh);
    const onVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onVisible);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key, version, resolve]);
  return version && saved?.version === version ? saved.url : fallback;
}