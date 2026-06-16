// sw.js — Service Worker (PWA offline desteği)
// Strateji: statik dosyalar cache-first, API çağrıları her zaman ağdan (network-only).

const CACHE_ADI = 'liman-pwa-v1';
const STATIK_DOSYALAR = [
  './',
  './index.html',
  './stil.css',
  './uygulama.js',
  './manifest.json',
  './ikon-192.png',
  './ikon-512.png',
  './apple-touch-icon.png',
];

// Kurulum: statik dosyaları önbelleğe al
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_ADI).then((cache) => cache.addAll(STATIK_DOSYALAR)).then(() => self.skipWaiting())
  );
});

// Etkinleşme: eski sürüm önbelleklerini temizle
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((anahtarlar) =>
      Promise.all(anahtarlar.filter((a) => a !== CACHE_ADI).map((a) => caches.delete(a)))
    ).then(() => self.clients.claim())
  );
});

// İstek yakalama
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // API çağrıları: asla cache'leme, doğrudan ağa git
  if (url.pathname.startsWith('/api/')) {
    return; // varsayılan tarayıcı davranışı (ağ)
  }

  // Yalnızca GET isteklerini cache'le
  if (e.request.method !== 'GET') return;

  // Statik dosyalar: cache-first, yoksa ağdan al ve cache'e ekle
  e.respondWith(
    caches.match(e.request).then((cevap) => {
      if (cevap) return cevap;
      return fetch(e.request).then((agCevabi) => {
        // Geçerli yanıtları cache'e ekle (aynı kaynak)
        if (agCevabi && agCevabi.status === 200 && url.origin === self.location.origin) {
          const kopya = agCevabi.clone();
          caches.open(CACHE_ADI).then((cache) => cache.put(e.request, kopya));
        }
        return agCevabi;
      }).catch(() => {
        // Çevrimdışı ve cache'de yoksa: HTML istekleri için index'e düş
        if (e.request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});
