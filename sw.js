// Offline support: keeps the app's own files, and the Firebase code they load, on the phone, so the
// app opens instantly and works without a connection. Patient data isn't handled here: Firestore
// keeps its own offline copy. Requests to Firebase's servers pass straight through.
const VERSION = "dev"; // the commit, put in at deploy (deploy.yml), so each deploy caches its own files
const DEV = VERSION === "dev"; // on your computer: always fetch fresh files, the cache is only a fallback
const SHELL = `shell-${VERSION}`;
const RUNTIME = "runtime"; // Firebase code and fonts: their URLs carry their version, so they're kept across deploys

// The same ?v= as index.html and app.js use after deploy
const FILES = ["index.html", `style.css?v=${VERSION}`, `app.js?v=${VERSION}`, `medicines.js?v=${VERSION}`,
  "firebase-config.js", "manifest.webmanifest", "icons/icon-192.png", "icons/apple-touch-icon.png"];
const SHELL_URLS = new Set(FILES.map((f) => new URL(f, self.location).href));
// Keep in step with the version app.js imports (a new one is still cached the first time it loads)
const FIREBASE = "https://www.gstatic.com/firebasejs/10.12.2/";
const SDK = ["firebase-app.js", "firebase-auth.js", "firebase-firestore.js"].map((f) => FIREBASE + f);

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await (await caches.open(SHELL)).addAll(FILES); // all or nothing: a half-cached app isn't installed
    await (await caches.open(RUNTIME)).addAll(SDK).catch(() => {}); // cached on first use instead
    await self.skipWaiting(); // the open page keeps its files; the next launch gets the new ones
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("shell-") && key !== SHELL) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Any page of the app (?patient=… included) is index.html
  if (req.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(fromShell("index.html", req));
  } else if (SHELL_URLS.has(url.href)) {
    event.respondWith(fromShell(url.href, req));
  } else if (url.href.startsWith(FIREBASE) || url.host === "fonts.gstatic.com") {
    event.respondWith(fromRuntime(event, req, false));
  } else if (url.host === "fonts.googleapis.com") {
    event.respondWith(fromRuntime(event, req, true)); // the font list: refreshed in the background
  }
});

// ---------- Dose reminders (sent by worker/ while the app is closed) ----------
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil((async () => {
    // The open page shows this reminder itself (checkReminders); only skip when it's really on screen
    const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (data.p && open.some((c) => c.visibilityState === "visible" && c.url.includes(data.p))) return;
    await self.registration.showNotification(data.t ?? "Medicine Tracker", {
      body: data.b ?? "",
      tag: data.g ? `${data.p}_${data.g}` : undefined, // one notification per dose, not a pile
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      data: { url: data.p ? `./?patient=${data.p}` : "./" },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL(event.notification.data?.url ?? "./", self.location.href).href;
    const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const win = open.find((c) => c.url === url) ?? open[0];
    if (!win) return self.clients.openWindow(url);
    await win.focus();
    if (win.url !== url) await win.navigate(url).catch(() => {});
  })());
});

// The app's files: from the cache (instant), else the network. On your computer the other way round.
async function fromShell(key, req) {
  const cache = await caches.open(SHELL);
  if (!DEV) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }
  try {
    const res = await fetch(req);
    if (DEV && res.ok) cache.put(key, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(key);
    if (hit) return hit;
    throw err;
  }
}

// Firebase code and fonts: from the cache when there, else the network (and kept for next time)
async function fromRuntime(event, req, refresh) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit && !refresh) return hit;
  const fresh = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  if (!hit) return fresh;
  event.waitUntil(fresh.catch(() => {}));
  return hit;
}
