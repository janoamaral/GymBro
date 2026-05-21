const SHELL_CACHE = 'gymbro-shell-v1';
const API_CACHE = 'gymbro-api-v1';

const SHELL_ASSETS = ['/', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== API_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

function isStaticAsset(requestUrl) {
  return requestUrl.pathname.startsWith('/_next/static/') || requestUrl.pathname.startsWith('/icons/');
}

function isCacheableApi(requestUrl) {
  return (
    requestUrl.pathname.startsWith('/api/workouts/by-date/') ||
    requestUrl.pathname.startsWith('/api/workouts/next') ||
    requestUrl.pathname.startsWith('/api/workouts/calendar')
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) {
            return cached;
          }

          const shell = await caches.match('/');
          if (shell) {
            return shell;
          }

          return new Response('Offline', { status: 503, statusText: 'Offline' });
        })
    );
    return;
  }

  if (request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (isStaticAsset(requestUrl)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }

        return fetch(request).then((response) => {
          const copy = response.clone();
          void caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          return response;
        });
      })
    );
    return;
  }

  if (isCacheableApi(requestUrl)) {
    event.respondWith(
      caches.open(API_CACHE).then(async (cache) => {
        const cached = await cache.match(request);

        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              void cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cached);

        return cached ?? network;
      })
    );
    return;
  }
});
