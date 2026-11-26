/** Chrome/Google-style result helpers: breadcrumb path, site name and query-term highlighting. */
export function breadcrumb(url: string) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean).slice(0, 3).map((p) => decodeURIComponent(p).replace(/[-_]+/g, " ").slice(0, 24));
    return { host: u.hostname.replace(/^www\./, ""), path: parts };
  } catch {
    return { host: url, path: [] as string[] };
  }
}

export function siteName(domain: string) {
  const base = domain.replace(/^(m|en|www)\./, "").split(".")[0] ?? domain;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Splits text into segments, marking those that match any query word (3+ letters). */
export function highlight(text: string, q: string): { t: string; hit: boolean }[] {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length >= 3).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return [{ t: text, hit: false }];
  const re = new RegExp(`(${words.join("|")})`, "gi");
  return text.split(re).filter(Boolean).map((t) => ({ t, hit: re.test(t) && ((re.lastIndex = 0), true) }));
}

export function relatedSearches(q: string, titles: string[]) {
  const base = q.trim();
  const extra = ["near me", "in Ghana", "price", "today", "how to", "best"];
  const fromTitles = titles.map((t) => t.split(/[-|–:]/)[0]?.trim() ?? "").filter((t) => t && t.toLowerCase() !== base.toLowerCase() && t.length < 50);
  return Array.from(new Set([...fromTitles.slice(0, 4), ...extra.map((e) => (e === "how to" || e === "best" ? `${e} ${base}` : `${base} ${e}`))])).slice(0, 8);
}
