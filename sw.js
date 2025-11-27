// sw.js

self.addEventListener('install', (event) => {
  console.log("SW installed");
});

self.addEventListener('activate', async (event) => {
  console.log("SW activated");

  event.waitUntil((async () => {
    const sub = await self.registration.pushManager.getSubscription();
    if (!sub) {
      console.log("No subscription in SW");
      return;
    }

    console.log("Sending subscription from SW...");
    try {
      const res = await fetch('https://hydrate-backend.fly.dev/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub)
      });
      console.log("SW subscribe server response:", await res.text());
    } catch (err) {
      console.error("SW subscribe failed:", err);
    }
  })());
});

self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || "Hydrate", {
      body: data.body || "",
      icon: "icon.png",
      data: { url: data.url || "/" }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(event.notification.data.url);
    })
  );
});