// HBA service worker — app-shell cache for offline resilience on flaky LTE.
// Network-first for navigations (always show fresh data when online), cache-first
// for hashed static assets (immutable). API + auth routes are bypassed entirely.

const CACHE = "hba-shell-v2";
const PRECACHE = ["/icon.svg", "/icon-maskable.svg", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(
        PRECACHE.map((url) =>
          c.add(url).catch(() => null),
        ),
      ),
    ),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// Web Push receiver — payload is a JSON {title, body, url, tag}.
self.addEventListener("push", (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    data = { title: "HBA", body: e.data ? e.data.text() : "" };
  }
  const title = data.title || "Hong Badminton Academy";
  const opts = {
    body: data.body || "",
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: data.tag || "hba",
    data: { url: data.url || "/" },
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if (c.url.includes(target)) {
          await c.focus();
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API + auth + webhooks + worker endpoints.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/auth/")
  ) {
    return;
  }

  // Page navigations: network-ONLY, never cached. Caching HTML navigations
  // stored role/auth-specific redirects (e.g. "/" → /parent) and served stale
  // login pages — the cause of "opens to parent-login" and a missing staff
  // link. Auth + data are dynamic, so offline shows a notice, not a stale page.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(
        () =>
          new Response(
            "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><body style='font-family:system-ui;padding:2rem;text-align:center;color:#475569'><h1 style='color:#16a34a;margin:0 0 .5rem'>HBA</h1><p>You're offline. Reconnect and try again.</p></body>",
            { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
          ),
      ),
    );
    return;
  }

  // Static assets: cache-first.
  if (
    url.pathname.startsWith("/_next/static/") ||
    /\.(png|jpg|jpeg|svg|ico|webp|gif|woff2?|ttf|otf|css|js)$/i.test(url.pathname)
  ) {
    e.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => null);
          }
          return res;
        } catch {
          return new Response("", { status: 504 });
        }
      })(),
    );
  }
});
