import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ImagePlus, Loader2, Megaphone, Package, Store, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { openCheckout, checkoutCallbackUrl } from "@/lib/open-checkout";
import { AD_DEFAULT_WEEKLY_FEE, adFee, adOffer, discountedAdPrice, selectedAdPhoto, createShopAd, deleteShopAd, fetchMyAds, isAdLive, type ShopAd } from "@/lib/shop-ads";
import { startShopAdCheckout } from "@/lib/shop-ads.functions";

type ProductOption = { id: string; name: string; photo_url: string | null; thumbnail: string | null };

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
  const [offerPrice, setOfferPrice] = useState("");
  const [discount, setDiscount] = useState("");
  const [weeks, setWeeks] = useState(1);
  const [momo, setMomo] = useState("");
  const [busy, setBusy] = useState(false);
  const [price, setPrice] = useState({ amount: AD_DEFAULT_WEEKLY_FEE, waived: false });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const productPhotoPath = selectedAdPhoto(products, productId);
  const productPreview = products.find((p) => p.id === productId)?.thumbnail ?? null;
  const shownPreview = preview ?? productPreview;

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

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
    if (!file && !productPhotoPath) return void toast.error("Add a photo or video");
    if (title.trim().length < 2) return void toast.error("Add a headline");
    setBusy(true);
    try {
      const ad = await createShopAd({ userId, shopId, productId: productId || null, title, caption, weeks, file, productPhotoPath, offerPrice, discount });
      setOpen(false);
      setFile(null); setPreview(null); setTitle(""); setCaption(""); setProductId("");
      setOfferPrice(""); setDiscount("");
      load();
      await pay(ad);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the advert");
    } finally {
      setBusy(false);
    }
  };

  const total = price.waived ? 0 : adFee(price.amount, weeks);
  let offerPreview: number | null = null;
  try {
    const offer = adOffer(offerPrice, discount);
    if (offer.price_ghc !== null) offerPreview = discountedAdPrice(offer.price_ghc, offer.discount_percent);
  } catch { /* Validation is shown when the seller submits. */ }

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
          <Select value={productId || "whole-shop"} onValueChange={(value) => { setProductId(value === "whole-shop" ? "" : value); setFile(null); setPreview(null); if (inputRef.current) inputRef.current.value = ""; }} disabled={busy}>
            <SelectTrigger aria-label="Advertise product" className="h-14"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="whole-shop"><span className="flex items-center gap-3"><Store className="size-8 shrink-0 text-muted-foreground" />Whole shop</span></SelectItem>
              {products.map((p) => <SelectItem key={p.id} value={p.id} textValue={p.name}><span className="flex min-w-0 items-center gap-3">{p.thumbnail ? <img src={p.thumbnail} alt="" className="size-9 shrink-0 rounded-md object-cover" /> : <Package className="size-9 shrink-0 text-muted-foreground" />}<span className="truncate">{p.name}</span></span></SelectItem>)}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" aria-label="Advert photo or video" disabled={busy} onClick={() => inputRef.current?.click()} className="flex aspect-[16/8] h-auto w-full items-center justify-center overflow-hidden rounded-lg border-dashed bg-muted p-0">
            {shownPreview ? (
              file?.type.startsWith("video/") ? <video src={shownPreview} muted autoPlay loop playsInline className="size-full object-cover" /> : <img src={shownPreview} alt="Advert preview" className="size-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-1 text-sm text-muted-foreground"><ImagePlus className="size-6" /> Add photo or video</span>
            )}
          </Button>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Headline e.g. Fresh tilapia — 20% off" />
          <Input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={200} placeholder="Short message (optional)" />
          <div className="grid grid-cols-2 gap-3">
            <label className="min-w-0 space-y-1 text-xs text-muted-foreground">Price (GH₵, optional)<Input aria-label="Advert price" type="number" min="0" step="0.01" value={offerPrice} onChange={(e) => setOfferPrice(e.target.value)} placeholder="e.g. 100" /></label>
            <label className="min-w-0 space-y-1 text-xs text-muted-foreground">Discount (%, optional)<Input aria-label="Advert discount" type="number" min="0" max="100" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="e.g. 20" /></label>
          </div>
          {offerPreview !== null ? <p className="text-sm font-semibold">Advert price: GH₵ {offerPreview.toFixed(2)}</p> : null}
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
