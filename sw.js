// sw.js - service worker for Hydrate
// Minimal reliable push handler showing notifications.

self.addEventListener('install', (evt) => {
  self.skipWaiting(); // activate immediately
});

self.addEventListener('activate', (evt) => {
  clients.claim();
});

// Listen for push events
self.addEventListener('push', (event) => {
  // Try to parse JSON payload if present
  let data = {};
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    // if not JSON, try text
    try { data = { body: event.data.text() }; } catch(e) { data = {}; }
  }

  // Defaults
  const title = data.title || 'Hydrate Reminder';
  const body = data.body || 'Time to drink water 💧';
  const url = data.url || '/';
  const tag = data.tag || 'hydrate-reminder';
  const icon = data.icon || '/icon-192.png';
  const badge = data.badge || '/icon-192.png';

  // Notification options
  const options = {
    body,
    icon,
    badge,
    tag,
    data: { url },
    renotify: false
    // Note: custom sound is not supported in standard web notifications.
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle clicks on notifications
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window/tab is already open, focus it
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      // otherwise open a new one
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});