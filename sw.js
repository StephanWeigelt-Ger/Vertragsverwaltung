// Service Worker: App offline verfügbar machen. Daten (Dropbox, API) werden nie gecacht.
const VERSION = 'vv-5';
const DATEIEN = ['./', 'index.html', 'app.css', 'manifest.webmanifest', 'icons/icon-192.png',
  'js/app.js', 'js/calc.js', 'js/lock.js', 'js/store.js', 'js/dropbox.js', 'js/config.js', 'js/felder.js',
  'js/berichte.js', 'js/export.js', 'js/analyse.js', 'js/demo.js', 'js/suche.js', 'js/nachtraege.js', 'js/hinweise.js',
  'vendor/jspdf.umd.min.js', 'vendor/jspdf.plugin.autotable.min.js', 'vendor/xlsx.full.min.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const eigen = url.origin === location.origin;
  if (!eigen) return;
  // Netzwerk zuerst (immer aktuell), bei Offline aus dem Cache
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const k = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, k)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: eigen })));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => {
    if (cs[0]) { cs[0].focus(); cs[0].postMessage({ url: e.notification.data?.url }); }
    else self.clients.openWindow('./' + (e.notification.data?.url || ''));
  }));
});
