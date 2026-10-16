import { useCachedState } from "@/lib/page-cache";
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Play } from "lucide-react";
import { AppShell, EmptyState } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useMediaUrl } from "@/lib/media";
import { fetchTvPosts, type Post, type TvCategory } from "@/lib/social";

const LABELS: Record<TvCategory, string> = {
  shs: "SHS TV",
  jhs: "JHS TV",
  primary: "PRIMARY TV",
  vocational: "VOCATIONAL TV",
  kids: "KIDS TV",
};

export const Route = createFileRoute("/tv/$category")({
  head: ({ params }) => {
    const category = params.category as TvCategory;
    const label = LABELS[category] ?? "FindMit TV";
    const description = `Watch ${label} videos on FindMit TV.`;
    return {
      meta: [
        { title: `${label} — FindMit TV` },
        { name: "description", content: description },
        { property: "og:title", content: `${label} — FindMit TV` },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: TvCategoryPage,
});

function TvCategoryPage() {
  const { category: rawCategory } = Route.useParams();
  const category = rawCategory as TvCategory;
  const label = LABELS[category] ?? "FindMit TV";
  const [posts, setPosts] = useCachedState<Post[]>(`tv:${category}`, []);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!LABELS[category]) {
      setLoading(false);
      return;
    }
    let active = true;
    void fetchTvPosts(category)
      .then((rows) => active && setPosts(rows))
      .catch(() => active && setPosts([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [category]);

  return (
    <AppShell>
      <main className="min-h-screen bg-create-canvas px-4 pb-8 pt-4 text-create-ink">
        <header className="flex items-center gap-3 border-b border-create-line pb-4">
          <Button asChild size="icon" variant="ghost" className="text-create-ink">
            <Link to="/" aria-label="Back to FindMit TV"><ArrowLeft /></Link>
          </Button>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-normal">{label}</h1>
            <p className="text-xs text-create-copy">FindMit TV video folder</p>
          </div>
        </header>
        {loading ? (
          <div className="grid place-items-center py-24"><Loader2 className="size-7 animate-spin" /></div>
        ) : posts.length === 0 ? (
          <EmptyState icon={Play} title={`No ${label} videos yet`} description="Confirmed uploads will appear here." />
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3">
            {posts.map((post) => <TvVideoCard key={post.id} post={post} />)}
          </div>
        )}
      </main>
    </AppShell>
  );
}

function TvVideoCard({ post }: { post: Post }) {
  const url = useMediaUrl(post.media_path);
  const poster = useMediaUrl(post.thumbnail_path, 640);
  return (
    <article className="overflow-hidden rounded-lg border border-create-line bg-surface">
      <video src={url ?? undefined} poster={poster ?? undefined} controls playsInline preload="metadata" className="aspect-video w-full bg-create-canvas object-contain" />
      <p className="line-clamp-2 p-3 text-sm font-bold">{post.caption || "FindMit TV video"}</p>
    </article>
  );
}