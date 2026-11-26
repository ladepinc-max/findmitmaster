import { supabase } from "@/integrations/supabase/client";

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
  shop?: { handle: string; name: string } | null;
}

/** Fee for an ad running the given number of weeks. */
export function adFee(weeklyFee: number, weeks: number) {
  return Math.max(0, weeklyFee) * Math.min(8, Math.max(1, Math.round(weeks)));
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
  file: File;
}) {
  const type = input.file.type.startsWith("video/") ? "video" : "image";
  const ext = input.file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || (type === "video" ? "mp4" : "jpg");
  const path = `${input.userId}/${Date.now()}.${ext}`;
  const up = await supabase.storage.from(AD_BUCKET).upload(path, input.file, { contentType: input.file.type || "application/octet-stream" });
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
