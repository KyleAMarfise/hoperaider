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

const releasesContent = document.getElementById("releasesContent");
const releasesAdminActions = document.getElementById("releasesAdminActions");
const addReleaseButton = document.getElementById("addReleaseButton");
const releasesMessage = document.getElementById("releasesMessage");

const addReleaseDialog = document.getElementById("addReleaseDialog");
const releaseDialogTitle = document.getElementById("releaseDialogTitle");
const releaseEditId = document.getElementById("releaseEditId");
const releaseDateInput = document.getElementById("releaseDate");
const releaseVersionInput = document.getElementById("releaseVersion");
const releaseSummaryInput = document.getElementById("releaseSummary");
const releaseDetailsInput = document.getElementById("releaseDetails");
const saveReleaseButton = document.getElementById("saveReleaseButton");
const deleteReleaseButton = document.getElementById("deleteReleaseButton");
const cancelReleaseButton = document.getElementById("cancelReleaseButton");
const releaseDialogMessage = document.getElementById("releaseDialogMessage");

// ── State ─────────────────────────────────────────────────────────────────────
let authUid = null;
let isAdmin = false;
let isOwner = false;
let db = null;
let releaseEntries = [];
let unsubscribeReleases = null;

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

function formatReleaseDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

// ── Rendering ─────────────────────────────────────────────────────────────────
function renderReleases() {
  if (!releasesContent) return;
  if (releasesAdminActions) releasesAdminActions.hidden = true;

  if (!releaseEntries.length) {
    releasesContent.innerHTML = `<p class="schedule-empty">No release notes yet.</p>`;
    return;
  }

  releasesContent.innerHTML = releaseEntries.map((entry, index) => {
    const details = Array.isArray(entry.details) ? entry.details : [];
    const dateLabel = formatReleaseDate(entry.releaseDate);
    const version = entry.version || "";
    const isLatest = index === 0;

    const adminActions = "";

    return `
      <div class="release-entry ${isLatest ? "release-latest" : ""}">
        <div class="release-header">
          <div class="release-meta">
            <span class="release-date">${escapeHtml(dateLabel)}</span>
            ${version ? `<span class="release-version">${escapeHtml(version)}</span>` : ""}
            ${isLatest ? `<span class="release-latest-badge">Latest</span>` : ""}
          </div>
          ${adminActions}
        </div>
        <h3 class="release-summary">${escapeHtml(entry.summary || "")}</h3>
        ${details.length ? `<ul class="release-details">${details.map((d) => `<li>${escapeHtml(d)}</li>`).join("")}</ul>` : ""}
      </div>
    `;
  }).join("");

  bindReleaseEvents();
}

function bindReleaseEvents() {
  if (!releasesContent) return;
  releasesContent.querySelectorAll(".release-edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => openReleaseDialog(btn.dataset.id));
  });
  releasesContent.querySelectorAll(".release-delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteRelease(btn.dataset.id));
  });
}

// ── Dialog ────────────────────────────────────────────────────────────────────
function openReleaseDialog(docId) {
  const entry = docId ? releaseEntries.find((e) => e.id === docId) : null;
  releaseEditId.value = docId || "";
  releaseDateInput.value = entry ? entry.releaseDate : todayString();
  releaseVersionInput.value = entry ? (entry.version || "") : "";
  releaseSummaryInput.value = entry ? (entry.summary || "") : "";
  releaseDetailsInput.value = entry ? (entry.details || []).join("\n") : "";
  deleteReleaseButton.hidden = !docId;
  releaseDialogTitle.textContent = docId ? "Edit Release Note" : "Add Release Note";
  setMessage(releaseDialogMessage, "");
  addReleaseDialog.showModal();
}

async function saveRelease() {
  const docId = releaseEditId.value;
  const releaseDate = releaseDateInput.value;
  const version = releaseVersionInput.value.trim();
  const summary = releaseSummaryInput.value.trim();
  const details = releaseDetailsInput.value.split("\n").map((l) => l.trim()).filter(Boolean);

  if (!releaseDate) { setMessage(releaseDialogMessage, "Date is required.", true); return; }
  if (!summary) { setMessage(releaseDialogMessage, "Summary is required.", true); return; }

  saveReleaseButton.disabled = true;
  try {
    const data = { releaseDate, version, summary, details, updatedAt: serverTimestamp() };
    if (docId) {
      await updateDoc(doc(db, "releases", docId), data);
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "releases"), data);
    }
    addReleaseDialog.close();
    setMessage(releasesMessage, "Saved.", false);
  } catch (error) {
    setMessage(releaseDialogMessage, error.message, true);
  } finally {
    saveReleaseButton.disabled = false;
  }
}

async function deleteRelease(docId) {
  if (!docId) return;
  if (!confirm("Delete this release note?")) return;
  try {
    await deleteDoc(doc(db, "releases", docId));
    setMessage(releasesMessage, "Deleted.", false);
  } catch (error) {
    setMessage(releasesMessage, error.message, true);
  }
}

// ── Seed defaults ─────────────────────────────────────────────────────────────
async function seedDefaultReleases() {
  const releasesRef = collection(db, "releases");
  const snap = await getDocs(releasesRef);
  if (!snap.empty) return;

  const defaults = [
    {
      releaseDate: "2026-04-01",
      version: "v2.0.0",
      summary: "Phase 2 Launch \u2014 Raid Schedule, Core Raiders & Role Composition",
      details: [
        "Added Raid Schedule page with parchment-scroll theme",
        "Editable schedule title, day entries, and goals section",
        "Timezone display for all raid times (CST/EST/MST/PST)",
        "Core Raider system \u2014 admins can tag characters as core raiders",
        "Core Group run type \u2014 exclusive raids for core raiders only",
        "Role Composition slots \u2014 specify exact class/spec needs per raid",
        "Cascading dropdowns auto-fill specs for tanks and single-spec healers",
        "Core Raider filter on Character Audit page",
        "Soft Reserve status badges (Accepted, Pending, Benched, etc.)",
        "Custom tooltips on SR status badges",
        "Signup Requests \u2014 collapsed withdrawn section to save space",
        "Release Notes page"
      ]
    },
    {
      releaseDate: "2026-03-28",
      version: "v1.5.0",
      summary: "Soft Reserve & PUG Improvements",
      details: [
        "PUG badge for guest soft reserve entries",
        "Day of week shown on raid date column",
        "Updated Discord invite link",
        "Fix SR status badge matching by ownerUid"
      ]
    },
    {
      releaseDate: "2026-03-25",
      version: "v1.4.0",
      summary: "Unlock Reserves & Admin Fixes",
      details: [
        "Allow any admin/owner to update raids",
        "Fix unlock reserves functionality"
      ]
    }
  ];

  for (const entry of defaults) {
    await addDoc(releasesRef, { ...entry, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
{
  if (!hasConfigValues()) setMessage(releasesMessage, "Firebase config missing.", true);

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  db = getFirestore(app);

  const releasesRef = collection(db, "releases");
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
    try { await signOut(auth); } catch (e) { setMessage(releasesMessage, e.message, true); } finally { signOutButton.disabled = false; }
  });
  if (copyUidButton) copyUidButton.addEventListener("click", async () => {
    const uid = String(authUid || "").trim(); if (!uid) return;
    try { await navigator.clipboard.writeText(uid); if (authStatus) authStatus.textContent = "UID copied."; } catch { }
  });

  if (addReleaseButton) addReleaseButton.addEventListener("click", () => openReleaseDialog(null));
  if (saveReleaseButton) saveReleaseButton.addEventListener("click", saveRelease);
  if (deleteReleaseButton) deleteReleaseButton.addEventListener("click", () => {
    const docId = releaseEditId.value;
    if (docId) deleteRelease(docId).then(() => addReleaseDialog.close());
  });
  if (cancelReleaseButton) cancelReleaseButton.addEventListener("click", () => addReleaseDialog.close());

  // ── Auth state ──────────────────────────────────────────────────────────────
  let authGeneration = 0;

  onAuthStateChanged(auth, async (user) => {
    const gen = ++authGeneration;

    if (unsubscribeReleases) { unsubscribeReleases(); unsubscribeReleases = null; }

    if (!user) {
      authUid = null; isAdmin = false; isOwner = false;
      releaseEntries = [];
      renderReleases();
      setAuthGateState(false, "Sign in to view release notes.");
      updateAuthActionButtons(null); updateUidDisplay("");
      if (authStatus) authStatus.textContent = "Signed out.";
      return;
    }

    authUid = user.uid;
    setAuthGateState(true);
    updateAuthActionButtons(user);
    updateUidDisplay(authUid);
    if (authStatus) authStatus.textContent = `Signed in (${user.email || authUid.slice(0, 8) + "..."})`;

    // Subscribe immediately
    unsubscribeReleases = onSnapshot(
      query(releasesRef, orderBy("releaseDate", "desc")),
      (snapshot) => { releaseEntries = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })); renderReleases(); },
      (error) => { console.error("[RELEASES]", error.code, error.message); setMessage(releasesMessage, error.message, true); }
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
    renderReleases();

    if (isAdmin) seedDefaultReleases().catch(() => {});
  });
}
