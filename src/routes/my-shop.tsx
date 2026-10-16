import { openCheckout } from "@/lib/open-checkout";
import { useCachedState } from "@/lib/page-cache";
import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Camera, Check, Copy, Loader2, Lock, MapPin, Plus, Store, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useAppPrice } from "@/lib/pricing";
import { captureAccurateLocation } from "@/lib/community-map";
import { startShopCheckout } from "@/lib/shop.functions";
import {
  CUSTOM_CATEGORY,
  SHOP_CATEGORIES,
  isPoliceShop,
  daysLeft,
  isShopActive,
  isValidHandle,
  normaliseHandle,
  shopLink,
  shopPhotoUrl,
  uploadShopPhoto,
  isServiceCategory,
  priceLabel,
} from "@/lib/shops";

export const Route = createFileRoute("/my-shop")({
  head: () => ({
    meta: [
      { title: "My Shop — FindMit" },
      { name: "description", content: "Register your shop handle, pin it on the FindMit map and list your products." },
      { property: "og:title", content: "My Shop — FindMit" },
      { property: "og:description", content: "Get your @shop link, map pin and storefront on FindMit Ghana." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyShopPage,
});

type Shop = {
  id: string;
  handle: string;
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
type Product = { id: string; name: string; description: string | null; price_ghc: number; photo_url: string | null; is_available: boolean };

const db = supabase as unknown as { from: (t: string) => any };

function MyShopPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [shop, setShop] = useState<Shop | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await db.from("shops").select("*").eq("owner_id", user.id).order("created_at").limit(1).maybeSingle();
    setShop((data as Shop | null) ?? null);
    setReady(true);
  }, [user]);

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
    void load();
  }, [loading, user, load, navigate]);

  return (
    <main className="min-h-dvh bg-background pb-16">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Link to="/chat" search={{ c: undefined }} aria-label="Back">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="font-display text-lg font-bold">My Shop</h1>
      </header>
      <div className="mx-auto max-w-lg space-y-4 px-4 py-4">
        {!ready || !user ? (
          <Loader2 className="mx-auto mt-10 size-6 animate-spin text-muted-foreground" />
        ) : !shop ? (
          <RegisterForm userId={user.id} onCreated={load} />
        ) : !isShopActive(shop) ? (
          <PayCard shop={shop} onActivated={load} />
        ) : (
          <ManageShop shop={shop} userId={user.id} />
        )}
      </div>
    </main>
  );
}

function RegisterForm({ userId, onCreated }: { userId: string; onCreated: () => void }) {
  const [handle, setHandle] = useState("");
  const [available, setAvailable] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("food");
  const [customCategory, setCustomCategory] = useState("");
  const [nameFree, setNameFree] = useState<boolean | null>(null);
  const [phone, setPhone] = useState("");
  const [landmark, setLandmark] = useState("");
  const [description, setDescription] = useState("");
  const [gps, setGps] = useState<{ lat: number; lng: number; msg: string } | null>(null);
  const [locating, setLocating] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const h = normaliseHandle(handle);
  const valid = isValidHandle(h);

  useEffect(() => {
    setAvailable(null);
    if (!valid) return undefined;
    const t = window.setTimeout(async () => {
      const { data } = await (supabase as unknown as { rpc: (f: string, a: unknown) => Promise<{ data: boolean }> }).rpc(
        "is_shop_handle_available",
        { _handle: h },
      );
      setAvailable(Boolean(data));
    }, 350);
    return () => window.clearTimeout(t);
  }, [h, valid]);

  useEffect(() => {
    setNameFree(null);
    const n = name.trim();
    if (n.length < 2) return undefined;
    const t = window.setTimeout(async () => {
      const { data } = await (supabase as unknown as { rpc: (f: string, a: unknown) => Promise<{ data: boolean }> }).rpc(
        "is_shop_name_available",
        { _name: n },
      );
      setNameFree(Boolean(data));
    }, 350);
    return () => window.clearTimeout(t);
  }, [name]);

  const locate = async () => {
    setLocating(true);
    const r = await captureAccurateLocation();
    setLocating(false);
    if (r.quality === "blocked") return void toast.error(r.message);
    setGps({ lat: r.point.lat, lng: r.point.lng, msg: r.message });
  };

  const save = async () => {
    if (!valid || !available) return void toast.error("Choose an available shop name");
    if (!name.trim() || !phone.trim()) return void toast.error("Add your shop name and phone number");
    if (nameFree === false) return void toast.error("That business name is unavailable — please change it");
    const finalCategory = category === CUSTOM_CATEGORY ? customCategory.trim() : category;
    if (!finalCategory) return void toast.error("Write your category (e.g. Mechanic)");
    if (!gps) return void toast.error("Capture your shop's location while standing at the door");
    setSaving(true);
    try {
      const photo_url = photo ? await uploadShopPhoto(userId, photo) : null;
      const { error } = await db.from("shops").insert({
        owner_id: userId,
        handle: h,
        name: name.trim(),
        category: finalCategory,
        phone: phone.trim(),
        landmark: landmark.trim() || null,
        description: description.trim() || null,
        lat: gps.lat,
        lng: gps.lng,
        photo_url,
      });
      if (error) throw error;
      toast.success("Shop saved — complete payment to go live");
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save your shop");
    } finally {
      setSaving(false);
    }
  };

  const { amount: regAmount, waived: regWaived } = useAppPrice("shop_registration");
  return (
    <section className="space-y-4 rounded-2xl bg-card p-4 shadow-sm">
      <div>
        <p className="font-display text-base font-bold">Register your shop</p>
        <p className="text-xs text-muted-foreground">Customers will find you on the map by typing your @name.</p>
      </div>
      <label className="block text-sm font-medium">
        Shop name (your link)
        <div className="mt-1 flex items-center rounded-md border border-input bg-background px-3">
          <span className="text-muted-foreground">@</span>
          <input
            className="h-10 flex-1 bg-transparent px-1 text-sm outline-none"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="ama.food.shop"
            autoCapitalize="none"
          />
          {valid && available === true ? <Check className="size-4 text-wa-green" /> : null}
          {valid && available === false ? <X className="size-4 text-destructive" /> : null}
        </div>
        <span className="mt-1 block text-xs text-muted-foreground">
          {!h
            ? "3–30 letters, numbers or dots"
            : !valid
              ? "Use 3–30 letters, numbers, dots or _"
              : available === false
                ? "Already taken — try another"
                : available
                  ? `Available: findmit.world/@${h}`
                  : "Checking…"}
        </span>
      </label>
      <div>
        <div className="relative">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Business name (e.g. Ama's Kitchen)" />
          {nameFree === true ? <Check className="absolute right-3 top-3 size-4 text-wa-green" /> : null}
          {nameFree === false ? <X className="absolute right-3 top-3 size-4 text-destructive" /> : null}
        </div>
        {nameFree === false ? (
          <p className="mt-1 text-xs text-destructive">Unavailable — this name is already taken. Please choose another.</p>
        ) : nameFree === true ? (
          <p className="mt-1 text-xs text-wa-green">Available</p>
        ) : null}
      </div>
      <select
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
      >
        {SHOP_CATEGORIES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.emoji} {c.label}
          </option>
        ))}
        <option value={CUSTOM_CATEGORY}>✏️ Write yours…</option>
      </select>
      {category === CUSTOM_CATEGORY ? (
        <Input value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} placeholder="Write your category (e.g. Mechanic)" />
      ) : null}
      <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="Phone for orders (e.g. 024 123 4567)" />
      <Input value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="Landmark (e.g. opposite Total filling station)" />
      <textarea
        className="min-h-20 w-full rounded-md border border-input bg-background p-3 text-sm"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={isServiceCategory(category === CUSTOM_CATEGORY ? customCategory : category) ? "What services or programs do you offer? (optional)" : "What do you sell?"}
      />
      <Button variant="outline" className="w-full" onClick={() => void locate()} disabled={locating}>
        {locating ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
        {gps ? "Location captured — tap to retry" : "Capture shop location (stand at the door)"}
      </Button>
      {gps ? <p className="text-xs text-muted-foreground">{gps.msg}</p> : null}
      <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border p-3 text-sm">
        <Camera className="size-4" /> {photo ? photo.name : "Add a shop front photo"}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
      </label>
      <Button className="w-full" onClick={() => void save()} disabled={saving || available === false || nameFree === false}>
        {saving ? "Saving…" : `Continue to register — ${regWaived ? "Free" : `GH₵ ${regAmount}`}`}
      </Button>
    </section>
  );
}

function PayCard({ shop, onActivated }: { shop: Shop; onActivated: () => void }) {
  const { amount, waived } = useAppPrice("shop_registration");
  const start = useServerFn(startShopCheckout);
  const [momo, setMomo] = useState("");
  const [busy, setBusy] = useState(false);
  const expired = shop.subscription_status === "active";

  const pay = async () => {
    setBusy(true);
    try {
      const r = await start({
        data: { shopId: shop.id, momoNumber: momo, callbackUrl: `${window.location.origin}/payment-verify` },
      });
      if (r.activated) {
        toast.success("Your shop is live!");
        onActivated();
      } else if (r.authorizationUrl) {
        openCheckout(r.authorizationUrl);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start payment");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl bg-card p-5 text-center shadow-sm">
      <Lock className="mx-auto size-9 text-wa-green" />
      <div>
        <p className="font-display text-lg font-bold">@{shop.handle}</p>
        <p className="text-sm text-muted-foreground">
          {expired ? "Your shop has expired. Renew to bring it back online." : "Your shop is reserved but not live yet."}
        </p>
      </div>
      <ul className="space-y-1 text-left text-sm">
        <li>✓ Your shop link findmit.world/@{shop.handle}</li>
        <li>✓ Pin on the map with an "Enter Shop" button</li>
        <li>✓ Shop page with products and a Call button</li>
        <li>✓ Found when customers search @{shop.handle}</li>
      </ul>
      <p className="font-display text-2xl font-bold">
        {waived ? "Free for now" : `GH₵ ${amount}`}
        {!waived ? <span className="text-sm font-normal text-muted-foreground"> / year</span> : null}
      </p>
      {!waived ? (
        <Input value={momo} onChange={(e) => setMomo(e.target.value)} type="tel" placeholder="Mobile Money number (MTN, Telecel, AT)" />
      ) : null}
      <Button className="w-full" onClick={() => void pay()} disabled={busy}>
        {busy ? "Please wait…" : waived ? "Activate my shop" : expired ? "Renew with Mobile Money" : "Pay with Mobile Money"}
      </Button>
    </section>
  );
}

function ManageShop({ shop, userId }: { shop: Shop; userId: string }) {
  const [products, setProducts] = useCachedState<Product[]>(`myshop:${shop.id}:products`, []);
  const [thumbs, setThumbs] = useCachedState<Record<string, string | null>>(`myshop:${shop.id}:thumbs`, {});
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [desc, setDesc] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const left = daysLeft(shop.subscription_expires_at);
  const link = shopLink(shop.handle);

  const load = useCallback(async () => {
    const { data } = await db.from("shop_products").select("*").eq("shop_id", shop.id).order("sort_order").order("created_at");
    const list = (data ?? []) as Product[];
    setProducts(list);
    const urls = await Promise.all(list.map((p) => shopPhotoUrl(p.photo_url)));
    setThumbs(Object.fromEntries(list.map((p, i) => [p.id, urls[i] ?? null])));
  }, [shop.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    const service = isServiceCategory(shop.category);
    const p = price.trim() === "" && service ? 0 : Number(price);
    if (!name.trim()) return void toast.error(service ? "Add a service name" : "Add a product name");
    if (!Number.isFinite(p) || p < 0 || (!service && price.trim() === "")) return void toast.error("Add a price");
    setSaving(true);
    try {
      const photo_url = photo ? await uploadShopPhoto(userId, photo) : null;
      const { error } = await db.from("shop_products").insert({
        shop_id: shop.id,
        name: name.trim(),
        price_ghc: p,
        description: desc.trim() || null,
        photo_url,
        sort_order: products.length,
      });
      if (error) throw error;
      setName("");
      setPrice("");
      setDesc("");
      setPhoto(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add product");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section className="space-y-3 rounded-2xl bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Store className="size-5 text-wa-green" />
          <p className="font-display font-bold">{shop.name}</p>
          <span className="ml-auto rounded-full bg-wa-green/15 px-2 py-0.5 text-xs font-medium text-wa-green">
            Active · {left} days left
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-muted p-2 text-xs">
          <span className="min-w-0 flex-1 truncate">{link}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void navigator.clipboard.writeText(link).then(() => toast.success("Link copied"))}
          >
            <Copy className="size-4" />
          </Button>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="flex-1">
            <a href={`/@${shop.handle}`}>View my shop</a>
          </Button>
          {left <= 30 ? <RenewButton shop={shop} /> : null}
        </div>
      </section>

      {isPoliceShop(shop) ? (
        <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground shadow-sm">
          Police stations don't list products. Customers see your station name, location and a Call Police button.
        </p>
      ) : (
      <>
      <section className="space-y-3 rounded-2xl bg-card p-4 shadow-sm">
        <p className="font-display font-bold">{isServiceCategory(shop.category) ? "Add a service or offering" : "Add a product"}</p>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={isServiceCategory(shop.category) ? "Service or offering name (e.g. Brake replacement, JHS Tutoring)" : "Name (e.g. Jollof with chicken)"} />
        <Input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min={0} placeholder={isServiceCategory(shop.category) ? "Price in GH₵ (optional)" : "Price in GH₵"} />
        <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Short description (optional)" />
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border p-3 text-sm">
          <Camera className="size-4" /> {photo ? photo.name : "Add a photo"}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        </label>
        <Button className="w-full" onClick={() => void add()} disabled={saving}>
          <Plus className="size-4" /> {saving ? "Adding…" : "Add product"}
        </Button>
      </section>

      <section className="space-y-2">
        {products.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-sm">
            {thumbs[p.id] ? (
              <img src={thumbs[p.id] ?? ""} alt="" className="size-14 rounded-lg object-cover" />
            ) : (
              <span className="flex size-14 items-center justify-center rounded-lg bg-muted text-xl">🛍️</span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.name}</p>
              <p className="text-xs text-muted-foreground">{priceLabel(p.price_ghc)}</p>
            </div>
            <Button
              size="sm"
              variant={p.is_available ? "outline" : "secondary"}
              onClick={async () => {
                await db.from("shop_products").update({ is_available: !p.is_available }).eq("id", p.id);
                void load();
              }}
            >
              {p.is_available ? "In stock" : "Sold out"}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Delete product"
              onClick={async () => {
                await db.from("shop_products").delete().eq("id", p.id);
                void load();
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </section>
      </>
      )}
    </>
  );
}

function RenewButton({ shop }: { shop: Shop }) {
  const start = useServerFn(startShopCheckout);
  const { amount, waived } = useAppPrice("shop_registration");
  return (
    <Button
      className="flex-1"
      onClick={async () => {
        try {
          const r = await start({ data: { shopId: shop.id, callbackUrl: `${window.location.origin}/payment-verify` } });
          if (r.authorizationUrl) openCheckout(r.authorizationUrl);
          else {
            toast.success("Renewed for another year");
            window.location.reload();
          }
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Could not renew");
        }
      }}
    >
      Renew {waived ? "free" : `GH₵ ${amount}`}
    </Button>
  );
}
