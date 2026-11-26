import type { WebHit } from "@/lib/web-search.functions";
import { breadcrumb, highlight, siteName } from "@/lib/serp";

function Marked({ text, q }: { text: string; q: string }) {
  return <>{highlight(text, q).map((s, i) => (s.hit ? <b key={i} className="font-bold text-foreground">{s.t}</b> : <span key={i}>{s.t}</span>))}</>;
}

/** One web hit in Chrome/Google layout: favicon + site name + breadcrumb, blue title, highlighted snippet. */
export function SerpResult({ hit, q, onOpen }: { hit: WebHit; q: string; onOpen: (url: string) => void }) {
  const bc = breadcrumb(hit.url);
  return (
    <article className="border-b border-border py-4">
      <button type="button" onClick={() => onOpen(hit.url)} className="block w-full text-left">
        <div className="flex items-center gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-card">
            <img src={`https://icons.duckduckgo.com/ip3/${hit.domain}.ico`} alt="" className="size-4 rounded-sm" loading="lazy" />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-medium text-foreground">{siteName(hit.domain)}</p>
            <p className="truncate text-xs text-muted-foreground">
              https://{bc.host}{bc.path.map((p) => ` › ${p}`).join("")}
            </p>
          </div>
        </div>
        <div className="mt-2 flex gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-lg leading-snug text-primary">{hit.title}</h3>
            {hit.snippet ? (
              <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
                {hit.kind === "news" ? <span className="mr-1 rounded bg-secondary px-1.5 py-0.5 text-xs font-semibold">News</span> : null}
                <Marked text={hit.snippet} q={q} />
              </p>
            ) : null}
          </div>
          {hit.image ? <img src={hit.image} alt="" loading="lazy" className="size-20 shrink-0 rounded-xl object-cover" /> : null}
        </div>
      </button>
    </article>
  );
}
