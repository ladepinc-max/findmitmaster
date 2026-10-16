import { useEffect, useRef, useState } from "react";

/**
 * Plays an HLS stream (Safari natively, everywhere else via hls.js).
 * This is what ordinary students watch: cheap, cached, low-data video.
 */
export function HlsPlayer({
  src,
  className,
  muted = false,
}: {
  src: string;
  className?: string;
  muted?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    setFailed(false);
    let hls: { destroy: () => void } | null = null;
    let cancelled = false;

    (async () => {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
      } else {
        const { default: Hls } = await import("hls.js");
        if (cancelled) return;
        if (Hls.isSupported()) {
          const instance = new Hls({
            liveSyncDurationCount: 3,
            maxLiveSyncPlaybackRate: 1.5,
            // Data saver: never climb above a 360p-sized rendition.
            capLevelToPlayerSize: false,
          });
          instance.loadSource(src);
          instance.attachMedia(video);
          instance.on(Hls.Events.MANIFEST_PARSED, () => {
            const levels = instance.levels ?? [];
            if (levels.length > 0) {
              let best = 0;
              levels.forEach((level, index) => {
                const current = levels[best]!.height ?? 0;
                const height = level.height ?? 0;
                if (height <= 380 && height > current) best = index;
              });
              instance.autoLevelCapping = best;
            }
          });
          instance.on(Hls.Events.ERROR, (_e, data) => {
            if (!data.fatal) return;
            // A class stream can start a few seconds after the teacher does.
            if (data.type === "networkError") instance.startLoad();
            else if (data.type === "mediaError") instance.recoverMediaError();
            else setFailed(true);
          });
          hls = instance;
        } else {
          setFailed(true);
        }
      }
      await video.play().catch(() => undefined);
    })();

    return () => {
      cancelled = true;
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [src]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        playsInline
        autoPlay
        muted={muted}
        controls={false}
      />
      {failed ? (
        <div className="absolute inset-0 grid place-items-center bg-black text-center text-xs text-white/60">
          Stream is starting…
        </div>
      ) : null}
    </div>
  );
}
