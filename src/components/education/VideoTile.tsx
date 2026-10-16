import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/** Minimal shape shared by Cloudflare CallTrack and other video tracks. */
export interface PlayableTrack {
  play: (el: string | HTMLElement, opts?: { fit?: "contain" | "cover" }) => void;
  stop: (el?: HTMLElement) => void;
}

interface VideoTileProps {
  track: PlayableTrack | null | undefined;
  className?: string;
  muted?: boolean;
  fallback?: React.ReactNode;
  /** Mirror the picture (self-preview only — remote viewers always see normal). */
  mirror?: boolean;
}

/** Renders a live video track into a div, cleaning up on unmount. */
export function VideoTile({ track, className, fallback, mirror = false }: VideoTileProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !track) return;
    track.play(node, { fit: "contain" });
    return () => {
      try {
        // Detach only this tile — the same track may be shown elsewhere too.
        track.stop(node);
      } catch {
        /* track already closed */
      }
    };
  }, [track]);

  return (
    <div className={cn("relative overflow-hidden bg-black", className)}>
      <div
        ref={ref}
        className={cn(
          "absolute inset-0 [&>div]:!bg-transparent",
          mirror ? "[&_video]:[transform:scaleX(-1)]" : "[&_video]:[transform:scaleX(1)]",
        )}
      />
      {!track && fallback ? (
        <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
          {fallback}
        </div>
      ) : null}
    </div>
  );
}
