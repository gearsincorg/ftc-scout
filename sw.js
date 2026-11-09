// Offline cache for the app shell. Bump VERSION whenever any file below changes,
// so installed devices pick up the update (they get it on the next online launch).
const VERSION = 'ftc-scout-v6';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/ui.js', 'js/db.js', 'js/qr.js', 'js/schedule.js', 'js/records.js',
  'js/scout.js', 'js/hub.js', 'js/reset.js', 'js/config/biobuzz-2026.js',
  'vendor/qrcode.js', 'vendor/jsQR.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Cache first for our own files; everything else (FTCScout API) goes to the network.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});
