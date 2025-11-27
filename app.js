// app.js - client logic to register SW, subscribe push and talk to backend
const API_BASE = 'https://hydrate-backend.fly.dev'; // <- your backend

const $ = id => document.getElementById(id);
const permState = $('permState');
const listEl = $('list');

async function registerSW(){
  if (!('serviceWorker' in navigator)) return alert('Service worker not supported');
  const reg = await navigator.serviceWorker.register('/sw.js');
  console.log('SW registered', reg);
  return reg;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

async function updatePermUI(){
  permState.textContent = Notification.permission;
}

// request permission
$('btnRequest').addEventListener('click', async ()=>{
  const p = await Notification.requestPermission();
  updatePermUI();
  if (p !== 'granted') return alert('Please allow notifications');
  alert('Permission granted');
});

// subscribe to push
$('btnSubscribe').addEventListener('click', async ()=>{
  if (Notification.permission !== 'granted') return alert('Allow notifications first');
  const reg = await registerSW();
  // get VAPID public key from server
  const res = await fetch(API_BASE + '/vapidPublicKey');
  if (!res.ok) return alert('Failed to get VAPID key');
  const vapidKey = await res.text();
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey)
  });
  // send subscription to server
  const r = await fetch(API_BASE + '/subscribe', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(sub) });
  const data = await r.json();
  if (!data || !data.success) return alert('Subscribe failed');
  alert('Subscribed on server');
});

// send test push (server triggers)
$('btnSendTest').addEventListener('click', async ()=>{
  const payload = { title:'Hydrate — test', body:'Time to drink water 💧', url:'/' };
  const r = await fetch(API_BASE + '/sendNotification', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ payload })});
  const d = await r.json();
  alert('Server response: ' + JSON.stringify(d));
});

// add reminder
$('btnAdd').addEventListener('click', async ()=>{
  const t = $('timeInput').value;
  if (!t) return alert('Choose a time');
  const repeat = Number($('repeatMin').value || 0);
  const until = $('until').value || null;
  // grab current subscription from service worker
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return alert('Service worker not registered.');
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return alert('Not subscribed to push yet.');
  const body = {
    subscription: sub,
    time: t,
    timezoneOffsetMinutes: new Date().getTimezoneOffset() * -1, // server expects offset minutes (positive if ahead of UTC)
    repeatEveryMinutes: repeat,
    repeatUntil: until || null
  };
  const r = await fetch(API_BASE + '/addReminder', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const d = await r.json();
  if (!d || !d.success) return alert('Failed to add reminder');
  alert('Reminder added');
  renderReminders(); // attempt show
});

// show reminders from server (reads /subs and displays count)
async function renderReminders(){
  try{
    const r = await fetch(API_BASE + '/subs');
    const d = await r.json();
    listEl.innerHTML = '';
    for (const u of d.users || []) {
      const li = document.createElement('li');
      li.textContent = `id: ${u.id} — reminders: ${u.reminders}`;
      listEl.appendChild(li);
    }
  }catch(e){
    listEl.innerHTML = '<li>Error loading</li>';
  }
}

window.addEventListener('load', async () => {
  updatePermUI();
  try { await registerSW(); } catch(e){ console.warn(e); }
  renderReminders();
});