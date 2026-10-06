/* ALT 327K 2.0: offline support. The page and everything it needs are saved on first visit. */
const CACHE = 'thin-air-a7af6ae4fa';
const PICS = 'pics-thin-air';
const SHEETS = ["e-00.62d90cc8.webp", "e-01.7941582b.webp", "e-02.3677e4e2.webp", "e-03.86908fff.webp", "e-04.81e7b1ad.webp", "e-05.935fee24.webp", "e-06.62464c2e.webp", "e-07.2a28ee9f.webp", "e-08.d2632eac.webp", "e-09.7a1ea21e.webp", "e-10.195acc4e.webp", "e-11.c4bc0d62.webp", "e-12.63e1f4b3.webp", "e-13.f0f65e98.webp", "e-14.44713830.webp", "e-15.ab5ff732.webp", "e-16.b737e106.webp", "e-17.b0120e80.webp", "g-00.b7cad3ea.webp", "g-01.7a5fc4f4.webp", "g-02.e780883a.webp", "g-03.dff602ad.webp", "g-04.11269487.webp", "g-05.bc00c329.webp", "g-06.0404b325.webp", "g-07.13702078.webp", "g-08.186843d5.webp", "g-09.8c69a22c.webp", "g-10.92f59298.webp", "g-11.9ef49295.webp", "g-12.78caaf33.webp", "g-13.2a3daff9.webp", "g-14.7ab29698.webp", "g-15.328bdcab.webp", "g-16.4c43f464.webp"];
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
  "./fonts/barlow-latin-600-normal.woff2",
  "./fonts/barlow-latin-ext-700-normal.woff2",
  "./fonts/barlow-latin-700-normal.woff2"
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('thin-air-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () {
    // Forget picture sheets that this version no longer uses.
    return caches.open(PICS).then(function (c) {
      return c.keys().then(function (reqs) {
        return Promise.all(reqs.filter(function (r) { return SHEETS.indexOf(new URL(r.url).pathname.split('/').pop()) < 0; }).map(function (r) { return c.delete(r); }));
      });
    });
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
  if (new URL(req.url).pathname.indexOf('/pics/') !== -1) {
    // Picture sheets: saved copy first, then the network. Their names change whenever a picture does.
    event.respondWith(caches.open(PICS).then(function (c) {
      return c.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          if (res && res.ok) { c.put(req, res.clone()); }
          return res;
        });
      });
    }));
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
