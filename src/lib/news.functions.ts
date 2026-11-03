import { createServerFn } from "@tanstack/react-start";
import { decodeEntities, stripTags, type NewsArticle, type NewsItem } from "./news";

const FEEDS: { source: string; url: string }[] = [
  { source: "Myjoyonline", url: "https://www.myjoyonline.com/feed/" },
  { source: "Adomonline", url: "https://www.adomonline.com/feed/" },
  { source: "Graphic Online", url: "https://www.graphic.com.gh/news.feed?type=rss" },
  { source: "3News", url: "https://3news.com/feed/" },
];

const UA = "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeEntities(m[1]).trim() : "";
}

function imageFrom(block: string): string | null {
  const m =
    block.match(/<media:(?:content|thumbnail)[^>]+url="([^"]+)"/i) ||
    block.match(/<enclosure[^>]+url="([^"]+)"[^>]*type="image/i) ||
    decodeEntities(block).match(/<img[^>]+src="([^"]+)"/i);
  return m ? m[1] : null;
}

async function readFeed(source: string, url: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
    if (!res.ok) return [];
    const xml = await res.text();
    return (xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []).slice(0, 25).map((b) => {
      const date = tag(b, "pubDate");
      return {
        title: stripTags(tag(b, "title")),
        url: tag(b, "link"),
        source,
        image: imageFrom(b),
        publishedAt: date ? new Date(date).toISOString() : null,
        categories: [...b.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)].map((m) => stripTags(m[1])),
      };
    }).filter((i) => i.title && /^https?:\/\//.test(i.url));
  } catch {
    return [];
  }
}

/** Latest Ghanaian news from trusted publishers, newest first. */
export const getNewsFeed = createServerFn({ method: "GET" }).handler(async () => {
  const lists = await Promise.all(FEEDS.map((f) => readFeed(f.source, f.url)));
  const seen = new Set<string>();
  const items = lists.flat().filter((i) => (seen.has(i.title) ? false : (seen.add(i.title), true)));
  items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  return { items: items.slice(0, 80) };
});

function meta(html: string, prop: string): string | null {
  const m =
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)`, "i")) ||
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, "i"));
  return m ? decodeEntities(m[1]) : null;
}

/** Fetches a news page and returns a clean, ad-free reader version. */
export const readArticle = createServerFn({ method: "POST" })
  .inputValidator((input: { url: string }) => {
    const u = new URL(input.url);
    if (!/^https?:$/.test(u.protocol)) throw new Error("Invalid link");
    return { url: u.toString() };
  })
  .handler(async ({ data }): Promise<NewsArticle> => {
    const res = await fetch(data.url, { headers: { "User-Agent": UA }, redirect: "follow" });
    if (!res.ok) throw new Error(`Could not load story (${res.status})`);
    let html = await res.text();
    const title = meta(html, "og:title") ?? stripTags(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    const image = meta(html, "og:image");
    const source = meta(html, "og:site_name") ?? new URL(data.url).hostname.replace(/^www\./, "");
    const publishedAt = meta(html, "article:published_time");
    html = html.replace(/<(script|style|noscript|aside|nav|footer|header|form)[\s\S]*?<\/\1>/gi, "");
    const scope = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html;
    const paragraphs = [...scope.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) => stripTags(m[1]))
      .filter((p) => p.length > 40 && !/cookie|subscribe to our|all rights reserved|©/i.test(p))
      .slice(0, 60);
    return { title, url: data.url, source, image, publishedAt, paragraphs };
  });
