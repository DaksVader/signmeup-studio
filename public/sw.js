const cacheName = 'SignSpeak-v3'; // Version bump for fresh phone install
const cacheAssets = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/SignLogo.png',
  // MediaPipe core script
  'https://cdn.jsdelivr.net/npm/@mediapipe/holistic/holistic.js',
];

// Install Event: Save core files for offline use
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(cacheName).then((cache) => {
      console.log('SW: Pre-caching core assets');
      return cache.addAll(cacheAssets);
    })
  );
});

// Activate Event: Clear old versions
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== cacheName) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// Fetch Event: The "Phone Offline" logic
self.addEventListener('fetch', (e) => {
  // Handle MediaPipe and Model files specifically
  if (e.request.url.includes('cdn.jsdelivr.net') || e.request.url.includes('/models/')) {
    e.respondWith(
      caches.match(e.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        
        return fetch(e.request).then((networkResponse) => {
          const responseClone = networkResponse.clone();
          caches.open(cacheName).then((cache) => {
            cache.put(e.request, responseClone);
          });
          return networkResponse;
        });
      })
    );
    return;
  }

  // Standard offline fallback for UI
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});