import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, MapPin, Phone, Truck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { DirectoryPhoto } from "@/components/DirectoryPhoto";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { categoryLabel } from "@/lib/shops";

export const Route = createFileRoute("/supplier/$supplierId")({
  head: ({ params }) => ({
    meta: [
      { title: "Supplier profile — FindMit" },
      { name: "description", content: "View this FindMit supplier's profile, supplies, phone number and location." },
      { property: "og:title", content: "Supplier profile — FindMit" },
      { property: "og:description", content: "Contact a FindMit supplier and get directions to their business." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: `https://findmit.world/supplier/${params.supplierId}` },
    ],
    links: [{ rel: "canonical", href: `https://findmit.world/supplier/${params.supplierId}` }],
  }),
  component: SupplierProfilePage,
});

type Supplier = { id: string; name: string; category: string; phone: string; landmark: string | null; description: string | null; lat: number | null; lng: number | null; photo_url: string | null };
const db = supabase as unknown as { from: (table: string) => any };

function SupplierProfilePage() {
  const { supplierId } = Route.useParams();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  useEffect(() => {
    let active = true;
    void db.from("suppliers").select("id, name, category, phone, landmark, description, lat, lng, photo_url").eq("id", supplierId).eq("subscription_status", "active").gt("subscription_expires_at", new Date().toISOString()).maybeSingle().then(({ data, error }: { data: Supplier | null; error: { message: string } | null }) => {
      if (!active) return;
      if (error || !data) { setSupplier(null); setState("missing"); return; }
      setSupplier(data);
      setState("ready");
    });
    return () => { active = false; };
  }, [supplierId]);

  if (state === "loading") return <main className="flex min-h-dvh items-center justify-center bg-background"><Loader2 className="size-6 animate-spin text-muted-foreground" /></main>;
  if (!supplier) return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <Truck className="size-10 text-muted-foreground" />
      <h1 className="font-display text-xl font-bold">Supplier not available</h1>
      <p className="max-w-xs text-sm text-muted-foreground">This supplier profile does not exist or its yearly registration has expired.</p>
      <Button asChild><Link to="/shops">Back to shops & suppliers</Link></Button>
    </main>
  );

  const directions = supplier.lat != null && supplier.lng != null ? `https://www.google.com/maps/dir/?api=1&destination=${supplier.lat},${supplier.lng}` : null;
  return (
    <AppShell>
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Link to="/shops" aria-label="Back to shops and suppliers"><ArrowLeft className="size-5" /></Link>
        <h1 className="font-display text-base font-bold">Supplier profile</h1>
      </header>
      <main className="mx-auto max-w-xl px-4 pb-28 pt-4">
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <DirectoryPhoto path={supplier.photo_url} cacheKey={supplier.id} name={supplier.name} kind="supplier" className="aspect-[4/3] w-full" />
          <div className="space-y-4 p-5">
            <div><h2 className="font-display text-2xl font-bold">{supplier.name}</h2><p className="mt-1 text-sm font-medium text-wa-green">{categoryLabel(supplier.category)}</p></div>
            {supplier.description ? <p className="whitespace-pre-wrap text-sm leading-6">{supplier.description}</p> : null}
            {supplier.landmark ? <p className="flex items-start gap-2 text-sm text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" />{supplier.landmark}</p> : null}
            <div className="grid grid-cols-2 gap-3">
              <Button asChild className="w-full"><a href={`tel:${supplier.phone.replace(/[^0-9+]/g, "")}`}><Phone className="size-4" />Call supplier</a></Button>
              {directions ? <Button asChild variant="outline" className="w-full"><a href={directions} target="_blank" rel="noreferrer"><MapPin className="size-4" />Directions</a></Button> : null}
            </div>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
