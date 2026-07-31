const CACHE = 'wohongqi-v21';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/db.js',
  './js/sync.js',
  './js/cars.js',
  './js/fuel.js',
  './js/price.js',
  './js/report.js',
  './js/maintenance.js',
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
  // 网络优先 + 强制 no-cache：每次都向服务器验证，确保手机端拿到最新文件（绕过 HTTP/CDN 强缓存）；
  // 内容未变时服务器返回 304，自动回退到本地缓存（不会重复下载大文件）；离线时回退 SW 缓存
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((resp) => {
        if (resp && resp.status === 200) {
          const cp = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, cp));
        } else if (resp && resp.status === 304) {
          return caches.match(e.request).then((c) => c || resp);
        }
        return resp;
      })
      .catch(() => caches.match(e.request).then((c) => c || caches.match('./index.html')))
  );
});

// 收到页面 SKIP_WAITING 消息立即激活新版本
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
