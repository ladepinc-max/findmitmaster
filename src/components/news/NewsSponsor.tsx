import { Store, Star } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import type { CommunityNews } from "@/lib/community-news";

/** Sponsored box attached by an admin when approving a news story. */
export function NewsSponsor({ news }: { news: CommunityNews }) {
  const navigate = useNavigate();
  if (!news.ad_title) return null;
  const open = () => {
    const link = news.ad_link?.trim();
    if (!link) return;
    if (/^https?:\/\//i.test(link)) window.open(link, "_blank", "noopener");
    else void navigate({ to: link as never });
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
      <span className="text-[0.6rem] font-bold uppercase tracking-wider text-muted-foreground">Sponsored</span>
      <div className="mt-1 flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"><Store className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-tight">{news.ad_title}</p>
          {news.ad_tagline ? <p className="text-xs text-muted-foreground">{news.ad_tagline}</p> : null}
          {news.ad_rating != null ? (
            <div className="mt-1 flex gap-0.5">{Array.from({ length: 5 }, (_, i) => <Star key={i} className={`size-3 ${i < Math.round(Number(news.ad_rating)) ? "fill-accent text-accent" : "text-muted-foreground"}`} />)}</div>
          ) : null}
        </div>
        {news.ad_link ? (
          <button type="button" onClick={open} className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">{news.ad_cta || "View"}</button>
        ) : null}
      </div>
    </div>
  );
}
