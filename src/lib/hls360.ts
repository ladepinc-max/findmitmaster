import { useEffect } from "react";
import Hls from "hls.js";

/**
 * Attaches a Cloudflare Stream HLS manifest to a <video> and locks quality to
 * roughly 360p, so playback starts fast and stays light on mobile data.
 * Safari plays HLS natively, so there we only set the source.
 */
export function useHls360(
  ref: React.RefObject<HTMLVideoElement | null>,
  src: string | null,
  onBlocked?: () => void,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !src) return;

    // Safari / iOS: native HLS.
    if (!Hls.isSupported()) {
      el.src = src;
      void el.play().catch(() => onBlocked?.());
      return;
    }

    const hls = new Hls({
      // Small buffers = quick start and low memory on cheap Android phones.
      maxBufferLength: 12,
      maxMaxBufferLength: 30,
      backBufferLength: 10,
      capLevelToPlayerSize: false,
      startLevel: -1,
      enableWorker: true,
      lowLatencyMode: false,
    });

    const pick360 = () => {
      const levels = hls.levels ?? [];
      if (!levels.length) return;
      // Closest rendition at or below 360p, otherwise the smallest available.
      let best = -1;
      let bestHeight = -1;
      levels.forEach((level, index) => {
        const height = level.height || 0;
        if (height <= 380 && height > bestHeight) {
          best = index;
          bestHeight = height;
        }
      });
      if (best < 0) {
        best = levels.reduce(
          (lowest, level, index) =>
            (level.height || 0) < (levels[lowest]!.height || 0) ? index : lowest,
          0,
        );
      }
      hls.currentLevel = best;
      hls.autoLevelCapping = best;
    };

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      pick360();
      void el.play().catch(() => onBlocked?.());
    });
    hls.on(Hls.Events.LEVEL_LOADED, pick360);
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
      else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
    });

    hls.loadSource(src);
    hls.attachMedia(el);

    return () => hls.destroy();
  }, [ref, src, onBlocked]);
}

/** Cloudflare Stream poster image for a stored `cf:<uid>` lesson. */
export function cfThumbnail(mediaPath: string | null | undefined) {
  if (!mediaPath?.startsWith("cf:")) return null;
  return `https://videodelivery.net/${mediaPath.slice(3)}/thumbnails/thumbnail.jpg?height=360`;
}
