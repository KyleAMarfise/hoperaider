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

// Page title + intro
const strategyTitleEl = document.getElementById("strategyTitle");
const strategyIntroEl = document.getElementById("strategyIntro");
const editTitleButton = document.getElementById("editTitleButton");
const editTitleForm = document.getElementById("editTitleForm");
const editTitleInput = document.getElementById("editTitleInput");
const editIntroInput = document.getElementById("editIntroInput");
const saveTitleButton = document.getElementById("saveTitleButton");
const cancelTitleButton = document.getElementById("cancelTitleButton");

// Content
const strategyPhaseTabs = document.getElementById("strategyPhaseTabs");
const strategyTabs = document.getElementById("strategyTabs");
const strategyContent = document.getElementById("strategyContent");
const strategyAdminActions = document.getElementById("strategyAdminActions");
const addSectionButton = document.getElementById("addSectionButton");
const strategyMessage = document.getElementById("strategyMessage");

// Section dialog
const sectionDialog = document.getElementById("sectionDialog");
const sectionDialogTitle = document.getElementById("sectionDialogTitle");
const sectionEditId = document.getElementById("sectionEditId");
const sectionTitleInput = document.getElementById("sectionTitleInput");
const sectionEmojiInput = document.getElementById("sectionEmojiInput");
const sectionLayoutSelect = document.getElementById("sectionLayoutSelect");
const sectionPhaseSelect = document.getElementById("sectionPhaseSelect");
const saveSectionButton = document.getElementById("saveSectionButton");
const deleteSectionButton = document.getElementById("deleteSectionButton");
const cancelSectionButton = document.getElementById("cancelSectionButton");
const sectionDialogMessage = document.getElementById("sectionDialogMessage");

// Entry dialog
const entryDialog = document.getElementById("entryDialog");
const entryDialogTitle = document.getElementById("entryDialogTitle");
const entryEditId = document.getElementById("entryEditId");
const entrySectionId = document.getElementById("entrySectionId");
const entryEmojiInput = document.getElementById("entryEmojiInput");
const entryTitleInput = document.getElementById("entryTitleInput");
const entryTagInput = document.getElementById("entryTagInput");
const entryNotesInput = document.getElementById("entryNotesInput");
const entryLinkRows = document.getElementById("entryLinkRows");
const addLinkRowButton = document.getElementById("addLinkRowButton");
const saveEntryButton = document.getElementById("saveEntryButton");
const deleteEntryButton = document.getElementById("deleteEntryButton");
const cancelEntryButton = document.getElementById("cancelEntryButton");
const entryDialogMessage = document.getElementById("entryDialogMessage");

// ── State ─────────────────────────────────────────────────────────────────────
let authUid = null;
let isAdmin = false;
let isOwner = false;
let db = null;
let strategyDocs = [];
let strategyTitle = "HOPE GUILD RAID STRATEGY";
let strategyIntro = "";
let unsubscribeStrategy = null;
let unsubscribeConfig = null;
let activeContentPhase = "2";
const fightPhaseState = {}; // entryId -> active fight-phase index

const DEFAULT_TITLE = "HOPE GUILD RAID STRATEGY";
const SEED_VERSION = 2;
const LINK_KINDS = ["video", "doc", "link"];
const LINK_ICONS = { video: "\u{1F3AC}", doc: "\u{1F4C4}", link: "\u{1F517}" };
const LINK_FALLBACK_LABEL = { video: "Video", doc: "Document", link: "Link" };

// Page-level content (release) phases
const CONTENT_PHASES = [
  { id: "1", label: "Phase 1", hint: "Kara · Gruul · Mag" },
  { id: "2", label: "Phase 2", hint: "SSC · Tempest Keep" }
];

// Map a block label keyword → a colour tone for assignment blocks
const BLOCK_TONES = [
  { tone: "tank", test: /\btank/i },
  { tone: "heal", test: /heal/i },
  { tone: "interrupt", test: /interrupt|kick|silence|purge|dispel/i },
  { tone: "kill", test: /kill|focus|order|priority/i },
  { tone: "position", test: /position|spread|stack|move|location|placement|kite/i },
  { tone: "threat", test: /misdirect|threat|tricks|aggro/i },
  { tone: "utility", test: /curse|warlock|mage|sheep|banish|\bcc\b|soulstone|\bss\b|innervate|bloodlust|hero|tremor|fear ward/i }
];
function toneForLabel(label) {
  for (const t of BLOCK_TONES) if (t.test.test(label)) return t.tone;
  return "neutral";
}

try {
  const saved = localStorage.getItem("strategyContentPhase");
  if (saved === "1" || saved === "2") activeContentPhase = saved;
} catch { }

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

// Only allow http(s) links; block javascript:/data: and auto-prefix bare domains.
function normalizeUrl(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return ""; // reject other schemes (javascript:, data:, …)
  return "https://" + u;
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

// ── Page title + intro ──────────────────────────────────────────────────────────
function updateTitleDisplay() {
  if (strategyTitleEl) strategyTitleEl.textContent = strategyTitle;
  if (editTitleButton) editTitleButton.hidden = !isAdmin;
  renderIntro();
}

function renderIntro() {
  if (!strategyIntroEl) return;
  if (strategyIntro) { strategyIntroEl.textContent = strategyIntro; strategyIntroEl.hidden = false; }
  else { strategyIntroEl.textContent = ""; strategyIntroEl.hidden = true; }
}

function showTitleEdit() {
  if (editTitleInput) editTitleInput.value = strategyTitle;
  if (editIntroInput) editIntroInput.value = strategyIntro;
  if (editTitleForm) editTitleForm.hidden = false;
  if (strategyTitleEl) strategyTitleEl.hidden = true;
  if (strategyIntroEl) strategyIntroEl.hidden = true;
  if (editTitleButton) editTitleButton.hidden = true;
}

function hideTitleEdit() {
  if (editTitleForm) editTitleForm.hidden = true;
  if (strategyTitleEl) strategyTitleEl.hidden = false;
  updateTitleDisplay();
}

async function saveTitle() {
  const newTitle = editTitleInput ? editTitleInput.value.trim() : "";
  const newIntro = editIntroInput ? editIntroInput.value.trim() : "";
  if (!newTitle) { setMessage(strategyMessage, "Title is required.", true); return; }
  if (saveTitleButton) saveTitleButton.disabled = true;
  try {
    await setDoc(doc(db, "strategy", "pageConfig"), { title: newTitle, intro: newIntro, updatedAt: serverTimestamp() }, { merge: true });
    hideTitleEdit();
  } catch (error) {
    setMessage(strategyMessage, error.message, true);
  } finally {
    if (saveTitleButton) saveTitleButton.disabled = false;
  }
}

// ── Rendering ─────────────────────────────────────────────────────────────────
function getSections() {
  return strategyDocs.filter((d) => d.kind === "section").sort((a, b) => (a.order || 0) - (b.order || 0));
}
function getEntries() {
  return strategyDocs.filter((d) => d.kind === "entry");
}

// A section's content phase: "1", "2", or "all" (shown under every phase tab).
function sectionPhase(section) {
  const p = section && section.phase;
  if (p === 1 || p === "1") return "1";
  if (p === 2 || p === "2") return "2";
  return "all";
}
function sectionVisibleInPhase(section, phase) {
  const sp = sectionPhase(section);
  return sp === "all" || sp === phase;
}

// Parse an entry's notes (string[]) into intro bullets + fight phases of colour blocks.
//   "# Phase name"  → a new fight phase
//   "## Block label" → a colour-coded assignment block within the current phase
//   plain lines      → bullet items in the current block / phase / intro
function parseEntryContent(notes) {
  const lines = Array.isArray(notes) ? notes : [];
  const intro = [];
  const phases = [];
  let curPhase = null;
  let curBlock = null;
  for (const raw of lines) {
    const line = String(raw == null ? "" : raw).trim();
    if (!line) continue;
    if (line.startsWith("## ")) {
      const label = line.slice(3).trim();
      if (!curPhase) { curPhase = { name: "", blocks: [], loose: [] }; phases.push(curPhase); }
      curBlock = { label, tone: toneForLabel(label), items: [] };
      curPhase.blocks.push(curBlock);
    } else if (line.startsWith("# ")) {
      curPhase = { name: line.slice(2).trim(), blocks: [], loose: [] };
      phases.push(curPhase);
      curBlock = null;
    } else {
      const item = line.replace(/^[-*•]\s*/, "");
      if (curBlock) curBlock.items.push(item);
      else if (curPhase) curPhase.loose.push(item);
      else intro.push(item);
    }
  }
  return { intro, phases };
}

function renderBlock(block) {
  const items = block.items.length
    ? `<ul class="strategy-block-items">${block.items.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`
    : "";
  return `<div class="strategy-block strategy-tone-${block.tone}">
    <div class="strategy-block-label">${escapeHtml(block.label)}</div>
    ${items}
  </div>`;
}

function renderPhases(entryId, phases) {
  const useTabs = phases.length > 1 || (phases[0] && phases[0].name);
  const active = Math.min(Math.max(fightPhaseState[entryId] || 0, 0), phases.length - 1);
  const tabs = useTabs ? `<div class="strategy-fp-tabs">${phases.map((p, i) =>
    `<button type="button" class="strategy-fp-tab ${i === active ? "is-active" : ""}" data-entry="${escapeHtml(entryId)}" data-index="${i}">${escapeHtml(p.name || ("Phase " + (i + 1)))}</button>`
  ).join("")}</div>` : "";
  const panels = phases.map((p, i) => {
    const loose = p.loose.length ? `<ul class="strategy-card-notes">${p.loose.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : "";
    const blocks = p.blocks.length ? `<div class="strategy-blocks">${p.blocks.map(renderBlock).join("")}</div>` : "";
    return `<div class="strategy-fp-panel ${i === active ? "" : "is-hidden"}" data-entry="${escapeHtml(entryId)}" data-index="${i}">${loose}${blocks}</div>`;
  }).join("");
  return `<div class="strategy-phases">${tabs}${panels}</div>`;
}

function renderContentPhaseTabs() {
  if (!strategyPhaseTabs) return;
  strategyPhaseTabs.innerHTML = CONTENT_PHASES.map((p) =>
    `<button type="button" class="strategy-phase-tab ${p.id === activeContentPhase ? "is-active" : ""}" data-phase="${p.id}">
       <span class="strategy-phase-tab-label">${escapeHtml(p.label)}</span>
       <span class="strategy-phase-tab-hint">${escapeHtml(p.hint)}</span>
     </button>`
  ).join("");
  strategyPhaseTabs.querySelectorAll(".strategy-phase-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeContentPhase = btn.dataset.phase;
      try { localStorage.setItem("strategyContentPhase", activeContentPhase); } catch { }
      renderStrategy();
    });
  });
}

function renderSectionTabs(sections) {
  if (!strategyTabs) return;
  if (!sections.length) { strategyTabs.innerHTML = ""; strategyTabs.hidden = true; return; }
  strategyTabs.hidden = false;
  strategyTabs.innerHTML = sections.map((s) =>
    `<a class="strategy-tab" href="#section-${escapeHtml(s.id)}">${s.emoji ? escapeHtml(s.emoji) + " " : ""}${escapeHtml(s.title)}</a>`
  ).join("");
}

function renderLinks(links) {
  const list = Array.isArray(links) ? links : [];
  const html = list.map((l) => {
    const href = normalizeUrl(l && l.url);
    if (!href) return "";
    const kind = LINK_KINDS.includes(l.kind) ? l.kind : "link";
    const label = (l.label && String(l.label).trim()) ? String(l.label).trim() : LINK_FALLBACK_LABEL[kind];
    return `<a class="strategy-link-btn strategy-link-${kind}" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"><span class="strategy-link-icon">${LINK_ICONS[kind]}</span>${escapeHtml(label)}</a>`;
  }).join("");
  return html ? `<div class="strategy-links">${html}</div>` : "";
}

function renderCard(entry) {
  const { intro, phases } = parseEntryContent(entry.notes);
  const adminActions = isAdmin ? `
    <div class="strategy-card-actions">
      <button type="button" class="sched-action-btn strategy-card-edit" data-id="${escapeHtml(entry.id)}" title="Edit card">&#9998;</button>
      <button type="button" class="sched-action-btn sched-delete-btn strategy-card-delete" data-id="${escapeHtml(entry.id)}" title="Delete card">&times;</button>
    </div>` : "";

  const introHtml = intro.length ? `<ul class="strategy-card-notes">${intro.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>` : "";
  const phasesHtml = phases.length ? renderPhases(entry.id, phases) : "";
  const phasedClass = phases.length ? " strategy-card-phased" : "";

  return `
    <div class="strategy-card${phasedClass}">
      <div class="strategy-card-head">
        ${entry.emoji ? `<span class="strategy-card-emoji">${escapeHtml(entry.emoji)}</span>` : ""}
        <h4 class="strategy-card-title">${escapeHtml(entry.title || "")}</h4>
        ${entry.tag ? `<span class="strategy-tag">${escapeHtml(entry.tag)}</span>` : ""}
        ${adminActions}
      </div>
      ${introHtml}
      ${phasesHtml}
      ${renderLinks(entry.links)}
    </div>
  `;
}

function renderSection(section, sectionEntries) {
  const isOrphan = !!section.__orphan;
  const layoutClass = section.layout === "list" ? "strategy-list" : "strategy-grid";
  const sectionActions = (isAdmin && !isOrphan) ? `
    <div class="strategy-section-actions">
      <button type="button" class="secondary strategy-add-entry-btn" data-section="${escapeHtml(section.id)}">+ Card</button>
      <button type="button" class="sched-action-btn strategy-edit-section-btn" data-id="${escapeHtml(section.id)}" title="Edit section">&#9998;</button>
      <button type="button" class="sched-action-btn sched-delete-btn strategy-delete-section-btn" data-id="${escapeHtml(section.id)}" title="Delete section">&times;</button>
    </div>` : "";

  const body = sectionEntries.length
    ? sectionEntries.map(renderCard).join("")
    : `<p class="strategy-empty-section">No cards yet.${(isAdmin && !isOrphan) ? ' Use "+ Card" to add one.' : ""}</p>`;

  return `
    <section class="strategy-section" id="section-${escapeHtml(section.id)}">
      <div class="strategy-section-head">
        <h3 class="strategy-section-title">${section.emoji ? `<span class="strategy-section-emoji">${escapeHtml(section.emoji)}</span>` : ""}${escapeHtml(section.title)}</h3>
        ${sectionActions}
      </div>
      <div class="${layoutClass}">${body}</div>
    </section>
  `;
}

function renderStrategy() {
  if (!strategyContent) return;
  if (strategyAdminActions) strategyAdminActions.hidden = !isAdmin;

  renderContentPhaseTabs();

  const allSections = getSections();
  const sections = allSections.filter((s) => sectionVisibleInPhase(s, activeContentPhase));
  const entries = getEntries();
  const allSectionIds = new Set(allSections.map((s) => s.id));
  const orphans = entries.filter((e) => !allSectionIds.has(e.sectionId)).sort((a, b) => (a.order || 0) - (b.order || 0));

  renderSectionTabs(sections);

  if (!allSections.length && !entries.length) {
    strategyContent.innerHTML = `<p class="schedule-empty">No strategy sections yet.${isAdmin ? ' Click "+ Add Section" to start.' : ""}</p>`;
    return;
  }

  const entriesFor = (sid) => entries.filter((e) => e.sectionId === sid).sort((a, b) => (a.order || 0) - (b.order || 0));

  let html = sections.map((section) => renderSection(section, entriesFor(section.id))).join("");
  if (orphans.length) {
    html += renderSection({ id: "__unsectioned", title: "Unsectioned", emoji: "\u{1F4C1}", layout: "grid", __orphan: true }, orphans);
  }
  if (!sections.length && !orphans.length) {
    const phaseLabel = activeContentPhase === "1" ? "Phase 1" : "Phase 2";
    html = `<p class="schedule-empty">Nothing in ${phaseLabel} yet.${isAdmin ? " Add a section, or set an existing section's phase." : ""}</p>`;
  }
  strategyContent.innerHTML = html;
  bindStrategyEvents();
}

function bindStrategyEvents() {
  if (!strategyContent) return;
  strategyContent.querySelectorAll(".strategy-add-entry-btn").forEach((btn) => {
    btn.addEventListener("click", () => openEntryDialog(null, btn.dataset.section));
  });
  strategyContent.querySelectorAll(".strategy-edit-section-btn").forEach((btn) => {
    btn.addEventListener("click", () => openSectionDialog(btn.dataset.id));
  });
  strategyContent.querySelectorAll(".strategy-delete-section-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteSection(btn.dataset.id));
  });
  strategyContent.querySelectorAll(".strategy-card-edit").forEach((btn) => {
    btn.addEventListener("click", () => openEntryDialog(btn.dataset.id));
  });
  strategyContent.querySelectorAll(".strategy-card-delete").forEach((btn) => {
    btn.addEventListener("click", () => deleteEntry(btn.dataset.id));
  });
  // Fight-phase tabs toggle panels in place (no full re-render → no flicker)
  strategyContent.querySelectorAll(".strategy-fp-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const entryId = btn.dataset.entry;
      const idx = Number(btn.dataset.index);
      fightPhaseState[entryId] = idx;
      strategyContent.querySelectorAll(`.strategy-fp-tab[data-entry="${entryId}"]`).forEach((t) => t.classList.toggle("is-active", Number(t.dataset.index) === idx));
      strategyContent.querySelectorAll(`.strategy-fp-panel[data-entry="${entryId}"]`).forEach((panel) => panel.classList.toggle("is-hidden", Number(panel.dataset.index) !== idx));
    });
  });
}

// ── Section CRUD ────────────────────────────────────────────────────────────────
function openSectionDialog(docId) {
  if (!sectionDialog) return;
  const section = docId ? strategyDocs.find((d) => d.id === docId && d.kind === "section") : null;
  if (sectionEditId) sectionEditId.value = docId || "";
  if (sectionTitleInput) sectionTitleInput.value = section ? (section.title || "") : "";
  if (sectionEmojiInput) sectionEmojiInput.value = section ? (section.emoji || "") : "";
  if (sectionLayoutSelect) sectionLayoutSelect.value = section ? (section.layout || "grid") : "grid";
  if (sectionPhaseSelect) sectionPhaseSelect.value = section ? sectionPhase(section) : activeContentPhase;
  if (deleteSectionButton) deleteSectionButton.hidden = !docId;
  if (sectionDialogTitle) sectionDialogTitle.textContent = docId ? "Edit Section" : "Add Section";
  setMessage(sectionDialogMessage, "");
  sectionDialog.showModal();
}

async function saveSection() {
  const docId = sectionEditId ? sectionEditId.value : "";
  const title = sectionTitleInput ? sectionTitleInput.value.trim() : "";
  const emoji = sectionEmojiInput ? sectionEmojiInput.value.trim() : "";
  const layout = sectionLayoutSelect ? sectionLayoutSelect.value : "grid";
  const phase = sectionPhaseSelect ? sectionPhaseSelect.value : "all";
  if (!title) { setMessage(sectionDialogMessage, "Title is required.", true); return; }

  if (saveSectionButton) saveSectionButton.disabled = true;
  try {
    if (docId) {
      await updateDoc(doc(db, "strategy", docId), { title, emoji, layout, phase, updatedAt: serverTimestamp() });
    } else {
      const maxOrder = getSections().reduce((m, s) => Math.max(m, s.order || 0), 0);
      await addDoc(collection(db, "strategy"), { kind: "section", title, emoji, layout, phase, order: maxOrder + 1000, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }
    if (sectionDialog) sectionDialog.close();
    setMessage(strategyMessage, "Saved.", false);
  } catch (error) {
    setMessage(sectionDialogMessage, error.message, true);
  } finally {
    if (saveSectionButton) saveSectionButton.disabled = false;
  }
}

async function deleteSection(docId) {
  if (!docId) return;
  const children = getEntries().filter((e) => e.sectionId === docId);
  const section = strategyDocs.find((d) => d.id === docId);
  const name = section ? section.title : "this section";
  const childMsg = children.length ? ` and its ${children.length} card${children.length === 1 ? "" : "s"}` : "";
  if (!confirm(`Delete "${name}"${childMsg}? This cannot be undone.`)) return;
  try {
    await Promise.all([
      ...children.map((c) => deleteDoc(doc(db, "strategy", c.id))),
      deleteDoc(doc(db, "strategy", docId))
    ]);
    setMessage(strategyMessage, "Section deleted.", false);
  } catch (error) {
    setMessage(strategyMessage, error.message, true);
  }
}

// ── Entry CRUD + link-row repeater ──────────────────────────────────────────────
function addLinkRow(data = {}) {
  if (!entryLinkRows) return;
  const row = document.createElement("div");
  row.className = "strategy-link-row";

  const kind = LINK_KINDS.includes(data.kind) ? data.kind : "link";
  const select = document.createElement("select");
  select.className = "sched-input strategy-link-kind";
  for (const k of LINK_KINDS) {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = k.charAt(0).toUpperCase() + k.slice(1);
    if (k === kind) opt.selected = true;
    select.appendChild(opt);
  }

  const labelInput = document.createElement("input");
  labelInput.type = "text";
  labelInput.className = "sched-input strategy-link-label";
  labelInput.placeholder = "Label (optional)";
  labelInput.maxLength = 60;
  labelInput.value = data.label || "";

  const urlInput = document.createElement("input");
  urlInput.type = "text";
  urlInput.className = "sched-input strategy-link-url";
  urlInput.placeholder = "https://…";
  urlInput.value = data.url || "";

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "sched-action-btn strategy-link-remove";
  removeBtn.title = "Remove link";
  removeBtn.innerHTML = "&times;";
  removeBtn.addEventListener("click", () => row.remove());

  row.append(select, labelInput, urlInput, removeBtn);
  entryLinkRows.appendChild(row);
}

function collectLinkRows() {
  if (!entryLinkRows) return [];
  return [...entryLinkRows.querySelectorAll(".strategy-link-row")].map((r) => ({
    kind: r.querySelector(".strategy-link-kind").value,
    label: r.querySelector(".strategy-link-label").value.trim(),
    url: r.querySelector(".strategy-link-url").value.trim()
  })).filter((l) => l.url);
}

function openEntryDialog(docId, sectionId) {
  if (!entryDialog) return;
  const entry = docId ? strategyDocs.find((d) => d.id === docId && d.kind === "entry") : null;
  if (entryEditId) entryEditId.value = docId || "";
  if (entrySectionId) entrySectionId.value = entry ? entry.sectionId : (sectionId || "");
  if (entryEmojiInput) entryEmojiInput.value = entry ? (entry.emoji || "") : "";
  if (entryTitleInput) entryTitleInput.value = entry ? (entry.title || "") : "";
  if (entryTagInput) entryTagInput.value = entry ? (entry.tag || "") : "";
  if (entryNotesInput) entryNotesInput.value = entry ? (Array.isArray(entry.notes) ? entry.notes.join("\n") : "") : "";
  if (entryLinkRows) entryLinkRows.innerHTML = "";
  const links = entry && Array.isArray(entry.links) ? entry.links : [];
  links.forEach((l) => addLinkRow(l));
  if (deleteEntryButton) deleteEntryButton.hidden = !docId;
  if (entryDialogTitle) entryDialogTitle.textContent = docId ? "Edit Card" : "Add Card";
  setMessage(entryDialogMessage, "");
  entryDialog.showModal();
}

async function saveEntry() {
  const docId = entryEditId ? entryEditId.value : "";
  const sectionId = entrySectionId ? entrySectionId.value : "";
  const emoji = entryEmojiInput ? entryEmojiInput.value.trim() : "";
  const title = entryTitleInput ? entryTitleInput.value.trim() : "";
  const tag = entryTagInput ? entryTagInput.value.trim() : "";
  const notes = entryNotesInput ? entryNotesInput.value.split("\n").map((l) => l.trim()).filter(Boolean) : [];
  const links = collectLinkRows();

  if (!title) { setMessage(entryDialogMessage, "Title is required.", true); return; }
  if (!sectionId) { setMessage(entryDialogMessage, "Missing section.", true); return; }

  if (saveEntryButton) saveEntryButton.disabled = true;
  try {
    const data = { kind: "entry", sectionId, emoji, title, tag, notes, links, updatedAt: serverTimestamp() };
    if (docId) {
      await updateDoc(doc(db, "strategy", docId), data);
    } else {
      const siblings = getEntries().filter((e) => e.sectionId === sectionId);
      const maxOrder = siblings.reduce((m, e) => Math.max(m, e.order || 0), 0);
      data.order = maxOrder + 10;
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "strategy"), data);
    }
    if (entryDialog) entryDialog.close();
    setMessage(strategyMessage, "Saved.", false);
  } catch (error) {
    setMessage(entryDialogMessage, error.message, true);
  } finally {
    if (saveEntryButton) saveEntryButton.disabled = false;
  }
}

async function deleteEntry(docId) {
  if (!docId) return;
  if (!confirm("Delete this card?")) return;
  try {
    await deleteDoc(doc(db, "strategy", docId));
    setMessage(strategyMessage, "Deleted.", false);
  } catch (error) {
    setMessage(strategyMessage, error.message, true);
  }
}

// ── Seed defaults ─────────────────────────────────────────────────────────────
async function seedSection(strategyRef, sectionData, entries) {
  const ref = await addDoc(strategyRef, { kind: "section", emoji: "", layout: "grid", phase: "all", ...sectionData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  let order = 10;
  for (const e of entries) {
    await addDoc(strategyRef, { kind: "entry", sectionId: ref.id, emoji: "", tag: "", notes: [], links: [], ...e, order, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    order += 10;
  }
}

async function seedDefaultStrategy() {
  const strategyRef = collection(db, "strategy");
  const snap = await getDocs(strategyRef);
  const cfgDoc = snap.docs.find((d) => d.id === "pageConfig");
  const realDocs = snap.docs.filter((d) => d.id !== "pageConfig");
  const seededVersion = cfgDoc ? (cfgDoc.data().seedVersion || 1) : 0;

  // Already populated AND up to date → nothing to do.
  if (realDocs.length > 0 && seededVersion >= SEED_VERSION) return;
  // Outdated demo content → clear sections/entries and re-seed the new model.
  if (realDocs.length > 0) {
    await Promise.all(realDocs.map((d) => deleteDoc(doc(db, "strategy", d.id))));
  }

  await seedSection(strategyRef, { title: "Roster", emoji: "\u{1F465}", layout: "grid", phase: "all", order: 1000 }, [
    {
      title: "Class / Spec Pool",
      notes: [
        "Tanks: Prot Warrior, Feral (Bear) Druid",
        "Warlocks: Destruction, Affliction",
        "Hunters: Beast Mastery, Survival",
        "Mages: Arcane",
        "Shaman: Elemental, Enhancement, Resto",
        "Priests: Holy, Discipline, Shadow",
        "Druids: Resto, Balance, Bear",
        "Rogues: Combat",
        "Warriors: Arms, Fury, Prot",
        "Paladins: Holy, Ret, Prot"
      ]
    },
    {
      title: "Comp — Morogrim / Vashj",
      tag: "25-man",
      notes: [
        "G1: Survival Hunter, 3x BM Hunter, Enh Shaman",
        "G2: Ret/Prot/Holy Pal, Bear, Arms Warr, Fury Warr, Enh Shaman",
        "G3: Holy Pal, Resto Shaman, Prot, Holy Priest, Resto Druid",
        "G4: Shadow Priest, Arcane Mage, Affli Lock, Holy/Prot, Ele Shaman",
        "G5: 3x Destro Lock, Boomkin, Ele Shaman"
      ]
    }
  ]);

  await seedSection(strategyRef, { title: "Reference", emoji: "\u{1F4D6}", layout: "grid", phase: "all", order: 2000 }, [
    {
      title: "Raid Buffs & Debuffs",
      notes: [
        "Boomkin: Improved Faerie Fire (+3% hit), Insect Swarm (-2% enemy hit)",
        "Shadow Priest: Misery (+5% spell dmg), Shadow Weaving (+10% shadow)",
        "Affliction Lock: Malediction (+3% Curse of Elements), Shadow Embrace",
        "Disc Priest: Improved Divine Spirit",
        "Paladin: Improved Seals (+3% crit) + Blessings (Kings / Salv / Might / Wisdom)",
        "Arms Warrior: Blood Frenzy (+4% physical dmg)",
        "Combat Rogue: Improved Expose Armor (-3075 armor)",
        "Survival Hunter: Improved Hunter's Mark + Expose Weakness",
        "Enh Shaman: Unleashed Rage (+10% melee AP), Windfury, Bloodlust"
      ]
    },
    {
      title: "Tank ↔ Heal Pairs",
      tag: "Assignments",
      notes: [
        "MT (Warrior) → H1",
        "OT (Bear) → H2",
        "AoE Tank (Paladin) → H3",
        "Raid healers cover spot damage",
        "Innervate priority: healers low on mana first"
      ]
    }
  ]);

  await seedSection(strategyRef, { title: "Gruul's Lair", emoji: "\u{1FAA8}", layout: "list", phase: "1", order: 3000 }, [
    {
      title: "Trash",
      notes: [
        "Lair Brute: cleaves — point away from raid; Mortal Strike — heal/mitigate through",
        "Gronn-Priest: interrupt heals (~2s cast); purge/dispel Renews; drop tremor totems + fear ward tanks for Psychic Scream"
      ]
    },
    {
      title: "High King Maulgar",
      tag: "Council",
      notes: [
        "5-boss council — pull, split adds, and burn in order",
        "## Kill Order",
        "Ranged: Blindeye → Olm → Krosh → Kiggler → Maulgar",
        "Melee: Blindeye → Olm → Maulgar",
        "## Tanks",
        "Krosh (mage) → Mage-tank with Spell Reflect on Blast Wave; LoS Polymorph",
        "Olm (warlock) → offtank; enslave or banish the felhunters",
        "Kiggler (shaman) → ranged-tank; dispel his debuffs",
        "Maulgar → MT",
        "## Interrupts",
        "Blindeye (priest) → kick/stun heals; burn the shield (~25k) or mass-dispel / silence"
      ],
      links: [
        { kind: "doc", label: "Wowhead — Maulgar", url: "https://www.wowhead.com/tbc/npc=18831/high-king-maulgar" }
      ]
    },
    {
      title: "Gruul the Dragonkiller",
      notes: [
        "## Tanks",
        "MT faces Gruul away from raid (Hurtful Strike hits #2 on threat)",
        "## Positioning",
        "Ground Slam → Shatter: spread out to minimize Shatter damage",
        "Keep the raid spread for Cave In",
        "## Utility",
        "Growth: stacking dmg/haste — push the kill before ~25–30 stacks"
      ]
    }
  ]);

  await seedSection(strategyRef, { title: "Magtheridon's Lair", emoji: "☠️", layout: "list", phase: "1", order: 3500 }, [
    {
      title: "Trash — Hellfire Warders",
      notes: [
        "Shadow Bolt Volley — must be interrupted",
        "Word of Pain — dispel; Unstable Affliction — do NOT dispel (5s silence)",
        "Rain of Fire — move out; Shadow Burst — knockback + threat reset, taunt after"
      ]
    },
    {
      title: "Magtheridon",
      tag: "2 phases",
      notes: [
        "# Phase 1 — Channelers",
        "Kill the 5 Hellfire Channelers to release Magtheridon",
        "## Tanks",
        "MT, OT, and an AoE tank on the channeler groups",
        "## Interrupts",
        "2 assigned Shadow Bolt Volley interrupts per group; Burning Abyssal adds tanked",
        "## Utility",
        "Tremor totems + Fear Ward for the fears",
        "# Phase 2 — Magtheridon",
        "Boss active — Manticron Cubes are the whole fight",
        "## Positioning",
        "Spread for Blast Nova; stay near your cube",
        "## Utility",
        "Click Manticron Cubes together to interrupt Blast Nova (channel ~10s, Mind Exhaustion after)",
        "Quake → knockback + falling debris; Cave In patches on the ground"
      ]
    }
  ]);

  await seedSection(strategyRef, { title: "Serpentshrine Cavern", emoji: "\u{1F30A}", layout: "list", phase: "2", order: 4000 }, [
    {
      title: "Trash → Hydross",
      notes: [
        "Hate-Screamer: AoE silence — tank away from group, kill last",
        "Beast Tamer: frontal cleave — melee watch out",
        "Sporebat: charges farthest target — offtank, can Hibernate",
        "Mark Skull / X for kill order"
      ]
    },
    {
      title: "Hydross the Unstable",
      tag: "Resist swap",
      notes: [
        "Two sides: Nature (clean) and Frost (corrupted)",
        "## Tanks",
        "Nature side → frost-resist tank",
        "Frost side → nature-resist tank",
        "Swap at 3–4 stacks before the resist debuff hurts",
        "Offtanks pick up the 4 adds on each transition",
        "## Utility",
        "Bloodlust on the final / easier phase"
      ]
    },
    {
      title: "Leotheras the Blind",
      notes: [
        "## Tanks",
        "Warlock tanks the Inner Demon phase",
        "## Positioning",
        "Whirlwind phase: everyone scatters; tank-by-class as Demons spawn",
        "## Kill Order",
        "Each player solos their own Inner Demon — kill fast or get Mind Controlled"
      ]
    }
  ]);

  await seedSection(strategyRef, { title: "Tempest Keep: The Eye", emoji: "⚡", layout: "list", phase: "2", order: 5000 }, [
    {
      title: "Trash → Al'ar",
      notes: [
        "Bloodwarder Legionnaire: Bloodthirst / Cleave / Whirlwind (bleed)",
        "Star Scryer: AoE Starfall, Mind Control — sheep / CC",
        "Bloodwater Vindicator: heals — interrupt / dispel",
        "Mark Skull / X kill order; mage sheep the casters"
      ]
    },
    {
      title: "Al'ar",
      tag: "2 phases",
      notes: [
        "# Phase 1 — Platforms",
        "Phase 1 rides on the tanks' knowledge of the platform rotation",
        "## Tanks",
        "TANK 1 → starts where Al'ar starts",
        "TANK 2 → starts one slot left",
        "TANK 3 → starts across from Al'ar (mostly idle early)",
        "Adds Tank → grabs the spawns",
        "## Healers",
        "1 healer per platform tank + 1 on the Adds tank",
        "## Positioning",
        "Dive Bomb → clear the marked spot fast",
        "Stack under the boss for Flame Quills",
        "# Phase 2 — Melt Armor",
        "Two tanks must taunt off each other when the other gets Melt Armor",
        "## Tanks",
        "T1 ↔ T2 — swap on Melt Armor",
        "Adds Tank on Ember of Al'ar",
        "## Positioning",
        "Spread the Embers out — they explode on death",
        "Run out for Meteor; keep moving off Flame Patches"
      ]
    },
    {
      title: "Void Reaver",
      tag: "Stack & spread",
      notes: [
        "Everyone stack tight and move in as a unit",
        "Orb eaters spread out far away",
        "## Tanks",
        "MT holds Void Reaver",
        "## Healers",
        "3x raid healers spread across the raid",
        "## Orb Eaters",
        "All hunters soak the Arcane Orbs out wide"
      ]
    },
    {
      title: "Solarian",
      tag: "3 phases",
      notes: [
        "# Phase 1A — Split",
        "## Healers",
        "Missile healers assigned; everyone not tank-healing covers the raid",
        "# Phase 1B — Adds",
        "Adds spawn; two are healers that must be kicked",
        "## Tanks",
        "TANK the left add group / TANK the right add group",
        "## Healers",
        "1 healer per add tank",
        "## Interrupts",
        "1 kicker per add group — interrupt the add-healers",
        "# Phase 2 — Voidwalker (20%)",
        "Turns into a voidwalker with AoE fear",
        "## Tanks",
        "TANK the voidwalker",
        "## Healers",
        "Stacked healing on the tank",
        "## Utility",
        "Grounding totems down; Fear Ward on tanks"
      ]
    },
    {
      title: "Kael'thas Sunstrider",
      tag: "5 phases",
      notes: [
        "# P1 — The Advisors",
        "Kill the 4 advisors in their corners",
        "## Kill Order",
        "Thaladred (kill in the back of the room)",
        "## Tanks",
        "Sanguinar → tank (Tremor + Fear Ward)",
        "Telonicus → tank",
        "## Utility",
        "Capernian → tanked by a Warlock; conflag soaker",
        "Thaladred → 'zig then zag' to dodge his gaze",
        "# P2 — Weapons",
        "7 weapons spawn — assignments per weapon",
        "## Tanks",
        "Warp Slicer (sword) → MT",
        "Devastation (axe) → strong whirlwind; tanked off to the side",
        "Cosmic Infuser (mace) → heals, must be kicked",
        "Phaseshift Bulwark → reflects melee; same as Cosmic Infuser",
        "Netherstrand Longbow → threat resets on melee hit; ranged-tank, face away",
        "## Interrupts",
        "Cosmic Infuser — kick its heals",
        "## Kill Order",
        "Mace → Staff → Sword → Dagger (focus); Bow & Axe focus, NO melee",
        "## Positioning",
        "Tank everything in a cluster",
        "Except the axe — off to the side, in range of seed",
        "Except the bow — slightly away, pointed away from the raid",
        "## Staff Buff",
        "Staff of Disintegration → group staff buff (groups 1–5)",
        "# P3 — Advisors (punchline)",
        "Advisors return — re-kill",
        "## Tanks",
        "Sanguinar → tank (Tremor / Fear Ward)",
        "Telonicus → tank",
        "## Utility",
        "Capernian → Warlock; conflag soaker",
        "## Kill Order",
        "Melee: Sanguinar → Telonicus",
        "Ranged: Thaladred → Capernian",
        "# P4 — Kael'thas",
        "Telonicus likely still alive — kill him first",
        "## Kill Order",
        "Phoenix → Telonicus → Kael'thas",
        "## Tanks",
        "TANK Kael'thas; Kite Tank A / Kite Tank B on Phoenix (if two up)",
        "## Interrupts",
        "Kick Fireball; kill the egg after the Phoenix dies",
        "## Positioning",
        "Flamestrike — don't stand in it!",
        "## Utility",
        "Arcane Disruption every 20s (raid dmg + 10s disorient) — Staff of Disintegration prevents disorient",
        "Mind Control — broken by Infinity Blade",
        "Shock Barrier (80k shield) makes spells uninterruptible; Pyroblast cast 3x — kick it",
        "# P5 — 50%",
        "Still casts Arcane Disruption, Fireball, Flamestrike, Phoenix, Shock Barrier",
        "## Positioning",
        "Gravity Lapse — teleports everyone up; you can fly — hover just above the ground to land",
        "Nether Beam — chain beam during the lapse; spread out",
        "Nether Vapor — black clouds; get out of them"
      ]
    }
  ]);

  await setDoc(doc(db, "strategy", "pageConfig"), {
    title: DEFAULT_TITLE,
    intro: "Living strategy doc — roster, boss strategy, and references. Use the phase tabs to switch content; click a boss's phase tabs to flip between fight phases.",
    seedVersion: SEED_VERSION,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
{
  if (!hasConfigValues()) setMessage(strategyMessage, "Firebase config missing.", true);

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  db = getFirestore(app);

  const strategyRef = collection(db, "strategy");
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
    try { await signOut(auth); } catch (e) { setMessage(strategyMessage, e.message, true); } finally { signOutButton.disabled = false; }
  });
  if (copyUidButton) copyUidButton.addEventListener("click", async () => {
    const uid = String(authUid || "").trim(); if (!uid) return;
    try { await navigator.clipboard.writeText(uid); if (authStatus) authStatus.textContent = "UID copied."; } catch { }
  });

  // Title editing
  if (editTitleButton) editTitleButton.addEventListener("click", showTitleEdit);
  if (saveTitleButton) saveTitleButton.addEventListener("click", saveTitle);
  if (cancelTitleButton) cancelTitleButton.addEventListener("click", hideTitleEdit);

  // Section dialog
  if (addSectionButton) addSectionButton.addEventListener("click", () => openSectionDialog(null));
  if (saveSectionButton) saveSectionButton.addEventListener("click", saveSection);
  if (deleteSectionButton) deleteSectionButton.addEventListener("click", () => {
    const docId = sectionEditId ? sectionEditId.value : "";
    if (docId) deleteSection(docId).then(() => { if (sectionDialog) sectionDialog.close(); });
  });
  if (cancelSectionButton) cancelSectionButton.addEventListener("click", () => { if (sectionDialog) sectionDialog.close(); });

  // Entry dialog
  if (addLinkRowButton) addLinkRowButton.addEventListener("click", () => addLinkRow());
  if (saveEntryButton) saveEntryButton.addEventListener("click", saveEntry);
  if (deleteEntryButton) deleteEntryButton.addEventListener("click", () => {
    const docId = entryEditId ? entryEditId.value : "";
    if (docId) deleteEntry(docId).then(() => { if (entryDialog) entryDialog.close(); });
  });
  if (cancelEntryButton) cancelEntryButton.addEventListener("click", () => { if (entryDialog) entryDialog.close(); });

  // ── Auth state ──────────────────────────────────────────────────────────────
  let authGeneration = 0;

  onAuthStateChanged(auth, async (user) => {
    const gen = ++authGeneration;

    if (unsubscribeStrategy) { unsubscribeStrategy(); unsubscribeStrategy = null; }
    if (unsubscribeConfig) { unsubscribeConfig(); unsubscribeConfig = null; }

    if (!user) {
      authUid = null; isAdmin = false; isOwner = false;
      strategyDocs = []; strategyTitle = DEFAULT_TITLE; strategyIntro = "";
      renderStrategy(); updateTitleDisplay();
      setAuthGateState(false, "Sign in to view raid strategy.");
      updateAuthActionButtons(null); updateUidDisplay("");
      if (authStatus) authStatus.textContent = "Signed out.";
      return;
    }

    authUid = user.uid;
    setAuthGateState(true);
    updateAuthActionButtons(user);
    updateUidDisplay(authUid);
    if (authStatus) authStatus.textContent = `Signed in (${user.email || authUid.slice(0, 8) + "..."})`;

    // Subscribe to strategy docs (sections + entries; pageConfig has no `order` so it's excluded)
    unsubscribeStrategy = onSnapshot(
      query(strategyRef, orderBy("order", "asc")),
      (snapshot) => {
        strategyDocs = snapshot.docs.filter((d) => d.id !== "pageConfig").map((d) => ({ id: d.id, ...d.data() }));
        renderStrategy();
      },
      (error) => { console.error("[STRATEGY]", error.code, error.message); setMessage(strategyMessage, error.message, true); }
    );

    // Subscribe to config doc for page title + intro
    unsubscribeConfig = onSnapshot(
      doc(db, "strategy", "pageConfig"),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          strategyTitle = data.title || DEFAULT_TITLE;
          strategyIntro = data.intro || "";
        }
        updateTitleDisplay();
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
    renderStrategy();
    updateTitleDisplay();

    if (isAdmin) seedDefaultStrategy().catch(() => {});
  });
}
