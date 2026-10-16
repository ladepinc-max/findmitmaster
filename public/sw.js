/* FindMit service worker: background push + notification handling,
 * plus cache-first storage of immutable hashed build assets (never HTML). */

const ASSET_CACHE = "findmit-assets-v1";
const isPreviewHost = /^(id-preview--|preview--)/.test(self.location.hostname) ||
  /lovableproject(-dev)?\.com$/.test(self.location.hostname) ||
  self.location.hostname === "localhost";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.allSettled(
        keys.filter((k) => k.startsWith("findmit-assets-") && k !== ASSET_CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  ),
);

self.addEventListener("fetch", (event) => {
  if (isPreviewHost) return;
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Only content-hashed build files are safe to serve forever from cache.
  if (!url.pathname.startsWith("/assets/")) return;
  event.respondWith(
    caches.open(ASSET_CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone()).catch(() => undefined);
      return res;
    }),
  );
});

/** Web push / FCM payloads arrive here even when the app is closed. */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "FindMit", body: event.data ? event.data.text() : "" };
  }
  const data = payload.notification ?? payload;
  const title = data.title || "FindMit";
  const options = {
    body: data.body || "",
    icon: "/FindMit-Icon-Transparent-FINAL.png",
    badge: "/favicon.png",
    tag: data.tag,
    data: payload.data ?? data.data ?? {},
    vibrate: data.vibrate === false ? undefined : [120, 60, 120],
    actions: data.actions ?? [],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  const action = event.action;
  event.notification.close();

  if (action === "skip") {
    event.waitUntil(
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
        clients.forEach((client) =>
          client.postMessage({ type: "findmit-skip-class", classId: data.classId }),
        );
      }),
    );
    return;
  }

  const url = data.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.postMessage({ type: "findmit-open", url });
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
