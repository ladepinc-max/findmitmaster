import { useEffect, useRef, useState } from "react";
import { Expand, Loader2, MicOff, Mic, Minimize, Radio, RefreshCcw, RotateCw, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ICE_SERVERS,
  broadcastHostReconnect,
  endLiveSession,
  rememberLiveId,
  sendSignal,
  subscribeToSignals,
  type LiveSession,
} from "@/lib/live-sessions";
import { startCamera } from "@/lib/webrtc-media";
import { describeMediaError, logDebug } from "@/lib/webrtc-debug";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  session: LiveSession;
  hostId: string;
  onEnded: () => void;
}

/** Teacher broadcasting view: local camera + grid of paid students who share video. */
export function LiveHost({ session, hostId, onEnded }: Props) {
  const localRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Record<string, RTCPeerConnection>>({});
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [flipping, setFlipping] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [viewerCount, setViewerCount] = useState(session.viewer_count);
  const [students, setStudents] = useState<{ id: string; stream: MediaStream }[]>([]);

  const lockLandscape = () => {
    void (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.(
      "landscape",
    ).catch(() => {});
  };

  // Track fullscreen + orientation changes; force a video resize/refresh.
  useEffect(() => {
    const sync = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      setIsLandscape(screen.orientation.type.startsWith("landscape"));
      if (localRef.current && localStreamRef.current) {
        localRef.current.srcObject = localStreamRef.current;
        void localRef.current.play().catch(() => {});
      }
    };
    document.addEventListener("fullscreenchange", sync);
    screen.orientation.addEventListener("change", sync);
    sync();
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      screen.orientation.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | null = null;

    const attachStream = (el: HTMLVideoElement | null, stream: MediaStream) => {
      if (!el) return;
      el.srcObject = stream;
      void el.play().catch(() => {});
    };

    const ensurePeer = (viewerId: string) => {
      const existing = peersRef.current[viewerId];
      if (existing) return existing;

      const pc = new RTCPeerConnection(ICE_SERVERS);
      localStreamRef.current
        ?.getTracks()
        .forEach((track) => pc.addTrack(track, localStreamRef.current as MediaStream));

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        void sendSignal({
          sessionId: session.id,
          fromId: hostId,
          toId: viewerId,
          type: "ice",
          data: event.candidate.toJSON(),
        });
      };

      pc.ontrack = (event) => {
        const [stream] = event.streams;
        if (!stream) return;
        setStudents((prev) =>
          prev.some((s) => s.id === viewerId)
            ? prev.map((s) => (s.id === viewerId ? { id: viewerId, stream } : s))
            : [...prev, { id: viewerId, stream }],
        );
      };

      pc.onconnectionstatechange = () => {
        logDebug("live-host", `Viewer ${viewerId} connection: ${pc.connectionState}`, {
          level: pc.connectionState === "failed" ? "error" : "info",
        });
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          setStudents((prev) => prev.filter((s) => s.id !== viewerId));
        }
      };

      peersRef.current[viewerId] = pc;
      return pc;
    };

    const start = async () => {
      try {
        // Wide capture so landscape/fullscreen viewers get a full frame.
        const stream = await startCamera({ width: 1280, height: 720, facingMode: "user" });
        if (disposed) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        attachStream(localRef.current, stream);
        setReady(true);

        unsubscribe = subscribeToSignals(session.id, hostId, (signal) => {
          const viewerId = signal.from_id;
          void (async () => {
            try {
              if (signal.type === "offer") {
                const pc = ensurePeer(viewerId);
                await pc.setRemoteDescription(
                  new RTCSessionDescription(signal.data as RTCSessionDescriptionInit),
                );
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await sendSignal({
                  sessionId: session.id,
                  fromId: hostId,
                  toId: viewerId,
                  type: "answer",
                  data: { type: answer.type, sdp: answer.sdp },
                });
              } else if (signal.type === "ice") {
                const pc = peersRef.current[viewerId];
                if (pc?.remoteDescription) {
                  await pc.addIceCandidate(new RTCIceCandidate(signal.data as RTCIceCandidateInit));
                }
              }
            } catch (err) {
              logDebug("live-host", `Signalling error for viewer ${viewerId}`, {
                level: "error",
                detail: describeMediaError(err),
              });
              console.error("host signalling error", err);
            }
          })();
        });

        // Persist and tell existing viewers to re-offer (covers host page re-entry).
        rememberLiveId(session.id);
        void broadcastHostReconnect(session.id);
        lockLandscape();

      } catch (err) {
        logDebug("live-host", "Host camera/mic acquisition failed", {
          level: "error",
          detail: describeMediaError(err),
        });
        toast.error("Camera and microphone permission is required to go live");
        onEnded();
      }
    };

    void start();

    return () => {
      disposed = true;
      unsubscribe?.();
      Object.values(peersRef.current).forEach((pc) => pc.close());
      peersRef.current = {};
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      (screen.orientation as unknown as { unlock?: () => void }).unlock?.();
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, [session.id, hostId, onEnded]);

  useEffect(() => {
    const channel = supabase
      .channel(`live-session-${session.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_sessions", filter: `id=eq.${session.id}` },
        (payload) => {
          const row = payload.new as { viewer_count: number };
          setViewerCount(row.viewer_count);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session.id]);

  const flipCamera = async () => {
    if (flipping) return;
    setFlipping(true);
    const next = facingMode === "user" ? "environment" : "user";
    try {
      const newStream = await startCamera({ facingMode: next, width: 640, height: 480, audio: false });
      const newTrack = newStream.getVideoTracks()[0];
      const oldStream = localStreamRef.current;
      const oldTrack = oldStream?.getVideoTracks()[0];
      if (!newTrack || !oldStream) {
        newStream.getTracks().forEach((t) => t.stop());
        return;
      }
      // Swap the video track for every connected viewer without renegotiation.
      for (const pc of Object.values(peersRef.current)) {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(newTrack);
      }
      oldStream.removeTrack(oldTrack as MediaStreamTrack);
      oldTrack?.stop();
      oldStream.addTrack(newTrack);
      if (localRef.current) {
        localRef.current.srcObject = oldStream;
        void localRef.current.play().catch(() => {});
      }
      setFacingMode(next);
    } catch (err) {
      logDebug("live-host", `Camera flip to ${next} failed`, {
        level: "error",
        detail: describeMediaError(err),
      });
      toast.error("Could not switch camera");
    } finally {
      setFlipping(false);
    }
  };

  const toggleMute = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        // Request on both the root and the video container for broad support.
        await document.documentElement.requestFullscreen().catch(() => {});
        await containerRef.current?.requestFullscreen().catch(() => {});
      }
    } catch {
      toast.error("Fullscreen is not available on this device");
    }
  };

  const toggleRotate = () => {
    const toLandscape = !screen.orientation.type.startsWith("landscape");
    void (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.(
      toLandscape ? "landscape" : "portrait",
    ).catch(() => {});
  };

  const stop = async () => {
    try {
      (screen.orientation as unknown as { unlock?: () => void }).unlock?.();
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      await endLiveSession(session.id);
    } catch {
      /* ignore */
    }
    onEnded();
  };

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display text-base font-bold">{session.topic}</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="size-3" /> {viewerCount} watching
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-md bg-destructive px-2 py-1 text-[0.65rem] font-bold text-destructive-foreground">
            <Radio className="size-3" /> LIVE
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void toggleFullscreen()}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize className="size-4" /> : <Expand className="size-4" />}
            {isFullscreen ? "Shrink" : "Fullscreen"}
          </Button>
          <Button variant="outline" size="sm" onClick={toggleRotate} title="Rotate">
            <RotateCw className={`size-4${isLandscape ? " text-primary" : ""}`} /> Rotate
          </Button>
          <Button variant="outline" size="sm" onClick={() => void stop()}>
            <X className="size-4" /> Exit live
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        className={`relative overflow-hidden bg-black ${
          isFullscreen
            ? "fixed inset-0 z-50 h-screen w-screen rounded-none"
            : "rounded-2xl"
        }`}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void stop()}
          className="absolute left-2 top-2 z-10 rounded-full bg-black/50 text-white hover:bg-black/70 hover:text-white"
          aria-label="Exit live"
        >
          <X className="size-5" />
        </Button>
        <video
          id="localVideo"
          ref={localRef}
          autoPlay
          playsInline
          muted
          className={`w-full object-cover ${
            isFullscreen || isLandscape ? "h-screen w-screen" : "aspect-video"
          }${facingMode === "user" ? " -scale-x-100" : ""}`}
        />
        {!ready ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="size-6 animate-spin text-primary-foreground" />
          </div>
        ) : null}
      </div>

      {students.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {students.map((student) => (
            <StudentTile key={student.id} stream={student.stream} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Paid practical students appear here when they turn their camera on.
        </p>
      )}

      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={() => void flipCamera()}
          disabled={!ready || flipping}
          title="Flip camera"
        >
          {flipping ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
          Flip
        </Button>
        <Button variant="secondary" className="flex-1" onClick={toggleMute}>
          {muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          {muted ? "Unmute" : "Mute"}
        </Button>
        <Button variant="destructive" className="flex-1" onClick={() => void stop()}>
          <X className="size-4" /> End live
        </Button>
      </div>
    </div>
  );
}

function StudentTile({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
      void ref.current.play().catch(() => {});
    }
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      className="aspect-square w-full rounded-xl bg-black object-cover"
    />
  );
}
