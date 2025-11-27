/* sw.js - very small service worker for push notifications */
self.addEventListener('push', event => {
  let payload = { title: 'Hydrate', body: 'Time to drink water 💧', url:'/' };
  try { payload = event.data.json(); } catch(e){ /* ignore */ }
  const options = {
    body: payload.body,
    data: { url: payload.url || '/' },
    badge: '/icon-192.png',
    renotify: true,
    tag: 'hydrate-reminder'
    // note: browsers don't allow custom sound in notifications
  };
  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(clients.matchAll({type:'window'}).then(ws => {
    for (let w of ws) if (w.url === url && 'focus' in w) return w.focus();
    if (clients.openWindow) return clients.openWindow(url);
  }));
});