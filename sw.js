const CACHE_NAME = 'seclusaweather-v0.6.3';
const API_CACHE = 'seclusaweather-api-v1';
const VERSION = 'v0.6.3';
const ASSET_VER = '0.6.3';
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
          .filter((k) => k !== CACHE_NAME && k !== API_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => pruneApiCache()).then(() => {
      self.clients.claim();
      if (self._pruneTimer) clearInterval(self._pruneTimer);
      self._pruneTimer = setInterval(pruneApiCache, PRUNE_INTERVAL);
    })
  );
});

const API_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const PRUNE_INTERVAL = 6 * 60 * 60 * 1000;
// CORS-filtered responses never expose the `Date` header, so the API cache
// records its own write-time timestamp in a sibling meta entry instead of
// trying to read unreadable response headers.
const API_META_SUFFIX = '&meta=savedAt';
// Forecast + AQ only — never cache geocoding (search terms are privacy-sensitive).
const API_CACHEABLE_ORIGINS = new Set([
  'https://api.open-meteo.com',
  'https://air-quality-api.open-meteo.com',
]);
const GEOCODING_ORIGIN = 'https://geocoding-api.open-meteo.com';

function isApiRequest(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (API_CACHEABLE_ORIGINS.has(u.origin) || u.origin === GEOCODING_ORIGIN);
  } catch {
    return false;
  }
}

function isCacheableApiRequest(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && API_CACHEABLE_ORIGINS.has(u.origin);
  } catch {
    return false;
  }
}

async function pruneApiCache() {
  try {
    const cache = await caches.open(API_CACHE);
    const requests = await cache.keys();
    const now = Date.now();
    const metas = new Set();
    const staleParents = new Set();

    for (const req of requests) {
      // Drop any legacy geocoding cache entries (search history).
      if (req.url.startsWith(GEOCODING_ORIGIN)) {
        await cache.delete(req);
        continue;
      }
      if (!req.url.endsWith(API_META_SUFFIX)) continue;
      metas.add(req.url);
      const resp = await cache.match(req);
      if (!resp) continue;
      const t = Number(await resp.text());
      if (!Number.isFinite(t)) continue;
      if (now - t > API_MAX_AGE) staleParents.add(req.url.slice(0, -API_META_SUFFIX.length));
    }

    const doomed = [];
    for (const req of requests) {
      if (req.url.startsWith(GEOCODING_ORIGIN)) continue;
      if (req.url.endsWith(API_META_SUFFIX)) {
        const parent = req.url.slice(0, -API_META_SUFFIX.length);
        if (staleParents.has(parent)) doomed.push(req);
      } else if (!metas.has(req.url + API_META_SUFFIX) || staleParents.has(req.url)) {
        // Legacy entry from before meta timestamps, or an expired parent.
        doomed.push(req);
      }
    }

    if (doomed.length) await Promise.all(doomed.map((req) => cache.delete(req)));
  } catch (e) {
    /* pruning is best-effort */
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = request.url;

  if (isApiRequest(url)) {
    // Geocoding: network-only (no Cache Storage of search queries).
    if (!isCacheableApiRequest(url)) {
      event.respondWith(
        fetch(request).catch(() =>
          new Response(JSON.stringify({ error: 'offline' }), {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );
      return;
    }
    event.respondWith(
      caches.open(API_CACHE).then((cache) =>
        fetch(request)
          .then((response) => {
            if (response && response.ok) {
              cache.put(request, response.clone())
                .then(() => cache.put(`${url}${API_META_SUFFIX}`, new Response(String(Date.now()))))
                .then(() => pruneApiCache())
                .catch(() => {});
            }
            return response;
          })
          .catch(() =>
            cache.match(request).then((cached) =>
              cached || new Response(JSON.stringify({ error: 'offline' }), {
                status: 503,
                statusText: 'Service Unavailable',
                headers: { 'Content-Type': 'application/json' },
              })
            )
          )
      )
    );
    return;
  }

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
