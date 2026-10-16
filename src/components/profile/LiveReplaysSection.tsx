import { useCachedState } from "@/lib/page-cache";
import { useEffect, useMemo, useState } from "react";
import { Eye, Play, Trash2, Video, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  bumpReplayViews,
  deleteReplay,
  fetchTeachingReplays,
  fetchWatchableReplays,
  formatDuration,
  useReplayUrl,
  type LiveReplay,
} from "@/lib/live-replays";

type Filter = "teachings" | "watched";

/** "Live Replays" grid — a teacher's own classes and the ones a student paid for. */
export function LiveReplaysSection({ userId, isMe }: { userId: string; isMe: boolean }) {
  const [filter, setFilter] = useState<Filter>("teachings");
  const [teachings, setTeachings] = useCachedState<LiveReplay[]>("replays:teachings", []);
  const [watched, setWatched] = useCachedState<LiveReplay[]>("replays:watched", []);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState<LiveReplay | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([fetchTeachingReplays(userId), isMe ? fetchWatchableReplays(userId) : Promise.resolve([])])
      .then(([mine, theirs]) => {
        if (!active) return;
        setTeachings(mine);
        setWatched(theirs);
        setFilter(mine.length === 0 && theirs.length > 0 ? "watched" : "teachings");
        setLoading(false);
      })
      .catch(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [userId, isMe]);

  const items = useMemo(
    () => (filter === "teachings" ? teachings : watched),
    [filter, teachings, watched],
  );

  return (
    <div>
      <div className="mb-4 flex gap-2">
        {(
          [
            { id: "teachings", label: "My Teachings", count: teachings.length },
            { id: "watched", label: "My Watched", count: watched.length },
          ] as const
        ).map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setFilter(option.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              filter === option.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label} · {option.count}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="size-8 animate-spin rounded-full border-2 border-border border-t-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-14 text-center">
          <Video className="mx-auto h-7 w-7 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No live replays yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {filter === "teachings"
              ? "Everything you teach live is recorded and lands here when the class ends."
              : "Classes you pay for and join will appear here after the teacher ends the live."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((replay) => (
            <ReplayCard
              key={replay.id}
              replay={replay}
              owned={isMe && replay.teacher_id === userId}
              onPlay={() => {
                setPlaying(replay);
                void bumpReplayViews(replay);
              }}
              onDelete={async () => {
                await deleteReplay(replay);
                setTeachings((prev) => prev.filter((row) => row.id !== replay.id));
              }}
            />
          ))}
        </div>
      )}

      {playing ? <ReplayPlayer replay={playing} onClose={() => setPlaying(null)} /> : null}
    </div>
  );
}

function ReplayCard({
  replay,
  owned,
  onPlay,
  onDelete,
}: {
  replay: LiveReplay;
  owned: boolean;
  onPlay: () => void;
  onDelete: () => Promise<void>;
}) {
  const thumb = useReplayUrl(replay.thumbnail_url);
  const date = new Date(replay.created_at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

  return (
    <div className="group overflow-hidden rounded-xl border border-border bg-card">
      <button type="button" onClick={onPlay} className="relative block aspect-[4/5] w-full bg-black">
        {thumb ? (
          <img src={thumb} alt={replay.title} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full place-items-center text-muted-foreground">
            <Video className="h-6 w-6" />
          </span>
        )}
        <span className="absolute inset-0 grid place-items-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
          <Play className="h-8 w-8 text-white" />
        </span>
        <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
          {formatDuration(replay.duration_seconds)}
        </span>
      </button>
      <div className="space-y-1 p-2">
        <p className="line-clamp-2 text-xs font-medium">{replay.title}</p>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3" /> {replay.views_count} · {date}
          </span>
          {owned ? (
            <button
              type="button"
              aria-label="Delete replay"
              onClick={() => void onDelete()}
              className="text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ReplayPlayer({ replay, onClose }: { replay: LiveReplay; onClose: () => void }) {
  const url = useReplayUrl(replay.video_url);
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/90 p-4">
      <div className="w-full max-w-3xl">
        <div className="mb-2 flex items-center justify-between text-white">
          <p className="text-sm font-medium">{replay.title}</p>
          <button type="button" aria-label="Close replay" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        {url ? (
          <video src={url} controls autoPlay playsInline className="max-h-[75vh] w-full rounded-xl bg-black" />
        ) : (
          <div className="grid h-64 place-items-center rounded-xl bg-black text-white/60">
            Loading replay…
          </div>
        )}
      </div>
    </div>
  );
}
