import { createServerFn } from "@tanstack/react-start";

export interface WebHit {
  title: string;
  url: string;
  snippet: string;
  domain: string;
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();

function realUrl(href: string): string | null {
  try {
    const u = new URL(href, "https://duckduckgo.com");
    const target = u.searchParams.get("uddg");
    const final = target ?? u.toString();
    if (!/^https?:\/\//.test(final) || /duckduckgo\.com/.test(new URL(final).hostname)) return null;
    return final;
  } catch {
    return null;
  }
}

/** Fetches web results server-side and returns plain cards — no search-engine page is ever shown. */
export const searchWeb = createServerFn({ method: "POST" })
  .inputValidator((d: { q: string }) => ({ q: String(d?.q ?? "").slice(0, 200) }))
  .handler(async ({ data }): Promise<{ hits: WebHit[]; error?: string }> => {
    const q = data.q.trim();
    if (!q) return { hits: [] };
    try {
      const res = await fetch("https://html.duckduckgo.com/html/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
        },
        body: `q=${encodeURIComponent(q)}&kl=xa-en`,
      });
      const html = await res.text();
      const hits: WebHit[] = [];
      const blocks = html.split(/class="result results_links/).slice(1);
      for (const b of blocks) {
        if (/result--ad/.test(b.slice(0, 200))) continue;
        const a = b.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
        if (!a) continue;
        const url = realUrl(decode(a[1]!));
        if (!url) continue;
        const sn = b.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
        hits.push({
          title: decode(a[2]!),
          url,
          snippet: sn ? decode(sn[1]!) : "",
          domain: new URL(url).hostname.replace(/^www\./, ""),
        });
        if (hits.length >= 10) break;
      }
      return { hits };
    } catch (e) {
      console.error("searchWeb failed", e);
      return { hits: [], error: "Web results are unavailable right now" };
    }
  });
