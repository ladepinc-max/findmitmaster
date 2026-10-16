import { stripDiagrams } from "@/lib/diagrams";
/** Ama's speaking voice: device voice list, West African preference and fallback. */

export const AMA_VOICE_KEY = "findmit-ama-voice";

const norm = (lang: string) => lang.replace("_", "-").toLowerCase();

/** Voices we consider West African / African first for Ama. */
const AFRICAN_LANGS = ["en-gh", "en-ng", "en-ke", "en-za", "en-tz", "en-ug"];

export function isAfricanVoice(v: SpeechSynthesisVoice): boolean {
  return AFRICAN_LANGS.includes(norm(v.lang)) || /ghana|nigeri|african|akan|twi|kenya/i.test(v.name);
}

export function listEnglishVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => norm(v.lang).startsWith("en"))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getSavedVoiceURI(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(AMA_VOICE_KEY);
}

export function saveVoiceURI(uri: string | null) {
  if (typeof window === "undefined") return;
  if (uri) window.localStorage.setItem(AMA_VOICE_KEY, uri);
  else window.localStorage.removeItem(AMA_VOICE_KEY);
}

/** Auto pick: English (United States) first for every student, then other English voices. */
export function autoPickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const by = (test: (v: SpeechSynthesisVoice) => boolean) => voices.find(test) ?? null;
  return (
    by((v) => norm(v.lang) === "en-us" && /google/i.test(v.name)) ??
    by((v) => norm(v.lang) === "en-us") ??
    by((v) => /united states|english us|\bus\b/i.test(v.name) && norm(v.lang).startsWith("en")) ??
    by((v) => norm(v.lang).startsWith("en")) ??
    null
  );
}

/** The voice Ama should use right now: the saved one, else the best African match. */
export function resolveAmaVoice(): SpeechSynthesisVoice | null {
  const saved = getSavedVoiceURI();
  if (saved) {
    const match = listEnglishVoices().find((v) => v.voiceURI === saved);
    if (match) return match;
  }
  return autoPickVoice();
}

export const AMA_VOICE_SAMPLE =
  "Hello! I am Ama, your FindMit tutor. Let us study for WASSCE together.";

/** Speaks a short sample with a given voice so the student can compare accents. */
export function previewVoice(voice: SpeechSynthesisVoice | null, text = AMA_VOICE_SAMPLE) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = voice?.lang ?? "en-US";
  if (voice) utter.voice = voice;
  utter.rate = tuning.rate;
  utter.pitch = tuning.pitch;
  utter.volume = tuning.volume;
  window.speechSynthesis.speak(utter);
}

/** Turns written answers into words that read well aloud. */
export function cleanForSpeech(content: string): string {
  return content
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1")
    .replace(/[*#_`]/g, "")
    .replace(/GH[¢₵]\s?|\bGHS\b/g, "Ghana cedis ")
    .replace(/\bSHS\b/g, "Senior High School")
    .replace(/\bJHS\b/g, "Junior High School")
    .replace(/^\s*[-•]\s*/gm, "")
    .trim();
}

/**
 * Phones cut a long single utterance short (Chrome/Safari stop after ~15s),
 * so we split the answer into sentences and speak them one after another.
 */
/** Makes punctuation audible: dashes, brackets and colons become clear pauses. */
function punctuate(text: string): string {
  return text
    .replace(/\s*(—|–|--)\s*/g, ", ")
    .replace(/\s*\(([^)]{1,120})\)\s*/g, ", $1, ")
    .replace(/:\s+/g, ": ")
    .replace(/\s*;\s*/g, "; ")
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ");
}

/** Every sentence is its own utterance so the phone honours full stops and question marks. */
function toChunks(text: string, max = 180): string[] {
  const parts = punctuate(text)
    .split(/(?<=[.!?:;])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  for (const part of parts) {
    if (part.length <= max) {
      chunks.push(part);
      continue;
    }
    // Long sentence: break at commas first, then at word boundaries.
    let buffer = "";
    for (const clause of part.split(/(?<=,)\s+/)) {
      const pieces = clause.length > max ? clause.match(new RegExp(`.{1,${max}}(\\s|$)`, "g")) ?? [clause] : [clause];
      for (const raw of pieces) {
        const piece = raw.trim();
        const next = buffer ? `${buffer} ${piece}` : piece;
        if (next.length > max && buffer) {
          chunks.push(buffer);
          buffer = piece;
        } else buffer = next;
      }
    }
    if (buffer) chunks.push(buffer);
  }
  return chunks;
}

/** Pause after a chunk based on how it ends (full stop longer than comma). */
function pauseAfter(chunk: string, base: number): number {
  const end = chunk.trim().slice(-1);
  if (end === "." || end === "!" || end === "?") return Math.max(320, base);
  if (end === ":" || end === ";") return Math.max(260, Math.round(base * 0.8));
  if (end === ",") return Math.max(160, Math.round(base * 0.5));
  return Math.max(120, Math.round(base * 0.4));
}

export interface AmaSpeechState {
  active: boolean;
  paused: boolean;
  index: number;
  total: number;
  sentence: string;
}

const IDLE: AmaSpeechState = { active: false, paused: false, index: 0, total: 0, sentence: "" };
let state: AmaSpeechState = IDLE;
const listeners = new Set<() => void>();
const emit = (next: AmaSpeechState) => {
  state = next;
  listeners.forEach((l) => l());
};
export const amaSpeech = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  get: () => state,
  getServer: () => IDLE,
  pause: () => undefined as void,
  resume: () => undefined as void,
  back: () => undefined as void,
  forward: () => undefined as void,
  restart: () => undefined as void,
  stop: () => undefined as void,
};

/** Admin-set voice tuning shared by every place Ama speaks. */
export type VoiceCadence = "relaxed" | "standard" | "brisk";
export interface VoiceTuning {
  rate: number;
  pitch: number;
  volume: number;
  cadence: VoiceCadence;
  phonetics: boolean;
}
export const DEFAULT_VOICE_TUNING: VoiceTuning = {
  rate: 0.9,
  pitch: 1.02,
  volume: 1,
  cadence: "relaxed",
  phonetics: true,
};
let tuning: VoiceTuning = DEFAULT_VOICE_TUNING;
export function setVoiceTuning(next: Partial<VoiceTuning>) {
  tuning = { ...tuning, ...next };
}
export function getVoiceTuning(): VoiceTuning {
  return tuning;
}

const CADENCE = {
  relaxed: { max: 120, gap: 380 },
  standard: { max: 180, gap: 120 },
  brisk: { max: 220, gap: 0 },
} as const;

/** Rewrites text so the phone pronounces Ghanaian school, money and maths words like a local teacher. */
export function ghanaPhonetics(text: string, cadence: VoiceCadence = "standard"): string {
  let t = text
    .replace(/\bWASSCE\b/gi, "Wah-see")
    .replace(/\bBECE\b/g, "Beh-see")
    .replace(/\bNaCCA\b/gi, "Nah-kah")
    .replace(/\bGTEC\b/g, "G tech")
    .replace(/\bN\s?&\s?MC\b/g, "N and M C")
    .replace(/\bGES\b/g, "G. E. S.")
    .replace(/\bMoMo\b/gi, "Mow-mow")
    .replace(/\bFindMit\b/gi, "Find-meet")
    .replace(/\bpesewas?\b/gi, "peh-seh-wahs")
    .replace(/\bB([7-9])\b/g, "Basic $1")
    .replace(/\bJHS\s?([1-3])\b/g, "Junior High $1")
    .replace(/\bSHS\s?([1-3])\b/g, "Senior High $1")
    .replace(/[¢₵]\s?(\d)/g, "$1 Ghana cedis ")
    .replace(/√\s*\(?([\w.]+)\)?/g, "square root of $1")
    .replace(/(\w)\s*\^\s*2\b/g, "$1 squared")
    .replace(/(\w)\s*\^\s*3\b/g, "$1 cubed")
    .replace(/(\w)\s*\^\s*(\w+)/g, "$1 to the power $2")
    .replace(/(\d+|\b[a-z])\s*\/\s*(\d+|[a-z]\b)/g, "$1 over $2")
    .replace(/\s*[×*]\s*/g, " times ")
    .replace(/\s*÷\s*/g, " divided by ")
    .replace(/\s*=\s*/g, cadence === "brisk" ? " equals " : ", equals ")
    .replace(/\s\+\s/g, " plus ")
    .replace(/\s[-−]\s/g, " minus ");
  if (cadence === "relaxed") {
    t = t
      .replace(/\b(Step \d+|Option [A-E]|Now|So|Therefore|Notice that|Remember)\b[:,]?\s*/g, "$1, ... ")
      .replace(/\bthe answer is\b/gi, "the answer is ...");
  }
  return t;
}

/** Reads a whole answer aloud sentence by sentence, with pause, skip and restart controls. */
export function speakLong(content: string, onDone?: () => void, override?: Partial<VoiceTuning>): () => void {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    onDone?.();
    return () => undefined;
  }
  amaSpeech.stop();
  const synth = window.speechSynthesis;
  if (synth.speaking || synth.pending) synth.cancel();
  const tune = { ...tuning, ...override };
  const pace = CADENCE[tune.cadence] ?? CADENCE.standard;
  // Ama reads the teaching part; the exam-copy "FULL WORKOUT" stays on screen only.
  const spoken = stripDiagrams(content).split(/\n\s*FULL WORKOUT:?/i)[0] ?? content;
  const cleaned = cleanForSpeech(spoken);
  const chunks = toChunks(tune.phonetics ? ghanaPhonetics(cleaned, tune.cadence) : cleaned, pace.max);
  if (chunks.length === 0) {
    onDone?.();
    return () => undefined;
  }
  const voice = resolveAmaVoice();
  let ended = false;
  let paused = false;
  let i = 0;
  let token = 0;
  const keepAlive = window.setInterval(() => {
    if (!ended && synth.speaking && !synth.paused) synth.resume();
  }, 5000);

  const publish = () =>
    emit({ active: true, paused, index: i, total: chunks.length, sentence: chunks[i] ?? "" });

  const end = (notify: boolean) => {
    if (ended) return;
    ended = true;
    token += 1;
    window.clearInterval(keepAlive);
    synth.cancel();
    emit(IDLE);
    if (notify) onDone?.();
  };

  // Keep utterances referenced so phones don't garbage-collect them mid-sentence.
  const live: SpeechSynthesisUtterance[] = [];
  const play = (interrupt = false) => {
    if (ended) return;
    if (i >= chunks.length) {
      end(true);
      return;
    }
    const my = ++token;
    // Only reset the engine when the student jumps; between sentences we chain straight on.
    if (interrupt) synth.cancel();
    const utter = new SpeechSynthesisUtterance(chunks[i]!);
    utter.lang = voice?.lang ?? "en-US";
    if (voice) utter.voice = voice;
    utter.rate = tune.rate;
    utter.pitch = tune.pitch;
    utter.volume = tune.volume;
    const next = () => {
      if (my !== token || paused || ended) return;
      i += 1;
      publish();
      if (i < chunks.length) {
        window.setTimeout(() => {
          if (my === token && !paused && !ended) play();
        }, pauseAfter(chunks[i - 1] ?? "", pace.gap));
      } else play();
    };
    utter.onend = next;
    utter.onerror = (e) => {
      if ((e as SpeechSynthesisErrorEvent).error === "interrupted" || (e as SpeechSynthesisErrorEvent).error === "canceled") return;
      next();
    };
    live.push(utter);
    if (live.length > 3) live.shift();
    publish();
    if (synth.paused) synth.resume();
    synth.speak(utter);
  };

  const jump = (to: number) => {
    i = Math.max(0, Math.min(chunks.length - 1, to));
    paused = false;
    play(true);
  };

  amaSpeech.pause = () => {
    if (ended || paused) return;
    paused = true;
    token += 1;
    synth.cancel();
    publish();
  };
  amaSpeech.resume = () => {
    if (ended || !paused) return;
    paused = false;
    play(true);
  };
  amaSpeech.back = () => jump(i - 1);
  amaSpeech.forward = () => {
    if (i >= chunks.length - 1) end(true);
    else jump(i + 1);
  };
  amaSpeech.restart = () => jump(0);
  amaSpeech.stop = () => end(true);

  play();
  return () => end(false);
}

// Warm up the device voice list early so Ama's first sentence starts without waiting.
if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener?.("voiceschanged", () => window.speechSynthesis.getVoices());
  // Mobile engines start cold; a silent utterance on the first tap unlocks and warms them.
  const unlock = () => {
    try {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      window.speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  };
  window.addEventListener("pointerdown", unlock, { once: true, passive: true });
}
