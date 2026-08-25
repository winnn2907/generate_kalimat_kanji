const CACHE_NAME = 'yomikata-irodori-v2';
const CORE_ASSETS = [
  './index.html',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Halaman utama (navigasi) & index.html: NETWORK-FIRST, supaya update baru selalu
// langsung kepakai begitu online, dan cache cuma jadi cadangan saat offline.
// Panggilan ke /api/ atau /.netlify/functions/: selalu network, tidak pernah di-cache
// (data hasil generate/grading harus selalu segar).
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isNavigation = event.request.mode === 'navigate' || url.pathname.endsWith('index.html') || url.pathname === '/';
  const isFunctionCall = url.pathname.startsWith('/.netlify/functions/') || url.pathname.startsWith('/api/');

  if (isFunctionCall) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (isNavigation) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Asset lain: cache-first seperti biasa
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        }).catch(() => cached)
      );
    })
  );
});
