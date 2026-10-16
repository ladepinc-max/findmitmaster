import { useEffect, useRef, useState, type ReactNode } from "react";
import { Play } from "lucide-react";

const HOLD_MS = 500;
const MOVE_TOLERANCE = 10;

/** Hold Ama's answer for half a second to pop up a Play button that reads it aloud. */
export function LongPressPlay({
  onPlay,
  children,
  className,
}: {
  onPlay: () => void;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 40, y: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  useEffect(() => cancel, []);

  return (
    <div
      ref={boxRef}
      className={`relative select-none ${className ?? ""}`}
      style={{ WebkitTouchCallout: "none" }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, y: e.clientY };
        const rect = boxRef.current?.getBoundingClientRect();
        const x = rect ? Math.min(Math.max(e.clientX - rect.left, 40), Math.max(rect.width - 40, 40)) : 40;
        const y = rect ? e.clientY - rect.top : 0;
        timer.current = setTimeout(() => {
          setPos({ x, y });
          setOpen(true);
          navigator.vibrate?.(30);
        }, HOLD_MS);
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_TOLERANCE) cancel();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
    >
      {children}
      {open ? (
        <button
          type="button"
          style={{ left: pos.x, top: pos.y }}
          className="absolute z-20 flex -translate-x-1/2 -translate-y-[calc(100%+12px)] items-center gap-1 whitespace-nowrap rounded-full bg-success px-3 py-1.5 text-xs font-semibold text-success-foreground shadow-lg"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
            onPlay();
          }}
        >
          <Play className="size-3.5 fill-current" /> Play
        </button>
      ) : null}
    </div>
  );
}
