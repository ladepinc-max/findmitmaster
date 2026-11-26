/** Separate from the crawled-library cache: one replaceable image per logical slot. */
export const INTERFACE_IMAGE_CACHE = "findmit-interface-images-v1";
let generation = 0;
const pending = new Map<string, Promise<Blob | null>>();

export function avatarImageKey(path: string): string {
  // Our avatar uploads are user-id/avatar-timestamp.ext: changing photo replaces the same slot.
  return `avatar:${/^https?:\/\//i.test(path) ? path.split("?")[0] : path.split("/")[0]}`;
}

function requestFor(key: string) {
  return new Request(`${window.location.origin}/__interface-image-cache/${encodeURIComponent(key)}`);
}

export async function readInterfaceImage(key: string, version: string): Promise<Blob | null> {
  try {
    const response = await (await caches.open(INTERFACE_IMAGE_CACHE)).match(requestFor(key));
    return response?.headers.get("x-findmit-image-version") === encodeURIComponent(version)
      ? response.blob() : null;
  } catch { return null; }
}

export async function refreshInterfaceImage(key: string, version: string, resolve: () => Promise<string | null>): Promise<Blob | null> {
  const id = `${key}:${version}`;
  const current = pending.get(id);
  if (current) return current;
  const started = generation;
  const task = (async () => {
    try {
      const source = await resolve();
      if (!source) return null;
      const response = await fetch(source, { cache: "no-store" });
      if (!response.ok || response.type === "opaque") return null;
      const blob = await response.blob();
      if (!blob.type.startsWith("image/") || !blob.size || generation !== started) return null;
      // put overwrites the same slot, removing the old bytes instead of accumulating versions.
      const cache = await caches.open(INTERFACE_IMAGE_CACHE);
      if (generation !== started) return null;
      await cache.put(requestFor(key), new Response(blob, { headers: {
        "Content-Type": blob.type,
        "x-findmit-image-version": encodeURIComponent(version),
      } }));
      return blob;
    } catch { return null; }
  })();
  pending.set(id, task);
  try { return await task; } finally { if (pending.get(id) === task) pending.delete(id); }
}

export async function clearInterfaceImages() {
  generation += 1;
  pending.clear();
  try { await caches.delete(INTERFACE_IMAGE_CACHE); } catch { /* unsupported storage */ }
}