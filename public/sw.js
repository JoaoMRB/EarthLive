/*
 * EarthLive service worker.
 *
 * - App shell (page + hashed JS/CSS): opens instantly and works offline.
 * - Data snapshots (data/*.json, weather.png): network first, last copy offline.
 * - Basemap (OpenFreeMap style, fonts, sprites, tiles): stale-while-revalidate,
 *   capped, so places already visited still show a map without network.
 * - Everything else (live APIs, satellite imagery) goes straight to the network.
 *
 * Nothing here leaves the visitor's device.
 */
const VERSION = 'v1';
const SHELL = `earthlive-shell-${VERSION}`;
const DATA = `earthlive-data-${VERSION}`;
const MAP = `earthlive-map-${VERSION}`;
const KEEP = [SHELL, DATA, MAP];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(['./', './manifest.webmanifest', './favicon.svg', './icons/icon-192.png'])),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('earthlive-') && !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, SHELL, './'));
  } else if (sameOrigin && url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(req, SHELL, 80));
  } else if (sameOrigin && url.pathname.includes('/data/')) {
    event.respondWith(networkFirst(req, DATA));
  } else if (sameOrigin) {
    event.respondWith(cacheFirst(req, SHELL, 80));
  } else if (url.hostname === 'tiles.openfreemap.org') {
    event.respondWith(staleWhileRevalidate(req, MAP, 600));
  }
  // Live APIs and imagery: default network behaviour.
});

async function networkFirst(req, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(stripQuery(req), res.clone());
    return res;
  } catch (err) {
    const hit = (await cache.match(stripQuery(req))) || (fallbackUrl && (await cache.match(fallbackUrl)));
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req, cacheName, max) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    trim(cache, max);
  }
  return res;
}

async function staleWhileRevalidate(req, cacheName, max) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const update = fetch(req)
    .then((res) => {
      if (res.ok) {
        cache.put(req, res.clone()).then(() => trim(cache, max));
      }
      return res;
    })
    .catch(() => hit);
  return hit || update;
}

/** Data files carry a cache-busting ?v= — store them under one key. */
function stripQuery(req) {
  const u = new URL(req.url);
  if (u.pathname.includes('/data/')) u.search = '';
  return u.pathname.includes('/data/') ? new Request(u.toString()) : req;
}

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}
