// ---------------------------
// CONFIG
// ---------------------------
const API_BASE = "https://hydrate-backend.fly.dev";

// quick selector
const $ = (id) => document.getElementById(id);

// UI elements
const permState = $("permState");
const btnRequest = $("btnRequest");
const btnSubscribe = $("btnSubscribe");
const btnSendTest = $("btnSendTest");
const btnAdd = $("btnAdd");
const list = $("list");

// input fields
const timeInput = $("timeInput");
const repeatMin = $("repeatMin");
const untilInput = document.getElementById("until");

// ---------------------------
// PERMISSION
// ---------------------------
function updatePermissionText() {
  permState.textContent = Notification.permission;
}
updatePermissionText();

// ---------------------------
// SERVICE WORKER
// ---------------------------
async function registerSW() {
  try {
    const reg = await navigator.serviceWorker.register("./sw.js");
    console.log("SW registered", reg.scope);
  } catch (err) {
    console.error("SW register failed:", err);
  }
}
registerSW();

// ---------------------------
// USER ID STORAGE
// ---------------------------
function saveUserId(id) {
  localStorage.setItem("hydrateUserId", id);
}
function getUserId() {
  return localStorage.getItem("hydrateUserId");
}

// ---------------------------
// RENDER REMINDERS
// ---------------------------
function renderReminders(reminders) {
  list.innerHTML = "";

  if (!reminders || reminders.length === 0) {
    list.innerHTML = `<li class="muted">No reminders</li>`;
    return;
  }

  for (const r of reminders) {
    const li = document.createElement("li");
    li.innerHTML = `
      <div>
        <strong>${r.time}</strong> 
        <small>${r.repeatEveryMinutes} min ${
          r.repeatUntil ? "until " + r.repeatUntil : ""
        }</small>
      </div>
      <button class="delete" data-id="${r.id}">Delete</button>
    `;
    list.appendChild(li);
  }
}

// ---------------------------
// LOAD REMINDERS
// ---------------------------
async function loadReminders() {
  const userId = getUserId();
  if (!userId) {
    renderReminders([]);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/user/${userId}/reminders`);
    const data = await res.json();
    renderReminders(data.reminders || []);
  } catch (e) {
    console.error("loadReminders error:", e);
    renderReminders([]);
  }
}

// ---------------------------
// REQUEST NOTIFICATIONS
// ---------------------------
btnRequest.addEventListener("click", async () => {
  const perm = await Notification.requestPermission();
  updatePermissionText();
  alert("Permission: " + perm);
});

// ---------------------------
// SUBSCRIBE
// ---------------------------
btnSubscribe.addEventListener("click", async () => {
  try {
    // get VAPID key
    const key = await (await fetch(`${API_BASE}/vapidPublicKey`)).text();
    const reg = await navigator.serviceWorker.ready;

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });

    const res = await fetch(`${API_BASE}/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub),
    });

    const data = await res.json();
    saveUserId(data.userId);

    alert("Subscribed!");

    loadReminders();
  } catch (err) {
    alert("Subscribe failed");
    console.error(err);
  }
});

// ---------------------------
// SEND TEST PUSH
// ---------------------------
btnSendTest.addEventListener("click", async () => {
  await fetch(`${API_BASE}/sendNotification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  alert("Test push sent!");
});

// ---------------------------
// ADD REMINDER
// ---------------------------
btnAdd.addEventListener("click", async () => {
  const time = timeInput.value;
  const repeat = repeatMin.value;
  const until = untilInput.value || null;

  if (!time) return alert("Select a time first");

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return alert("Subscribe first!");

  const payload = {
    subscription: sub.toJSON(),
    time,
    timezoneOffsetMinutes: new Date().getTimezoneOffset() * -1,
    repeatEveryMinutes: Number(repeat),
    repeatUntil: until,
  };

  const res = await fetch(`${API_BASE}/addReminder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  renderReminders(data.reminders || []);

  alert("Reminder added!");
});

// ---------------------------
// DELETE REMINDER
// ---------------------------
list.addEventListener("click", async (e) => {
  if (!e.target.classList.contains("delete")) return;

  const id = e.target.dataset.id;

  await fetch(`${API_BASE}/deleteReminder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });

  loadReminders();
});

// ---------------------------
// UTILITY
// ---------------------------
function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base);
  return Uint8Array.from([...raw].map((ch) => ch.charCodeAt(0)));
}

// ---------------------------
// INITIAL LOAD
// ---------------------------
window.addEventListener("load", () => {
  updatePermissionText();
  loadReminders();
});