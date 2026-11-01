import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Store } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/shops")({
  head: () => ({
    meta: [
      { title: "Suppliers & shops on FindMit" },
      { name: "description", content: "Browse verified shops, suppliers and storefronts across Ghana on FindMit." },
      { property: "og:title", content: "Suppliers & shops on FindMit" },
      { property: "og:description", content: "Browse verified shops, suppliers and storefronts across Ghana on FindMit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ShopsPage,
});

type ShopRow = { id: string; name: string; handle: string; category: string; is_open: boolean | null };

function ShopsPage() {
  const [shops, setShops] = useState<ShopRow[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    void supabase
      .from("shops")
      .select("id, name, handle, category, is_open")
      .order("name")
      .limit(200)
      .then(({ data }) => setShops((data ?? []) as ShopRow[]));
  }, []);

  const list = (shops ?? []).filter((s) => `${s.name} ${s.handle} ${s.category}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <AppShell>
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Link to="/home" aria-label="Back"><ArrowLeft className="size-5" /></Link>
        <h1 className="font-display text-base font-bold">Suppliers & shops</h1>
      </header>
      <div className="px-4 pb-28 pt-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter shops"
          className="w-full rounded-full bg-secondary px-5 py-3 text-sm outline-none"
        />
        {shops === null ? (
          <p className="mt-6 text-center text-sm text-muted-foreground">Loading shops…</p>
        ) : list.length === 0 ? (
          <p className="mt-6 text-center text-sm text-muted-foreground">No shops found yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {list.map((s) => (
              <li key={s.id}>
                <Link to="/$handle" params={{ handle: `@${s.handle}` }} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                  <Store className="size-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{s.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      @{s.handle} · {s.is_open === false ? "Closed" : "Open"}
                    </p>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
