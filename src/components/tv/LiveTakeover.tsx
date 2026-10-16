import { useEffect, useRef, useState } from "react";
import { Maximize2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchLiveNow, type LiveNow } from "@/lib/cloudflare-live";

/** Full-screen TV takeover whenever the Director publishes to Cloudflare. */
export function LiveTakeover() {
  const [live, setLive] = useState<LiveNow | null>(null);
  const [mini, setMini] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const row = await fetchLiveNow();
      if (alive) setLive(row?.is_live ? row : null);
    };
    void check();
    const poll = setInterval(() => void check(), 3000);
    const channel = supabase
      .channel("live_now")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_now" }, () => void check())
      .subscribe();
    return () => {
      alive = false;
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, []);

  const key = live ? `${live.started_at}` : "";
  useEffect(() => {
    const video = videoRef.current;
    if (!live || !video) return;
    let hls: { destroy: () => void } | null = null;
    let cancelled = false;
    const src = live.hls_url;
    if (!src) return;
    const play = () =>
      void video.play().catch(() => {
        video.muted = true;
        void video.play().catch(() => {});
      });
    void (async () => {
      // Pure HLS: Cloudflare transcodes the Director feed; buffering keeps playback smooth.
      const { default: Hls } = await import("hls.js");
      if (cancelled) return;
      if (Hls.isSupported()) {
        const h = new Hls({
          lowLatencyMode: false,
          liveSyncDurationCount: 3,
          maxBufferLength: 20,
          backBufferLength: 10,
        });
        h.on(Hls.Events.ERROR, (_e, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) setTimeout(() => h.startLoad(), 2000);
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) h.recoverMediaError();
        });
        h.loadSource(src);
        h.attachMedia(video);
        h.on(Hls.Events.MANIFEST_PARSED, play);
        hls = h;
      } else {
        video.src = src;
        play();
      }
    })();
    return () => {
      cancelled = true;
      hls?.destroy();
      video.removeAttribute("src");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!live) setMini(false);
  }, [live]);

  if (!live) return null;

  return (
    <div
      className={
        mini
          ? "fixed bottom-24 right-3 z-[9999] h-[90px] w-[160px] overflow-hidden rounded-lg bg-black shadow-2xl"
          : "fixed inset-0 z-[9999] bg-black"
      }
      onClick={mini ? () => setMini(false) : undefined}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        controls={!mini}
        className="size-full object-contain"
      />
      {mini ? (
        <span className="absolute left-1 top-1 flex items-center gap-1 rounded bg-destructive px-1 text-[0.55rem] font-black text-destructive-foreground">
          LIVE <Maximize2 className="size-3" />
        </span>
      ) : (
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
          <span className="flex items-center gap-2 rounded-full bg-destructive px-3 py-1 text-xs font-black text-destructive-foreground">
            <span className="size-2 animate-pulse rounded-full bg-destructive-foreground" /> LIVE NOW
          </span>
          <button
            type="button"
            aria-label="Minimize live"
            onClick={() => setMini(true)}
            className="grid size-9 place-items-center rounded-full bg-background/30 text-foreground backdrop-blur"
          >
            <X className="size-5" />
          </button>
        </div>
      )}
    </div>
  );
}
