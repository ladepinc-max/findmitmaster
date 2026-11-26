import food from "@/assets/shop-backgrounds/food.webp.asset.json";
import provisions from "@/assets/shop-backgrounds/provisions.webp.asset.json";
import pharmacy from "@/assets/shop-backgrounds/pharmacy.webp.asset.json";
import clinic from "@/assets/shop-backgrounds/clinic.webp.asset.json";
import school from "@/assets/shop-backgrounds/school.webp.asset.json";
import fashion from "@/assets/shop-backgrounds/fashion.webp.asset.json";
import electronics from "@/assets/shop-backgrounds/electronics.webp.asset.json";
import mechanic from "@/assets/shop-backgrounds/mechanic.webp.asset.json";
import services from "@/assets/shop-backgrounds/services.webp.asset.json";
import police from "@/assets/shop-backgrounds/police.webp.asset.json";
import fireservice from "@/assets/shop-backgrounds/fireservice.webp.asset.json";
import hotel from "@/assets/shop-backgrounds/hotel.webp.asset.json";
import shop from "@/assets/shop-backgrounds/shop.webp.asset.json";

const backgrounds = { food, provisions, pharmacy, clinic, school, fashion, electronics, mechanic, services, police, fireservice, hotel, shop };
export const MAX_BACKGROUND_BLUR = 20;

/** Match built-in and owner-written categories without generating images on every visit. */
export function shopBackgroundCategory(category: string): keyof typeof backgrounds {
  const value = category.trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(backgrounds, value)) return value as keyof typeof backgrounds;
  if (/police/.test(value)) return "police";
  if (/fire\s*(service|station)|firefighter/.test(value)) return "fireservice";
  if (/pharm|chemist|drug/.test(value)) return "pharmacy";
  if (/hosp|clinic|health|medic|dental/.test(value)) return "clinic";
  if (/school|academy|academ|college|tutor|education/.test(value)) return "school";
  if (/mechanic|garage|auto|fitting|vehicle/.test(value)) return "mechanic";
  if (/food|chop|restaurant|kitchen|bakery|cafe|drink/.test(value)) return "food";
  if (/fashion|beauty|salon|barber|tailor|clothing|boutique/.test(value)) return "fashion";
  if (/electronic|phone|computer|mobile|laptop/.test(value)) return "electronics";
  if (/hotel|guest\s*house|lodge|resort/.test(value)) return "hotel";
  if (/provision|grocery|supermarket|mini\s*mart/.test(value)) return "provisions";
  if (/service|plumb|carpent|repair|clean|consult|electrician/.test(value)) return "services";
  return "shop";
}

export function automaticShopBackground(category: string) {
  return backgrounds[shopBackgroundCategory(category)].url;
}

export function resolvedShopBackground(category: string, customUrl: string | null) {
  return customUrl || automaticShopBackground(category);
}

export function backgroundBlur(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(MAX_BACKGROUND_BLUR, Math.round(value))) : 0;
}