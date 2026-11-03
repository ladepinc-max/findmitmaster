import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { getNewsFeed } from "@/lib/news.functions";
import { matchesTab, NEWS_TABS, timeAgo, type NewsItem, type NewsTab } from "@/lib/news";

/** Phoenix-style Ghana news list; tapping a story opens FindMit's own reader. */
export function NewsFeed() {
  const feed = useServerFn(getNewsFeed);
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [tab, setTab] = useState<NewsTab>("For you");

  useEffect(() => {
    feed().then((r) => setItems(r.items)).catch(() => setItems([]));
  }, [feed]);

  const shown = (items ?? []).filter((i) => matchesTab(i, tab));

  return (
    <section className="mt-8">
      <div className="sticky top-0 z-10 -mx-4 flex gap-5 overflow-x-auto border-b border-border bg-background px-4 py-2">
        {NEWS_TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`shrink-0 pb-1 text-base ${t === tab ? "border-b-[3px] border-primary font-bold italic" : "italic text-muted-foreground"}`}
          >
            {t}
          </button>
        ))}
      </div>
      {items === null ? (
        <div className="flex justify-center py-10"><Loader2 className="size-6 animate-spin text-primary" /></div>
      ) : shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No stories here right now.</p>
      ) : (
        <ul className="divide-y divide-border">
          {shown.map((n) => (
            <li key={n.url}>
              <Link to="/news" search={{ u: n.url }} className="flex gap-3 py-4">
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="line-clamp-3 font-bold leading-snug">{n.title}</p>
                  <p className="mt-auto pt-2 text-xs text-muted-foreground">
                    {n.source}
                    {n.publishedAt ? `  ${timeAgo(n.publishedAt)}` : ""}
                  </p>
                </div>
                {n.image ? <img src={n.image} alt="" loading="lazy" className="h-24 w-32 shrink-0 rounded-lg object-cover" /> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
