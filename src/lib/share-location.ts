export interface SharedPlace {
  lat: number;
  lng: number;
  label?: string | undefined;
  landmark?: string | undefined;
}

const KEY = "findmit:pendingNav";
const SITE = "https://findmit.world";

/** Public link that opens FindMit's live navigation for this place. */
export function placeLink(p: SharedPlace) {
  const q = new URLSearchParams({ lat: p.lat.toFixed(6), lng: p.lng.toFixed(6) });
  if (p.label) q.set("label", p.label);
  if (p.landmark) q.set("landmark", p.landmark);
  return `${SITE}/l?${q.toString()}`;
}

export function placeMessage(p: SharedPlace) {
  return `📍 ${p.label || "My location"}${p.landmark ? ` (${p.landmark})` : ""}\nGet live directions on FindMit: ${placeLink(p)}`;
}

export function shareWhatsApp(p: SharedPlace) {
  window.open(`https://wa.me/?text=${encodeURIComponent(placeMessage(p))}`, "_blank");
}

export function shareSms(p: SharedPlace) {
  window.location.href = `sms:?&body=${encodeURIComponent(placeMessage(p))}`;
}

export async function shareNative(p: SharedPlace) {
  const text = placeMessage(p);
  if (navigator.share) {
    await navigator.share({ title: "FindMit location", text }).catch(() => undefined);
    return "shared";
  }
  await navigator.clipboard.writeText(text);
  return "copied";
}

export function savePendingNav(p: SharedPlace) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function takePendingNav(): SharedPlace | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    const p = JSON.parse(raw) as SharedPlace;
    return Number.isFinite(p.lat) && Number.isFinite(p.lng) ? p : null;
  } catch {
    return null;
  }
}

export function hasPendingNav() {
  try {
    return Boolean(localStorage.getItem(KEY));
  } catch {
    return false;
  }
}
