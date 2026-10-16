/* FindMit background push worker (Firebase Cloud Messaging, Chrome/Android). */
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const params = Object.fromEntries(new URL(self.location).searchParams);
const config = {
  apiKey: params.apiKey,
  projectId: params.projectId,
  appId: params.appId,
  messagingSenderId: params.messagingSenderId || (params.appId || "").split(":")[1] || "",
};

function buildNotification(payload) {
  const n = payload.notification ?? {};
  const d = payload.data ?? {};
  const title = n.title || d.title || "FindMit";
  const options = {
    body: n.body || d.body || "",
    icon: "/FindMit-Icon-Transparent-FINAL.png",
    badge: "/favicon.png",
    tag: d.tag || n.tag,
    renotify: Boolean(d.tag || n.tag),
    data: { ...d, url: d.url || "/" },
    vibrate: d.vibrate === "false" ? undefined : [120, 60, 120],
    actions: d.actions ? JSON.parse(d.actions) : [],
  };
  return [title, options];
}

if (config.apiKey && config.projectId && config.appId && config.messagingSenderId) {
  firebase.initializeApp(config);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const [title, options] = buildNotification(payload);
    return self.registration.showNotification(title, options);
  });
}

/* Data-only or non-FCM pushes still land here. */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { notification: { title: "FindMit", body: event.data ? event.data.text() : "" } };
  }
  if (payload.notification && payload.from) return; // handled by onBackgroundMessage
  const [title, options] = buildNotification(payload);
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
