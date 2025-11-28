// app.js - client for Hydrate frontend
// Make sure this file is included at the end of index.html (you already do)

const API_BASE = 'https://hydrate-backend.fly.dev'; // <- change here if needed

// ---- DOM elements (match the IDs in your index.html)
const btnRequest = document.getElementById('btnRequest');
const btnSubscribe = document.getElementById('btnSubscribe');
const btnSendTest = document.getElementById('btnSendTest');
const btnAdd = document.getElementById('btnAdd');
const permState = document.getElementById('permState');

const timeInput = document.getElementById('timeInput');
const repeatMin = document.getElementById('repeatMin');
const untilInput = document.getElementById('until');
const listEl = document.getElementById('list');

// local UI state
let registrationReady = null;
let isSubscribed = false;

// utils
function setPermText(text) {
  if (permState) permState.textContent = text;
}

function urlBase64ToUint8Array(base64String) {
  // standard helper for VAPID key conversion
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ----- Service Worker registration -----
async function registerSW() {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service workers are not supported');
    setPermText('unsupported');
    return;
  }

  try {
    // register service worker from root - sw.js must be at site root for scope on GitHub Pages
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    console.log('SW registered:', reg);
    registrationReady = reg;
    // if there's an active worker with pushManager, check for subscription
    const sub = await reg.pushManager.getSubscription();
    isSubscribed = !!sub;
    updateSubscribeButtons();
  } catch (err) {
    console.error('SW registration failed', err);
    setPermText('sw_fail');
  }
}

// ----- Permission handling -----
async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    alert('Notifications are not supported by this browser.');
    return;
  }
  try {
    const result = await Notification.requestPermission();
    setPermText(result);
    return result;
  } catch (err) {
    console.error('Permission request failed', err);
  }
}

// ----- get VAPID public key from backend -----
async function getVapidPublicKey() {
  try {
    const res = await fetch(`${API_BASE}/vapidPublicKey`);
    if (!res.ok) throw new Error('Failed to fetch VAPID key');
    const text = await res.text();
    return text.trim();
  } catch (err) {
    console.warn('VAPID key fetch failed:', err);
    throw err;
  }
}

// ----- subscribe the user to push (calls backend /subscribe) -----
async function subscribeUser() {
  if (!registrationReady) {
    alert('Service worker not ready. Make sure sw.js is in the site root and SW registered.');
    return;
  }
  if (Notification.permission !== 'granted') {
    alert('Please allow notifications first.');
    return;
  }

  try {
    const vapid = await getVapidPublicKey();
    const applicationServerKey = urlBase64ToUint8Array(vapid);

    const sub = await registrationReady.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey
    });

    // send subscription to the backend
    const res = await fetch(`${API_BASE}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub)
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error('Failed to send subscription to server: ' + text);
    }
    isSubscribed = true;
    updateSubscribeButtons();
    alert('Subscribed successfully (saved on server)');
  } catch (err) {
    console.error('subscribeUser error', err);
    alert('Subscription failed: ' + (err.message || err));
  }
}

// ----- fetch and render reminders from backend (fallback to localStorage) -----
async function fetchRemindersFromServer() {
  try {
    const res = await fetch(`${API_BASE}/reminders`);
    if (!res.ok) throw new Error('server returned ' + res.status);
    const data = await res.json();
    // expect array of reminders or object
    const reminders = Array.isArray(data) ? data : (data.reminders || []);
    renderReminders(reminders);
    return reminders;
  } catch (err) {
    console.warn('fetchRemindersFromServer failed, falling back to localStorage', err);
    // fallback
    const json = localStorage.getItem('hydrate.reminders');
    const reminders = json ? JSON.parse(json) : [];
    renderReminders(reminders);
    return reminders;
  }
}

function saveRemindersLocal(reminders) {
  try {
    localStorage.setItem('hydrate.reminders', JSON.stringify(reminders));
  } catch (e) {
    console.warn('failed to save local reminders', e);
  }
}

// ----- render UI list -----
function renderReminders(reminders = []) {
  listEl.innerHTML = '';
  if (!Array.isArray(reminders) || reminders.length === 0) {
    listEl.innerHTML = '<li class="empty">No reminders</li>';
    return;
  }
  reminders.forEach((r, i) => {
    const li = document.createElement('li');
    li.className = 'reminder';
    // display time and repeat
    const repeatText = r.repeat && r.repeat > 0 ? `Every ${r.repeat} min` : 'Once';
    const untilText = r.until ? ` until ${r.until}` : '';
    li.innerHTML = `
      <div class="row">
        <div>
          <strong>${r.time}</strong>
          <div class="muted small">${repeatText}${untilText}</div>
        </div>
        <div>
          <button class="btn small" data-i="${i}" data-action="delete">Delete</button>
        </div>
      </div>
    `;
    listEl.appendChild(li);
  });
}

// ----- add reminder (POST to server) -----
async function addReminder() {
  const time = timeInput.value;
  const repeat = Number(repeatMin.value || 0);
  const until = untilInput.value || '';

  if (!time) return alert('Choose a time first');

  const payload = { time, repeat, until };

  // Try to POST to server; if fails, store locally and inform the user
  try {
    const res = await fetch(`${API_BASE}/reminders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error('Server returned ' + res.status + ' — ' + txt);
    }
    // success: refresh list from server
    await fetchRemindersFromServer();
    alert('Reminder saved on server. Notifications will be delivered at scheduled times.');
  } catch (err) {
    console.warn('addReminder server failed, saving locally', err);
    // fallback: save locally
    const current = JSON.parse(localStorage.getItem('hydrate.reminders') || '[]');
    current.push(payload);
    saveRemindersLocal(current);
    renderReminders(current);
    alert('Saved reminder locally (server unreachable). It will not trigger server push until backend is available.');
  }
}

// ----- delete reminder (local only UI) -----
function deleteReminder(index) {
  const current = JSON.parse(localStorage.getItem('hydrate.reminders') || '[]');
  current.splice(index, 1);
  saveRemindersLocal(current);
  renderReminders(current);
  // attempt to delete from server if API exists
  fetch(`${API_BASE}/reminders`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index })
  }).catch(()=>{/* ignore */});
}

// ----- send test push (ask server to trigger a push) -----
async function sendTestPush() {
  try {
    const payload = { title: 'Hydrate — test', body: 'Time to drink water 💧', url: '/' };
    const res = await fetch(`${API_BASE}/sendNotification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error('Server returned ' + res.status + ' — ' + txt);
    }
    const json = await res.json();
    alert('Server response: ' + JSON.stringify(json).slice(0,200));
  } catch (err) {
    console.error('sendTestPush failed', err);
    alert('Send failed: ' + (err.message || err));
  }
}

// ----- UI wiring -----
function updateSubscribeButtons() {
  if (isSubscribed) {
    btnSubscribe.textContent = 'Subscribed';
    btnSubscribe.disabled = true;
  } else {
    btnSubscribe.textContent = 'Subscribe';
    btnSubscribe.disabled = false;
  }
}

// event handlers
btnRequest && btnRequest.addEventListener('click', async () => {
  const p = await requestNotificationPermission();
  setPermText(p || 'unknown');
});

btnSubscribe && btnSubscribe.addEventListener('click', async () => {
  await subscribeUser();
});

btnSendTest && btnSendTest.addEventListener('click', async () => {
  await sendTestPush();
});

btnAdd && btnAdd.addEventListener('click', async () => {
  await addReminder();
});

// delegate delete buttons in the list
listEl && listEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action="delete"]');
  if (!btn) return;
  const idx = Number(btn.dataset.i);
  if (Number.isFinite(idx)) {
    if (confirm('Delete this reminder?')) deleteReminder(idx);
  }
});

// initial boot
(async function init() {
  setPermText(Notification.permission || 'unknown');

  // register SW
  await registerSW();

  // load reminders from server or localStorage
  await fetchRemindersFromServer();
})();