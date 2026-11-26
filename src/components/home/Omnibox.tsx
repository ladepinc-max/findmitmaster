import { useEffect, useState } from "react";
import { ArrowUpLeft, Clock, Globe, Search, Store, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { QuickApp } from "@/lib/home-browser";

const KEY = "findmit-recent-searches";
export function rememberSearch(q: string) {
  try {
    const list = [q, ...readRecent().filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, 8);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch { /* storage unavailable */ }
}
function readRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]; } catch { return []; }
}
const favicon = (url: string) => {
  try { return `https://www.google.com/s2/favicons?sz=64&domain=${new URL(url).hostname}`; } catch { return ""; }
};

/** Chrome-style suggestion panel shown while the search bar is focused. */
export function Omnibox({ query, apps, onPick, onFill, onOpenSite, onOpenShop }: {
  query: string; apps: QuickApp[];
  onPick: (q: string) => void; onFill: (q: string) => void;
  onOpenSite: (url: string) => void; onOpenShop: (handle: string) => void;
}) {
  const [recent, setRecent] = useState<string[]>([]);
  const [shops, setShops] = useState<{ name: string; handle: string; category: string }[]>([]);
  useEffect(() => setRecent(readRecent()), []);
  const q = query.trim().toLowerCase();
  useEffect(() => {
    if (q.length < 2) { setShops([]); return; }
    const t = setTimeout(() => {
      const like = `%${q.replace(/[%_,"]/g, " ")}%`;
      void supabase.from("shops").select("name, handle, category").or(`name.ilike."${like}",handle.ilike."${like}"`).limit(3)
        .then(({ data }) => setShops((data ?? []) as typeof shops));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const sites = (q ? apps.filter((a) => a.label.toLowerCase().includes(q) || a.url.toLowerCase().includes(q)) : apps).slice(0, q ? 3 : 4);
  const past = (q ? recent.filter((r) => r.toLowerCase().includes(q) && r.toLowerCase() !== q) : recent).slice(0, 5);
  const row = "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-secondary";
  if (!sites.length && !past.length && !shops.length && !q) return null;

  return (
    <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-border bg-popover py-1 shadow-xl" onMouseDown={(e) => e.preventDefault()}>
      {q ? (
        <button type="button" className={row} onClick={() => onPick(query.trim())}>
          <Search className="size-4 text-muted-foreground" /><span className="flex-1 truncate font-medium">{query.trim()}</span>
        </button>
      ) : null}
      {past.map((r) => (
        <div key={r} className="flex items-center">
          <button type="button" className={row} onClick={() => onPick(r)}>
            <Clock className="size-4 text-muted-foreground" /><span className="flex-1 truncate">{r}</span>
          </button>
          {q ? (
            <button type="button" aria-label={`Use ${r}`} className="px-3 text-muted-foreground" onClick={() => onFill(r)}><ArrowUpLeft className="size-4" /></button>
          ) : (
            <button type="button" aria-label={`Remove ${r}`} className="px-3 text-muted-foreground" onClick={() => {
              const next = recent.filter((x) => x !== r); setRecent(next); localStorage.setItem(KEY, JSON.stringify(next));
            }}><X className="size-4" /></button>
          )}
        </div>
      ))}
      {shops.map((s) => (
        <button key={s.handle} type="button" className={row} onClick={() => onOpenShop(s.handle)}>
          <Store className="size-4 text-primary" />
          <span className="min-w-0 flex-1"><span className="block truncate font-medium">{s.name}</span><span className="block truncate text-xs text-muted-foreground">findmit.world/@{s.handle} · {s.category}</span></span>
        </button>
      ))}
      {sites.map((a) => (
        <button key={a.id} type="button" className={row} onClick={() => onOpenSite(a.url)}>
          {favicon(a.url) ? <img src={favicon(a.url)} alt="" className="size-4 rounded-sm" loading="lazy" /> : <Globe className="size-4" />}
          <span className="min-w-0 flex-1"><span className="block truncate font-medium">{a.label}</span><span className="block truncate text-xs text-muted-foreground">{a.url.replace(/^https?:\/\//, "")}</span></span>
        </button>
      ))}
    </div>
  );
}
