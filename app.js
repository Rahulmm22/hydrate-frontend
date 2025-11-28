// app.js - client logic for service worker, push subscription, and UI
// IMPORTANT: set API_BASE to your backend
const API_BASE = 'https://hydrate-backend.fly.dev'; // <-- update if different

// helper: get element by id (null-safe)
const $ = (id) => document.getElementById(id) || null;

// safe addEventListener (logs when element not found)
function safeAddListener(el, evt, fn) {
  if (!el) {
    console.warn(`[app] UI element not found for listener: ${evt}`);
    return;
  }
  el.addEventListener(evt, fn);
}

// small status helper (uses element with id="status" if present)
const statusEl = $('status');
function setStatus(msg) {
  console.log('[app] ' + msg);
  if (statusEl) statusEl.textContent = msg;
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

async function requestPermission() {
  if (!('Notification' in window)) {
    setStatus('Notifications not supported.');
    return;
  }
  const p = await Notification.requestPermission();
  setStatus('Permission: ' + p);
  return p;
}

async function getVapidPublicKey() {
  const res = await fetch(API_BASE + '/vapidPublicKey');
  if (!res.ok) throw new Error('Failed to load VAPID key');
  const txt = (await res.text()).trim();
  return txt;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) out[i] = rawData.charCodeAt(i);
  return out;
}

async function sendSubscriptionToServer(subscription) {
  const res = await fetch(API_BASE + '/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription)
  });
  if (!res.ok) {
    const txt = await res.text().catch(()=> '');
    throw new Error('Failed to send subscription to server: ' + res.status + ' ' + txt);
  }
  const data = await res.json().catch(()=> ({}));
  console.log('Server subscribe result:', data);
  return data;
}

async function subscribeToPush() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) { setStatus('No service worker registration found.'); return; }

    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      setStatus('Already subscribed.');
      await sendSubscriptionToServer(existing).catch(()=>{});
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
    setStatus('Subscribe failed: ' + (err.message || err));
    console.error(err);
    throw err;
  }
}

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

async function addReminderToServer(time, repeat, until) {
  const payload = { time, repeat: Number(repeat)||0, until: until || '' };
  const res = await fetch(API_BASE + '/addReminder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const txt = await res.text().catch(()=>'');
    throw new Error('Add reminder failed: ' + res.status + ' ' + txt);
  }
  return res.json().catch(()=>({}));
}

async function loadReminders() {
  try {
    const res = await fetch(API_BASE + '/reminders');
    if (!res.ok) return;
    const data = await res.json();
    const remList = $('reminders') || $('remindersList');
    if (!remList) return;
    remList.innerHTML = '';
    if (Array.isArray(data)) {
      data.forEach(r => {
        const div = document.createElement('div');
        div.className = 'reminder';
        div.textContent = `${r.time || '?'} — every ${r.repeat || 0} min`;
        remList.appendChild(div);
      });
    } else if (data && data.reminders) {
      (data.reminders).forEach(r => {
        const div = document.createElement('div');
        div.className = 'reminder';
        div.textContent = `${r.time || '?'} — every ${r.repeat || 0} min`;
        remList.appendChild(div);
      });
    }
  } catch (err) {
    console.warn('Could not load reminders', err);
  }
}

// Wire UI safely (ids may differ in user HTML)
function wireUI() {
  const requestPermBtn = $('requestPerm') || $('requestPermission') || $('request-notification-permission');
  const subscribeBtn = $('subscribeBtn') || $('subscribe') || $('subscribe-to-push');
  const sendTestBtn = $('sendTestBtn') || $('sendTest') || $('send-test');
  const timeInput = $('timeInput') || $('time') || $('reminder-time');
  const repeatInput = $('repeatInput') || $('repeat') || $('repeat-minutes');
  const untilInput = $('untilInput') || $('until') || $('until-time');
  const addBtn = $('addBtn') || $('addReminder') || $('add-reminder');
  // safe listeners with console logs for missing elements
  safeAddListener(requestPermBtn, 'click', async () => {
    await requestPermission();
  });
  safeAddListener(subscribeBtn, 'click', async () => {
    if (Notification.permission !== 'granted') return alert('Allow notifications first');
    try { await subscribeToPush(); } catch(e){ alert('Subscribe failed: '+(e.message||e)); }
  });
  safeAddListener(sendTestBtn, 'click', async () => {
    await sendTestPush();
  });
  safeAddListener(addBtn, 'click', async () => {
    const t = timeInput ? timeInput.value : '';
    const r = repeatInput ? repeatInput.value : '0';
    const u = untilInput ? untilInput.value : '';
    if (!t) return alert('Choose time');
    try {
      await addReminderToServer(t, r, u);
      setStatus('Reminder added');
      await loadReminders();
    } catch (err) {
      alert('Add reminder failed: ' + (err.message || err));
    }
  });
}

// init - run only after DOM ready
async function initApp() {
  setStatus('Initializing app...');
  wireUI();
  const reg = await registerSW();
  if (!reg) { setStatus('Service worker not registered.'); return; }
  setStatus('Notification permission: ' + Notification.permission);
  // re-send any existing subscription
  try {
    const swReg = await navigator.serviceWorker.getRegistration();
    if (swReg) {
      const existing = await swReg.pushManager.getSubscription();
      if (existing) {
        await sendSubscriptionToServer(existing).catch(()=>{});
        setStatus('Existing subscription re-sent to server.');
      }
    }
  } catch (e) { console.warn('Subscription check failed', e); }
  await loadReminders();
}

// Wait for DOMContentLoaded to ensure elements exist
document.addEventListener('DOMContentLoaded', () => {
  console.log('[app] DOMContentLoaded — starting init');
  initApp().catch(err => console.error('[app] init error', err));
});