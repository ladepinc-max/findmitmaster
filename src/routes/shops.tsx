import { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Plus, Settings, Store, Truck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { DirectoryPhoto } from "@/components/DirectoryPhoto";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { shopDirectoryAction, supplierDirectoryAction } from "@/lib/directory";
import { categoryLabel } from "@/lib/shops";
import { useCachedState } from "@/lib/page-cache";
import { useRole } from "@/lib/roles";
import { useLongPress } from "@/hooks/use-long-press";
import { AdminDeleteDialog, type DeleteTarget } from "@/components/AdminDeleteDialog";

export const Route = createFileRoute("/shops")({
  head: () => ({
    meta: [
      { title: "Shops & suppliers on FindMit" },
      { name: "description", content: "Browse FindMit shops and suppliers, open their profiles, or register and manage your own business." },
      { property: "og:title", content: "Shops & suppliers on FindMit" },
      { property: "og:description", content: "Find local shops and suppliers with photos, contact details and direct links to their FindMit profiles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ShopsPage,
});

type ShopRow = { id: string; name: string; handle: string; category: string; is_open: boolean | null; photo_url: string | null };
type SupplierRow = { id: string; name: string; category: string; photo_url: string | null };
const db = supabase as unknown as { from: (table: string) => any };

function ShopsPage() {
  const { user } = useAuth();
  const [shops, setShops] = useCachedState<ShopRow[]>("directory:shops", []);
  const [suppliers, setSuppliers] = useCachedState<SupplierRow[]>("directory:suppliers", []);
  const [loaded, setLoaded] = useState(false);
  const [hasShop, setHasShop] = useState(false);
  const [hasSupplier, setHasSupplier] = useState(false);
  const [q, setQ] = useState("");
  const { isAdmin } = useRole();
  const longPress = useLongPress(isAdmin);
  const [target, setTarget] = useState<DeleteTarget>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      db.from("shops").select("id, name, handle, category, is_open, photo_url").eq("subscription_status", "active").gt("subscription_expires_at", new Date().toISOString()).order("name"),
      db.from("suppliers").select("id, name, category, photo_url").eq("subscription_status", "active").gt("subscription_expires_at", new Date().toISOString()).order("name"),
    ]).then(([shopResult, supplierResult]) => {
      if (!active) return;
      setShops((shopResult.data ?? []) as ShopRow[]);
      setSuppliers((supplierResult.data ?? []) as SupplierRow[]);
      setLoaded(true);
    });
    return () => { active = false; };
  }, [setShops, setSuppliers]);

  useEffect(() => {
    let active = true;
    if (!user) {
      setHasShop(false);
      setHasSupplier(false);
      return;
    }
    void Promise.all([
      db.from("shops").select("id").eq("owner_id", user.id).limit(1),
      db.from("suppliers").select("id").eq("owner_id", user.id).limit(1),
    ]).then(([shopResult, supplierResult]) => {
      if (!active) return;
      setHasShop(Boolean(shopResult.data?.length));
      setHasSupplier(Boolean(supplierResult.data?.length));
    });
    return () => { active = false; };
  }, [user]);

  const filter = q.trim().toLowerCase();
  const shopList = useMemo(() => shops.filter((shop) => `${shop.name} ${shop.handle} ${shop.category}`.toLowerCase().includes(filter)), [shops, filter]);
  const supplierList = useMemo(() => suppliers.filter((supplier) => `${supplier.name} ${supplier.category}`.toLowerCase().includes(filter)), [suppliers, filter]);

  return (
    <AppShell>
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Link to="/home" aria-label="Back"><ArrowLeft className="size-5" /></Link>
        <h1 className="font-display text-base font-bold">Shops & suppliers</h1>
      </header>
      <div className="px-3 pb-28 pt-4">
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Filter shops and suppliers"
          aria-label="Filter shops and suppliers"
          className="w-full rounded-full bg-secondary px-5 py-3 text-sm outline-none"
        />
        <div className="mt-4 grid grid-cols-2 items-start gap-3">
          <section aria-labelledby="shops-heading">
            <div className="flex items-center gap-1.5">
              <Store className="size-4 text-primary" />
              <h2 id="shops-heading" className="font-display text-sm font-extrabold uppercase tracking-wide">Shops</h2>
            </div>
            <Link to="/my-shop" className="mt-2 flex min-h-10 w-full items-center justify-center gap-1 rounded-full bg-primary px-2 py-2 text-center text-[11px] font-bold text-primary-foreground">
              {hasShop ? <Settings className="size-3.5 shrink-0" /> : <Plus className="size-3.5 shrink-0" />}
              {shopDirectoryAction(hasShop)}
            </Link>
            {!loaded && shops.length === 0 ? <p className="mt-5 text-center text-xs text-muted-foreground">Loading shops…</p> : null}
            {loaded && shopList.length === 0 ? <p className="mt-5 text-center text-xs text-muted-foreground">No shops found.</p> : null}
            <ul className="mt-3 space-y-2.5">
              {shopList.map((shop) => (
                <li key={shop.id}>
                  <Link {...longPress(() => setTarget({ kind: "shop", id: shop.id, name: shop.name }))} to="/$handle" params={{ handle: `@${shop.handle}` }} className="block overflow-hidden rounded-xl border border-border bg-card transition-colors hover:bg-secondary" aria-label={`Open ${shop.name} shop`}>
                    <DirectoryPhoto path={shop.photo_url} cacheKey={shop.id} name={shop.name} kind="shop" />
                    <div className="p-2.5">
                      <p className="line-clamp-2 text-xs font-bold leading-4">{shop.name}</p>
                      <p className="mt-1 truncate text-[10px] text-muted-foreground">{categoryLabel(shop.category)}</p>
                      <p className={`mt-1 text-[10px] font-semibold ${shop.is_open === false ? "text-destructive" : "text-wa-green"}`}>{shop.is_open === false ? "Closed" : "Open"}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="suppliers-heading">
            <div className="flex items-center gap-1.5">
              <Truck className="size-4 text-wa-green" />
              <h2 id="suppliers-heading" className="font-display text-sm font-extrabold uppercase tracking-wide">Suppliers</h2>
            </div>
            <Link to="/my-supplier" className="mt-2 flex min-h-10 w-full items-center justify-center gap-1 rounded-full bg-wa-green px-2 py-2 text-center text-[11px] font-bold text-primary-foreground">
              {hasSupplier ? <Settings className="size-3.5 shrink-0" /> : <Plus className="size-3.5 shrink-0" />}
              {supplierDirectoryAction(hasSupplier)}
            </Link>
            {!loaded && suppliers.length === 0 ? <p className="mt-5 text-center text-xs text-muted-foreground">Loading suppliers…</p> : null}
            {loaded && supplierList.length === 0 ? <p className="mt-5 text-center text-xs text-muted-foreground">No suppliers found.</p> : null}
            <ul className="mt-3 space-y-2.5">
              {supplierList.map((supplier) => (
                <li key={supplier.id}>
                  <Link {...longPress(() => setTarget({ kind: "supplier", id: supplier.id, name: supplier.name }))} to="/supplier/$supplierId" params={{ supplierId: supplier.id }} className="block overflow-hidden rounded-xl border border-border bg-card transition-colors hover:bg-secondary" aria-label={`Open ${supplier.name} supplier profile`}>
                    <DirectoryPhoto path={supplier.photo_url} cacheKey={supplier.id} name={supplier.name} kind="supplier" />
                    <div className="p-2.5">
                      <p className="line-clamp-2 text-xs font-bold leading-4">{supplier.name}</p>
                      <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{categoryLabel(supplier.category)}</p>
                      <p className="mt-1 text-[10px] font-semibold text-wa-green">Supplier</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
        {isAdmin ? <p className="mt-6 text-center text-[10px] text-muted-foreground">Admin: long-press a shop or supplier to delete it.</p> : null}
      </div>
      <AdminDeleteDialog
        target={target}
        onClose={() => setTarget(null)}
        onDeleted={(id) => { setShops((l) => l.filter((x) => x.id !== id)); setSuppliers((l) => l.filter((x) => x.id !== id)); }}
      />
    </AppShell>
  );
}
