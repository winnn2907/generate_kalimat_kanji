const CACHE_NAME = 'yomikata-irodori-v4';
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

// Panggilan ke domain lain (Gemini API dsb): selalu network langsung, TIDAK PERNAH
// di-cache oleh service worker ini — hanya asset app sendiri (index.html, dst) yang
// pakai strategi stale-while-revalidate di bawah.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isCrossOrigin = url.origin !== self.location.origin;

  if (isCrossOrigin) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => null);

      if (cached) {
        networkFetch; // update cache di belakang layar untuk kunjungan berikutnya
        return cached;
      }
      const fresh = await networkFetch;
      return fresh || new Response('Offline dan belum ada versi tersimpan.', { status: 503 });
    })
  );
});
