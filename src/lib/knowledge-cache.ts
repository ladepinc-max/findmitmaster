/** On-phone cache of FindMit library (crawled knowledge) search results only.
 * Hard cap: 100 MB of browser storage. Never stores news-aggregator stories or videos. */

export const KNOWLEDGE_CACHE_LIMIT_BYTES = 100 * 1024 * 1024;

export type CachedHit = {
  id: string; title: string; summary: string; category: string;
  source_name: string; source_url: string; image_url: string | null;
};

export interface CacheEntry { q: string; hits: CachedHit[]; size: number; at: number }

const VIDEO_RE = /\.(mp4|m3u8|webm|mov|mkv)(\?|$)|youtube\.com|youtu\.be|vimeo\.com/i;

/** Drops anything that is a video so it is never saved on the phone. */
export function stripVideos(hits: CachedHit[]): CachedHit[] {
  return hits
    .filter((h) => !VIDEO_RE.test(h.source_url))
    .map((h) => (h.image_url && VIDEO_RE.test(h.image_url) ? { ...h, image_url: null } : h));
}

export function entrySize(q: string, hits: CachedHit[]) {
  return new Blob([q, JSON.stringify(hits)]).size;
}

/** Returns the keys to delete (oldest first) so the total fits under the limit. */
export function evictionPlan(entries: Pick<CacheEntry, "q" | "size" | "at">[], limit = KNOWLEDGE_CACHE_LIMIT_BYTES) {
  let total = entries.reduce((s, e) => s + e.size, 0);
  const drop: string[] = [];
  for (const e of [...entries].sort((a, b) => a.at - b.at)) {
    if (total <= limit) break;
    drop.push(e.q);
    total -= e.size;
  }
  return drop;
}

const DB = "findmit-library";
const STORE = "searches";
const ARTICLES = "articles";

export type LibraryArticle = CachedHit & { content: string; crawled_at: string };

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: "q" });
      if (!r.result.objectStoreNames.contains(ARTICLES)) r.result.createObjectStore(ARTICLES, { keyPath: "id" });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

const key = (q: string) => q.trim().toLowerCase();

export async function readCached(q: string): Promise<CachedHit[] | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await open();
    return await new Promise((res) => {
      const r = db.transaction(STORE).objectStore(STORE).get(key(q));
      r.onsuccess = () => res((r.result as CacheEntry | undefined)?.hits ?? null);
      r.onerror = () => res(null);
    });
  } catch {
    return null;
  }
}

export async function saveCached(q: string, hits: CachedHit[]) {
  if (typeof indexedDB === "undefined" || hits.length === 0) return;
  try {
    const clean = stripVideos(hits);
    const k = key(q);
    const db = await open();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.put({ q: k, hits: clean, size: entrySize(k, clean), at: Date.now() } satisfies CacheEntry);
    const all = store.getAll();
    all.onsuccess = () => {
      for (const q2 of evictionPlan(all.result as CacheEntry[])) store.delete(q2);
    };
  } catch {
    /* storage full or blocked: skip */
  }
}

export async function clearKnowledgeCache() {
  if (typeof indexedDB !== "undefined") indexedDB.deleteDatabase(DB);
}

/** Ranks saved articles for a query by word matches (title counts more). */
export function rankArticles<T extends { title: string; summary: string; content: string }>(items: T[], q: string, n = 6): T[] {
  const words = q.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  if (!words.length) return [];
  return items
    .map((a) => {
      const t = a.title.toLowerCase(), b = (a.summary + " " + a.content).toLowerCase();
      const score = words.reduce((s, w) => s + (t.includes(w) ? 3 : 0) + (b.includes(w) ? 1 : 0), 0);
      return { a, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, n)
    .map((x) => x.a);
}

async function allArticles(): Promise<(LibraryArticle & { size: number })[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const db = await open();
    return await new Promise((res) => {
      const r = db.transaction(ARTICLES).objectStore(ARTICLES).getAll();
      r.onsuccess = () => res(r.result ?? []);
      r.onerror = () => res([]);
    });
  } catch {
    return [];
  }
}

export async function searchOfflineLibrary(q: string) {
  return rankArticles(await allArticles(), q);
}

export async function getOfflineArticle(id: string) {
  return (await allArticles()).find((a) => a.id === id) ?? null;
}

/** Saves library articles on the phone; searches + articles together stay under 100 MB (oldest dropped first). */
export async function saveArticles(items: LibraryArticle[]) {
  if (typeof indexedDB === "undefined" || !items.length) return;
  try {
    const db = await open();
    const tx = db.transaction([ARTICLES, STORE], "readwrite");
    const as = tx.objectStore(ARTICLES), ss = tx.objectStore(STORE);
    for (const a of items) {
      if (VIDEO_RE.test(a.source_url)) continue;
      const clean = { ...a, image_url: a.image_url && VIDEO_RE.test(a.image_url) ? null : a.image_url };
      as.put({ ...clean, size: new Blob([JSON.stringify(clean)]).size, at: Date.parse(a.crawled_at) || Date.now() });
    }
    const ar = as.getAll(), sr = ss.getAll();
    tx.oncomplete = () => undefined;
    let done = 0;
    const finish = () => {
      if (++done < 2) return;
      const entries = [
        ...(ar.result as { id: string; size: number; at: number }[]).map((e) => ({ q: "a:" + e.id, size: e.size, at: e.at })),
        ...(sr.result as CacheEntry[]).map((e) => ({ q: "s:" + e.q, size: e.size, at: e.at })),
      ];
      for (const k of evictionPlan(entries)) (k.startsWith("a:") ? as : ss).delete(k.slice(2));
    };
    ar.onsuccess = finish;
    sr.onsuccess = finish;
  } catch {
    /* storage blocked */
  }
}
