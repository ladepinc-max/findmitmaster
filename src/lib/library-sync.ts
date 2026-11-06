import { getLibrarySnapshot } from "./knowledge.functions";
import { saveArticles } from "./knowledge-cache";

const KEY = "findmit-library-synced-at";
let running = false;

/** Quietly downloads new library articles to the phone whenever there is data. */
export async function syncLibrary() {
  if (running || typeof navigator === "undefined" || !navigator.onLine) return;
  running = true;
  try {
    const since = localStorage.getItem(KEY);
    const started = new Date().toISOString();
    for (let offset = 0; offset < 5000; offset += 200) {
      const rows = await getLibrarySnapshot({ data: { since, offset } });
      await saveArticles(rows);
      if (rows.length < 200) break;
    }
    localStorage.setItem(KEY, started);
  } catch {
    /* try again next time */
  } finally {
    running = false;
  }
}

export function clearLibrarySync() {
  if (typeof localStorage !== "undefined") localStorage.removeItem(KEY);
}
