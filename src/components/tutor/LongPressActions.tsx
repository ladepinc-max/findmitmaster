import { useEffect, useRef, useState, type ReactNode } from "react";
import { Copy, Forward } from "lucide-react";
import { toast } from "sonner";

const HOLD_MS = 450;
const MOVE_TOLERANCE = 25;

/** Hold a message to pop up Copy and Forward actions. */
export function LongPressActions({
  text,
  children,
  className,
}: {
  text: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
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

  const copy = async () => {
    setOpen(false);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  const forward = async () => {
    setOpen(false);
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast.success("Copied — open any chat and paste to forward");
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") toast.error("Could not forward");
    }
  };

  return (
    <div
      ref={boxRef}
      className={`relative select-none ${className ?? ""}`}
      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", touchAction: "pan-y" }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (text.trim()) setOpen(true);
      }}
      onPointerDown={(e) => {
        if (!text.trim()) return;
        start.current = { x: e.clientX, y: e.clientY };
        timer.current = setTimeout(() => {
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
    >
      {children}
      {open ? (
        <div className="absolute bottom-full left-1/2 z-20 mb-2 flex -translate-x-1/2 overflow-hidden rounded-full border border-border bg-popover text-popover-foreground shadow-lg">
          <button
            type="button"
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium hover:bg-accent"
            onClick={(e) => {
              e.stopPropagation();
              void copy();
            }}
          >
            <Copy className="size-4" /> Copy
          </button>
          <span className="w-px bg-border" />
          <button
            type="button"
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium hover:bg-accent"
            onClick={(e) => {
              e.stopPropagation();
              void forward();
            }}
          >
            <Forward className="size-4" /> Forward
          </button>
        </div>
      ) : null}
    </div>
  );
}
