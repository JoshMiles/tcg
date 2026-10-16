// Tiny service worker for "Add to home screen". It caches nothing but a friendly offline page: pages and data always come from the
// network, so nobody ever sees stale cards or scores. If a page can't be reached, the offline page is shown instead of a browser error.
const CACHE = 'tcg-offline-v2';
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

// Push alerts (Settings, Notifications). The payload is { title, body, url, tag }; a tag makes a newer alert for the same trade replace the older one.
self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data ? event.data.text() : '' }; }
  const title = d.title || 'The Cheesy TCG';
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, {
      body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url: d.url || '/' },
    }),
    self.navigator && self.navigator.setAppBadge ? self.navigator.setAppBadge().catch(() => {}) : Promise.resolve(),
  ]));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || '/';
  const target = new URL(raw, self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if (new URL(c.url).origin === self.location.origin && 'focus' in c) {
        return c.focus().then(f => ('navigate' in f ? f.navigate(target.href) : undefined)).catch(() => self.clients.openWindow(target.href));
      }
    }
    return self.clients.openWindow(target.href);
  }));
});
