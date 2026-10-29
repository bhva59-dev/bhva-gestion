/* BHVA : service worker minimal — nécessaire pour que l'application apparaisse dans Réglages iOS → Notifications. Aucune mise en cache (toujours la dernière version). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => { if (list.length) return list[0].focus(); return self.clients.openWindow('./'); }));
});
