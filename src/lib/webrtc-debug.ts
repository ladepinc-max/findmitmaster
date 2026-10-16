// In-memory WebRTC debug log + enablement helpers for the developer panel.

export type DebugLevel = "info" | "warn" | "error";

export interface DebugEntry {
  id: number;
  at: number;
  level: DebugLevel;
  category: string;
  message: string;
  detail?: string | undefined;
}

const MAX_ENTRIES = 200;

let entries: DebugEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function logDebug(
  category: string,
  message: string,
  opts?: { level?: DebugLevel; detail?: unknown },
) {
  const entry: DebugEntry = {
    id: nextId++,
    at: Date.now(),
    level: opts?.level ?? "info",
    category,
    message,
    detail:
      opts?.detail === undefined
        ? undefined
        : typeof opts.detail === "string"
          ? opts.detail
          : safeStringify(opts.detail),
  };
  entries = [...entries.slice(-(MAX_ENTRIES - 1)), entry];
  notify();
}

export function getDebugEntries(): DebugEntry[] {
  return entries;
}

export function clearDebugEntries() {
  entries = [];
  notify();
}

export function subscribeDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Map a getUserMedia / WebRTC DOMException to a plain-language explanation. */
export function describeMediaError(err: unknown): string {
  const e = err as DOMException | undefined;
  const name = e?.name ?? "UnknownError";
  const message = e?.message ?? String(err);
  switch (name) {
    case "NotAllowedError":
      return `NotAllowedError — Camera/mic permission denied. Allow permissions in browser/site settings or Phone Settings > Apps > FindMit > Permissions. (${message})`;
    case "NotFoundError":
      return `NotFoundError — No camera or microphone found on this device. (${message})`;
    case "NotReadableError":
    case "TrackStartError":
      return `${name} — The camera/mic is busy or unusable (another app may be using it). (${message})`;
    case "OverconstrainedError":
      return `OverconstrainedError — The device can't satisfy the requested resolution/facing mode. (${message})`;
    case "SecurityError":
      return `SecurityError — getUserMedia requires a secure (https) context. (${message})`;
    case "AbortError":
      return `AbortError — The media request was aborted. (${message})`;
    case "TypeError":
      return `TypeError — Invalid constraints passed to getUserMedia. (${message})`;
    default:
      return `${name}: ${message}`;
  }
}

const ENABLED_KEY = "findmeet_debug_panel";

export function isDebugPanelEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(ENABLED_KEY) === "1") return true;
    return new URLSearchParams(window.location.search).get("debug") === "1";
  } catch {
    return false;
  }
}

export function setDebugPanelEnabled(enabled: boolean) {
  try {
    if (enabled) window.localStorage.setItem(ENABLED_KEY, "1");
    else window.localStorage.removeItem(ENABLED_KEY);
  } catch {
    /* ignore */
  }
  notify();
}

export function formatDebugLogs(): string {
  return entries
    .map(
      (e) =>
        `[${new Date(e.at).toISOString()}] [${e.level.toUpperCase()}] [${e.category}] ${e.message}${
          e.detail ? `\n  ${e.detail}` : ""
        }`,
    )
    .join("\n");
}
