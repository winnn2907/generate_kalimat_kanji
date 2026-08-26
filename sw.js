const CACHE_NAME = 'yomikata-irodori-v3';
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

// Panggilan ke backend: selalu network, tidak pernah di-cache (data harus segar)
// Halaman utama & asset lain: STALE-WHILE-REVALIDATE — tampilkan versi tersimpan
// dulu (instan, hemat bandwidth/kredit Netlify), sambil diam-diam ambil versi
// terbaru di belakang layar untuk dipakai di kunjungan BERIKUTNYA.
// Konsekuensi: setelah ada update baru, biasanya perlu buka app 2x untuk lihat
// perubahannya (bukan buka 1x langsung update) — trade-off yang wajar untuk
// menghemat bandwidth pada pemakaian sehari-hari yang jauh lebih sering
// dibanding momen update.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isFunctionCall = url.pathname.startsWith('/.netlify/functions/') || url.pathname.startsWith('/api/');

  if (isFunctionCall) {
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
        // Update cache di belakang layar, tapi langsung jawab pakai versi tersimpan
        networkFetch;
        return cached;
      }
      // Belum ada cache sama sekali (pertama kali buka) -> wajib tunggu network
      const fresh = await networkFetch;
      return fresh || new Response('Offline dan belum ada versi tersimpan.', { status: 503 });
    })
  );
});
