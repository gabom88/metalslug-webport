const CACHE = 'mslug-web-25';
const ASSETS = [
  './', './index.html', './style.css', './app.mjs', './saves.mjs', './state-build.json', './touch.css', './touch.js', './dpad-gemuboy.js', './metalslug.js', './metalslug.wasm', './game-data.mjs', './metalslug-parts.json', './metalslug-part1.data', './metalslug-part2.data',
  './manifest.webmanifest', './keyboard.mjs', './character.png', './logo.png', './pwa-180.png', './pwa-192.png', './pwa-512.png', './pwa-maskable.png',
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('mslug-web-') && key !== CACHE).map((key) => caches.delete(key)),
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !ASSETS.some((url) => new URL(url, self.registration.scope).href === event.request.url)) return;
  event.respondWith(caches.open(CACHE).then(async (cache) => (await cache.match(event.request)) || fetch(event.request)));
});
