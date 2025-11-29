// app.js - Hydrate frontend (minimal, no reminders list shown)
// Works with your provided server.js, index.html and sw.js

// ---------------------------
// CONFIG
// ---------------------------
const API_BASE = "https://hydrate-backend.fly.dev";

// convenience selector
const $ = id => document.getElementById(id);

// elements
const permState = $("permState");
const btnRequest = $("btnRequest");
const btnSubscribe = $("btnSubscribe");
const btnSendTest = $("btnSendTest");
const btnAdd = $("btnAdd");

// inputs
const timeInput = $("timeInput");
const repeatMin = $("repeatMin");
const untilInput = $("until");

// ---------------------------
// UTIL: permission display
// ---------------------------
function updatePermissionText() {
  if (permState) permState.textContent = Notification.permission;
}
updatePermissionText();

// ---------------------------
// SERVICE WORKER REGISTER
// ---------------------------
async function registerSW() {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service workers not supported in this browser.');
    return;
  }

  try {
    // register relative path (matches your index/sw placement)
    const reg = await navigator.serviceWorker.register('./sw.js');
    console.log('Service worker registered:', reg.scope);
  } catch (err) {
    console.error('Service worker registration failed:', err);
  }
}
registerSW();

// ---------------------------
// small localStorage helpers
// ---------------------------
function saveUserId(id) {
  try { localStorage.setItem('hydrateUserId', id); } catch (e) {}
}
function getUserId() {
  try { return localStorage.getItem('hydrateUserId'); } catch (e) { return null; }
}
function clearUserId() {
  try { localStorage.removeItem('hydrateUserId'); } catch (e) {}
}

// ---------------------------
// VAPID helper
// ---------------------------
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

// ---------------------------
// REQUEST NOTIFICATION PERMISSION
// ---------------------------
if (btnRequest) {
  btnRequest.addEventListener('click', async () => {
    try {
      const p = await Notification.requestPermission();
      updatePermissionText();
      alert(`Permission: ${p}`);
    } catch (err) {
      console.error('Permission request failed', err);
      alert('Permission request failed: ' + (err && err.message));
    }
  });
}

// ---------------------------
// SUBSCRIBE USER (push)
// ---------------------------
if (btnSubscribe) {
  btnSubscribe.addEventListener('click', async () => {
    try {
      // fetch VAPID key
      const vapidRes = await fetch(`${API_BASE}/vapidPublicKey`);
      if (!vapidRes.ok) throw new Error('Failed to load VAPID key: ' + vapidRes.status);
      const vapidKey = await vapidRes.text();
      const vapidUint8 = urlBase64ToUint8Array(vapidKey);

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidUint8
      });

      // send to backend
      const res = await fetch(`${API_BASE}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub)
      });

      if (!res.ok) throw new Error('Subscribe failed: ' + res.status);
      const data = await res.json();

      if (data && data.userId) {
        saveUserId(data.userId);
        console.log('Saved userId:', data.userId);
      }

      alert('Subscribed successfully!');
    } catch (err) {
      console.error('Subscribe error', err);
      alert('Subscription failed: ' + (err && err.message));
    }
  });
}

// ---------------------------
// SEND TEST PUSH (server will send push to all subs)
// ---------------------------
if (btnSendTest) {
  btnSendTest.addEventListener('click', async () => {
    try {
      const res = await fetch(`${API_BASE}/sendNotification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}) // server will use default payload if none provided
      });
      if (!res.ok) throw new Error('Server returned ' + res.status);
      const json = await res.json();
      console.log('sendNotification result', json);
      alert('Test push requested. Check your device notification area.');
    } catch (err) {
      console.error('send test error', err);
      alert('Failed to request test push: ' + (err && err.message));
    }
  });
}

// ---------------------------
// ADD REMINDER
// ---------------------------
async function addReminder() {
  try {
    const time = timeInput && timeInput.value;
    const repeat = repeatMin && Number(repeatMin.value || 0);
    const until = untilInput && untilInput.value || null;

    if (!time) return alert('Please choose a time for the reminder.');

    // ensure service worker ready
    const reg = await navigator.serviceWorker.ready;
    if (!reg) return alert('Service worker not ready. Reload and try again.');

    // get existing push subscription
    const subscription = await reg.pushManager.getSubscription();
    if (!subscription) return alert('You must subscribe before adding a reminder.');

    // payload expected by your server
    const payload = {
      subscription: subscription.toJSON ? subscription.toJSON() : subscription,
      time,
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      repeatEveryMinutes: Number(repeat || 0),
      repeatUntil: until || null
    };

    const res = await fetch(`${API_BASE}/addReminder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const text = await res.text().catch(()=>'');
      throw new Error('Server error: ' + res.status + ' ' + text);
    }

    // success - server saved the reminder. we intentionally do not show list.
    alert('Reminder saved on server.');
    console.log('addReminder response', await res.json().catch(()=>null));
  } catch (err) {
    console.error('addReminder error', err);
    alert('Failed to save reminder: ' + (err && err.message));
  }
}

if (btnAdd) {
  btnAdd.addEventListener('click', addReminder);
}

// ---------------------------
// STARTUP
// ---------------------------
window.addEventListener('load', () => {
  updatePermissionText();
  // nothing else required at load (no reminders list)
});