import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { CommunityLogo } from "@/components/news/CommunityLogo";
import { NewsMedia } from "@/components/news/NewsMedia";
import { NewsSponsor } from "@/components/news/NewsSponsor";
import { AdsCarousel } from "@/components/ads/AdsCarousel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/news";
import {
  addComment,
  communityMemberCount,
  fetchComments,
  fetchNews,
  type CommunityNews,
  type NewsComment,
} from "@/lib/community-news";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/community-news/$id")({
  head: ({ params }) => ({
    meta: [
      { title: "Community News — FindMit" },
      { name: "description", content: "A verified on-the-ground report from a FindMit community, with public comments." },
      { property: "og:title", content: "Community News — FindMit" },
      { property: "og:description", content: "Verified local news reported by FindMit users." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: `https://findmit.world/community-news/${params.id}` },
    ],
    links: [{ rel: "canonical", href: `https://findmit.world/community-news/${params.id}` }],
  }),
  component: StoryPage,
});

function StoryPage() {
  const { id } = Route.useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [news, setNews] = useState<CommunityNews | null | undefined>(undefined);
  const [comments, setComments] = useState<NewsComment[]>([]);
  const [members, setMembers] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchNews(id).then((n) => {
      setNews(n);
      if (n?.community_id) void communityMemberCount(n.community_id).then(setMembers);
    });
    void fetchComments(id).then(setComments);
    void supabase.rpc("increment_community_news_view" as never, { _id: id } as never);
  }, [id]);

  async function post() {
    if (!profile) return void navigate({ to: "/auth" });
    if (!text.trim()) return;
    setBusy(true);
    try {
      await addComment(id, profile.id, text);
      setText("");
      setComments(await fetchComments(id));
    } catch {
      toast.error("Could not post your comment");
    } finally {
      setBusy(false);
    }
  }

  if (news === undefined) return <AppShell><div className="flex justify-center py-20"><Loader2 className="size-6 animate-spin text-primary" /></div></AppShell>;
  if (!news) return <AppShell><p className="p-8 text-center">This story is not available.</p></AppShell>;

  return (
    <AppShell>
      <article className="pb-10">
        <div className="flex items-center gap-2 px-4 py-3">
          <Link to="/home" aria-label="Back" className="rounded-full bg-muted p-2"><ArrowLeft className="size-5" /></Link>
          <span className="text-xs font-bold uppercase tracking-wider text-primary">{news.community_name}</span>
        </div>
        <NewsMedia path={news.media_path} type={news.media_type} controls className="aspect-video w-full" />
        <div className="space-y-3 px-4 pt-4">
          <h1 className="font-display text-2xl font-bold leading-tight">{news.title}</h1>
          <p className="text-xs text-muted-foreground">
            {news.author?.display_name || news.author?.username || "Reporter"} · {timeAgo(news.created_at)} · {news.views_count} views
          </p>
          {news.description ? <p className="whitespace-pre-line leading-relaxed">{news.description}</p> : null}

          <NewsSponsor news={news} />

          {news.community_id ? (
            <Link
              to="/chat"
              search={{ community: news.community_id }}
              className="flex items-center gap-3 rounded-2xl bg-primary p-3 text-primary-foreground shadow-md"
            >
              <CommunityLogo name={news.community_name} size={38} />
              <span className="flex-1">
                <span className="block font-bold">Chat with {news.community_name} Community</span>
                <span className="text-xs opacity-80">{members} members</span>
              </span>
              <MessageCircle className="size-5" />
            </Link>
          ) : null}

          <div className="pt-2">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Offers near you</p>
            <AdsCarousel feed={[]} onOpenSite={(url) => window.open(url, "_blank", "noopener")} />
          </div>

          <h2 className="pt-4 font-bold">Comments ({comments.length})</h2>
          <div className="flex gap-2">
            <Input placeholder={profile ? "Add a comment…" : "Sign in to comment"} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} onKeyDown={(e) => e.key === "Enter" && void post()} />
            <Button size="icon" onClick={() => void post()} disabled={busy} aria-label="Post comment"><Send className="size-4" /></Button>
          </div>
          <ul className="space-y-4 pt-2">
            {comments.map((c) => (
              <li key={c.id} className="flex gap-3">
                <UserAvatar profile={c.profile} className="size-9" />
                <div>
                  <p className="text-sm"><span className="font-bold">{c.profile?.display_name || c.profile?.username || "User"}</span> <span className="text-xs text-muted-foreground">{timeAgo(c.created_at)}</span></p>
                  <p className="text-sm">{c.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </article>
    </AppShell>
  );
}
