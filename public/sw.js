// Tiny service worker for "Add to home screen". It caches nothing but a friendly offline page: pages and data always come from the
// network, so nobody ever sees stale cards or scores. If a page can't be reached, the offline page is shown instead of a browser error.
const CACHE = 'tcg-offline-v1';
const OFFLINE_URL = '/offline';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll([OFFLINE_URL, '/icons/icon-192.png'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || /^\/(admin|api|auth)(\/|$)/.test(url.pathname)) return;
  event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL).then(r => r || Response.error())));
});
