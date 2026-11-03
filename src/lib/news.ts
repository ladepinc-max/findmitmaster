/** Pure helpers for the FindMit news reader (shared by server + browser). */

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  image: string | null;
  publishedAt: string | null;
  categories: string[];
}

export interface NewsArticle {
  title: string;
  url: string;
  source: string;
  image: string | null;
  publishedAt: string | null;
  paragraphs: string[];
}

export const NEWS_TABS = ["For you", "Politics", "Sports", "Business", "Entertainment", "Tech"] as const;
export type NewsTab = (typeof NEWS_TABS)[number];

const TAB_WORDS: Record<NewsTab, string[]> = {
  "For you": [],
  Politics: ["politic", "parliament", "election", "government", "minister", "npp", "ndc"],
  Sports: ["sport", "football", "soccer", "black stars", "league", "athlet", "boxing"],
  Business: ["business", "econom", "finance", "market", "bank", "cedi", "trade"],
  Entertainment: ["entertain", "music", "movie", "showbiz", "celebrit", "lifestyle"],
  Tech: ["tech", "digital", "internet", "mobile", "ai ", "science"],
};

export function matchesTab(item: NewsItem, tab: NewsTab): boolean {
  const words = TAB_WORDS[tab];
  if (!words.length) return true;
  const hay = `${item.categories.join(" ")} ${item.title}`.toLowerCase();
  return words.some((w) => hay.includes(w));
}

export function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** Returns the paragraph index after which in-article ads go: after 2nd paragraph, then every 4. */
export function adSlotsFor(paragraphCount: number): number[] {
  const slots: number[] = [];
  for (let i = 2; i < paragraphCount; i += 4) slots.push(i);
  return slots;
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const m = Math.max(1, Math.round((Date.now() - t) / 60000));
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? "s" : ""} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d > 1 ? "s" : ""} ago`;
}
