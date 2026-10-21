import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  Briefcase,
  Globe,
  Loader2,
  MessageCircle,
  Radio,
  Search,
  Shield,
  Sparkles,
  Store,
  User,
} from "lucide-react";
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

/** Bold 3D badge flipping on the X-axis; hidden from the public until admin publishes Stories/Live. */
function LiveTvBadge() {
  const { allowed, loading } = useStoriesAccess();
  if (loading || !allowed) return null;
  return (
    <Link
      to="/"
      aria-label="Live TV and Stories"
      className="flex items-center gap-2 rounded-full border border-wa-green/40 bg-wa-green/10 px-3 py-1.5"
      style={{ perspective: "400px" }}
    >
      <span className="animate-flip-x inline-flex items-center justify-center rounded-md bg-wa-green p-1 text-white shadow-md">
        <Radio className="size-4" strokeWidth={2.6} />
      </span>
      <span className="text-xs font-extrabold tracking-widest text-wa-green">LIVE TV</span>
    </Link>
  );
}

const QUICK_TILES = [
  { to: "/jobs", label: "Jobs", icon: Briefcase, description: "Find work & talent" },
  { to: "/chat", label: "Chat", icon: MessageCircle, description: "Messages & calls" },
  { to: "/chat", search: { ama: 1 }, label: "Ama AI", icon: Sparkles, description: "Ask anything" },
  { to: "/my-shop", label: "My Shop", icon: Store, description: "Sell & manage" },
  { to: "/stations", label: "Stations", icon: Shield, description: "Police & services" },
  { to: "/profile", label: "Profile", icon: User, description: "Your account" },
] as const;

function HomeScreen() {
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<FindMitResults | null>(null);

  const runSearch = async () => {
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    setSearched(q);
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

      // Products link to their shop's storefront, so resolve each shop handle.
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

  const hasFindMitHits = results && (results.shops.length > 0 || results.products.length > 0 || results.jobs.length > 0);
  const webUrl = `https://www.google.com/search?q=${encodeURIComponent(searched)}`;

  return (
    <AppShell>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <FindMitLogo size="sm" linkToHome={false} />
        <LiveTvBadge />
      </header>

      <div className="px-4 pb-10 pt-6">
        <h1 className="font-display text-2xl font-bold leading-tight">
          What are you looking for?
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          We check FindMit first, then the whole internet.
        </p>

        <form
          className="mt-4 flex items-center gap-2 rounded-2xl border border-border bg-secondary/60 p-2 pl-4"
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch();
          }}
        >
          <Search className="size-5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shops, products, jobs, anything…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            enterKeyHint="search"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="flex h-9 items-center gap-1 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Search"}
          </button>
        </form>

        {results ? (
          <section className="mt-6 space-y-5">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-wa-green">
                <span className="size-2 rounded-full bg-wa-green" />
                Found on FindMit
              </h2>
              {hasFindMitHits ? (
                <ul className="mt-3 space-y-2">
                  {results.shops.map((s) => (
                    <li key={`shop-${s.id}`}>
                      <Link
                        to="/$handle"
                        params={{ handle: `@${s.handle}` }}
                        className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-secondary"
                      >
                        <Store className="size-5 shrink-0 text-primary" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{s.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            @{s.handle} · {s.category}
                          </p>
                        </div>
                        <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                  {results.products.map((p) => (
                    <li key={`product-${p.id}`}>
                      <Link
                        to="/$handle"
                        params={{ handle: `@${p.shopHandle}` }}
                        className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-secondary"
                      >
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
                      <Link
                        to="/jobs"
                        search={{ tab: "jobs" }}
                        className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-secondary"
                      >
                        <Briefcase className="size-5 shrink-0 text-primary" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{j.title}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {j.company} · {j.location_name}
                          </p>
                        </div>
                        <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Nothing on FindMit matches “{searched}” yet — try the web results below.
                </p>
              )}
            </div>

            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                <Globe className="size-4" />
                From the web
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={webUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-secondary"
                >
                  <Globe className="size-4 text-primary" />
                  Google results for “{searched}”
                </a>
                <a
                  href={`https://duckduckgo.com/?q=${encodeURIComponent(searched)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-secondary"
                >
                  <Search className="size-4 text-primary" />
                  DuckDuckGo
                </a>
              </div>
            </div>
          </section>
        ) : (
          <section className="mt-8">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Quick access</h2>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {QUICK_TILES.map(({ to, label, icon: Icon, description }) => {
                const inner = (
                  <>
                    <span className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
                      <Icon className="size-5" />
                    </span>
                    <span className="text-xs font-bold">{label}</span>
                    <span className="text-[0.65rem] leading-tight text-muted-foreground">{description}</span>
                  </>
                );
                const cls =
                  "flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 text-center transition-colors hover:bg-secondary";
                return label === "Ama AI" ? (
                  <Link key={label} to="/chat" search={{ ama: "1" }} className={cls}>
                    {inner}
                  </Link>
                ) : (
                  <Link key={label} to={to} className={cls}>
                    {inner}
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
