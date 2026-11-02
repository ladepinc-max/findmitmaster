import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  Briefcase,
  Globe,
  Loader2,
  Mic,
  Radio,
  Search,
  Store,
} from "lucide-react";
import { toast } from "sonner";
import { InAppBrowser } from "@/components/home/InAppBrowser";
import { normalizeUrl, resolveDestination, useHomeFeed, useQuickApps } from "@/lib/home-browser";
import { searchWeb, type WebHit } from "@/lib/web-search.functions";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { FindMitLogo } from "@/components/FindMitLogo";
import { supabase } from "@/integrations/supabase/client";
import { useStoriesAccess } from "@/lib/stories-access";

export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [
      { title: "FindMit Home — Search FindMit and the web" },
      {
        name: "description",
        content:
          "FindMit Home: search shops, products and jobs on FindMit first, then continue to the wider web. Quick access to Jobs, Chat, Ama AI and more.",
      },
      { property: "og:title", content: "FindMit Home — Search FindMit and the web" },
      {
        property: "og:description",
        content: "One search bar for everything on FindMit — shops, products, jobs — then the whole internet.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomeScreen,
});

type ShopHit = { id: string; name: string; handle: string; category: string };
type ProductHit = { id: string; name: string; price: number | null; shopHandle: string };
type JobHit = { id: string; title: string; company: string; location_name: string };

interface FindMitResults {
  shops: ShopHit[];
  products: ProductHit[];
  jobs: JobHit[];
}

/** Bold LIVE TV pill flipping on the X-axis; hidden from the public until admin publishes Stories/Live. */
function LiveTvBadge() {
  const { allowed, loading } = useStoriesAccess();
  if (loading || !allowed) return null;
  return (
    <Link
      to="/"
      aria-label="Live TV and Stories"
      className="animate-flip-x inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-1.5 text-background shadow-lg"
      style={{ perspective: "400px" }}
    >
      <span className="size-2.5 rounded-full bg-wa-green" />
      <Radio className="size-4 text-wa-green" strokeWidth={2.6} />
      <span className="text-sm font-extrabold tracking-wide">LIVE TV</span>
    </Link>
  );
}

type SpeechCtor = new () => {
  lang: string;
  onresult: (e: { results: { 0: { 0: { transcript: string } } } }) => void;
  onend: () => void;
  start: () => void;
};

function HomeScreen() {
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<FindMitResults | null>(null);
  const [browserUrl, setBrowserUrl] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const { apps } = useQuickApps();
  const { items: feed } = useHomeFeed();
  const searchWebFn = useServerFn(searchWeb);
  const [webHits, setWebHits] = useState<WebHit[] | null>(null);
  const [webLoading, setWebLoading] = useState(false);

  const runSearch = async (raw = query) => {
    const q = raw.trim();
    if (!q || loading) return;
    const direct = resolveDestination(q);
    if (direct) {
      setBrowserUrl(direct);
      return;
    }
    setBrowserUrl(null);
    setQuery(q);
    setLoading(true);
    setSearched(q);
    setWebHits(null);
    setWebLoading(true);
    void searchWebFn({ data: { q } })
      .then((r) => setWebHits(r.hits))
      .catch(() => setWebHits([]))
      .finally(() => setWebLoading(false));
    const like = `%${q.replace(/[%_,]/g, " ")}%`;
    try {
      const [shopsRes, productsRes, jobsRes] = await Promise.all([
        supabase
          .from("shops")
          .select("id, name, handle, category")
          .or(`name.ilike."${like}",handle.ilike."${like}",category.ilike."${like}"`)
          .limit(6),
        supabase.from("shop_products").select("id, name, price_ghc, shop_id").ilike("name", like).limit(6),
        supabase
          .from("jobs")
          .select("id, title, company, location_name")
          .or(`title.ilike."${like}",company.ilike."${like}",location_name.ilike."${like}"`)
          .limit(6),
      ]);
      const shops = (shopsRes.data ?? []) as ShopHit[];
      const rawProducts = (productsRes.data ?? []) as { id: string; name: string; price_ghc: number | null; shop_id: string }[];
      const jobs = (jobsRes.data ?? []) as JobHit[];
      const shopIds = [...new Set(rawProducts.map((p) => p.shop_id))];
      const handleByShop = new Map<string, string>();
      if (shopIds.length > 0) {
        const { data: parentShops } = await supabase.from("shops").select("id, handle").in("id", shopIds);
        for (const s of (parentShops ?? []) as { id: string; handle: string }[]) handleByShop.set(s.id, s.handle);
      }
      const products: ProductHit[] = rawProducts
        .filter((p) => handleByShop.has(p.shop_id))
        .map((p) => ({ id: p.id, name: p.name, price: p.price_ghc, shopHandle: handleByShop.get(p.shop_id)! }));
      setResults({ shops, products, jobs });
    } finally {
      setLoading(false);
    }
  };

  const startVoice = () => {
    const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return void toast.error("Voice search isn't supported on this phone");
    const rec = new Ctor();
    rec.lang = "en-GH";
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      setQuery(text);
      void runSearch(text);
    };
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  };

  const hasFindMitHits = results && (results.shops.length > 0 || results.products.length > 0 || results.jobs.length > 0);
  const rowCls = "flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-secondary";

  return (
    <AppShell>
      {browserUrl ? <InAppBrowser startUrl={browserUrl} onClose={() => setBrowserUrl(null)} onSearch={(q) => void runSearch(q)} /> : null}

      <div className="mx-auto max-w-xl px-4 pb-28 pt-8">
        <div className="flex flex-col items-center">
          <FindMitLogo size="lg" linkToHome={false} />
        </div>

        <form
          className="mt-6 flex items-center gap-3 rounded-full bg-secondary px-5 py-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch();
          }}
        >
          <Search className="size-5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!e.target.value) {
                setResults(null);
                setWebHits(null);
              }
            }}
            placeholder="Search or type website"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            enterKeyHint="search"
            aria-label="Search or type website"
          />
          {loading ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : (
            <button type="button" aria-label="Voice search" onClick={startVoice} className={listening ? "text-wa-green" : "text-muted-foreground"}>
              <Mic className="size-5" />
            </button>
          )}
        </form>

        <div className="mt-2 flex justify-end">
          <LiveTvBadge />
        </div>

        {results ? (
          <section className="mt-4 space-y-5">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-wa-green">
                <span className="size-2 rounded-full bg-wa-green" /> Found on FindMit
              </h2>
              {hasFindMitHits ? (
                <ul className="mt-3 space-y-2">
                  {results.shops.map((s) => (
                    <li key={`shop-${s.id}`}>
                      <Link to="/$handle" params={{ handle: `@${s.handle}` }} className={rowCls}>
                        <Store className="size-5 shrink-0 text-primary" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{s.name}</p>
                          <p className="truncate text-xs text-muted-foreground">@{s.handle} · {s.category}</p>
                        </div>
                        <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                  {results.products.map((p) => (
                    <li key={`product-${p.id}`}>
                      <Link to="/$handle" params={{ handle: `@${p.shopHandle}` }} className={rowCls}>
                        <Search className="size-5 shrink-0 text-primary" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{p.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {p.price != null ? `GH₵ ${p.price}` : "Product"} · @{p.shopHandle}
                          </p>
                        </div>
                        <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                  {results.jobs.map((j) => (
                    <li key={`job-${j.id}`}>
                      <Link to="/jobs" search={{ tab: "jobs" }} className={rowCls}>
                        <Briefcase className="size-5 shrink-0 text-primary" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{j.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{j.company} · {j.location_name}</p>
                        </div>
                        <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Nothing on FindMit matches “{searched}” yet.
                </p>
              )}
            </div>
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-primary">
                <Globe className="size-4" /> Found on the web
              </h2>
              {webLoading ? (
                <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Searching the web…
                </p>
              ) : webHits && webHits.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {webHits.map((h) => (
                    <li key={h.url}>
                      <button type="button" onClick={() => setBrowserUrl(h.url)} className={`${rowCls} w-full items-start text-left`}>
                        <img
                          src={`https://icons.duckduckgo.com/ip3/${h.domain}.ico`}
                          alt=""
                          className="mt-0.5 size-5 shrink-0 rounded"
                          loading="lazy"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs text-muted-foreground">{h.domain}</p>
                          <p className="line-clamp-2 text-sm font-semibold text-primary">{h.title}</p>
                          {h.snippet ? <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{h.snippet}</p> : null}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  No web results for “{searched}”.
                </p>
              )}
            </div>
          </section>
        ) : null}

        <h2 className="mt-6 font-display text-2xl font-bold">Quick Access</h2>
        <div className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-2">
          {apps.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setBrowserUrl(a.url)}
              className="flex w-[4.6rem] shrink-0 flex-col items-center gap-2 rounded-2xl bg-card p-2.5 shadow-md"
            >
              <span
                className="flex size-12 items-center justify-center rounded-full text-xl font-black text-primary-foreground"
                style={{ backgroundColor: a.color }}
              >
                {a.icon_text || a.label.charAt(0)}
              </span>
              <span className="w-full truncate text-xs font-bold">{a.label}</span>
            </button>
          ))}
        </div>

        <Link
          to="/shops"
          className="mt-8 flex w-full items-center justify-center rounded-full bg-wa-green py-4 text-lg font-bold text-primary-foreground shadow-md"
        >
          Find suppliers on FindMit
        </Link>

        {feed.length > 0 ? (
          <section className="mt-8 space-y-4">
            <h2 className="font-display text-xl font-bold">For you</h2>
            {feed.map((f) => (
              <article
                key={f.id}
                onClick={() => (f.link_url ? setBrowserUrl(normalizeUrl(f.link_url)) : undefined)}
                className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
                role={f.link_url ? "link" : undefined}
              >
                {f.image_url ? <img src={f.image_url} alt="" className="aspect-video w-full object-cover" loading="lazy" /> : null}
                <div className="p-4">
                  <span className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">
                    {f.kind === "ad" ? "Sponsored" : "News"}
                  </span>
                  <h3 className="mt-1 font-bold leading-snug">{f.title}</h3>
                  {f.body ? <p className="mt-1 text-sm text-muted-foreground">{f.body}</p> : null}
                </div>
              </article>
            ))}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
