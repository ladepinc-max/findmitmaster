import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ImagePlus, Loader2, Megaphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { openCheckout, checkoutCallbackUrl } from "@/lib/open-checkout";
import { AD_DEFAULT_WEEKLY_FEE, adFee, createShopAd, deleteShopAd, fetchMyAds, isAdLive, type ShopAd } from "@/lib/shop-ads";
import { startShopAdCheckout } from "@/lib/shop-ads.functions";

type ProductOption = { id: string; name: string };

/** Lets a shop owner upload an image/video ad, pick a product, pay, and see it in the Home ADS carousel. */
export function ShopAdsManager({ shopId, userId, products }: { shopId: string; userId: string; products: ProductOption[] }) {
  const start = useServerFn(startShopAdCheckout);
  const [ads, setAds] = useState<ShopAd[]>([]);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [productId, setProductId] = useState("");
  const [weeks, setWeeks] = useState(1);
  const [momo, setMomo] = useState("");
  const [busy, setBusy] = useState(false);
  const [price, setPrice] = useState({ amount: AD_DEFAULT_WEEKLY_FEE, waived: false });
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = () => void fetchMyAds(shopId).then(setAds);
  useEffect(() => {
    load();
    void (supabase as unknown as { from: (t: string) => any })
      .from("app_pricing").select("amount, is_waived").eq("key", "shop_ad_week").maybeSingle()
      .then(({ data }: { data: { amount: number; is_waived: boolean } | null }) => {
        if (data) setPrice({ amount: Number(data.amount), waived: data.is_waived });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/") && !f.type.startsWith("video/")) return void toast.error("Choose a photo or video");
    if (f.size > 50 * 1024 * 1024) return void toast.error("File is too large (max 50 MB)");
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const pay = async (ad: ShopAd) => {
    const r = await start({ data: { adId: ad.id, momoNumber: momo, callbackUrl: checkoutCallbackUrl() } });
    if (r.activated) {
      toast.success("Your advert is live in ADS");
      load();
    } else if (r.authorizationUrl) openCheckout(r.authorizationUrl);
  };

  const submit = async () => {
    if (!file) return void toast.error("Add a photo or video");
    if (title.trim().length < 2) return void toast.error("Add a headline");
    setBusy(true);
    try {
      const ad = await createShopAd({ userId, shopId, productId: productId || null, title, caption, weeks, file });
      setOpen(false);
      setFile(null); setPreview(null); setTitle(""); setCaption(""); setProductId("");
      load();
      await pay(ad);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the advert");
    } finally {
      setBusy(false);
    }
  };

  const total = price.waived ? 0 : adFee(price.amount, weeks);

  return (
    <section className="space-y-3 rounded-2xl bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Megaphone className="size-5 text-primary" />
          <p className="font-display font-bold">Advertise</p>
        </div>
        {!open ? <Button size="sm" onClick={() => setOpen(true)}>New advert</Button> : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Your advert shows in the ADS section on FindMit Home. Tapping it opens your shop{products.length ? " and the product you pick" : ""}.
        {" "}{price.waived ? "Free for now." : `GH₵ ${price.amount} per week.`}
      </p>

      {open ? (
        <div className="space-y-3">
          <input ref={inputRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <button type="button" onClick={() => inputRef.current?.click()} className="flex aspect-[16/8] w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted">
            {preview && file ? (
              file.type.startsWith("video/") ? <video src={preview} muted autoPlay loop playsInline className="size-full object-cover" /> : <img src={preview} alt="" className="size-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-1 text-sm text-muted-foreground"><ImagePlus className="size-6" /> Add photo or video</span>
            )}
          </button>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Headline e.g. Fresh tilapia — 20% off" />
          <Input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={200} placeholder="Short message (optional)" />
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Whole shop</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            {[1, 2, 3, 4, 6, 8].map((w) => <option key={w} value={w}>{w} week{w > 1 ? "s" : ""}</option>)}
          </select>
          {!price.waived ? <Input value={momo} onChange={(e) => setMomo(e.target.value)} type="tel" placeholder="Mobile Money number" /> : null}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button className="flex-1" onClick={() => void submit()} disabled={busy}>
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {total ? `Pay GH₵ ${total}` : "Post advert"}
            </Button>
          </div>
        </div>
      ) : null}

      {ads.length ? (
        <ul className="space-y-2">
          {ads.map((ad) => {
            const live = isAdLive(ad);
            return (
              <li key={ad.id} className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{ad.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {live ? `Live until ${new Date(ad.expires_at ?? "").toLocaleDateString()} · ${ad.clicks} taps` : ad.status === "disabled" ? "Stopped by admin" : ad.status === "active" ? "Ended" : "Waiting for payment"}
                  </p>
                </div>
                {ad.status === "unpaid" ? <Button size="sm" onClick={() => void pay(ad).catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Payment failed"))}>Pay</Button> : null}
                <button type="button" aria-label="Delete advert" onClick={() => { if (confirm("Delete this advert?")) void deleteShopAd(ad).then(load); }}>
                  <Trash2 className="size-4 text-muted-foreground" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
