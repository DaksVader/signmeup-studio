const cacheName = 'v1';
const cacheAssets = [
  'index.html',
  'style.css',
  'main.js',
  'manifest.json'
];

// Call Install Event
self.addEventListener('install', (e) => {
  console.log('Service Worker: Installed');
  e.waitUntil(
    caches.open(cacheName).then((cache) => {
      console.log('Service Worker: Caching Files');
      cache.addAll(cacheAssets);
    }).then(() => self.skipWaiting())
  );
});

// Call Activate Event
self.addEventListener('activate', (e) => {
  console.log('Service Worker: Activated');
});

// Call Fetch Event (This makes it work offline!)
self.addEventListener('fetch', (e) => {
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});