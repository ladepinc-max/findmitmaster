/* Synthesized ringtones & notification tones — no audio files needed. */

type FreqStep = [freq: number, start: number, dur: number];
type Note = [freq: number, dur: number];

let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  sharedCtx ??= new Ctor();
  void sharedCtx.resume();
  return sharedCtx;
}

export function playFreqs(pairs: FreqStep[], type: string, volume = 0.6) {
  const ctx = getCtx();
  if (!ctx) return;
  pairs.forEach(([f, start, dur]) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type === "bell" ? "triangle" : "sine";
    o.frequency.value = f;
    o.connect(g);
    g.connect(ctx.destination);
    const now = ctx.currentTime + start;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(Math.max(volume, 0.01), now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    o.start(now);
    o.stop(now + dur);
  });
}

export function playMelody(notes: Note[], wave: OscillatorType = "sine", volume = 0.6) {
  const ctx = getCtx();
  if (!ctx) return;
  let t = ctx.currentTime;
  notes.forEach(([f, d]) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = wave;
    o.frequency.value = f;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(Math.max(volume, 0.01), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + d * 0.9);
    o.start(t);
    o.stop(t + d);
    t += d;
  });
}

/** Total duration (seconds) of each tone — used for ringtone looping. */
export const TONE_DURATION: Record<string, number> = {
  pop: 0.3,
  ding: 0.7,
  chime: 0.8,
  bell: 0.7,
  whatsapp: 0.6,
  sunrise: 1.6,
  nokiaDream: 2.0,
  afroBounce: 1.5,
  crystal: 1.4,
  mellowCall: 2.1,
  urgent: 1.1,
  lullaby: 3.1,
  accraNite: 2.2,
  churchBell: 1.8,
  digitalLove: 2.2,
};

export const tones: Record<string, (volume?: number) => void> = {
  pop: (v) => playFreqs([[880, 0, 0.1], [1320, 0.05, 0.15]], "pop", v),
  ding: (v) => playFreqs([[1200, 0, 0.6]], "ding", v),
  chime: (v) => playFreqs([[523, 0, 0.3], [659, 0.15, 0.3], [784, 0.3, 0.4]], "chime", v),
  bell: (v) => playFreqs([[1000, 0, 0.4], [1500, 0.1, 0.5]], "bell", v),
  whatsapp: (v) => playFreqs([[600, 0, 0.2], [900, 0.2, 0.3]], "pop", v),
  // 10 ringtones
  sunrise: (v) => playMelody([[523, 0.3], [659, 0.3], [784, 0.3], [1046, 0.6]], "sine", v),
  nokiaDream: (v) => playMelody([[659, 0.2], [784, 0.2], [659, 0.2], [523, 0.2], [659, 0.4], [784, 0.4]], "sine", v),
  afroBounce: (v) => playMelody([[440, 0.15], [440, 0.15], [554, 0.15], [659, 0.15], [659, 0.15], [554, 0.3], [440, 0.3]], "sine", v),
  crystal: (v) => playFreqs([[1046, 0, 0.8], [1318, 0.1, 0.8], [1568, 0.2, 1.0]], "crystal", v),
  mellowCall: (v) => playMelody([[349, 0.4], [440, 0.4], [523, 0.4], [440, 0.8]], "sine", v),
  urgent: (v) => playMelody([[880, 0.15], [880, 0.15], [880, 0.15], [1200, 0.6]], "sine", v),
  lullaby: (v) => playMelody([[523, 0.5], [659, 0.5], [784, 0.5], [659, 0.5], [523, 1.0]], "sine", v),
  accraNite: (v) => playMelody([[330, 0.2], [392, 0.2], [440, 0.2], [523, 0.6], [392, 0.2], [523, 0.8]], "sine", v),
  churchBell: (v) => playFreqs([[523, 0, 1.5], [659, 0.3, 1.2], [784, 0.6, 1.0]], "bell", v),
  digitalLove: (v) => playMelody([[659, 0.2], [659, 0.2], [784, 0.4], [659, 0.2], [523, 0.4], [659, 0.8]], "sine", v),
};
