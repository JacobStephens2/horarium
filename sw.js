var CACHE_NAME = 'horarium-v6';
var ASSETS = [
  './',
  './index.html',
  './style.css',
  './device-rows.js',
  './calendar.js',
  './disciplines.js',
  './account-row-merge.js',
  './app.js',
  './manifest.json',
  './favicon_io/favicon.ico',
  './favicon_io/favicon-32x32.png',
  './favicon_io/favicon-16x16.png',
  './favicon_io/apple-touch-icon.png',
  './favicon_io/android-chrome-192x192.png',
  './favicon_io/android-chrome-512x512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  if (url.pathname.indexOf('/api/') !== -1) {
    return;
  }

  event.respondWith(
    fetch(event.request).then(function (response) {
      var clone = response.clone();
      caches.open(CACHE_NAME).then(function (cache) {
        cache.put(event.request, clone);
      });
      return response;
    }).catch(function () {
      return caches.match(event.request);
    })
  );
});
