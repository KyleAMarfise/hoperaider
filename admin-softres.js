import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  GoogleAuthProvider,
  OAuthProvider,
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
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { appSettings, firebaseConfig } from "./config/prod/firebase-config.js";

// ── DOM refs ────────────────────────────────────────────────────────────────
const authStatus = document.getElementById("adminAuthStatus");
const appShell = document.getElementById("appShell");
const authGate = document.getElementById("authGate");
const authGateMessage = document.getElementById("authGateMessage");
const authGateSignInButton = document.getElementById("authGateSignInButton");
const currentUidEl = document.getElementById("currentUid");
const copyUidButton = document.getElementById("copyUidButton");
const signOutButton = document.getElementById("signOutButton");
const siteTitleEl = document.getElementById("siteTitle");
const guildDiscordLink = document.getElementById("guildDiscordLink");
const adminOpsBadge = document.getElementById("adminOpsBadge");

const softresSection = document.getElementById("softresSection");
const softresDetail = document.getElementById("softresDetail");
const softresRaidGrid = document.getElementById("softresRaidGrid");
const softresRaidBadge = document.getElementById("softresRaidBadge");
const softresLockControls = document.getElementById("softresLockControls");
const softresLockStatus = document.getElementById("softresLockStatus");
const softresToggleLockBtn = document.getElementById("softresToggleLockBtn");
const softresMaxReservesInput = document.getElementById("softresMaxReservesInput");
const softresOverview = document.getElementById("softresOverview");
const softresRaidTitle = document.getElementById("softresRaidTitle");
const softresReserveCount = document.getElementById("softresReserveCount");
const softresRows = document.getElementById("softresRows");
const softresMessage = document.getElementById("softresMessage");
const softresItemDroppedFilter = document.getElementById("softresItemDroppedFilter");
const softresAdminAdd = document.getElementById("softresAdminAdd");
const softresCharacterSelect = document.getElementById("softresCharacterSelect");
const softresCharReserves = document.getElementById("softresCharReserves");
const softresLootBrowser = document.getElementById("softresLootBrowser");
const lootBossFilter = document.getElementById("lootBossFilter");
const lootTypeFilter = document.getElementById("lootTypeFilter");
const lootSlotFilter = document.getElementById("lootSlotFilter");
const lootSearchFilter = document.getElementById("lootSearchFilter");
const lootTableRows = document.getElementById("lootTableRows");

// ── State ───────────────────────────────────────────────────────────────────
let db = null;
let authUid = null;
let isAdmin = false;
let isOwner = false;
let isApprovedUser = false;
let currentRaids = [];
let currentCharacters = [];
let currentReserves = [];
let lootData = null;        // full loot JSON
let selectedRaidLoot = null; // loot entry for the selected raid's raidName
let selectedRaidId = null;

let unsubscribeRaids = null;
let unsubscribeCharacters = null;
let unsubscribeReserves = null;

// ── Constants ───────────────────────────────────────────────────────────────
const WOW_CLASS_COLORS = {
  Druid: "#FF7D0A", Hunter: "#ABD473", Mage: "#69CCF0", Paladin: "#F58CBA",
  Priest: "#FFFFFF", Rogue: "#FFF569", Shaman: "#0070DE", Warlock: "#9482C9",
  Warrior: "#C79C6E"
};
const QUALITY_COLORS = {
  Legendary: "#ff8000", Epic: "#a335ee", Rare: "#0070dd", Uncommon: "#1eff00"
};
const TOOLTIP_FORMAT_COLORS = {
  Legendary: "#ff8000", Epic: "#a335ee", Rare: "#0070dd", Uncommon: "#1eff00",
  Common: "#fff", Poor: "#9d9d9d", Misc: "#ffd100", indent: "#9d9d9d"
};

// ── Class-based item filtering ──────────────────────────────────────────────
const GENERIC_SLOTS = new Set(["Back", "Finger", "Neck", "Trinket", "Held In Off-hand"]);

const CLASS_ARMOR = {
  Warrior: ["Plate", "Mail", "Leather", "Cloth"],
  Paladin: ["Plate", "Mail", "Leather", "Cloth"],
  Hunter: ["Mail", "Leather", "Cloth"],
  Shaman: ["Mail", "Leather", "Cloth"],
  Druid: ["Leather", "Cloth"],
  Rogue: ["Leather", "Cloth"],
  Priest: ["Cloth"],
  Mage: ["Cloth"],
  Warlock: ["Cloth"]
};

const CLASS_WEAPONS = {
  Warrior: ["Axe", "Sword", "Mace", "Dagger", "Fist Weapon", "Polearm", "Staff", "Bow", "Gun", "Crossbow", "Thrown"],
  Paladin: ["Axe", "Sword", "Mace", "Polearm"],
  Hunter: ["Axe", "Sword", "Dagger", "Fist Weapon", "Polearm", "Staff", "Bow", "Gun", "Crossbow"],
  Shaman: ["Axe", "Mace", "Dagger", "Fist Weapon", "Staff"],
  Druid: ["Mace", "Dagger", "Fist Weapon", "Polearm", "Staff"],
  Rogue: ["Axe", "Sword", "Mace", "Dagger", "Fist Weapon", "Bow", "Gun", "Crossbow", "Thrown"],
  Priest: ["Mace", "Dagger", "Staff", "Wand"],
  Mage: ["Sword", "Dagger", "Staff", "Wand"],
  Warlock: ["Sword", "Dagger", "Staff", "Wand"]
};

const SHIELD_CLASSES = new Set(["Warrior", "Paladin", "Shaman"]);
const RELIC_CLASS = { Idol: "Druid", Libram: "Paladin", Totem: "Shaman" };

function canClassUseItem(wowClass, item) {
  if (!wowClass) return true;
  if (GENERIC_SLOTS.has(item.slot)) return true;
  if (item.class === "Armor") {
    if (item.subclass === "Shield") return SHIELD_CLASSES.has(wowClass);
    if (RELIC_CLASS[item.subclass]) return RELIC_CLASS[item.subclass] === wowClass;
    return (CLASS_ARMOR[wowClass] || []).includes(item.subclass);
  }
  if (item.class === "Weapon") {
    return (CLASS_WEAPONS[wowClass] || []).includes(item.subclass);
  }
  return true;
}

// Derive a user-friendly type label from item class/subclass
function getItemType(item) {
  if (item.class === "Weapon") return item.subclass || "Weapon";
  if (item.class === "Armor") {
    if (item.subclass === "Miscellaneous") return "Misc";
    return item.subclass || "Armor";
  }
  return item.class || "—";
}

// ── Tooltip system ──────────────────────────────────────────────────────────
let itemTooltipMap = new Map(); // itemId -> tooltip array + meta
let tooltipEl = null;

function buildTooltipMap() {
  itemTooltipMap.clear();
  if (!lootData?.raids) return;
  for (const raid of lootData.raids) {
    for (const boss of raid.bosses) {
      for (const item of boss.items) {
        if (!itemTooltipMap.has(item.itemId)) {
          itemTooltipMap.set(item.itemId, item);
        }
      }
    }
  }
}

function ensureTooltipEl() {
  if (tooltipEl) return tooltipEl;
  tooltipEl = document.createElement('div');
  tooltipEl.className = 'wow-tooltip';
  tooltipEl.hidden = true;
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}

function renderTooltipHtml(item) {
  if (!item?.tooltip?.length) return '';
  let lines = '';
  let prevAlignRight = false;
  for (const entry of item.tooltip) {
    const label = (entry.label || '').replace(/^\n+|\n+$/g, '');
    if (!label) continue;
    const fmt = entry.format || '';
    const color = TOOLTIP_FORMAT_COLORS[fmt] || '#e8dcc3';
    if (fmt === 'alignRight') {
      // Append to previous line as right-aligned span
      if (lines.endsWith('</div>')) {
        lines = lines.slice(0, -6) +
          `<span class="wow-tt-right" style="color:${color}">${escapeHtml(label)}</span></div>`;
      }
      prevAlignRight = true;
      continue;
    }
    const indent = fmt === 'indent' ? ' wow-tt-indent' : '';
    lines += `<div class="wow-tt-line${indent}" style="color:${color}">${escapeHtml(label)}</div>`;
    prevAlignRight = false;
  }
  return lines;
}

function showTooltip(itemId, x, y) {
  const item = itemTooltipMap.get(Number(itemId));
  if (!item) return;
  const el = ensureTooltipEl();
  el.innerHTML = renderTooltipHtml(item);
  el.hidden = false;
  positionTooltip(x, y);
}

function positionTooltip(x, y) {
  const el = ensureTooltipEl();
  const pad = 16;
  const rect = el.getBoundingClientRect();
  let left = x + pad;
  let top = y + pad;
  // Keep within viewport
  if (left + rect.width > window.innerWidth - pad) left = x - rect.width - pad;
  if (top + rect.height > window.innerHeight - pad) top = y - rect.height - pad;
  if (left < pad) left = pad;
  if (top < pad) top = pad;
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}

function hideTooltip() {
  if (tooltipEl) tooltipEl.hidden = true;
}

// Delegated mouse events for anything with data-item-id
document.addEventListener('mouseover', (e) => {
  const trigger = e.target.closest('[data-item-id]');
  if (trigger) showTooltip(trigger.dataset.itemId, e.clientX, e.clientY);
});
document.addEventListener('mousemove', (e) => {
  if (tooltipEl && !tooltipEl.hidden) positionTooltip(e.clientX, e.clientY);
});
document.addEventListener('mouseout', (e) => {
  const trigger = e.target.closest('[data-item-id]');
  if (trigger) hideTooltip();
});

// ── Utility ─────────────────────────────────────────────────────────────────
function escapeHtml(val) {
  return String(val).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function setMsg(text, isError = false) {
  if (!softresMessage) return;
  softresMessage.textContent = text;
  softresMessage.classList.toggle("error", isError);
}
function hourLabel(h) {
  const n = h % 24;
  const s = n >= 12 ? "PM" : "AM";
  return `${n % 12 === 0 ? 12 : n % 12}:00 ${s}`;
}
function parseDateOnly(d) {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const p = new Date(`${d}T00:00:00`);
  return Number.isNaN(p.getTime()) ? null : p;
}
function formatMonthDayYear(d) {
  const p = parseDateOnly(d);
  if (!p) return "—";
  return `${String(p.getMonth() + 1).padStart(2, "0")}-${String(p.getDate()).padStart(2, "0")}-${p.getFullYear()}`;
}
function relativeTime(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Site branding ───────────────────────────────────────────────────────────
if (siteTitleEl) siteTitleEl.textContent = appSettings.siteTitle || "Hope Raid Tracker";
if (guildDiscordLink) guildDiscordLink.href = appSettings.discordInviteUrl || "https://discord.gg/xYtxu6Yj";

// ── Config check ────────────────────────────────────────────────────────────
function hasConfigValues() {
  return firebaseConfig && firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("REPLACE_ME")
    && firebaseConfig.projectId && !firebaseConfig.projectId.includes("REPLACE_ME");
}

// ── Auth gate helpers ───────────────────────────────────────────────────────
function setAuthGateState(authenticated, msg, isError) {
  if (authenticated) {
    authGate.hidden = true;
    appShell.hidden = false;
  } else {
    authGate.hidden = false;
    appShell.hidden = true;
    if (msg && authGateMessage) {
      authGateMessage.textContent = msg;
      authGateMessage.classList.toggle("error", !!isError);
    }
  }
}
function updateAuthActionButtons(user) {
  if (signOutButton) signOutButton.hidden = !user;
}
function updateUidDisplay(uid) {
  const normalizedUid = String(uid || "").trim();
  if (currentUidEl) {
    currentUidEl.hidden = !normalizedUid || !isAdmin;
    currentUidEl.textContent = normalizedUid ? `UID: ${normalizedUid}` : "";
  }
  if (copyUidButton) copyUidButton.hidden = !normalizedUid || !isAdmin;
}

function getAuthErrorMessage(error) {
  if (!error) return "Unknown authentication error.";
  if (error.code === "auth/popup-closed-by-user") return "Sign-in popup was closed.";
  if (error.code === "auth/cancelled-popup-request") return "Duplicate sign-in popup cancelled.";
  return error.message || "Authentication error.";
}

// ── Loot data loading ───────────────────────────────────────────────────────
async function loadLootData() {
  if (lootData) return lootData;
  try {
    const resp = await fetch("data/tbc-raid-loot.json");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    lootData = await resp.json();
    return lootData;
  } catch (err) {
    console.error("Failed to load loot table:", err);
    setMsg("Failed to load loot table data.", true);
    return null;
  }
}

function findRaidLoot(raidName) {
  if (!lootData || !lootData.raids) return null;
  // Normalize: match the raid document's raidName to the loot table name
  const normalized = String(raidName || "").trim().toLowerCase();
  return lootData.raids.find(r => r.name.toLowerCase() === normalized) || null;
}

// ── Raid selector ───────────────────────────────────────────────────────────
function renderRaidOptions() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Sort raids by date ascending (nearest upcoming first), past raids after
  const sorted = [...currentRaids].sort((a, b) => {
    const da = parseDateOnly(a.raidDate)?.getTime() || 0;
    const db2 = parseDateOnly(b.raidDate)?.getTime() || 0;
    const aIsPast = da < today.getTime();
    const bIsPast = db2 < today.getTime();
    if (aIsPast !== bIsPast) return aIsPast ? 1 : -1;
    return da - db2;
  });

  softresRaidBadge.textContent = String(sorted.length);

  if (sorted.length === 0) {
    softresRaidGrid.innerHTML = '<p class="text-dim">No raids scheduled.</p>';
    return;
  }

  let html = '';
  for (const raid of sorted) {
    const rDate = parseDateOnly(raid.raidDate);
    const isPast = rDate && rDate.getTime() < today.getTime();
    const isSelected = raid.id === selectedRaidId;
    const isLocked = !!raid.softresLocked;

    // Count reserves for this raid
    const resCount = currentReserves.filter(r => r.raidId === raid.id).length;

    const dateLabel = rDate
      ? rDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      : '—';
    const start = Number.isInteger(raid.raidStart) ? hourLabel(raid.raidStart) : '';
    const end = Number.isInteger(raid.raidEnd) ? hourLabel(raid.raidEnd) : '';
    const timeStr = start ? `${start}${end ? ' – ' + end : ''} ST` : '';
    const runType = raid.runType ? ` (${escapeHtml(raid.runType)})` : '';
    const size = raid.raidSize ? `${raid.raidSize}-man` : '';
    const lockIcon = isLocked ? ' 🔒' : '';
    const resLabel = resCount > 0 ? `${resCount} reserve${resCount !== 1 ? 's' : ''}` : 'No reserves';
    const statusBadge = isPast
      ? '<span class="srt-status srt-status-past">Past</span>'
      : '<span class="srt-status srt-status-upcoming">Upcoming</span>';

    const classes = ['softres-raid-tile'];
    if (isSelected) classes.push('is-selected');
    if (isPast) classes.push('is-past');

    html += `<button type="button" class="${classes.join(' ')}" data-raid-id="${escapeHtml(raid.id)}">
      ${statusBadge}
      <span class="srt-name">${escapeHtml(raid.raidName || 'Raid')}${runType}${lockIcon}</span>
      <span class="srt-date">${escapeHtml(dateLabel)}</span>
      <span class="srt-time">${escapeHtml(timeStr)}${size ? ' · ' + escapeHtml(size) : ''}</span>
      <span class="srt-reserves">${resLabel}</span>
    </button>`;
  }
  softresRaidGrid.innerHTML = html;
}

// ── Character dropdown ──────────────────────────────────────────────────────
function renderCharacterOptions() {
  // Admins see all characters; members see only their own
  const available = isAdmin
    ? currentCharacters
    : currentCharacters.filter(c => c.ownerUid === authUid);
  const sorted = [...available].sort((a, b) =>
    (a.characterName || "").localeCompare(b.characterName || "")
  );
  let html = '<option value="">— Select character —</option>';
  for (const ch of sorted) {
    const label = `${ch.characterName || "?"} (${ch.wowClass || "?"})`;
    html += `<option value="${escapeHtml(ch.id)}">${escapeHtml(label)}</option>`;
  }
  softresCharacterSelect.innerHTML = html;
}

// ── Selected character state ────────────────────────────────────────────────
function getSelectedCharacter() {
  const charId = softresCharacterSelect.value;
  if (!charId) return null;
  return currentCharacters.find(c => c.id === charId) || null;
}

function getCharacterReserves(charId) {
  if (!charId || !selectedRaidId) return null;
  return currentReserves.find(r => r.raidId === selectedRaidId && r.characterId === charId) || null;
}

// Migrate old item1*/item2* format to items array
function getReserveItems(reserve) {
  if (!reserve) return [];
  if (Array.isArray(reserve.items) && reserve.items.length > 0) return reserve.items;
  // Legacy format: item1*/item2*
  const items = [];
  if (reserve.item1Id) {
    items.push({
      itemId: reserve.item1Id,
      name: reserve.item1Name || "",
      icon: reserve.item1Icon || "",
      quality: reserve.item1Quality || "Epic",
      slot: reserve.item1Slot || "",
      boss: reserve.item1Boss || ""
    });
  }
  if (reserve.item2Id) {
    items.push({
      itemId: reserve.item2Id,
      name: reserve.item2Name || "",
      icon: reserve.item2Icon || "",
      quality: reserve.item2Quality || "Epic",
      slot: reserve.item2Slot || "",
      boss: reserve.item2Boss || ""
    });
  }
  return items;
}

function renderCharacterReserves() {
  const ch = getSelectedCharacter();
  if (!ch) {
    softresCharReserves.innerHTML = '';
    return;
  }
  const res = getCharacterReserves(ch.id);
  const items = getReserveItems(res);

  // Can this user modify reserves for the selected character?
  const raid = currentRaids.find(r => r.id === selectedRaidId);
  const isLocked = raid?.softresLocked;
  const canModify = ch && (isAdmin || (!isLocked && ch.ownerUid === authUid));

  if (!items.length) {
    softresCharReserves.innerHTML = '<span class="text-dim">No reserves yet — click <strong>+</strong> on items below</span>';
  } else {
    let html = '<span class="softres-char-label">Reserves:</span> ';
    items.forEach((it, idx) => {
      const color = QUALITY_COLORS[it.quality] || "#ccc";
      const lootItem = itemTooltipMap.get(Number(it.itemId));
      const dropPct = lootItem?.dropChance != null ? ` <span class="softres-drop-pct">${(lootItem.dropChance * 100).toFixed(1)}%</span>` : '';
      const removeBtn = canModify
        ? ` <button class="softres-reserve-btn softres-remove-btn softres-inline-remove" data-reserve-action="remove" data-item-id="${it.itemId}" title="Remove reserve">✕</button>`
        : '';
      if (idx > 0) html += '<span class="softres-char-reserve-sep">&</span>';
      html += `<span class="softres-char-reserve-item" style="color:${color}" data-item-id="${it.itemId}">${escapeHtml(it.name)}${dropPct}${removeBtn}</span>`;
    });
    softresCharReserves.innerHTML = html;
  }
  // Re-render loot table to update +/- state
  filterLootTable();
}

// ── Class-based loot sorting ────────────────────────────────────────────────
// Returns a numeric sort score for an item based on the character's class.
// Lower score = higher relevance. Items the class can't use sort to the bottom.
function getItemSortScore(item, wowClass) {
  if (!wowClass) return 0; // no class selected — no reordering

  const canUse = canClassUseItem(wowClass, item);

  // ── Usable items ──────────────────────────────────────────────────────────
  if (canUse) {
    // Weapons the class can wield
    if (item.class === "Weapon") return 10;

    // Shields / relics — very class-specific
    if (item.class === "Armor" && item.subclass === "Shield") return 20;
    if (item.class === "Armor" && RELIC_CLASS[item.subclass]) return 20;

    // Armor — order by the class's preference list (plate → mail → leather → cloth)
    if (item.class === "Armor") {
      const armorOrder = CLASS_ARMOR[wowClass] || [];
      const idx = armorOrder.indexOf(item.subclass);
      if (idx >= 0) return 30 + idx; // e.g. Warrior: Plate=30, Mail=31, Leather=32, Cloth=33
      return 39; // other usable armor
    }

    // Generic slots — trinkets, rings, necklaces, cloaks, off-hands
    if (GENERIC_SLOTS.has(item.slot)) return 25;

    return 50; // any other usable item
  }

  // ── Unusable items (shown at the bottom, dimmed) ──────────────────────────
  if (item.class === "Weapon") return 110;
  if (item.class === "Armor" && item.subclass === "Shield") return 120;
  if (item.class === "Armor" && RELIC_CLASS[item.subclass]) return 120;
  if (item.class === "Armor") {
    // Keep the same armor-type ordering even for unusable tiers
    const allArmor = ["Plate", "Mail", "Leather", "Cloth"];
    const idx = allArmor.indexOf(item.subclass);
    return 130 + (idx >= 0 ? idx : 4);
  }
  return 150;
}

// ── Loot browser ────────────────────────────────────────────────────────────
function renderLootBrowser() {
  if (!selectedRaidLoot) {
    lootTableRows.innerHTML = '<tr><td colspan="8" class="text-dim">Select a raid to browse loot.</td></tr>';
    return;
  }

  // Populate boss filter
  let bossHtml = '<option value="">All Bosses</option>';
  const slots = new Set();
  const types = new Set();
  for (const boss of selectedRaidLoot.bosses) {
    bossHtml += `<option value="${escapeHtml(boss.name)}">${escapeHtml(boss.name)}</option>`;
    for (const item of boss.items) {
      slots.add(item.slot);
      types.add(getItemType(item));
    }
  }
  lootBossFilter.innerHTML = bossHtml;

  let typeHtml = '<option value="">All Types</option>';
  for (const t of [...types].sort()) {
    typeHtml += `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`;
  }
  lootTypeFilter.innerHTML = typeHtml;

  let slotHtml = '<option value="">All Slots</option>';
  for (const slot of [...slots].sort()) {
    slotHtml += `<option value="${escapeHtml(slot)}">${escapeHtml(slot)}</option>`;
  }
  lootSlotFilter.innerHTML = slotHtml;

  filterLootTable();
}

function filterLootTable() {
  if (!selectedRaidLoot) return;
  const bossFilter = lootBossFilter.value;
  const typeFilter = lootTypeFilter.value;
  const slotFilter = lootSlotFilter.value;
  const searchFilter = (lootSearchFilter.value || "").trim().toLowerCase();

  // Class filter from selected character
  const ch = getSelectedCharacter();
  const wowClass = ch?.wowClass || null;

  // Current character reserves for +/- state
  const charReserves = ch ? getCharacterReserves(ch.id) : null;
  const reservedItems = getReserveItems(charReserves);
  const reservedItemIds = new Set(reservedItems.map(i => Number(i.itemId)));
  const reserveCount = reservedItemIds.size;
  const maxReserves = getMaxReserves();

  // Is locked?
  const raid = currentRaids.find(r => r.id === selectedRaidId);
  const isLocked = raid?.softresLocked;

  // Collect all matching items into an array so we can sort by class relevance
  const itemList = [];
  for (const boss of selectedRaidLoot.bosses) {
    if (bossFilter && boss.name !== bossFilter) continue;
    for (const item of boss.items) {
      if (typeFilter && getItemType(item) !== typeFilter) continue;
      if (slotFilter && item.slot !== slotFilter) continue;
      if (searchFilter && !item.name.toLowerCase().includes(searchFilter)) continue;
      itemList.push({ item, bossName: boss.name });
    }
  }

  // Sort by class relevance (lower score = higher priority), then by item name
  if (wowClass) {
    itemList.sort((a, b) => {
      const sa = getItemSortScore(a.item, wowClass);
      const sb = getItemSortScore(b.item, wowClass);
      if (sa !== sb) return sa - sb;
      return (a.item.name || "").localeCompare(b.item.name || "");
    });
  }

  let rows = '';
  for (const { item, bossName } of itemList) {
    const canUse = !wowClass || canClassUseItem(wowClass, item);
    const qualityColor = QUALITY_COLORS[item.quality] || "#ccc";
    const dropPct = item.dropChance != null ? `${(item.dropChance * 100).toFixed(1)}%` : "—";
    const isReserved = reservedItemIds.has(item.itemId);
    let rowClass = isReserved ? "softres-loot-row softres-loot-reserved" : "softres-loot-row";
    if (!canUse) rowClass += " softres-loot-unusable";

    // +/- button: admins can always act; members only when unlocked and own character
    let actionHtml = '';
    const canModify = ch && (isAdmin || (!isLocked && ch.ownerUid === authUid));
    if (canModify && canUse) {
      if (isReserved) {
        actionHtml = `<button class="softres-reserve-btn softres-remove-btn" data-reserve-action="remove" data-item-id="${item.itemId}" title="Remove reserve">−</button>`;
      } else if (reserveCount < maxReserves) {
        actionHtml = `<button class="softres-reserve-btn softres-add-btn" data-reserve-action="add" data-item-id="${item.itemId}" title="Reserve this item">+</button>`;
      }
    }

    rows += `<tr data-item-id="${item.itemId}" class="${rowClass}">
      <td><img class="softres-item-icon" src="${escapeHtml(item.icon)}" alt="" loading="lazy" /></td>
      <td style="color:${canUse ? qualityColor : '#666'};font-weight:600">${escapeHtml(item.name)}</td>
      <td>${escapeHtml(getItemType(item))}</td>
      <td>${escapeHtml(item.slot)}</td>
      <td>${item.itemLevel}</td>
      <td>${escapeHtml(bossName)}</td>
      <td>${dropPct}</td>
      <td>${actionHtml}</td>
    </tr>`;
  }
  if (!rows) rows = '<tr><td colspan="8" class="text-dim">No items match filters.</td></tr>';
  lootTableRows.innerHTML = rows;
}

// ── Reserve overview table ──────────────────────────────────────────────────
function renderReserves() {
  if (!selectedRaidId) {
    softresOverview.hidden = true;
    return;
  }
  softresOverview.hidden = false;

  const raidReserves = currentReserves.filter(r => r.raidId === selectedRaidId);
  softresReserveCount.textContent = String(raidReserves.length);

  // Get item-dropped filter text
  const itemDroppedFilter = (softresItemDroppedFilter?.value || "").trim().toLowerCase();

  if (raidReserves.length === 0) {
    softresRows.innerHTML = '<tr><td colspan="5" class="text-dim">No reserves yet for this raid.</td></tr>';
    return;
  }

  // Build character lookup
  const charMap = new Map(currentCharacters.map(c => [c.id, c]));

  // Sort by character name
  raidReserves.sort((a, b) => {
    const na = (a.characterName || "").toLowerCase();
    const nb = (b.characterName || "").toLowerCase();
    return na.localeCompare(nb);
  });

  // Build item reservation counts across all characters for this raid
  const itemReserveCount = new Map();
  for (const res of raidReserves) {
    const items = Array.isArray(res.items) ? res.items : getReserveItems(res);
    for (const it of items) {
      const id = Number(it.itemId);
      itemReserveCount.set(id, (itemReserveCount.get(id) || 0) + 1);
    }
  }

  let html = '';
  let visibleCount = 0;
  const maxRes = getMaxReserves();
  for (const res of raidReserves) {
    const ch = charMap.get(res.characterId);
    const charName = res.characterName || ch?.characterName || "—";
    const wowClass = res.wowClass || ch?.wowClass || "—";
    const classColor = WOW_CLASS_COLORS[wowClass] || "#ccc";
    const items = Array.isArray(res.items) ? res.items : getReserveItems(res);

    // If item-dropped filter is active, only show characters who reserved a matching item
    if (itemDroppedFilter) {
      const hasMatch = items.some(it => (it.name || "").toLowerCase().includes(itemDroppedFilter));
      if (!hasMatch) continue;
    }
    const isOverOrUnder = items.length !== maxRes;
    // Only highlight over/under limit for admins or the character's own owner
    const showLimitWarning = isOverOrUnder && (isAdmin || res.ownerUid === authUid);
    const rowClass = showLimitWarning ? 'softres-row-overlimit' : '';
    let limitMsg = '';
    if (showLimitWarning) {
      const diff = items.length - maxRes;
      if (diff > 0) {
        limitMsg = `<span class="softres-limit-msg">Remove ${diff} reserve${diff > 1 ? 's' : ''}</span>`;
      } else {
        const need = -diff;
        limitMsg = `<span class="softres-limit-msg">Add ${need} reserve${need > 1 ? 's' : ''}</span>`;
      }
    }
    const itemsHtml = (items.length > 0
      ? items.map(it => {
          const c = QUALITY_COLORS[it.quality] || "#ccc";
          const lootItem = itemTooltipMap.get(Number(it.itemId));
          const dropPct = lootItem?.dropChance != null ? ` <span class="softres-drop-pct">${(lootItem.dropChance * 100).toFixed(1)}%</span>` : '';
          const count = itemReserveCount.get(Number(it.itemId)) || 0;
          const countBadge = count > 1 ? ` <span class="softres-contention-badge" title="${count} characters reserved this item">${count}</span>` : '';
          // Highlight matching portion of item name when filtering
          const rawName = it.name || '—';
          let nameHtml;
          if (itemDroppedFilter && rawName.toLowerCase().includes(itemDroppedFilter)) {
            const idx = rawName.toLowerCase().indexOf(itemDroppedFilter);
            const before = rawName.slice(0, idx);
            const match = rawName.slice(idx, idx + itemDroppedFilter.length);
            const after = rawName.slice(idx + itemDroppedFilter.length);
            nameHtml = `${escapeHtml(before)}<mark class="softres-highlight">${escapeHtml(match)}</mark>${escapeHtml(after)}`;
          } else {
            nameHtml = escapeHtml(rawName);
          }
          return `<span data-item-id="${it.itemId}" class="softres-item-hover" style="color:${c};font-weight:600">${nameHtml}${dropPct}${countBadge}</span>`;
        }).join('<span class="softres-reserve-sep-table"> · </span>')
      : '—') + limitMsg;

    // Show action buttons based on role:
    // - Admins: Select + Delete for all rows
    // - Members: Select only for their own rows, no Delete
    const isOwnReserve = res.ownerUid === authUid;
    let actionsHtml = '';
    if (isAdmin) {
      actionsHtml = `
        <button class="secondary softres-action-btn" data-action="select" data-id="${escapeHtml(res.id)}">Select</button>
        <button class="secondary softres-action-btn softres-delete-btn" data-action="delete" data-id="${escapeHtml(res.id)}">✕</button>`;
    } else if (isOwnReserve) {
      actionsHtml = `<button class="secondary softres-action-btn" data-action="select" data-id="${escapeHtml(res.id)}">Select</button>`;
    }

    visibleCount++;
    html += `<tr class="${rowClass}">
      <td style="color:${classColor};font-weight:600">${escapeHtml(charName)}</td>
      <td style="color:${classColor}">${escapeHtml(wowClass)}</td>
      <td>${itemsHtml}</td>
      <td class="text-dim">${relativeTime(res.updatedAt)}</td>
      <td>${actionsHtml}</td>
    </tr>`;
  }
  if (!html) {
    html = '<tr><td colspan="5" class="text-dim">No characters reserved a matching item.</td></tr>';
  }
  // Update badge to reflect visible count when filtering
  softresReserveCount.textContent = itemDroppedFilter ? String(visibleCount) : String(raidReserves.length);
  softresRows.innerHTML = html;
}

// ── Lock state ──────────────────────────────────────────────────────────────
function getMaxReserves() {
  if (!selectedRaidId) return 2;
  const raid = currentRaids.find(r => r.id === selectedRaidId);
  return raid?.softresMaxReserves ?? 2;
}

function renderLockState() {
  if (!selectedRaidId) {
    softresLockControls.hidden = true;
    return;
  }
  const raid = currentRaids.find(r => r.id === selectedRaidId);
  if (!raid) return;

  // Non-admins: show read-only lock status (no controls)
  if (!isAdmin) {
    softresLockControls.hidden = false;
    const isLocked = !!raid.softresLocked;
    const maxRes = raid.softresMaxReserves ?? 2;
    softresLockStatus.textContent = isLocked ? "🔒 Reserves Locked" : `🔓 Open — ${maxRes} reserve${maxRes !== 1 ? 's' : ''} per character`;
    softresLockStatus.classList.toggle("softres-locked", isLocked);
    softresLockStatus.classList.toggle("softres-open", !isLocked);
    softresToggleLockBtn.hidden = true;
    softresMaxReservesInput.parentElement.hidden = true;
    return;
  }

  // Admin: full lock controls
  softresToggleLockBtn.hidden = false;
  softresMaxReservesInput.parentElement.hidden = false;

  softresLockControls.hidden = false;
  const isLocked = !!raid.softresLocked;
  softresLockStatus.textContent = isLocked ? "🔒 Locked" : "🔓 Open";
  softresLockStatus.classList.toggle("softres-locked", isLocked);
  softresLockStatus.classList.toggle("softres-open", !isLocked);
  softresToggleLockBtn.textContent = isLocked ? "Unlock Reserves" : "Lock Reserves";

  // Max reserves
  softresMaxReservesInput.value = raid.softresMaxReserves ?? 2;

  softresToggleLockBtn.disabled = false;
  softresToggleLockBtn.title = "";
}

// ── Raid selection handler ──────────────────────────────────────────────────
async function onRaidSelected(raidId) {
  // Toggle: clicking the already-selected tile deselects it
  if (raidId && raidId === selectedRaidId) {
    selectedRaidId = null;
  } else {
    selectedRaidId = raidId || null;
  }
  // Update tile selection visual
  renderRaidOptions();

  if (!selectedRaidId) {
    softresDetail.hidden = true;
    softresOverview.hidden = true;
    softresAdminAdd.hidden = true;
    softresLootBrowser.hidden = true;
    softresLockControls.hidden = true;
    selectedRaidLoot = null;
    return;
  }

  const raid = currentRaids.find(r => r.id === selectedRaidId);
  if (!raid) return;

  softresDetail.hidden = false;

  softresRaidTitle.textContent = `${raid.raidName || "Raid"} — ${formatMonthDayYear(raid.raidDate || "")}`;
  softresAdminAdd.hidden = false;
  softresLootBrowser.hidden = false;

  // Load loot data and find matching raid
  await loadLootData();
  buildTooltipMap();
  selectedRaidLoot = findRaidLoot(raid.raidName);

  // Handle compound raids (e.g., "Gruul's + Mag's")
  if (!selectedRaidLoot && raid.raidName) {
    // Try to match partial names for compound raids
    const parts = raid.raidName.split(/[+&,]/);
    if (parts.length > 1 && lootData?.raids) {
      // Build a merged loot entry
      const mergedBosses = [];
      for (const part of parts) {
        const trimmed = part.trim().toLowerCase();
        const match = lootData.raids.find(r =>
          r.name.toLowerCase().includes(trimmed) || trimmed.includes(r.name.toLowerCase().split("'")[0])
        );
        if (match) {
          mergedBosses.push(...match.bosses);
        }
      }
      if (mergedBosses.length > 0) {
        selectedRaidLoot = {
          name: raid.raidName,
          phase: raid.phase,
          bosses: mergedBosses
        };
      }
    }
  }

  renderCharacterReserves();
  renderLootBrowser();
  renderReserves();
  renderLockState();

  // Subscribe to reserves for this raid
  subscribeToReserves();
}

// ── Firestore subscriptions ─────────────────────────────────────────────────
function subscribeToReserves() {
  if (unsubscribeReserves) {
    unsubscribeReserves();
    unsubscribeReserves = null;
  }
  if (!db || !selectedRaidId) return;

  const reservesRef = collection(db, "softreserves");
  const q = query(reservesRef, where("raidId", "==", selectedRaidId));
  unsubscribeReserves = onSnapshot(q, (snapshot) => {
    currentReserves = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderReserves();
    renderCharacterReserves();
  }, (err) => {
    setMsg("Error loading reserves: " + err.message, true);
  });
}

// ── Reserve via +/- buttons ─────────────────────────────────────────────────
async function handleReserveButton(e) {
  const btn = e.target.closest("[data-reserve-action]");
  if (!btn) return;
  if (!db || !isApprovedUser || !selectedRaidId) return;

  const raid = currentRaids.find(r => r.id === selectedRaidId);
  // Non-admins cannot modify when locked; admins can always modify
  if (!raid || (!isAdmin && raid.softresLocked)) {
    setMsg("Reserves are locked for this raid.", true);
    return;
  }

  const ch = getSelectedCharacter();
  if (!ch) {
    setMsg("Please select a character first.", true);
    return;
  }

  // Non-admins can only modify reserves for their own characters
  if (!isAdmin && ch.ownerUid !== authUid) {
    setMsg("You can only modify your own characters' reserves.", true);
    return;
  }

  const action = btn.dataset.reserveAction;   // "add" or "remove"
  const itemId = Number(btn.dataset.itemId);

  // Look up item from loot data
  const allItems = selectedRaidLoot ? selectedRaidLoot.bosses.flatMap(b =>
    b.items.map(i => ({ ...i, bossName: b.name }))
  ) : [];
  const item = allItems.find(i => i.itemId === itemId);
  if (!item && action === "add") {
    setMsg("Item not found in loot table.", true);
    return;
  }

  const existing = getCharacterReserves(ch.id);

  const maxRes = getMaxReserves();
  const itemEntry = item ? {
    itemId: item.itemId,
    name: item.name,
    icon: item.icon || "",
    quality: item.quality || "Epic",
    slot: item.slot || "",
    boss: item.bossName || ""
  } : null;

  btn.disabled = true;
  try {
    if (action === "add") {
      if (existing) {
        const currentItems = getReserveItems(existing);
        if (currentItems.length >= maxRes) {
          setMsg(`Already at max reserves (${maxRes}). Remove one first.`, true);
          return;
        }
        // Use setDoc to fully overwrite (removes any old item1*/item2* fields)
        await setDoc(doc(db, "softreserves", existing.id), {
          raidId: existing.raidId,
          raidName: existing.raidName || "",
          raidDate: existing.raidDate || "",
          characterId: existing.characterId,
          characterName: existing.characterName || "",
          wowClass: existing.wowClass || "",
          ownerUid: existing.ownerUid || authUid,
          items: [...currentItems, itemEntry],
          createdAt: existing.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        setMsg(`Reserved ${item.name}.`);
      } else {
        const payload = {
          raidId: selectedRaidId,
          raidName: raid.raidName || "",
          raidDate: raid.raidDate || "",
          characterId: ch.id,
          characterName: ch.characterName || "",
          wowClass: ch.wowClass || "",
          ownerUid: ch.ownerUid || authUid,
          items: [itemEntry],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        await addDoc(collection(db, "softreserves"), payload);
        setMsg(`Reserved ${item.name}.`);
      }
    } else if (action === "remove") {
      if (!existing) return;
      const currentItems = getReserveItems(existing);
      const filtered = currentItems.filter(i => Number(i.itemId) !== itemId);
      if (filtered.length === 0) {
        await deleteDoc(doc(db, "softreserves", existing.id));
        setMsg("Reserve removed.");
      } else {
        // Use setDoc to fully overwrite (removes any old item1*/item2* fields)
        await setDoc(doc(db, "softreserves", existing.id), {
          raidId: existing.raidId,
          raidName: existing.raidName || "",
          raidDate: existing.raidDate || "",
          characterId: existing.characterId,
          characterName: existing.characterName || "",
          wowClass: existing.wowClass || "",
          ownerUid: existing.ownerUid || authUid,
          items: filtered,
          createdAt: existing.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        setMsg("Reserve removed.");
      }
    }
  } catch (err) {
    setMsg("Error saving reserve: " + err.message, true);
  } finally {
    btn.disabled = false;
  }
}

// ── Reserve actions (delete from overview) ──────────────────────────────────
async function handleReserveAction(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  if (!action || !id) return;

  if (action === "delete") {
    if (!isAdmin) return; // Only admins can delete from overview
    if (!confirm("Delete this reserve?")) return;
    try {
      await deleteDoc(doc(db, "softreserves", id));
      setMsg("Reserve deleted.");
    } catch (err) {
      setMsg("Error deleting: " + err.message, true);
    }
  }

  if (action === "select") {
    // Select the character so user can manage reserves via +/- buttons
    const res = currentReserves.find(r => r.id === id);
    if (!res) return;
    // Non-admins can only select their own characters
    if (!isAdmin && res.ownerUid !== authUid) return;
    softresCharacterSelect.value = res.characterId || "";
    renderCharacterReserves();
    softresLootBrowser.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// ── Lock toggle ─────────────────────────────────────────────────────────────
function buildRaidPayload(raid, overrides = {}) {
  const payload = {
    phase: raid.phase,
    raidName: raid.raidName,
    raidDate: raid.raidDate,
    runType: raid.runType,
    raidStart: raid.raidStart,
    raidEnd: raid.raidEnd,
    raidSize: raid.raidSize,
    createdByUid: authUid,
    createdAt: raid.createdAt,
    updatedAt: serverTimestamp(),
    ...overrides
  };
  // Include optional fields only if they exist on the original
  if (raid.tankSlots != null) payload.tankSlots = raid.tankSlots;
  if (raid.healerSlots != null) payload.healerSlots = raid.healerSlots;
  if (raid.dpsSlots != null) payload.dpsSlots = raid.dpsSlots;
  if (raid.raidLeader != null) payload.raidLeader = raid.raidLeader;
  if ('softresLocked' in overrides || raid.softresLocked != null) {
    payload.softresLocked = overrides.softresLocked ?? raid.softresLocked;
  }
  if ('softresMaxReserves' in overrides || raid.softresMaxReserves != null) {
    payload.softresMaxReserves = overrides.softresMaxReserves ?? raid.softresMaxReserves;
  }
  return payload;
}

async function toggleLock() {
  if (!db || !isAdmin || !selectedRaidId) return;
  const raid = currentRaids.find(r => r.id === selectedRaidId);
  if (!raid) return;

  const newLockState = !raid.softresLocked;

  try {
    const payload = buildRaidPayload(raid, { softresLocked: newLockState });
    await updateDoc(doc(db, "raids", selectedRaidId), payload);
    setMsg(newLockState ? "Reserves locked." : "Reserves unlocked.");
  } catch (err) {
    setMsg("Error toggling lock: " + err.message, true);
  }
}

async function updateMaxReserves() {
  if (!db || !isAdmin || !selectedRaidId) return;
  const raid = currentRaids.find(r => r.id === selectedRaidId);
  if (!raid) return;

  const val = parseInt(softresMaxReservesInput.value, 10);
  if (isNaN(val) || val < 1 || val > 10) {
    softresMaxReservesInput.value = raid.softresMaxReserves ?? 2;
    setMsg("Max reserves must be between 1 and 10.", true);
    return;
  }
  if (val === (raid.softresMaxReserves ?? 2)) return; // no change

  try {
    const payload = buildRaidPayload(raid, { softresMaxReserves: val });
    await updateDoc(doc(db, "raids", selectedRaidId), payload);
    setMsg(`Max reserves set to ${val}.`);
  } catch (err) {
    setMsg("Error updating max reserves: " + err.message, true);
  }
}

// ── Page visibility ─────────────────────────────────────────────────────────
function setPageVisibility() {
  // Show to all approved users (admins + members)
  softresSection.hidden = !isApprovedUser;
  if (!isApprovedUser) softresDetail.hidden = true;
}

// ── Wire up events ──────────────────────────────────────────────────────────
softresRaidGrid.addEventListener("click", (e) => {
  const tile = e.target.closest("[data-raid-id]");
  if (!tile) return;
  onRaidSelected(tile.dataset.raidId);
});
softresCharacterSelect.addEventListener("change", renderCharacterReserves);
softresToggleLockBtn.addEventListener("click", toggleLock);
softresMaxReservesInput.addEventListener("change", updateMaxReserves);
softresRows.addEventListener("click", handleReserveAction);
lootBossFilter.addEventListener("change", filterLootTable);
lootTypeFilter.addEventListener("change", filterLootTable);
lootSlotFilter.addEventListener("change", filterLootTable);
lootSearchFilter.addEventListener("input", filterLootTable);
// Use multiple event types so mobile/predictive keyboards reliably trigger filtering
softresItemDroppedFilter.addEventListener("input", renderReserves);
softresItemDroppedFilter.addEventListener("keyup", renderReserves);
softresItemDroppedFilter.addEventListener("change", renderReserves);
softresItemDroppedFilter.addEventListener("compositionend", renderReserves);
lootTableRows.addEventListener("click", handleReserveButton);
softresCharReserves.addEventListener("click", handleReserveButton);

// ── Firebase init ───────────────────────────────────────────────────────────
if (!hasConfigValues()) {
  // Demo mode — no Firebase
  isAdmin = true;
  isApprovedUser = true;
  setAuthGateState(true);
  setPageVisibility();
  updateAuthActionButtons({ uid: "demo" });
  updateUidDisplay("demo-local");
  if (authStatus) authStatus.textContent = "Demo mode: Firebase config not set (local testing enabled).";
} else {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: "select_account" });
  const yahooProvider = new OAuthProvider("yahoo.com");
  db = getFirestore(app);

  // Auth gate pending state — hide both so neither flashes while auth resolves
  authGate.hidden = true;
  appShell.hidden = true;
  updateAuthActionButtons(null);
  updateUidDisplay("");
  if (authStatus) authStatus.textContent = "Checking sign-in status...";

  const authGateYahooButton = document.getElementById("authGateYahooButton");

  async function performSignIn(provider) {
    const buttons = [authGateSignInButton, authGateYahooButton].filter(Boolean);
    buttons.forEach(b => (b.disabled = true));
    try {
      await signInWithPopup(auth, provider);
      setAuthGateState(true);
    } catch (error) {
      const errorText = getAuthErrorMessage(error);
      if (authStatus) authStatus.textContent = errorText;
      setAuthGateState(false, errorText, true);
    } finally {
      buttons.forEach(b => (b.disabled = false));
    }
  }

  if (authGateSignInButton) authGateSignInButton.addEventListener("click", () => performSignIn(googleProvider));
  if (authGateYahooButton) authGateYahooButton.addEventListener("click", () => performSignIn(yahooProvider));

  if (signOutButton) {
    signOutButton.addEventListener("click", async () => {
      signOutButton.disabled = true;
      try { await signOut(auth); } catch (err) { setMsg(err.message, true); }
      finally { signOutButton.disabled = false; }
    });
  }

  if (copyUidButton) {
    copyUidButton.addEventListener("click", async () => {
      const uid = String(authUid || "").trim();
      if (!uid) return;
      try {
        await navigator.clipboard.writeText(uid);
        if (authStatus) authStatus.textContent = "UID copied to clipboard.";
      } catch { if (authStatus) authStatus.textContent = "Unable to copy UID automatically."; }
    });
  }

  onAuthStateChanged(auth, async (user) => {
    // Clean up previous listeners
    if (unsubscribeRaids) { unsubscribeRaids(); unsubscribeRaids = null; }
    if (unsubscribeCharacters) { unsubscribeCharacters(); unsubscribeCharacters = null; }
    if (unsubscribeReserves) { unsubscribeReserves(); unsubscribeReserves = null; }

    if (!user) {
      authUid = null;
      isAdmin = false;
      isOwner = false;
      isApprovedUser = false;
      currentRaids = [];
      currentCharacters = [];
      currentReserves = [];
      selectedRaidId = null;
      setPageVisibility();
      setAuthGateState(false, "Sign in with Google to continue.");
      updateAuthActionButtons(null);
      updateUidDisplay("");
      if (authStatus) authStatus.textContent = "Signed out. Sign in with Google to continue.";
      return;
    }

    authUid = user.uid;

    // Check admin status
    const inStaticAdminAllowlist = Array.isArray(appSettings.adminUids) && appSettings.adminUids.includes(authUid);
    let hasAdminDoc = false;
    try {
      hasAdminDoc = (await getDoc(doc(db, "admins", authUid))).exists();
    } catch { hasAdminDoc = false; }

    let hasOwnerDoc = false;
    try {
      hasOwnerDoc = (await getDoc(doc(db, "owners", authUid))).exists();
    } catch { hasOwnerDoc = false; }

    isOwner = hasOwnerDoc;
    isAdmin = inStaticAdminAllowlist || hasAdminDoc || hasOwnerDoc;

    // Check if user is an approved member (admin or has member doc)
    let hasMemberDoc = false;
    try {
      hasMemberDoc = (await getDoc(doc(db, "members", authUid))).exists();
    } catch { hasMemberDoc = false; }
    isApprovedUser = isAdmin || hasMemberDoc;

    setAuthGateState(true);
    updateAuthActionButtons(user);
    updateUidDisplay(authUid);
    setPageVisibility();

    const userLabel = user.email || `${authUid.slice(0, 8)}...`;
    if (!isApprovedUser) {
      if (authStatus) authStatus.textContent = `Signed in (${userLabel}) — Not authorized. Ask an admin for access.`;
      setMsg("Your account is not an approved member.", true);
      return;
    }

    if (isAdmin) {
      if (authStatus) authStatus.textContent = `Signed in (${userLabel}) — Admin: full soft reserve management`;
    } else {
      if (authStatus) authStatus.textContent = `Signed in (${userLabel}) — Manage your reserves`;
    }

    // Subscribe to raids
    const raidsRef = collection(db, "raids");
    const raidsQuery = query(raidsRef, orderBy("raidDate", "asc"));
    unsubscribeRaids = onSnapshot(raidsQuery, (snapshot) => {
      currentRaids = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      renderRaidOptions();
      renderLockState();
      renderReserves();
      renderCharacterReserves(); // re-render +/- buttons when max changes
    }, (err) => { setMsg("Error loading raids: " + err.message, true); });

    // Subscribe to characters
    const charsRef = collection(db, "characters");
    unsubscribeCharacters = onSnapshot(charsRef, (snapshot) => {
      currentCharacters = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      renderCharacterOptions();
      renderReserves();
    }, (err) => { console.error("Error loading characters:", err); });

    // Load loot data and build tooltip lookup
    await loadLootData();
    buildTooltipMap();
  });
}
