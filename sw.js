const CACHE = 'twilight-v122';
const ASSETS = [
  '/',
  '/index.html',
  '/privacy.html',
  '/manifest.json',
  '/favicon-64.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-512-maskable.png',
  '/apple-touch-icon.png',
  '/og-image.png',
  '/screenshot-narrow.png',
  '/screenshot-wide.png',
  '/bortle-cities.bin',
  '/stars.bin',
  '/constellations.bin',
  '/constellation-names.json',
  '/deep-sky.json',
  '/milkyway.bin',
  '/facts.json',
  '/fonts/inter-latin.woff2',
  '/fonts/cormorant.woff2',
  '/fonts/cormorant-i.woff2'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const req = event.request;
  // Only this site's own files. Other origins (the Open-Meteo forecast and
  // geocoder, the visit counter) go straight to the network: served from
  // this cache first, as stale-while-revalidate does, every forecast shown
  // was the one fetched the time before, often hours old, and the visit
  // count lagged a day. The app keeps its own forecast copy for offline use.
  if (new URL(req.url).origin !== self.location.origin) return;
  const isDoc = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  // Navigations / HTML: network-first so a fresh deploy is picked up
  // immediately when online, falling back to cache when offline.
  if (isDoc) {
    event.respondWith(
      fetch(req).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(req, clone));
        }
        return response;
      }).catch(() => caches.match(req).then(c => c || caches.match('/index.html')))
    );
    return;
  }

  // Other assets: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(req, clone));
        }
        return response;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
