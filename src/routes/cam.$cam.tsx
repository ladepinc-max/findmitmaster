import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FIXED_STUDIO_ROOM } from "@/lib/studio-room";

export const Route = createFileRoute("/cam/$cam")({
  head: () => ({
    meta: [
      { title: "FindMit Studio Camera — join the live studio" },
      {
        name: "description",
        content: "Open this link on a phone to turn it into a FindMit studio camera. No app, no login.",
      },
      { property: "og:title", content: "FindMit Studio Camera" },
      {
        property: "og:description",
        content: "Turn any phone into a FindMit studio camera with one link.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FixedCamPage,
});

function FixedCamPage() {
  const { cam: camParam } = Route.useParams();
  const cam = Math.min(3, Math.max(1, Number(camParam) || 1));
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState("Starting camera…");
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let disposed = false;
    let stream: MediaStream | null = null;
    let peer: { destroy: () => void } | null = null;

    const run = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 360, max: 480 },
            height: { ideal: 640, max: 854 },
            frameRate: { ideal: 24, max: 30 },
            facingMode: { ideal: "environment" },
          },
          audio: true,
        });
        if (disposed) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
        setStatus("Connecting to the studio…");

        const { default: Peer } = await import("peerjs");
        if (disposed) return;
        const p = new Peer(
          `findmit-cam-${FIXED_STUDIO_ROOM}-${cam}-${Math.random().toString(36).slice(2, 7)}`,
        );
        peer = p;
        p.on("open", () => {
          const call = p.call(`findmit-director-${FIXED_STUDIO_ROOM}`, stream as MediaStream, {
            metadata: { cam },
          });
          call.on("close", () => setConnected(false));
          setConnected(true);
          setStatus(`Camera ${cam} is live to the studio`);
        });
        p.on("error", (err: Error) => {
          setConnected(false);
          setStatus(`Could not reach the studio: ${err.message}`);
        });
      } catch {
        setStatus("Allow camera access on this phone to go live.");
      }
    };

    void run();
    return () => {
      disposed = true;
      peer?.destroy();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [cam]);

  return (
    <main className="fixed inset-0 bg-black">
      <video ref={videoRef} autoPlay playsInline muted className="size-full object-cover" />
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
        <span className="rounded-full bg-black/60 px-3 py-1 text-sm font-black text-white">
          CAM {cam}
        </span>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold text-white ${connected ? "bg-emerald-600" : "bg-black/60"}`}
        >
          {connected ? "CONNECTED" : "WAITING"}
        </span>
      </div>
      <p className="absolute inset-x-0 bottom-6 px-6 text-center text-sm text-white/80">{status}</p>
    </main>
  );
}
