// TECNO POS: service worker dimatikan agar file kasir tidak cache lama.
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
