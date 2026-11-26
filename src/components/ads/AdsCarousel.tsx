import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AD_SLIDE_MS, adMediaUrl, discountedAdPrice, fetchLiveAds, type ShopAd } from "@/lib/shop-ads";
import { normalizeUrl, type FeedItem } from "@/lib/home-browser";
import { useCachedState } from "@/lib/page-cache";

type Slide =
  | { kind: "shop"; id: string; title: string; caption: string; ad: ShopAd }
  | { kind: "admin"; id: string; title: string; caption: string; item: FeedItem };

function ShopAdMedia({ ad }: { ad: ShopAd }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    void adMediaUrl(ad.media_path).then(setUrl);
  }, [ad.media_path]);
  if (!url) return <div className="size-full bg-muted" />;
  return ad.media_type === "video" ? (
    <video src={url} autoPlay muted loop playsInline className="size-full object-cover" />
  ) : (
    <img src={url} alt="" className="size-full object-cover" />
  );
}

/** Single-card ADS carousel: admin promos + paid shop ads, auto-slides every 7s, swipe to control. */
export function AdsCarousel({ feed, onOpenSite }: { feed: FeedItem[]; onOpenSite: (url: string) => void }) {
  const navigate = useNavigate();
  const [shopAds, setShopAds] = useCachedState<ShopAd[]>("home:shop-ads", []);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    void fetchLiveAds().then(setShopAds).catch(() => undefined);
  }, [setShopAds]);

  const slides: Slide[] = [
    ...shopAds.map((ad) => ({ kind: "shop" as const, id: ad.id, title: ad.title, caption: ad.caption, ad })),
    ...feed.map((item) => ({ kind: "admin" as const, id: item.id, title: item.title, caption: item.body, item })),
  ];
  const count = slides.length;
  const current = count ? slides[index % count] : undefined;

  useEffect(() => {
    if (paused || count < 2) return undefined;
    const t = window.setTimeout(() => setIndex((i) => (i + 1) % count), AD_SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [index, paused, count]);

  // After a manual swipe, resume auto-sliding a little later.
  useEffect(() => {
    if (!paused) return undefined;
    const t = window.setTimeout(() => setPaused(false), AD_SLIDE_MS * 2);
    return () => window.clearTimeout(t);
  }, [paused, index]);

  if (!current) return null;
  const go = (step: number) => {
    setPaused(true);
    setIndex((i) => (i + step + count) % count);
  };
  const open = () => {
    if (current.kind === "shop") {
      const handle = current.ad.shop?.handle;
      if (!handle) return;
      void navigate({ to: "/ad/$id", params: { id: current.ad.id } });
    } else if (current.item.link_url) {
      onOpenSite(normalizeUrl(current.item.link_url));
    }
  };

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-xl font-bold tracking-wide">ADS</h2>
        {count > 1 ? <span className="text-xs text-muted-foreground">{(index % count) + 1} / {count}</span> : null}
      </div>
      <div
        className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
        onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
        onTouchEnd={(e) => {
          const start = touchX.current;
          const end = e.changedTouches[0]?.clientX;
          touchX.current = null;
          if (start == null || end == null || Math.abs(end - start) < 40) return;
          go(end < start ? 1 : -1);
        }}
      >
        <button type="button" onClick={open} className="block w-full text-left">
          <div className="aspect-[16/8] w-full overflow-hidden bg-muted">
            {current.kind === "shop" ? (
              <ShopAdMedia key={current.id} ad={current.ad} />
            ) : current.item.image_url ? (
              <img src={current.item.image_url} alt="" className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center bg-secondary p-6 text-center font-display text-lg font-bold">{current.title}</div>
            )}
          </div>
          <div className="p-3">
            <span className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">
              {current.kind === "shop" ? `Sponsored · @${current.ad.shop?.handle ?? ""}` : current.item.kind === "ad" ? "Sponsored" : "FindMit"}
            </span>
            <p className="line-clamp-1 font-bold">{current.title}</p>
            {current.kind === "shop" && current.ad.price_ghc != null ? <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-primary"><span>GH₵ {discountedAdPrice(Number(current.ad.price_ghc), Number(current.ad.discount_percent ?? 0)).toFixed(2)}</span>{Number(current.ad.discount_percent ?? 0) > 0 ? <><del className="font-normal text-muted-foreground">GH₵ {Number(current.ad.price_ghc).toFixed(2)}</del><span>{current.ad.discount_percent}% off</span></> : null}</p> : null}
            {current.caption ? <p className="line-clamp-1 text-sm text-muted-foreground">{current.caption}</p> : null}
          </div>
        </button>
        {count > 1 ? (
          <>
            <button type="button" aria-label="Previous ad" onClick={() => go(-1)} className="absolute left-2 top-1/3 rounded-full bg-background/80 p-1.5 shadow">
              <ChevronLeft className="size-4" />
            </button>
            <button type="button" aria-label="Next ad" onClick={() => go(1)} className="absolute right-2 top-1/3 rounded-full bg-background/80 p-1.5 shadow">
              <ChevronRight className="size-4" />
            </button>
            <div className="flex justify-center gap-1.5 pb-3">
              {slides.map((s, i) => (
                <span key={s.id} className={`h-1.5 rounded-full transition-all ${i === index % count ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/40"}`} />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
