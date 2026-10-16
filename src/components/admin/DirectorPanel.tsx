import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Radio, Scissors, SunMoon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FIXED_CAM_URLS, FIXED_STUDIO_ROOM } from "@/lib/studio-room";
import { loadLiveConfig, saveLiveConfig, setLiveNow, whipPublish } from "@/lib/cloudflare-live";
import { ensureLiveInput } from "@/lib/cf-whip";

const CAMS = [1, 2, 3] as const;
type CamId = (typeof CAMS)[number];

const W = 720;
const H = 1280;
const PW = 360;
const PH = 640;
const FADE_MS = 600;

function drawCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  alpha: number,
  cw = W,
  ch = H,
) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  const scale = Math.max(cw / vw, ch / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  ctx.globalAlpha = alpha;
  ctx.drawImage(video, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  ctx.globalAlpha = 1;
}

/** Live studio switcher: phone cameras join by QR, director cuts between them. */
export function DirectorPanel({ roomId: roomProp }: { roomId?: string | undefined } = {}) {
  const [roomId] = useState(() => roomProp ?? Math.random().toString(36).slice(2, 8).toUpperCase());
  const [qr, setQr] = useState<Record<CamId, string>>({ 1: "", 2: "", 3: "" });
  const [ready, setReady] = useState<Record<CamId, boolean>>({ 1: false, 2: false, 3: false });
  const [program, setProgram] = useState<CamId>(1);
  const [preview, setPreview] = useState<CamId>(2);
  const [live, setLive] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [copied, setCopied] = useState<CamId | null>(null);



  const videoRefs = useRef<Record<CamId, HTMLVideoElement | null>>({ 1: null, 2: null, 3: null });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const programRef = useRef<CamId>(1);
  const fadeRef = useRef<{ from: CamId; start: number } | null>(null);
  const logoRef = useRef<HTMLImageElement | null>(null);

  const camUrl = useCallback((cam: CamId) => FIXED_CAM_URLS[cam] ?? "", []);

  const copyCamUrl = async (cam: CamId) => {
    try {
      await navigator.clipboard.writeText(camUrl(cam));
      setCopied(cam);
      setTimeout(() => setCopied((c) => (c === cam ? null : c)), 1500);
    } catch {
      toast.error("Could not copy the link");
    }
  };

  const connectedCount = useMemo(() => CAMS.filter((c) => ready[c]).length, [ready]);

  // QR codes for each camera link.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const QR = await import("qrcode");
      const entries = await Promise.all(
        CAMS.map(async (cam) => [cam, await QR.toDataURL(camUrl(cam), { width: 240, margin: 1 })] as const),
      );
      if (!cancelled) setQr(Object.fromEntries(entries) as Record<CamId, string>);
    })();
    return () => {
      cancelled = true;
    };
  }, [camUrl]);

  // Director peers: answer incoming camera calls (own room + fixed public room).
  useEffect(() => {
    const peers: { destroy: () => void }[] = [];
    let disposed = false;
    void (async () => {
      const { default: Peer } = await import("peerjs");
      if (disposed) return;
      const rooms = Array.from(new Set([roomId, FIXED_STUDIO_ROOM]));
      for (const room of rooms) {
        const p = new Peer(`findmit-director-${room}`);
        peers.push(p);
        p.on("call", (call) => {
          const cam = Number((call.metadata as { cam?: number } | null)?.cam ?? 1) as CamId;
          call.answer();
          call.on("stream", (stream: MediaStream) => {
            const el = videoRefs.current[cam];
            if (el) {
              el.srcObject = stream;
              void el.play().catch(() => {});
            }
            setReady((prev) => ({ ...prev, [cam]: true }));
          });
          call.on("close", () => setReady((prev) => ({ ...prev, [cam]: false })));
        });
        p.on("error", (err: Error) => {
          if (/unavailable-id|taken/i.test(err.message)) return;
          toast.error(`Studio link error: ${err.message}`);
        });
      }
      if (disposed) peers.forEach((p) => p.destroy());
    })();
    return () => {
      disposed = true;
      peers.forEach((p) => p.destroy());
    };
  }, [roomId]);

  // Program canvas compositor (1080x1920 + logo).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const logo = new Image();
    logo.src = "/FindMit-Icon-Transparent-FINAL.png";
    logoRef.current = logo;

    let raf = 0;
    const loop = () => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      const current = videoRefs.current[programRef.current];
      const fade = fadeRef.current;
      if (fade) {
        const t = Math.min(1, (performance.now() - fade.start) / FADE_MS);
        const prev = videoRefs.current[fade.from];
        if (prev) drawCover(ctx, prev, 1);
        if (current) drawCover(ctx, current, t);
        if (t >= 1) fadeRef.current = null;
      } else if (current) {
        drawCover(ctx, current, 1);
      }
      if (logoRef.current?.complete) ctx.drawImage(logoRef.current, 28, 28, 96, 96);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ON AIR timer.
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [live]);

  const cut = () => {
    fadeRef.current = null;
    const from = program;
    programRef.current = preview;
    setProgram(preview);
    setPreview(from);
  };

  const fade = () => {
    fadeRef.current = { from: program, start: performance.now() };
    const from = program;
    programRef.current = preview;
    setProgram(preview);
    setPreview(from);
  };

  const cfRef = useRef<{ pc: RTCPeerConnection; tracks: MediaStreamTrack[] } | null>(null);

  const endBroadcast = async () => {
    const cf = cfRef.current;
    cf?.pc.close();
    cf?.tracks.forEach((t) => t.stop());
    cfRef.current = null;
    setLive(false);
    try {
      await setLiveNow({ is_live: false });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not end the broadcast");
    }
  };

  const publish = async () => {
    if (live) {
      await endBroadcast();
      return;
    }
    if (connectedCount === 0) {
      toast.error("Connect at least one camera before publishing");
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    setPublishing(true);
    try {
      // Ask Cloudflare for the studio's live input (reused between broadcasts).
      const saved = await loadLiveConfig();
      const input = await ensureLiveInput("FindMit Studio", saved?.input_id ?? null);
      if (!input.whipUrl || !input.hlsUrl) throw new Error("Cloudflare did not return a live input");
      const cfg = {
        whip_url: input.whipUrl,
        hls_url: input.hlsUrl,
        whep_url: input.whepUrl ?? "",
        input_id: input.uid,
      };
      await saveLiveConfig(cfg).catch(() => {});
      const stream = canvas.captureStream(30);
      const tracks: MediaStreamTrack[] = [...stream.getVideoTracks()];
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        mic.getAudioTracks().forEach((t) => {
          stream.addTrack(t);
          tracks.push(t);
        });
      } catch {
        toast.message("Microphone unavailable — broadcasting video only");
      }
      const pc = await whipPublish(cfg.whip_url, stream);
      // Cap the master feed so Cloudflare ingest stays smooth on mobile data.
      for (const sender of pc.getSenders()) {
        if (sender.track?.kind !== "video") continue;
        const params = sender.getParameters();
        params.encodings = params.encodings?.length ? params.encodings : [{}];
        params.encodings[0]!.maxBitrate = 2_500_000;
        params.encodings[0]!.maxFramerate = 30;
        params.degradationPreference = "maintain-framerate";
        await sender.setParameters(params).catch(() => {});
      }
      cfRef.current = { pc, tracks };
      await setLiveNow({
        is_live: true,
        hls_url: cfg.hls_url,
        whep_url: cfg.whep_url,
        title: "🔴 LIVE",
        started_at: new Date().toISOString(),
      });
      setSeconds(0);
      setLive(true);
      toast.success("You're live on the Home tab");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start the broadcast");
    } finally {
      setPublishing(false);
    }
  };

  useEffect(
    () => () => {
      const cf = cfRef.current;
      if (cf) {
        cf.pc.close();
        cf.tracks.forEach((t) => t.stop());
        void setLiveNow({ is_live: false }).catch(() => {});
      }
    },
    [],
  );


  const clock = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-3">
        <div>
          <p className="text-sm font-black uppercase">
            {live ? "On air" : "Preview mode — private"}
          </p>
          <p className="text-xs text-muted-foreground">
            Room {roomId} · {connectedCount}/3 cameras connected
          </p>
        </div>
        {live ? (
          <Button
            variant="destructive"
            className="animate-pulse font-black"
            onClick={() => void publish()}
          >
            <Radio className="size-4" /> ON AIR {clock} — Tap to End
          </Button>
        ) : (
          <Button variant="destructive" disabled={publishing} onClick={() => void publish()}>
            {publishing ? "Starting…" : "Publish"}
          </Button>
        )}
      </div>



      {!live ? (
        <div className="grid grid-cols-3 gap-3">
          {CAMS.map((cam) => (
            <div key={cam} className="rounded-2xl border p-2 text-center">
              <p className="text-xs font-bold">CAM {cam}</p>
              {qr[cam] ? (
                <img src={qr[cam]} alt={`QR code to join as camera ${cam}`} className="mx-auto w-full" />
              ) : null}
              <p className="truncate text-[0.6rem] text-muted-foreground">{camUrl(cam)}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-1 w-full text-[0.65rem]"
                onClick={() => void copyCamUrl(cam)}
              >
                {copied === cam ? "Copied!" : "Copy"}
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        {CAMS.map((cam) => (
          <button
            key={cam}
            type="button"
            onClick={() => setPreview(cam)}
            className={`relative overflow-hidden rounded-xl border-2 bg-black ${
              program === cam
                ? "border-destructive"
                : preview === cam
                  ? "border-emerald-500"
                  : "border-transparent"
            }`}
            style={{ aspectRatio: "9 / 16" }}
          >
            <video
              ref={(el) => {
                videoRefs.current[cam] = el;
              }}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 size-full object-cover"
            />
            <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 text-[0.6rem] font-bold text-white">
              CAM {cam}
            </span>
            {!ready[cam] ? (
              <span className="absolute inset-0 grid place-items-center text-[0.65rem] text-white/70">
                waiting
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <div>
          <p className="mb-1 text-xs font-black uppercase text-destructive">Program</p>
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="mx-auto w-full max-w-[280px] rounded-xl bg-black"
            style={{ aspectRatio: "9 / 16" }}
          />
        </div>
        <div>
          <p className="mb-1 text-xs font-black uppercase text-emerald-600">Preview — CAM {preview}</p>
          <div
            className="mx-auto w-full max-w-[280px] overflow-hidden rounded-xl bg-black"
            style={{ aspectRatio: "9 / 16" }}
          >
            <PreviewMirror source={() => videoRefs.current[preview] ?? null} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={cut}>
            <Scissors className="size-4" /> CUT
          </Button>
          <Button className="flex-1" variant="secondary" onClick={fade}>
            <SunMoon className="size-4" /> FADE
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Mirrors the selected camera into the preview monitor without stealing its stream. */
function PreviewMirror({ source }: { source: () => HTMLVideoElement | null }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let raf = 0;
    const loop = () => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, PW, PH);
      const video = source();
      if (video) drawCover(ctx, video, 1, PW, PH);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [source]);
  return <canvas ref={ref} width={PW} height={PH} className="size-full" />;
}
