import { useCachedState } from "@/lib/page-cache";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Search, Tv } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/stations")({
  head: () => ({
    meta: [
      { title: "Partner TV Stations — FindMit" },
      {
        name: "description",
        content: "Watch Ghanaian partner TV stations streaming live on FindMit.",
      },
      { property: "og:title", content: "Partner TV Stations — FindMit" },
      {
        property: "og:description",
        content: "Watch Ghanaian partner TV stations streaming live on FindMit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StationsPage,
});

export interface PartnerTv {
  id: string;
  name: string;
  logo_url: string | null;
  category: string;
  region: string | null;
  description: string | null;
  live_stream_url: string;
  is_active: boolean;
  viewer_count: number;
}

const PAGE_SIZE = 20;

/** Station list reused by /stations and the Stories "TV Stations" tab. */
export function StationsPage() {
  const [stations, setStations] = useCachedState<PartnerTv[]>("stations:list", []);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const sentinel = useRef<HTMLDivElement | null>(null);

  const fetchPage = useCallback(
    async (pageIndex: number, search: string) => {
      setLoading(true);
      let q = supabase
        .from("partner_tvs")
        .select("*")
        .eq("is_active", true)
        .order("viewer_count", { ascending: false })
        .range(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE - 1);
      if (search.trim()) q = q.ilike("name", `%${search.trim()}%`);
      const { data } = await q;
      const rows = (data ?? []) as PartnerTv[];
      setStations((prev) => (pageIndex === 0 ? rows : [...prev, ...rows]));
      setDone(rows.length < PAGE_SIZE);
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(0);
      void fetchPage(0, query);
    }, 250);
    return () => clearTimeout(t);
  }, [query, fetchPage]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || done || loading) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        const next = page + 1;
        setPage(next);
        void fetchPage(next, query);
      }
    });
    io.observe(node);
    return () => io.disconnect();
  }, [done, loading, page, query, fetchPage]);

  return (
    <div className="min-h-screen bg-[#121212] text-white">
      <header className="sticky top-0 z-10 bg-[#121212]/95 px-4 pb-3 pt-5 backdrop-blur">
        <h1 className="mb-3 flex items-center gap-2 text-xl font-bold">
          <Tv className="h-5 w-5 text-red-500" /> Partner TV Stations
        </h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search stations"
            className="w-full rounded-xl bg-[#1E1E1E] py-3 pl-10 pr-4 text-sm text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-red-500/60"
          />
        </div>
      </header>

      <div className="space-y-3 px-4 pb-28">
        {stations.map((s) => (
          <Link
            key={s.id}
            to="/watch/$id"
            params={{ id: s.id }}
            className="flex items-center gap-3 rounded-xl bg-[#1E1E1E] p-3 active:scale-[0.99] transition"
          >
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-black">
              {s.logo_url ? (
                <img src={s.logo_url} alt={s.name} className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center text-xs text-white/40">TV</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{s.name}</p>
              <p className="truncate text-xs text-white/50">
                {s.category}
                {s.region ? ` • ${s.region}` : ""}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold">LIVE</span>
                <span className="flex items-center gap-1 text-xs text-white/60">
                  <Eye className="h-3.5 w-3.5" />
                  {s.viewer_count.toLocaleString()}
                </span>
              </div>
            </div>
          </Link>
        ))}

        {loading ? <p className="py-6 text-center text-sm text-white/40">Loading…</p> : null}
        {!loading && stations.length === 0 ? (
          <p className="py-10 text-center text-sm text-white/40">No live stations yet.</p>
        ) : null}
        <div ref={sentinel} className="h-6" />
      </div>
    </div>
  );
}
