'use strict';
// dist/sw.js can't run in a browser or jsdom (no ServiceWorkerGlobalScope there), so this test
// builds a minimal mock of that scope — cache storage, fetch, self.addEventListener — and runs
// the REAL built file with Node's vm module. Slow enough to matter: the network-vs-cache race,
// offline fallback, and cache-versioning-on-activate paths all fail silently in production if
// broken (a user just gets a stale or blank page, no error anywhere), so this is worth the setup.
const vm = require('vm');
const { readDist, check, summary, BASE_URL } = require('./helpers');

const src = readDist('sw.js').replace('NETWORK_TIMEOUT_MS = 4000', 'NETWORK_TIMEOUT_MS = 60');

const store = new Map();                       // cacheName -> Map(url -> Response)
const abs = u => new URL(typeof u === 'string' ? u : u.url, BASE_URL).href;
const strip = u => u.split('?')[0];
const net = { mode: 'online', delay: 0, hits: [] };
const listeners = {};
let skipped = false, claimed = false;

const cachesApi = {
  async open(name) {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name);
    return {
      async addAll(urls) { for (const u of urls) m.set(abs(u), new Response('precached:' + abs(u))); },
      async put(req, res) { m.set(abs(req), res); },
    };
  },
  async keys() { return [...store.keys()]; },
  async delete(name) { return store.delete(name); },
  async match(req, opts = {}) {
    const key = abs(req);
    for (const m of store.values()) {
      for (const [u, res] of m) if (opts.ignoreSearch ? strip(u) === strip(key) : u === key) return res.clone();
    }
    return undefined;
  },
};
async function fakeFetch(req) {
  net.hits.push(abs(req));
  if (net.mode === 'offline') throw new TypeError('Failed to fetch');
  if (net.delay) await new Promise(r => setTimeout(r, net.delay));
  return new Response('network:' + abs(req), { status: 200 });
}
const sandbox = {
  self: {
    addEventListener: (t, fn) => { listeners[t] = fn; },
    location: { origin: new URL(BASE_URL).origin },
    skipWaiting: () => { skipped = true; return Promise.resolve(); },
    clients: { claim: () => { claimed = true; return Promise.resolve(); } },
  },
  caches: cachesApi, fetch: fakeFetch, Response, Request, URL, setTimeout, Promise, console,
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

async function fire(type, extra = {}) {
  const waits = [];
  const ev = { waitUntil: p => waits.push(p), respondWith: p => { ev._resp = p; }, ...extra };
  listeners[type](ev);
  await Promise.all(waits);
  return ev;
}
const get = (p, mode = 'cors') => {
  const r = new Request(BASE_URL + p);
  return Object.defineProperty(r, 'mode', { value: mode });
};
const text = async ev => (ev._resp ? (await ev._resp).text() : null);

(async () => {
  store.set('qa-ref-OLD', new Map([[BASE_URL + 's01.html', new Response('old')]]));
  store.set('some-other-app', new Map());

  await fire('install');
  const cur = [...store.keys()].find(k => k.startsWith('qa-ref-') && k !== 'qa-ref-OLD');
  check('install: precaches every URL', store.get(cur).size >= 30, `(${store.get(cur).size} entries)`);
  check('install: precaches start URL + a section page', store.get(cur).has(BASE_URL) && store.get(cur).has(BASE_URL + 's24.html'));
  check('install: skipWaiting called', skipped);

  await fire('activate');
  check('activate: old qa-ref cache deleted', !store.has('qa-ref-OLD'));
  check('activate: foreign cache untouched', store.has('some-other-app'));
  check('activate: clients.claim called', claimed);

  let ev = await fire('fetch', { request: get('s12.html', 'navigate') });
  check('online: serves fresh network copy', (await text(ev)) === 'network:' + BASE_URL + 's12.html');
  await new Promise(r => setTimeout(r, 10));
  const upd = await store.get(cur).get(BASE_URL + 's12.html').clone().text();
  check('online: cache updated with fresh copy', upd === 'network:' + BASE_URL + 's12.html');

  net.mode = 'offline';
  ev = await fire('fetch', { request: get('s12.html', 'navigate') });
  check('offline: serves cached page', (await text(ev)) === 'network:' + BASE_URL + 's12.html');
  ev = await fire('fetch', { request: get('s12.html?x=1', 'navigate') });
  check('offline: ignores query string when matching', (await text(ev)) === 'network:' + BASE_URL + 's12.html');
  ev = await fire('fetch', { request: get('s99.html', 'navigate') });
  check('offline: uncached navigation falls back to index.html', (await text(ev)) === 'precached:' + BASE_URL + 'index.html');
  ev = await fire('fetch', { request: get('nope.png', 'no-cors') });
  const errRes = await ev._resp;
  check('offline: uncached non-navigation gives a network error (not a page)', errRes.type === 'error');

  store.get(cur).set(BASE_URL + 's12.html', new Response('cached-marker'));
  net.mode = 'online'; net.delay = 400;   // slower than the (test-patched) 60ms timeout
  ev = await fire('fetch', { request: get('s12.html', 'navigate') });
  check('slow network: returns CACHED copy after timeout, not the network one', (await text(ev)) === 'cached-marker');
  await new Promise(r => setTimeout(r, 450));
  const refreshed = await store.get(cur).get(BASE_URL + 's12.html').clone().text();
  check('slow network: late network response still refreshes the cache', refreshed === 'network:' + BASE_URL + 's12.html');

  net.delay = 0; net.mode = 'online';
  store.get(cur).set(BASE_URL + 's12.html', new Response('cached-marker'));
  ev = await fire('fetch', { request: get('s12.html', 'navigate') });
  check('fast network: returns NETWORK copy, not the stale cached one', (await text(ev)) === 'network:' + BASE_URL + 's12.html');

  const before = net.hits.length;
  ev = await fire('fetch', { request: new Request(BASE_URL + 's12.html', { method: 'POST' }) });
  check('non-GET ignored (respondWith not called)', ev._resp === undefined);
  ev = await fire('fetch', { request: new Request('https://fonts.googleapis.com/css') });
  check('cross-origin ignored (respondWith not called)', ev._resp === undefined && net.hits.length === before);

  summary();
})();
