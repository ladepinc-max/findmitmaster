import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ExternalLink, Heart, Loader2, Share2 } from "lucide-react";
import { readArticle, getNewsFeed } from "@/lib/news.functions";
import { adSlotsFor, timeAgo, type NewsArticle, type NewsItem } from "@/lib/news";
import { supabase } from "@/integrations/supabase/client";
import type { FeedItem } from "@/lib/home-browser";

export const Route = createFileRoute("/news")({
  validateSearch: (s: Record<string, unknown>) => ({ u: typeof s["u"] === "string" ? (s["u"] as string) : "" }),
  head: () => ({
    meta: [
      { title: "FindMit News — Ghana stories, clean and fast" },
      { name: "description", content: "Read the latest Ghanaian news inside FindMit: clean, fast and data-friendly." },
      { property: "og:title", content: "FindMit News" },
      { property: "og:description", content: "Latest Ghana news, read right inside FindMit." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NewsReader,
});

interface ShopAd {
  id: string;
  name: string;
  handle: string;
  description: string | null;
  photo_url: string | null;
  category: string;
}

type Sponsor = { type: "ad"; ad: FeedItem } | { type: "shop"; shop: ShopAd };

function NewsReader() {
  const { u } = Route.useSearch();
  const router = useRouter();
  const read = useServerFn(readArticle);
  const feed = useServerFn(getNewsFeed);
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [related, setRelated] = useState<NewsItem[]>([]);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    if (!u) return;
    setArticle(null);
    setError(null);
    window.scrollTo(0, 0);
    read({ data: { url: u } }).then(setArticle).catch((e: Error) => setError(e.message));
    feed().then((r) => setRelated(r.items.filter((i) => i.url !== u).slice(0, 6))).catch(() => {});
    setLiked(localStorage.getItem(`fm-like:${u}`) === "1");
  }, [u, read, feed]);

  useEffect(() => {
    void (async () => {
      const [ads, shops] = await Promise.all([
        supabase.from("home_feed_items").select("*").eq("kind", "ad").eq("is_active", true).order("sort_order"),
        supabase.from("shops").select("id, name, handle, description, photo_url, category").limit(12),
      ]);
      const list: Sponsor[] = ((ads.data ?? []) as FeedItem[]).map((ad) => ({ type: "ad", ad }));
      const shopList = ((shops.data ?? []) as ShopAd[]).sort(() => Math.random() - 0.5);
      shopList.forEach((shop) => list.push({ type: "shop", shop }));
      setSponsors(list);
    })();
  }, []);

  const slots = useMemo(() => adSlotsFor(article?.paragraphs.length ?? 0), [article]);

  const toggleLike = () => {
    const next = !liked;
    setLiked(next);
    localStorage.setItem(`fm-like:${u}`, next ? "1" : "0");
  };

  const share = async () => {
    const link = `${window.location.origin}/news?u=${encodeURIComponent(u)}`;
    const text = `${article?.title ?? "Read on FindMit"} — ${link}`;
    if (navigator.share) await navigator.share({ title: article?.title ?? "FindMit News", url: link }).catch(() => {});
    else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const back = () => (window.history.length > 1 ? router.history.back() : router.navigate({ to: "/home" }));

  return (
    <div className="min-h-dvh bg-background pb-24 text-foreground">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/95 px-2 py-2 backdrop-blur">
        <button type="button" onClick={back} aria-label="Back" className="rounded-full p-2 hover:bg-muted">
          <ChevronLeft className="size-7" />
        </button>
        <span className="truncate px-2 text-sm font-semibold text-muted-foreground">{article?.source ?? "FindMit News"}</span>
        <a href={u} target="_blank" rel="noopener noreferrer" aria-label="Open original" className="rounded-full p-2 hover:bg-muted">
          <ExternalLink className="size-5" />
        </a>
      </header>

      <main className="mx-auto max-w-2xl px-5">
        {!u ? (
          <p className="py-20 text-center text-muted-foreground">No story selected.</p>
        ) : error ? (
          <div className="py-20 text-center">
            <p className="text-muted-foreground">This story couldn't be opened in reader view.</p>
            <a href={u} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block font-semibold text-primary">
              Open the original page
            </a>
          </div>
        ) : !article ? (
          <div className="flex justify-center py-24"><Loader2 className="size-8 animate-spin text-primary" /></div>
        ) : (
          <article>
            <h1 className="mt-5 font-display text-2xl font-bold leading-tight">{article.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {article.source}
              {article.publishedAt ? ` • ${timeAgo(article.publishedAt)}` : ""}
            </p>
            {article.image ? <img src={article.image} alt="" className="mt-4 w-full rounded-xl object-cover" /> : null}
            {article.paragraphs.length === 0 ? (
              <p className="mt-6 text-muted-foreground">
                The full text isn't available here.{" "}
                <a href={u} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary">Read on {article.source}</a>
              </p>
            ) : (
              article.paragraphs.map((p, i) => {
                const slot = slots.indexOf(i);
                const sp = slot >= 0 && sponsors.length ? sponsors[slot % sponsors.length] : null;
                return (
                  <div key={i}>
                    <p className="mt-5 text-[1.12rem] leading-8">{p}</p>
                    {sp ? <SponsorCard sponsor={sp} /> : null}
                  </div>
                );
              })
            )}
          </article>
        )}

        {related.length ? (
          <section className="mt-10">
            <h2 className="border-l-4 border-primary pl-3 font-display text-xl font-bold">You may like</h2>
            <ul className="mt-3 divide-y divide-border">
              {related.map((r) => (
                <li key={r.url}>
                  <Link to="/news" search={{ u: r.url }} className="flex gap-3 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-3 font-semibold leading-snug">{r.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{r.source}</p>
                    </div>
                    {r.image ? <img src={r.image} alt="" loading="lazy" className="h-20 w-28 shrink-0 rounded-lg object-cover" /> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-4 border-t border-border bg-background px-4 py-3">
        <button type="button" onClick={share} className="flex-1 rounded-full bg-muted px-4 py-2.5 text-left text-sm text-muted-foreground">
          Let's talk about it…
        </button>
        <button type="button" onClick={toggleLike} aria-label="Like" className="p-1">
          <Heart className={`size-6 ${liked ? "fill-destructive text-destructive" : ""}`} />
        </button>
        <button type="button" onClick={share} aria-label="Share" className="p-1">
          <Share2 className="size-6" />
        </button>
      </footer>
    </div>
  );
}

function SponsorCard({ sponsor }: { sponsor: Sponsor }) {
  if (sponsor.type === "shop") {
    const s = sponsor.shop;
    return (
      <Link to="/$handle" params={{ handle: `@${s.handle}` }} className="my-6 flex overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {s.photo_url ? <img src={s.photo_url} alt="" className="w-2/5 object-cover" /> : <div className="flex w-2/5 items-center justify-center bg-primary text-4xl font-black text-primary-foreground">{s.name.charAt(0)}</div>}
        <div className="flex flex-1 flex-col p-4">
          <span className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">Sponsored • FindMit {s.category}</span>
          <p className="mt-1 font-bold">{s.name}</p>
          {s.description ? <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{s.description}</p> : null}
          <span className="mt-auto self-end rounded-full bg-primary px-4 py-1.5 pt-1.5 text-sm font-semibold text-primary-foreground">Visit shop</span>
        </div>
      </Link>
    );
  }
  const a = sponsor.ad;
  const inner = (
    <>
      {a.image_url ? <img src={a.image_url} alt="" className="w-full object-cover" /> : null}
      <div className="p-4">
        <span className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">Ad</span>
        <p className="mt-1 font-bold">{a.title}</p>
        {a.body ? <p className="mt-1 text-sm text-muted-foreground">{a.body}</p> : null}
        {a.link_url ? <span className="mt-3 inline-block rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground">Learn more</span> : null}
      </div>
    </>
  );
  return a.link_url ? (
    <a href={a.link_url} target="_blank" rel="noopener noreferrer" className="my-6 block overflow-hidden rounded-xl border border-border bg-card shadow-sm">{inner}</a>
  ) : (
    <div className="my-6 overflow-hidden rounded-xl border border-border bg-card shadow-sm">{inner}</div>
  );
}
