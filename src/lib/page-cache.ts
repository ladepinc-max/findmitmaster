import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

/**
 * Instant-load page cache. Screens remember the last data they showed on this
 * device, paint it straight away on the next visit, then the normal fetch and
 * Realtime listeners replace it with fresh data in the background.
 */
const PREFIX = "fm-cache:v1:";
// The most recent load is always kept (no expiry) and replaced by every fresh load.

export function readCache<T>(key: string): T | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { t: number; v: T };
    return parsed.v;
  } catch {
    return undefined;
  }
}

export function writeCache<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify({ t: Date.now(), v: value }));
  } catch {
    // Storage full or blocked — clear our old entries and give up quietly.
    clearPageCache();
  }
}

/** Called on sign-out so the next account never sees someone else's data. */
export function clearPageCache() {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/**
 * Drop-in replacement for useState that restores the last saved value right
 * after hydration (no SSR mismatch) and saves every update.
 */
export function useCachedState<T>(
  key: string | null,
  initial: T,
  onRestore?: (value: T) => void,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  const ready = useRef<string | null>(null);
  const restoreRef = useRef(onRestore);
  restoreRef.current = onRestore;

  useEffect(() => {
    if (!key) return;
    const cached = readCache<T>(key);
    if (cached !== undefined && cached !== null) {
      setValue(cached);
      restoreRef.current?.(cached);
    }
    ready.current = key;
  }, [key]);

  useEffect(() => {
    if (!key || ready.current !== key) return;
    if (value === null || value === undefined) return;
    const id = window.setTimeout(() => writeCache(key, value), 250);
    return () => window.clearTimeout(id);
  }, [key, value]);

  return [value, setValue];
}
