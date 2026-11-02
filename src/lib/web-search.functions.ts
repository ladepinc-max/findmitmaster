import { createServerFn } from "@tanstack/react-start";

export interface WebHit {
  title: string;
  url: string;
  snippet: string;
  domain: string;
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";
const tag = (b: string, t: string) => decode(b.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`))?.[1] ?? "");
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

async function bing(q: string): Promise<WebHit[]> {
  const res = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(q)}&format=rss&setlang=en-GB`, {
    headers: { "User-Agent": UA },
  });
  const xml = await res.text();
  return xml
    .split("<item>")
    .slice(1, 11)
    .map((b) => {
      const url = tag(b, "link");
      return { title: tag(b, "title"), url, snippet: tag(b, "description"), domain: host(url) };
    })
    .filter((h) => h.title && /^https?:\/\//.test(h.url));
}

async function news(q: string): Promise<WebHit[]> {
  const res = await fetch(
    `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-GH&gl=GH&ceid=GH:en`,
    { headers: { "User-Agent": UA } },
  );
  const xml = await res.text();
  return xml
    .split("<item>")
    .slice(1, 7)
    .map((b) => {
      const source = tag(b, "source");
      const srcUrl = b.match(/<source url="([^"]+)"/)?.[1] ?? "";
      const date = tag(b, "pubDate");
      return {
        title: tag(b, "title"),
        url: tag(b, "link"),
        snippet: ["News", source, date ? new Date(date).toDateString() : ""].filter(Boolean).join(" · "),
        domain: host(srcUrl) || "news",
      };
    })
    .filter((h) => h.title && /^https?:\/\//.test(h.url));
}

async function wiki(q: string): Promise<WebHit[]> {
  const res = await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=4&format=json`,
    { headers: { "User-Agent": "FindMit/1.0 (search)" } },
  );
  const body = (await res.json()) as { query?: { search?: { title: string; snippet: string }[] } };
  return (body.query?.search ?? []).map((r) => ({
    title: `${r.title} — Wikipedia`,
    url: `https://en.m.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`,
    snippet: decode(r.snippet),
    domain: "en.wikipedia.org",
  }));
}

const safe = (p: Promise<WebHit[]>) => p.catch((e) => (console.error("search source failed", e), [] as WebHit[]));

/** Fetches web results from several sources server-side and returns plain cards — no search-engine page is shown. */
export const searchWeb = createServerFn({ method: "POST" })
  .inputValidator((d: { q: string }) => ({ q: String(d?.q ?? "").slice(0, 200) }))
  .handler(async ({ data }): Promise<{ hits: WebHit[]; error?: string }> => {
    const q = data.q.trim();
    if (!q) return { hits: [] };
    const [web, nw, wk] = await Promise.all([safe(bing(q)), safe(news(q)), safe(wiki(q))]);
    // Interleave: web first, then news and encyclopedia mixed in.
    const merged: WebHit[] = [];
    const max = Math.max(web.length, nw.length, wk.length);
    for (let i = 0; i < max; i++) {
      if (web[i]) merged.push(web[i]!);
      if (web[i + max]) merged.push(web[i + max]!);
      if (nw[i]) merged.push(nw[i]!);
      if (wk[i]) merged.push(wk[i]!);
    }
    const seen = new Set<string>();
    const hits = merged.filter((h) => (seen.has(h.url) ? false : (seen.add(h.url), true))).slice(0, 20);
    return hits.length ? { hits } : { hits, error: "Web results are unavailable right now" };
  });
