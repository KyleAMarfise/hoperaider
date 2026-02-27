import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { appSettings, firebaseConfig } from "./config/prod/firebase-config.js";

const adminRaidSection = document.getElementById("adminRaidSection");
const authStatus = document.getElementById("adminAuthStatus");
const appShell = document.getElementById("appShell");
const authGate = document.getElementById("authGate");
const authGateMessage = document.getElementById("authGateMessage");
const authGateSignInButton = document.getElementById("authGateSignInButton");
const currentUidEl = document.getElementById("currentUid");
const copyUidButton = document.getElementById("copyUidButton");
const raidForm = document.getElementById("raidForm");
const raidIdInput = document.getElementById("raidId");
const raidPhaseInput = document.getElementById("raidPhase");
const raidTemplateInput = document.getElementById("raidTemplate");
const raidEventDateInput = document.getElementById("raidEventDate");
const raidRunTypeInput = document.getElementById("raidRunType");
const raidStartInput = document.getElementById("raidStart");
const raidEndInput = document.getElementById("raidEnd");
const raidSizeInput = document.getElementById("raidSize");
const tankSlotsInput = document.getElementById("tankSlots");
const healerSlotsInput = document.getElementById("healerSlots");
const dpsSlotsInput = document.getElementById("dpsSlots");
const saveRaidButton = document.getElementById("saveRaidButton");
const cancelRaidEditButton = document.getElementById("cancelRaidEditButton");
const currentAdminRows = document.getElementById("currentAdminRows");
const pastAdminRows = document.getElementById("pastAdminRows");
const currentAdminCountBadge = document.getElementById("currentAdminCountBadge");
const pastAdminCountBadge = document.getElementById("pastAdminCountBadge");
const raidAdminMessage = document.getElementById("raidAdminMessage");
const siteTitleEl = document.getElementById("siteTitle");
const guildDiscordLink = document.getElementById("guildDiscordLink");
const adminOpsBadge = document.getElementById("adminOpsBadge");
const signOutButton = document.getElementById("signOutButton");

const DEMO_RAID_STORAGE_KEY = "hopeRaidTrackerDemoRaids";
const DEMO_SIGNUP_STORAGE_KEY = "hopeRaidSignupDemoRows";
const START_HOURS = Array.from({ length: 24 }, (_, index) => index);
const END_HOURS = Array.from({ length: 24 }, (_, index) => index + 1);

const RAID_PRESETS_BY_PHASE = {
  1: [
    { name: "Karazhan", size: "10" },
    { name: "Gruul's Lair", size: "25" },
    { name: "Magtheridon's Lair", size: "25" }
  ],
  2: [
    { name: "Serpentshrine Cavern", size: "25" },
    { name: "The Eye", size: "25" }
  ],
  3: [
    { name: "Hyjal Summit", size: "25" },
    { name: "Black Temple", size: "25" }
  ],
  4: [{ name: "Zul'Aman", size: "10" }],
  5: [{ name: "Sunwell Plateau", size: "25" }]
};

let authUid = null;
let isAdmin = false;
let isDemoMode = false;
let db = null;
let currentRaids = [];
let currentSignups = [];
let unsubscribeRaids = null;
let unsubscribeSignups = null;

if (siteTitleEl) {
  siteTitleEl.textContent = appSettings.siteTitle || "Hope Raid Tracker";
}
if (guildDiscordLink) {
  guildDiscordLink.href = appSettings.discordInviteUrl || "https://discord.gg/xYtxu6Yj";
}

function hasConfigValues() {
  return (
    firebaseConfig
    && firebaseConfig.apiKey
    && !firebaseConfig.apiKey.includes("REPLACE_ME")
    && firebaseConfig.projectId
    && !firebaseConfig.projectId.includes("REPLACE_ME")
  );
}

function setMessage(target, text, isError = false) {
  target.textContent = text;
  target.classList.toggle("error", isError);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function hourLabel(hourValue) {
  const normalizedHour = hourValue % 24;
  const suffix = normalizedHour >= 12 ? "PM" : "AM";
  const twelveHour = normalizedHour % 12 === 0 ? 12 : normalizedHour % 12;
  return `${twelveHour}:00 ${suffix}`;
}

function populateHourOptions(selectElement, hourValues, placeholderLabel) {
  const placeholder = `<option value="">${placeholderLabel}</option>`;
  const options = hourValues
    .map((hour) => `<option value="${hour}">${hourLabel(hour)}</option>`)
    .join("");
  selectElement.innerHTML = `${placeholder}${options}`;
}

function parseHourValue(value) {
  if (value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function toDateOnlyString(dateValue) {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateOnly(dateText) {
  if (!dateText || !/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    return null;
  }
  const parsed = new Date(`${dateText}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatMonthDayYear(dateText) {
  const parsed = parseDateOnly(dateText);
  if (!parsed) {
    return "—";
  }
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const year = String(parsed.getFullYear());
  return `${month}-${day}-${year}`;
}

function shiftHourFromCst(hourValue, deltaHours) {
  return ((hourValue + deltaHours) % 24 + 24) % 24;
}

function buildRaidWindowTimezoneLines(raidStart, raidEnd) {
  if (!Number.isInteger(raidStart) || !Number.isInteger(raidEnd)) {
    return [];
  }

  const zones = [
    { label: "CST", delta: 0 },
    { label: "EST", delta: 1 },
    { label: "MST", delta: -1 },
    { label: "PST", delta: -2 }
  ];

  return zones
    .map((zone) => {
      const zoneStart = shiftHourFromCst(raidStart, zone.delta);
      const zoneEnd = shiftHourFromCst(raidEnd, zone.delta);
      return `${zone.label} ${hourLabel(zoneStart)} - ${hourLabel(zoneEnd)}`;
    });
}

function renderRaidWindowMultiline(raidStart, raidEnd) {
  const lines = buildRaidWindowTimezoneLines(raidStart, raidEnd);
  if (!lines.length) {
    return "—";
  }

  return lines
    .map((line) => {
      const zoneLabel = line.slice(0, 3);
      const classes = ["raid-time-line"];
      if (zoneLabel === "CST") {
        classes.push("raid-time-cst");
      }
      return `<span class="${classes.join(" ")}">${escapeHtml(line)}</span>`;
    })
    .join("");
}

function getRaidCutoffDate(item) {
  const raidDate = parseDateOnly(item.raidDate);
  if (!raidDate) {
    return null;
  }

  const raidEnd = Number(item.raidEnd);
  const fallbackStart = Number(item.raidStart);
  const hour = Number.isInteger(raidEnd)
    ? raidEnd
    : (Number.isInteger(fallbackStart) ? fallbackStart : 0);

  const cutoff = new Date(raidDate);
  cutoff.setHours(hour, 0, 0, 0);
  return cutoff;
}

function normalizeSignupStatus(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "requested" || normalized === "accept" || normalized === "tentative" || normalized === "decline" || normalized === "withdrawn" || normalized === "denied") {
    return normalized;
  }
  if (normalized === "pending") {
    return "requested";
  }
  if (normalized === "confirmed") {
    return "accept";
  }
  return "decline";
}

function updatePendingBadge(signups = []) {
  if (!adminOpsBadge || !isAdmin) {
    return;
  }
  const pending = signups.filter((signup) => normalizeSignupStatus(signup.status) === "requested").length;
  adminOpsBadge.textContent = String(pending);
  adminOpsBadge.hidden = pending <= 0;
}

function buildAdminRaidRows(items) {
  return items
    .map((item) => {
      const windowText = renderRaidWindowMultiline(item.raidStart, item.raidEnd);
      const slotParts = [];
      if (item.tankSlots != null) { slotParts.push(`🛡${item.tankSlots}`); }
      if (item.healerSlots != null) { slotParts.push(`✚${item.healerSlots}`); }
      if (item.dpsSlots != null) { slotParts.push(`⚔${item.dpsSlots}`); }
      const slotLabel = slotParts.length ? `<br><span class="raid-slot-mini">${slotParts.join(" ")}</span>` : "";
      return `<tr>
        <td>${escapeHtml(`Phase ${String(item.phase)}`)}</td>
        <td>${escapeHtml(item.raidName)}</td>
        <td>${escapeHtml(formatMonthDayYear(item.raidDate))}</td>
        <td class="raid-time-cell">${windowText}</td>
        <td>${escapeHtml(item.runType)}</td>
        <td>${escapeHtml(item.raidSize || "—")}${slotLabel}</td>
        <td>
          <div class="row-actions">
            <button type="button" data-raid-action="edit" data-raid-id="${item.id}">Edit</button>
            <button type="button" class="danger" data-raid-action="delete" data-raid-id="${item.id}">Delete</button>
          </div>
        </td>
      </tr>`;
    })
    .join("");
}

function sortRaids(rows) {
  return [...rows].sort((left, right) => {
    const leftDate = parseDateOnly(left.raidDate)?.getTime() || 0;
    const rightDate = parseDateOnly(right.raidDate)?.getTime() || 0;
    if (leftDate !== rightDate) {
      return leftDate - rightDate;
    }
    return (left.raidStart ?? 0) - (right.raidStart ?? 0);
  });
}

function loadDemoRaids() {
  try {
    const raw = window.localStorage.getItem(DEMO_RAID_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDemoRaids(raids) {
  window.localStorage.setItem(DEMO_RAID_STORAGE_KEY, JSON.stringify(raids));
}

function loadDemoSignups() {
  try {
    const raw = window.localStorage.getItem(DEMO_SIGNUP_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setAdminVisibility() {
  adminRaidSection.hidden = !isAdmin;
  if (!isAdmin && adminOpsBadge) {
    adminOpsBadge.hidden = true;
  }
}

function updateAuthActionButtons(user) {
  if (signOutButton) {
    signOutButton.hidden = !user;
    signOutButton.disabled = false;
  }
}

function updateUidDisplay(uid) {
  const normalizedUid = String(uid || "").trim();
  if (currentUidEl) {
    currentUidEl.hidden = !normalizedUid;
    currentUidEl.textContent = normalizedUid ? `UID: ${normalizedUid}` : "";
  }
  if (copyUidButton) {
    copyUidButton.hidden = !normalizedUid || !isAdmin;
  }
}

function setAuthGateState(authenticated, message = "", isError = false) {
  if (appShell) {
    appShell.hidden = !authenticated;
  }
  if (authGate) {
    authGate.hidden = authenticated;
  }
  if (authGateMessage && message) {
    authGateMessage.textContent = message;
    authGateMessage.classList.toggle("error", Boolean(isError));
  }
}

function setAuthPendingState() {
  if (appShell) {
    appShell.hidden = true;
  }
  if (authGate) {
    authGate.hidden = true;
  }
}

function getGoogleAuthErrorMessage(error) {
  if (error?.code === "auth/unauthorized-domain") {
    const host = window.location.hostname || "this domain";
    return `Google sign-in is blocked for ${host}. Add it in Firebase Console → Authentication → Settings → Authorized domains.`;
  }
  return error?.message || "Google sign-in failed.";
}

function populateRaidPhaseOptions() {
  const phaseOptions = Object.keys(RAID_PRESETS_BY_PHASE)
    .sort((left, right) => Number(left) - Number(right))
    .map((phaseKey) => `<option value="${phaseKey}">Phase ${phaseKey}</option>`)
    .join("");

  raidPhaseInput.innerHTML = phaseOptions;
  if (!raidPhaseInput.value) {
    raidPhaseInput.value = "1";
  }
}

function getDefaultRoleSlots(raidSizeStr) {
  const size = parseInt(String(raidSizeStr).replace(/\D/g, ""), 10) || 0;
  if (size >= 25) {
    return { tank: 3, healer: 6, dps: size - 9 };
  }
  if (size >= 10) {
    return { tank: 2, healer: 3, dps: size - 5 };
  }
  return { tank: 2, healer: 3, dps: 5 };
}

function syncRoleSlotDefaults() {
  const sizeStr = raidSizeInput.value;
  const defaults = getDefaultRoleSlots(sizeStr);
  if (!tankSlotsInput.value && !healerSlotsInput.value && !dpsSlotsInput.value) {
    tankSlotsInput.value = defaults.tank;
    healerSlotsInput.value = defaults.healer;
    dpsSlotsInput.value = defaults.dps;
  }
}

function syncRaidSize() {
  const selectedPhase = Number(raidPhaseInput.value);
  const selectedRaid = raidTemplateInput.value;
  const phaseRaids = RAID_PRESETS_BY_PHASE[selectedPhase] || [];
  const matched = phaseRaids.find((raid) => raid.name === selectedRaid);
  raidSizeInput.value = matched ? `${matched.size}-man` : "";
  syncRoleSlotDefaults();
}

function refreshRaidTemplateOptions(selectedRaid = "") {
  const selectedPhase = Number(raidPhaseInput.value);
  const phaseRaids = RAID_PRESETS_BY_PHASE[selectedPhase] || [];

  raidTemplateInput.innerHTML = phaseRaids
    .map((raid) => `<option value="${raid.name}">${raid.name}</option>`)
    .join("");

  if (selectedRaid && phaseRaids.some((raid) => raid.name === selectedRaid)) {
    raidTemplateInput.value = selectedRaid;
  }

  syncRaidSize();
}

function renderAdminRaids(items) {
  if (!isAdmin) {
    currentAdminRows.innerHTML = "";
    pastAdminRows.innerHTML = "";
    currentAdminCountBadge.textContent = "0";
    pastAdminCountBadge.textContent = "0";
    setMessage(raidAdminMessage, "");
    return;
  }

  if (!items.length) {
    currentAdminRows.innerHTML = `<tr><td colspan="7">No current or up-coming raids.</td></tr>`;
    pastAdminRows.innerHTML = `<tr><td colspan="7">No past raids.</td></tr>`;
    currentAdminCountBadge.textContent = "0";
    pastAdminCountBadge.textContent = "0";
    setMessage(raidAdminMessage, "");
    return;
  }

  const now = new Date();
  const grouped = { currentUpcoming: [], past: [] };

  items.forEach((item) => {
    const cutoff = getRaidCutoffDate(item);
    if (cutoff && cutoff < now) {
      grouped.past.push(item);
      return;
    }
    grouped.currentUpcoming.push(item);
  });

  currentAdminCountBadge.textContent = String(grouped.currentUpcoming.length);
  pastAdminCountBadge.textContent = String(grouped.past.length);

  currentAdminRows.innerHTML = grouped.currentUpcoming.length
    ? buildAdminRaidRows(grouped.currentUpcoming)
    : `<tr><td colspan="7">No current or up-coming raids.</td></tr>`;

  pastAdminRows.innerHTML = grouped.past.length
    ? buildAdminRaidRows(grouped.past)
    : `<tr><td colspan="7">No past raids.</td></tr>`;
}

function resetRaidForm() {
  raidIdInput.value = "";
  saveRaidButton.textContent = "Save Raid";
  cancelRaidEditButton.hidden = true;
  raidForm.reset();
  populateRaidPhaseOptions();
  refreshRaidTemplateOptions();
  raidEventDateInput.value = toDateOnlyString(new Date());
  tankSlotsInput.value = "";
  healerSlotsInput.value = "";
  dpsSlotsInput.value = "";
  syncRoleSlotDefaults();
  setMessage(raidAdminMessage, "");
}

function loadRaidForm(item) {
  raidIdInput.value = item.id;
  saveRaidButton.textContent = "Update Raid";
  cancelRaidEditButton.hidden = false;

  raidPhaseInput.value = String(item.phase);
  refreshRaidTemplateOptions(item.raidName);
  raidEventDateInput.value = item.raidDate;
  raidRunTypeInput.value = item.runType;
  raidStartInput.value = String(item.raidStart);
  raidEndInput.value = String(item.raidEnd);
  syncRaidSize();

  if (item.tankSlots != null) {
    tankSlotsInput.value = String(item.tankSlots);
  }
  if (item.healerSlots != null) {
    healerSlotsInput.value = String(item.healerSlots);
  }
  if (item.dpsSlots != null) {
    dpsSlotsInput.value = String(item.dpsSlots);
  }
}

populateHourOptions(raidStartInput, START_HOURS, "Select CST start");
populateHourOptions(raidEndInput, END_HOURS, "Select CST end");
populateRaidPhaseOptions();
refreshRaidTemplateOptions();
raidEventDateInput.value = toDateOnlyString(new Date());

raidEventDateInput.addEventListener("click", () => {
  if (typeof raidEventDateInput.showPicker === "function") {
    try { raidEventDateInput.showPicker(); } catch { /* already open or not supported */ }
  }
});

raidEventDateInput.addEventListener("focus", () => {
  if (typeof raidEventDateInput.showPicker === "function") {
    try { raidEventDateInput.showPicker(); } catch { /* already open or not supported */ }
  }
});

raidPhaseInput.addEventListener("change", () => {
  refreshRaidTemplateOptions();
});

raidTemplateInput.addEventListener("change", () => {
  syncRaidSize();
});

cancelRaidEditButton.addEventListener("click", () => {
  resetRaidForm();
});

adminRaidSection.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  const action = target.dataset.raidAction;
  const id = target.dataset.raidId;
  if (!action || !id || !isAdmin) {
    return;
  }

  const item = currentRaids.find((entry) => entry.id === id);
  if (!item) {
    return;
  }

  if (action === "edit") {
    loadRaidForm(item);
    raidPhaseInput.focus();
    return;
  }

  if (action === "delete") {
    const confirmed = window.confirm(`Delete raid ${item.raidName} on ${item.raidDate}?`);
    if (!confirmed) {
      return;
    }

    try {
      if (isDemoMode) {
        currentRaids = currentRaids.filter((entry) => entry.id !== id);
        currentRaids = sortRaids(currentRaids);
        saveDemoRaids(currentRaids);
        renderAdminRaids(currentRaids);
      } else {
        await deleteDoc(doc(db, "raids", id));
      }

      if (raidIdInput.value === id) {
        resetRaidForm();
      }
      setMessage(raidAdminMessage, "Raid deleted.");
    } catch (error) {
      setMessage(raidAdminMessage, error.message, true);
    }
  }
});

raidForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!isAdmin || (!isDemoMode && !authUid)) {
    setMessage(raidAdminMessage, "Admin access is required.", true);
    return;
  }

  const phase = Number(raidPhaseInput.value);
  const raidName = raidTemplateInput.value;
  const raidDate = raidEventDateInput.value;
  const runType = raidRunTypeInput.value;
  const raidStart = parseHourValue(raidStartInput.value);
  const raidEnd = parseHourValue(raidEndInput.value);
  const raidSize = raidSizeInput.value;
  const tankSlots = Number(tankSlotsInput.value) || 0;
  const healerSlots = Number(healerSlotsInput.value) || 0;
  const dpsSlots = Number(dpsSlotsInput.value) || 0;

  const phaseRaids = RAID_PRESETS_BY_PHASE[phase] || [];
  const isValidRaid = phaseRaids.some((raid) => raid.name === raidName);

  if (
    !Number.isInteger(phase)
    || phase < 1
    || phase > 5
    || !isValidRaid
    || !parseDateOnly(raidDate)
    || !runType
    || !Number.isInteger(raidStart)
    || !Number.isInteger(raidEnd)
    || raidStart >= raidEnd
  ) {
    setMessage(raidAdminMessage, "Please fill all raid fields correctly.", true);
    return;
  }

  const payload = {
    phase,
    raidName,
    raidDate,
    runType,
    raidStart,
    raidEnd,
    raidSize,
    tankSlots,
    healerSlots,
    dpsSlots,
    createdByUid: isDemoMode ? "demo-local" : authUid,
    updatedAt: serverTimestamp()
  };

  saveRaidButton.disabled = true;

  try {
    const editingId = raidIdInput.value;

    if (isDemoMode) {
      if (editingId) {
        currentRaids = currentRaids.map((entry) =>
          entry.id === editingId ? { ...entry, ...payload } : entry
        );
        setMessage(raidAdminMessage, "Raid updated (demo mode).");
      } else {
        currentRaids.push({
          id: typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `raid-demo-${Date.now()}`,
          ...payload,
          createdAt: new Date().toISOString()
        });
        setMessage(raidAdminMessage, "Raid created (demo mode).");
      }

      currentRaids = sortRaids(currentRaids);
      saveDemoRaids(currentRaids);
      renderAdminRaids(currentRaids);
      resetRaidForm();
      return;
    }

    if (editingId) {
      await updateDoc(doc(db, "raids", editingId), payload);
      setMessage(raidAdminMessage, "Raid updated.");
    } else {
      await addDoc(collection(db, "raids"), {
        ...payload,
        createdAt: serverTimestamp()
      });
      setMessage(raidAdminMessage, "Raid created.");
    }

    resetRaidForm();
  } catch (error) {
    setMessage(raidAdminMessage, error.message, true);
  } finally {
    saveRaidButton.disabled = false;
  }
});

if (!hasConfigValues()) {
  isDemoMode = true;
  isAdmin = true;
  setAuthGateState(true);
  setAdminVisibility();
  updateAuthActionButtons({ uid: "demo" });
  updateUidDisplay("demo-local");
  authStatus.textContent = "Demo mode: Firebase config not set (local testing enabled).";
  currentRaids = sortRaids(loadDemoRaids());
  currentSignups = loadDemoSignups();
  renderAdminRaids(currentRaids);
  updatePendingBadge(currentSignups);
  resetRaidForm();
} else {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: "select_account" });
  db = getFirestore(app);
  const raidsRef = collection(db, "raids");
  const signupsRef = collection(db, "signups");

  setAuthPendingState();
  updateAuthActionButtons(null);
  updateUidDisplay("");
  authStatus.textContent = "Checking sign-in status...";

  async function performGoogleSignIn() {
    if (authGateSignInButton) {
      authGateSignInButton.disabled = true;
    }
    try {
      await signInWithPopup(auth, googleProvider);
      setAuthGateState(true);
    } catch (error) {
      const errorText = getGoogleAuthErrorMessage(error);
      authStatus.textContent = errorText;
      setAuthGateState(false, errorText, true);
      setMessage(raidAdminMessage, errorText, true);
    } finally {
      if (authGateSignInButton) {
        authGateSignInButton.disabled = false;
      }
    }
  }

  if (authGateSignInButton) {
    authGateSignInButton.addEventListener("click", performGoogleSignIn);
  }

  if (signOutButton) {
    signOutButton.addEventListener("click", async () => {
      signOutButton.disabled = true;
      try {
        await signOut(auth);
      } catch (error) {
        setMessage(raidAdminMessage, error.message, true);
      } finally {
        signOutButton.disabled = false;
      }
    });
  }

  if (copyUidButton) {
    copyUidButton.addEventListener("click", async () => {
      const uid = String(authUid || "").trim();
      if (!uid) {
        return;
      }
      try {
        await navigator.clipboard.writeText(uid);
        authStatus.textContent = "UID copied to clipboard.";
      } catch {
        authStatus.textContent = "Unable to copy UID automatically.";
      }
    });
  }

  onAuthStateChanged(auth, async (user) => {
    if (unsubscribeRaids) {
      unsubscribeRaids();
      unsubscribeRaids = null;
    }
    if (unsubscribeSignups) {
      unsubscribeSignups();
      unsubscribeSignups = null;
    }

    if (!user) {
      authUid = null;
      isAdmin = false;
      currentRaids = [];
      currentSignups = [];
      setAdminVisibility();
      renderAdminRaids(currentRaids);
      updatePendingBadge([]);
      setAuthGateState(false, "Sign in with Google to continue.");
      updateAuthActionButtons(null);
      updateUidDisplay("");
      authStatus.textContent = "Signed out. Sign in with Google to continue.";
      return;
    }

    authUid = user.uid;
    const inStaticAdminAllowlist = Array.isArray(appSettings.adminUids) && appSettings.adminUids.includes(authUid);
    let hasAdminDoc = false;
    try {
      hasAdminDoc = (await getDoc(doc(db, "admins", authUid))).exists();
    } catch {
      hasAdminDoc = false;
    }
    isAdmin = inStaticAdminAllowlist || hasAdminDoc;
    setAuthGateState(true);
    updateAuthActionButtons(user);
    updateUidDisplay(authUid);
    setAdminVisibility();
    const userLabel = user.email || `${authUid.slice(0, 8)}...`;
    if (!isAdmin) {
      updatePendingBadge([]);
      authStatus.textContent = `Signed in (${userLabel}) — Not authorized for raid management.`;
      setMessage(raidAdminMessage, "Your account is not in the admin allowlist.", true);
      return;
    }

    updatePendingBadge(currentSignups);
    authStatus.textContent = `Signed in (${userLabel}) — Raid management enabled`;

    const raidsQuery = query(raidsRef, orderBy("raidDate", "asc"));
    unsubscribeRaids = onSnapshot(
      raidsQuery,
      (snapshot) => {
        currentRaids = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data()
        }));
        renderAdminRaids(sortRaids(currentRaids));
      },
      (error) => {
        setMessage(raidAdminMessage, error.message, true);
      }
    );

    unsubscribeSignups = onSnapshot(
      signupsRef,
      (snapshot) => {
        currentSignups = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data()
        }));
        updatePendingBadge(currentSignups);
      },
      () => {
        updatePendingBadge([]);
      }
    );

    resetRaidForm();
  });
}
