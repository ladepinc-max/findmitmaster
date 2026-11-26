import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Camera, Loader2, Lock, MapPin, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DirectoryPhoto } from "@/components/DirectoryPhoto";
import { CommunityMapView } from "@/components/chat/CommunityMapView";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { captureAccurateLocation } from "@/lib/community-map";
import { useCategoryFee, useShopCategories } from "@/lib/shop-categories";
import { CUSTOM_CATEGORY, SHOP_CATEGORIES, daysLeft, isShopActive, uploadShopPhoto } from "@/lib/shops";
import { startSupplierCheckout } from "@/lib/supplier.functions";
import { checkoutCallbackUrl, openCheckout } from "@/lib/open-checkout";

export const Route = createFileRoute("/my-supplier")({
  head: () => ({
    meta: [
      { title: "My Supplier Profile — FindMit" },
      { name: "description", content: "Register as a supplier on FindMit, add your profile photo and help customers find your supplies." },
      { property: "og:title", content: "My Supplier Profile — FindMit" },
      { property: "og:description", content: "Create and manage your supplier profile, category, photo, contact details and location." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MySupplierPage,
});

type Supplier = {
  id: string;
  owner_id: string;
  name: string;
  category: string;
  phone: string;
  landmark: string | null;
  description: string | null;
  lat: number | null;
  lng: number | null;
  photo_url: string | null;
  subscription_status: string;
  subscription_expires_at: string | null;
};
const db = supabase as unknown as { from: (table: string) => any };

function MySupplierPage() {
  const { user, loading } = useAuth();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [ready, setReady] = useState(false);
  const load = useCallback(async () => {
    if (!user) { setReady(true); return; }
    const { data, error } = await db.from("suppliers").select("*").eq("owner_id", user.id).maybeSingle();
    if (error) toast.error(error.message);
    setSupplier((data as Supplier | null) ?? null);
    setReady(true);
  }, [user]);
  useEffect(() => { setReady(false); void load(); }, [load]);

  return (
    <main className="min-h-dvh bg-background pb-16">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Link to="/shops" aria-label="Back to shops and suppliers"><ArrowLeft className="size-5" /></Link>
        <h1 className="font-display text-lg font-bold">My Supplier Profile</h1>
      </header>
      <div className="mx-auto max-w-lg space-y-4 px-4 py-4">
        {loading || !ready ? <Loader2 className="mx-auto mt-10 size-6 animate-spin text-muted-foreground" /> : !user ? (
          <section className="rounded-2xl bg-card p-6 text-center shadow-sm">
            <Truck className="mx-auto size-10 text-wa-green" />
            <h2 className="mt-3 font-display text-xl font-bold">Register as a Supplier</h2>
            <p className="mt-2 text-sm text-muted-foreground">Sign in to create and manage your supplier profile.</p>
            <Button asChild className="mt-5 w-full"><Link to="/auth">Sign in to continue</Link></Button>
          </section>
        ) : !supplier ? <RegisterSupplierForm userId={user.id} onCreated={load} /> : !isShopActive(supplier) ? (
          <SupplierPayCard supplier={supplier} onActivated={load} />
        ) : <ManageSupplier supplier={supplier} onChanged={load} />}
      </div>
    </main>
  );
}

function RegisterSupplierForm({ userId, onCreated }: { userId: string; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("food");
  const [customCategory, setCustomCategory] = useState("");
  const [phone, setPhone] = useState("");
  const [landmark, setLandmark] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number; msg: string } | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const { rows: categoryRows } = useShopCategories();
  const finalCategory = category === CUSTOM_CATEGORY ? customCategory.trim() : category;
  const { amount, waived } = useCategoryFee(finalCategory);

  const locate = async () => {
    setLocating(true);
    const result = await captureAccurateLocation();
    setLocating(false);
    if (result.quality === "blocked") return void toast.error(result.message);
    setGps({ lat: result.point.lat, lng: result.point.lng, msg: result.message });
  };

  const save = async () => {
    if (name.trim().length < 2 || !phone.trim()) return void toast.error("Add your supplier name and phone number");
    if (!finalCategory) return void toast.error("Choose or write your supply category");
    if (!gps) return void toast.error("Capture your supplier location");
    setSaving(true);
    try {
      const photoUrl = photo ? await uploadShopPhoto(userId, photo) : null;
      const { error } = await db.from("suppliers").insert({
        owner_id: userId,
        name: name.trim(),
        category: finalCategory,
        phone: phone.trim(),
        landmark: landmark.trim() || null,
        description: description.trim() || null,
        lat: gps.lat,
        lng: gps.lng,
        photo_url: photoUrl,
      });
      if (error) throw error;
      toast.success("Supplier profile saved — complete payment to go live");
      onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your supplier profile");
    } finally { setSaving(false); }
  };

  return (
    <section className="space-y-4 rounded-2xl bg-card p-4 shadow-sm">
      <div>
        <p className="font-display text-base font-bold">Register as a Supplier</p>
        <p className="text-xs text-muted-foreground">Add your supplies business so customers can find and contact you.</p>
      </div>
      <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Supplier or business name" maxLength={100} />
      <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Supply category">
        {(categoryRows.some((row) => row.is_active) ? categoryRows.filter((row) => row.is_active) : SHOP_CATEGORIES.map((row) => ({ ...row, is_big_shop: false }))).map((row) => (
          <option key={row.value} value={row.value}>{row.emoji} {row.label}{row.is_big_shop ? " · Big shop" : ""}</option>
        ))}
        <option value={CUSTOM_CATEGORY}>✏️ Write yours…</option>
      </select>
      {category === CUSTOM_CATEGORY ? <Input value={customCategory} onChange={(event) => setCustomCategory(event.target.value)} placeholder="Write your supply category" maxLength={100} /> : null}
      <Input value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" placeholder="Phone for supply orders" maxLength={30} />
      <Input value={landmark} onChange={(event) => setLandmark(event.target.value)} placeholder="Landmark (optional)" maxLength={200} />
      <textarea className="min-h-20 w-full rounded-md border border-input bg-background p-3 text-sm" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What do you supply?" maxLength={2000} />
      <Button variant="outline" className="w-full" onClick={() => void locate()} disabled={locating}>
        {locating ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
        {gps ? "Location captured — tap to retry" : "Capture supplier location"}
      </Button>
      {gps ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{gps.msg}</p>
          <div className="overflow-hidden rounded-xl">
            <CommunityMapView center={{ lat: gps.lat, lng: gps.lng }} pin={{ lat: gps.lat, lng: gps.lng }} onPinMove={(lat, lng) => setGps((current) => current ? { ...current, lat, lng, msg: "Pin moved — customers will be directed here" } : current)} onMapTap={(lat, lng) => setGps((current) => current ? { ...current, lat, lng, msg: "Pin moved — customers will be directed here" } : current)} height={240} />
          </div>
        </div>
      ) : null}
      <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border p-3 text-sm">
        <Camera className="size-4" /> {photo ? photo.name : "Add a supplier profile photo"}
        <input type="file" accept="image/*" className="hidden" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} />
      </label>
      <Button className="w-full" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : `Continue to register — ${waived || amount <= 0 ? "Free" : `GH₵ ${amount}`}`}</Button>
    </section>
  );
}

function SupplierPayCard({ supplier, onActivated }: { supplier: Supplier; onActivated: () => void }) {
  const { amount, waived } = useCategoryFee(supplier.category);
  const start = useServerFn(startSupplierCheckout);
  const [momo, setMomo] = useState("");
  const [busy, setBusy] = useState(false);
  const expired = supplier.subscription_status === "active";
  const pay = async () => {
    setBusy(true);
    try {
      const result = await start({ data: { supplierId: supplier.id, momoNumber: momo, callbackUrl: checkoutCallbackUrl() } });
      if (result.activated) { toast.success("Your supplier profile is live!"); onActivated(); }
      else if (result.authorizationUrl) openCheckout(result.authorizationUrl);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not start payment"); }
    finally { setBusy(false); }
  };
  return (
    <section className="space-y-4 rounded-2xl bg-card p-5 text-center shadow-sm">
      <Lock className="mx-auto size-9 text-wa-green" />
      <div><p className="font-display text-lg font-bold">{supplier.name}</p><p className="text-sm text-muted-foreground">{expired ? "Your supplier registration has expired. Renew to appear in the directory." : "Your supplier profile is reserved but not live yet."}</p></div>
      <ul className="space-y-1 text-left text-sm"><li>✓ Listed beside shops with your profile photo</li><li>✓ Customers can call and find your location</li><li>✓ Same yearly category registration as shops</li></ul>
      <p className="font-display text-2xl font-bold">{waived || amount <= 0 ? "Free for now" : `GH₵ ${amount}`}{!waived && amount > 0 ? <span className="text-sm font-normal text-muted-foreground"> / year</span> : null}</p>
      {!waived && amount > 0 ? <Input value={momo} onChange={(event) => setMomo(event.target.value)} type="tel" placeholder="Mobile Money number (MTN, Telecel, AT)" /> : null}
      <Button className="w-full" onClick={() => void pay()} disabled={busy}>{busy ? "Please wait…" : waived || amount <= 0 ? "Activate my supplier profile" : expired ? "Renew with Mobile Money" : "Pay with Mobile Money"}</Button>
    </section>
  );
}

function ManageSupplier({ supplier, onChanged }: { supplier: Supplier; onChanged: () => void }) {
  const [name, setName] = useState(supplier.name);
  const [phone, setPhone] = useState(supplier.phone);
  const [landmark, setLandmark] = useState(supplier.landmark ?? "");
  const [description, setDescription] = useState(supplier.description ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const left = daysLeft(supplier.subscription_expires_at);
  if (renewing) return <SupplierPayCard supplier={supplier} onActivated={() => { setRenewing(false); onChanged(); }} />;

  const save = async () => {
    if (name.trim().length < 2 || !phone.trim()) return void toast.error("Add your supplier name and phone number");
    setSaving(true);
    try {
      const photoUrl = photo ? await uploadShopPhoto(supplier.owner_id, photo) : supplier.photo_url;
      const { error } = await db.from("suppliers").update({ name: name.trim(), phone: phone.trim(), landmark: landmark.trim() || null, description: description.trim() || null, photo_url: photoUrl }).eq("id", supplier.id);
      if (error) throw error;
      toast.success("Supplier profile updated");
      setPhoto(null);
      onChanged();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update your supplier profile"); }
    finally { setSaving(false); }
  };

  return (
    <>
      <section className="overflow-hidden rounded-2xl bg-card shadow-sm">
        <DirectoryPhoto path={photo ? null : supplier.photo_url} cacheKey={supplier.id} name={supplier.name} kind="supplier" className="aspect-[4/3] w-full" />
        <div className="p-4"><p className="font-display text-xl font-bold">{supplier.name}</p><p className="text-sm text-muted-foreground">{supplier.category}</p><p className="mt-2 text-xs font-semibold text-wa-green">Active · {left} days left</p></div>
      </section>
      <Button asChild variant="outline" className="w-full"><Link to="/supplier/$supplierId" params={{ supplierId: supplier.id }}>View public supplier profile</Link></Button>
      {left <= 30 ? <Button className="w-full" onClick={() => setRenewing(true)}>Renew supplier registration</Button> : null}
      <section className="space-y-3 rounded-2xl bg-card p-4 shadow-sm">
        <h2 className="font-display font-bold">Edit supplier details</h2>
        <Input value={name} onChange={(event) => setName(event.target.value)} aria-label="Supplier name" maxLength={100} />
        <Input value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" aria-label="Supplier phone" maxLength={30} />
        <Input value={landmark} onChange={(event) => setLandmark(event.target.value)} placeholder="Landmark" maxLength={200} />
        <textarea className="min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What do you supply?" maxLength={2000} />
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border p-3 text-sm"><Camera className="size-4" />{photo ? photo.name : "Replace profile photo"}<input type="file" accept="image/*" className="hidden" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} /></label>
        <Button className="w-full" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save supplier details"}</Button>
      </section>
    </>
  );
}
