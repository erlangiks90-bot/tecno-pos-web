// TECNO POS: service worker dinonaktifkan agar APK/WebView/browser tidak memakai file lama.
self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', event => {
  // Selalu ambil dari network. Tidak ada cache HTML/JS lama.
  return;
});
