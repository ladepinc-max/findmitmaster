import { supabase } from "@/integrations/supabase/client";
import { SHOP_BUCKET } from "@/lib/shops";

export const AD_BUCKET = "shop-ads";
export const AD_SLIDE_MS = 7000;
export const AD_DEFAULT_WEEKLY_FEE = 50;

export interface ShopAd {
  id: string;
  shop_id: string;
  product_id: string | null;
  title: string;
  caption: string;
  media_path: string;
  media_type: "image" | "video";
  weeks: number;
  status: "unpaid" | "active" | "disabled";
  expires_at: string | null;
  clicks: number;
  created_at: string;
  price_ghc?: number | null;
  discount_percent?: number | null;
  shop?: { handle: string; name: string } | null;
}

/** Fee for an ad running the given number of weeks. */
export function adFee(weeklyFee: number, weeks: number) {
  return Math.max(0, weeklyFee) * Math.min(8, Math.max(1, Math.round(weeks)));
}

export function adOffer(price: string, discount: string) {
  const amount = price.trim() ? Number(price) : null;
  const percent = discount.trim() ? Number(discount) : null;
  if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount >= 10000000000)) throw new Error("Enter a valid price");
  if (percent !== null && (!Number.isFinite(percent) || percent < 0 || percent > 100)) throw new Error("Discount must be between 0% and 100%");
  if (percent !== null && amount === null) throw new Error("Add a price to use a discount");
  return { price_ghc: amount === null ? null : Math.round(amount * 100) / 100, discount_percent: percent === null ? null : Math.round(percent * 100) / 100 };
}

export function discountedAdPrice(price: number, percent: number | null | undefined) {
  return Math.round(price * (1 - (percent ?? 0) / 100) * 100) / 100;
}

export function selectedAdPhoto(products: { id: string; photo_url: string | null }[], productId: string) {
  return products.find((product) => product.id === productId)?.photo_url ?? null;
}

/** Storefront link for an ad: opens the advertised product directly when one is set. */
export function adHref(handle: string, productId: string | null) {
  return productId ? `/@${handle}?product=${productId}` : `/@${handle}`;
}

export function isAdLive(ad: Pick<ShopAd, "status" | "expires_at">, now = Date.now()) {
  return ad.status === "active" && !!ad.expires_at && new Date(ad.expires_at).getTime() > now;
}

const db = supabase as unknown as { from: (t: string) => any };
const urlCache = new Map<string, string>();

export async function adMediaUrl(path: string) {
  const hit = urlCache.get(path);
  if (hit) return hit;
  const { data } = await supabase.storage.from(AD_BUCKET).createSignedUrl(path, 60 * 60 * 6);
  if (data?.signedUrl) urlCache.set(path, data.signedUrl);
  return data?.signedUrl ?? null;
}

export async function fetchLiveAds(): Promise<ShopAd[]> {
  const { data } = await db
    .from("shop_ads")
    .select("*, shop:shops(handle, name)")
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(20);
  return ((data ?? []) as ShopAd[]).filter((a) => a.shop?.handle);
}

export async function fetchMyAds(shopId: string): Promise<ShopAd[]> {
  const { data } = await db.from("shop_ads").select("*").eq("shop_id", shopId).order("created_at", { ascending: false });
  return (data ?? []) as ShopAd[];
}

export async function createShopAd(input: {
  userId: string;
  shopId: string;
  productId: string | null;
  title: string;
  caption: string;
  weeks: number;
  file: File | null;
  productPhotoPath: string | null;
  offerPrice: string;
  discount: string;
}) {
  const offer = adOffer(input.offerPrice, input.discount);
  let file = input.file;
  if (!file && input.productPhotoPath) {
    const { data, error } = await supabase.storage.from(SHOP_BUCKET).download(input.productPhotoPath);
    if (error) throw error;
    if (!data) throw new Error("Could not load the product photo");
    file = new File([data], input.productPhotoPath.split("/").pop() ?? "product.jpg", { type: data.type || "image/jpeg" });
  }
  if (!file) throw new Error("Add a photo or video");
  const type = file.type.startsWith("video/") ? "video" : "image";
  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || (type === "video" ? "mp4" : "jpg");
  const path = `${input.userId}/${Date.now()}.${ext}`;
  const up = await supabase.storage.from(AD_BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (up.error) throw up.error;
  const { data, error } = await db
    .from("shop_ads")
    .insert({
      shop_id: input.shopId,
      owner_id: input.userId,
      product_id: input.productId,
      title: input.title.trim(),
      caption: input.caption.trim(),
      media_path: path,
      media_type: type,
      weeks: input.weeks,
      ...offer,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as ShopAd;
}

export async function deleteShopAd(ad: ShopAd) {
  await db.from("shop_ads").delete().eq("id", ad.id);
  await supabase.storage.from(AD_BUCKET).remove([ad.media_path]);
}

export function countAdClick(id: string) {
  void supabase.rpc("increment_shop_ad_click" as never, { _ad_id: id } as never);
}
