// Hydrate frontend (FINAL CLEAN VERSION)

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

// input fields (match your HTML)
const timeInput = $("timeInput") || document.querySelector("input[name=time]");
const repeatMin = $("repeatMin") || document.querySelector("input[name=repeat]");
const untilInput = $("until") || document.querySelector("input[name=until]") || null;


// ---------------------------
// PERMISSION DISPLAY
// ---------------------------
function updatePermissionText() {
  if (permState) permState.textContent = Notification.permission;
}
updatePermissionText();


// ---------------------------
// SERVICE WORKER
// ---------------------------
async function registerSW() {
  if (!("serviceWorker" in navigator)) return;

  try {
    // Your SW lives here on GitHub Pages
    const reg = await navigator.serviceWorker.register("/hydrate-frontend/sw.js");
    console.log("SW registered:", reg.scope);
  } catch (err) {
    console.error("SW registration failed:", err);
  }
}
registerSW();


// ---------------------------
// LOCAL STORAGE HELPERS
// ---------------------------
function saveUserId(id) {
  try { localStorage.setItem("hydrateUserId", id); } catch (e) {}
}
function getUserId() {
  try { return localStorage.getItem("hydrateUserId"); } catch (e) { return null; }
}
function clearUserId() {
  try { localStorage.removeItem("hydrateUserId"); } catch (e) {}
}


// ---------------------------
// RENDER REMINDERS
// ---------------------------
function renderReminders(reminders) {
  if (!list) return;
  list.innerHTML = "";

  const container = document.createElement("div");
  container.className = "reminders-container";

  if (!reminders || reminders.length === 0) {
    const empty = document.createElement("div");
    empty.className = "reminders-empty";
    empty.textContent = "No reminders";
    container.appendChild(empty);

    const note = document.createElement("div");
    note.className = "reminders-note";
    note.textContent = "Reminders are stored on the server and sent automatically.";
    container.appendChild(note);

    list.appendChild(container);
    return;
  }

  const ul = document.createElement("ul");
  ul.className = "reminders-list";

  reminders.forEach((r) => {
    const li = document.createElement("li");
    li.className = "reminder-item";
    li.dataset.id = r.id || "";

    const left = document.createElement("div");
    left.className = "reminder-left";
    left.innerHTML = `
      <strong>${r.time || "-"}</strong>
      <div class="reminder-meta">
        ${r.repeatEveryMinutes || 0} min repeat
        ${r.repeatUntil ? " until " + r.repeatUntil : ""}
      </div>
    `;

    const right = document.createElement("div");
    right.className = "reminder-right";

    const del = document.createElement("button");
    del.className = "delete";
    del.dataset.id = r.id || "";
    del.textContent = "Delete";

    right.appendChild(del);
    li.appendChild(left);
    li.appendChild(right);
    ul.appendChild(li);
  });

  container.appendChild(ul);
  list.appendChild(container);
}


// ---------------------------
// LOAD REMINDERS FOR USER
// ---------------------------
async function loadReminders() {
  const userId = getUserId();
  if (!userId) {
    renderReminders([]);
    return;
  }

  // call backend endpoint (you will add this in server.js)
  try {
    const res = await fetch(`${API_BASE}/user/${encodeURIComponent(userId)}/reminders`);
    if (res.ok) {
      const json = await res.json();
      renderReminders(json.reminders || []);
      return;
    }
  } catch (err) {
    console.warn("Could not load /user/:id/reminders", err);
  }

  // fallback: show empty
  renderReminders([]);
}


// ---------------------------
// REQUEST NOTIFICATION PERMISSION
// ---------------------------
if (btnRequest) {
  btnRequest.addEventListener("click", async () => {
    const perm = await Notification.requestPermission();
    updatePermissionText();
    alert(`Permission: ${perm}`);
  });
}


// ---------------------------
// SUBSCRIBE
// ---------------------------
if (btnSubscribe) {
  btnSubscribe.addEventListener("click", async () => {
    try {
      // load public key
      const vapidRes = await fetch(`${API_BASE}/vapidPublicKey`);
      const vapidKey = await vapidRes.text();
      const vapidUint8 = urlBase64ToUint8Array(vapidKey);

      const reg = await navigator.serviceWorker.ready;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidUint8
      });

      // send to backend
      const res = await fetch(`${API_BASE}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub)
      });

      const data = await res.json();
      if (data.userId) saveUserId(data.userId);

      alert("Subscribed!");
      await loadReminders();

    } catch (err) {
      alert("Subscription failed: " + err.message);
      console.error(err);
    }
  });
}


// ---------------------------
// TEST PUSH
// ---------------------------
if (btnSendTest) {
  btnSendTest.addEventListener("click", async () => {
    try {
      await fetch(`${API_BASE}/sendNotification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      alert("Test push sent!");
    } catch (err) {
      alert("Failed: " + err.message);
    }
  });
}


// ---------------------------
// ADD REMINDER
// ---------------------------
async function addReminder() {
  const time = timeInput.value;
  const repeat = Number(repeatMin.value || 0);
  const until = untilInput ? untilInput.value : null;

  if (!time) return alert("Choose a time first");

  // ensure SW ready
  let reg = await navigator.serviceWorker.getRegistration();
  if (!reg) {
    reg = await navigator.serviceWorker.register("/hydrate-frontend/sw.js");
  }

  const subscription = await reg.pushManager.getSubscription();
  if (!subscription) return alert("Subscribe first.");

  const payload = {
    subscription: subscription.toJSON(),
    time,
    timezoneOffsetMinutes: new Date().getTimezoneOffset() * -1,
    repeatEveryMinutes: repeat,
    repeatUntil: until || null
  };

  try {
    const res = await fetch(`${API_BASE}/addReminder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.reminders) renderReminders(data.reminders);
    else await loadReminders();

    alert("Reminder saved!");
  } catch (err) {
    alert("Could not save reminder: " + err.message);
  }
}

if (btnAdd) {
  btnAdd.addEventListener("click", addReminder);
}


// ---------------------------
// DELETE REMINDER
// ---------------------------
if (list) {
  list.addEventListener("click", async (e) => {
    if (!e.target.matches("button.delete")) return;

    const id = e.target.dataset.id;

    try {
      await fetch(`${API_BASE}/deleteReminder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
    } catch (err) {
      console.warn("Delete failed", err);
    }

    await loadReminders();
  });
}


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


// ---------------------------
// ON LOAD
// ---------------------------
window.addEventListener("load", () => {
  updatePermissionText();
  loadReminders();
});
