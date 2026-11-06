import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, WifiOff } from "lucide-react";
import { getLibraryArticle } from "@/lib/knowledge.functions";
import { getOfflineArticle, saveArticles, type LibraryArticle } from "@/lib/knowledge-cache";

export const Route = createFileRoute("/library/$id")({
  head: () => ({
    meta: [
      { title: "FindMit Library Reader" },
      { name: "description", content: "Read FindMit library articles, even without mobile data." },
      { property: "og:title", content: "FindMit Library Reader" },
      { property: "og:description", content: "Read FindMit library articles, even without mobile data." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Reader,
});

function Reader() {
  const { id } = Route.useParams();
  const [a, setA] = useState<LibraryArticle | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let live = true;
    setOnline(navigator.onLine);
    void (async () => {
      const local = await getOfflineArticle(id);
      if (local && live) { setA(local); setState("ok"); }
      if (!navigator.onLine) { if (!local && live) setState("missing"); return; }
      try {
        const row = await getLibraryArticle({ data: { id } });
        if (!live) return;
        if (row) { setA(row); setState("ok"); void saveArticles([row]); }
        else if (!local) setState("missing");
      } catch {
        if (live && !local) setState("missing");
      }
    })();
    return () => { live = false; };
  }, [id]);

  const paras = (a?.content || a?.summary || "").split(/\n+/).map((p) => p.trim()).filter(Boolean);
  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-background px-4 pb-16 pt-4 text-foreground">
      <Link to="/home" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="size-4" /> Home</Link>
      {state === "loading" ? <p className="mt-10 text-center text-muted-foreground">Opening…</p> : null}
      {state === "missing" ? (
        <p className="mt-10 text-center text-muted-foreground">This article isn't saved on your phone yet. Turn on data once and it will be saved.</p>
      ) : null}
      {a ? (
        <article className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-wa-green">FindMit Library · {a.category.replace(/_/g, " ")}</p>
          <h1 className="mt-1 text-2xl font-bold leading-tight">{a.title}</h1>
          {!online ? <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><WifiOff className="size-3" /> Reading from your phone</p> : null}
          {a.image_url && online ? <img src={a.image_url} alt="" className="mt-4 max-h-72 w-full rounded-xl object-cover" /> : null}
          <div className="mt-4 space-y-3 text-[15px] leading-relaxed">{paras.map((p, i) => <p key={i}>{p}</p>)}</div>
          <p className="mt-6 text-xs text-muted-foreground">Source: {a.source_name}</p>
          {online ? (
            <a href={a.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-wa-green">Open original <ExternalLink className="size-3" /></a>
          ) : null}
        </article>
      ) : null}
    </main>
  );
}
