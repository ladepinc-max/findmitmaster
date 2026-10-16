import { useCachedState } from "@/lib/page-cache";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  BadgeCheck,
  Radio,
  Upload,
  Loader2,
  Eye,
  Play,
  GraduationCap,
  Home,
  SquarePlus,
  School,
  Monitor,
  Wrench,
  Tv,
  WandSparkles,
  Check,
  FolderOpen,
  Share2,
} from "lucide-react";
import { AppShell, EmptyState } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { Post } from "@/lib/social";
import { useMediaUrl, uploadPostMedia, extensionOf, readVideoDuration, formatCount } from "@/lib/media";
import { isCfStreamReady, uploadToCfStream, cfMediaPath } from "@/lib/cf-stream";
import {
  createLiveSession,
  endLiveSession,
  fetchLiveSessions,
  fetchMyLiveSession,
  forgetLiveId,
  rememberLiveId,
  type LiveSession,
} from "@/lib/live-sessions";
import { fetchLiveClasses, startLiveClass, endLiveClass, type LiveClass } from "@/lib/live";
import { useAppSections, useIsSuperAdmin, isVisibleTo, isLockedFor, type SectionId } from "@/lib/app-sections";
import { SectionToggles } from "@/components/admin/SectionToggles";
import { sendPushToUser } from "@/lib/push.functions";
import { useRole } from "@/lib/roles";
import { StationsPage } from "./stations";
import { AdminPartnerTvs } from "./admin.partner-tvs";

import { LiveHost } from "@/components/live/LiveHost";
import { LiveBroadcast } from "@/components/live/LiveBroadcast";
import { LiveWatch } from "@/components/live/LiveWatch";
import { LiveTakeover } from "@/components/tv/LiveTakeover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { TvCategory } from "@/lib/social";
import { LiveTvStage } from "@/components/tv/LiveTv";
import { useTvChoice } from "@/lib/tv-choice";
import {
  TV_LABELS,
  fetchTvChannels,
  formatCountdown,
  getLivePosition,
  retireChannel,
  startBroadcast,
  type TvChannelState,
} from "@/lib/tv-live";



export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Stories — FindMit" },
      {
        name: "description",
        content: "Watch recorded stories and join ongoing live classes on FindMit.",
      },
      { property: "og:title", content: "Stories — FindMit" },
      {
        property: "og:description",
        content: "Watch recorded stories and join ongoing live classes on FindMit.",
      },
    ],
  }),
  component: StoriesPage,
});

import { useStoriesInnerTab } from "@/lib/stories-nav";

/** Sends people who are not signed in on this device to the sign-in screen. */
function SignedOutGate() {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/auth", replace: true });
  }, [navigate]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function StoriesPage() {
  const [tab, setTab] = useStoriesInnerTab();
  const { profile, user, session, loading: authLoading } = useAuth();
  const [hosting, setHosting] = useState<LiveSession | null>(null);
  const [broadcasting, setBroadcasting] = useState<LiveSession | null>(null);
  const [watching, setWatching] = useState<LiveSession | null>(null);
  const [myLive, setMyLive] = useState<LiveSession | null>(null);
  const [endingLive, setEndingLive] = useState(false);
  // Roles decide the tabs: public = no Post, teacher = Post with Start Class only, admin = all.
  const { role } = useRole();
  const admin = role === "admin";
  const canPost = role === "admin" || role === "teacher";

  useEffect(() => {
    if (!canPost && tab === "post") setTab("home");
    if (!admin && tab === "manage-tv") setTab("home");
  }, [canPost, admin, tab, setTab]);

  // A host can navigate away while their session stays live — detect and offer resume/end.
  useEffect(() => {
    if (!profile) return;
    let active = true;
    const load = () =>
      void fetchMyLiveSession(profile.id)
        .then((row) => {
          if (!active) return;
          setMyLive(row);
          if (row) rememberLiveId(row.id);
          else forgetLiveId();
        })
        .catch(() => {});
    load();

    const channel = supabase
      .channel(`my-live-${profile.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_sessions", filter: `host_id=eq.${profile.id}` },
        () => load(),
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [profile, hosting]);

  const endMyLive = async (session: LiveSession) => {
    setEndingLive(true);
    try {
      await endLiveSession(session.id);
      setHosting(null);
      setMyLive(null);
      forgetLiveId();
      toast.success("Live class ended");
    } catch {
      toast.error("Could not end the live class");
    } finally {
      setEndingLive(false);
    }
  };

  // Visitors who are not signed in on this device go straight to the sign-in screen.
  if (!authLoading && !session) {
    return <SignedOutGate />;
  }

  return (
    <AppShell hideNavigation>


      {myLive && !hosting && !broadcasting ? (
        <div className="sticky top-12 z-20 flex flex-wrap items-center gap-2 bg-destructive px-4 py-3">
          <p className="flex-1 text-sm font-bold text-destructive-foreground">
            🔴 You are live — {myLive.topic}
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setWatching(null);
              setHosting(myLive);
              setTab("live");
            }}
          >
            <Radio className="size-4" /> Reconnect
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={endingLive}
            onClick={() => void endMyLive(myLive)}
          >
            {endingLive ? <Loader2 className="size-4 animate-spin" /> : null} End Live ❌
          </Button>
        </div>
      ) : null}

      <div className="min-h-screen pt-0">
        {broadcasting && profile ? (
          <LiveBroadcast
            isBroadcaster
            onEnd={async () => {
              try {
                await endLiveSession(broadcasting.id);
              } catch {
                /* ignore */
              }
              setBroadcasting(null);
              setTab("home");
            }}
          />
        ) : hosting && profile ? (
          <LiveHost session={hosting} hostId={profile.id} onEnded={() => setHosting(null)} />
        ) : watching && profile ? (
          <LiveWatch
            session={watching}
            viewerId={profile.id}
            viewerEmail={user?.email ?? null}
            onLeave={() => setWatching(null)}
          />
        ) : (
          <>
            {tab === "home" ? (
              <>
                <HomeFeed />
                <LiveTakeover />
              </>
            ) : null}
            {tab === "live" ? (
              <LivePanel
                myHostId={profile?.id ?? null}
                onWatch={setWatching}
                onResume={(session) => {
                  setWatching(null);
                  setHosting(session);
                }}
                onEnd={(session) => void endMyLive(session)}
              />
            ) : null}
            {tab === "post" && canPost ? (
              <PostPanel
                teacherOnly={role === "teacher"}
                onLiveStarted={(session) => {
                  setHosting(session);
                  setTab("live");
                }}
                onBroadcastStarted={(session) => {
                  setTab("home");
                  setTimeout(() => setBroadcasting(session), 300);
                }}
              />
            ) : null}
            {tab === "stations" ? <StationsPage /> : null}
            {tab === "manage-tv" && admin ? <AdminPartnerTvs /> : null}
          </>
        )}
      </div>
      {!hosting && !watching && !broadcasting ? <TvBottomNav tab={tab} onChange={setTab} isAdmin={admin} canPost={canPost} /> : null}
    </AppShell>
  );
}



/* ----------------------------- HOME ----------------------------- */

function HomeFeed() {
  const { profile } = useAuth();
  const [states, setStates] = useCachedState<TvChannelState[]>("home:tv-states", []);
  const [choice] = useTvChoice();
  const retired = useRef<Set<string>>(new Set());

  const load = () => {
    void fetchTvChannels()
      .then(setStates)
      .catch(() => setStates([]));
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("tv-channels-home")
      .on("postgres_changes", { event: "*", schema: "public", table: "tv_channels" }, () => load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // Every second, take finished broadcasts offline and clear their clips.
  useEffect(() => {
    const id = window.setInterval(() => {
      for (const state of states) {
        const { channel, clips, category } = state;
        if (!channel?.is_live || retired.current.has(channel.id)) continue;
        if (getLivePosition(channel) < channel.total_seconds) continue;
        retired.current.add(channel.id);
        toast.success("🔴 LIVE ENDED — Class finished. Thanks for watching!");
        window.setTimeout(() => {
          void retireChannel(category, profile?.id ?? null, clips)
            .then(load)
            .catch(() => {});
        }, 5000);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [states, profile?.id]);


  const chosenState = states.find((state) => state.category === choice) ?? null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-[464px] bg-create-canvas px-3 pb-28 pt-4">
      <header className="mb-3 flex items-center gap-2">
        <h1 className="font-display text-xl font-bold text-create-ink">
          {choice ? TV_LABELS[choice] : "FindMit TV"}
        </h1>
        <span className="rounded-md bg-destructive px-2 py-0.5 text-[0.6rem] font-bold text-destructive-foreground">
          LIVE
        </span>
        <Button asChild size="sm" variant="secondary" className="ml-auto h-7 text-[0.65rem]">
          <Link to="/profile">Change channel</Link>
        </Button>
      </header>
      {choice && chosenState ? (
        <LiveTvStage state={chosenState} />
      ) : (
        <div className="grid min-h-[60vh] place-items-center rounded-2xl border border-create-line bg-surface p-6 text-center">
          <div className="space-y-3">
            <p className="font-display text-base font-bold text-create-ink">Choose your class channel</p>
            <p className="text-sm text-create-copy">
              Pick one channel in your profile and its lessons play here automatically.
            </p>
            <Button asChild size="sm">
              <Link to="/profile">Choose channel</Link>
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}


function TvBottomNav({
  tab,
  onChange,
  isAdmin,
  canPost,
}: {
  tab: "home" | "live" | "post" | "stations" | "manage-tv";
  onChange: (tab: "home" | "live" | "post" | "stations" | "manage-tv") => void;
  isAdmin: boolean;
  canPost: boolean;
}) {
  const items = [
    { id: "home" as const, label: "Home", icon: Home },
    { id: "live" as const, label: "Live", icon: Radio },
    ...(canPost ? [{ id: "post" as const, label: "Post", icon: SquarePlus }] : []),
    { id: "stations" as const, label: "TV Stations", icon: Tv },
    ...(isAdmin ? [{ id: "manage-tv" as const, label: "Manage TV", icon: Wrench }] : []),
  ];
  const cols = items.length === 3 ? "grid-cols-3" : items.length === 4 ? "grid-cols-4" : "grid-cols-5";
  return (
    <nav className="fixed inset-x-2 bottom-2 z-50 mx-auto max-w-[454px] rounded-[1.4rem] border border-create-line bg-surface px-5 py-2 shadow-nav-bar" aria-label="Stories navigation">
      <ul className={cn("grid", cols)}>
        {items.map(({ id, label, icon: Icon }) => (
          <li key={id}>
            <Button variant="ghost" onClick={() => onChange(id)} className={cn("h-14 w-full flex-col gap-0.5 rounded-lg text-create-ink hover:bg-muted hover:text-create-ink", tab === id && "text-primary")}>
              <Icon className="size-6" strokeWidth={2.5} />
              <span className="text-xs font-bold">{label}</span>
            </Button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function FeedItem({ post }: { post: Post }) {
  const [started, setStarted] = useState(false);
  const url = useMediaUrl(started ? post.media_path : null);
  const poster = useMediaUrl(post.thumbnail_path ?? null, 800);
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !url) return;
    void el.play().catch(() => {});
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) el.pause();
      },
      { threshold: 0.6 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [url]);

  return (
    <section className="relative h-[calc(100vh-11rem)] snap-start bg-black">
      {url ? (
        <video
          ref={ref}
          src={url}
          {...(poster ? { poster } : {})}
          loop
          playsInline
          controls
          preload="metadata"
          className="h-full w-full object-contain"
        />
      ) : (
        <button
          type="button"
          onClick={() => setStarted(true)}
          className="relative flex h-full w-full items-center justify-center"
          aria-label="Play video"
        >
          {poster ? (
            <img
              src={poster}
              alt={post.caption || "Video thumbnail"}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="h-full w-full bg-secondary/40" />
          )}
          <span className="absolute flex size-16 items-center justify-center rounded-full bg-background/70 backdrop-blur">
            <Play className="size-7 text-foreground" />
          </span>
        </button>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 to-transparent p-4">
        <p className="font-display text-sm font-bold text-foreground">
          @{post.author?.username ?? "user"}
        </p>
        <p className="mt-1 line-clamp-2 text-sm text-foreground/90">{post.caption}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatCount(post.likes_count)} likes · {formatCount(post.views_count)} views
        </p>
      </div>
    </section>
  );
}

/* ----------------------------- LIVE ----------------------------- */

interface LivePanelProps {
  myHostId: string | null;
  onWatch: (session: LiveSession) => void;
  onResume: (session: LiveSession) => void;
  onEnd: (session: LiveSession) => void;
}

function LivePanel({ myHostId, onWatch, onResume, onEnd }: LivePanelProps) {

  const navigate = useNavigate();
  const [items, setItems] = useCachedState<LiveSession[]>("home:live-sessions", [], () => setLoading(false));
  const [classes, setClasses] = useCachedState<LiveClass[]>("home:live-classes", []);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = () =>
      void fetchLiveSessions()
        .then((rows) => active && setItems(rows))
        .catch(() => active && setItems([]))
        .finally(() => active && setLoading(false));
    load();

    const loadClasses = () =>
      void fetchLiveClasses()
        .then((rows) => active && setClasses(rows))
        .catch(() => active && setClasses([]));
    loadClasses();

    const channel = supabase
      .channel("live-sessions-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_sessions" },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_classes" },
        () => loadClasses(),
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      {classes.length > 0 ? (
        <section className="mb-6">
          <h2 className="font-display text-base font-bold">Live Classrooms — CCTV</h2>
          <p className="text-xs text-muted-foreground">
            Every ongoing classroom at a glance.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {classes.map((item) => (
              <article key={item.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="relative flex aspect-video items-center justify-center bg-black/80">
                  <GraduationCap className="size-7 text-white/70" />
                  <span className="absolute left-2 top-2 rounded bg-destructive px-1.5 py-0.5 text-[0.55rem] font-bold text-destructive-foreground">
                    LIVE
                  </span>
                  <span className="absolute right-2 top-2 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[0.55rem] font-bold text-white">
                    <Eye className="size-3" /> {formatCount(item.viewers_count)}
                  </span>
                </div>
                <div className="p-2">
                  <p className="truncate text-xs font-bold">{item.topic}</p>
                  <p className="truncate text-[0.65rem] text-muted-foreground">
                    {item.host?.display_name ?? "Teacher"}
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-1">
                    <Button
                      size="sm"
                      className="h-7 px-0 text-[0.6rem] font-bold"
                      onClick={() =>
                        void navigate({ to: "/education/live/$classId", params: { classId: item.id } })
                      }
                    >
                      Maximize
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 px-0 text-[0.6rem] font-bold"
                      onClick={() => toast.success(`Students notified about "${item.topic}"`)}
                    >
                      Notify
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 px-0 text-[0.6rem] font-bold"
                      onClick={() =>
                        void endLiveClass(item.id)
                          .then(() => toast.success("Classroom ejected"))
                          .catch(() => toast.error("Could not eject this classroom"))
                      }
                    >
                      Eject
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <h2 className="font-display text-base font-bold">Ongoing Live Classes</h2>

      {items.length === 0 ? (
        <EmptyState
          icon={Radio}
          title="No live classes now"
          description="When a teacher starts a live class it shows up here instantly."
        />
      ) : (
        <div className="mt-3 grid gap-3">
          {items.map((item) => (
            <LiveCard
              key={item.id}
              item={item}
              isHost={item.host_id === myHostId}
              onWatch={onWatch}
              onResume={onResume}
              onEnd={onEnd}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LiveCard({
  item,
  isHost,
  onWatch,
  onResume,
  onEnd,
}: {
  item: LiveSession;
  isHost: boolean;
  onWatch: (session: LiveSession) => void;
  onResume: (session: LiveSession) => void;
  onEnd: (session: LiveSession) => void;
}) {

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="relative flex aspect-video items-center justify-center bg-secondary">
        <Radio className="size-8 text-muted-foreground" />
        <span className="absolute left-3 top-3 flex items-center gap-1 rounded-md bg-destructive px-2 py-0.5 text-[0.65rem] font-bold text-destructive-foreground">
          <span className="size-1.5 rounded-full bg-destructive-foreground" /> LIVE
        </span>
        <span className="absolute right-3 top-3 flex items-center gap-1 rounded-md bg-background/80 px-2 py-0.5 text-[0.65rem] font-medium">
          <Eye className="size-3" /> {formatCount(item.viewer_count)} watching
        </span>
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <UserAvatar
            photoPath={item.host?.photo_path ?? null}
            name={item.host?.display_name ?? "Host"}
            className="size-8"
          />
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-semibold">{item.topic}</p>
            <p className="truncate text-xs text-muted-foreground">
              {item.host?.display_name ?? "Teacher"}
            </p>
          </div>
        </div>
        {isHost ? (
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={() => onResume(item)}>
              <Radio className="size-4" /> Reconnect
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="flex-1"
              onClick={() => onEnd(item)}
            >
              End Live ❌
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={() => onWatch(item)}>
              Watch Free
            </Button>
            <Button size="sm" variant="secondary" className="flex-1" onClick={() => onWatch(item)}>
              Join Practical GHS 20
            </Button>
          </div>
        )}

      </div>
    </article>
  );
}


/* ----------------------------- POST ----------------------------- */

function PostPanel({
  onLiveStarted,
  onBroadcastStarted,
  teacherOnly = false,
}: {
  onLiveStarted: (session: LiveSession) => void;
  onBroadcastStarted: (session: LiveSession) => void;
  /** Teachers only get the Start Class control — no TV uploads, no Go Live Now. */
  teacherOnly?: boolean;
}) {
  const { profile } = useAuth();
  const isSuperAdmin = useIsSuperAdmin();
  const { sections, toggle } = useAppSections();
  const goLiveSection = sections["go_live_now"];
  const goLiveVisible = isVisibleTo(goLiveSection, isSuperAdmin);
  const goLiveLocked = isLockedFor(goLiveSection, isSuperAdmin);
  const [folders, setFolders] = useState<Record<TvCategory, File[]>>({
    shs: [],
    jhs: [],
    primary: [],
    vocational: [],
    kids: [],
  });
  const [publishing, setPublishing] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduleAt, setScheduleAt] = useState("");
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  const [showLive, setShowLive] = useState(false);
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [starting, setStarting] = useState(false);
  const [startingClass, setStartingClass] = useState(false);
  const navigate = useNavigate();
  const pushToUser = useServerFn(sendPushToUser);

  const allFoldersReady = Object.values(folders).every((files) => files.length > 0);
  const scheduleValid = Boolean(scheduleAt) && new Date(scheduleAt).getTime() > Date.now();

  const addFolderFiles = (folder: TvCategory, files: FileList | null) => {
    if (!files?.length) return;
    const videos = Array.from(files).filter((file) => file.type.startsWith("video/"));
    if (!videos.length) {
      toast.error("Choose one or more video files");
      return;
    }
    setFolders((current) => {
      const room = MAX_TV_UPLOADS - current[folder].length;
      if (room <= 0) {
        toast.error(`${TV_FOLDER_META[folder].label} already has ${MAX_TV_UPLOADS} videos`);
        return current;
      }
      const accepted = videos.slice(0, room);
      if (accepted.length < videos.length) {
        toast.error(`Only ${MAX_TV_UPLOADS} videos per channel — ${videos.length - accepted.length} skipped`);
      }
      toast.success(
        `${accepted.length} video${accepted.length === 1 ? "" : "s"} selected for ${TV_FOLDER_META[folder].label}`,
      );
      return { ...current, [folder]: [...current[folder], ...accepted] };
    });
  };

  const removeFolderFile = (folder: TvCategory, index: number) => {
    setFolders((current) => ({
      ...current,
      [folder]: current[folder].filter((_, i) => i !== index),
    }));
  };

  const publishAll = async () => {
    if (!profile || !allFoldersReady) return;
    setPublishing(true);
    try {
      const startAt = scheduleMode === "later" ? new Date(scheduleAt).toISOString() : null;
      // Lessons go straight to Cloudflare, which turns them into light 360p
      // streams. If that is unavailable we fall back to the old direct upload.
      const useStream = await isCfStreamReady();
      for (const folder of TV_FOLDER_ORDER) {
        const files = folders[folder];
        toast.loading(`Publishing ${TV_FOLDER_META[folder].label}...`, { id: "publish-all" });
        let totalSeconds = 0;
        for (let index = 0; index < files.length; index += 1) {
          const file = files[index]!;
          const label = `${TV_FOLDER_META[folder].label} — ${file.name}`;
          setProgress({ label, done: index, total: files.length });
          const duration = await readVideoDuration(file);
          totalSeconds += Math.max(1, Math.round(duration || 60));

          let mediaPath: string;
          let hlsUrl: string | null = null;
          let streamUid: string | null = null;
          if (useStream) {
            const uploaded = await uploadToCfStream(file, {
              durationSeconds: duration,
              onProgress: (fraction) =>
                setProgress({
                  label: `${label} — ${Math.round(fraction * 100)}%`,
                  done: index,
                  total: files.length,
                }),
            });
            streamUid = uploaded.uid;
            hlsUrl = uploaded.hlsUrl;
            mediaPath = cfMediaPath(uploaded.uid);
          } else {
            mediaPath = await uploadPostMedia(profile.id, file, extensionOf(file, "mp4"));
          }

          const { error } = await supabase.from("posts").insert({
            user_id: profile.id,
            media_path: mediaPath,
            media_type: "video",
            thumbnail_path: null,
            duration_seconds: duration,
            caption: file.name.replace(/\.[^.]+$/, ""),
            status: "published",
            tv_category: folder,
            tv_type: TV_FOLDER_META[folder].type,
            tv_order: index + 1,
            hls_url: hlsUrl,
            stream_uid: streamUid,
          });
          if (error) throw error;
          setProgress({ label, done: index + 1, total: files.length });
        }
        // Playlists open right away, or at the scheduled time — everyone shares this clock.
        await startBroadcast({
          category: folder,
          hostId: profile.id,
          subject: TV_FOLDER_META[folder].label,
          totalSeconds,
          startAt,
        });
      }
      setFolders({ shs: [], jhs: [], primary: [], vocational: [], kids: [] });
      setProgress(null);
      toast.success(
        startAt
          ? `✅ Scheduled — channels open in ${formatCountdown((new Date(startAt).getTime() - Date.now()) / 1000)}`
          : "✅ All channels are live! Students can join on Home",
        { id: "publish-all" },
      );
    } catch {
      setProgress(null);
      toast.error("Publishing stopped. Please try again.", { id: "publish-all" });
    } finally {
      setPublishing(false);
    }
  };

  // Go Live Now: opens the Director Panel in private preview — nothing goes public yet.
  const onGoLiveNow = () => {
    const room = Math.random().toString(36).slice(2, 8).toUpperCase();
    void navigate({ to: "/admin/posts", search: { tab: "director", room, mode: "preview" } });
  };

  const onStartLive = async () => {
    if (!profile || !topic.trim()) return;
    setStarting(true);
    try {
      const session = await createLiveSession(
        profile.id,
        description.trim() ? `${topic.trim()} — ${description.trim()}` : topic.trim(),
      );
      setTopic("");
      setDescription("");
      setShowLive(false);
      toast.success("You are live — students can join now");
      onLiveStarted(session);
    } catch {
      toast.error("Could not start the live class");
    } finally {
      setStarting(false);
    }
  };

  const onStartClassroom = async () => {
    if (!profile || !topic.trim()) return;
    setStartingClass(true);
    try {
      const created = await startLiveClass(profile.id, topic.trim(), description.trim());
      setTopic("");
      setDescription("");
      setShowLive(false);
      toast.success("Getting your camera ready — students join once you're live");
      // Students are notified from the classroom page once the broadcast is ready.
      void navigate({ to: "/education/live/$classId", params: { classId: created.id } });
    } catch {
      toast.error("Could not start the live classroom");
    } finally {
      setStartingClass(false);
    }
  };

  return (
    <main className="min-h-screen bg-create-canvas pb-28 text-create-ink">
      <div className="flex h-7 items-center justify-between bg-tv-status px-3 text-[0.65rem] font-black text-create-ink">
        <span>8:17 PM</span>
        <span aria-hidden="true" className="tracking-widest">⚙︎  ◉  •••</span>
        <span aria-hidden="true">◉  3.8 K/s  ▣74</span>
      </div>

      <div className="mx-auto flex min-h-[calc(100vh-7rem)] max-w-[464px] flex-col px-5 pb-3 pt-5">
        <section className={cn("flex min-h-0 flex-[1_1_50%] flex-col", teacherOnly && "hidden")}>
          <header className="mb-4">
            <p className="text-xs font-black uppercase text-nav-active">FindMit TV Studio</p>
            <h1 className="mt-1 font-display text-[1.65rem] font-black leading-tight tracking-normal">Upload Video to FindMit TV</h1>
          </header>

          <div className="mb-3 rounded-2xl border border-create-line p-2.5">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                onClick={() => setScheduleMode("now")}
                className={cn(
                  "h-9 rounded-xl text-xs font-black",
                  scheduleMode === "now"
                    ? "bg-tv-publish text-create-ink hover:bg-tv-publish/90"
                    : "bg-transparent text-create-copy hover:bg-create-ink/10",
                )}
              >
                Play Now
              </Button>
              <Button
                type="button"
                onClick={() => setScheduleMode("later")}
                className={cn(
                  "h-9 rounded-xl text-xs font-black",
                  scheduleMode === "later"
                    ? "bg-tv-publish text-create-ink hover:bg-tv-publish/90"
                    : "bg-transparent text-create-copy hover:bg-create-ink/10",
                )}
              >
                Schedule for Later
              </Button>
            </div>
            {scheduleMode === "later" ? (
              <div className="mt-2 space-y-1">
                <Input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(event) => setScheduleAt(event.target.value)}
                  className="border-create-line bg-create-canvas text-create-ink"
                />
                <p className="text-[0.65rem] font-bold text-create-copy">
                  {scheduleValid
                    ? `Starts in ${formatCountdown((new Date(scheduleAt).getTime() - Date.now()) / 1000)}`
                    : "Pick a date and time in the future"}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-[0.65rem] font-bold text-create-copy">
                Channels open the moment you publish and loop the playlist.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {TV_FOLDER_ORDER.map((folder) => {
              const section = sections[uploadSectionId(folder)];
              if (!isVisibleTo(section, isSuperAdmin)) return null;
              return (
                <div key={folder} className={cn("space-y-1.5", folder === "kids" && "col-span-2")}>
                  <TvUploadFolder
                    folder={folder}
                    files={folders[folder]}
                    onFiles={addFolderFiles}
                    locked={isLockedFor(section, isSuperAdmin)}
                    wide={folder === "kids"}
                  />
                  {isSuperAdmin ? <SectionToggles section={section} onToggle={toggle} /> : null}
                </div>
              );
            })}
          </div>

          {TV_FOLDER_ORDER.some((folder) => folders[folder].length > 0) ? (
            <div className="mt-3 space-y-2.5">
              {TV_FOLDER_ORDER.filter((folder) => folders[folder].length > 0).map((folder) => (
                <div key={folder} className="rounded-2xl border border-create-line p-2.5">
                  <p className="text-xs font-black">
                    {folders[folder].length} video{folders[folder].length === 1 ? "" : "s"} selected:{" "}
                    {TV_FOLDER_META[folder].label}
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {folders[folder].map((file, index) => (
                      <li key={`${file.name}-${index}`} className="flex items-center gap-2 text-[0.68rem] text-create-copy">
                        <span className="grid size-4 shrink-0 place-items-center rounded bg-create-ink/15 text-[0.55rem] font-black">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {file.name} ({formatFileSize(file.size)})
                        </span>
                        <button
                          type="button"
                          onClick={() => removeFolderFile(folder, index)}
                          className="shrink-0 font-black text-create-copy hover:text-create-ink"
                          aria-label={`Remove ${file.name}`}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}

          {progress ? (
            <div className="mt-3 space-y-1">
              <p className="truncate text-[0.68rem] font-bold text-create-copy">
                Uploading {progress.done}/{progress.total} — {progress.label}
              </p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-create-line">
                <div
                  className="h-full rounded-full bg-tv-publish transition-all"
                  style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }}
                />
              </div>
            </div>
          ) : null}

          <div className="flex min-h-12 items-center justify-center pt-2.5">
            {allFoldersReady ? (
              <Button
                type="button"
                disabled={publishing || (scheduleMode === "later" && !scheduleValid)}
                onClick={() => void publishAll()}
                className="h-10 rounded-xl bg-tv-publish px-6 text-sm font-black text-create-ink hover:bg-tv-publish/90"
              >
                {publishing ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
                {publishing ? "Publishing..." : scheduleMode === "later" ? "Schedule All" : "Publish All"}
              </Button>
            ) : null}
          </div>
        </section>

        <section className="flex min-h-0 flex-[1_1_50%] flex-col justify-center pt-2">
          <h2 className="font-display text-3xl font-black tracking-normal">Live tools</h2>
          <p className="mt-1 text-sm text-create-copy">Existing classroom and official live controls</p>
          <div className="mt-4 space-y-3">
            <Button
              className="h-20 w-full rounded-3xl bg-create-blue text-2xl font-black text-create-ink hover:bg-create-blue/90"
              onClick={() => setShowLive(true)}
            >
              <GraduationCap className="size-10" strokeWidth={2.5} /> Start Class
            </Button>
            {goLiveVisible && !teacherOnly ? (
              <div className="space-y-1.5">
                <Button
                  className="h-20 w-full rounded-3xl bg-create-red text-2xl font-black text-create-ink hover:bg-create-red/90 disabled:opacity-60"
                  disabled={goLiveLocked}
                  onClick={onGoLiveNow}
                >
                  {starting ? (
                    <Loader2 className="size-10 animate-spin" />
                  ) : (
                    <Radio className="size-10" strokeWidth={2.5} />
                  )}{" "}
                  Go Live Now {goLiveLocked ? "🔒" : ""}
                </Button>
                {isSuperAdmin ? <SectionToggles section={goLiveSection} onToggle={toggle} /> : null}
              </div>
            ) : null}
          </div>

          {isSuperAdmin && !teacherOnly ? (
            <div className="mt-5 space-y-2 rounded-2xl border border-create-line p-3">
              <p className="text-xs font-black uppercase text-nav-active">Super admin — other sections</p>
              {(["findmit_ghana_tab", "chat_button"] as SectionId[]).map((id) => (
                <div key={id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-bold">
                    {id === "findmit_ghana_tab" ? "FindMit Ghana tab" : "Chat button"}
                  </span>
                  <SectionToggles section={sections[id]} onToggle={toggle} />
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {showLive ? (
          <section className="fixed inset-x-4 bottom-24 z-[60] mx-auto max-w-md space-y-3 rounded-2xl border border-create-line bg-create-canvas p-4 shadow-2xl">
            <Input className="border-create-line bg-create-canvas text-create-ink placeholder:text-create-ink/55" placeholder="Topic e.g. Bicycle Making Live" value={topic} onChange={(event) => setTopic(event.target.value)} />
            <Textarea className="border-create-line bg-create-canvas text-create-ink placeholder:text-create-ink/55" placeholder="What will you teach?" value={description} onChange={(event) => setDescription(event.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Button className="bg-create-red-action font-bold text-create-ink hover:bg-create-red-action/90" disabled={starting || startingClass || !topic.trim()} onClick={() => void onStartLive()}>
                {starting ? <Loader2 className="size-4 animate-spin" /> : <Radio className="size-4" />} Go live
              </Button>
              <Button variant="outline" className="border-create-line bg-transparent text-create-ink hover:bg-create-ink/10 hover:text-create-ink" onClick={() => setShowLive(false)}>Cancel</Button>
            </div>
            <Button className="w-full bg-create-blue-action font-bold text-create-ink hover:bg-create-blue-action/90" disabled={starting || startingClass || !topic.trim()} onClick={() => void onStartClassroom()}>
              {startingClass ? <Loader2 className="size-4 animate-spin" /> : <GraduationCap className="size-4" />} Start Live Classroom
            </Button>
          </section>
        ) : null}
      </div>
    </main>
  );
}

const TV_FOLDER_ORDER: TvCategory[] = ["shs", "jhs", "primary", "vocational", "kids"];
const MAX_TV_UPLOADS = 20;

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))}MB`;
}

function uploadSectionId(folder: TvCategory): SectionId {
  return `${folder}_tv_upload` as SectionId;
}
const TV_FOLDER_META: Record<TvCategory, { label: string; type: "live" | "on_demand"; color: string; Icon: typeof School }> = {
  shs: { label: "SHS TV", type: "live", color: "bg-tv-shs", Icon: GraduationCap },
  jhs: { label: "JHS TV", type: "live", color: "bg-tv-jhs", Icon: School },
  primary: { label: "PRIMARY TV", type: "on_demand", color: "bg-tv-primary", Icon: Monitor },
  vocational: { label: "VOCATIONAL TV", type: "live", color: "bg-tv-vocational", Icon: Wrench },
  kids: { label: "KIDS TV", type: "on_demand", color: "bg-tv-kids", Icon: WandSparkles },
};

function TvUploadFolder({ folder, files, onFiles, wide = false, locked = false }: { folder: TvCategory; files: File[]; onFiles: (folder: TvCategory, files: FileList | null) => void; wide?: boolean; locked?: boolean }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const meta = TV_FOLDER_META[folder];
  const ready = files.length > 0;
  const preview = useMemo(() => (files[0] ? URL.createObjectURL(files[0]) : null), [files]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  return (
    <div className="relative">
      <input ref={inputRef} type="file" accept="video/*" multiple hidden onChange={(event) => { onFiles(folder, event.target.files); event.currentTarget.value = ""; }} />
      <Button
        type="button"
        disabled={locked}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "relative h-[5.45rem] w-full overflow-hidden rounded-2xl border-0 p-0 text-left text-create-ink shadow-none hover:brightness-110",
          wide ? "h-[4.65rem]" : "",
          meta.color,
        )}
      >
        {preview ? <video src={preview} muted playsInline className="absolute inset-0 size-full object-cover opacity-25" /> : null}
        <span className={cn("relative z-10 flex size-full flex-col justify-between p-3", wide && "flex-row items-center px-4") }>
          <span className={cn("flex items-start justify-between", wide && "contents")}>
            <meta.Icon className="size-6 shrink-0" strokeWidth={2.5} />
            <span className={cn("absolute right-2 top-2 grid size-6 place-items-center rounded-full", ready ? "bg-tv-ready" : "bg-tv-empty")}>
              {ready ? <Check className="size-4" strokeWidth={3} /> : <FolderOpen className="size-3.5" />}
            </span>
          </span>
          <span className={cn(wide && "text-center")}>
            <strong className="block text-sm font-black leading-tight">{meta.label}</strong>
            <span className={cn("mt-0.5 inline-block rounded px-1.5 py-0.5 text-[0.52rem] font-black uppercase", meta.type === "live" ? "bg-tv-live" : "bg-tv-demand")}>{meta.type === "live" ? "Live" : "On-demand"}</span>
          </span>
          <span className={cn("text-[0.64rem] font-bold", wide && "pr-6 text-right")}>
            {files.length} video{files.length === 1 ? "" : "s"} • {ready ? "Ready" : "Empty"}
          </span>
        </span>
      </Button>
    </div>
  );
}

