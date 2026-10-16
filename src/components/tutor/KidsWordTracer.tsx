import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Eraser, SkipForward, Star, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KIDS_WORDS } from "@/lib/kids-words";
import { speakLong } from "@/lib/ama-voice";

const S = 600; // square canvas for one giant letter
const PASS = 0.5;
const BRUSH = 56;
const FONT = `800 480px "Comic Sans MS", "Chalkboard SE", "Trebuchet MS", sans-serif`;

function shuffled<T>(list: T[]) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/** Kids class: Ama shows a picture; the child traces each giant dotted letter with a finger. */
export function KidsWordTracer({ onBack }: { onBack: () => void }) {
  const [deck] = useState(() => shuffled(KIDS_WORDS));
  const [i, setI] = useState(0);
  const [li, setLi] = useState(0);
  const [stars, setStars] = useState(0);
  const [celebrate, setCelebrate] = useState(false);
  const [progress, setProgress] = useState(0);
  const guideRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<Uint8ClampedArray | null>(null);
  const drawing = useRef(false);
  const pts = useRef<{ x: number; y: number }[]>([]);
  const moves = useRef(0);
  const locked = useRef(false);
  const stopRef = useRef<(() => void) | null>(null);
  const item = deck[i % deck.length]!;
  const word = item.word.toUpperCase();
  const letter = word[li] ?? "";

  const say = useCallback((text: string, onDone?: () => void) => {
    stopRef.current?.();
    stopRef.current = speakLong(text, onDone);
  }, []);

  const announce = useCallback(() => {
    say(`${item.word}. ${word.split("").join(", ")}. Trace the letters with your finger.`);
  }, [item.word, word, say]);

  // New word: reset letters and introduce it.
  useEffect(() => {
    setLi(0);
    setCelebrate(false);
    const t = setTimeout(announce, 300);
    return () => clearTimeout(t);
  }, [i, announce]);

  // Draw the dotted letter guide and its target mask.
  useEffect(() => {
    const g = guideRef.current!.getContext("2d")!;
    g.clearRect(0, 0, S, S);
    g.font = FONT;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "rgba(140,145,155,0.12)";
    g.fillText(letter, S / 2, S / 2 + 20);
    g.lineWidth = 10;
    g.setLineDash([2, 22]);
    g.lineCap = "round";
    g.strokeStyle = "#8a8f98";
    g.strokeText(letter, S / 2, S / 2 + 20);

    const off = document.createElement("canvas");
    off.width = S;
    off.height = S;
    const o = off.getContext("2d")!;
    o.font = FONT;
    o.textAlign = "center";
    o.textBaseline = "middle";
    o.lineWidth = 14;
    o.strokeStyle = "#000";
    o.strokeText(letter, S / 2, S / 2 + 20);
    maskRef.current = o.getImageData(0, 0, S, S).data;

    drawRef.current!.getContext("2d")!.clearRect(0, 0, S, S);
    setProgress(0);
    locked.current = false;
  }, [letter, i]);

  useEffect(() => () => stopRef.current?.(), []);

  const finishLetter = () => {
    locked.current = true;
    drawing.current = false;
    if (li + 1 < word.length) {
      say(letter);
      setTimeout(() => setLi((n) => n + 1), 500);
    } else {
      setCelebrate(true);
      setStars((s) => s + 1);
      say(`Correct! ${item.word}!`);
      setTimeout(() => setI((n) => n + 1), 1800);
    }
  };

  const check = () => {
    const mask = maskRef.current;
    if (!mask || locked.current) return;
    const d = drawRef.current!.getContext("2d")!.getImageData(0, 0, S, S).data;
    let total = 0;
    let hit = 0;
    let drawn = 0;
    let stray = 0;
    for (let p = 3; p < mask.length; p += 24) {
      const inMask = (mask[p] ?? 0) > 0;
      const inDraw = (d[p] ?? 0) > 0;
      if (inMask) {
        total++;
        if (inDraw) hit++;
      }
      if (inDraw) {
        drawn++;
        if (!inMask) stray++;
      }
    }
    const cover = total ? hit / total : 0;
    setProgress(Math.round(Math.min(1, cover / PASS) * 100));
    if (cover >= PASS && drawn && stray / drawn < 0.92) finishLetter();
  };

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * S, y: ((e.clientY - r.top) / r.height) * S };
  };

  const ctx = () => {
    const c = drawRef.current!.getContext("2d")!;
    c.strokeStyle = "#f97316";
    c.fillStyle = "#f97316";
    c.lineWidth = BRUSH;
    c.lineCap = "round";
    c.lineJoin = "round";
    return c;
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (locked.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    pts.current = [p];
    const c = ctx();
    c.beginPath();
    c.arc(p.x, p.y, BRUSH / 2, 0, Math.PI * 2);
    c.fill();
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    const r = e.currentTarget.getBoundingClientRect();
    const c = ctx();
    for (const ev of events) {
      const p = { x: ((ev.clientX - r.left) / r.width) * S, y: ((ev.clientY - r.top) / r.height) * S };
      const a = pts.current;
      a.push(p);
      if (a.length < 3) {
        c.beginPath();
        c.moveTo(a[0]!.x, a[0]!.y);
        c.lineTo(p.x, p.y);
        c.stroke();
        continue;
      }
      const p0 = a[a.length - 3]!;
      const p1 = a[a.length - 2]!;
      const m0 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
      const m1 = { x: (p1.x + p.x) / 2, y: (p1.y + p.y) / 2 };
      c.beginPath();
      c.moveTo(m0.x, m0.y);
      c.quadraticCurveTo(p1.x, p1.y, m1.x, m1.y);
      c.stroke();
      if (a.length > 50) a.splice(0, a.length - 3);
    }
    if (++moves.current % 8 === 0) check();
  };

  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    pts.current = [];
    check();
  };

  const clear = () => {
    drawRef.current!.getContext("2d")!.clearRect(0, 0, S, S);
    setProgress(0);
  };

  return (
    <section className="px-4 py-3">
      <div className="flex items-center justify-between">
        <Button size="sm" variant="ghost" className="gap-1 px-2" onClick={onBack}>
          <ArrowLeft className="size-4" /> Classes
        </Button>
        <span className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-primary">
          <Star className="size-4 fill-current" /> {stars}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-center gap-4">
        <button type="button" onClick={announce} className="text-[64px] leading-none" aria-label={`Hear ${item.word}`}>
          {item.emoji}
        </button>
        <div className="flex gap-1.5">
          {word.split("").map((ch, k) => (
            <span
              key={k}
              className={`flex size-11 items-center justify-center rounded-xl text-2xl font-extrabold ${
                k < li || celebrate
                  ? "bg-primary text-primary-foreground"
                  : k === li
                    ? "border-2 border-primary text-primary"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {ch}
            </span>
          ))}
        </div>
      </div>

      <div className="relative mx-auto mt-3 aspect-square w-full max-w-[420px] overflow-hidden rounded-3xl border-2 border-dashed border-border bg-background">
        <canvas ref={guideRef} width={S} height={S} className="absolute inset-0 h-full w-full" />
        <canvas
          ref={drawRef}
          width={S}
          height={S}
          className="absolute inset-0 h-full w-full"
          style={{ touchAction: "none" }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
        {celebrate && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-background/70">
            <span className="animate-bounce text-6xl">⭐🎉⭐</span>
            <span className="mt-2 text-3xl font-extrabold text-primary">Correct!</span>
          </div>
        )}
      </div>

      <div className="mx-auto mt-2 h-3 max-w-[420px] overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button variant="secondary" className="h-14 gap-2 text-base" onClick={announce}>
          <Volume2 className="size-5" /> Hear
        </Button>
        <Button variant="secondary" className="h-14 gap-2 text-base" onClick={clear}>
          <Eraser className="size-5" /> Clear
        </Button>
        <Button variant="secondary" className="h-14 gap-2 text-base" onClick={() => setI((n) => n + 1)}>
          <SkipForward className="size-5" /> Next
        </Button>
      </div>
    </section>
  );
}
