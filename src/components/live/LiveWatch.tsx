import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Mic, MicOff, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recordClassroomView } from "@/lib/folders";
import {
  ICE_SERVERS,
  bumpViewerCount,
  sendSignal,
  subscribeToHostReconnect,
  subscribeToSignals,
  type LiveSession,
} from "@/lib/live-sessions";

import { supabase } from "@/integrations/supabase/client";
import { payForPractical } from "@/lib/paystack";
import { describeMediaError, logDebug } from "@/lib/webrtc-debug";
import { startCamera } from "@/lib/webrtc-media";
import { toast } from "sonner";

interface Props {
  session: LiveSession;
  viewerId: string;
  viewerEmail?: string | null;
  onLeave: () => void;
}

const PRACTICAL_PRICE = 20;

/** Free viewer watches the teacher stream; paid viewer also publishes their camera. */
export function LiveWatch({ session, viewerId, viewerEmail, onLeave }: Props) {
  const remoteRef = useRef<HTMLVideoElement | null>(null);
  const localRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const [connected, setConnected] = useState(false);
  const [paid, setPaid] = useState(false);
  const [paying, setPaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [viewerCount, setViewerCount] = useState(session.viewer_count);

  const sendOffer = useCallback(
    async (pc: RTCPeerConnection, iceRestart = false) => {
      const offer = await pc.createOffer({ iceRestart });
      await pc.setLocalDescription(offer);
      await sendSignal({
        sessionId: session.id,
        fromId: viewerId,
        toId: session.host_id,
        type: "offer",
        data: { type: offer.type, sdp: offer.sdp },
      });
    },
    [session.id, session.host_id, viewerId],
  );

  // The host may leave the page and come back; re-offer when they return.
  useEffect(() => {
    return subscribeToHostReconnect(session.id, () => {
      const pc = pcRef.current;
      if (!pc) return;
      setConnected(false);
      pendingIce.current = [];
      void sendOffer(pc, true).catch(() => {});
    });
  }, [session.id, sendOffer]);


  useEffect(() => {
    let disposed = false;
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream || !remoteRef.current) return;
      remoteRef.current.srcObject = stream;
      void remoteRef.current.play().catch(() => {});
      logDebug("live-watch", "Receiving teacher stream");
      setConnected(true);
    };

    pc.onconnectionstatechange = () => {
      logDebug("live-watch", `Connection state: ${pc.connectionState}`, {
        level: pc.connectionState === "failed" ? "error" : "info",
      });
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      void sendSignal({
        sessionId: session.id,
        fromId: viewerId,
        toId: session.host_id,
        type: "ice",
        data: event.candidate.toJSON(),
      });
    };

    const unsubscribe = subscribeToSignals(session.id, viewerId, (signal) => {
      void (async () => {
        try {
          if (signal.type === "answer") {
            await pc.setRemoteDescription(
              new RTCSessionDescription(signal.data as RTCSessionDescriptionInit),
            );
            for (const candidate of pendingIce.current) {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            }
            pendingIce.current = [];
          } else if (signal.type === "ice") {
            const candidate = signal.data as RTCIceCandidateInit;
            if (pc.remoteDescription) await pc.addIceCandidate(new RTCIceCandidate(candidate));
            else pendingIce.current.push(candidate);
          }
        } catch (err) {
          logDebug("live-watch", `Signalling error (${signal.type})`, {
            level: "error",
            detail: describeMediaError(err),
          });
          console.error("viewer signalling error", err);
        }
      })();
    });

    void (async () => {
      try {
        await sendOffer(pc);
        const next = await bumpViewerCount(session.id, 1);
        if (!disposed) setViewerCount(next);
      } catch (err) {
        logDebug("live-watch", "Failed to connect to live class", {
          level: "error",
          detail: describeMediaError(err),
        });
        toast.error("Could not connect to this live class");
      }
    })();

    return () => {
      disposed = true;
      unsubscribe();
      pc.close();
      pcRef.current = null;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      void bumpViewerCount(session.id, -1);
    };
  }, [session.id, session.host_id, viewerId, sendOffer]);

  // Track that this student watched the class, so it appears in Profile > Live Replays.
  useEffect(() => {
    const startedAt = Date.now();
    void recordClassroomView({
      liveSessionId: session.id,
      studentId: viewerId,
      durationWatched: 0,
    }).catch(() => undefined);
    return () => {
      void recordClassroomView({
        liveSessionId: session.id,
        studentId: viewerId,
        durationWatched: Math.round((Date.now() - startedAt) / 1000),
      }).catch(() => undefined);
    };
  }, [session.id, viewerId]);

  useEffect(() => {
    const channel = supabase
      .channel(`live-watch-${session.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_sessions", filter: `id=eq.${session.id}` },
        (payload) => {
          const row = payload.new as { viewer_count: number; is_live: boolean };
          setViewerCount(row.viewer_count);
          if (!row.is_live) {
            toast.info("The teacher ended this live class");
            onLeave();
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session.id, onLeave]);

  const joinPractical = async () => {
    setPaying(true);
    try {
      const ok = await payForPractical({
        amount: PRACTICAL_PRICE,
        email: viewerEmail ?? "",
        reference: `${session.id}-${viewerId}-${Date.now()}`,
      });
      if (!ok) return;

      const stream = await startCamera({ facingMode: "user", width: 640, height: 480, audio: true });
      localStreamRef.current = stream;
      if (localRef.current) {
        localRef.current.srcObject = stream;
        void localRef.current.play().catch(() => {});
      }
      const pc = pcRef.current;
      if (pc) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        await sendOffer(pc);
      }
      setPaid(true);
      toast.success("You joined the practical session — the teacher can see you now");
    } catch (err) {
      logDebug("live-watch", "Join practical failed (payment or camera)", {
        level: "error",
        detail: describeMediaError(err),
      });
      toast.error("Could not join the practical session");
    } finally {
      setPaying(false);
    }
  };

  const toggleMute = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  };

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onLeave}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="size-3" /> {viewerCount} watching
        </p>
      </div>

      <div>
        <p className="font-display text-base font-bold">{session.topic}</p>
        <p className="text-xs text-muted-foreground">
          {session.host?.display_name ?? "Teacher"}
        </p>
      </div>

      <div className="relative overflow-hidden rounded-2xl bg-black">
        <video
          id="remoteVideo"
          ref={remoteRef}
          autoPlay
          playsInline
          className="aspect-video w-full object-contain"
        />
        {!connected ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Loader2 className="size-6 animate-spin text-primary-foreground" />
            <p className="text-xs text-primary-foreground/70">Connecting to the teacher…</p>
          </div>
        ) : null}
        <video
          id="localVideo"
          ref={localRef}
          autoPlay
          playsInline
          muted
          className={
            paid
              ? "absolute bottom-3 right-3 h-24 w-20 rounded-lg border border-border object-cover"
              : "hidden"
          }
        />
      </div>

      <div className="flex gap-2">
        {paid ? (
          <Button variant="secondary" className="flex-1" onClick={toggleMute}>
            {muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            {muted ? "Unmute" : "Mute"}
          </Button>
        ) : (
          <>
            <Button variant="secondary" className="flex-1" disabled>
              Watching free
            </Button>
            <Button className="flex-1" disabled={paying} onClick={() => void joinPractical()}>
              {paying ? <Loader2 className="size-4 animate-spin" /> : null}
              Join Practical GHS {PRACTICAL_PRICE}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
