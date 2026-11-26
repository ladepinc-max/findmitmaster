import { CachedInterfaceImage } from "@/components/CachedInterfaceImage";
import { backgroundBlur, resolvedShopBackground } from "@/lib/shop-backgrounds";

export function ShopBackground({ shopId, category, customUrl, opacity, blur }: {
  shopId: string; category: string; customUrl: string | null; opacity: number | null | undefined; blur: number | null | undefined;
}) {
  return <CachedInterfaceImage
    cacheKey={`shop-background:${shopId}`}
    src={resolvedShopBackground(category, customUrl)}
    alt="" aria-hidden="true"
    className="pointer-events-none absolute inset-0 size-full scale-110 object-cover"
    style={{ opacity: opacity ?? 0.2, filter: `blur(${backgroundBlur(blur)}px)` }}
  />;
}