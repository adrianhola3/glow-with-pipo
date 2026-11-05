const CACHE_NAME = 'glow-with-pipo-runtime-v2';

self.addEventListener('install', (event) => {
  const scopeUrl = new URL('./', self.registration.scope).pathname;
  const preCache = [
    scopeUrl,
    `${scopeUrl}index.html`,
    `${scopeUrl}manifest.webmanifest`,
    `${scopeUrl}icon-192.png`,
    `${scopeUrl}icon-512.png`
  ];
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(preCache)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Never intercept cross-origin API calls (Supabase REST/Auth/Realtime) or version checks
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  // Network-first strategy so phones always get fresh deployments immediately when online
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') {
            const scopeUrl = new URL('./index.html', self.registration.scope).pathname;
            return caches.match(scopeUrl);
          }
          return undefined;
        })
      )
  );
});
