/** Shared, browser-safe helpers for FindMit directory matching used by General AI. */

const STOP = new Set(
  "i me my need needs want wants looking look find get buy a an the for to of in on at near nearby nearest close around me please some any who where can you help someone good best cheap is are there do does have has with and or from".split(
    " ",
  ),
);

/** Pulls the meaningful search words out of a request such as "I need a mechanic in Tema". */
export function directoryKeywords(question: string): string[] {
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
  return [...new Set(words)].slice(0, 5);
}

/** Great-circle distance in kilometres. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Only same-app paths may become tappable links inside AI answers. */
export function safeInternalPath(href: string): string | null {
  return /^\/(?!\/)[\w@.\-/?=&%]*$/.test(href) ? href : null;
}
