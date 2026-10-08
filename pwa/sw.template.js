/* MESSED UP service worker. The build (vite.config.ts) fills in VERSION and PRECACHE and writes dist/sw.js.
 *  - Offline: the game shell and every built asset are cached on install, so Practice works with no network.
 *  - Updates: pages are fetched network-first, so a new deploy is picked up on the next visit.
 *  - Streak reminders: pushes carry no data; the worker asks /api/me what to say. */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = `messed-up-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('messed-up-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/__dev/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && url.pathname === '/') {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put('/', copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('/'))),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && url.pathname.startsWith('/assets/')) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
      }
      return res;
    })),
  );
});

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let title = "Today's Daily Run is waiting";
    let body = 'A new menu is out. Eat it before it eats you.';
    try {
      const res = await fetch('/api/me', { credentials: 'include', cache: 'no-store' });
      const user = (await res.json()).user;
      if (user && !user.today && user.streak.current > 0) {
        title = `Your ${user.streak.current}-day streak ends at midnight!`;
        body = "Play today's Daily Run to keep it alive.";
      } else if (user && user.today) {
        title = 'Streak safe for today';
        body = 'See you tomorrow for a new menu.';
      }
    } catch {
      /* offline: keep the generic text */
    }
    await self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      tag: 'streak-reminder',
      data: { url: '/' },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) if ('focus' in client) return client.focus();
      return self.clients.openWindow('/');
    }),
  );
});
