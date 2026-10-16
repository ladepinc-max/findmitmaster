import { useSyncExternalStore } from "react";

export type StoriesInnerTab = "home" | "live" | "post" | "stations" | "manage-tv";

let current: StoriesInnerTab = "home";
const listeners = new Set<() => void>();

export function setStoriesInnerTab(tab: StoriesInnerTab) {
  if (current === tab) return;
  current = tab;
  listeners.forEach((listener) => listener());
}

export function getStoriesInnerTab(): StoriesInnerTab {
  return current;
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/** Shared inner-tab state for the Stories screen so the bottom bar can drive it. */
export function useStoriesInnerTab(): [StoriesInnerTab, (tab: StoriesInnerTab) => void] {
  const tab = useSyncExternalStore(subscribe, getStoriesInnerTab, getStoriesInnerTab);
  return [tab, setStoriesInnerTab];
}
