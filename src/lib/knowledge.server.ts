/** FindMit high-value crawler: fills crawled_knowledge from trusted sources. Server only. */
import type { SupabaseClient } from "@supabase/supabase-js";

const UA = "FindMitCrawler/1.0 (+https://findmitmaster.lovable.app)";
const NEWS_DAYS = 14;
const MAX_ROWS = 12000;

/** Evergreen topics FindMit should always know. Admins can add more by searching. */
export const SEED_TOPICS: { title: string; category: string }[] = [
  ...[
    "Ghana", "Accra", "Kumasi", "Tamale", "Cape Coast", "Takoradi", "Kwame Nkrumah", "Jerry Rawlings", "John Kufuor",
    "John Atta Mills", "John Mahama", "Nana Akufo-Addo", "Yaa Asantewaa", "Ashanti Empire", "Gold Coast (British colony)",
    "Ghanaian cedi", "Lake Volta", "Akosombo Dam", "Regions of Ghana", "Parliament of Ghana", "Constitution of Ghana",
    "Homowo", "Aboakyere", "Kente cloth", "Adinkra symbols", "Jollof rice", "Fufu", "Akan people", "Ewe people",
    "Ga-Adangbe people", "Dagomba people", "Twi", "Black Stars", "Ghana Premier League", "University of Ghana",
    "Kwame Nkrumah University of Science and Technology", "Cape Coast Castle", "Elmina Castle", "Kakum National Park",
    "Mole National Park", "Independence Day (Ghana)", "Economy of Ghana", "Cocoa bean", "Ghana Revenue Authority",
    "Driver and Vehicle Licensing Authority", "Ghana Police Service", "National Health Insurance Scheme",
  ].map((title) => ({ title, category: "ghana_civic" })),
  ...[
    "Photosynthesis", "Respiration", "Cell (biology)", "Human digestive system", "Circulatory system", "Malaria",
    "Water cycle", "Solar System", "Gravity", "Electricity", "Magnetism", "Atom", "Periodic table", "Acid", "Base (chemistry)",
    "Pythagorean theorem", "Fraction (mathematics)", "Percentage", "Algebra", "Quadratic equation", "Probability",
    "Simple interest", "Noun", "Verb", "Adjective", "Pronoun", "Tense (grammar)", "Democracy", "Human rights",
    "Climate change", "Erosion", "Soil", "Photosynthesis in plants", "Food chain", "Ecosystem", "Computer",
    "Internet", "Microsoft Word", "Spreadsheet",
  ].map((title) => ({ title, category: "education" })),
  ...[
    "Maize", "Cassava", "Yam (vegetable)", "Poultry farming", "Fall armyworm", "Fertilizer", "Irrigation",
    "Small business", "Bookkeeping", "Mobile money",
  ].map((title) => ({ title, category: "agriculture_business" })),
  ...[
    "First aid", "Cardiopulmonary resuscitation", "Hypertension", "Diabetes", "Cholera", "Typhoid fever",
    "HIV/AIDS", "Hand washing", "Nutrition", "Dehydration",
  ].map((title) => ({ title, category: "health" })),
  ...[
    "Africa", "African Union", "ECOWAS", "United Nations", "World War II", "World War I", "Nelson Mandela",
    "Martin Luther King Jr.", "Albert Einstein", "Isaac Newton", "Artificial intelligence", "Smartphone",
    "Nigeria", "Togo", "Burkina Faso", "Côte d'Ivoire", "United States", "United Kingdom", "China", "FIFA World Cup",
  ].map((title) => ({ title, category: "global_reference" })),
];

const NEWS_FEEDS = [
  { source: "Myjoyonline", url: "https://www.myjoyonline.com/feed/" },
  { source: "Adomonline", url: "https://www.adomonline.com/feed/" },
  { source: "3News", url: "https://3news.com/feed/" },
  { source: "BBC Africa", url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml" },
  { source: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
];

type Row = {
  title: string; summary: string; content: string; category: string; source_name: string;
  source_url: string; image_url: string | null; is_evergreen: boolean; expires_at: string | null; crawled_at: string;
};

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ").trim();

async function wikiTopic(title: string, category: string): Promise<Row | null> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`,
      { headers: { "User-Agent": UA } },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { title?: string; extract?: string; type?: string; thumbnail?: { source?: string }; content_urls?: { mobile?: { page?: string } } };
    if (!j.extract || j.type === "disambiguation") return null;
    // Longer intro text gives the tutor more to work with.
    let content = j.extract;
    try {
      const ex = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=plain&format=json&redirects=1&titles=${encodeURIComponent(title)}`,
        { headers: { "User-Agent": UA } },
      );
      const ej = (await ex.json()) as { query?: { pages?: Record<string, { extract?: string }> } };
      const full = Object.values(ej.query?.pages ?? {})[0]?.extract ?? "";
      if (full.length > content.length) content = full.slice(0, 12000);
    } catch { /* keep summary */ }
    return {
      title: j.title ?? title, summary: j.extract.slice(0, 600), content, category, source_name: "Wikipedia",
      source_url: j.content_urls?.mobile?.page ?? `https://en.m.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      image_url: j.thumbnail?.source ?? null, is_evergreen: true, expires_at: null, crawled_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function newsFeed(source: string, url: string): Promise<Row[]> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return [];
    const xml = await res.text();
    const expires = new Date(Date.now() + NEWS_DAYS * 864e5).toISOString();
    return (xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []).slice(0, 25).flatMap((b) => {
      const get = (n: string) => decode(b.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`, "i"))?.[1] ?? "");
      const title = get("title");
      const link = get("link") || get("guid");
      const desc = get("description").slice(0, 800);
      const img = b.match(/<media:(?:content|thumbnail)[^>]+url="([^"]+)"/i)?.[1] ?? null;
      if (!title || !/^https?:\/\//.test(link)) return [];
      return [{
        title, summary: desc, content: desc, category: "news", source_name: source, source_url: link,
        image_url: img, is_evergreen: false, expires_at: expires, crawled_at: new Date().toISOString(),
      }];
    });
  } catch {
    return [];
  }
}

/** Runs one crawl pass. Evergreen topics are refreshed only when older than 30 days. */
export async function runCrawl(admin: SupabaseClient, opts: { topics?: string[] } = {}) {
  const extra = (opts.topics ?? []).map((t) => ({ title: t, category: "global_reference" }));
  const { data: existing } = await admin
    .from("crawled_knowledge").select("title, crawled_at").eq("is_evergreen", true);
  const fresh = new Set(
    (existing ?? []).filter((r) => Date.now() - new Date(r.crawled_at as string).getTime() < 30 * 864e5)
      .map((r) => String(r.title).toLowerCase()),
  );
  const todo = [...extra, ...SEED_TOPICS.filter((t) => !fresh.has(t.title.toLowerCase()))].slice(0, 40);

  const rows: Row[] = [];
  for (let i = 0; i < todo.length; i += 8) {
    const batch = await Promise.all(todo.slice(i, i + 8).map((t) => wikiTopic(t.title, t.category)));
    rows.push(...batch.filter((r): r is Row => !!r));
  }
  const news = (await Promise.all(NEWS_FEEDS.map((f) => newsFeed(f.source, f.url)))).flat();
  rows.push(...news);

  const seen = new Set<string>();
  const unique = rows.filter((r) => (seen.has(r.source_url) ? false : (seen.add(r.source_url), true)));
  if (unique.length) {
    const { error } = await admin.from("crawled_knowledge").upsert(unique, { onConflict: "source_url" });
    if (error) throw new Error(error.message);
  }
  // Rolling cleanup: expired news goes, and the table never grows past the cap.
  await admin.from("crawled_knowledge").delete().lt("expires_at", new Date().toISOString());
  const { count } = await admin.from("crawled_knowledge").select("id", { count: "exact", head: true });
  if ((count ?? 0) > MAX_ROWS) {
    const { data: old } = await admin.from("crawled_knowledge").select("id")
      .eq("is_evergreen", false).order("crawled_at", { ascending: true }).limit((count ?? 0) - MAX_ROWS);
    if (old?.length) await admin.from("crawled_knowledge").delete().in("id", old.map((o) => o.id));
  }
  return { topics: unique.length - news.length, news: news.length, total: count ?? 0 };
}

export type KnowledgeHit = {
  id: string; title: string; summary: string; content: string; category: string;
  source_name: string; source_url: string; image_url: string | null;
};

/** Full-text search over FindMit's own knowledge. */
export async function searchKnowledgeDb(client: SupabaseClient, q: string, n = 5): Promise<KnowledgeHit[]> {
  const query = q.trim().slice(0, 200);
  if (!query) return [];
  const { data, error } = await client.rpc("search_knowledge", { _q: query, _n: n });
  if (error) {
    console.error("search_knowledge failed", error.message);
    return [];
  }
  return (data ?? []) as KnowledgeHit[];
}

/** Text block given to the AI so it answers from FindMit knowledge first. */
export function knowledgeContext(hits: KnowledgeHit[]) {
  if (!hits.length) return "";
  return `\nFindMit Knowledge Vault (FindMit's own verified library — use it first when relevant, and say "From the FindMit library" when you rely on it; fill gaps from your own expertise):\n${hits
    .map((h) => `- ${h.title} (${h.source_name}): ${h.content.slice(0, 1500)}`)
    .join("\n")}`;
}
