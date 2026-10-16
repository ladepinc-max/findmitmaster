import { useEffect, useRef, useState } from "react";
import { adVideoUrl, useFolderAds } from "@/lib/tv-ads";
import { cn } from "@/lib/utils";

type Phase = "lesson" | "brb" | "ads" | "welcome";

/**
 * Sits over a lesson player. Every ad_interval_minutes it pauses the lesson,
 * shows "We'll Be Right Back", plays the folder's published ads, then "Welcome Back".
 * Also renders the published moving-text ticker (hidden during breaks).
 */
export function AdBreakOverlay({
  folderId,
  lessonRef,
  active,
}: {
  folderId: string;
  lessonRef: React.RefObject<HTMLVideoElement | null>;
  active: boolean;
}) {
  const { settings, ads } = useFolderAds(folderId);
  const [phase, setPhase] = useState<Phase>("lesson");
  const [adIndex, setAdIndex] = useState(0);
  const [adSrc, setAdSrc] = useState<string | null>(null);
  const breakAds = useRef<typeof ads>([]);
  const adRef = useRef<HTMLVideoElement | null>(null);

  // Schedule the next break.
  useEffect(() => {
    if (!active || phase !== "lesson" || !settings || !ads.length) return;
    const ms = Math.max(1, settings.ad_interval_minutes) * 60_000;
    const t = window.setTimeout(() => {
      const n = Math.max(1, settings.ads_per_break);
      const start = Math.floor(Math.random() * ads.length);
      breakAds.current = Array.from({ length: Math.min(n, ads.length) }, (_, i) => ads[(start + i) % ads.length]!);
      lessonRef.current?.pause();
      setAdIndex(0);
      setPhase("brb");
    }, ms);
    return () => window.clearTimeout(t);
  }, [active, phase, settings, ads, lessonRef]);

  useEffect(() => {
    if (phase === "brb") {
      const t = window.setTimeout(() => setPhase("ads"), 3000);
      return () => window.clearTimeout(t);
    }
    if (phase === "welcome") {
      const t = window.setTimeout(() => {
        setPhase("lesson");
        void lessonRef.current?.play().catch(() => {});
      }, 3000);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [phase, lessonRef]);

  useEffect(() => {
    if (phase !== "ads") return;
    const ad = breakAds.current[adIndex];
    if (!ad) {
      setPhase("welcome");
      return;
    }
    let alive = true;
    void adVideoUrl(ad.video_url).then((u) => {
      if (!alive) return;
      if (u) setAdSrc(u);
      else setAdIndex((i) => i + 1);
    });
    return () => {
      alive = false;
    };
  }, [phase, adIndex]);


  const nextAd = () => {
    setAdSrc(null);
    setAdIndex((i) => i + 1);
  };

  const showTicker =
    phase === "lesson" && settings?.moving_text_published && settings.moving_text_enabled && settings.moving_text.trim();

  return (
    <>
      {showTicker ? (
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 z-20 overflow-hidden bg-destructive/90 py-1",
            settings!.moving_text_position === "top" ? "top-12" : "bottom-16",
          )}
        >
          <p
            key={settings!.moving_text + settings!.moving_text_speed}
            className="animate-marquee whitespace-nowrap text-xs font-bold text-destructive-foreground"
            style={{ animationDuration: `${Math.max(5, settings!.moving_text_speed)}s` }}
          >
            {settings!.moving_text}
          </p>
        </div>
      ) : null}

      {phase !== "lesson" ? (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black">
          {phase === "ads" && adSrc ? (
            <>
              <video
                ref={adRef}
                key={adSrc}
                src={adSrc}
                autoPlay
                playsInline
                onEnded={nextAd}
                onError={nextAd}
                className="size-full object-contain"
              />
              <span className="absolute left-2 top-2 rounded bg-accent px-2 py-0.5 text-[0.6rem] font-black text-accent-foreground">
                AD {adIndex + 1}/{breakAds.current.length}
              </span>
            </>
          ) : phase === "brb" ? (
            <p className="animate-pulse font-display text-2xl font-black text-create-ink">We'll Be Right Back</p>
          ) : phase === "welcome" ? (
            <p className="animate-pulse font-display text-2xl font-black text-primary">Welcome Back</p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
