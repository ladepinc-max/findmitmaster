import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Cloudflare Realtime (Calls SFU) room.
 *
 * All signalling goes through /api/cf-token, which holds the Cloudflare App ID
 * and Secret server-side. Presence (who publishes which track) is exchanged over
 * a Supabase realtime channel.
 *
 * Video is locked to 360p / 30fps / 600kbps for everyone — no simulcast layers.
 */

export const CALLS_CONFIGURED = true;
export const MAX_STAGE_STUDENTS = 3;

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { exact: 640 },
  height: { exact: 360 },
  frameRate: { ideal: 30, max: 30 },
};

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

type Role = "host" | "audience";

/** Structured console logging so publish/subscribe problems are visible in the field. */
function log(message: string, detail?: unknown) {
  if (detail === undefined) console.info(`[calls] ${message}`);
  else console.info(`[calls] ${message}`, detail);
}

/** Hidden sink that holds remote <audio> elements without touching the app DOM. */
function audioSink() {
  let node = document.getElementById("cf-audio-sink");
  if (!node) {
    node = document.createElement("div");
    node.id = "cf-audio-sink";
    node.style.display = "none";
    document.body.appendChild(node);
  }
  return node;
}

/**
 * Small wrapper so components can `play()` a track into a container.
 * A track can be rendered in several places at once (stage + PiP + queue tile),
 * so every container keeps its own media element — this is what stops the
 * "second view steals the video and the first goes black" problem.
 */
export class CallTrack {
  private els = new Map<HTMLElement, HTMLMediaElement>();

  constructor(
    private track: MediaStreamTrack,
    private muted: boolean,
  ) {}

  get kind() {
    return this.track.kind;
  }

  get enabled() {
    return this.track.enabled;
  }

  getMediaStreamTrack() {
    return this.track;
  }

  getTrackLabel() {
    return this.track.label;
  }

  replace(track: MediaStreamTrack) {
    this.track = track;
    for (const el of this.els.values()) el.srcObject = new MediaStream([track]);
  }

  async setEnabled(value: boolean) {
    this.track.enabled = value;
  }

  play(container: string | HTMLElement, opts?: { fit?: "cover" | "contain" }) {
    const node =
      this.track.kind === "audio"
        ? audioSink()
        : typeof container === "string"
          ? document.getElementById(container)
          : container;
    if (!node) return;

    let el = this.els.get(node);
    if (!el) {
      el =
        this.track.kind === "audio"
          ? document.createElement("audio")
          : document.createElement("video");
      el.autoplay = true;
      el.muted = this.muted;
      if (el instanceof HTMLVideoElement) {
        el.playsInline = true;
        el.style.width = "100%";
        el.style.height = "100%";
        el.style.objectFit = opts?.fit ?? "contain";
      }
      node.appendChild(el);
      this.els.set(node, el);
    } else if (el instanceof HTMLVideoElement && opts?.fit) {
      el.style.objectFit = opts.fit;
    }

    // srcObject is (re)assigned every time: the guard against black frames.
    el.srcObject = new MediaStream([this.track]);
    void el.play().catch(() => undefined);
  }

  /** Remove this track from one container, or from all of them. */
  stop(container?: string | HTMLElement) {
    const node =
      container === undefined
        ? null
        : typeof container === "string"
          ? document.getElementById(container)
          : container;
    if (node) {
      const el = this.els.get(node);
      if (el) {
        el.srcObject = null;
        el.remove();
        this.els.delete(node);
      }
      return;
    }
    for (const el of this.els.values()) {
      el.srcObject = null;
      el.remove();
    }
    this.els.clear();
  }

  close() {
    this.stop();
    try {
      this.track.stop();
    } catch {
      /* already stopped */
    }
  }
}

export interface CallRemoteUser {
  uid: string;
  videoTrack?: CallTrack;
  audioTrack?: CallTrack;
}

interface TrackObject {
  location: "local" | "remote";
  mid?: string | null;
  trackName: string;
  sessionId?: string;
}

interface SfuResponse {
  sessionId?: string;
  sessionDescription?: RTCSessionDescriptionInit;
  requiresImmediateRenegotiation?: boolean;
  tracks?: (TrackObject & { mid?: string | null; error?: unknown })[];
  errorDescription?: string;
}

async function sfu(
  action: "session" | "tracks" | "renegotiate" | "close",
  payload: unknown,
  sessionId?: string,
): Promise<SfuResponse> {
  const res = await fetch("/api/cf-token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, sessionId, payload }),
  });
  const json = (await res.json()) as SfuResponse & { error?: string };
  if (!res.ok) throw new Error(json.error ?? json.errorDescription ?? "Cloudflare call failed");
  return json;
}

async function localDescription(pc: RTCPeerConnection, sdp: RTCSessionDescriptionInit) {
  await pc.setLocalDescription(sdp);
  if (pc.iceGatheringState === "complete") return pc.localDescription!;
  await new Promise<void>((resolve) => {
    const done = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", done);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", done);
    window.setTimeout(resolve, 2500);
  });
  return pc.localDescription!;
}

/** One peer connection that both publishes and subscribes through the SFU. */
class CallsSession {
  pc: RTCPeerConnection;
  sessionId: string | null = null;
  closed = false;
  private midTracks = new Map<string, MediaStreamTrack>();
  private waiters = new Map<string, (track: MediaStreamTrack) => void>();
  /** All negotiation is serialised: two offers at once break the SFU handshake. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor() {
    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
      bundlePolicy: "max-bundle",
    });
    this.pc.ontrack = (event) => {
      const mid = event.transceiver.mid;
      if (!mid) return;
      log(`remote track arrived (mid ${mid}, ${event.track.kind})`);
      this.midTracks.set(mid, event.track);
      this.waiters.get(mid)?.(event.track);
      this.waiters.delete(mid);
    };
    this.pc.addEventListener("connectionstatechange", () => {
      log(`peer connection: ${this.pc.connectionState}`);
    });
  }

  private run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async ensureSession() {
    if (this.sessionId) return this.sessionId;
    const res = await sfu("session", {});
    if (!res.sessionId) throw new Error(res.errorDescription ?? "No Cloudflare session");
    this.sessionId = res.sessionId;
    log(`session created ${res.sessionId}`);
    return this.sessionId;
  }

  publish(track: MediaStreamTrack, trackName: string) {
    return this.run(async () => {
      const sessionId = await this.ensureSession();
      const transceiver = this.pc.addTransceiver(track, { direction: "sendonly" });
      const params = transceiver.sender.getParameters();
      params.encodings = [{ maxBitrate: 600_000, maxFramerate: 30 }];
      params.degradationPreference = "maintain-framerate";
      try {
        await transceiver.sender.setParameters(params);
      } catch {
        /* browser rejected encoding tweak */
      }
      const offer = await localDescription(this.pc, await this.pc.createOffer());
      const res = await sfu(
        "tracks",
        {
          sessionDescription: { type: offer.type, sdp: offer.sdp },
          tracks: [{ location: "local", mid: transceiver.mid, trackName }],
        },
        sessionId,
      );
      if (res.sessionDescription) await this.pc.setRemoteDescription(res.sessionDescription);
      log(`publishing ${track.kind} as ${trackName}`);
      return transceiver;
    });
  }

  unpublish(transceiver: RTCRtpTransceiver, trackName: string) {
    return this.run(async () => {
      if (!this.sessionId) return;
      try {
        await sfu(
          "close",
          { tracks: [{ mid: transceiver.mid, trackName }], force: false },
          this.sessionId,
        );
      } catch {
        /* already closed */
      }
      try {
        transceiver.stop();
      } catch {
        /* ignore */
      }
      log(`stopped publishing ${trackName}`);
    });
  }

  subscribe(remoteSessionId: string, trackName: string) {
    return this.run(async () => {
      const sessionId = await this.ensureSession();
      const res = await sfu(
        "tracks",
        { tracks: [{ location: "remote", sessionId: remoteSessionId, trackName }] },
        sessionId,
      );
      const mid = res.tracks?.[0]?.mid ?? null;
      if (res.requiresImmediateRenegotiation && res.sessionDescription) {
        await this.pc.setRemoteDescription(res.sessionDescription);
        const answer = await localDescription(this.pc, await this.pc.createAnswer());
        await sfu(
          "renegotiate",
          { sessionDescription: { type: "answer", sdp: answer.sdp } },
          sessionId,
        );
      }
      if (!mid) throw new Error("Cloudflare did not return a track");
      const existing = this.midTracks.get(mid);
      if (existing) {
        log(`subscribed to ${trackName} (mid ${mid})`);
        return existing;
      }
      const track = await new Promise<MediaStreamTrack>((resolve, reject) => {
        this.waiters.set(mid, resolve);
        window.setTimeout(() => {
          if (this.waiters.has(mid)) {
            this.waiters.delete(mid);
            reject(new Error("Timed out waiting for remote track"));
          }
        }, 10_000);
      });
      log(`subscribed to ${trackName} (mid ${mid})`);
      return track;
    });
  }

  close() {
    this.closed = true;
    try {
      this.pc.close();
    } catch {
      /* ignore */
    }
    log("session closed");
  }
}

interface Publisher {
  uid: string;
  sessionId: string;
  video: string | null;
  audio: string | null;
}

/**
 * Joins a Cloudflare Realtime room. Audience members never touch camera or
 * microphone — they only subscribe to whoever is publishing.
 */
export function useCallsRoom(roomId: string | null, uid: string | null, role: Role) {
  const sessionRef = useRef<CallsSession | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const cameraRef = useRef<CallTrack | null>(null);
  const micRef = useRef<CallTrack | null>(null);
  const screenRef = useRef<CallTrack | null>(null);
  const sendersRef = useRef<Record<string, RTCRtpTransceiver>>({});
  const subscribedRef = useRef<Set<string>>(new Set());
  const facingRef = useRef<"user" | "environment">("user");

  const [remoteUsers, setRemoteUsers] = useState<CallRemoteUser[]>([]);
  const [joined, setJoined] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localVideoTrack, setLocalVideoTrack] = useState<CallTrack | null>(null);

  const announce = useCallback(() => {
    const channel = channelRef.current;
    if (!channel || !uid) return;
    void channel.track({
      uid,
      sessionId: sessionRef.current?.sessionId ?? null,
      video: cameraRef.current || screenRef.current ? `${uid}-video` : null,
      audio: micRef.current ? `${uid}-audio` : null,
    });
  }, [uid]);

  // ===== join the room and follow every other publisher =====
  useEffect(() => {
    if (!roomId || !uid) return;
    let cancelled = false;
    const session = new CallsSession();
    sessionRef.current = session;
    subscribedRef.current = new Set();

    const channel = supabase.channel(`cf-room-${roomId}`, {
      config: { presence: { key: uid } },
    });
    channelRef.current = channel;

    const syncPublishers = () => {
      const state = channel.presenceState() as Record<string, Publisher[]>;
      const publishers: Publisher[] = Object.values(state)
        .flat()
        .filter((row) => row && row.uid !== uid && row.sessionId) as Publisher[];

      publishers.forEach((pub) => {
        (["video", "audio"] as const).forEach((kind) => {
          const trackName = pub[kind];
          if (!trackName) return;
          const key = `${pub.sessionId}:${trackName}`;
          if (subscribedRef.current.has(key)) return;
          subscribedRef.current.add(key);
          log(`subscribing to ${pub.uid} ${kind} (${trackName})`);

          const attempt = async (tries: number): Promise<MediaStreamTrack> => {
            try {
              return await session.subscribe(pub.sessionId, trackName);
            } catch (err) {
              if (tries <= 0 || cancelled || session.closed) throw err;
              await new Promise((r) => window.setTimeout(r, 1200));
              return attempt(tries - 1);
            }
          };

          void attempt(3)
            .then((track) => {
              if (cancelled) return;
              const wrapped = new CallTrack(track, false);
              // Remote audio plays out of a hidden sink so it is always audible.
              if (kind === "audio") wrapped.play(document.body);
              setRemoteUsers((prev) => {
                const current = prev.find((row) => row.uid === pub.uid) ?? { uid: pub.uid };
                const next = prev.filter((row) => row.uid !== pub.uid);
                return [
                  ...next,
                  kind === "video"
                    ? { ...current, videoTrack: wrapped }
                    : { ...current, audioTrack: wrapped },
                ];
              });
            })
            .catch((err) => {
              subscribedRef.current.delete(key);
              log(`failed to subscribe to ${pub.uid} ${kind}`, (err as Error).message);
            });
        });
      });

      const liveUids = new Set(publishers.map((pub) => pub.uid));
      setRemoteUsers((prev) => {
        prev.forEach((row) => {
          if (!liveUids.has(row.uid)) {
            row.videoTrack?.stop();
            row.audioTrack?.stop();
          }
        });
        return prev.filter((row) => liveUids.has(row.uid));
      });
    };

    channel
      .on("presence", { event: "sync" }, syncPublishers)
      .on("presence", { event: "join" }, syncPublishers)
      .on("presence", { event: "leave" }, syncPublishers)
      .subscribe((status) => {
        if (status !== "SUBSCRIBED" || cancelled) return;
        setJoined(true);
        void channel.track({ uid, sessionId: null, video: null, audio: null });
      });

    return () => {
      cancelled = true;
      cameraRef.current?.close();
      micRef.current?.close();
      screenRef.current?.close();
      cameraRef.current = null;
      micRef.current = null;
      screenRef.current = null;
      sendersRef.current = {};
      session.close();
      sessionRef.current = null;
      channelRef.current = null;
      void supabase.removeChannel(channel);
      setJoined(false);
      setPublishing(false);
      setRemoteUsers([]);
      setLocalVideoTrack(null);
    };
  }, [roomId, uid, role]);

  const setRole = useCallback(async (_next: Role) => {
    // Cloudflare has no role concept: publishing is what makes you a host.
  }, []);

  const startPublishing = useCallback(
    // `existing` lets a caller reuse a camera it already opened (the classroom
    // does this so the phone never opens the camera twice).
    async (withVideo = true, existing?: MediaStream | null) => {
      const session = sessionRef.current;
      if (!session || !uid) return;
      const errors: string[] = [];

      // One prompt for camera + microphone: Android Chrome is happier this way.
      let stream: MediaStream | null = existing ?? null;
      try {
        if (!stream) {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: AUDIO_CONSTRAINTS,
            video: withVideo ? { ...VIDEO_CONSTRAINTS, facingMode: facingRef.current } : false,
          });
        }
        log(`local media granted: ${stream.getTracks().map((t) => t.kind).join(" + ")}`);
      } catch (err) {
        // Fall back to audio only when the camera is refused or busy.
        errors.push((err as Error).message);
        if (withVideo) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
            log("camera unavailable — publishing microphone only");
          } catch (audioErr) {
            errors.push((audioErr as Error).message);
          }
        }
      }

      const audioTrack = stream?.getAudioTracks()[0] ?? null;
      const videoTrack = stream?.getVideoTracks()[0] ?? null;

      if (audioTrack && !micRef.current) {
        try {
          const wrapped = new CallTrack(audioTrack, true);
          sendersRef.current["audio"] = await session.publish(audioTrack, `${uid}-audio`);
          micRef.current = wrapped;
          setMicOn(true);
        } catch (err) {
          errors.push(`microphone: ${(err as Error).message}`);
        }
      }

      if (videoTrack && !cameraRef.current) {
        try {
          const wrapped = new CallTrack(videoTrack, true);
          cameraRef.current = wrapped;
          setLocalVideoTrack(wrapped);
          setCamOn(true);
          // Attach the self-view immediately, and again once the DOM catches up.
          const attach = () => {
            if (document.getElementById("host-player")) wrapped.play("host-player", { fit: "cover" });
          };
          attach();
          window.setTimeout(attach, 300);
          sendersRef.current["video"] = await session.publish(videoTrack, `${uid}-video`);
        } catch (err) {
          errors.push(`camera: ${(err as Error).message}`);
        }
      }

      if (micRef.current || cameraRef.current) {
        setPublishing(true);
        announce();
        log(`announced publish: video=${Boolean(cameraRef.current)} audio=${Boolean(micRef.current)}`);
      }
      if (errors.length > 0) {
        const message = errors.join("; ");
        setError(message);
        log("publish problems", message);
        if (!micRef.current && !cameraRef.current) throw new Error(message);
      }
    },
    [uid, announce],
  );

  const stopPublishing = useCallback(async () => {
    const session = sessionRef.current;
    if (session && uid) {
      const video = sendersRef.current["video"];
      const audio = sendersRef.current["audio"];
      if (video) await session.unpublish(video, `${uid}-video`);
      if (audio) await session.unpublish(audio, `${uid}-audio`);
    }
    sendersRef.current = {};
    cameraRef.current?.close();
    micRef.current?.close();
    cameraRef.current = null;
    micRef.current = null;
    setLocalVideoTrack(null);
    setCamOn(false);
    setMicOn(false);
    setPublishing(false);
    announce();
  }, [uid, announce]);

  const toggleMic = useCallback(async () => {
    const track = micRef.current;
    if (!track) {
      await startPublishing(false);
      return;
    }
    const next = !track.enabled;
    await track.setEnabled(next);
    setMicOn(next);
  }, [startPublishing]);

  const toggleCamera = useCallback(async () => {
    const track = cameraRef.current;
    if (!track) {
      await startPublishing(true);
      return;
    }
    const next = !track.enabled;
    await track.setEnabled(next);
    setCamOn(next);
  }, [startPublishing]);

  const flipCamera = useCallback(async () => {
    const wrapped = cameraRef.current;
    const sender = sendersRef.current["video"]?.sender;
    if (!wrapped) return;
    facingRef.current = facingRef.current === "user" ? "environment" : "user";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { ...VIDEO_CONSTRAINTS, facingMode: facingRef.current },
      });
      const track = stream.getVideoTracks()[0]!;
      wrapped.getMediaStreamTrack().stop();
      wrapped.replace(track);
      if (sender) await sender.replaceTrack(track);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const startScreenShare = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || !uid) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: 640, height: 360, frameRate: { ideal: 30, max: 30 } },
      });
      const track = stream.getVideoTracks()[0]!;
      const existing = sendersRef.current["video"];
      if (existing) await session.unpublish(existing, `${uid}-video`);
      cameraRef.current?.close();
      cameraRef.current = null;
      const wrapped = new CallTrack(track, true);
      screenRef.current = wrapped;
      sendersRef.current["video"] = await session.publish(track, `${uid}-video`);
      setLocalVideoTrack(wrapped);
      setSharing(true);
      announce();
      track.addEventListener("ended", () => void stopScreenShare());
    } catch (err) {
      setError((err as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, announce]);

  const stopScreenShare = useCallback(async () => {
    const session = sessionRef.current;
    if (session && uid) {
      const existing = sendersRef.current["video"];
      if (existing) await session.unpublish(existing, `${uid}-video`);
    }
    screenRef.current?.close();
    screenRef.current = null;
    setSharing(false);
    setLocalVideoTrack(null);
    await startPublishing(true);
  }, [uid, startPublishing]);

  /** Leave button: stop every local track and close the peer connection. */
  const leave = useCallback(async () => {
    const session = sessionRef.current;
    const channel = channelRef.current;
    cameraRef.current?.close();
    micRef.current?.close();
    screenRef.current?.close();
    cameraRef.current = null;
    micRef.current = null;
    screenRef.current = null;
    sendersRef.current = {};
    setLocalVideoTrack(null);
    setCamOn(false);
    setMicOn(false);
    setSharing(false);
    setPublishing(false);
    if (channel) {
      try {
        await channel.untrack();
      } catch {
        /* channel already gone */
      }
    }
    session?.close();
    log("left the room");
  }, []);

  return {
    leave,
    joined,
    publishing,
    remoteUsers,
    localVideoTrack,
    localAudioTrack: micRef.current,
    camOn,
    micOn,
    sharing,
    error,
    setRole,
    startPublishing,
    stopPublishing,
    toggleMic,
    toggleCamera,
    flipCamera,
    startScreenShare,
    stopScreenShare,
  };
}
