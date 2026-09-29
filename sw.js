/* Service worker — offline access for the QA reference.
 * The cache version and the precache list below are placeholders that build.js fills in
 * (content hash + file list), so every content change produces a new cache and old
 * caches are deleted on activate. Do not write the placeholder tokens anywhere else. */
const CACHE = 'qa-ref-52de64204f';
const PRECACHE = [
  "./",
  "./index.html",
  "./s01.html",
  "./s02.html",
  "./s03.html",
  "./s04.html",
  "./s05.html",
  "./s06.html",
  "./s07.html",
  "./s08.html",
  "./s09.html",
  "./s10.html",
  "./s11.html",
  "./s12.html",
  "./s13.html",
  "./s14.html",
  "./s15.html",
  "./s16.html",
  "./s17.html",
  "./s18.html",
  "./s19.html",
  "./s20.html",
  "./s21.html",
  "./s22.html",
  "./s23.html",
  "./s24.html",
  "./s25.html",
  "./s26.html",
  "./s27.html",
  "./s28.html",
  "./style.css",
  "./script.js",
  "./search-index.json",
  "./manifest.json",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];
const NETWORK_TIMEOUT_MS = 4000;   // on a slow/"lie-fi" connection fall back to the cached copy

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('qa-ref-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first (so a fresh deploy is picked up whenever online), cache as fallback.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(handle(req));
});

async function handle(req) {
  const cached = await caches.match(req, { ignoreSearch: true });
  const network = fetch(req, { cache: 'no-cache' }).then(res => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
    }
    return res;
  });
  if (!cached) {
    return network.catch(async () =>
      (req.mode === 'navigate' && await caches.match('index.html')) || Response.error());
  }
  return Promise.race([
    network,
    new Promise(resolve => setTimeout(() => resolve(cached), NETWORK_TIMEOUT_MS)),
  ]).catch(() => cached);
}
