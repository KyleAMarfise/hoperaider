import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  GoogleAuthProvider,
  OAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { appSettings, firebaseConfig } from "../config/prod/firebase-config.js";

// ── DOM refs ──────────────────────────────────────────────────────────────────
const authStatus = document.getElementById("adminAuthStatus");
const appShell = document.getElementById("appShell");
const authGate = document.getElementById("authGate");
const authGateMessage = document.getElementById("authGateMessage");
const authGateSignInButton = document.getElementById("authGateSignInButton");
const authGateYahooButton = document.getElementById("authGateYahooButton");
const currentUidEl = document.getElementById("currentUid");
const copyUidButton = document.getElementById("copyUidButton");
const signOutButton = document.getElementById("signOutButton");
const siteTitleEl = document.getElementById("siteTitle");
const guildDiscordLink = document.getElementById("guildDiscordLink");

const scheduleTitleEl = document.getElementById("scheduleTitle");
const editTitleButton = document.getElementById("editTitleButton");
const editTitleForm = document.getElementById("editTitleForm");
const editTitleInput = document.getElementById("editTitleInput");
const saveTitleButton = document.getElementById("saveTitleButton");
const cancelTitleButton = document.getElementById("cancelTitleButton");

const scheduleContent = document.getElementById("scheduleContent");
const scheduleHeaderActions = document.getElementById("scheduleHeaderActions");
const addDayButton = document.getElementById("addDayButton");
const scheduleMessage = document.getElementById("scheduleMessage");

// Goals
const goalsTitleEl = document.getElementById("goalsTitle");
const goalsList = document.getElementById("goalsList");
const editGoalsButton = document.getElementById("editGoalsButton");
const goalsEditForm = document.getElementById("goalsEditForm");
const goalsTitleInput = document.getElementById("goalsTitleInput");
const goalsInput = document.getElementById("goalsInput");
const saveGoalsButton = document.getElementById("saveGoalsButton");
const cancelGoalsButton = document.getElementById("cancelGoalsButton");

// Add Day dialog
const addDayDialog = document.getElementById("addDayDialog");
const addDayDay = document.getElementById("addDayDay");
const addDayEmoji = document.getElementById("addDayEmoji");
const addDayTitle = document.getElementById("addDayTitle");
const addDayStart = document.getElementById("addDayStart");
const addDayEnd = document.getElementById("addDayEnd");
const addDayDetails = document.getElementById("addDayDetails");
const addDaySaveButton = document.getElementById("addDaySaveButton");
const addDayCancelButton = document.getElementById("addDayCancelButton");
const addDayMessage = document.getElementById("addDayMessage");

// ── State ─────────────────────────────────────────────────────────────────────
let authUid = null;
let isAdmin = false;
let isOwner = false;
let db = null;
let scheduleEntries = [];
let scheduleTitle = "HOPE GUILD RAID SCHEDULE";
let scheduleGoals = [];
let scheduleGoalsTitle = "Goals";
let unsubscribeSchedule = null;
let unsubscribeConfig = null;
let editingId = null;

const DAY_ORDER = ["Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Monday"];

// ── Default schedule ──────────────────────────────────────────────────────────
// startHour/endHour are CST (24h). null = no scheduled time (off/flex day).
const DEFAULT_SCHEDULE = [
  { day: "Tuesday", emoji: "\u{1F40D}", title: "SSC PROGRESSION", startHour: 19, endHour: 22, details: ["3-hour push \u2013 as far as we can go", "Focus: clean progression + learning fights"], sortOrder: 0 },
  { day: "Wednesday", emoji: "\u26A1", title: "TK PROGRESSION", startHour: 19, endHour: 22, details: ["3-hour push \u2013 as far as we can go", "Focus: consistency + boss progression"], sortOrder: 1 },
  { day: "Thursday", emoji: "\u{1F4A4}", title: "OPEN NIGHT", startHour: null, endHour: null, details: ["Phil taking a recharge day", "Open for other raid leads to host \u{1F440}"], sortOrder: 2 },
  { day: "Friday", emoji: "\u{1F525}", title: "GRUUL + EASY SSC FARM", startHour: 19, endHour: 22, details: ["Gruul\u2019s Lair (full clear)", "Then SSC: Hydross \u2192 Lurker \u2192 Leotheras \u2192 Karathress", "(Optional Tidewalker if group is smooth)", "Goal: fast tokens + clean bosses only"], sortOrder: 3 },
  { day: "Saturday", emoji: "\u2694\uFE0F", title: "GRUUL + EASY SSC FARM (ROUND 2)", startHour: 19, endHour: 22, details: ["Gruul\u2019s Lair (full clear)", "Then SSC: Hydross \u2192 Lurker \u2192 Leotheras \u2192 Karathress", "(Optional Tidewalker if group is strong)", "Alt-friendly + fast clears"], sortOrder: 4 },
  { day: "Sunday", emoji: "\u{1F33F}", title: "DAY OFF / FLEX", startHour: null, endHour: null, details: ["Chill day", "Open for 10-man Karazhan runs"], sortOrder: 5 },
  { day: "Monday", emoji: "\u{1F4B0}", title: "TK \"LOOT REAVER ONLY\" RUNS", startHour: null, endHour: null, details: ["In \u2192 kill \u2192 out \u2192 repeat", "Running all alts if you\u2019re not saved", "FREE shoulders week"], sortOrder: 6 }
];

// ── Viewer timezone detection ─────────────────────────────────────────────────
function detectViewerTimezoneLabel() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (["America/Chicago", "America/Winnipeg", "America/Matamoros"].includes(tz)) return "CST";
    if (["America/New_York", "America/Detroit", "America/Toronto"].includes(tz)) return "EST";
    if (["America/Denver", "America/Boise", "America/Phoenix"].includes(tz)) return "MST";
    if (["America/Los_Angeles", "America/Vancouver", "America/Tijuana"].includes(tz)) return "PST";
  } catch { }
  return "";
}
const VIEWER_TZ = detectViewerTimezoneLabel();

// ── Time / Timezone helpers ───────────────────────────────────────────────────
const START_HOURS = Array.from({ length: 24 }, (_, i) => i);
const END_HOURS = Array.from({ length: 24 }, (_, i) => i + 1);

function hourLabel(h) {
  const n = h % 24;
  const suffix = n >= 12 ? "PM" : "AM";
  const t = n % 12 === 0 ? 12 : n % 12;
  return `${t}:00 ${suffix}`;
}

function shiftHourFromCst(h, delta) {
  return ((h + delta) % 24 + 24) % 24;
}

function buildTimezoneLines(startHour, endHour) {
  if (!Number.isInteger(startHour) || !Number.isInteger(endHour)) return [];
  const zones = [
    { label: "CST", delta: 0 },
    { label: "EST", delta: 1 },
    { label: "MST", delta: -1 },
    { label: "PST", delta: -2 }
  ];
  return zones.map((z) => {
    const s = shiftHourFromCst(startHour, z.delta);
    const e = shiftHourFromCst(endHour, z.delta);
    return { label: z.label, text: `${z.label} ${hourLabel(s)} \u2013 ${hourLabel(e)}` };
  });
}

function renderTimezoneBlock(startHour, endHour) {
  const lines = buildTimezoneLines(startHour, endHour);
  if (!lines.length) return "";
  return `<div class="sched-time">${lines.map((l) => {
    const classes = ["sched-tz-line"];
    if (l.label === "CST") classes.push("sched-tz-cst");
    if (VIEWER_TZ && l.label === VIEWER_TZ) classes.push("sched-tz-local");
    return `<span class="${classes.join(" ")}">${escapeHtml(l.text)}</span>`;
  }).join("")}</div>`;
}

function hourSelectOptions(hours, selected) {
  const placeholder = `<option value="">None</option>`;
  return placeholder + hours.map((h) =>
    `<option value="${h}" ${h === selected ? "selected" : ""}>${hourLabel(h)}</option>`
  ).join("");
}

// ── Helpers ───────────────────────────────────────────────────────────────────
if (siteTitleEl) siteTitleEl.textContent = appSettings.siteTitle || "Hope Raid Tracker";
if (guildDiscordLink) guildDiscordLink.href = appSettings.discordInviteUrl || "https://discord.gg/H2MtWtBGGC";

function hasConfigValues() {
  return firebaseConfig && firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("REPLACE_ME") && firebaseConfig.projectId && !firebaseConfig.projectId.includes("REPLACE_ME");
}

function setMessage(target, text, isError = false) {
  if (!target) return;
  target.textContent = text;
  target.classList.toggle("error", isError);
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

// ── Auth gate ─────────────────────────────────────────────────────────────────
function setAuthGateState(signedIn, message = "", isError = false) {
  if (authGate) authGate.hidden = signedIn;
  if (appShell) appShell.hidden = !signedIn;
  if (message && authGateMessage) { authGateMessage.textContent = message; authGateMessage.classList.toggle("error", isError); }
}
function updateAuthActionButtons(user) {
  const s = !!user;
  if (signOutButton) signOutButton.hidden = !s;
  if (currentUidEl) currentUidEl.hidden = !s;
  if (copyUidButton) copyUidButton.hidden = !s;
}
function updateUidDisplay(uid) {
  if (currentUidEl) { currentUidEl.textContent = uid ? `UID: ${uid}` : ""; currentUidEl.hidden = !uid; }
  if (copyUidButton) copyUidButton.hidden = !uid;
}
function getAuthErrorMessage(error) {
  const code = error && error.code;
  switch (code) {
    case "auth/popup-blocked": return "Sign-in popup was blocked.";
    case "auth/popup-closed-by-user": return "Sign-in cancelled.";
    case "auth/cancelled-popup-request": return "Sign-in cancelled.";
    case "auth/network-request-failed": return "Network error.";
    default: return (error && error.message) || "Sign-in failed.";
  }
}
function getEmailAuthErrorMessage(error) {
  const code = error && error.code;
  switch (code) {
    case "auth/invalid-email": return "Invalid email address.";
    case "auth/user-disabled": return "Account disabled.";
    case "auth/user-not-found": return "No account found. Click Create Account.";
    case "auth/wrong-password": return "Incorrect password.";
    case "auth/invalid-credential": return "Invalid email or password.";
    case "auth/email-already-in-use": return "Account exists. Try signing in.";
    case "auth/weak-password": return "Password must be at least 6 characters.";
    case "auth/too-many-requests": return "Too many attempts. Try later.";
    default: return getAuthErrorMessage(error);
  }
}

// ── Title ─────────────────────────────────────────────────────────────────────
function updateTitleDisplay() {
  if (scheduleTitleEl) scheduleTitleEl.textContent = scheduleTitle;
  if (editTitleButton) editTitleButton.hidden = !isAdmin;
}

function showTitleEdit() {
  if (editTitleInput) editTitleInput.value = scheduleTitle;
  if (editTitleForm) editTitleForm.hidden = false;
  if (scheduleTitleEl) scheduleTitleEl.hidden = true;
  if (editTitleButton) editTitleButton.hidden = true;
}

function hideTitleEdit() {
  if (editTitleForm) editTitleForm.hidden = true;
  if (scheduleTitleEl) scheduleTitleEl.hidden = false;
  updateTitleDisplay();
}

async function saveTitle() {
  const newTitle = editTitleInput ? editTitleInput.value.trim() : "";
  if (!newTitle) return;
  saveTitleButton.disabled = true;
  try {
    await setDoc(doc(db, "schedule", "scheduleConfig"), { title: newTitle, updatedAt: serverTimestamp() }, { merge: true });
    hideTitleEdit();
  } catch (error) {
    setMessage(scheduleMessage, error.message, true);
  } finally {
    saveTitleButton.disabled = false;
  }
}

// ── Goals ─────────────────────────────────────────────────────────────────────
function renderGoals() {
  if (goalsTitleEl) goalsTitleEl.textContent = scheduleGoalsTitle;
  if (goalsList) {
    if (scheduleGoals.length) {
      goalsList.innerHTML = scheduleGoals.map((g) => `<li>${escapeHtml(g)}</li>`).join("");
      goalsList.hidden = false;
    } else {
      goalsList.innerHTML = `<li style="color:var(--text-dim);font-style:italic">No goals set yet.</li>`;
      goalsList.hidden = false;
    }
  }
  if (editGoalsButton) editGoalsButton.hidden = !isAdmin;
}

function showGoalsEdit() {
  if (goalsTitleInput) goalsTitleInput.value = scheduleGoalsTitle;
  if (goalsInput) goalsInput.value = scheduleGoals.join("\n");
  if (goalsEditForm) goalsEditForm.hidden = false;
  if (goalsList) goalsList.hidden = true;
  if (goalsTitleEl) goalsTitleEl.hidden = true;
  if (editGoalsButton) editGoalsButton.hidden = true;
}

function hideGoalsEdit() {
  if (goalsEditForm) goalsEditForm.hidden = true;
  if (goalsList) goalsList.hidden = false;
  if (goalsTitleEl) goalsTitleEl.hidden = false;
  renderGoals();
}

async function saveGoals() {
  const title = goalsTitleInput ? goalsTitleInput.value.trim() : "Goals";
  const lines = goalsInput ? goalsInput.value.split("\n").map((l) => l.trim()).filter(Boolean) : [];
  if (saveGoalsButton) saveGoalsButton.disabled = true;
  try {
    await setDoc(doc(db, "schedule", "scheduleConfig"), { goalsTitle: title, goals: lines, updatedAt: serverTimestamp() }, { merge: true });
    hideGoalsEdit();
  } catch (error) {
    setMessage(scheduleMessage, error.message, true);
  } finally {
    if (saveGoalsButton) saveGoalsButton.disabled = false;
  }
}

// ── Rendering ─────────────────────────────────────────────────────────────────
function renderSchedule() {
  if (!scheduleContent) return;
  if (scheduleHeaderActions) scheduleHeaderActions.hidden = !isAdmin;

  const sorted = [...scheduleEntries].sort((a, b) => {
    const ai = DAY_ORDER.indexOf(a.day);
    const bi = DAY_ORDER.indexOf(b.day);
    if (ai !== bi) return ai - bi;
    return (a.sortOrder || 0) - (b.sortOrder || 0);
  });

  if (!sorted.length) {
    scheduleContent.innerHTML = `<p class="schedule-empty">No schedule entries yet.</p>`;
    return;
  }

  scheduleContent.innerHTML = sorted.map((entry) => {
    if (editingId === entry.id) return renderEditRow(entry);
    return renderViewRow(entry);
  }).join("");

  bindEvents();
}

function renderViewRow(entry) {
  const details = Array.isArray(entry.details) ? entry.details : [];
  let startHour = Number.isInteger(entry.startHour) ? entry.startHour : null;
  let endHour = Number.isInteger(entry.endHour) ? entry.endHour : null;
  // Legacy fallback: if old freeform `time` field exists but no hour fields, show it as text
  const legacyTime = (!startHour && !endHour && entry.time) ? entry.time : null;

  const adminActions = isAdmin ? `
    <div class="sched-row-actions">
      <button type="button" class="sched-action-btn sched-edit-btn" data-id="${escapeHtml(entry.id)}" title="Edit">&#9998;</button>
      <button type="button" class="sched-action-btn sched-delete-btn" data-id="${escapeHtml(entry.id)}" title="Delete">&times;</button>
    </div>
  ` : "";

  const timeBlock = legacyTime
    ? `<div class="sched-time"><span class="sched-tz-cst">${escapeHtml(legacyTime)}</span></div>`
    : renderTimezoneBlock(startHour, endHour);

  return `
    <div class="sched-row" data-id="${escapeHtml(entry.id)}">
      <div class="sched-row-columns">
        <div class="sched-row-left">
          <div class="sched-row-head">
            <span class="sched-emoji">${escapeHtml(entry.emoji || "")}</span>
            <span class="sched-day">${escapeHtml(entry.day)}</span>
            <span class="sched-sep">\u2013</span>
            <span class="sched-title">${escapeHtml(entry.title)}</span>
          </div>
          ${details.length ? `<ul class="sched-details">${details.map((d) => `<li>${escapeHtml(d)}</li>`).join("")}</ul>` : ""}
        </div>
        <div class="sched-row-right">
          ${timeBlock}
          ${adminActions}
        </div>
      </div>
    </div>
  `;
}

function renderEditRow(entry) {
  const details = Array.isArray(entry.details) ? entry.details : [];
  const startHour = Number.isInteger(entry.startHour) ? entry.startHour : null;
  const endHour = Number.isInteger(entry.endHour) ? entry.endHour : null;
  return `
    <div class="sched-row sched-row-editing" data-id="${escapeHtml(entry.id)}">
      <div class="sched-edit-fields">
        <div class="sched-edit-row">
          <label class="sched-edit-label">
            Day
            <select class="sched-input sched-input-day">
              ${DAY_ORDER.map((d) => `<option value="${d}" ${d === entry.day ? "selected" : ""}>${d}</option>`).join("")}
            </select>
          </label>
          <label class="sched-edit-label sched-edit-label-sm">
            Emoji
            <input class="sched-input sched-input-emoji" type="text" maxlength="4" value="${escapeHtml(entry.emoji || "")}" />
          </label>
        </div>
        <label class="sched-edit-label">
          Title
          <input class="sched-input sched-input-title" type="text" maxlength="80" value="${escapeHtml(entry.title || "")}" />
        </label>
        <div class="sched-edit-row">
          <label class="sched-edit-label">
            Start Time (CST) <small class="help-text">(leave as None for off/flex days)</small>
            <select class="sched-input sched-input-start">${hourSelectOptions(START_HOURS, startHour)}</select>
          </label>
          <label class="sched-edit-label">
            End Time (CST) <small class="help-text">&nbsp;</small>
            <select class="sched-input sched-input-end">${hourSelectOptions(END_HOURS, endHour)}</select>
          </label>
        </div>
        <label class="sched-edit-label">
          Details <small class="help-text">(one per line — bullets are added automatically)</small>
          <textarea class="sched-input sched-input-details" rows="5">${escapeHtml(details.join("\n"))}</textarea>
        </label>
      </div>
      <div class="sched-edit-actions">
        <button type="button" class="sched-save-btn" data-id="${escapeHtml(entry.id)}">Save</button>
        <button type="button" class="sched-cancel-btn secondary">Cancel</button>
      </div>
      <p class="sched-edit-msg message"></p>
    </div>
  `;
}

function bindEvents() {
  scheduleContent.querySelectorAll(".sched-edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => { editingId = btn.dataset.id; renderSchedule(); });
  });
  scheduleContent.querySelectorAll(".sched-delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteEntry(btn.dataset.id));
  });
  scheduleContent.querySelectorAll(".sched-cancel-btn").forEach((btn) => {
    btn.addEventListener("click", () => { editingId = null; renderSchedule(); });
  });
  scheduleContent.querySelectorAll(".sched-save-btn").forEach((btn) => {
    btn.addEventListener("click", () => saveEntry(btn.dataset.id));
  });
}

// ── CRUD ──────────────────────────────────────────────────────────────────────
async function saveEntry(docId) {
  const row = scheduleContent.querySelector(`.sched-row-editing[data-id="${docId}"]`);
  if (!row) return;
  const day = row.querySelector(".sched-input-day").value;
  const emoji = row.querySelector(".sched-input-emoji").value.trim();
  const title = row.querySelector(".sched-input-title").value.trim();
  const startRaw = row.querySelector(".sched-input-start").value;
  const endRaw = row.querySelector(".sched-input-end").value;
  const startHour = startRaw === "" ? null : Number(startRaw);
  const endHour = endRaw === "" ? null : Number(endRaw);
  const details = row.querySelector(".sched-input-details").value.split("\n").map((l) => l.trim()).filter(Boolean);
  const msgEl = row.querySelector(".sched-edit-msg");

  if (!title) { setMessage(msgEl, "Title is required.", true); return; }

  const saveBtn = row.querySelector(".sched-save-btn");
  saveBtn.disabled = true;
  try {
    await updateDoc(doc(db, "schedule", docId), { day, emoji, title, startHour, endHour, details, sortOrder: DAY_ORDER.indexOf(day), updatedAt: serverTimestamp() });
    editingId = null;
    setMessage(scheduleMessage, "Saved.", false);
  } catch (error) {
    setMessage(msgEl, error.message, true);
  } finally {
    saveBtn.disabled = false;
  }
}

function openAddDayDialog() {
  if (!addDayDialog) return;
  if (addDayDay) addDayDay.value = "Tuesday";
  if (addDayEmoji) addDayEmoji.value = "";
  if (addDayTitle) addDayTitle.value = "";
  if (addDayStart) addDayStart.innerHTML = hourSelectOptions(START_HOURS, null);
  if (addDayEnd) addDayEnd.innerHTML = hourSelectOptions(END_HOURS, null);
  if (addDayDetails) addDayDetails.value = "";
  setMessage(addDayMessage, "");
  addDayDialog.showModal();
}

async function addNewEntry() {
  const day = addDayDay ? addDayDay.value : "Tuesday";
  const emoji = addDayEmoji ? addDayEmoji.value.trim() : "";
  const title = addDayTitle ? addDayTitle.value.trim() : "";
  const startRaw = addDayStart ? addDayStart.value : "";
  const endRaw = addDayEnd ? addDayEnd.value : "";
  const startHour = startRaw === "" ? null : Number(startRaw);
  const endHour = endRaw === "" ? null : Number(endRaw);
  const details = addDayDetails ? addDayDetails.value.split("\n").map((l) => l.trim()).filter(Boolean) : [];

  if (!title) { setMessage(addDayMessage, "Title is required.", true); return; }

  if (addDaySaveButton) addDaySaveButton.disabled = true;
  try {
    await addDoc(collection(db, "schedule"), { day, emoji, title, startHour, endHour, details, sortOrder: DAY_ORDER.indexOf(day), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    if (addDayDialog) addDayDialog.close();
    setMessage(scheduleMessage, "Day added.", false);
  } catch (error) {
    setMessage(addDayMessage, error.message, true);
  } finally {
    if (addDaySaveButton) addDaySaveButton.disabled = false;
  }
}

async function deleteEntry(docId) {
  if (!confirm("Delete this day from the schedule?")) return;
  try {
    await deleteDoc(doc(db, "schedule", docId));
    if (editingId === docId) editingId = null;
    setMessage(scheduleMessage, "Deleted.", false);
  } catch (error) {
    setMessage(scheduleMessage, error.message, true);
  }
}

// ── Seed ──────────────────────────────────────────────────────────────────────
async function seedDefaultSchedule() {
  const scheduleRef = collection(db, "schedule");
  const snap = await getDocs(scheduleRef);
  // Check if only the scheduleConfig doc exists (or empty)
  const realDocs = snap.docs.filter((d) => d.id !== "scheduleConfig");
  if (realDocs.length > 0) return;
  for (const entry of DEFAULT_SCHEDULE) {
    await addDoc(scheduleRef, { ...entry, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
  // Seed default title
  await setDoc(doc(db, "schedule", "scheduleConfig"), { title: "HOPE GUILD RAID SCHEDULE | PHASE 2", goals: ["Progress early week", "Farm efficiently late week", "Gear guild + alts"], updatedAt: serverTimestamp() }, { merge: true });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
{
  if (!hasConfigValues()) setMessage(scheduleMessage, "Firebase config missing.", true);

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  db = getFirestore(app);

  const scheduleRef = collection(db, "schedule");
  const googleProvider = new GoogleAuthProvider();
  const yahooProvider = new OAuthProvider("yahoo.com");

  async function performSignIn(provider) {
    const buttons = [authGateSignInButton, authGateYahooButton].filter(Boolean);
    buttons.forEach((b) => (b.disabled = true));
    try { await signInWithPopup(auth, provider); setAuthGateState(true); }
    catch (error) { const t = getAuthErrorMessage(error); if (authStatus) authStatus.textContent = t; setAuthGateState(false, t, true); }
    finally { buttons.forEach((b) => (b.disabled = false)); }
  }

  if (authGateSignInButton) authGateSignInButton.addEventListener("click", () => performSignIn(googleProvider));
  if (authGateYahooButton) authGateYahooButton.addEventListener("click", () => performSignIn(yahooProvider));

  const authGateEmailForm = document.getElementById("authGateEmailForm");
  const authGateEmail = document.getElementById("authGateEmail");
  const authGatePassword = document.getElementById("authGatePassword");
  const authGateCreateAccount = document.getElementById("authGateCreateAccount");

  async function performEmailSignIn(isCreate) {
    const email = authGateEmail ? authGateEmail.value.trim() : "";
    const password = authGatePassword ? authGatePassword.value : "";
    if (!email || !password) return;
    const allBtns = [authGateSignInButton, authGateYahooButton, authGateEmailForm?.querySelector("[type=submit]"), authGateCreateAccount].filter(Boolean);
    allBtns.forEach((b) => (b.disabled = true));
    try {
      if (isCreate) { await createUserWithEmailAndPassword(auth, email, password); }
      else {
        try { await signInWithEmailAndPassword(auth, email, password); }
        catch (e) {
          if (e?.code === "auth/user-not-found" || e?.code === "auth/invalid-credential") {
            try { await createUserWithEmailAndPassword(auth, email, password); }
            catch (c) { if (c?.code === "auth/email-already-in-use") throw { code: "auth/wrong-password" }; throw c; }
          } else throw e;
        }
      }
      setAuthGateState(true);
    } catch (error) { const t = getEmailAuthErrorMessage(error); if (authStatus) authStatus.textContent = t; setAuthGateState(false, t, true); }
    finally { allBtns.forEach((b) => (b.disabled = false)); }
  }

  if (authGateEmailForm) authGateEmailForm.addEventListener("submit", (e) => { e.preventDefault(); performEmailSignIn(false); });
  if (authGateCreateAccount) authGateCreateAccount.addEventListener("click", () => performEmailSignIn(true));
  if (signOutButton) signOutButton.addEventListener("click", async () => {
    signOutButton.disabled = true;
    try { await signOut(auth); } catch (e) { setMessage(scheduleMessage, e.message, true); } finally { signOutButton.disabled = false; }
  });
  if (copyUidButton) copyUidButton.addEventListener("click", async () => {
    const uid = String(authUid || "").trim(); if (!uid) return;
    try { await navigator.clipboard.writeText(uid); if (authStatus) authStatus.textContent = "UID copied."; } catch { }
  });

  if (addDayButton) addDayButton.addEventListener("click", openAddDayDialog);
  if (addDaySaveButton) addDaySaveButton.addEventListener("click", addNewEntry);
  if (addDayCancelButton) addDayCancelButton.addEventListener("click", () => { if (addDayDialog) addDayDialog.close(); });
  if (editTitleButton) editTitleButton.addEventListener("click", showTitleEdit);
  if (saveTitleButton) saveTitleButton.addEventListener("click", saveTitle);
  if (cancelTitleButton) cancelTitleButton.addEventListener("click", hideTitleEdit);
  if (editGoalsButton) editGoalsButton.addEventListener("click", showGoalsEdit);
  if (saveGoalsButton) saveGoalsButton.addEventListener("click", saveGoals);
  if (cancelGoalsButton) cancelGoalsButton.addEventListener("click", hideGoalsEdit);

  // ── Auth state ──────────────────────────────────────────────────────────────
  let authGeneration = 0;

  onAuthStateChanged(auth, async (user) => {
    const gen = ++authGeneration;

    if (unsubscribeSchedule) { unsubscribeSchedule(); unsubscribeSchedule = null; }
    if (unsubscribeConfig) { unsubscribeConfig(); unsubscribeConfig = null; }

    if (!user) {
      authUid = null; isAdmin = false; isOwner = false;
      scheduleEntries = []; editingId = null; scheduleGoals = [];
      renderSchedule(); updateTitleDisplay(); renderGoals();
      setAuthGateState(false, "Sign in to view the raid schedule.");
      updateAuthActionButtons(null); updateUidDisplay("");
      if (authStatus) authStatus.textContent = "Signed out.";
      return;
    }

    authUid = user.uid;
    setAuthGateState(true);
    updateAuthActionButtons(user);
    updateUidDisplay(authUid);
    if (authStatus) authStatus.textContent = `Signed in (${user.email || authUid.slice(0, 8) + "..."})`;

    // Subscribe to schedule entries immediately (filter out scheduleConfig)
    unsubscribeSchedule = onSnapshot(
      query(scheduleRef, orderBy("sortOrder", "asc")),
      (snapshot) => {
        scheduleEntries = snapshot.docs.filter((d) => d.id !== "scheduleConfig").map((d) => ({ id: d.id, ...d.data() }));
        renderSchedule();
      },
      (error) => { console.error("[SCHEDULE]", error.code, error.message); setMessage(scheduleMessage, error.message, true); }
    );

    // Subscribe to config doc for title + goals
    unsubscribeConfig = onSnapshot(
      doc(db, "schedule", "scheduleConfig"),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          scheduleTitle = data.title || "HOPE GUILD RAID SCHEDULE";
          scheduleGoalsTitle = data.goalsTitle || "Goals";
          scheduleGoals = Array.isArray(data.goals) ? data.goals : [];
        }
        updateTitleDisplay();
        renderGoals();
      },
      () => {}
    );

    // Async admin check
    const inStaticAdminAllowlist = Array.isArray(appSettings.adminUids) && appSettings.adminUids.includes(authUid);
    let hasAdminDoc = false, hasOwnerDoc = false;
    try {
      hasAdminDoc = (await getDoc(doc(db, "admins", authUid))).exists();
      hasOwnerDoc = (await getDoc(doc(db, "owners", authUid))).exists();
    } catch { }

    if (gen !== authGeneration) return;

    isOwner = hasOwnerDoc;
    isAdmin = inStaticAdminAllowlist || hasAdminDoc || isOwner;
    renderSchedule();
    updateTitleDisplay();
    renderGoals();

    if (isAdmin) seedDefaultSchedule().catch(() => {});
  });
}
