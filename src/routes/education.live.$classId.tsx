import { FindMitLogo } from "@/components/FindMitLogo";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { sendPushToUser } from "@/lib/push.functions";
import { toast } from "sonner";
import {
  Camera,
  CameraOff,
  CloudUpload,
  Eye,
  Gift,
  Hand,
  Loader2,
  Lock,
  LogOut,
  Mic,
  MicOff,
  Send,
  FlipHorizontal,
  SwitchCamera,
  ThumbsUp,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth";
import { useAppPrice } from "@/lib/pricing";
import { useFreeAccess } from "@/lib/free-access";
import { payWithPaystack } from "@/lib/paystack";
import { useAvatarUrl } from "@/lib/avatar";
import { supabase } from "@/integrations/supabase/client";
import { VideoTile } from "@/components/education/VideoTile";
import { HlsPlayer } from "@/lib/hls-player";
import { startCamera } from "@/lib/webrtc-media";
import { useCallsRoom } from "@/lib/cfcalls";
import { createClassMix, type ClassMix } from "@/lib/class-mix";
import { ensureLiveInput, startWhipBroadcast, type WhipBroadcast } from "@/lib/cf-whip";
import {
  endClass,
  fetchClassroom,
  fetchEnrollments,
  fetchMessages,
  fetchMyVotes,
  fetchStageRequests,
  formatCountdown,
  markAnswered,
  requestStage,
  sendClassMessage,
  setClassStream,
  setStageStatus,
  toggleUpvote,
  uploadClassMedia,
  useClassMediaUrl,
  FREE_CHAT_COOLDOWN_MS,
  type ClassMessage,
  type Enrollment,
  type LiveClassroom,
  type StageRequest,
} from "@/lib/classroom";

export const Route = createFileRoute("/education/live/$classId")({
  head: () => ({
    meta: [
      { title: "Live classroom — FindMit Education" },
      {
        name: "description",
        content:
          "Join a live hands-on class on FindMit: watch the instructor, pay once to join the stage and ask questions in real time.",
      },
      { property: "og:title", content: "Live classroom — FindMit Education" },
      {
        property: "og:description",
        content: "Learn a trade live, show your work on stage and get corrected by the instructor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LiveClassroomPage,
});

/** One paid session per class per day. */
function liveSessionKey(classId: string) {
  return `hasPaid_live_${classId}_${new Date().toISOString().split("T")[0]}`;
}


interface FloatingNote {
  id: number;
  text: string;
}

function LiveClassroomPage() {
  const { classId } = Route.useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [cls, setCls] = useState<LiveClassroom | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [requests, setRequests] = useState<StageRequest[]>([]);
  const [allChat, setAllChat] = useState<ClassMessage[]>([]);
  const [qa, setQa] = useState<ClassMessage[]>([]);
  const [votes, setVotes] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"all" | "qa">("all");
  const [draft, setDraft] = useState("");
  const [now, setNow] = useState(Date.now());
  const [lastFreeMessage, setLastFreeMessage] = useState(0);
  const [ending, setEnding] = useState(false);
  const [hasPaid, setHasPaid] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [notes, setNotes] = useState<FloatingNote[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const lastTapRef = useRef<Record<string, number>>({});

  const isHost = Boolean(user && cls && user.id === cls.host_id);

  const { amount: price } = useAppPrice("classroom_raise");
  const freeAccess = useFreeAccess();

  const pushNote = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setNotes((prev) => [...prev, { id, text }]);
    window.setTimeout(() => setNotes((prev) => prev.filter((n) => n.id !== id)), 3200);
  }, []);

  useEffect(() => {
    setHasPaid(localStorage.getItem(liveSessionKey(classId)) === "true");
  }, [classId]);
  useEffect(() => {
    if (freeAccess.classroom_raise || price <= 0) setHasPaid(true);
  }, [freeAccess.classroom_raise, price]);

  const unlocked = isHost || hasPaid;

  // ===== Money saver: only the teacher and the promoted student join Agora.
  // Everyone else watches the cheap HLS stream. =====
  const myRequest = useMemo(
    () => requests.find((row) => row.user_id === user?.id) ?? null,
    [requests, user?.id],
  );
  const myHandUp =
    myRequest?.status === "pending" ||
    myRequest?.status === "waiting" ||
    myRequest?.status === "approved";
  const iAmLive = myRequest?.status === "approved";

  const spotlight = useMemo(
    () => requests.find((row) => row.status === "approved") ?? null,
    [requests],
  );

  // Only the teacher and the student currently on stage join the real-time
  // room (Cloudflare Calls). Everybody else simply watches the cheap 360p
  // stream, which keeps data and streaming costs tiny.
  const onStage = isHost || iAmLive;
  const callsRoom = cls && user && onStage ? `class_${cls.id}` : null;
  const room = useCallsRoom(callsRoom, user?.id ?? null, isHost ? "host" : "audience");

  const load = useCallback(async () => {
    const data = await fetchClassroom(classId);
    setCls(data);
    setLoading(false);
    if (!data) return;
    const [seats, stage, chat, questions] = await Promise.all([
      fetchEnrollments(classId),
      fetchStageRequests(classId),
      fetchMessages(classId, "all"),
      fetchMessages(classId, "qa"),
    ]);
    setEnrollments(seats);
    setRequests(stage);
    setAllChat(chat);
    setQa(questions);
    if (user) setVotes(await fetchMyVotes(classId, user.id));
  }, [classId, user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`classroom-${classId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "class_messages", filter: `class_id=eq.${classId}` },
        () => {
          void fetchMessages(classId, "all").then(setAllChat);
          void fetchMessages(classId, "qa").then(setQa);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "class_stage_requests",
          filter: `class_id=eq.${classId}`,
        },
        () => void fetchStageRequests(classId).then(setRequests),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "class_enrollments",
          filter: `class_id=eq.${classId}`,
        },
        () => void fetchEnrollments(classId).then(setEnrollments),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_classes", filter: `id=eq.${classId}` },
        () => void fetchClassroom(classId).then((data) => data && setCls(data)),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [classId]);

  // ===== LOCAL CAMERA =====
  // Open the camera immediately (teacher, or a student promoted to the stage)
  // and show it in the local <video> so the stage is never black.
  const needsCamera = onStage;
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    if (!needsCamera || localStreamRef.current) return;
    let cancelled = false;
    (async () => {
      if (typeof window !== "undefined" && !window.isSecureContext) {
        setCameraError(
          "This page is not on a secure (https) connection, so the camera cannot start. Open the published app link and try again.",
        );
        return;
      }
      try {
        const stream = await startCamera({ facingMode: "user", width: 640, height: 360 });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
        setCameraError(null);
      } catch (err) {
        setCameraError(
          `${err instanceof Error ? err.message : String(err)}. Check camera permission in your browser or phone settings.`,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [needsCamera]);

  // Attach (and keep attached) the local stream to the visible video element.
  useEffect(() => {
    const el = localVideoRef.current;
    if (!el || !localStream) return;
    el.srcObject = localStream;
    void el.play().catch(() => undefined);
  }, [localStream, needsCamera, spotlight?.id]);

  // Release the camera when leaving the classroom.
  useEffect(
    () => () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    },
    [],
  );

  // ===== TEACHER =====
  // The teacher publishes to the real-time room (so the student on stage can
  // see and hear them) AND sends one mixed copy to Cloudflare, which turns it
  // into the cheap stream the rest of the class watches.
  const mixRef = useRef<ClassMix | null>(null);
  const whipRef = useRef<WhipBroadcast | null>(null);
  const broadcastRef = useRef(false);
  const notifiedRef = useRef(false);
  const [broadcastReady, setBroadcastReady] = useState(false);
  const pushToUser = useServerFn(sendPushToUser);

  useEffect(() => {
    if (!isHost || !cls || !localStream) return;
    if (room.joined && !room.publishing) {
      void room
        .startPublishing(true, localStream)
        .catch(() => toast.error("Allow camera and microphone to teach this class"));
    }
    if (broadcastRef.current) return;
    broadcastRef.current = true;
    void (async () => {
      try {
        const input = await ensureLiveInput(cls.topic, cls.stream_input_uid);
        if (!input.whipUrl || !input.hlsUrl) throw new Error("no live input");
        const mix = createClassMix(localStream);
        mixRef.current = mix;
        whipRef.current = await startWhipBroadcast(mix.stream, input.whipUrl);
        // Ready check: wait until the student stream actually plays before
        // opening the class to students (max ~20s, then open anyway).
        for (let i = 0; i < 20; i++) {
          try {
            const res = await fetch(input.hlsUrl, { cache: "no-store" });
            if (res.ok) break;
          } catch {
            /* keep waiting */
          }
          await new Promise((r) => setTimeout(r, 1000));
        }
        await setClassStream(cls.id, input.uid, input.hlsUrl);
        setBroadcastReady(true);
        if (!notifiedRef.current) {
          notifiedRef.current = true;
          void (async () => {
            try {
              const { data: students } = await supabase
                .from("profiles")
                .select("id")
                .neq("id", cls.host_id)
                .limit(500);
              for (const student of (students ?? []) as { id: string }[]) {
                await pushToUser({
                  data: {
                    userId: student.id,
                    title: `${profile?.display_name ?? "Your teacher"} is live now`,
                    body: cls.topic,
                    url: `/education/live/${cls.id}`,
                    tag: `live-${cls.id}`,
                    actions: [
                      { action: "join", title: "Join live" },
                      { action: "skip", title: "Skip class" },
                    ],
                    classId: cls.id,
                  },
                });
              }
            } catch {
              /* best-effort */
            }
          })();
        }
      } catch {
        broadcastRef.current = false;
        toast.error("Could not start the class broadcast — students may not see you");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, room.joined, room.publishing, cls?.id, localStream]);

  // Put the student on stage inside the picture everyone watches.
  useEffect(() => {
    const mix = mixRef.current;
    if (!isHost || !mix) return;
    const guest = spotlight
      ? room.remoteUsers.find((remote) => remote.uid === spotlight.user_id)
      : null;
    const video = guest?.videoTrack?.getMediaStreamTrack() ?? null;
    const audio = guest?.audioTrack?.getMediaStreamTrack() ?? null;
    mix.setGuestVideo(video ? new MediaStream([video]) : null);
    mix.setGuestAudio(audio);
  }, [isHost, spotlight?.user_id, room.remoteUsers]);

  // Stop the broadcast when the teacher leaves the page.
  useEffect(
    () => () => {
      void whipRef.current?.stop();
      whipRef.current = null;
      mixRef.current?.stop();
      mixRef.current = null;
    },
    [],
  );

  // ===== STUDENT ON STAGE =====
  const wasLiveRef = useRef(false);
  useEffect(() => {
    if (isHost) return;
    if (iAmLive && !wasLiveRef.current && room.joined && !room.publishing && localStream) {
      void room
        .startPublishing(true, localStream)
        .then(() => pushNote("You are LIVE — the whole class can hear you"))
        .catch(() => toast.error("Allow camera and microphone to go live"));
    }
    if (!iAmLive && wasLiveRef.current) {
      // Back to a normal viewer: camera off, cheap stream on.
      void room.stopPublishing();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
      pushNote("You returned to viewers — raise hand again free");
    }
    wasLiveRef.current = iAmLive;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iAmLive, isHost, room.joined, room.publishing, localStream]);

  // Self-preview mirroring: local video is mirrored like a real mirror,
  // remote viewers always see the normal (unmirrored) picture.
  const [mirrorLocal, setMirrorLocal] = useState(true);

  // Draggable teacher picture-in-picture (used while a student is on the main stage).
  const [pip, setPip] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const startPipDrag = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, ox: pip.x, oy: pip.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const movePipDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setPip({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) });
  };
  const endPipDrag = () => {
    dragRef.current = null;
  };


  // Everyone with a hand up: teacher-only queue strip.
  const handQueue = useMemo(
    () => requests.filter((row) => row.status === "pending" || row.status === "waiting"),
    [requests],
  );

  const remoteTrackFor = useCallback(
    (userId: string) =>
      room.remoteUsers.find((remote) => remote.uid === userId)?.videoTrack ?? null,
    [room.remoteUsers],
  );

  const endsAt = useMemo(() => {
    if (!cls) return 0;
    if (cls.scheduled_end_at) return new Date(cls.scheduled_end_at).getTime();
    return new Date(cls.started_at).getTime() + cls.duration_minutes * 60_000;
  }, [cls]);
  void endsAt;

  const totalWatching = Math.max(cls?.viewers_count ?? 0, enrollments.length);
  const cooldownLeft = unlocked ? 0 : lastFreeMessage + FREE_CHAT_COOLDOWN_MS - now;

  async function handleSend() {
    if (!user || !cls || !draft.trim()) return;
    if (tab === "qa" && !unlocked) {
      toast.error(`Pay GHS ${price} to ask in the paid Q&A`);
      return;
    }
    if (tab === "all" && cooldownLeft > 0) {
      toast.error(`Free chat is 1 message per 5 minutes — ${formatCountdown(cooldownLeft)} left`);
      return;
    }
    const body = draft.trim();
    setDraft("");
    await sendClassMessage({ classId: cls.id, userId: user.id, channel: tab, body });
    if (!unlocked) setLastFreeMessage(Date.now());
  }

  async function handlePhoto(file: File) {
    if (!user || !cls || !unlocked) return;
    try {
      const path = await uploadClassMedia(user.id, file, "photo");
      await sendClassMessage({
        classId: cls.id,
        userId: user.id,
        channel: "qa",
        body: "Shared a photo of my work",
        imagePath: path,
      });
      setTab("qa");
    } catch {
      toast.error("Could not upload that photo");
    }
  }

  async function joinStage() {
    if (!user || !cls) {
      toast.error("Sign in to raise your hand");
      return;
    }
    try {
      await requestStage(cls.id, user.id);
      setRequests(await fetchStageRequests(cls.id));
      pushNote(`✋ ${profile?.display_name ?? "You"} raised a hand — waiting for the teacher`);
    } catch {
      toast.error("Could not raise your hand — try again");
    }
  }

  /** Teacher: put this student live for the whole class (one at a time). */
  async function spotlightStudent(req: StageRequest) {
    const current = requests.find((row) => row.status === "approved" && row.id !== req.id);
    if (current) await setStageStatus(current.id, "pending");
    await setStageStatus(req.id, "approved");
    setRequests(await fetchStageRequests(classId));
    pushNote(`${req.student?.display_name ?? "Student"} is live`);
  }

  /** Teacher: mark the raised hand as "wait" (yellow). */
  async function toggleWait(req: StageRequest) {
    await setStageStatus(req.id, req.status === "waiting" ? "pending" : "waiting");
    setRequests(await fetchStageRequests(classId));
  }

  /** Teacher: close the live student and resume the teacher camera. */
  async function closeSpotlight(req: StageRequest) {
    await setStageStatus(req.id, "pending");
    setRequests(await fetchStageRequests(classId));
  }

  function handleRaiseHand() {
    if (hasPaid || isHost) {
      void joinStage();
      return;
    }
    setPayOpen(true);
  }

  async function confirmMockPay() {
    setPayOpen(false);
    await payWithPaystack(user?.email ?? "", price, () => {
      localStorage.setItem(liveSessionKey(classId), "true");
      setHasPaid(true);
      pushNote("Paid for this class ✓");
      void joinStage();
    });
  }

  async function removeFromStage(req: StageRequest) {
    await setStageStatus(req.id, "ended");
    setRequests(await fetchStageRequests(classId));
    pushNote(`${req.student?.display_name ?? "Student"} returned to viewers — can raise hand again free`);
  }

  async function handleEndLive() {
    if (!cls || !user) return;
    setEnding(true);
    try {
      await whipRef.current?.stop().catch(() => undefined);
      whipRef.current = null;
      mixRef.current?.stop();
      mixRef.current = null;
      broadcastRef.current = false;
      await endClass(cls.id);
      await room.leave();
      await navigate({ to: "/" });
    } finally {
      setEnding(false);
    }
  }

  /** Leave button: release camera + microphone, close the connection, go home. */
  async function handleLeave() {
    await room.leave();
    await navigate({ to: "/" });
  }

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-black text-white">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!cls) {
    return (
      <div className="grid min-h-dvh place-items-center bg-black text-white">
        <div className="text-center">
          <h1 className="text-lg font-semibold">This class is not available</h1>
          <Button className="mt-4" variant="secondary" onClick={() => void navigate({ to: "/" })}>
            Back home
          </Button>
        </div>
      </div>
    );
  }

  const messages = tab === "all" ? allChat : qa;
  const hlsSrc = cls.hls_url ?? "";

  const railButton = (
    key: string,
    icon: React.ReactNode,
    label: string,
    onClick: () => void,
    opts?: { active?: boolean; locked?: boolean },
  ) => (
    <button
      key={key}
      type="button"
      title={label}
      aria-label={label}
      disabled={opts?.locked}
      onClick={onClick}
      className={`grid h-[56px] w-[56px] place-items-center rounded-full border border-white/25 bg-white/10 text-white shadow-[0_6px_18px_rgba(0,0,0,0.45)] backdrop-blur-xl transition ${
        opts?.locked ? "opacity-45" : "hover:bg-white/20 active:scale-95"
      } ${opts?.active ? "ring-2 ring-[#25D366]" : ""}`}
    >
      {icon}
      {opts?.locked ? <Lock className="absolute h-3 w-3 translate-x-4 translate-y-4" /> : null}
    </button>
  );

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black text-white">
      {/* ===== FULL-BLEED VIDEO ===== */}
      {/* Teacher: own Agora camera. Students: cheap HLS stream (or the live
          promoted student's own camera while they are on stage). */}
      <div
        onPointerDown={spotlight && isHost ? startPipDrag : undefined}
        onPointerMove={spotlight && isHost ? movePipDrag : undefined}
        onPointerUp={spotlight && isHost ? endPipDrag : undefined}
        onPointerCancel={spotlight && isHost ? endPipDrag : undefined}
        style={
          spotlight && isHost
            ? { transform: `translate(${pip.x}px, ${pip.y}px)`, touchAction: "none" }
            : undefined
        }
        className={
          spotlight && isHost
            ? "absolute bottom-24 right-4 z-50 h-[200px] w-[150px] cursor-grab overflow-hidden rounded-2xl border-2 border-white/70 bg-black shadow-[0_10px_30px_rgba(0,0,0,0.6)] active:cursor-grabbing"
            : "absolute inset-0"
        }
      >
        {needsCamera ? (
          <>
            <video
              id="localVideo"
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              style={{ transform: mirrorLocal ? "scaleX(-1)" : "scaleX(1)" }}
              className="absolute inset-0 z-[1] h-full w-full bg-black object-cover"
            />
            {cameraError ? (
              <div className="absolute inset-0 z-[2] grid place-items-center bg-black/90 p-6 text-center">
                <p className="text-base font-bold leading-snug text-[#ff4444]">
                  Camera Error: {cameraError}
                </p>
              </div>
            ) : !localStream ? (
              <div className="absolute inset-0 z-[2] grid place-items-center bg-black text-sm text-white/70">
                Starting your camera…
              </div>
            ) : isHost && !broadcastReady ? (
              <div className="pointer-events-none absolute inset-x-0 top-3 z-[2] mx-auto w-fit rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white">
                Getting you live… students join in a moment
              </div>
            ) : isHost ? (
              <div className="pointer-events-none absolute inset-x-0 top-3 z-[2] mx-auto w-fit rounded-full bg-[#25D366] px-3 py-1 text-xs font-bold text-black">
                ● You're live — students can join
              </div>
            ) : null}
          </>
        ) : (spotlight && remoteTrackFor(spotlight.user_id)) ||
          (cls.host_id && remoteTrackFor(cls.host_id)) ? (
          <VideoTile
            track={
              (spotlight ? remoteTrackFor(spotlight.user_id) : null) ??
              remoteTrackFor(cls.host_id)
            }
            className="absolute inset-0 h-full w-full"
          />

        ) : hlsSrc ? (
          <HlsPlayer src={hlsSrc} className="absolute inset-0 h-full w-full" />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-black text-sm text-white/70">
            {onStage
              ? room.joined
                ? "Waiting for teacher camera…"
                : "Connecting you to the stage…"
              : "Waiting for the teacher to start the class…"}
          </div>
        )}
        {spotlight && isHost ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/60 px-2 py-1 text-[10px] font-semibold">
            <span>You</span>
            {room.micOn ? (
              <Mic className="h-3 w-3 text-[#25D366]" />
            ) : (
              <MicOff className="h-3 w-3 text-[#ff4444]" />
            )}
          </div>
        ) : null}
      </div>

      {/* Students keep seeing the teacher in a small corner box while a
          classmate is on the main stage (or while they are on stage). */}
      {!isHost && spotlight && cls.host_id && remoteTrackFor(cls.host_id) ? (
        <div className="absolute bottom-24 right-4 z-50 h-[160px] w-[120px] overflow-hidden rounded-2xl border-2 border-white/70 bg-black shadow-[0_10px_30px_rgba(0,0,0,0.6)]">
          <VideoTile track={remoteTrackFor(cls.host_id)} className="h-full w-full" />
          <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-[10px] font-semibold">
            Teacher
          </span>
        </div>
      ) : null}


      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/70" />

      {/* ===== TOP FLOATING BAR ===== */}
      <span className="absolute left-3 top-16 z-30 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-semibold text-white/85 backdrop-blur">
        360p • Data Saver
      </span>

      <div className="absolute inset-x-3 top-3 z-30 flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3 py-2 backdrop-blur-xl">
        <FindMitLogo size="sm" linkToHome={false} />
        <span className="min-w-0 flex-1 truncate text-[13px] text-white/85">
          📖 {cls.host?.display_name ?? "Instructor"} • LIVE
        </span>
        <span className="flex items-center gap-1 rounded-md bg-[#ff2d43] px-2 py-0.5 text-[11px] font-bold">
          LIVE
        </span>
        <span className="flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[11px] text-white/85">
          <Eye className="h-3.5 w-3.5" /> {totalWatching} watching
        </span>
        {isHost ? (
          <button
            type="button"
            onClick={handleEndLive}
            disabled={ending}
            className="rounded-full bg-white/15 px-2.5 py-1 text-[11px]"
          >
            {ending ? <Loader2 className="h-3 w-3 animate-spin" /> : "End"}
          </button>
        ) : (
          <button
            type="button"
            aria-label="Leave"
            onClick={() => void handleLeave()}
            className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold"
          >
            <LogOut className="h-3.5 w-3.5" /> Leave
          </button>
        )}
      </div>

      {/* ===== RIGHT FLOATING RAIL (teacher, or promoted student) ===== */}
      <div
        className={`absolute right-3 top-[84px] z-30 flex-col items-center gap-4 ${
          isHost || iAmLive ? "flex" : "hidden"
        }`}
      >
        {railButton(
          "mic",
          room.micOn ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />,
          "Microphone",
          () => void room.toggleMic(),
          { locked: !unlocked, active: room.micOn },
        )}
        {railButton(
          "cam",
          room.camOn ? <Camera className="h-6 w-6" /> : <CameraOff className="h-6 w-6" />,
          "Camera",
          () => void room.toggleCamera(),
          { locked: !unlocked, active: room.camOn },
        )}
        {railButton(
          "flip",
          <SwitchCamera className="h-6 w-6" />,
          "Flip camera",
          () => void room.flipCamera(),
          { locked: !unlocked },
        )}
        {railButton(
          "mirror",
          <FlipHorizontal className="h-6 w-6" />,
          mirrorLocal ? "Mirror: ON (my preview)" : "Mirror: OFF (whiteboard text)",
          () => setMirrorLocal((on) => !on),
          { active: mirrorLocal },
        )}
        {railButton(
          "upload",
          <CloudUpload className="h-6 w-6" />,
          "Upload blueprint or progress photo",
          () => fileRef.current?.click(),
          { locked: !unlocked },
        )}
      </div>

      {/* ===== GOLD RAISE HAND (students/viewers, never teacher) ===== */}
      {!isHost ? (
        <div className="absolute right-3 top-1/2 z-30 -translate-y-1/2">
          <button
            type="button"
            onClick={handleRaiseHand}
            aria-label="Raise hand"
            disabled={iAmLive}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-black shadow-[0_0_18px_rgba(255,196,60,0.55)] transition active:scale-95 ${
              hasPaid ? "border-2 border-[#25D366]" : "border border-[#ffe9a8]"
            }`}
            style={
              iAmLive
                ? { background: "linear-gradient(135deg,#ff5b5b,#d90429)" }
                : { background: "linear-gradient(135deg,#FFE08A,#F5A623)" }
            }
          >
            <Hand className="h-3.5 w-3.5" />
            <span className="text-left leading-tight">
              <span className="block font-display text-[10px] font-extrabold">
                {iAmLive ? "🔴 Live" : "Raise Hand"}
              </span>
              <span className="block text-[8px] font-bold">
                {iAmLive ? "You are on stage" : hasPaid ? "Paid ✓" : `GHS ${price}`}
              </span>
            </span>
          </button>
        </div>
      ) : null}

      {/* ===== FLOATING NOTES ===== */}
      <div className="pointer-events-none absolute inset-x-0 top-1/3 z-30 flex flex-col items-center gap-2">
        {notes.map((note) => (
          <span
            key={note.id}
            className="animate-fade-in rounded-full bg-black/70 px-4 py-2 text-sm font-semibold backdrop-blur-md"
          >
            {note.text}
          </span>
        ))}
      </div>

      {/* ===== SPOTLIGHT: teacher watches the live student fullscreen ===== */}
      {spotlight && isHost ? (
        <div className="absolute inset-0 z-40 bg-black">
          <VideoTile
            track={remoteTrackFor(spotlight.user_id)}
            className="h-full w-full [&_video]:object-cover"
            fallback="Student camera starting…"
          />
          <span className="absolute inset-x-0 top-16 z-10 mx-auto w-fit rounded-full bg-black/65 px-3 py-1 text-xs font-semibold backdrop-blur">
            {spotlight.student?.display_name ?? "Student"} is live
          </span>
          <button
            type="button"
            aria-label="Close student and resume my camera"
            onClick={() => void closeSpotlight(spotlight)}
            className="absolute right-3 top-16 grid h-10 w-10 place-items-center rounded-full border-2 border-white bg-[#ff4444] text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      ) : null}

      {/* ===== TEACHER QUEUE STRIP (teacher only) ===== */}
      {isHost && handQueue.length > 0 ? (
        <div className="absolute inset-x-0 bottom-[86px] z-50 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {handQueue.map((req) => {
            const waiting = req.status === "waiting";
            return (
              <div
                key={req.id}
                className={`relative h-[104px] w-[84px] shrink-0 overflow-hidden rounded-xl border-2 ${
                  waiting ? "border-[#FFD400] shadow-[0_0_18px_rgba(255,212,0,0.55)]" : "border-white/60"
                }`}
                onClick={() => {
                  const last = lastTapRef.current[req.id] ?? 0;
                  const nowTs = Date.now();
                  if (nowTs - last < 320) {
                    lastTapRef.current[req.id] = 0;
                    void spotlightStudent(req);
                  } else {
                    lastTapRef.current[req.id] = nowTs;
                    window.setTimeout(() => {
                      if (lastTapRef.current[req.id] === nowTs) {
                        lastTapRef.current[req.id] = 0;
                        void toggleWait(req);
                      }
                    }, 330);
                  }
                }}
              >
                <div className="grid h-full w-full place-items-center bg-black/70 text-2xl">✋</div>
                <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 py-0.5 text-center text-[9px] font-medium">
                  {req.student?.display_name ?? "Student"}
                </span>
                {waiting ? (
                  <span className="absolute left-1 top-1 rounded bg-[#FFD400] px-1 text-[8px] font-bold text-black">
                    WAIT
                  </span>
                ) : null}
                <button
                  type="button"
                  aria-label="Lower this hand"
                  onClick={(event) => {
                    event.stopPropagation();
                    void removeFromStage(req);
                  }}
                  className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full border border-white bg-[#ff4444]"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* ===== FLOATING CHAT (bottom left) ===== */}
      <div className="absolute bottom-[86px] left-3 z-20 w-[62%] max-w-[420px]">
        <div className="mb-2 flex w-fit rounded-full bg-black/50 p-1 text-[11px] backdrop-blur-md">
          {(["all", "qa"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-full px-3 py-1 ${
                tab === key ? "bg-[#FFD36A] font-semibold text-black" : "text-white/70"
              }`}
            >
              {key === "all" ? "All chat" : "Paid Q&A"}
            </button>
          ))}
        </div>
        <div className="max-h-[34vh] overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ChatList
            messages={messages}
            locked={tab === "qa" && !unlocked}
            price={price}
            isHost={isHost}
            votes={votes}
            canVote={unlocked}
            onVote={handleVote}
            floating
          />
        </div>
      </div>

      {/* ===== BOTTOM COMPOSER ===== */}
      <div className="absolute inset-x-3 bottom-4 z-30">
        {tab === "all" && cooldownLeft > 0 ? (
          <p className="pb-1 text-center text-[11px] text-amber-300">
            Free chat cooldown · {formatCountdown(cooldownLeft)}
          </p>
        ) : null}
        <div className="flex items-center gap-2 rounded-full border border-white/20 bg-black/45 px-5 py-1 backdrop-blur-xl">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleSend();
            }}
            placeholder="Say something..."
            disabled={tab === "qa" && !unlocked}
            className="h-11 border-0 bg-transparent text-[15px] text-white placeholder:text-white/60 focus-visible:ring-0"
          />
          <button
            type="button"
            aria-label="Send gift"
            onClick={handleRaiseHand}
            className="text-[#FFD36A]"
          >
            <Gift className="h-6 w-6" />
          </button>
          <button
            type="button"
            aria-label="Send message"
            onClick={() => void handleSend()}
            className="grid h-9 w-9 place-items-center rounded-full border border-[#FFD36A]/70 text-[#FFD36A]"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handlePhoto(file);
          event.target.value = "";
        }}
      />

      {/* ===== MOCK PAY MODAL ===== */}
      {payOpen ? (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/60 px-6 backdrop-blur">
          <div className="w-full max-w-sm rounded-3xl border border-white/15 bg-[#141414] p-6 text-center shadow-2xl">
            <div
              className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full text-black"
              style={{ background: "linear-gradient(135deg,#FFE08A,#F5A623)" }}
            >
              <Hand className="h-7 w-7" />
            </div>
            <h2 className="text-lg font-semibold">Join stage for GHS {price}?</h2>
            <p className="mt-1 text-sm text-white/60">
              Unlimited raises in this class. Pay with MoMo or card.
            </p>
            <Button
              className="mt-5 h-12 w-full rounded-full text-black"
              style={{ background: "linear-gradient(135deg,#FFE08A,#F5A623)" }}
              onClick={() => void confirmMockPay()}
            >
              Pay GHS {price} — Join Now
            </Button>
            <button
              type="button"
              className="mt-3 text-xs text-white/50"
              onClick={() => setPayOpen(false)}
            >
              Not now
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );

  async function handleVote(message: ClassMessage) {
    if (!user) return;
    const added = await toggleUpvote(message.id, user.id, message.upvotes);
    setVotes((prev) => {
      const next = new Set(prev);
      if (added) next.add(message.id);
      else next.delete(message.id);
      return next;
    });
  }
}

function ChatList({
  messages,
  locked,
  price,
  isHost,
  votes,
  canVote,
  onVote,
  floating,
}: {
  messages: ClassMessage[];
  locked: boolean;
  price: number;
  isHost: boolean;
  votes: Set<string>;
  canVote: boolean;
  onVote: (message: ClassMessage) => void;
  floating?: boolean;
}) {
  if (locked) {
    return (
      <div className="grid place-items-center py-8 text-center">
        <div className="rounded-2xl bg-black/50 px-4 py-3 backdrop-blur">
          <Lock className="mx-auto mb-2 h-5 w-5 text-white/50" />
          <p className="text-xs text-white/70">Pay GHS {price} to ask and show your work</p>
        </div>
      </div>
    );
  }
  if (messages.length === 0) {
    return (
      <p className="mx-auto my-6 w-fit rounded-2xl bg-black/40 px-4 py-2 text-xs text-white/40 backdrop-blur">
        No messages yet
      </p>
    );
  }
  return (
    <div className={floating ? "flex flex-col items-start" : "space-y-1"}>
      {messages.map((message) => (
        <MessageRow
          key={message.id}
          message={message}
          isHost={isHost}
          voted={votes.has(message.id)}
          canVote={canVote}
          onVote={() => onVote(message)}
        />
      ))}
    </div>
  );
}

function MessageRow({
  message,
  isHost,
  voted,
  canVote,
  onVote,
}: {
  message: ClassMessage;
  isHost: boolean;
  voted: boolean;
  canVote: boolean;
  onVote: () => void;
}) {
  const avatar = useAvatarUrl(message.author?.photo_path);
  const image = useClassMediaUrl(message.image_path);
  const isQa = message.channel === "qa";
  return (
    <div
      className={`my-1.5 max-w-[80%] animate-fade-in rounded-2xl bg-black/50 px-3 py-2 backdrop-blur-sm ${
        isQa ? "border-l-[3px] border-[#FFD700] shadow-[0_0_12px_rgba(255,215,0,0.25)]" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <Avatar className="h-5 w-5">
          <AvatarImage src={avatar ?? undefined} />
          <AvatarFallback>{message.author?.display_name?.[0] ?? "?"}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-white/60">
            {message.author?.display_name ?? "Student"}
            {message.answered ? <span className="ml-1 text-[#25D366]">· answered</span> : null}
          </p>
          <p className="break-words text-[13px]">{message.body}</p>
          {image ? (
            <img
              src={image}
              alt="Student work"
              loading="lazy"
              className="mt-2 max-h-36 rounded-lg object-cover"
            />
          ) : null}
        </div>
        {isQa ? (
          <button
            type="button"
            disabled={!canVote}
            onClick={onVote}
            className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] ${
              voted ? "bg-[#FFD700] text-black" : "bg-white/10"
            }`}
          >
            <ThumbsUp className="h-3 w-3" /> {message.upvotes}
          </button>
        ) : null}
      </div>
      {isHost && isQa ? (
        <Button
          size="sm"
          variant="ghost"
          className="mt-1 h-6 text-[10px]"
          onClick={() => void markAnswered(message.id, !message.answered)}
        >
          {message.answered ? "Mark unanswered" : "Mark answered"}
        </Button>
      ) : null}
    </div>
  );
}
