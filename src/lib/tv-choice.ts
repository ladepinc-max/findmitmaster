import { useEffect, useState } from "react";
import type { TvCategory } from "@/lib/social";
import { TV_ORDER } from "@/lib/tv-live";

const KEY = "findmit.tv.channel";
const EVENT = "findmit-tv-channel-change";

function isCategory(value: string | null): value is TvCategory {
  return Boolean(value && (TV_ORDER as string[]).includes(value));
}

/** The channel the viewer picked in Profile, or null when nothing is chosen yet. */
export function readTvChoice(): TvCategory | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return isCategory(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeTvChoice(category: TvCategory | null) {
  if (typeof window === "undefined") return;
  try {
    if (category) window.localStorage.setItem(KEY, category);
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable — keep the in-memory choice only */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Reads the chosen channel and keeps every surface in sync when it changes. */
export function useTvChoice(): [TvCategory | null, (next: TvCategory | null) => void] {
  const [choice, setChoice] = useState<TvCategory | null>(null);

  useEffect(() => {
    setChoice(readTvChoice());
    const sync = () => setChoice(readTvChoice());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return [choice, writeTvChoice];
}
