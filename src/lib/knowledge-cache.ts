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

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "q" });
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
