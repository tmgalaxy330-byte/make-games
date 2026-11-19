// ミスターポストマン：オフラインで遊べるようにするしくみ（Service Worker）
// ゲームのファイルを最初にまとめて保存し、次からは保存したものを使う。
// ファイルを更新したら VERSION を上げる（古い保存は自動で消える）。
const VERSION = 'mp-v1';
const FILES = [
  './', 'index.html', 'style.css', 'sprites.js', 'audio.js', 'main.js',
  'manifest.webmanifest', 'fonts/DotGothic16-subset.woff2',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 保存したものを先に使い、ネットにつながっていれば裏で新しいものに入れかえる
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.open(VERSION).then(async cache => {
      const hit = await cache.match(e.request, { ignoreSearch: true });
      const net = fetch(e.request).then(res => {
        if (res && res.ok && new URL(e.request.url).origin === location.origin) cache.put(e.request, res.clone());
        return res;
      }).catch(() => null);
      if (hit) { e.waitUntil(net); return hit; }
      const res = await net;
      return res || (await cache.match('index.html')) || new Response('offline', { status: 503 });
    })
  );
});
