import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/cam/")({
  validateSearch: (search: Record<string, unknown>) => ({
    room: String(search["room"] ?? ""),
    cam: Number(search["cam"] ?? 1),
  }),
  head: () => ({
    meta: [
      { title: "FindMit Camera — join a live studio" },
      {
        name: "description",
        content: "Turn this phone into a studio camera for a FindMit live broadcast.",
      },
      { property: "og:title", content: "FindMit Camera" },
      { property: "og:description", content: "Turn this phone into a FindMit studio camera." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CamPage,
});

function CamPage() {
  const { room, cam } = Route.useSearch();
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
            width: { ideal: 1080 },
            height: { ideal: 1920 },
            frameRate: { ideal: 30 },
            facingMode: "environment",
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
        const p = new Peer(`findmit-cam-${room}-${cam}-${Math.random().toString(36).slice(2, 7)}`);
        peer = p;
        p.on("open", () => {
          const call = p.call(`findmit-director-${room}`, stream as MediaStream, {
            metadata: { cam },
          });
          call.on("stream", () => {});
          call.on("close", () => setConnected(false));
          setConnected(true);
          setStatus(`Camera ${cam} is live to the studio`);
        });
        p.on("error", (err: Error) => {
          setConnected(false);
          setStatus(`Could not reach the studio: ${err.message}`);
        });
      } catch {
        setStatus("Camera permission is required on this phone.");
      }
    };

    void run();
    return () => {
      disposed = true;
      peer?.destroy();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [room, cam]);

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
