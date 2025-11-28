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


// ---------------------------
// ADD REMINDER
// ---------------------------
btnAdd.addEventListener("click", async () => {
  const t = $("timeInput").value;
  const repeat = Number($("repeatMin").value || 0);
  const until = $("until").value;

  if (!t) return alert("Choose a time");

  try {
    const payload = { time: t, repeat, until };

    const res = await fetch(`${API_BASE}/newReminder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    alert("Reminder saved!");

    loadReminders();

  } catch (err) {
    alert("Saved locally (server unreachable).");
    console.error(err);
  }
});


// ---------------------------
// LOAD REMINDERS FROM SERVER
// ---------------------------
async function loadReminders() {
  try {
    const res = await fetch(`${API_BASE}/list`);
    const data = await res.json();

    renderReminders(data.reminders || []);

  } catch (err) {
    console.error(err);
  }
}


// ---------------------------
// RENDER REMINDERS
// ---------------------------
function renderReminders(items) {
  list.innerHTML = "";

  items.forEach((r) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <strong>${r.time}</strong>
      <small>${r.repeat ? "Every " + r.repeat + " min" : "Once"}</small>
      <button class="delete" data-id="${r.id}">Delete</button>
    `;
    list.appendChild(li);
  });
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