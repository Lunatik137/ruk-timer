const CACHE_PREFIX = "ruktimer-pwa-";
const CACHE_NAME = `${CACHE_PREFIX}v2`;
const APP_SHELL = "/";
const MANIFEST = "/manifest.webmanifest";
const PUBLIC_ASSETS = [MANIFEST, "/icon", "/apple-icon"];

function isStaticAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith("/_next/static/");
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll([APP_SHELL, MANIFEST]);
    const shell = await cache.match(APP_SHELL);
    const html = await shell.text();
    // The first page can load before this worker takes control.
    const assets = new Set();
    for (const [, href] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const url = new URL(href, self.location.origin);
      if (isStaticAsset(url)) assets.add(url.href);
    }
    await cache.addAll([...assets]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function fetchAndCache(event, cache, key) {
  const response = await fetch(event.request);
  const policy = response.headers.get("Cache-Control") ?? "";
  if (response.status === 200 && !response.redirected && !/\b(private|no-store)\b/i.test(policy)) {
    // Let the page consume the response while the worker stores its copy.
    event.waitUntil(cache.put(key, response.clone()).catch(() => {}));
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const homeNavigation = request.mode === "navigate" && url.pathname === APP_SHELL;
  const staticAsset = isStaticAsset(url);
  const publicAsset = PUBLIC_ASSETS.includes(url.pathname);
  if (!homeNavigation && !staticAsset && !publicAsset) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME).catch(() => null);
    if (!cache) return fetch(request);
    if (staticAsset) {
      const cachedAsset = await cache.match(request);
      if (cachedAsset) return cachedAsset;
    }
    try {
      return await fetchAndCache(event, cache, homeNavigation ? APP_SHELL : request);
    } catch {
      return await cache.match(homeNavigation ? APP_SHELL : request) ?? Response.error();
    }
  })());
});
