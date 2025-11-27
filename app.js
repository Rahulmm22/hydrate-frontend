const API_BASE = 'https://hydrate-backend.fly.dev';

let swReg = null;

// ---------------- Register Service Worker ----------------
async function registerSW() {
    if (!('serviceWorker' in navigator)) {
        alert('Service workers not supported');
        return;
    }
    try {
        swReg = await navigator.serviceWorker.register('sw.js');
        console.log('SW registered', swReg);
    } catch (err) {
        console.error('SW error', err);
        alert('Service worker registration failed');
    }
}

// ---------------- Allow Notification ----------------
document.getElementById('allow').addEventListener('click', async () => {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
        alert("Notifications not allowed");
        return;
    }
    alert("Permission granted.");
});

// ---------------- Convert Base64 to Uint8Array ----------------
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const output = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
    return output;
}

// ---------------- Subscribe Button ----------------
document.getElementById('subscribe').addEventListener('click', async () => {
    try {
        if (!swReg) {
            alert("Service worker not registered.");
            return;
        }

        // Get public VAPID key from backend
        const vapidRes = await fetch(API_BASE + '/vapidPublicKey');
        const vapidKey = (await vapidRes.text()).trim();

        // Subscribe
        const subscription = await swReg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });

        // Send subscription to backend
        const res = await fetch(API_BASE + '/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscription),
        });

        const data = await res.json();
        if (data.success) alert("Subscribed & saved on server.");
        else alert("Subscribe failed.");

    } catch (err) {
        console.error(err);
        alert("Subscription failed.");
    }
});

// ---------------- Add Reminder ----------------
document.getElementById('add').addEventListener('click', async () => {
    const time = document.getElementById('time').value;
    const repeat = Number(document.getElementById('repeat').value || 0);
    const until = document.getElementById('until').value || null;

    if (!time) return alert("Choose time");

    const res = await fetch(API_BASE + '/addReminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ time, repeat, until }),
    });

    const data = await res.json();
    alert(data.success ? "Reminder added" : "Failed to add reminder");

    loadReminders();
});

// ---------------- Load Reminders ----------------
async function loadReminders() {
    const res = await fetch(API_BASE + '/reminders');
    const data = await res.json();

    const box = document.getElementById('reminders');
    box.innerHTML = '';

    data.forEach(r => {
        const div = document.createElement('div');
        div.textContent = `${r.time} — Every ${r.repeat} min`;
        box.appendChild(div);
    });
}

// ---------------- Init ----------------
window.addEventListener('load', async () => {
    await registerSW();
    loadReminders();
});