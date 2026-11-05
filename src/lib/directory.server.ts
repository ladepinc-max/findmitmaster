import type { SupabaseClient } from "@supabase/supabase-js";
import { directoryKeywords, distanceKm } from "@/lib/directory";

type Point = { lat: number; lng: number } | null;

/** Looks up live FindMit shops, products, talent and jobs matching a request (RLS applies). */
export async function searchDirectory(client: SupabaseClient, question: string, here: Point) {
  const words = directoryKeywords(question);
  if (!words.length) return "";
  const ors = (cols: string[]) => words.flatMap((w) => cols.map((c) => `${c}.ilike.%${w}%`)).join(",");
  const [shops, products, talent, jobs] = await Promise.all([
    client.from("shops").select("id, name, handle, category, description, landmark, lat, lng, is_open, opening_hours")
      .or(ors(["name", "description", "category", "landmark", "handle"])).limit(15),
    client.from("shop_products").select("name, price_ghc, is_available, shop:shops(name, handle, landmark, lat, lng)")
      .or(ors(["name", "description"])).limit(12),
    client.from("talent_profiles").select("expertise, skills, town, location_name, rate_amount, rate_period, years_experience")
      .eq("is_paid", true).or(ors(["expertise", "description", "town", "location_name"])).limit(8),
    client.from("jobs").select("title, company, location_name, salary_amount, salary_period, category")
      .eq("is_paid", true).eq("is_open", true).or(ors(["title", "category", "description", "location_name"])).limit(8),
  ]);
  const dist = (lat: number | null, lng: number | null) =>
    here && lat != null && lng != null ? distanceKm(here, { lat, lng }) : null;
  const shopRows = (shops.data ?? [])
    .map((s) => ({ ...s, km: dist(s.lat, s.lng) }))
    .sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9))
    .slice(0, 5);
  const lines: string[] = [];
  for (const s of shopRows)
    lines.push(`SHOP ${s.name} (${s.category}) link /@${s.handle} | ${s.landmark ?? ""} | ${s.km != null ? `${s.km.toFixed(1)} km away` : "distance unknown"} | ${s.is_open ? "open" : "closed"}${s.opening_hours ? `, hours ${s.opening_hours}` : ""} | ${(s.description ?? "").slice(0, 100)}`);
  for (const p of (products.data ?? []).slice(0, 6) as unknown as { name: string; price_ghc: number; is_available: boolean; shop: { name: string; handle: string; landmark: string | null; lat: number | null; lng: number | null } | null }[]) {
    if (!p.shop) continue;
    const km = dist(p.shop.lat, p.shop.lng);
    lines.push(`PRODUCT ${p.name} GH₵${p.price_ghc} ${p.is_available ? "in stock" : "out of stock"} at ${p.shop.name} link /@${p.shop.handle}${km != null ? ` | ${km.toFixed(1)} km away` : ""}`);
  }
  const term = encodeURIComponent(words[0]!);
  if (talent.data?.length) {
    lines.push(`TALENT (${talent.data.length} found) link /jobs?tab=talent&q=${term}`);
    for (const t of talent.data.slice(0, 4))
      lines.push(`  - ${t.expertise}, ${t.years_experience} yrs, ${t.town ?? t.location_name}, GH₵${t.rate_amount}/${t.rate_period}`);
  }
  if (jobs.data?.length) {
    lines.push(`JOBS (${jobs.data.length} open) link /jobs?tab=jobs&q=${term}`);
    for (const j of jobs.data.slice(0, 4))
      lines.push(`  - ${j.title} at ${j.company}, ${j.location_name}, GH₵${j.salary_amount}/${j.salary_period}`);
  }
  if (!lines.length)
    return `\n\nFindMit directory: no shops, products, talent or jobs matched "${words.join(" ")}". If the person wanted a service or product, say none is listed on FindMit yet and suggest browsing /shops or /jobs?tab=talent.`;
  return `\n\nLive FindMit directory matches (real listings, nearest first${here ? "" : "; user location unknown"}):\n${lines.join("\n")}\nWhen the person is looking for a service, worker, product, shop or job, recommend these FindMit listings first (nearest first) and include their links exactly as markdown, e.g. [Visit Kofi Auto](/@kofiauto.services) or [See painters on FindMit](/jobs?tab=talent&q=painter). Never invent listings, prices or distances. Ignore matches unrelated to the request.`;
}
