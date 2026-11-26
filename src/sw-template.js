/* Service Worker des Kassenbuchs. Wird beim Build erzeugt (siehe vite.config.ts).
 * Hält die App-Dateien im Gerät, damit sie ohne Netz startet.
 * Berührt nie die Buchungen: die liegen in IndexedDB. */
const VERSION = '__VERSION__';
const CACHE = `kassenbuch-${VERSION}`;
const ASSETS = __ASSETS__;
const ENTRY = '__ENTRY__';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        // Immer frisch vom Server holen, nie aus dem Zwischenspeicher des Browsers.
        // Sonst könnte eine alte Seite mit neuen Dateien gemischt werden.
        await Promise.all(
          ASSETS.map(async (url) => {
            const res = await fetch(url, { cache: 'reload' });
            if (!res.ok) throw new Error(`${url}: ${res.status}`);
            await cache.put(url, res);
          }),
        );
        // Passt die Seite zu den Dateien dieser Version? Sonst abbrechen: die alte Version bleibt.
        const page = await cache.match('./index.html');
        if (!page || !(await page.text()).includes(ENTRY)) throw new Error('index.html passt nicht zu dieser Version');
      } catch (e) {
        await caches.delete(CACHE);
        throw e;
      }
      // Kein sofortiges Übernehmen: eine Seite, die gerade lädt, würde sonst ihre
      // Dateien verlieren. Die neue Version wartet, bis man «Laden» tippt oder die App schliesst.
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Die vorherige Version bleibt erhalten: eine Seite, die gerade noch mit ihr
      // lädt, findet ihre Dateien weiterhin. Ältere Versionen werden gelöscht.
      const meta = await caches.open('kassenbuch-meta');
      const saved = await meta.match('./versions');
      const versions = saved ? await saved.json() : [];
      const keep = [...versions.filter((v) => v !== CACHE).slice(-1), CACHE];
      await meta.put('./versions', new Response(JSON.stringify(keep)));
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith('kassenbuch-') && k !== 'kassenbuch-meta' && !keep.includes(k)).map((k) => caches.delete(k)),
      );
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
      // Zuerst diese Version, dann die vorherige, erst dann das Netz
      return (await cache.match(req, { ignoreSearch: true, ignoreVary: true })) ?? (await caches.match(req, { ignoreSearch: true, ignoreVary: true })) ?? fetch(req);
    })(),
  );
});
