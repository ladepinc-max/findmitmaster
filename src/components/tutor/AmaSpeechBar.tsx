import { useSyncExternalStore } from "react";
import { Pause, Play, RotateCcw, SkipBack, SkipForward, Square } from "lucide-react";
import { amaSpeech } from "@/lib/ama-voice";

/** Floating controls shown whenever Ama is reading aloud, anywhere in the app. */
export function AmaSpeechBar() {
  const s = useSyncExternalStore(amaSpeech.subscribe, amaSpeech.get, amaSpeech.getServer);
  if (!s.active) return null;
  const btn =
    "flex size-10 items-center justify-center rounded-full text-foreground hover:bg-muted disabled:opacity-40";
  return (
    <div
      className={`fixed inset-x-0 z-[60] flex justify-center px-3 ${
        typeof window !== "undefined" && window.location.pathname.startsWith("/tutor") ? "bottom-32" : "bottom-20"
      }`}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface/95 p-3 shadow-lg backdrop-blur">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="font-semibold text-primary">Ama is {s.paused ? "paused" : "reading"}</span>
          <span>
            Sentence {s.index + 1} of {s.total}
          </span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${((s.index + 1) / s.total) * 100}%` }} />
        </div>
        <p className="mt-2 line-clamp-2 text-xs">{s.sentence}</p>
        <div className="mt-2 flex items-center justify-between">
          <button type="button" className={btn} onClick={amaSpeech.restart} aria-label="Restart">
            <RotateCcw className="size-5" />
          </button>
          <button type="button" className={btn} onClick={amaSpeech.back} disabled={s.index === 0} aria-label="Back one sentence">
            <SkipBack className="size-5" />
          </button>
          <button
            type="button"
            className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground"
            onClick={s.paused ? amaSpeech.resume : amaSpeech.pause}
            aria-label={s.paused ? "Resume" : "Pause"}
          >
            {s.paused ? <Play className="size-6" /> : <Pause className="size-6" />}
          </button>
          <button type="button" className={btn} onClick={amaSpeech.forward} aria-label="Forward one sentence">
            <SkipForward className="size-5" />
          </button>
          <button type="button" className={btn} onClick={amaSpeech.stop} aria-label="Stop">
            <Square className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
