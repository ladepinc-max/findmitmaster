import { supabase } from "@/integrations/supabase/client";
import { getCachedUrl, setCachedUrl } from "@/lib/signed-url-cache";

export const SHOP_BUCKET = "shop-media";
export const SHOP_DAYS = 365;

export const SHOP_CATEGORIES = [
  { value: "food", label: "Food & Drinks", emoji: "🍴" },
  { value: "provisions", label: "Provisions", emoji: "🛍️" },
  { value: "pharmacy", label: "Pharmacy", emoji: "💊" },
  { value: "clinic", label: "Hospital / Clinic", emoji: "➕" },
  { value: "school", label: "School", emoji: "📚" },
  { value: "fashion", label: "Fashion & Beauty", emoji: "👗" },
  { value: "electronics", label: "Phones & Electronics", emoji: "📱" },
  { value: "mechanic", label: "Mechanic", emoji: "🔧" },
  { value: "services", label: "Services", emoji: "🛠️" },
  { value: "police", label: "Police Station", emoji: "🛡️" },
  { value: "shop", label: "Other shop", emoji: "🏪" },
] as const;

/** Dropdown value that lets the owner type their own category (e.g. "Mechanic"). */
export const CUSTOM_CATEGORY = "__custom__";

export function categoryEmoji(c: string) {
  const hit = SHOP_CATEGORIES.find((x) => x.value === c)?.emoji;
  if (hit) return hit;
  // Owner-written categories ("Mechanic", "Chemist", "Hospital") still get a matching map symbol.
  const t = c.toLowerCase();
  if (/pharm|chemist|drug/.test(t)) return "💊";
  if (/hosp|clinic|health|medic/.test(t)) return "➕";
  if (/school|academy|college|tutor/.test(t)) return "📚";
  if (/police/.test(t)) return "🛡️";
  if (/mechanic|garage|auto|fitting/.test(t)) return "🔧";
  if (/food|chop|restaurant|kitchen/.test(t)) return "🍴";
  return "🏪";
}

/** Categories that offer services (schools, clinics, mechanics, home care…) rather than direct goods. */
export function isServiceCategory(c: string) {
  const t = (c || "").toLowerCase();
  if (["school", "clinic", "mechanic", "services", "police"].includes(t)) return true;
  return /care|tutor|school|academ|college|repair|mechanic|garage|fitting|plumb|clean|salon|barber|hosp|clinic|health|service|consult|lesson|train|electrician|carpent|tailor|laundry/.test(t);
}

/** Price label: zero/blank prices read "Contact for price" instead of GH₵ 0. */
export function priceLabel(price: number | null | undefined) {
  const n = Number(price);
  return n > 0 ? `GH₵ ${n.toLocaleString()}` : "Contact for price";
}

export function categoryLabel(c: string) {
  return SHOP_CATEGORIES.find((x) => x.value === c)?.label ?? c;
}

/** Police stations get the emergency layout and never sell products. */
export function isPoliceShop(s: { category: string; handle: string }) {
  return s.category === "police" || s.handle.endsWith(".police");
}

/** "@Ama.Food.Shop " -> "ama.food.shop" */
export function normaliseHandle(raw: string) {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

/** 3–30 chars, letters/numbers/dots/underscores, must start with a letter or number. */
export function isValidHandle(h: string) {
  return /^[a-z0-9][a-z0-9._]{2,29}$/.test(h) && !h.includes("..");
}

/** New expiry: one year from today, or one year added on top of time still left. */
export function nextExpiry(current: string | null | undefined, now = new Date()) {
  const base = current && new Date(current) > now ? new Date(current) : now;
  const next = new Date(base);
  next.setDate(next.getDate() + SHOP_DAYS);
  return next;
}

export function isShopActive(s: { subscription_status: string; subscription_expires_at: string | null }, now = new Date()) {
  return s.subscription_status === "active" && !!s.subscription_expires_at && new Date(s.subscription_expires_at) > now;
}

export function daysLeft(expires: string | null, now = new Date()) {
  if (!expires) return 0;
  return Math.max(0, Math.ceil((new Date(expires).getTime() - now.getTime()) / 86400000));
}

export function shopLink(handle: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://findmit.world";
  return `${origin}/@${handle}`;
}

export async function shopPhotoUrl(path: string | null) {
  if (!path) return null;
  const hit = getCachedUrl(SHOP_BUCKET, path);
  if (hit) return hit;
  // Signed for 7 days, reused for 6 so the photo URL stays stable and browser-cached.
  const { data } = await supabase.storage.from(SHOP_BUCKET).createSignedUrl(path, 7 * 86400);
  if (data?.signedUrl) setCachedUrl(SHOP_BUCKET, path, data.signedUrl, 6 * 86400000);
  return data?.signedUrl ?? null;
}

export async function uploadShopPhoto(userId: string, file: Blob) {
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from(SHOP_BUCKET).upload(path, file, { contentType: file.type || "image/jpeg" });
  if (error) throw error;
  return path;
}
