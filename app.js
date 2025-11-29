// app.js - Hydrate frontend (matches your index.html)
// API_BASE should point to your backend
const API_BASE = "https://hydrate-backend.fly.dev";

// convenience selector
const $ = id => document.getElementById(id);

// Elements that exist in your index.html
const permState = $("permState");
const btnRequest = $("btnRequest");
const btnSubscribe = $("btnSubscribe");
const btnSendTest = $("btnSendTest");
const btnAdd = $("btnAdd");
const list = $("list"); // this is <ul id="list"> in your markup

// Form inputs (match your HTML IDs)
const timeInput = $("timeInput") || document.querySelector("input[name=time]");
const repeatMin = $("repeatMin") || document.querySelector("input[name=repeat]");
const untilInput = $("until") || document.querySelector("input[name=until"]);

// localStorage helpers
function saveUserId(id) {
  try { localStorage.setItem("hydrateUserId", id); } catch (e) {}
}
function getUserId() {
  try { return localStorage.getItem("hydrateUserId"); } catch (e) { return null; }
}
function clearUserId() {
  try { localStorage.removeItem("hydrateUserId"); } catch (e) {}
}

// update permission UI
function updatePermissionText() {
  if (permState) permState.textContent = Notification.permission;
}

// Service worker registration (tries multiple paths)
async function registerSW() {
  if (!("serviceWorker" in navigator)) {
    console.warn("Service worker not supported");
    return null;
  }

  const candidates = [
    "/sw.js",
    "/hydrate-frontend/sw.js",
    "./sw.js",
    "sw.js"
  ];

  for (const path of candidates) {
    try {
      const reg = await navigator.serviceWorker.register(path).catch(()=>null);
      if (reg) {
        console.log("SW registered at", path, "scope:", reg.scope);
        return reg;
      }
    } catch (err) {
      console.debug("SW register failed for", path, err && err.message);
    }
  }

  // final attempt: return ready if already registered
  try {
    const ready = await navigator.serviceWorker.ready.catch(()=>null);
    if (ready) {
      console.log("Service worker ready:", ready.scope);
      return ready;
    }
  } catch (e) {}
  console.warn("Service worker registration failed");
  return null;
}

// Render reminders into your existing #list element (which is a UL)
function renderReminders(reminders) {
  if (!list) return;
  // If list is a <ul>, we'll put <li> children in it
  const isUl = list.tagName && list.tagName.toLowerCase() === "ul";
  if (isUl) {
    list.innerHTML = "";
    if (!reminders || reminders.length === 0) {
      const li = document.createElement("li");
      li.className = "reminders-empty";
      li.textContent = "No reminders";
      list.appendChild(li);

      const note = document.createElement("li");
      note.className = "reminders-note";
      note.textContent = "Reminders are stored on the server and sent at scheduled times.";
      list.appendChild(note);
      return;
    }

    reminders.forEach(r => {
      const li = document.createElement("li");
      li.className = "reminder-item";
      li.dataset.id = r.id || "";

      const left = document.createElement("div");
      left.className = "reminder-left";
      const repeatText = (r.repeatEveryMinutes && r.repeatEveryMinutes > 0)
        ? `${r.repeatEveryMinutes} min repeat${r.repeatUntil ? " until " + r.repeatUntil : ""}`
        : "one-time";
      left.innerHTML = `<strong>${r.time || "—"}</strong><div class="reminder-meta">${repeatText}</div>`;

      const right = document.createElement("div");
      right.className = "reminder-right";
      const del = document.createElement("button");
      del.className = "delete";
      del.dataset.id = r.id || "";
      del.textContent = "Delete";
      right.appendChild(del);

      li.appendChild(left);
      li.appendChild(right);
      list.appendChild(li);
    });

    return;
  }

  // fallback: non-UL container
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
    note.textContent = "Reminders are stored on the server and sent at scheduled times.";
    container.appendChild(note);
    list.appendChild(container);
    return;
  }

  const ul = document.createElement("ul");
  ul.className = "reminders-list";
  reminders.forEach(r => {
    const li = document.createElement("li");
    li.className = "reminder-item";
    li.dataset.id = r.id || "";
    const repeatText = (r.repeatEveryMinutes && r.repeatEveryMinutes > 0)
      ? `${r.repeatEveryMinutes} min repeat${r.repeatUntil ? " until " + r.repeatUntil : ""}`
      : "one-time";
    li.innerHTML = `<div class="reminder-left"><strong>${r.time || "—"}</strong><div class="reminder-meta">${repeatText}</div></div>
                    <div class="reminder-right"><button class="delete" data-id="${r.id}">Delete</button></div>`;
    ul.appendChild(li);
  });
  container.appendChild(ul);
  list.appendChild(container);
}

// Load reminders for saved user
async function loadReminders() {
  const userId = getUserId();
  if (!userId) {
    renderReminders([]);
    return;
  }

  // Preferred: /user/:id/reminders
  try {
    const res = await fetch(`${API_BASE}/user/${encodeURIComponent(userId)}/reminders`);
    if (res.ok) {
      const json = await res.json();
      if (json && Array.isArray(json.reminders)) {
        renderReminders(json.reminders);
        return;
      }
    } else if (res.status !== 404) {
      console.warn("/user/:id/reminders returned", res.status);
    }
  } catch (e) {
    console.warn("GET /user/:id/reminders failed", e);
  }

  // Fallback to /subs to detect presence (may only provide counts)
  try {
    const r2 = await fetch(`${API_BASE}/subs`);
    if (!r2.ok) { renderReminders([]); return; }
    const subs = await r2.json();
    if (!subs || !Array.isArray(subs.users)) { renderReminders([]); return; }
    const found = subs.users.find(u => String(u.id) === String(userId));
    if (!found) { renderReminders([]); return; }
    if (Array.isArray(found.reminders)) {
      renderReminders(found.reminders);
      return;
    }
    renderReminders([]);
  } catch (e) {
    console.warn("fetch /subs failed", e);
    renderReminders([]);
  }
}

// Request permission button
if (btnRequest) {
  btnRequest.addEventListener("click", async () => {
    const p = await Notification.requestPermission();
    updatePermissionText();
    alert("Permission: " + p);
  });
}

// Subscribe button
if (btnSubscribe) {
  btnSubscribe.addEventListener("click", async () => {
    try {
      const vapidRes = await fetch(`${API_BASE}/vapidPublicKey`);
      if (!vapidRes.ok) throw new Error("Failed to get VAPID key");
      const vapidKey = await vapidRes.text();
      const vapidUint8 = urlBase64ToUint8Array(vapidKey);

      let reg = await registerSW();
      if (!reg) reg = await navigator.serviceWorker.ready.catch(()=>null);
      if (!reg) throw new Error("Service worker not available");

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidUint8
      });

      const res = await fetch(`${API_BASE}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON ? sub.toJSON() : sub)
      });
      if (!res.ok) throw new Error("subscribe failed: " + res.status);
      const data = await res.json();
      if (data && data.userId) saveUserId(data.userId);
      alert("Subscribed!");
      await loadReminders();
    } catch (err) {
      console.error("subscribe error", err);
      alert("Subscription failed: " + (err && err.message));
    }
  });
}

// Send test push
if (btnSendTest) {
  btnSendTest.addEventListener("click", async () => {
    try {
      const res = await fetch(`${API_BASE}/sendNotification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      if (!res.ok) throw new Error("sendNotification error " + res.status);
      alert("Test pushed (server attempted to send).");
    } catch (err) {
      console.error("send test failed", err);
      alert("Send test failed: " + (err && err.message));
    }
  });
}

// Add reminder
async function addReminder() {
  const time = timeInput && timeInput.value;
  const repeat = Number((repeatMin && repeatMin.value) || 0);
  const until = (untilInput && untilInput.value) || null;

  if (!time) return alert("Choose a time first");

  // Ensure SW and subscription
  let reg = null;
  try {
    reg = await navigator.serviceWorker.getRegistration();
    if (!reg) reg = await registerSW();
  } catch (e) { console.warn("SW check failed", e); }
  if (!reg) return alert("Service worker not available. Please reload the page.");

  let subscription = null;
  try { subscription = await reg.pushManager.getSubscription(); } catch (e) { console.warn("getSubscription failed", e); }
  if (!subscription) return alert("You must subscribe before adding reminders.");

  const payload = {
    subscription: subscription.toJSON ? subscription.toJSON() : subscription,
    time,
    timezoneOffsetMinutes: new Date().getTimezoneOffset() * -1,
    repeatEveryMinutes: Number(repeat || 0),
    repeatUntil: until || null
  };

  try {
    const res = await fetch(`${API_BASE}/addReminder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const txt = await res.text().catch(()=>"");
      throw new Error("Server: " + res.status + " " + txt);
    }
    const data = await res.json().catch(()=>null);
    if (data && Array.isArray(data.reminders)) {
      renderReminders(data.reminders);
    } else {
      await loadReminders();
    }
    alert("Reminder saved on server!");
  } catch (err) {
    console.error("addReminder failed", err);
    alert("Failed to save reminder: " + (err && err.message));
  }
}

if (btnAdd) {
  try { btnAdd.removeEventListener && btnAdd.removeEventListener("click", addReminder); } catch(e){}
  btnAdd.addEventListener("click", addReminder);
}

// Delete handler (UI + backend if implemented)
if (list) {
  list.addEventListener("click", async (ev) => {
    if (!ev.target.matches("button.delete")) return;
    const id = ev.target.dataset.id;
    if (!id) return;
    try {
      await fetch(`${API_BASE}/deleteReminder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      }).catch(()=>null);
    } catch (e) {
      console.warn("delete request failed", e);
    }
    await loadReminders();
  });
}

// helper to convert base64 VAPID key to Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

// startup
window.addEventListener("load", async () => {
  updatePermissionText();
  // register service worker (fire-and-forget)
  registerSW().catch(()=>null);
  // load reminders for user (if any)
  loadReminders().catch(e => console.warn("loadReminders error", e));
});