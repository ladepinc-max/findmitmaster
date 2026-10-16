import { useCallback, useEffect, useState } from "react";

/**
 * Saves a job/expertise form locally so people can leave the page and
 * continue later instead of filling everything in again.
 */
export function loadDraft<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`findmit-draft:${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveDraft<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`findmit-draft:${key}`, JSON.stringify(value));
  } catch {
    /* storage full or unavailable */
  }
}

export function clearDraft(key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(`findmit-draft:${key}`);
}

/** Tracks whether a saved draft exists for this form. */
export function useDraftState(key: string, open: boolean) {
  const [hasDraft, setHasDraft] = useState(false);
  useEffect(() => {
    if (open) setHasDraft(loadDraft(key) !== null);
  }, [key, open]);
  const refresh = useCallback(() => setHasDraft(loadDraft(key) !== null), [key]);
  return { hasDraft, refresh };
}
