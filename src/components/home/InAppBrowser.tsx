import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  History,
  Home,
  Loader2,
  Lock,
  MoreVertical,
  Plus,
  RotateCw,
  Search,
  Share2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { isEmbedBlocked, resolveDestination } from "@/lib/home-browser";
import {
  closeTab,
  currentUrl,
  dayGroup,
  hostOf,
  loadHistory,
  loadTabs,
  navigateTab,
  newTab,
  openTab,
  recordVisit,
  saveHistory,
  saveTabs,
  updateTab,
  type HistoryEntry,
  type TabsState,
} from "@/lib/browser-tabs";

const NEW_TAB = "about:newtab";

/** Chrome-style in-app browser with tabs, tab switcher, and history. */
export function InAppBrowser({ startUrl, onClose, onSearch }: { startUrl: string; onClose: () => void; onSearch: (q: string) => void }) {
  const [state, setState] = useState<TabsState>(() => {
    const t = newTab(startUrl);
    return { tabs: [t], activeId: t.id };
  });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [view, setView] = useState<"page" | "tabs" | "history">("page");
  const [menu, setMenu] = useState(false);
  const [address, setAddress] = useState(startUrl);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [ready, setReady] = useState(false);

  // Restore saved tabs, then open the requested page in a new tab.
  useEffect(() => {
    const saved = loadTabs();
    if (saved?.tabs.length) {
      const existing = saved.tabs.find((t) => currentUrl(t) === startUrl);
      setState(existing ? { ...saved, activeId: existing.id } : openTab(saved, startUrl));
    }
    setHistory(loadHistory());
    setReady(true);
  }, [startUrl]);

  useEffect(() => {
    if (ready) saveTabs(state);
  }, [state, ready]);
  useEffect(() => {
    if (ready) saveHistory(history);
  }, [history, ready]);

  const tab = state.tabs.find((t) => t.id === state.activeId) ?? state.tabs[0]!;
  const url = currentUrl(tab);
  const isNew = url === NEW_TAB;

  useEffect(() => {
    setAddress(isNew ? "" : url);
    setLoading(!isNew);
    if (!isNew) setHistory((h) => recordVisit(h, url));
  }, [url, isNew, reloadKey]);

  const go = (raw: string) => {
    const next = resolveDestination(raw);
    if (!next) return onSearch(raw.trim());
    if (isEmbedBlocked(next)) return void window.open(next, "_blank", "noopener,noreferrer");
    setState((s) => updateTab(s, s.activeId, (t) => (currentUrl(t) === NEW_TAB ? { ...t, history: [next], index: 0 } : navigateTab(t, next))));
    setView("page");
  };

  const back = () => {
    if (tab.index > 0) setState((s) => updateTab(s, s.activeId, (t) => ({ ...t, index: t.index - 1 })));
    else onClose();
  };
  const forward = () => setState((s) => updateTab(s, s.activeId, (t) => ({ ...t, index: Math.min(t.history.length - 1, t.index + 1) })));

  const addTab = () => {
    setState((s) => openTab(s, NEW_TAB));
    setView("page");
    setMenu(false);
  };
  const removeTab = (id: string) => {
    const next = closeTab(state, id);
    if (!next) {
      saveTabs(null);
      onClose();
    } else setState(next);
  };

  const share = async () => {
    setMenu(false);
    try {
      if (navigator.share) await navigator.share({ url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch {
      /* cancelled */
    }
  };

  const btn = "flex size-10 items-center justify-center rounded-full text-foreground hover:bg-secondary disabled:opacity-40";
  const TabCount = (
    <button type="button" aria-label="Show tabs" className={btn} onClick={() => setView("tabs")}>
      <span className="flex size-6 items-center justify-center rounded-md border-2 border-foreground text-[11px] font-bold">
        {state.tabs.length > 99 ? ":D" : state.tabs.length}
      </span>
    </button>
  );

  if (view === "tabs")
    return (
      <TabSwitcher
        state={state}
        onPick={(id) => {
          setState((s) => ({ ...s, activeId: id }));
          setView("page");
        }}
        onClose={removeTab}
        onNew={addTab}
        onCloseAll={() => {
          saveTabs(null);
          onClose();
        }}
        onBack={() => setView("page")}
      />
    );

  if (view === "history")
    return (
      <HistoryView
        history={history}
        onBack={() => setView("page")}
        onOpen={(u) => go(u)}
        onDelete={(i) => setHistory((h) => h.filter((_, k) => k !== i))}
        onClear={() => {
          setHistory([]);
          toast.success("Browsing history cleared");
        }}
      />
    );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <form
        className="flex items-center gap-1 border-b border-border px-2 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (address.trim()) go(address);
        }}
      >
        <button type="button" aria-label="Home" className={btn} onClick={onClose}>
          <Home className="size-5" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-secondary px-3 py-2">
          {isNew ? <Search className="size-4 shrink-0 text-muted-foreground" /> : <Lock className="size-3.5 shrink-0 text-muted-foreground" />}
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            enterKeyHint="go"
            placeholder="Search or type web address"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            aria-label="Address"
          />
          {loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
        </div>
        {TabCount}
        <div className="relative">
          <button type="button" aria-label="Menu" className={btn} onClick={() => setMenu((m) => !m)}>
            <MoreVertical className="size-5" />
          </button>
          {menu ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div className="absolute right-0 top-11 z-20 w-56 overflow-hidden rounded-xl border border-border bg-popover py-1 text-popover-foreground shadow-lg">
                <div className="flex justify-around border-b border-border pb-1">
                  <button type="button" aria-label="Forward" className={btn} disabled={tab.index >= tab.history.length - 1} onClick={forward}>
                    <ArrowRight className="size-5" />
                  </button>
                  <button type="button" aria-label="Reload" className={btn} onClick={() => { setReloadKey((k) => k + 1); setMenu(false); }}>
                    <RotateCw className="size-5" />
                  </button>
                  <button type="button" aria-label="Share" className={btn} onClick={() => void share()}>
                    <Share2 className="size-5" />
                  </button>
                </div>
                <MenuItem icon={<Plus className="size-4" />} label="New tab" onClick={addTab} />
                <MenuItem icon={<History className="size-4" />} label="History" onClick={() => { setView("history"); setMenu(false); }} />
                {!isNew ? (
                  <MenuItem icon={<ExternalLink className="size-4" />} label="Open in external browser" onClick={() => { window.open(url, "_blank", "noopener,noreferrer"); setMenu(false); }} />
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </form>

      {isNew ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
          <Search className="size-8" />
          <p className="text-sm">New tab — search or type a web address above.</p>
        </div>
      ) : (
        <iframe
          key={`${tab.id}-${url}-${reloadKey}`}
          src={url}
          title="FindMit browser"
          className="min-h-0 w-full flex-1 border-0 bg-background"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          onLoad={() => setLoading(false)}
        />
      )}

      <nav className="flex items-center justify-around border-t border-border bg-surface px-2 py-1.5" aria-label="Browser controls">
        <button type="button" aria-label="Back" className={btn} onClick={back}>
          <ArrowLeft className="size-5" />
        </button>
        <button type="button" aria-label="Forward" className={btn} disabled={tab.index >= tab.history.length - 1} onClick={forward}>
          <ArrowRight className="size-5" />
        </button>
        <button type="button" aria-label="New tab" className={btn} onClick={addTab}>
          <Plus className="size-5" />
        </button>
        {TabCount}
        <button type="button" aria-label="History" className={btn} onClick={() => setView("history")}>
          <History className="size-5" />
        </button>
      </nav>
    </div>
  );
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-secondary">
      {icon}
      {label}
    </button>
  );
}

function Favicon({ url }: { url: string }) {
  const host = hostOf(url);
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold uppercase text-primary-foreground">
      {url === NEW_TAB ? "+" : host.charAt(0)}
    </span>
  );
}

function TabSwitcher({
  state,
  onPick,
  onClose,
  onNew,
  onCloseAll,
  onBack,
}: {
  state: TabsState;
  onPick: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onCloseAll: () => void;
  onBack: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-muted">
      <header className="flex items-center justify-between border-b border-border bg-background px-2 py-2">
        <button type="button" aria-label="New tab" className="flex size-10 items-center justify-center rounded-full hover:bg-secondary" onClick={onNew}>
          <Plus className="size-5" />
        </button>
        <span className="flex size-7 items-center justify-center rounded-md border-2 border-foreground text-xs font-bold">{state.tabs.length}</span>
        <div className="flex items-center">
          <button type="button" className="rounded-full px-3 py-2 text-sm font-semibold text-primary hover:bg-secondary" onClick={onCloseAll}>
            Close all
          </button>
          <button type="button" className="rounded-full px-3 py-2 text-sm font-semibold hover:bg-secondary" onClick={onBack}>
            Done
          </button>
        </div>
      </header>
      <div className="grid flex-1 auto-rows-[200px] grid-cols-2 gap-3 overflow-y-auto p-3">
        {state.tabs.map((t) => {
          const u = currentUrl(t);
          const active = t.id === state.activeId;
          return (
            <div
              key={t.id}
              role="button"
              tabIndex={0}
              onClick={() => onPick(t.id)}
              className={`flex flex-col overflow-hidden rounded-2xl bg-card shadow-sm ${active ? "ring-2 ring-primary" : "border border-border"}`}
            >
              <div className={`flex items-center gap-2 px-2 py-1.5 ${active ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                <Favicon url={u} />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">{u === NEW_TAB ? "New tab" : hostOf(u)}</span>
                <button
                  type="button"
                  aria-label="Close tab"
                  className="flex size-6 items-center justify-center rounded-full hover:bg-background/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(t.id);
                  }}
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="flex flex-1 items-center justify-center p-3 text-center text-xs text-muted-foreground">
                <span className="line-clamp-4 break-all">{u === NEW_TAB ? "Search or type web address" : u}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HistoryView({
  history,
  onBack,
  onOpen,
  onDelete,
  onClear,
}: {
  history: HistoryEntry[];
  onBack: () => void;
  onOpen: (url: string) => void;
  onDelete: (index: number) => void;
  onClear: () => void;
}) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const out: Record<string, { e: HistoryEntry; i: number }[]> = {};
    history.forEach((e, i) => {
      if (term && !e.url.toLowerCase().includes(term)) return;
      (out[dayGroup(e.at)] ??= []).push({ e, i });
    });
    return out;
  }, [history, q]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center gap-2 border-b border-border px-2 py-2">
        <button type="button" aria-label="Back" className="flex size-10 items-center justify-center rounded-full hover:bg-secondary" onClick={onBack}>
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="flex-1 text-lg font-semibold">History</h1>
      </header>
      <div className="space-y-3 border-b border-border p-3">
        <div className="flex items-center gap-2 rounded-full bg-secondary px-3 py-2">
          <Search className="size-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search history" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </div>
        <button type="button" className="text-sm font-semibold text-primary" onClick={onClear} disabled={!history.length}>
          Clear browsing data…
        </button>
      </div>
      <div className="flex-1 overflow-y-auto pb-6">
        {!history.length ? <p className="p-6 text-center text-sm text-muted-foreground">No history yet</p> : null}
        {(["Today", "Yesterday", "Earlier"] as const).map((g) =>
          groups[g]?.length ? (
            <section key={g}>
              <h2 className="px-4 pb-1 pt-4 text-xs font-semibold uppercase text-muted-foreground">{g}</h2>
              {groups[g]!.map(({ e, i }) => (
                <div key={`${e.url}-${e.at}`} className="flex items-center gap-3 px-4 py-2 hover:bg-secondary">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onOpen(e.url)}>
                    <Favicon url={e.url} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{hostOf(e.url)}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {e.url}
                      </span>
                    </span>
                  </button>
                  <button type="button" aria-label="Remove" className="flex size-8 items-center justify-center rounded-full hover:bg-background" onClick={() => onDelete(i)}>
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </section>
          ) : null,
        )}
      </div>
    </div>
  );
}
