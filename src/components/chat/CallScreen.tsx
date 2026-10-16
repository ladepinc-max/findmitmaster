import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  Globe,
  Mic,
  MicOff,
  PhoneOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/UserAvatar";
import {
  ICE_SERVERS,
  TRANSLATOR_LANGUAGES,
  fetchPendingSignals,
  sendSignal,
  setCallStatus,
  subscribeCall,
  subscribeSignals,
  translateText,
  type CallSignal,
  type ChatCall,
} from "@/lib/calls";
import type { ProfileLite } from "@/lib/chat";
import { describeMediaError, logDebug } from "@/lib/webrtc-debug";
import { startCamera, startMicrophone } from "@/lib/webrtc-media";

interface Props {
  call: ChatCall;
  me: ProfileLite;
  other: ProfileLite;
  /** true when I initiated the call */
  isCaller: boolean;
  onClose: () => void;
}

interface Caption {
  from: string;
  original: string;
  translated: string;
}

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: { [i: number]: { [j: number]: { transcript: string } }; length: number } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

export function CallScreen({ call, me, other, isCaller, onClose }: Props) {
  const localRef = useRef<HTMLVideoElement | null>(null);
  const remoteRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const remoteSet = useRef(false);

  const [status, setStatus] = useState<string>(isCaller ? "Ringing…" : "Connecting…");
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [speaker, setSpeaker] = useState(true);

  // translator state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [translatorOn, setTranslatorOn] = useState(false);
  const [speakOut, setSpeakOut] = useState(false);
  const [fromLang, setFromLang] = useState("en");
  const [toLang, setToLang] = useState("tw");
  const [myCaption, setMyCaption] = useState<Caption | null>(null);
  const [theirCaption, setTheirCaption] = useState<Caption | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const translateChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastSentRef = useRef("");

  const hangUp = useCallback(async () => {
    try {
      await setCallStatus(call.id, "ended");
    } catch {
      /* ignore */
    }
    onClose();
  }, [call.id, onClose]);

  /* ------------------------------- WebRTC ------------------------------- */
  useEffect(() => {
    let cancelled = false;
    let unsubSignals: (() => void) | undefined;
    let unsubCall: (() => void) | undefined;

    async function init() {
      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      logDebug("call", `Acquiring media for ${call.kind} call`);
      const stream = await (call.kind === "video"
        ? startCamera({ facingMode: "user", width: 640, height: 480, audio: true })
        : startMicrophone()
      ).catch((err) => {
        logDebug("call", "Call media acquisition failed", {
          level: "error",
          detail: describeMediaError(err),
        });
        throw err;
      });
      logDebug("call", "Call media acquired", {
        detail: stream.getTracks().map((t) => `${t.kind}:${t.label || "unlabeled"}`).join(", "),
      });
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (localRef.current) localRef.current.srcObject = stream;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      pc.ontrack = (event) => {
        if (remoteRef.current) remoteRef.current.srcObject = event.streams[0] ?? null;
        setStatus("Connected");
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          void sendSignal({
            callId: call.id,
            fromId: me.id,
            toId: other.id,
            type: "ice",
            data: event.candidate.toJSON(),
          });
        }
      };
      pc.onconnectionstatechange = () => {
        logDebug("call", `Connection state: ${pc.connectionState}`, {
          level: pc.connectionState === "failed" ? "error" : "info",
        });
        if (pc.connectionState === "connected") setStatus("Connected");
        if (pc.connectionState === "failed") setStatus("Connection failed");
      };

      const seen = new Set<string>();
      const handleSignal = async (signal: CallSignal) => {
        if (seen.has(signal.id)) return;
        seen.add(signal.id);
        try {
          if (signal.type === "offer") {
            if (pc.signalingState === "stable" && remoteSet.current) return;
            await pc.setRemoteDescription(new RTCSessionDescription(signal.data as RTCSessionDescriptionInit));
            remoteSet.current = true;
            for (const c of pendingIce.current) await pc.addIceCandidate(new RTCIceCandidate(c));
            pendingIce.current = [];
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await sendSignal({
              callId: call.id,
              fromId: me.id,
              toId: other.id,
              type: "answer",
              data: answer,
            });
          } else if (signal.type === "answer") {
            if (pc.signalingState !== "have-local-offer") return;
            await pc.setRemoteDescription(new RTCSessionDescription(signal.data as RTCSessionDescriptionInit));
            remoteSet.current = true;
            for (const c of pendingIce.current) await pc.addIceCandidate(new RTCIceCandidate(c));
            pendingIce.current = [];
          } else if (signal.type === "ice") {
            const candidate = signal.data as RTCIceCandidateInit;
            if (remoteSet.current) await pc.addIceCandidate(new RTCIceCandidate(candidate));
            else pendingIce.current.push(candidate);
          }
        } catch (err) {
          logDebug("call", "Signal handling failed", { level: "error", detail: String(err) });
        }
      };

      unsubSignals = subscribeSignals(call.id, me.id, (signal) => {
        void handleSignal(signal);
      });

      unsubCall = subscribeCall(call.id, (updated) => {
        if (updated.status === "declined") {
          setStatus("Call declined");
          setTimeout(onClose, 1200);
        }
        if (updated.status === "ended") {
          setStatus("Call ended");
          setTimeout(onClose, 800);
        }
        if (updated.status === "accepted" && isCaller) setStatus("Connecting…");
      });

      if (isCaller) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal({
          callId: call.id,
          fromId: me.id,
          toId: other.id,
          type: "offer",
          data: offer,
        });
      } else {
        await setCallStatus(call.id, "accepted");
      }

      // Replay anything that arrived before this side was listening
      // (the caller's offer is always sent before the receiver accepts).
      const missed = await fetchPendingSignals(call.id, me.id).catch(() => [] as CallSignal[]);
      for (const signal of missed) {
        if (cancelled) return;
        await handleSignal(signal);
      }
    }

    void init().catch((err) => {
      logDebug("call", "Call init failed", { level: "error", detail: describeMediaError(err) });
      setStatus("Camera or microphone blocked");
    });

    return () => {
      cancelled = true;
      unsubSignals?.();
      unsubCall?.();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      pcRef.current?.close();
      pcRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.id]);

  /* ------------------------ translation broadcast ----------------------- */
  useEffect(() => {
    const channel = supabase
      .channel(`translate-${call.id}`)
      .on("broadcast", { event: "translation" }, ({ payload }) => {
        const p = payload as Caption;
        if (p.from === me.id) return;
        setTheirCaption(p);
        if (speakOut && p.translated) {
          const utter = new SpeechSynthesisUtterance(p.translated);
          utter.lang = TRANSLATOR_LANGUAGES.find((l) => l.code === toLang)?.speech ?? "en-US";
          window.speechSynthesis.speak(utter);
        }
      })
      .subscribe();
    translateChannelRef.current = channel;
    return () => {
      void supabase.removeChannel(channel);
      translateChannelRef.current = null;
    };
  }, [call.id, me.id, speakOut, toLang]);

  /* --------------------------- speech recognition ------------------------ */
  useEffect(() => {
    if (!translatorOn) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setMyCaption({ from: me.id, original: "", translated: "Speech recognition not supported on this browser" });
      return;
    }
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = TRANSLATOR_LANGUAGES.find((l) => l.code === fromLang)?.speech ?? "en-US";

    recognition.onresult = (event) => {
      const results = event.results;
      const last = results[results.length - 1];
      const transcript = last?.[0]?.transcript ?? "";
      if (!transcript.trim()) return;
      setMyCaption((prev) => ({ from: me.id, original: transcript, translated: prev?.translated ?? "" }));
      if (transcript === lastSentRef.current) return;
      lastSentRef.current = transcript;
      void (async () => {
        let translated: string;
        try {
          translated = await translateText(transcript, fromLang, toLang);
        } catch {
          translated = `${transcript} (translation offline)`;
        }
        setMyCaption({ from: me.id, original: transcript, translated });
        translateChannelRef.current?.send({
          type: "broadcast",
          event: "translation",
          payload: { from: me.id, original: transcript, translated } satisfies Caption,
        });
      })();
    };
    recognition.onerror = () => {};
    recognition.onend = () => {
      try {
        recognition.start();
      } catch {
        /* already stopped */
      }
    };
    try {
      recognition.start();
    } catch {
      /* ignore */
    }
    recognitionRef.current = recognition;

    return () => {
      recognition.onend = null;
      recognition.stop();
    };
  }, [translatorOn, fromLang, toLang, me.id]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
  };
  const toggleCam = () => {
    const next = !camOff;
    setCamOff(next);
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = !next));
  };
  const toggleSpeaker = () => {
    const next = !speaker;
    setSpeaker(next);
    if (remoteRef.current) remoteRef.current.muted = !next;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <video
        ref={remoteRef}
        autoPlay
        playsInline
        className="absolute inset-0 size-full object-cover"
      />
      {status !== "Connected" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
          <UserAvatar photoPath={other.photo_path} name={other.display_name} className="size-24" />
          <p className="text-lg font-semibold text-white">{other.display_name}</p>
          <p className="text-sm text-white/70">{status}</p>
        </div>
      ) : null}

      <video
        ref={localRef}
        autoPlay
        playsInline
        muted
        className="absolute right-4 top-4 h-40 w-28 -scale-x-100 rounded-xl border border-white/20 object-cover shadow-lg"
      />

      {/* Captions */}
      {translatorOn ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-32 space-y-2 px-4">
          {(theirCaption ?? myCaption) ? (
            <>
              <div className="mx-auto max-w-2xl rounded-lg bg-black/70 px-4 py-2 text-center text-base text-white">
                {(theirCaption ?? myCaption)?.original || "…"}
              </div>
              <div className="mx-auto max-w-2xl rounded-lg bg-black/75 px-4 py-2 text-center text-lg font-bold text-yellow-300">
                {(theirCaption ?? myCaption)?.translated || "…"}
              </div>
            </>
          ) : (
            <div className="mx-auto max-w-2xl rounded-lg bg-black/60 px-4 py-2 text-center text-sm text-white/80">
              Listening… start speaking
            </div>
          )}
        </div>
      ) : null}

      {/* Controls */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-gradient-to-t from-black/80 to-transparent p-6">
        <ControlButton label={muted ? "Unmute" : "Mute"} onClick={toggleMute} active={muted}>
          {muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
        </ControlButton>
        <ControlButton label="Camera" onClick={toggleCam} active={camOff}>
          {camOff ? <CameraOff className="size-5" /> : <Camera className="size-5" />}
        </ControlButton>
        <button
          type="button"
          onClick={() => void hangUp()}
          aria-label="End call"
          className="flex size-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg hover:bg-red-700"
        >
          <PhoneOff className="size-6" />
        </button>
        <ControlButton label="Speaker" onClick={toggleSpeaker} active={!speaker}>
          {speaker ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
        </ControlButton>
        <ControlButton
          label="Translate"
          onClick={() => setSheetOpen(true)}
          highlighted={translatorOn}
        >
          <Globe className="size-5" />
        </ControlButton>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="space-y-5 rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Live Translator — FREE</SheetTitle>
          </SheetHeader>

          <div className="flex items-center justify-between">
            <Label htmlFor="translator-toggle">Translator</Label>
            <Switch id="translator-toggle" checked={translatorOn} onCheckedChange={setTranslatorOn} />
          </div>

          <div className="space-y-2">
            <Label>I speak:</Label>
            <Select value={fromLang} onValueChange={setFromLang}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSLATOR_LANGUAGES.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Translate to:</Label>
            <Select value={toLang} onValueChange={setToLang}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSLATOR_LANGUAGES.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="speak-toggle">Speak translations aloud</Label>
            <Switch id="speak-toggle" checked={speakOut} onCheckedChange={setSpeakOut} />
          </div>

          <Button
            className="w-full"
            onClick={() => {
              setTranslatorOn(true);
              setSheetOpen(false);
            }}
          >
            Start Translating
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Uses your phone&apos;s free translator, works offline for English.
          </p>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ControlButton({
  children,
  label,
  onClick,
  active,
  highlighted,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  highlighted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex size-12 items-center justify-center rounded-full text-white shadow transition ${
        highlighted ? "bg-blue-600 hover:bg-blue-700" : active ? "bg-white/80 text-black" : "bg-white/20 hover:bg-white/30"
      }`}
    >
      {children}
    </button>
  );
}
