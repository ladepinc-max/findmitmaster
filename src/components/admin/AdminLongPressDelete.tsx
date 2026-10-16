import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const HOLD_MS = 600;
const MOVE_TOLERANCE = 10;

/** Admin-only: hold a post to reveal a Delete button. Non-admins get the plain children. */
export function AdminLongPressDelete({
  enabled,
  onDelete,
  children,
}: {
  enabled: boolean;
  onDelete: () => Promise<void>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
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

  if (!enabled) return <>{children}</>;

  const remove = async () => {
    setBusy(true);
    try {
      await onDelete();
      toast.success("Post deleted");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete post");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={boxRef}
      className="relative list-none"
      onPointerDown={(e) => {
        start.current = { x: e.clientX, y: e.clientY };
        timer.current = setTimeout(() => setOpen(true), HOLD_MS);
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_TOLERANCE) cancel();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
      {open ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-background/70 backdrop-blur-sm">
          <Button variant="destructive" className="h-12 gap-2 rounded-full px-6 font-bold" disabled={busy} onClick={() => void remove()}>
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Trash2 className="size-5" />} Delete post
          </Button>
        </div>
      ) : null}
    </div>
  );
}
