/**
 * Remembers signed storage URLs on this device so the same photo keeps the same
 * URL between visits — the browser then serves it from its own image cache
 * instead of downloading it again.
 */
const PREFIX = "fm-cache:v1:url:";

export function getCachedUrl(bucket: string, path: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + bucket + ":" + path);
    if (!raw) return null;
    const { u, e } = JSON.parse(raw) as { u: string; e: number };
    return e > Date.now() ? u : null;
  } catch {
    return null;
  }
}

export function setCachedUrl(bucket: string, path: string, url: string, ttlMs: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + bucket + ":" + path, JSON.stringify({ u: url, e: Date.now() + ttlMs }));
  } catch {
    /* storage full — skip */
  }
}
