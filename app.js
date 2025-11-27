// app.js — Frontend logic for Hydrate PWA + Push
// 1) Set your backend base URL here (update if different)
const API_BASE = 'https://hydrate-backend.fly.dev'; // << change if needed

// DOM references
const listEl = document.getElementById('list');
const timeInput = document.getElementById('timeInput');
const repeatMinInput = document.getElementById('repeatMin');
const untilInput = document.getElementById('until');

const btnRequest = document.getElementById('btnRequest');
const btnSubscribe = document.getElementById('btnSubscribe');
const btnSendTest = document.getElementById('btnSendTest');
const btnAdd = document.getElementById('btnAdd');

const permStateEl = document.getElementById('permState');

// --- reminders state (local fallback) ---
let reminders = JSON.parse(localStorage.getItem('water-reminders') || '[]');

// --- small helpers ---
function saveLocalReminders() {
  localStorage.setItem('water-reminders', JSON.stringify(reminders));
}
function formatTimeHHMM(t) {
  if (!t) return '';
  return t;
}
function showStatusPermission() {
  permStateEl.textContent = (Notification?.permission || 'unknown');
}

// --- ui render ---
function render() {
  listEl.innerHTML = '';
  reminders.sort((a,b) => (a.time || '').localeCompare(b.time || ''));
  reminders.forEach((r, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<div>
      <div style="font-weight:600">${r.time || '--:--'}</div>
      <small>${r.repeatMin > 0 ? `Every ${r.repeatMin} min` : 'One time' } ${r.until ? 'until ' + r.until : ''}</small>
    </div>
    <div>
      <button data-index="${i}" class="del">Delete</button>
    </div>`;
    listEl.appendChild(li);
  });
  // delete buttons
  document.querySelectorAll('.del').forEach(btn => btn.addEventListener('click', (e)=>{
    const i = +e.currentTarget.dataset.index;
    reminders.splice(i,1); saveLocalReminders(); render();
    // try remove on server (best-effort)
    if (reminders[i] && reminders[i].id) {
      fetch(`${API_BASE}/reminders/${reminders[i].id}`, { method: 'DELETE' }).catch(()=>{});
    }
  }));
}

// --- service worker (robust) ---
async function registerSW() {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service worker not supported.');
    window._swReady = false;
    return null;
  }

  try {
    // relative path so it works on GitHub Pages + local
    const reg = await navigator.serviceWorker.register('sw.js');
    console.info('Service worker registered:', reg);

    // wait for it to become controller (short timeout)
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => {
        let resolved = false;
        const t = setTimeout(() => { if (!resolved) { resolved = true; resolve(); } }, 3000);
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!resolved) { resolved = true; clearTimeout(t); resolve(); }
        });
      });
    }
    window._swReady = !!navigator.serviceWorker.controller;
    console.info('Service worker controlling this page:', window._swReady);
    return reg;
  } catch (err) {
    console.error('SW register failed:', err);
    // retry once
    try {
      await new Promise(r => setTimeout(r, 500));
      const reg2 = await navigator.serviceWorker.register('sw.js');
      window._swReady = !!navigator.serviceWorker.controller;
      return reg2;
    } catch (err2) {
      console.error('SW retry failed:', err2);
      window._swReady = false;
      return null;
    }
  }
}

// --- permissions UI handler ---
btnRequest.addEventListener('click', async () => {
  if (!('Notification' in window)) return alert('Notifications not supported in this browser.');
  const p = await Notification.requestPermission();
  showStatusPermission();
  alert('Permission: ' + p);
});

// --- push helpers ---
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i=0;i<rawData.length;++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function getVapidPublicKey() {
  const res = await fetch(`${API_BASE}/vapidPublicKey`);
  if (!res.ok) throw new Error('Failed to load VAPID key');
  const txt = await res.text();
  return txt.trim();
}

// subscribe flow (button)
btnSubscribe.addEventListener('click', async () => {
  // ensure SW ready
  if (!window._swReady) {
    await registerSW();
    if (!window._swReady) return alert('Service worker not ready. Please reload and try again.');
  }
  if (Notification.permission !== 'granted') return alert('Allow notifications first');

  try {
    const vapid = await getVapidPublicKey();
    const reg = await registerSW();
    if (!reg) throw new Error('No service worker registration');

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid)
    });

    // send to server
    const res = await fetch(`${API_BASE}/subscribe`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(sub)
    });
    if (!res.ok) throw new Error('Failed to send subscription to server');
    alert('Subscribed to push (saved on server)');
  } catch (err) {
    console.error(err);
    alert('Subscription failed: ' + (err.message||err));
  }
});

// send test push (button)
btnSendTest.addEventListener('click', async () => {
  if (!window._swReady) {
    await registerSW();
    if (!window._swReady) return alert('Service worker not ready. Please reload and try again.');
  }
  try {
    const payload = { title:'Hydrate — test', body:'Time to drink water 💧', url:'/' };
    const res = await fetch(`${API_BASE}/sendNotification`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ payload })
    });
    const data = await res.json().catch(()=>null);
    alert('Server response: ' + (data ? JSON.stringify(data) : 'no-json'));
  } catch (err) {
    console.error(err);
    alert('Send failed: ' + (err.message||err));
  }
});

// --- add reminder (UI) ---
btnAdd.addEventListener('click', async () => {
  if (!window._swReady) {
    // try register, but allow creating reminders even if SW not active (we will save to server)
    await registerSW();
    if (!window._swReady) {
      // warn but continue: we'll still POST reminder to server (server will send push at scheduled time)
      console.warn('SW not ready, creating reminder anyway.');
    }
  }

  const time = timeInput.value;
  const repeatMin = parseInt(repeatMinInput.value || '0', 10) || 0;
  const until = untilInput.value || '';

  if (!time) return alert('Choose time');

  const newReminder = { time, repeatMin, until };
  // optimistic local save
  reminders.push(newReminder);
  saveLocalReminders();
  render();

  // send to server (best-effort)
  try {
    const res = await fetch(`${API_BASE}/reminders`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(newReminder)
    });
    if (!res.ok) {
      console.warn('Server responded not ok for reminders', res.status);
      return;
    }
    const saved = await res.json().catch(()=>null);
    // if server returns id, update local copy
    if (saved && saved.id) {
      // attach id to the last reminder (best-effort match)
      const idx = reminders.length - 1;
      reminders[idx].id = saved.id;
      saveLocalReminders();
      render();
    }
    alert('Reminder added (saved on server)');
  } catch (err) {
    console.error('Failed to save reminder to server:', err);
    alert('Reminder saved locally (server unreachable). It will not trigger push until backend receives it.');
  }
});

// load reminders from server (initial)
async function loadRemoteReminders() {
  try {
    const res = await fetch(`${API_BASE}/reminders`);
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data) && data.length) {
      reminders = data;
      saveLocalReminders();
      render();
    }
  } catch (err) {
    console.warn('Could not load remote reminders:', err);
  }
}

// --- boot sequence ---
(async function boot() {
  showStatusPermission();
  render();
  // try to register sw (best-effort)
  await registerSW();
  // try load remote reminders
  await loadRemoteReminders();
})();