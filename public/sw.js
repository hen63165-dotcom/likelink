/* Likelink Service Worker — השכבה הגאונית 🧠
 *
 * אסטרטגיות caching חכמות לפי סוג בקשה:
 *   • App Shell (ניווט)     → Network-first, fallback ל-cache, ואז offline.html
 *   • Static assets (/assets) → Stale-While-Revalidate (מהירות ברק)
 *   • תמונות                → Cache-first + ניקוי LRU (חסכוני ב-quota)
 *   • API GET (feed/sitemap)  → Network-first + cache fallback (עובד גם אופליין)
 *   • POST/פעולות כתיבה      → תמיד רשת, לעולם לא cache
 * בנוסף:
 *   • Web Push notifications (push + notificationclick)
 *   • עדכון גרסה חלק (skipWaiting + clients.claim)
 *   • הגבלת גודל cache עם ניקוי ישן-ביותר
 */

const VERSION = "v3";
const SHELL_CACHE = `likelink-shell-${VERSION}`;
const ASSET_CACHE = `likelink-assets-${VERSION}`;
const IMG_CACHE = `likelink-img-${VERSION}`;
const API_CACHE = `likelink-api-${VERSION}`;
const MAX_IMAGES = 200;

const PRECACHE = [
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.json",
  "/icons/icon-192.webp",
  "/icons/icon-512.webp",
];

// endpoints שאסור לגעת ב-cache שלהם
const NEVER_CACHE = [/\/api\/(autopilot|price-watch|r|fetch-product-info|creator-og|push)/i];
const CACHEABLE_API = [/\/api\/(google-feed|sitemap)/i];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = [SHELL_CACHE, ASSET_CACHE, IMG_CACHE, API_CACHE];
      for (const name of await caches.keys()) {
        if (!keep.includes(name)) await caches.delete(name); // מחיקת גרסאות ישנות
      }
      await self.clients.claim();
    })()
  );
});

// הודעות מהאפליקציה: SKIP_WAITING / TRACK_OFFLINE
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function trimCache(name, maxEntries) {
  return caches.open(name).then(async (cache) => {
    const keys = await cache.keys();
    if (keys.length <= maxEntries) return;
    // מחיקת הישנות ביותר עד למכסה
    for (let i = 0; i < keys.length - maxEntries; i++) {
      await cache.delete(keys[i]);
    }
  });
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await fetchPromise) || Response.error();
}

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const shell = await caches.open(SHELL_CACHE);
      const fallback =
        (await shell.match(fallbackUrl)) || (await shell.match("/index.html"));
      if (fallback) return fallback;
    }
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (NEVER_CACHE.some((re) => re.test(url.pathname))) return; // תמיד רשת

  // ניווט בין דפים — האפליקציה עצמה
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE, "/index.html"));
    return;
  }

  // קבצי build מגובשים — SWR (immutably cached content + refresh in background)
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
    return;
  }

  // תמונות — cache-first עם מכסה
  if (/\.(png|jpe?g|webp|svg|gif|ico|woff2?)$/i.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(IMG_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const res = await fetch(request);
          if (res.ok) {
            await cache.put(request, res.clone());
            trimCache(IMG_CACHE, MAX_IMAGES);
          }
          return res;
        } catch {
          return Response.error();
        }
      })()
    );
    return;
  }

  // API קריא-בלבד (feed / sitemap) — network-first + fallback
  if (CACHEABLE_API.some((re) => re.test(url.pathname))) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }
});

// ─── Web Push ───────────────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Likelink", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Likelink";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.webp",
    badge: "/icons/icon-96.webp",
    dir: "rtl",
    lang: "he",
    tag: data.tag || "likelink",
    renotify: Boolean(data.renotify),
    vibrate: [80, 40, 80],
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        if ("focus" in client) {
          client.postMessage({ type: "OPEN_URL", url: target });
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })()
  );
});

