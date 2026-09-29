const CACHE_NAME = 'seclusaweather-v0.6.4';
const VERSION = 'v0.6.4';
const ASSET_VER = '0.6.4';
const STATIC_ASSETS = [
  './',
  './index.html',
  './offline.html',
  `./css/style.css?v=${ASSET_VER}`,
  `./css/responsive.css?v=${ASSET_VER}`,
  `./js/config.js?v=${ASSET_VER}`,
  `./js/utils.js?v=${ASSET_VER}`,
  `./js/icons.js?v=${ASSET_VER}`,
  `./js/api.js?v=${ASSET_VER}`,
  `./js/ui.js?v=${ASSET_VER}`,
  `./js/app.js?v=${ASSET_VER}`,
  `./js/offline.js?v=${ASSET_VER}`,
  './manifest.json',
  './assets/icons/icon-192.svg',
  './assets/icons/icon-512.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-192.png',
  './assets/icons/icon-maskable-512.png',
  './assets/fonts/dm-sans-latin-400-normal.woff2',
  './assets/fonts/dm-sans-latin-600-normal.woff2',
  './assets/fonts/dm-sans-latin-700-normal.woff2',
  './assets/fonts/sora-latin-600-normal.woff2',
  './assets/fonts/sora-latin-700-normal.woff2',
  './assets/fonts/sora-latin-800-normal.woff2'
];

const OPEN_METEO_ORIGINS = new Set([
  'https://api.open-meteo.com',
  'https://air-quality-api.open-meteo.com',
  'https://geocoding-api.open-meteo.com',
]);

function isOpenMeteoRequest(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && OPEN_METEO_ORIGINS.has(u.origin);
  } catch {
    return false;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const results = await Promise.allSettled(STATIC_ASSETS.map((url) => cache.add(url)));
      const core = ['./index.html', `./js/app.js?v=${ASSET_VER}`, `./css/style.css?v=${ASSET_VER}`];
      const failedCore = results.some((r, i) => r.status === 'rejected' && core.includes(STATIC_ASSETS[i]));
      if (failedCore) throw new Error('core precache failed');
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          // Drop legacy SW API cache too — offline forecasts live in localStorage.
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => {
      self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = request.url;

  // Never intercept Open-Meteo. Re-fetching inside the SW is subject to the
  // SW script's CSP and was synthesizing fake offline API responses on the
  // hosted site, which broke search and refresh.
  if (isOpenMeteoRequest(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            try {
              const u = new URL(request.url);
              if (u.origin === self.location.origin && !u.search && !u.hash) {
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
              }
            } catch { /* ignore bad URLs */ }
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match('./offline.html')).catch(() => null)
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request).then((response) => {
        if (response && response.status === 200 && request.url.startsWith(self.location.origin)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
        }
        return response;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
