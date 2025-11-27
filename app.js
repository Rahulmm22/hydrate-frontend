// app.js — Full frontend (replace your existing app.js with this)
// 1) Set your backend URL here:
const API_BASE = 'https://hydrate-backend.fly.dev'; // <--- change if your backend URL differs

// DOM refs
const listEl = document.getElementById('list');
const timeInput = document.getElementById('timeInput');
const repeatMinInput = document.getElementById('repeatMin');
const untilInput = document.getElementById('until');

const btnRequest = document.getElementById('btnRequest');
const btnSubscribe = document.getElementById('btnSubscribe');
const btnSendTest = document.getElementById('btnSendTest');
const btnAdd = document.getElementById('btnAdd');

const permStateEl = document.getElementById('permState');

// local reminders fallback
let localReminders = JSON.parse(localStorage.getItem('water-reminders') || '[]');
// server-side reminders for this subscription (if available)
let serverReminders = [];

// small helpers
function saveLocal() {
  localStorage.setItem('water-reminders', JSON.stringify(localReminders));
}
function showPerm() {
  permStateEl.textContent = (Notification && Notification.permission) ? Notification.permission : 'unknown';
}
function fmtRem(r) {
  if (!r) return '';
  if (r.repeatEveryMinutes && r.repeatEveryMinutes > 0) {
    return `${r.time} • every ${r.repeatEveryMinutes} min${r.repeatUntil ? ' • until ' + r.repeatUntil : ''}`;
  }
  return `${r.time} • one time`;
}

// render UI with local + server reminders
function render() {
  listEl.innerHTML = '';

  // show server reminders first (if any)
  if (serverReminders && serverReminders.length) {
    serverReminders.forEach((r, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<div>
        <div style="font-weight:600">${r.time || '--:--'}</div>
        <small>Server • ${r.repeatEveryMinutes>0 ? `Every ${r.repeatEveryMinutes} min` : 'One time'} ${r.repeatUntil ? 'until ' + r.repeatUntil : ''}</small>
      </div>
      <div><small class="muted">id:${r.id||'—'}</small></div>`;
      listEl.appendChild(li);
    });
  }

  // then local reminders
  localReminders.forEach((r, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<div>
      <div style="font-weight:600">${r.time || '--:--'}</div>
      <small>${r.repeatMin>0 ? `Every ${r.repeatMin} min` : 'One time'} ${r.until ? '• until ' + r.until : ''}</small>
    </div>
    <div>
      <button data-index="${i}" class="del">Delete</button>
    </div>`;
    listEl.appendChild(li);
  });

  // wire delete buttons for local reminders
  document.querySelectorAll('.del').forEach(btn => btn.addEventListener('click', async (e) => {
    const idx = Number(e.currentTarget.dataset.index);
    if (isNaN(idx)) return;
    const removed = localReminders.splice(idx,1)[0];
    saveLocal();
    render();
    // if removed had server id, try best-effort delete on server (endpoint not implemented server-side by default)
    if (removed && removed.id) {
      try {
        await fetch(`${API_BASE}/deleteReminder`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: removed.id }) });
      } catch(e){ /* ignore */ }
    }
  }));
}

// ----------------- Service Worker registration (robust) -----------------
async function registerSW() {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service worker not supported.');
    window._swReady = false;
    return null;
  }

  try {
    // register relative path so it works on GitHub Pages and localhost
    const reg = await navigator.serviceWorker.register('sw.js');
    console.info('SW registered:', reg);

    // wait up to 3s for controllerchange (page being controlled)
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => {
        let done = false;
        const t = setTimeout(() => { if (!done) { done = true; resolve(); } }, 3000);
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!done) { done = true; clearTimeout(t); resolve(); }
        });
      });
    }

    window._swReady = !!navigator.serviceWorker.controller;
    console.info('SW controlling page:', window._swReady);
    return reg;
  } catch (err) {
    console.error('SW register failed:', err);
    // retry once after short delay
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

// ----------------- Permission button -----------------
btnRequest.addEventListener('click', async () => {
  if (!('Notification' in window)) return alert('Notifications are not supported in this browser.');
  const p = await Notification.requestPermission();
  showPerm();
  alert('Permission: ' + p);
});

// ----------------- Push helpers -----------------
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i=0;i<raw.length;++i) out[i] = raw.charCodeAt(i);
  return out;
}

async function getVapidKey() {
  const res = await fetch(`${API_BASE}/vapidPublicKey`);
  if (!res.ok) throw new Error('Failed to load VAPID key');
  const txt = await res.text();
  return txt.trim();
}

// ----------------- Subscribe flow -----------------
btnSubscribe.addEventListener('click', async () => {
  if (!window._swReady) {
    await registerSW();
    if (!window._swReady) return alert('Service worker not ready. Please reload and try again.');
  }
  if (Notification.permission !== 'granted') return alert('Please allow notifications first.');

  try {
    const vapid = await getVapidKey();
    const reg = await registerSW();
    if (!reg) throw new Error('Service worker registration missing');

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid)
    });

    const r = await fetch(`${API_BASE}/subscribe`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(sub) });
    const data = await r.json().catch(()=>null);
    if (!r.ok || !data || !data.success) throw new Error('Server subscribe failed');

    alert('Subscribed and saved on server');
    // refresh server reminders display for this subscription
    await loadRemoteReminders();
  } catch (err) {
    console.error(err);
    alert('Subscribe failed: ' + (err.message || err));
  }
});

// ----------------- Send test push -----------------
btnSendTest.addEventListener('click', async () => {
  if (!window._swReady) {
    await registerSW();
    if (!window._swReady) return alert('Service worker not ready. Please reload and try again.');
  }
  try {
    const payload = { title:'Hydrate — test', body:'Time to drink water 💧', url:'/' };
    const res = await fetch(`${API_BASE}/sendNotification`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ payload })
    });
    const d = await res.json().catch(()=>null);
    alert('Server responded: ' + (d ? JSON.stringify(d) : 'no-json'));
  } catch (e) {
    console.error(e);
    alert('Send test failed: ' + (e.message||e));
  }
});

// ----------------- Add reminder (correct payload to server) -----------------
btnAdd.addEventListener('click', async () => {
  // ensure SW is ready but allow continue if not (we still need subscription)
  if (!window._swReady) {
    await registerSW();
    // continue even if SW not controlling (server still needs the subscription object)
  }

  const time = timeInput.value;
  const repeatMin = Number(repeatMinInput.value || 0) || 0;
  const until = untilInput.value || null;

  if (!time) return alert('Please choose a time.');

  // get registration + subscription
  const reg = await navigator.serviceWorker.getRegistration();
  let sub = null;
  if (reg) sub = await reg.pushManager.getSubscription();

  if (!sub) return alert('You must subscribe to push first. Tap Subscribe and allow notifications.');

  const body = {
    subscription: sub,
    time: time, // "HH:MM"
    timezoneOffsetMinutes: new Date().getTimezoneOffset() * -1,
    repeatEveryMinutes: Number(repeatMin || 0),
    repeatUntil: until || null
  };

  // optimistic local save for UI
  localReminders.push({ time, repeatMin, until });

  saveLocal();
  render();

  // POST to /addReminder
  try {
    const resp = await fetch(`${API_BASE}/addReminder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const d = await resp.json().catch(()=>null);
    if (!resp.ok) {
      console.warn('Server rejected:', resp.status, d);
      alert('Reminder saved locally but server rejected it.');
      return;
    }
    alert('Reminder added and saved on server.');
    // refresh server reminders display so user can confirm
    await loadRemoteReminders();
  } catch (err) {
    console.error('Failed to POST reminder:', err);
    alert('Reminder saved locally. Server unreachable — it will not trigger push until server receives it.');
  }
});

// ----------------- Load remote reminders and match to current subscription -----------------
async function loadRemoteReminders() {
  try {
    const res = await fetch(`${API_BASE}/subs`);
    if (!res.ok) {
      console.warn('/subs returned', res.status);
      return;
    }
    const data = await res.json();
    // try to determine current subscription endpoint
    let currentEndpoint = null;
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      const s = await reg.pushManager.getSubscription();
      if (s && s.endpoint) currentEndpoint = s.endpoint;
    }
    // if we have an endpoint, find user and show their reminders
    serverReminders = [];
    if (currentEndpoint && data && Array.isArray(data.users)) {
      const u = data.users.find(x => x.subscription && x.subscription.endpoint === currentEndpoint);
      if (u && Array.isArray(u.reminders)) {
        serverReminders = u.reminders.slice();
      }
    }
    render();
  } catch (e) {
    console.warn('Could not load remote reminders:', e);
  }
}

// ----------------- Boot -----------------
(async function boot() {
  showPerm();
  render();
  await registerSW();
  // small delay then try load remote reminders
  setTimeout(() => loadRemoteReminders().catch(()=>{}), 500);
})();