import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ImageIcon, Loader2, RotateCw } from "lucide-react";
import { sanitizeSvg, splitTeacherParts } from "@/lib/diagrams";
import { drawTutorPicture } from "@/lib/tutor-diagram.functions";

const pictureCache = new Map<string, string>();

function ChalkDiagram({ svg, caption }: { svg: string; caption: string }) {
  const [safe, setSafe] = useState<string | null>(null);
  useEffect(() => setSafe(sanitizeSvg(svg)), [svg]);
  if (!safe) return null;
  return (
    <figure className="my-2 overflow-hidden rounded-xl border-4 border-chalkboard-frame bg-chalkboard p-2 font-sans">
      <div className="mx-auto max-w-md" dangerouslySetInnerHTML={{ __html: safe }} />
      {caption ? <figcaption className="mt-1 text-center text-xs text-chalk">{caption}</figcaption> : null}
    </figure>
  );
}

function TextbookPicture({ description }: { description: string }) {
  const draw = useServerFn(drawTutorPicture);
  const [url, setUrl] = useState<string | null>(pictureCache.get(description) ?? null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [err, setErr] = useState("");

  const load = () => {
    setState("loading");
    draw({ data: { description } })
      .then((r) => {
        pictureCache.set(description, r.url);
        setUrl(r.url);
        setState("idle");
      })
      .catch((e: unknown) => {
        setErr(e instanceof Error ? e.message : "Could not draw this picture");
        setState("error");
      });
  };

  useEffect(() => {
    if (!url) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description]);

  return (
    <figure className="my-2 overflow-hidden rounded-xl border border-border bg-card font-sans">
      {url ? (
        <img src={url} alt={description} className="w-full" loading="lazy" />
      ) : (
        <div className="flex aspect-square max-h-72 w-full flex-col items-center justify-center gap-2 bg-muted p-4 text-center text-xs text-muted-foreground">
          {state === "error" ? (
            <>
              <p>{err}</p>
              <button type="button" onClick={load} className="flex items-center gap-1 text-primary">
                <RotateCw className="size-3" /> Try again
              </button>
            </>
          ) : (
            <>
              <Loader2 className="size-5 animate-spin" />
              <p>Drawing the picture…</p>
            </>
          )}
        </div>
      )}
      <figcaption className="flex items-start gap-1 px-2 py-1.5 text-xs text-muted-foreground">
        <ImageIcon className="mt-0.5 size-3 shrink-0" />
        {description}
      </figcaption>
    </figure>
  );
}

/** Shows Ama's answer with any chalkboard diagrams or textbook pictures in place. */
export function TeacherText({
  text,
  renderText,
}: {
  text: string;
  renderText: (t: string) => ReactNode;
}) {
  const parts = useMemo(() => splitTeacherParts(text), [text]);
  return (
    <>
      {parts.map((p, i) =>
        p.kind === "text" ? (
          p.text.trim() ? <span key={i} className="block">{renderText(p.text.trim())}</span> : null
        ) : p.kind === "diagram" ? (
          <ChalkDiagram key={i} svg={p.svg} caption={p.caption} />
        ) : (
          <TextbookPicture key={i} description={p.description} />
        ),
      )}
    </>
  );
}
