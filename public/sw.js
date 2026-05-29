// TECNO POS: service worker dinonaktifkan untuk mencegah cache file lama.
self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => { event.waitUntil(self.registration.unregister()); });
