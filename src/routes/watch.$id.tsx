import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Eye, Heart, Share2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { PartnerTv } from "./stations";

export const Route = createFileRoute("/watch/$id")({
  head: () => ({
    meta: [
      { title: "Watch Live — FindMit TV" },
      { name: "description", content: "Watch a partner TV station live on FindMit." },
      { property: "og:title", content: "Watch Live — FindMit TV" },
      { property: "og:description", content: "Watch a partner TV station live on FindMit." },
      { property: "og:type", content: "video.other" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WatchPage,
});

function youtubeId(url: string): string | null {
  const m =
    url.match(/[?&]v=([\w-]{6,})/) ||
    url.match(/youtu\.be\/([\w-]{6,})/) ||
    url.match(/youtube\.com\/embed\/([\w-]{6,})/) ||
    url.match(/youtube\.com\/live\/([\w-]{6,})/);
  return m?.[1] ?? null;
}

function WatchPage() {
  const { id } = useParams({ from: "/watch/$id" });
  const [station, setStation] = useState<PartnerTv | null>(null);
  const [loading, setLoading] = useState(true);
  const [favorite, setFavorite] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("partner_tvs").select("*").eq("id", id).maybeSingle();
      if (cancelled) return;
      setStation((data as PartnerTv | null) ?? null);
      setLoading(false);
      if (data) await supabase.rpc("increment_partner_tv_viewers", { _id: id });
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const url = station?.live_stream_url ?? "";
  const ytId = url ? youtubeId(url) : null;
  const isHls = !ytId && /\.m3u8(\?|$)/i.test(url);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isHls) return;
    let destroy: (() => void) | undefined;
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      void video.play().catch(() => {});
    } else {
      void (async () => {
        const Hls = (await import("hls.js")).default;
        if (!Hls.isSupported()) return;
        const hls = new Hls();
        hls.loadSource(url);
        hls.attachMedia(video);
        destroy = () => hls.destroy();
        void video.play().catch(() => {});
      })();
    }
    return () => destroy?.();
  }, [isHls, url]);

  const share = async () => {
    const link = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) {
      try {
        await navigator.share({ title: station?.name ?? "FindMit TV", url: link });
        return;
      } catch {
        /* dismissed */
      }
    }
    await navigator.clipboard.writeText(link);
    toast.success("Link copied");
  };

  return (
    <div className="min-h-screen bg-[#121212] text-white">
      <div className="flex items-center gap-2 px-3 py-3">
        <Link to="/stations" className="rounded-full p-2 hover:bg-white/10" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <span className="truncate font-semibold">{station?.name ?? "Loading…"}</span>
      </div>

      <div className="relative aspect-video w-full bg-black">
        {ytId ? (
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube.com/embed/${ytId}?autoplay=1`}
            title={station?.name ?? "Live"}
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : url ? (
          <video
            ref={videoRef}
            {...(isHls ? {} : { src: url })}
            autoPlay
            playsInline
            controls
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : null}

        <span className="absolute left-3 top-3 rounded bg-red-600 px-2 py-0.5 text-[11px] font-bold">
          LIVE
        </span>
        <span className="absolute right-3 top-3 flex items-center gap-1 rounded bg-black/60 px-2 py-0.5 text-[11px]">
          <Eye className="h-3.5 w-3.5" />
          {(station?.viewer_count ?? 0).toLocaleString()}
        </span>
      </div>

      {loading ? (
        <p className="p-6 text-center text-sm text-white/40">Loading station…</p>
      ) : !station ? (
        <p className="p-6 text-center text-sm text-white/40">Station not found.</p>
      ) : (
        <div className="space-y-4 p-4 pb-28">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-black">
              {station.logo_url ? (
                <img
                  src={station.logo_url}
                  alt={station.name}
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-bold">{station.name}</p>
              <p className="truncate text-xs text-white/50">
                {station.category}
                {station.region ? ` • ${station.region}` : ""}
              </p>
            </div>
          </div>

          {station.description ? (
            <p className="text-sm leading-relaxed text-white/70">{station.description}</p>
          ) : null}

          <div className="flex gap-3">
            <button
              onClick={share}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#1E1E1E] py-3 text-sm font-semibold"
            >
              <Share2 className="h-4 w-4" /> Share
            </button>
            <button
              onClick={() => setFavorite((v) => !v)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold ${
                favorite ? "bg-red-600" : "bg-[#1E1E1E]"
              }`}
            >
              <Heart className={`h-4 w-4 ${favorite ? "fill-current" : ""}`} /> Favorite
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
