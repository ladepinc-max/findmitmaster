import { useEffect, useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Megaphone, Share2, Store } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { adMediaUrl, countAdClick, discountedAdPrice, type ShopAd } from "@/lib/shop-ads";

/** Public, indexable advert page: Google lists each live advert and every tap leads back into the FindMit shop. */
export const Route = createFileRoute("/ad/$id")({
  loader: async ({ params }) => {
    const { data } = await (supabase as any)
      .from("shop_ads")
      .select("id, shop_id, product_id, title, caption, media_path, media_type, expires_at, price_ghc, discount_percent, status, created_at, shop:shops(handle, name)")
      .eq("id", params.id)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!data?.shop?.handle) throw notFound();
    return data as ShopAd;
  },
  head: ({ params, loaderData: ad }) => {
    const url = `https://findmit.world/ad/${params.id}`;
    const title = ad ? `${ad.title} — ${ad.shop?.name} on FindMit` : "Offer — FindMit";
    const desc = ad ? `${ad.caption || ad.title}${ad.price_ghc != null ? ` · GH₵ ${discountedAdPrice(ad.price_ghc, ad.discount_percent)}` : ""}. Open in FindMit.`.slice(0, 160) : "A FindMit offer.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "product" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary" },
        ...(ad ? [] : [{ name: "robots", content: "noindex" }]),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: ad
        ? [{
            type: "application/ld+json",
            children: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Product",
              name: ad.title,
              description: ad.caption || ad.title,
              brand: { "@type": "Organization", name: ad.shop?.name },
              ...(ad.price_ghc != null
                ? { offers: { "@type": "Offer", price: discountedAdPrice(ad.price_ghc, ad.discount_percent), priceCurrency: "GHS", availability: "https://schema.org/InStock", priceValidUntil: ad.expires_at?.slice(0, 10), url, seller: { "@type": "Organization", name: ad.shop?.name } } }
                : {}),
              url,
            }),
          }]
        : [],
    };
  },
  notFoundComponent: () => (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <h1 className="font-display text-xl font-bold">This offer has ended</h1>
      <Button asChild><Link to="/shops">Browse shops</Link></Button>
    </main>
  ),
  component: AdPage,
});

function AdPage() {
  const ad = Route.useLoaderData();
  const [media, setMedia] = useState<string | null>(null);
  useEffect(() => { void adMediaUrl(ad.media_path).then(setMedia); }, [ad.media_path]);
  const handle = `@${ad.shop!.handle}`;
  const share = () => {
    const url = `https://findmit.world/ad/${ad.id}`;
    if (navigator.share) void navigator.share({ title: ad.title, url }).catch(() => {});
    else void navigator.clipboard?.writeText(url);
  };
  return (
    <AppShell>
      <main className="mx-auto max-w-xl space-y-4 px-4 pb-28 pt-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary"><Megaphone className="size-4" /> FindMit Offer</div>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {media ? (ad.media_type === "video"
            ? <video src={media} controls playsInline className="aspect-video w-full bg-muted object-cover" />
            : <img src={media} alt={ad.title} className="max-h-96 w-full object-cover" />)
            : <div className="aspect-video w-full animate-pulse bg-muted" />}
        </div>
        <h1 className="font-display text-2xl font-bold">{ad.title}</h1>
        {ad.caption ? <p className="whitespace-pre-line text-sm">{ad.caption}</p> : null}
        {ad.price_ghc != null ? (
          <p className="text-lg font-bold">
            GH₵ {discountedAdPrice(ad.price_ghc, ad.discount_percent).toLocaleString()}
            {ad.discount_percent ? <span className="ml-2 text-sm text-muted-foreground line-through">GH₵ {ad.price_ghc.toLocaleString()}</span> : null}
            {ad.discount_percent ? <span className="ml-2 rounded bg-destructive px-1.5 py-0.5 text-xs text-destructive-foreground">-{ad.discount_percent}%</span> : null}
          </p>
        ) : null}
        {ad.expires_at ? <p className="text-xs text-muted-foreground">Offer ends {new Date(ad.expires_at).toDateString()}</p> : null}
        <Button asChild className="w-full" onClick={() => countAdClick(ad.id)}>
          <Link to="/$handle" params={{ handle }} search={ad.product_id ? ({ product: ad.product_id } as never) : (undefined as never)}>
            <Store className="size-4" /> Open {ad.shop!.name} in FindMit
          </Link>
        </Button>
        <Button variant="outline" className="w-full" onClick={share}><Share2 className="size-4" /> Share offer</Button>
      </main>
    </AppShell>
  );
}
