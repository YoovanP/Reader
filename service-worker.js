const CACHE_NAME = 'readrot-v12';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/readrot-192.png',
  './icons/readrot-512.png',
  './icons/readrot.svg',
  './src/main.js',
  './src/ai/keys.js',
  './src/ai/slopify.js',
  './src/modes/bionic.js',
  './src/modes/classic.js',
  './src/modes/rot.js',
  './src/modes/rsvp.js',
  './src/parser/epub.js',
  './src/parser/pdf.js',
  './src/parser/text.js',
  './src/sources/manager.js',
  './src/sources/providers.js',
  './src/ui/settings.js',
  './src/utils/storage.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put('./index.html', copy);
          });
          return response;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, copy);
        });
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
