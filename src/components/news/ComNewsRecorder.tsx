import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, RotateCcw, SwitchCamera, Video, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MAX_RECORD_SECONDS, RECORD_HEIGHT, RECORD_WIDTH, submitCommunityNews } from "@/lib/community-news";
import { loadNewsLogo, drawNewsWatermark, watermarkedVideoStream } from "@/lib/news-watermark";

type Captured = { blob: Blob; url: string; type: "video" | "photo"; seconds: number | null };

function pickMime() {
  const opts = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  return opts.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Full-screen in-app camera. No gallery: media can only be captured live here. */
export function ComNewsRecorder({ userId, onClose }: { userId: string; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const watermarkStop = useRef<(() => void) | null>(null);
  const logoRef = useRef<HTMLImageElement | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [mode, setMode] = useState<"video" | "photo">("video");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [captured, setCaptured] = useState<Captured | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [community, setCommunity] = useState("");
  const [sending, setSending] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [logoReady, setLogoReady] = useState(false);

  useEffect(() => {
    let active = true;
    void loadNewsLogo().then((logo) => { if (active) { logoRef.current = logo; setLogoReady(true); } }).catch(() => setCamError("FindMit logo could not load. Reopen the recorder to try again."));
    return () => { active = false; recRef.current?.state === "recording" && recRef.current.stop(); watermarkStop.current?.(); };
  }, []);

  useEffect(() => {
    if (captured) return;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: facing, width: { ideal: RECORD_WIDTH, max: RECORD_WIDTH }, height: { ideal: RECORD_HEIGHT, max: RECORD_HEIGHT } },
        audio: true,
      })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCamError(null);
      })
      .catch(() => setCamError("Allow camera and microphone access to report news."));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing, captured]);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt.current) / 1000);
      setElapsed(s);
      if (s >= MAX_RECORD_SECONDS) stopRecording();
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  useEffect(() => () => { if (captured) URL.revokeObjectURL(captured.url); }, [captured]);

  function startRecording() {
    const stream = streamRef.current;
    const video = videoRef.current;
    const logo = logoRef.current;
    if (!stream || !video || !logo) return;
    let capture: ReturnType<typeof watermarkedVideoStream>;
    try { capture = watermarkedVideoStream(video, stream, logo); }
    catch { toast.error("This browser cannot record watermarked news. Try a supported browser."); return; }
    watermarkStop.current = capture.stop;
    const mime = pickMime();
    const rec = new MediaRecorder(capture.stream, mime ? { mimeType: mime, videoBitsPerSecond: 700_000 } : { videoBitsPerSecond: 700_000 });
    chunks.current = [];
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = () => {
      watermarkStop.current?.();
      watermarkStop.current = null;
      const blob = new Blob(chunks.current, { type: rec.mimeType || "video/webm" });
      const seconds = Math.min(MAX_RECORD_SECONDS, Math.round((Date.now() - startedAt.current) / 1000));
      setCaptured({ blob, url: URL.createObjectURL(blob), type: "video", seconds });
    };
    startedAt.current = Date.now();
    setElapsed(0);
    rec.start(1000);
    recRef.current = rec;
    setRecording(true);
  }

  function stopRecording() {
    recRef.current?.state === "recording" && recRef.current.stop();
    setRecording(false);
  }

  function takePhoto() {
    const v = videoRef.current;
    const logo = logoRef.current;
    if (!v || !v.videoWidth || !logo) return;
    const scale = Math.min(1, RECORD_HEIGHT / Math.min(v.videoWidth, v.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    drawNewsWatermark(ctx, logo, canvas.width, canvas.height);
    canvas.toBlob((blob) => blob && setCaptured({ blob, url: URL.createObjectURL(blob), type: "photo", seconds: null }), "image/jpeg", 0.85);
  }

  async function send() {
    if (!captured) return;
    if (!title.trim() || !community.trim()) { toast.error("Add a headline and the community name"); return; }
    setSending(true);
    try {
      await submitCommunityNews({
        userId,
        blob: captured.blob,
        mediaType: captured.type,
        durationSeconds: captured.seconds,
        title,
        description,
        communityName: community,
      });
      toast.success("Sent for review. You'll be notified once an admin checks it.");
      onClose();
    } catch {
      toast.error("Could not send your news. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      <div className="flex items-center justify-between px-4 py-3">
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full bg-muted p-2"><X className="size-5" /></button>
        <span className="font-display text-lg font-bold">ComNews</span>
        {captured ? <span className="w-9" /> : (
          <button type="button" aria-label="Switch camera" onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))} className="rounded-full bg-muted p-2" disabled={recording}>
            <SwitchCamera className="size-5" />
          </button>
        )}
      </div>

      {!captured ? (
        <>
          <div className="relative flex-1 overflow-hidden bg-muted">
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
            {camError ? <p className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm">{camError}</p> : null}
            {recording ? (
              <span className="absolute left-4 top-4 rounded-full bg-destructive px-3 py-1 text-sm font-bold text-destructive-foreground">
                ● {fmt(elapsed)} / {fmt(MAX_RECORD_SECONDS)}
              </span>
            ) : null}
          </div>
          <div className="flex flex-col items-center gap-4 py-5">
            {!recording ? (
              <div className="flex gap-2 rounded-full bg-muted p-1 text-sm font-bold">
                {(["video", "photo"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-full px-4 py-1.5 ${mode === m ? "bg-primary text-primary-foreground" : ""}`}>
                    {m === "video" ? "Video" : "Photo"}
                  </button>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              aria-label={mode === "photo" ? "Take photo" : recording ? "Stop recording" : "Start recording"}
              disabled={!!camError || !logoReady}
              onClick={() => (mode === "photo" ? takePhoto() : recording ? stopRecording() : startRecording())}
              className="flex size-20 items-center justify-center rounded-full border-4 border-foreground"
            >
              <span className={`flex items-center justify-center ${recording ? "size-8 rounded-md" : "size-16 rounded-full"} ${mode === "photo" ? "bg-foreground" : "bg-destructive"}`}>
                {mode === "photo" ? <Camera className="size-6 text-background" /> : recording ? null : <Video className="size-6 text-destructive-foreground" />}
              </span>
            </button>
            <p className="text-xs text-muted-foreground">Recorded in 360p · up to 10 minutes</p>
          </div>
        </>
      ) : (
        <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-6">
          {captured.type === "video" ? (
            <video src={captured.url} controls controlsList="nodownload noremoteplayback" disablePictureInPicture playsInline onContextMenu={(event) => event.preventDefault()} className="aspect-video w-full rounded-xl bg-muted" />
          ) : (
            <img src={captured.url} alt="Your photo" className="w-full rounded-xl" />
          )}
          <Button variant="outline" className="w-full" onClick={() => setCaptured(null)} disabled={sending}>
            <RotateCcw className="mr-2 size-4" /> Retake
          </Button>
          <Input placeholder="Headline e.g. Fire at Kaneshie Market Gate 3" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
          <Input placeholder="Community e.g. Kaneshie Market" value={community} onChange={(e) => setCommunity(e.target.value)} maxLength={60} />
          <Textarea placeholder="What is happening? (description)" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={3000} />
          <Button className="w-full" onClick={() => void send()} disabled={sending}>
            {sending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null} Send for review
          </Button>
        </div>
      )}
    </div>
  );
}
