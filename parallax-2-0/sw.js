/* Parallax 2.0: offline support. The page and everything it needs are saved on first visit. */
const CACHE = 'high-noon-5ba7f5d174';
const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/icon.svg",
  "./fonts/fonts.css",
  "./fonts/big-shoulders-display-latin-ext-700-normal.woff2",
  "./fonts/big-shoulders-display-latin-700-normal.woff2",
  "./fonts/big-shoulders-display-latin-ext-900-normal.woff2",
  "./fonts/big-shoulders-display-latin-900-normal.woff2",
  "./fonts/barlow-latin-ext-400-normal.woff2",
  "./fonts/barlow-latin-400-normal.woff2",
  "./fonts/barlow-latin-ext-500-normal.woff2",
  "./fonts/barlow-latin-500-normal.woff2",
  "./fonts/barlow-latin-ext-600-normal.woff2",
  "./fonts/barlow-latin-600-normal.woff2"
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('high-noon-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Give the network a few seconds, then fall back to the saved copy.
function fresh(request, ms) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () { reject(new Error('slow')); }, ms);
    fetch(request).then(function (res) { clearTimeout(timer); resolve(res); }, function (err) { clearTimeout(timer); reject(err); });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) { return; }
  if (req.mode === 'navigate') {
    // The page itself: newest copy when online, saved copy when not.
    event.respondWith(fresh(req, 4000).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put('./index.html', copy); }); }
      return res;
    }).catch(function () {
      return caches.match('./index.html').then(function (hit) { return hit || caches.match('./'); });
    }));
    return;
  }
  if (req.url.indexOf('manifest.webmanifest') !== -1) {
    // The app's own settings: always ask the network first, so a change reaches copies that are already installed.
    event.respondWith(fetch(req.url, { cache: 'no-cache' }).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req.url, copy); }); }
      return res;
    }).catch(function () { return caches.match(req.url); }));
    return;
  }
  // Fonts and icons: saved copy first, then the network.
  event.respondWith(caches.match(req).then(function (hit) {
    return hit || fetch(req).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    });
  }));
});
