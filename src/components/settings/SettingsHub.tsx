import { useState, type ReactNode } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, Settings, X, type LucideIcon } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type HubItem = { id: string; label: string; hint?: string; badge?: number; render: () => ReactNode };
export type HubCategory = { id: string; label: string; icon: LucideIcon; items: HubItem[] };

/** Gear button → categorized menu; a category reveals its settings, a setting slides in its own panel. */
export function SettingsHub({ title, categories, trigger }: { title: string; categories: HubCategory[]; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [active, setActive] = useState<HubItem | null>(null);
  const list = categories.filter((c) => c.items.length > 0);
  const total = list.reduce((n, c) => n + c.items.reduce((m, i) => m + (i.badge ?? 0), 0), 0);

  return (
    <>
      <button type="button" aria-label={title} onClick={() => setOpen(true)} className="relative text-muted-foreground hover:text-foreground">
        {trigger ?? <Settings className="size-5" />}
        {total > 0 ? <span className="absolute -right-2 -top-2 rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">{total}</span> : null}
      </button>
      <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) setActive(null); }}>
        <SheetContent side="right" className="w-full max-w-lg gap-0 overflow-hidden p-0 sm:max-w-lg [&>button]:hidden">
          <div className="relative h-full overflow-hidden">
            <div className={cn("absolute inset-0 overflow-y-auto transition-transform duration-300", active ? "-translate-x-full" : "translate-x-0")}>
              <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background px-4 py-3">
                <SheetTitle className="flex-1 font-display text-base font-bold">{title}</SheetTitle>
                <button type="button" aria-label="Close" onClick={() => setOpen(false)}><X className="size-5" /></button>
              </header>
              <ul className="p-3">
                {list.map((cat) => {
                  const isOpen = expanded === cat.id;
                  const Icon = cat.icon;
                  const count = cat.items.reduce((m, i) => m + (i.badge ?? 0), 0);
                  return (
                    <li key={cat.id} className="mb-2 overflow-hidden rounded-xl border border-border bg-card">
                      <button type="button" onClick={() => setExpanded(isOpen ? null : cat.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Icon className="size-4" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{cat.label}</span>
                          <span className="block text-xs text-muted-foreground">{cat.items.length} setting{cat.items.length === 1 ? "" : "s"}</span>
                        </span>
                        {count > 0 ? <span className="rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">{count}</span> : null}
                        <ChevronDown className={cn("size-4 shrink-0 transition-transform", isOpen && "rotate-180")} />
                      </button>
                      {isOpen ? (
                        <ul className="border-t border-border">
                          {cat.items.map((item) => (
                            <li key={item.id}>
                              <button type="button" onClick={() => setActive(item)} className="flex w-full items-center gap-3 px-4 py-3 pl-16 text-left hover:bg-muted/50">
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm">{item.label}</span>
                                  {item.hint ? <span className="block text-xs text-muted-foreground">{item.hint}</span> : null}
                                </span>
                                {item.badge ? <span className="rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">{item.badge}</span> : null}
                                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className={cn("absolute inset-0 overflow-y-auto bg-background transition-transform duration-300", active ? "translate-x-0" : "translate-x-full")}>
              <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background px-4 py-3">
                <button type="button" aria-label="Back" onClick={() => setActive(null)}><ArrowLeft className="size-5" /></button>
                <p className="flex-1 truncate font-display text-base font-bold">{active?.label}</p>
              </header>
              <div className="space-y-4 p-4">{active?.render()}</div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
