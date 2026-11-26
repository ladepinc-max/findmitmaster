import { useEffect, useRef, useState } from "react";
import { Camera, FileText, Image as ImageIcon, Loader2, MapPin, Phone, Radio, RotateCcw, Shield, SwitchCamera, Video, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendEmergencyReport, type StationKind } from "@/lib/emergency-reports";

type Captured = { blob: Blob; url: string; kind: "photo" | "video" };
const MAX_SECONDS = 600;
const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

function pickMime() {
  const opts = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  return opts.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

/** Live in-app camera only: no gallery, no editing. GPS is attached automatically. */
export function EmergencyReporter(props: {
  kind: StationKind;
  shop: { id: string; name: string; handle: string; landmark: string | null };
  incident: string;
  userId: string;
  defaultPhone: string;
  onGoLive: () => void;
  onClose: () => void;
}) {
  const { kind, shop, incident, userId, onClose } = props;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [captured, setCaptured] = useState<Captured | null>(null);
  const [note, setNote] = useState("");
  const [phone, setPhone] = useState(props.defaultPhone);
  const [sending, setSending] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [loc, setLoc] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [locError, setLocError] = useState(false);
  const noteRef = useRef<HTMLInputElement | null>(null);
  const label = kind === "police" ? "Police" : "Fire Service";

  useEffect(() => {
    if (!navigator.geolocation) { setLocError(true); return; }
    const id = navigator.geolocation.watchPosition(
      (p) => { setLoc({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }); setLocError(false); },
      () => setLocError(true),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  useEffect(() => {
    if (captured) return;
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCamError(null);
      })
      .catch(() => setCamError("Allow camera and microphone to record evidence."));
    return () => { cancelled = true; streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
  }, [facing, captured]);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt.current) / 1000);
      setElapsed(s);
      if (s >= MAX_SECONDS) stop();
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  useEffect(() => () => { if (captured) URL.revokeObjectURL(captured.url); }, [captured]);

  function start() {
    const stream = streamRef.current;
    if (!stream) return;
    const mime = pickMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks.current = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunks.current, { type: rec.mimeType || "video/webm" });
      setCaptured({ blob, url: URL.createObjectURL(blob), kind: "video" });
    };
    startedAt.current = Date.now();
    setElapsed(0);
    rec.start(1000);
    recRef.current = rec;
    setRecording(true);
  }
  function stop() {
    if (recRef.current?.state === "recording") recRef.current.stop();
    setRecording(false);
  }
  function photo() {
    const v = videoRef.current;
    if (!v || !v.videoWidth || recording) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0);
    c.toBlob((b) => b && setCaptured({ blob: b, url: URL.createObjectURL(b), kind: "photo" }), "image/jpeg", 0.85);
  }

  async function send() {
    if (!captured && !note.trim()) { toast.error("Record evidence or describe the incident first"); return; }
    if (!loc) toast.warning("Sending without GPS — turn on location for faster help");
    setSending(true);
    try {
      await sendEmergencyReport({ shopId: shop.id, reporterId: userId, incidentType: incident, description: note, phone, media: captured ? { blob: captured.blob, kind: captured.kind } : null, location: loc });
      toast.success(`Report sent to ${shop.name}`);
      onClose();
    } catch {
      toast.error("Could not send the report. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-background">
      <div className="mx-auto max-w-lg space-y-3 px-4 pb-8 pt-3">
        <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
          <button type="button" aria-label="Close reporter" onClick={onClose}><X className="size-5" /></button>
          <p className="min-w-0 flex-1 truncate text-center text-sm font-bold">findmit.world/@{shop.handle} <MapPin className="inline size-4 text-destructive" /> {shop.landmark || shop.name} 🇬🇭</p>
        </div>
        <div className="flex items-center justify-between text-sm">
          <p><span className="text-muted-foreground">Reporter •</span> <span className="font-semibold">{incident}</span></p>
          {!captured ? <button type="button" aria-label="Switch camera" disabled={recording} onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}><SwitchCamera className="size-5" /></button> : null}
        </div>

        <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-muted">
          {captured ? (
            captured.kind === "video"
              ? <video src={captured.url} controls playsInline className="size-full object-cover" />
              : <img src={captured.url} alt="Captured evidence" className="size-full object-cover" />
          ) : (
            <video ref={videoRef} autoPlay muted playsInline className="size-full object-cover" />
          )}
          <span className="pointer-events-none absolute left-3 top-3 size-8 border-l-2 border-t-2 border-foreground/70" />
          <span className="pointer-events-none absolute right-3 top-3 size-8 border-r-2 border-t-2 border-foreground/70" />
          <span className="pointer-events-none absolute bottom-3 left-3 size-8 border-b-2 border-l-2 border-foreground/70" />
          <span className="pointer-events-none absolute bottom-3 right-3 size-8 border-b-2 border-r-2 border-foreground/70" />
          {recording ? <p className="absolute left-6 top-6 font-mono text-lg font-bold text-destructive">● REC {fmt(elapsed)}</p> : null}
          {captured ? (
            <button type="button" onClick={() => setCaptured(null)} className="absolute right-6 top-6 flex items-center gap-1 rounded-full bg-background/80 px-3 py-1 text-xs font-semibold"><RotateCcw className="size-3.5" />Retake</button>
          ) : null}
          <p className="absolute inset-x-0 bottom-5 text-center text-xs text-foreground/90">{camError ?? (captured ? `${captured.kind === "photo" ? "Picture" : "Video"} ready — cannot be edited` : "Camera active — ensure incident is clearly visible")}</p>
        </div>

        <div className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 ${loc ? "border-wa-green" : "border-destructive"}`}>
          <MapPin className={`size-5 shrink-0 ${loc ? "text-wa-green" : "text-destructive"}`} />
          <p className="text-sm font-bold">{loc ? `Location attached · ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)} (±${Math.round(loc.accuracy)} m)` : locError ? "Turn on location so the station can find you" : "Finding your location…"}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button size="lg" variant="secondary" className="h-14 rounded-xl text-base font-bold" disabled={!!captured || !!camError} onClick={() => (recording ? stop() : start())}>
            {recording ? <><span className="size-3 rounded-sm bg-destructive" />Stop</> : <><Camera className="size-5" />Record Evidence</>}
          </Button>
          <Button size="lg" variant="destructive" className="h-14 rounded-xl text-base font-bold shadow-lg shadow-destructive/40" onClick={props.onGoLive}>
            <Radio className="size-5" />Go Live to {label === "Police" ? "Police" : "Fire"}
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-center text-sm font-semibold">
          <button type="button" className="flex flex-col items-center gap-1.5" disabled={!!captured || recording} onClick={photo}>
            <span className="flex size-12 items-center justify-center rounded-full bg-secondary"><ImageIcon className="size-5" /></span>Send Picture
          </button>
          <button type="button" className="flex flex-col items-center gap-1.5" disabled={!!captured || !!camError} onClick={() => (recording ? stop() : start())}>
            <span className="flex size-12 items-center justify-center rounded-full bg-secondary"><Video className="size-5" /></span>{recording ? "Stop Video" : "Send Video"}
          </button>
          <button type="button" className="flex flex-col items-center gap-1.5" onClick={() => noteRef.current?.focus()}>
            <span className="flex size-12 items-center justify-center rounded-full bg-secondary"><FileText className="size-5" /></span>Send Text / Write Report
          </button>
        </div>

        <label className="flex items-center gap-2 rounded-xl border border-border px-3">
          <Shield className="size-5 shrink-0 text-muted-foreground" />
          <Input ref={noteRef} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Describe incident… (optional with picture/video)" className="border-0 shadow-none focus-visible:ring-0" />
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-border px-3">
          <Phone className="size-4 shrink-0 text-muted-foreground" />
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" maxLength={20} placeholder="Your phone number" className="border-0 shadow-none focus-visible:ring-0" />
        </label>

        <Button size="lg" className="h-14 w-full rounded-xl text-base font-bold" disabled={sending || recording} onClick={() => void send()}>
          {sending ? <Loader2 className="size-5 animate-spin" /> : <Phone className="size-5" />}Send with My Number
        </Button>
        <p className="text-center text-xs text-muted-foreground">Only {shop.name} can see your report • Ghana {label} linked</p>
      </div>
    </div>
  );
}
