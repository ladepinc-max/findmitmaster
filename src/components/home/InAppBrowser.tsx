import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, Home, Loader2, RotateCw, Share2 } from "lucide-react";
import { toast } from "sonner";
import { resolveDestination } from "@/lib/home-browser";

/** Full-screen in-app browser: pages load inside FindMit with Back, Forward, Refresh, Share and Home. */
export function InAppBrowser({ startUrl, onClose, onSearch }: { startUrl: string; onClose: () => void; onSearch: (q: string) => void }) {
  const [history, setHistory] = useState<string[]>([startUrl]);
  const [index, setIndex] = useState(0);
  const [address, setAddress] = useState(startUrl);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const url = history[index]!;

  useEffect(() => {
    setAddress(url);
    setLoading(true);
  }, [url, reloadKey]);

  const go = (raw: string) => {
    const next = resolveDestination(raw);
    if (!next) return onSearch(raw.trim());
    setHistory((h) => [...h.slice(0, index + 1), next]);
    setIndex((i) => i + 1);
  };

  const back = () => {
    if (index > 0) setIndex(index - 1);
    else onClose();
  };

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch {
      /* user cancelled */
    }
  };

  const btn = "flex size-9 items-center justify-center rounded-full text-foreground hover:bg-secondary disabled:opacity-40";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <form
        className="flex items-center gap-2 border-b border-border px-2 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (address.trim()) go(address);
        }}
      >
        <button type="button" aria-label="Home" className={btn} onClick={onClose}>
          <Home className="size-5" />
        </button>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          enterKeyHint="go"
          className="min-w-0 flex-1 rounded-full bg-secondary px-4 py-2 text-sm outline-none"
          aria-label="Address"
        />
        {loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
      </form>

      <iframe
        key={`${url}-${reloadKey}`}
        ref={frame}
        src={url}
        title="FindMit browser"
        className="min-h-0 w-full flex-1 border-0 bg-background"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        onLoad={() => setLoading(false)}
      />

      <div className="flex items-center justify-between border-t border-border px-2 py-1 text-xs text-muted-foreground">
        <span className="truncate px-2">Page blank? Some sites block in-app viewing.</span>
        <a href={url} target="_blank" rel="noopener noreferrer" className="flex shrink-0 items-center gap-1 px-2 py-1 font-semibold text-primary">
          <ExternalLink className="size-3.5" /> Open outside
        </a>
      </div>

      <nav className="flex items-center justify-around border-t border-border bg-surface px-2 py-2" aria-label="Browser controls">
        <button type="button" aria-label="Back" className={btn} onClick={back}>
          <ArrowLeft className="size-5" />
        </button>
        <button type="button" aria-label="Forward" className={btn} disabled={index >= history.length - 1} onClick={() => setIndex(index + 1)}>
          <ArrowRight className="size-5" />
        </button>
        <button type="button" aria-label="Refresh" className={btn} onClick={() => setReloadKey((k) => k + 1)}>
          <RotateCw className="size-5" />
        </button>
        <button type="button" aria-label="Share" className={btn} onClick={() => void share()}>
          <Share2 className="size-5" />
        </button>
      </nav>
    </div>
  );
}
