import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { fetchLiveNow } from "@/lib/cloudflare-live";
import { useHls360 } from "@/lib/hls360";

export const Route = createFileRoute("/live/$channel")({
  head: () => ({
    meta: [
      { title: "FindMit Live — watch the broadcast" },
      {
        name: "description",
        content: "Watch the live FindMit multi-camera broadcast in full portrait video.",
      },
      { property: "og:title", content: "FindMit Live" },
      { property: "og:description", content: "Watch the live FindMit broadcast." },
      { property: "og:type", content: "video.other" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LiveViewerPage,
});

/**
 * Pure Cloudflare HLS viewer: the Director publishes one copy to Cloudflare,
 * which fans it out as cached 360p segments to every watcher.
 */
function LiveViewerPage() {
  const { channel } = Route.useParams();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [status, setStatus] = useState("Connecting to the broadcast…");

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const row = await fetchLiveNow().catch(() => null);
      if (!alive) return;
      if (row?.is_live && row.hls_url) {
        setSrc(row.hls_url);
        setStatus("");
      } else {
        setSrc(null);
        setStatus("Waiting for the broadcast to start…");
      }
    };
    void check();
    const poll = window.setInterval(() => void check(), 5000);
    return () => {
      alive = false;
      window.clearInterval(poll);
    };
  }, []);

  useHls360(videoRef, src);

  return (
    <main className="fixed inset-0 bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        controls={false}
        className="size-full object-cover"
      />
      {status ? (
        <p className="absolute inset-x-0 bottom-10 px-6 text-center text-sm text-white/80">{status}</p>
      ) : null}
      <span className="absolute left-4 top-4 rounded-full bg-black/60 px-3 py-1 text-xs font-black text-white">
        LIVE · {channel}
      </span>
    </main>
  );
}
