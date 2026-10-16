/** Server-only helpers for the school's own Google Gemini key. Works with both AQ. and AIza keys. */

const BASE = "https://generativelanguage.googleapis.com/v1beta";
export const GEMINI_VOICE_MODEL = "gemini-3.5-flash-lite";
export const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image";
export const GEMINI_EMBED_MODEL = "gemini-embedding-001";
/** Vault vectors are stored as vector(1536). */
const EMBED_DIMS = 1536;

export function geminiKey(missing = "The tutor is not set up yet") {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) throw new Error(missing);
  return key;
}

export function geminiHeaders(key: string) {
  return { "x-goog-api-key": key, "Content-Type": "application/json" };
}

/** POST to a Gemini endpoint, waiting and retrying briefly when Google is busy. */
export async function geminiPost(path: string, body: unknown, key: string) {
  const send = () =>
    fetch(`${BASE}/${path}`, { method: "POST", headers: geminiHeaders(key), body: JSON.stringify(body) });
  let res = await send();
  for (let i = 0; i < 2 && (res.status === 503 || res.status === 429); i++) {
    await new Promise((r) => setTimeout(r, 1200 * (i + 1) + Math.random() * 500));
    res = await send();
  }
  return res;
}

export async function geminiEmbed(texts: string[]): Promise<number[][]> {
  const key = geminiKey("The vault search is not set up yet");
  const out: number[][] = [];
  for (const text of texts) {
    const res = await geminiPost(
      `models/${GEMINI_EMBED_MODEL}:embedContent`,
      { content: { parts: [{ text }] }, outputDimensionality: EMBED_DIMS },
      key,
    );
    if (res.status === 429) throw new Error("Too many requests right now. Try again in a moment.");
    if (!res.ok) {
      console.warn("Gemini embed failed", res.status, (await res.text().catch(() => "")).slice(0, 200));
      throw new Error("The vault search could not run right now");
    }
    const body = (await res.json()) as { embedding?: { values?: number[] } };
    const v = body.embedding?.values;
    if (!v?.length) throw new Error("The vault search could not run right now");
    out.push(v);
  }
  return out;
}
