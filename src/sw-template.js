/* Service Worker des Kassenbuchs. Wird beim Build erzeugt (siehe vite.config.ts).
 * Hält die App-Dateien im Gerät, damit sie ohne Netz startet.
 * Berührt nie die Buchungen: die liegen in IndexedDB. */
const VERSION = '__VERSION__';
const CACHE = `kassenbuch-${VERSION}`;
const ASSETS = __ASSETS__;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('kassenbuch-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (req.mode === 'navigate') {
        // App-Seite immer aus dem Gerät: startet auch im Flugmodus
        return (await cache.match('./index.html')) ?? (await cache.match('./')) ?? fetch(req);
      }
      return (await cache.match(req, { ignoreSearch: true })) ?? fetch(req);
    })(),
  );
});
