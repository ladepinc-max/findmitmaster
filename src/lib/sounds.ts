import localforage from "localforage";
import { TONE_DURATION, tones } from "@/utils/synthTones";

/* --------------------------------- storage -------------------------------- */

const store = localforage.createInstance({ name: "findmeet", storeName: "sounds" });

export const CUSTOM_CHAT_KEY = "custom_chat_tone";
export const CUSTOM_CALL_KEY = "custom_call_tone";

export interface ToneOption {
  id: string;
  label: string;
}

export const CHAT_TONES: ToneOption[] = [
  { id: "pop", label: "Pop" },
  { id: "ding", label: "Ding" },
  { id: "chime", label: "Chime" },
  { id: "bell", label: "Bell" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "none", label: "None" },
];

export const CALL_TONES: ToneOption[] = [
  { id: "sunrise", label: "Sunrise" },
  { id: "nokiaDream", label: "Nokia Dream" },
  { id: "afroBounce", label: "Afro Bounce" },
  { id: "crystal", label: "Crystal" },
  { id: "mellowCall", label: "Mellow Call" },
  { id: "urgent", label: "Urgent" },
  { id: "lullaby", label: "Lullaby" },
  { id: "accraNite", label: "Accra Nite" },
  { id: "churchBell", label: "Church Bell" },
  { id: "digitalLove", label: "Digital Love" },
  { id: "none", label: "None" },
];

const ls = (key: string) => (typeof window === "undefined" ? null : localStorage.getItem(key));

export function getChatToneUrl() {
  return ls("chat_tone_url") ?? "default:pop";
}
export function getChatToneName() {
  return ls("chat_tone_name") ?? "Pop";
}
export function getCallToneUrl() {
  const url = ls("call_ringtone_url") ?? "default:sunrise";
  // Migrate removed legacy ids to Sunrise.
  if (url.startsWith("default:") && !(url.slice(8) in tones)) return "default:sunrise";
  return url;
}
export function getCallToneName() {
  return ls("call_ringtone_name") ?? "Sunrise";
}
export function getVolume() {
  const raw = Number(ls("sound_volume"));
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 1) : 0.8;
}
export function getVibrate() {
  return ls("sound_vibrate") !== "off";
}

export function saveChatTone(url: string, name: string) {
  localStorage.setItem("chat_tone_url", url);
  localStorage.setItem("chat_tone_name", name);
}
export function saveCallTone(url: string, name: string) {
  localStorage.setItem("call_ringtone_url", url);
  localStorage.setItem("call_ringtone_name", name);
}
export function saveVolume(v: number) {
  localStorage.setItem("sound_volume", String(v));
}
export function saveVibrate(on: boolean) {
  localStorage.setItem("sound_vibrate", on ? "on" : "off");
}

/** Stores a picked audio file as a base64 data URL in IndexedDB. */
export async function saveCustomAudio(key: string, file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the audio file"));
    reader.readAsDataURL(file);
  });
  await store.setItem(key, dataUrl);
  return dataUrl;
}

export async function getCustomAudio(key: string): Promise<string | null> {
  return (await store.getItem<string>(key)) ?? null;
}

/* ------------------------------- synthesis -------------------------------- */

/** Loop durations (ms) for ringtone-style tones. */
export const PATTERN_DURATION: Record<string, number> = Object.fromEntries(
  Object.entries(TONE_DURATION).map(([id, secs]) => [id, Math.max(Math.round(secs * 1000), 300)]),
);

function playPattern(id: string, volume: number) {
  tones[id]?.(volume);
}

/* -------------------------------- playback -------------------------------- */

async function resolveUrl(url: string): Promise<{ kind: "default" | "custom" | "none"; value: string }> {
  if (url === "default:none" || url === "none") return { kind: "none", value: "" };
  if (url.startsWith("custom:")) {
    const data = await getCustomAudio(url.slice("custom:".length));
    return data ? { kind: "custom", value: data } : { kind: "default", value: "pop" };
  }
  if (url.startsWith("default:")) return { kind: "default", value: url.slice("default:".length) };
  return { kind: "custom", value: url };
}

/** Plays a tone once (preview or incoming-message sound). */
export async function playTone(url: string, volume = getVolume()) {
  try {
    const resolved = await resolveUrl(url);
    if (resolved.kind === "none") return;
    if (resolved.kind === "default") {
      playPattern(resolved.value, volume);
      return;
    }
    const audio = new Audio(resolved.value);
    audio.volume = volume;
    await audio.play();
  } catch {
    /* autoplay blocked */
  }
}

export async function playChatTone() {
  await playTone(getChatToneUrl());
  if (getVibrate() && typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(200);
}

/* -------------------------------- ringtone -------------------------------- */

interface RingHandle {
  audio: HTMLAudioElement | null;
  timer: ReturnType<typeof setInterval> | null;
  vibrateTimer: ReturnType<typeof setInterval> | null;
}

declare global {
  interface Window {
    ringAudio?: RingHandle | null;
  }
}

export function stopRingtone() {
  if (typeof window === "undefined") return;
  const handle = window.ringAudio;
  if (!handle) return;
  handle.audio?.pause();
  if (handle.timer) clearInterval(handle.timer);
  if (handle.vibrateTimer) clearInterval(handle.vibrateTimer);
  window.ringAudio = null;
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(0);
}

/** Plays a looping ringtone; stop it with stopRingtone(). */
export async function startRingtone(url = getCallToneUrl(), volume = getVolume()) {
  if (typeof window === "undefined") return;
  stopRingtone();
  const resolved = await resolveUrl(url);
  if (resolved.kind === "none") return;

  const handle: RingHandle = { audio: null, timer: null, vibrateTimer: null };
  if (resolved.kind === "custom") {
    const audio = new Audio(resolved.value);
    audio.loop = true;
    audio.volume = volume;
    handle.audio = audio;
    void audio.play().catch(() => undefined);
  } else {
    const id = resolved.value;
    playPattern(id, volume);
    handle.timer = setInterval(() => playPattern(id, volume), PATTERN_DURATION[id] ?? 2200);
  }
  if (getVibrate() && typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate([400, 600]);
    handle.vibrateTimer = setInterval(() => navigator.vibrate([400, 600]), 1000);
  }
  window.ringAudio = handle;
}

/** True when running inside a Capacitor native shell. */
export function isNativePlatform() {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

/**
 * Tries the native system ringtone picker (custom Capacitor plugin) and returns
 * the chosen tone, or null when unavailable so callers fall back to a file input.
 */
export async function pickNativeRingtone(): Promise<{ uri: string; name: string } | null> {
  if (!isNativePlatform()) return null;
  const plugins = (window as unknown as {
    Capacitor?: { Plugins?: Record<string, { pick?: () => Promise<{ uri?: string; name?: string }> }> };
  }).Capacitor?.Plugins;
  const picker = plugins?.["RingtonePicker"];
  if (!picker?.pick) return null;
  try {
    const result = await picker.pick();
    if (!result?.uri) return null;
    return { uri: result.uri, name: result.name ?? "Phone ringtone" };
  } catch {
    return null;
  }
}
