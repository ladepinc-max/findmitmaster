import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { BookOpen, Calculator, Coins, WifiOff } from "lucide-react";
import { searchKnowledge, type QuickAnswer } from "@/lib/knowledge.functions";
import { readCached, saveCached, searchOfflineLibrary, type CachedHit } from "@/lib/knowledge-cache";

/** Instant answer card + FindMit library matches; library matches are kept on the phone for offline use. */
export function LibraryResults({ q }: { q: string; onOpen?: (url: string) => void }) {
  const navigate = useNavigate();
  const run = useServerFn(searchKnowledge);
  const [quick, setQuick] = useState<QuickAnswer | null>(null);
  const [hits, setHits] = useState<CachedHit[]>([]);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let live = true;
    setQuick(null);
    setOffline(false);
    void readCached(q).then(async (c) => {
      if (!live) return;
      if (c?.length) return setHits(c);
      const local = await searchOfflineLibrary(q);
      if (live && local.length) setHits(local);
    });
    run({ data: { q } })
      .then((r) => {
        if (!live) return;
        setQuick(r.quick);
        setHits(r.hits);
        void saveCached(q, r.hits);
      })
      .catch(() => live && setOffline(true));
    return () => {
      live = false;
    };
  }, [q, run]);

  if (!quick && hits.length === 0) return null;
  return (
    <section className="mt-4 space-y-2">
      {quick?.kind === "forex" ? (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground"><Coins className="size-4" /> Live rate</p>
          <p className="mt-1 text-2xl font-bold">{quick.amount} {quick.from} = {quick.result.toLocaleString()} {quick.to}</p>
          <p className="text-xs text-muted-foreground">1 {quick.from} = {quick.rate} {quick.to}{quick.updated ? ` · ${quick.updated}` : ""}</p>
        </div>
      ) : null}
      {quick?.kind === "math" ? (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground"><Calculator className="size-4" /> Answer</p>
          <p className="mt-1 text-2xl font-bold">{quick.expression} = {quick.result.toLocaleString()}</p>
        </div>
      ) : null}
      {hits.length > 0 ? (
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-wa-green">
            <BookOpen className="size-4" /> FindMit Library
            {offline ? <span className="ml-auto flex items-center gap-1 text-xs font-normal text-muted-foreground"><WifiOff className="size-3" /> saved on phone</span> : null}
          </h2>
          <ul className="mt-2 space-y-2">
            {hits.map((h) => (
              <li key={h.id}>
                <button type="button" onClick={() => navigate({ to: "/library/$id", params: { id: h.id } })} className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-left">
                  <p className="text-sm font-semibold">{h.title}</p>
                  <p className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">{h.summary}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{h.source_name} · {h.category.replace(/_/g, " ")}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
