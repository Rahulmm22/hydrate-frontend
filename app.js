// ---------------------------
// CONFIG
// ---------------------------
const API_BASE = "https://hydrate-backend.fly.dev";

// convenience selector
const $ = (id) => document.getElementById(id);

// elements
const permState = $("permState");
const btnRequest = $("btnRequest");
const btnSubscribe = $("btnSubscribe");
const btnSendTest = $("btnSendTest");
const btnAdd = $("btnAdd");
const list = $("list");


// ---------------------------
// UPDATE STATUS
// ---------------------------
function updatePermissionText() {
  permState.textContent = Notification.permission;
}
updatePermissionText();


// ---------------------------
// SERVICE WORKER
// ---------------------------
async function registerSW() {
  if (!("serviceWorker" in navigator)) {
    alert("Service worker not supported");
    return;
  }

  try {
    const reg = await navigator.serviceWorker.register("/hydrate-frontend/sw.js");
    console.log("SW registered", reg.scope);
  } catch (err) {
    console.error("SW registration failed:", err);
  }
}
registerSW();


// ---------------------------
// REQUEST NOTIFICATION PERMISSION
// ---------------------------
btnRequest.addEventListener("click", async () => {
  const perm = await Notification.requestPermission();
  updatePermissionText();
  alert(`Permission: ${perm}`);
});


// ---------------------------
// SUBSCRIBE USER
// ---------------------------
btnSubscribe.addEventListener("click", async () => {
  try {
    // load VAPID key
    const vapidRes = await fetch(`${API_BASE}/vapidPublicKey`);
    const vapidKey = await vapidRes.text();
    const vapidUint8 = urlBase64ToUint8Array(vapidKey);

    const reg = await navigator.serviceWorker.ready;

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidUint8
    });

    // send subscription to backend
    const res = await fetch(`${API_BASE}/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub)
    });

    const data = await res.json();
    alert("Subscribed successfully!");
    console.log("Server response:", data);

  } catch (err) {
    alert("Subscription failed: " + err.message);
    console.error(err);
  }
});


// ---------------------------
// SEND TEST PUSH
// ---------------------------
btnSendTest.addEventListener("click", async () => {
  try {
    const res = await fetch(`${API_BASE}/sendNotification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });

    const data = await res.json();
    alert("Test push sent!");
  } catch (err) {
    alert("Failed: " + err.message);
  }
});


// ----- Add reminder (sends subscription + correct payload to backend) -----
async function addReminder() {
  const time = timeInput.value;
  const repeat = Number(repeatMin.value || 0);
  const until = untilInput.value || null;

  if (!time) return alert('Choose a time first');

  // Ensure service worker registration
  let reg = null;
  try {
    reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      reg = await navigator.serviceWorker.register('./sw.js');
    }
  } catch (err) {
    console.warn('SW registration check failed', err);
  }

  if (!reg) {
    return alert('Service worker not available. Please reload the page.');
  }

  // Get current push subscription
  let subscription = null;
  try {
    subscription = await reg.pushManager.getSubscription();
  } catch (err) {
    console.error('Failed to get subscription', err);
  }

  if (!subscription) {
    return alert('You must subscribe first.');
  }

  // Build payload exactly the way backend expects
  const payload = {
    subscription: subscription.toJSON ? subscription.toJSON() : subscription,
    time,
    timezoneOffsetMinutes: new Date().getTimezoneOffset() * -1,
    repeatEveryMinutes: Number(repeat || 0),
    repeatUntil: until || null
  };

  try {
    const res = await fetch(`${API_BASE}/addReminder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(()=> '');
      throw new Error('Server returned ' + res.status + ' ' + text);
    }

    const data = await res.json().catch(()=>null);
    alert('Reminder saved on server!');
    return;
  } catch (err) {
    console.warn('Failed to save reminder on server', err);
    alert('Saved locally (server unreachable).');
  }
}

// wire the button
if (btnAdd) {
  btnAdd.removeEventListener && btnAdd.removeEventListener('click', addReminder);
  btnAdd.addEventListener('click', addReminder);
}

// ---------------------------
// DELETE REMINDER
// ---------------------------
list.addEventListener("click", async (e) => {
  if (!e.target.matches("button.delete")) return;

  const id = e.target.dataset.id;

  await fetch(`${API_BASE}/deleteReminder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id })
  });

  loadReminders();
});


// ---------------------------
// HELPERS
// ---------------------------
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}


// start loading list
loadReminders();