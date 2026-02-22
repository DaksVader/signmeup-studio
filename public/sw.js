const cacheName = 'SignSpeak-v3';
const cacheAssets = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/SignLogo.png',
  'https://cdn.jsdelivr.net/npm/@mediapipe/holistic/holistic.js',
  'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js', // Added this
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(cacheName).then((cache) => cache.addAll(cacheAssets))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => cache !== cacheName ? caches.delete(cache) : null)
      );
    })
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('cdn.jsdelivr.net') || e.request.url.includes('/models/')) {
    e.respondWith(
      caches.match(e.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(e.request).then((networkResponse) => {
          const responseClone = networkResponse.clone();
          caches.open(cacheName).then((cache) => cache.put(e.request, responseClone));
          return networkResponse;
        });
      })
    );
    return;
  }
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});