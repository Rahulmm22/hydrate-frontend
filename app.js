// app.js - client logic for service worker, push subscription, and UI
// Adjust IDs if your HTML uses different ones.

const API_BASE = 'https://hydrate-backend.fly.dev'; // <-- set your backend here

// UI elements - change IDs if needed
const $ = (id) => document.getElementById(id);
const statusEl = $('status') || { textContent: '' };
const requestPermBtn = $('requestPerm');
const subscribeBtn = $('subscribeBtn') || $('subscribe');
const sendTestBtn = $('sendTestBtn') || $('sendTest');
const timeInput = $('timeInput') || $('time');              // new reminder time
const repeatInput = $('repeatInput') || $('repeat');       // repeat minutes
const untilInput = $('untilInput') || $('until');          // until time
const addBtn = $('addBtn') || $('addReminder');
const remindersList = $('reminders') || $('remindersList');

function setStatus(s) {
  try { statusEl.textContent = s; } catch(e){ console.log('status:', s); }
  console.log('[app] ' + s);
}

// Register service worker (relative path)
async function registerSW() {
  if (!('serviceWorker' in navigator)) {
    setStatus('Service workers not supported.');
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    setStatus('Service worker registered. scope=' + reg.scope);
    return reg;
  } catch (err) {
    setStatus('SW register failed: ' + err);
    console.error(err);
    return null;
  }
}

// Request notification permission
async function requestPermission() {
  if (!('Notification' in window)) {
    setStatus('Notifications not supported.');
    return;
  }
  const p = await Notification.requestPermission();
  setStatus('Permission: ' + p);
  return p;
}

// fetch VAPID public key from backend
async function getVapidPublicKey() {
  const res = await fetch(API_BASE + '/vapidPublicKey');
  if (!res.ok) throw new Error('Failed to load VAPID key');
  const txt = (await res.text()).trim();
  return txt;
}

function urlBase64ToUint8Array(base64String) {
  // standard helper
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) out[i] = rawData.charCodeAt(i);
  return out;
}

// Subscribe and send subscription to server
async function subscribeToPush() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) { setStatus('No service worker registration found.'); return; }

    // If already subscribed, return
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      setStatus('Already subscribed.');
      // optionally re-send to server to ensure stored
      await sendSubscriptionToServer(existing);
      return existing;
    }

    const vapidKey = await getVapidPublicKey();
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey)
    });
    await sendSubscriptionToServer(sub);
    setStatus('Subscribed and saved on server.');
    return sub;
  } catch (err) {
    setStatus('Subscribe failed: ' + err.message);
    console.error(err);
    throw err;
  }
}

// Send subscription object to backend /subscribe endpoint
async function sendSubscriptionToServer(subscription) {
  const res = await fetch(API_BASE + '/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription)
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error('Failed to send subscription to server: ' + res.status + ' ' + txt);
  }
  const data = await res.json().catch(() => ({}));
  console.log('Server subscribe result:', data);
  return data;
}

// Send a test push (ask the backend to trigger a push)
async function sendTestPush() {
  try {
    const payload = { title: 'Hydrate — test', body: 'Time to drink water 💧', url: location.origin };
    const res = await fetch(API_BASE + '/sendNotification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    alert('Server response: ' + JSON.stringify(data));
  } catch (err) {
    console.error(err);
    alert('Send failed: ' + err.message);
  }
}

// Helpers: UI wiring
function wireUI() {
  if (requestPermBtn) requestPermBtn.addEventListener('click', async () => {
    const p = await requestPermission();
    if (p === 'granted') setStatus('Permission granted');
    else setStatus('Permission: ' + p);
  });

  if (subscribeBtn) subscribeBtn.addEventListener('click', async () => {
    try {
      const p = Notification.permission;
      if (p !== 'granted') {
        alert('Allow notifications first');
        return;
      }
      await subscribeToPush();
    } catch (err) {
      alert('Subscribe failed: ' + (err.message || err));
    }
  });

  if (sendTestBtn) sendTestBtn.addEventListener('click', async () => {
    await sendTestPush();
  });

  // Add reminder (simple backend call) - adapt endpoint name to your server (/reminder or /addReminder)
  if (addBtn) addBtn.addEventListener('click', async () => {
    try {
      const time = (timeInput && timeInput.value) ? timeInput.value : '';
      const repeat = (repeatInput && repeatInput.value) ? Number(repeatInput.value) : 0;
      const until = (untilInput && untilInput.value) ? untilInput.value : '';

      if (!time) return alert('Choose time');

      const payload = { time, repeat, until }; // your backend must accept this shape
      const res = await fetch(API_BASE + '/addReminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const txt = await res.text().catch(()=>'');
        throw new Error('Server error: ' + res.status + ' ' + txt);
      }
      setStatus('Reminder added');
      // refresh reminders list if server provides an endpoint
      loadReminders();
    } catch (err) {
      alert('Add reminder failed: ' + err.message);
    }
  });
}

// Load reminders list (if your backend provides /reminders endpoint)
async function loadReminders() {
  try {
    const res = await fetch(API_BASE + '/reminders');
    if (!res.ok) return;
    const data = await res.json();
    if (!remindersList) return;
    remindersList.innerHTML = '';
    (data || []).forEach((r) => {
      const div = document.createElement('div');
      div.className = 'reminder';
      div.textContent = `${r.time} — every ${r.repeat || 0} min`;
      remindersList.appendChild(div);
    });
  } catch (err) {
    console.warn('Could not load reminders', err);
  }
}

// Auto-run on page load
(async function init() {
  setStatus('Initializing...');
  wireUI();

  // register SW
  const reg = await registerSW();
  if (!reg) {
    setStatus('Service worker not registered.');
    return;
  }

  // show current permission
  setStatus('Notification permission: ' + Notification.permission);

  // If already subscribed on this client, re-send subscription to server (safe)
  try {
    const swReg = await navigator.serviceWorker.getRegistration();
    if (swReg) {
      const existing = await swReg.pushManager.getSubscription();
      if (existing) {
        try {
          await sendSubscriptionToServer(existing);
          setStatus('Existing subscription sent to server.');
        } catch (e) {
          console.warn('Failed to re-send existing subscription', e);
        }
      }
    }
  } catch (e) {
    console.warn('Subscription check failed', e);
  }

  // Try to load existing reminders (optional)
  loadReminders();

})();