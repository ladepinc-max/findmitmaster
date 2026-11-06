/** Chrome-style tabs and history for the in-app browser, saved on the device. */
export interface BrowserTab {
  id: string;
  history: string[];
  index: number;
}
export interface HistoryEntry {
  url: string;
  at: number;
}
export interface TabsState {
  tabs: BrowserTab[];
  activeId: string;
}

export const HISTORY_LIMIT = 500;
const TABS_KEY = "findmit_browser_tabs";
const HISTORY_KEY = "findmit_browser_history";

let counter = 0;
export function newTab(url: string): BrowserTab {
  counter += 1;
  return { id: `t${Date.now().toString(36)}${counter}`, history: [url], index: 0 };
}

export function currentUrl(tab: BrowserTab): string {
  return tab.history[tab.index] ?? "";
}

export function openTab(s: TabsState, url: string): TabsState {
  const t = newTab(url);
  return { tabs: [...s.tabs, t], activeId: t.id };
}

export function closeTab(s: TabsState, id: string): TabsState | null {
  const i = s.tabs.findIndex((t) => t.id === id);
  const tabs = s.tabs.filter((t) => t.id !== id);
  if (!tabs.length) return null;
  const activeId = s.activeId === id ? tabs[Math.max(0, i - 1)]!.id : s.activeId;
  return { tabs, activeId };
}

export function updateTab(s: TabsState, id: string, fn: (t: BrowserTab) => BrowserTab): TabsState {
  return { ...s, tabs: s.tabs.map((t) => (t.id === id ? fn(t) : t)) };
}

export function navigateTab(t: BrowserTab, url: string): BrowserTab {
  return { ...t, history: [...t.history.slice(0, t.index + 1), url], index: t.index + 1 };
}

export function recordVisit(h: HistoryEntry[], url: string, at = Date.now()): HistoryEntry[] {
  if (!url) return h;
  if (h[0]?.url === url) return [{ url, at }, ...h.slice(1)];
  return [{ url, at }, ...h].slice(0, HISTORY_LIMIT);
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function dayGroup(at: number, now = Date.now()): "Today" | "Yesterday" | "Earlier" {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (at >= start.getTime()) return "Today";
  if (at >= start.getTime() - 86400000) return "Yesterday";
  return "Earlier";
}

function read<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
export const loadTabs = () => read<TabsState>(TABS_KEY);
export const saveTabs = (s: TabsState | null) => {
  try {
    if (s) localStorage.setItem(TABS_KEY, JSON.stringify(s));
    else localStorage.removeItem(TABS_KEY);
  } catch {
    /* storage full */
  }
};
export const loadHistory = () => read<HistoryEntry[]>(HISTORY_KEY) ?? [];
export const saveHistory = (h: HistoryEntry[]) => {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  } catch {
    /* storage full */
  }
};
