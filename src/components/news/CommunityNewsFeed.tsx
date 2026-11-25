import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, Loader2, ShieldCheck, Video, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useRole } from "@/lib/roles";
import { useCachedState } from "@/lib/page-cache";
import { fetchApprovedNews, fetchUnreadNotices, markNoticeRead, type CommunityNews, type NewsNotice } from "@/lib/community-news";
import { timeAgo } from "@/lib/news";
import { ComNewsRecorder } from "./ComNewsRecorder";
import { NewsMedia } from "./NewsMedia";

/** FindMit's own Community News, replacing the old aggregated feed. */
export function CommunityNewsFeed() {
  const { profile } = useAuth();
  const { isAdmin } = useRole();
  const navigate = useNavigate();
  const [items, setItems] = useCachedState<CommunityNews[] | null>("home:community-news", null);
  const [notices, setNotices] = useState<NewsNotice[]>([]);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    void fetchApprovedNews(60).then(setItems).catch(() => setItems((v) => v ?? []));
  }, [setItems]);

  useEffect(() => {
    if (!profile) return;
    void fetchUnreadNotices(profile.id).then(setNotices);
  }, [profile]);

  const dismiss = (n: NewsNotice) => {
    setNotices((list) => list.filter((x) => x.id !== n.id));
    void markNoticeRead(n.id);
  };

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">Community News</h2>
        <div className="flex gap-2">
          {isAdmin ? (
            <Link to="/admin/community-news" className="flex items-center gap-1 rounded-full bg-muted px-3 py-2 text-xs font-bold">
              <ShieldCheck className="size-4" /> Review
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => (profile ? setRecording(true) : void navigate({ to: "/auth" }))}
            className="flex items-center gap-1.5 rounded-full bg-destructive px-4 py-2 text-sm font-bold text-destructive-foreground shadow-md"
          >
            <Video className="size-4" /> ComNews
          </button>
        </div>
      </div>

      {notices.map((n) => (
        <div key={n.id} className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-card p-3 text-sm">
          <Bell className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="flex-1"><p className="font-bold">{n.title}</p><p className="text-muted-foreground">{n.body}</p></div>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(n)}><X className="size-4" /></button>
        </div>
      ))}

      {items === null ? (
        <div className="flex justify-center py-10"><Loader2 className="size-6 animate-spin text-primary" /></div>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No community news yet. Tap ComNews to report what is happening around you.</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((n) => (
            <li key={n.id}>
              <Link to="/community-news/$id" params={{ id: n.id }} className="flex gap-3 py-4">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[0.65rem] font-bold uppercase tracking-wider text-primary">{n.community_name}</span>
                  <p className="line-clamp-3 font-bold leading-snug">{n.title}</p>
                  <p className="mt-auto pt-2 text-xs text-muted-foreground">
                    {n.author?.display_name || n.author?.username || "Reporter"} · {timeAgo(n.created_at)}
                  </p>
                </div>
                <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-lg">
                  <NewsMedia path={n.media_path} type={n.media_type} className="h-full w-full" />
                  {n.media_type === "video" ? <Video className="absolute bottom-1 right-1 size-4 text-primary-foreground drop-shadow" /> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {recording && profile ? <ComNewsRecorder userId={profile.id} onClose={() => setRecording(false)} /> : null}
    </section>
  );
}
