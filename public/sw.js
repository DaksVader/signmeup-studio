const cacheName = 'v2'; // Increment version to force update
const cacheAssets = [
  '/',
  'index.html',
  'manifest.json',
  '/icons/SignLogo.png',
  // MediaPipe core script
  'https://cdn.jsdelivr.net/npm/@mediapipe/holistic/holistic.js',
];

// Call Install Event
self.addEventListener('install', (e) => {
  console.log('SignSpeak SW: Installed');
  e.waitUntil(
    caches.open(cacheName).then((cache) => {
      console.log('SignSpeak SW: Caching Files');
      return cache.addAll(cacheAssets);
    }).then(() => self.skipWaiting())
  );
});

// Call Activate Event
self.addEventListener('activate', (e) => {
  console.log('SignSpeak SW: Activated');
  // Clean up old caches
  e.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== cacheName) {
            console.log('SignSpeak SW: Clearing Old Cache');
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// Call Fetch Event (Offline Support)
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).then((networkResponse) => {
        // Optional: Cache new requests on the fly
        return networkResponse;
      });
    }).catch(() => caches.match('index.html'))
  );
});