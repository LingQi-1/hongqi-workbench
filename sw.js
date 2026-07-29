const CACHE = 'wohongqi-v1';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/db.js',
  './js/sync.js',
  './js/cars.js',
  './js/fuel.js',
  './js/price.js',
  './js/news.js',
  './js/app.js',
  './manifest.webmanifest',
  './icon.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request)
        .then((resp) => {
          const cp = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, cp));
          return resp;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
