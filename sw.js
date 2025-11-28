// sw.js

// Basic service worker for push + notifications
self.addEventListener('install', (event) => {
  console.log('[SW] install');
  // Activate straight away
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] activate');
  event.waitUntil(self.clients.claim());
});

// Handle incoming push messages
self.addEventListener('push', (event) => {
  console.log('[SW] push event', event);
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'Hydrate', body: event.data ? event.data.text() : 'Time to drink water' };
  }

  const title = payload.title || 'Hydrate — Drink Water';
  const options = {
    body: payload.body || 'Time to drink water 💧',
    icon: payload.icon || './icon.png',
    badge: payload.badge || './badge.png',
    data: payload.data || { url: payload.url || '/' },
    renotify: true
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Click on notification: focus or open app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(urlToOpen);
    })
  );
});