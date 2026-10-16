import { useEffect, useState } from "react";
import { Bug, Copy, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clearDebugEntries,
  formatDebugLogs,
  getDebugEntries,
  isDebugPanelEnabled,
  subscribeDebug,
} from "@/lib/webrtc-debug";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** Floating developer panel showing live WebRTC / media debug events. */
export function DebugPanel() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);

  // Client-only: avoids SSR hydration/render mismatches.
  useEffect(() => {
    setEnabled(isDebugPanelEnabled());
    return subscribeDebug(() => force((n) => n + 1));
  }, []);

  if (!enabled) return null;

  const entries = getDebugEntries();


  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatDebugLogs() || "(no logs yet)");
      toast.success("Debug logs copied");
    } catch {
      toast.error("Could not copy logs");
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open debug panel"
        className="fixed bottom-24 right-4 z-[70] flex size-11 items-center justify-center rounded-full bg-secondary text-foreground shadow-lg ring-1 ring-border"
      >
        <Bug className="size-5" />
      </button>
    );
  }

  return (
    <div className="fixed inset-x-3 bottom-20 z-[70] flex max-h-[60vh] flex-col overflow-hidden rounded-2xl border border-border bg-background/95 shadow-2xl backdrop-blur sm:left-auto sm:w-96">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="flex items-center gap-2 text-xs font-bold">
          <Bug className="size-4" /> WebRTC Debug ({entries.length})
        </p>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-7" onClick={() => void copy()} aria-label="Copy logs">
            <Copy className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => clearDebugEntries()}
            aria-label="Clear logs"
          >
            <Trash2 className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setOpen(false)} aria-label="Close panel">
            <X className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto p-3 font-mono text-[0.65rem] leading-relaxed">
        {entries.length === 0 ? (
          <p className="text-muted-foreground">
            No events yet. Camera, mic and WebRTC events will appear here.
          </p>
        ) : (
          entries.map((e) => (
            <div key={e.id} className="rounded-md bg-secondary/50 px-2 py-1.5">
              <p
                className={cn(
                  "font-semibold",
                  e.level === "error"
                    ? "text-destructive"
                    : e.level === "warn"
                      ? "text-yellow-400"
                      : "text-foreground",
                )}
              >
                <span className="text-muted-foreground">
                  {new Date(e.at).toLocaleTimeString()}
                </span>{" "}
                [{e.category}] {e.message}
              </p>
              {e.detail ? (
                <pre className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                  {e.detail}
                </pre>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
