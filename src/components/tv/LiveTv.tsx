import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Heart, Lock, MessageCircle, Radio, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMediaUrl, formatCount } from "@/lib/media";
import { cn } from "@/lib/utils";
import {
  TV_LABELS,
  fakeViewers,
  formatClock,
  formatCountdown,
  getLivePosition,
  isOnAir,
  resolveLiveSlot,
  secondsUntilStart,
  type TvChannelState,
} from "@/lib/tv-live";
import { toast } from "sonner";
import { AdBreakOverlay } from "@/components/tv/AdBreakOverlay";
import { useHls360, cfThumbnail } from "@/lib/hls360";

/** Ticks once a second so every live surface re-computes its position together. */
function useLiveTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
}

interface LiveSurfaceProps {
  state: TvChannelState;
  muted: boolean;
  className?: string;
  /** Home cards pass true: show a still frame only, never decode video. */
  posterOnly?: boolean;
  /** Called when the browser refuses to start playback (usually because of sound). */
  onBlocked?: () => void;
}


/**
 * Plays whatever the channel schedule says is on air right now.
 * Seeking is blocked, but the live position is only synced once per source
 * so playback never gets interrupted by repeated re-buffering.
 */
function LiveSurface({ state, muted, className, posterOnly = false, onBlocked }: LiveSurfaceProps) {
  const { channel, clips } = state;
  const elapsed = channel ? getLivePosition(channel) : 0;
  const slot = isOnAir(channel) ? resolveLiveSlot(clips, elapsed) : null;
  // Lessons streamed through Cloudflare play as light 360p HLS; older uploads
  // keep playing straight from storage.
  const hlsUrl = posterOnly ? null : (slot?.clip.hls_url ?? null);
  const storageUrl = useMediaUrl(posterOnly || hlsUrl ? null : (slot?.clip.media_path ?? null));
  const url = hlsUrl ?? storageUrl;
  const storedPoster = useMediaUrl(slot?.clip.thumbnail_path ?? null, 640);
  const poster = storedPoster ?? cfThumbnail(slot?.clip.media_path);
  const ref = useRef<HTMLVideoElement | null>(null);
  const offsetRef = useRef(0);
  offsetRef.current = slot?.offset ?? 0;
  const blockedRef = useRef(onBlocked);
  blockedRef.current = onBlocked;

  // Sync to the live point once when the source loads, then leave playback alone.
  useEffect(() => {
    const el = ref.current;
    if (!el || !url) return;
    const blockSeek = () => {
      // Only fight back against user-driven scrubbing far from the live point.
      const target = offsetRef.current;
      if (el.currentTime < target - 30) el.currentTime = target;
    };
    const onLoaded = () => {
      el.currentTime = offsetRef.current;
      void el.play().catch(() => blockedRef.current?.());
    };
    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("seeking", blockSeek);
    return () => {
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("seeking", blockSeek);
    };
  }, [url]);

  // Cloudflare lessons: attach the HLS stream and pin it to 360p.
  useHls360(ref, hlsUrl, onBlocked);

  if (posterOnly) {
    return (
      <div className={cn("relative overflow-hidden bg-black", className)}>
        {poster ? (
          <img src={poster} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-xs text-create-copy">
            {isOnAir(channel)
              ? channel?.subject || "Class in session"
              : channel?.is_live && channel.scheduled_start
                ? `Starts in ${formatCountdown(secondsUntilStart(channel))}`
                : "No live class — waiting for next broadcast"}
          </div>
        )}
      </div>
    );
  }

  if (!url) {
    return (
      <div className={cn("grid place-items-center bg-black text-xs text-create-copy", className)}>
        {isOnAir(channel)
          ? "Tuning in…"
          : channel?.is_live && channel.scheduled_start
            ? `Starts in ${formatCountdown(secondsUntilStart(channel))}`
            : "No live class — waiting for next broadcast"}
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden bg-black", className)}>
    <video
      ref={ref}
      {...(hlsUrl ? {} : { src: url })}
      {...(poster ? { poster } : {})}
      autoPlay
      muted={muted}
      playsInline
      preload="auto"
      controls={false}
      disablePictureInPicture
      controlsList="nodownload noplaybackrate noremoteplayback"
      className="size-full bg-black object-cover"
    />
    <AdBreakOverlay folderId={state.category} lessonRef={ref} active={Boolean(slot)} />
    </div>
  );
}


export function LiveTvCard({
  state,
  onJoin,
}: {
  state: TvChannelState;
  onJoin: (category: TvChannelState["category"]) => void;
}) {
  useLiveTick();
  const { channel, clips, category } = state;
  const live = Boolean(isOnAir(channel) && clips.length);
  const scheduled = Boolean(channel?.is_live && !live && channel?.scheduled_start);
  const elapsed = channel ? getLivePosition(channel) : 0;
  const total = channel?.total_seconds ?? 0;
  const progress = total > 0 ? Math.min(100, (elapsed / total) * 100) : 0;

  return (
    <article className="overflow-hidden rounded-2xl border border-create-line bg-surface">
      <div className="relative aspect-video w-full">
        <LiveSurface state={state} muted posterOnly className="h-full w-full" />
        {live ? (
          <>
            <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-destructive px-2 py-0.5 text-[0.6rem] font-bold text-destructive-foreground">
              <span className="size-1.5 animate-pulse rounded-full bg-destructive-foreground" /> LIVE
            </span>
            <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 text-[0.6rem] font-semibold text-create-ink">
              <Eye className="size-3" /> {formatCount(fakeViewers(channel!))}
            </span>
          </>
        ) : (
          <span className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-[0.6rem] font-bold text-create-copy">
            {scheduled ? `STARTS IN ${formatCountdown(secondsUntilStart(channel!))}` : "OFFLINE"}
          </span>
        )}
      </div>
      <div className="space-y-2 p-3">
        <p className="font-display text-sm font-bold text-create-ink">{TV_LABELS[category]}</p>
        <p className="truncate text-xs text-create-copy">
          {live
            ? channel?.subject || "Class in session"
            : scheduled
              ? `Scheduled — starts in ${formatCountdown(secondsUntilStart(channel!))}`
              : "No live class — waiting for next broadcast"}
        </p>
        {live ? (
          <>
            <div className="h-1 w-full overflow-hidden rounded-full bg-create-line">
              <div className="h-full rounded-full bg-destructive" style={{ width: `${progress}%` }} />
            </div>
            <p className="flex items-center gap-2 text-[0.65rem] text-create-copy">
              <span>Class in progress {formatClock(elapsed)} / {formatClock(total)}</span>
              <span className="flex items-center gap-1"><Lock className="size-3" /> Controls disabled</span>
            </p>
            <Button size="sm" className="w-full" onClick={() => onJoin(category)}>
              <Radio className="size-4" /> Join Live
            </Button>
          </>
        ) : (
          <Button size="sm" variant="secondary" className="w-full" disabled>
            {scheduled ? `Starts in ${formatCountdown(secondsUntilStart(channel!))}` : "Channel offline"}
          </Button>
        )}
      </div>
    </article>
  );
}

/** Full-screen TikTok-style live view — no seek bar, no rewind. */
export function LiveTvPlayer({ state, onClose }: { state: TvChannelState; onClose: () => void }) {
  useLiveTick();
  const { channel, clips, category } = state;
  const elapsed = channel ? getLivePosition(channel) : 0;
  const live = Boolean(isOnAir(channel) && clips.length);
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    toast.info("🔴 LIVE — You joined mid-class. Rewind disabled.");
  }, [category]);

  const total = channel?.total_seconds ?? 0;
  const progress = useMemo(() => (total > 0 ? Math.min(100, (elapsed / total) * 100) : 0), [elapsed, total]);

  return (
    <div className="fixed inset-0 z-[120] bg-black">
      <LiveSurface state={state} muted={false} className="h-full w-full" />

      <div className="absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent p-3">
        <Button size="icon" variant="ghost" className="text-create-ink" onClick={onClose} aria-label="Leave live">
          <X />
        </Button>
        <p className="font-display text-sm font-bold text-create-ink">{TV_LABELS[category]}</p>
        {live ? (
          <span className="flex items-center gap-1 rounded-md bg-destructive px-2 py-0.5 text-[0.6rem] font-bold text-destructive-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-destructive-foreground" /> LIVE NOW
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 text-[0.65rem] font-semibold text-create-ink">
          <Eye className="size-3" /> {channel ? formatCount(fakeViewers(channel)) : 0}
        </span>
      </div>

      <div className="absolute bottom-24 right-3 flex flex-col items-center gap-5">
        <button type="button" onClick={() => setLiked((v) => !v)} className="flex flex-col items-center text-create-ink" aria-label="Like">
          <Heart className={cn("size-7", liked && "fill-destructive text-destructive")} />
          <span className="text-[0.6rem]">Like</span>
        </button>
        <button type="button" className="flex flex-col items-center text-create-ink" aria-label="Comment" onClick={() => toast.info("Live chat opens soon")}>
          <MessageCircle className="size-7" />
          <span className="text-[0.6rem]">Comment</span>
        </button>
        <button
          type="button"
          className="flex flex-col items-center text-create-ink"
          aria-label="Share"
          onClick={() => {
            void navigator.clipboard?.writeText(window.location.href);
            toast.success("Live link copied");
          }}
        >
          <Share2 className="size-7" />
          <span className="text-[0.6rem]">Share</span>
        </button>
      </div>

      <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/80 to-transparent p-4">
        <p className="text-xs font-bold text-create-ink">🔴 LIVE {formatClock(elapsed)}</p>
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/25">
          <div className="h-full rounded-full bg-destructive" style={{ width: `${progress}%` }} />
        </div>
        <p className="flex items-center gap-1 text-[0.65rem] text-create-copy">
          <Lock className="size-3" /> Controls disabled — you joined mid-class, rewind is off.
        </p>
      </div>
    </div>
  );
}

/**
 * The viewer's chosen channel, playing full-screen on Home with sound.
 * No join step: the lesson simply runs whenever the channel is on air.
 */
export function LiveTvStage({ state }: { state: TvChannelState }) {
  useLiveTick();
  const { channel, clips, category } = state;
  const live = Boolean(isOnAir(channel) && clips.length);
  const scheduled = Boolean(channel?.is_live && !live && channel?.scheduled_start);
  const elapsed = channel ? getLivePosition(channel) : 0;
  const total = channel?.total_seconds ?? 0;
  const progress = total > 0 ? Math.min(100, (elapsed / total) * 100) : 0;
  const [blocked, setBlocked] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const startWithSound = () => {
    const el = wrapRef.current?.querySelector("video");
    if (!el) return;
    el.muted = false;
    void el.play().catch(() => {});
    setBlocked(false);
  };

  if (!live) {
    return (
      <div className="grid min-h-[60vh] place-items-center rounded-2xl border border-create-line bg-surface p-6 text-center">
        <div className="space-y-2">
          <p className="font-display text-base font-bold text-create-ink">{TV_LABELS[category]}</p>
          <p className="text-sm text-create-copy">
            {scheduled
              ? `Next lesson starts in ${formatCountdown(secondsUntilStart(channel!))}`
              : "No lesson playing right now. It starts here as soon as a teacher uploads."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative overflow-hidden rounded-2xl bg-black">
      <LiveSurface
        state={state}
        muted={false}
        className="aspect-[9/16] max-h-[78vh] w-full"
        onBlocked={() => setBlocked(true)}
      />

      <div className="absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent p-3">
        <p className="font-display text-sm font-bold text-create-ink">{TV_LABELS[category]}</p>
        <span className="flex items-center gap-1 rounded-md bg-destructive px-2 py-0.5 text-[0.6rem] font-bold text-destructive-foreground">
          <span className="size-1.5 animate-pulse rounded-full bg-destructive-foreground" /> LIVE
        </span>
        <span className="ml-auto flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 text-[0.65rem] font-semibold text-create-ink">
          <Eye className="size-3" /> {channel ? formatCount(fakeViewers(channel)) : 0}
        </span>
      </div>

      {blocked ? (
        <button
          type="button"
          onClick={startWithSound}
          className="absolute inset-0 grid place-items-center bg-black/60 text-sm font-bold text-create-ink"
        >
          Tap to play with sound
        </button>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/80 to-transparent p-4">
        <p className="truncate text-xs font-bold text-create-ink">
          {channel?.subject || "Class in session"} · {formatClock(elapsed)}
        </p>
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/25">
          <div className="h-full rounded-full bg-destructive" style={{ width: `${progress}%` }} />
        </div>
        <p className="flex items-center gap-1 text-[0.65rem] text-create-copy">
          <Lock className="size-3" /> Live lesson — rewind is off.
        </p>
      </div>
    </div>
  );
}
