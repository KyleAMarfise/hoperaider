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
  Timestamp,
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
import { appSettings, firebaseConfig } from "../config/prod/firebase-config.js";

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
const softresCopyBtn = document.getElementById("softresCopyBtn");
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
const lootBossMultiSelect = document.getElementById("lootBossMultiSelect");
const lootBossToggle = document.getElementById("lootBossToggle");
const lootBossDropdown = document.getElementById("lootBossDropdown");
const lootBossOptions = document.getElementById("lootBossOptions");
const lootTypeFilter = document.getElementById("lootTypeFilter");
const lootSlotFilter = document.getElementById("lootSlotFilter");
const lootSearchFilter = document.getElementById("lootSearchFilter");
const raidModeBtn = document.getElementById("raidModeBtn");
const raidModeDialog = document.getElementById("raidModeDialog");
const raidModeTitle = document.getElementById("raidModeTitle");
const raidModeBody = document.getElementById("raidModeBody");
const raidModeBossFilter = document.getElementById("raidModeBossFilter");
const raidModeCloseBtn = document.getElementById("raidModeCloseBtn");
const lootTableRows = document.getElementById("lootTableRows");
const hardresSection = document.getElementById("hardresSection");
const hardresCount = document.getElementById("hardresCount");
const hardresAdminControls = document.getElementById("hardresAdminControls");
const hardresTableWrap = document.getElementById("hardresTableWrap");
const hardresRows = document.getElementById("hardresRows");
const hardresDialog = document.getElementById("hardresDialog");
const hardresForm = document.getElementById("hardresForm");
const hardresDialogItemName = document.getElementById("hardresDialogItemName");
const hardresCharInput = document.getElementById("hardresCharInput");
const hardresNoteInput = document.getElementById("hardresNoteInput");
const hardresCancelBtn = document.getElementById("hardresCancelBtn");
const generatePugLinkBtn = document.getElementById("generatePugLinkBtn");
const pugLinkDialog = document.getElementById("pugLinkDialog");
const pugLinkDialogRaid = document.getElementById("pugLinkDialogRaid");
const pugLinkUrlInput = document.getElementById("pugLinkUrlInput");
const pugLinkCopyBtn = document.getElementById("pugLinkCopyBtn");
const pugLinkCopyStatus = document.getElementById("pugLinkCopyStatus");
const pugLinkToken = document.getElementById("pugLinkToken");
const pugLinkCloseBtn = document.getElementById("pugLinkCloseBtn");
const softresAnnouncement = document.getElementById("softresAnnouncement");
const softresAnnouncementText = document.getElementById("softresAnnouncementText");
const softresAnnouncementAdmin = document.getElementById("softresAnnouncementAdmin");
const softresAnnouncementEditBtn = document.getElementById("softresAnnouncementEditBtn");
const softresAnnouncementClearBtn = document.getElementById("softresAnnouncementClearBtn");
const softresAnnouncementCreateBtn = document.getElementById("softresAnnouncementCreateBtn");
const announcementDialog = document.getElementById("announcementDialog");
const announcementForm = document.getElementById("announcementForm");
const announcementTextInput = document.getElementById("announcementTextInput");
const announcementCancelBtn = document.getElementById("announcementCancelBtn");
const softresAnnouncementDismissBtn = document.getElementById("softresAnnouncementDismissBtn");

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
let unsubscribeHardReserves = null;
let unsubscribeSignups = null;
let currentSignups = [];

let currentHardReserves = [];
let pendingHrItem = null; // item being hard reserved (dialog open)

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

// Canonical boss kill order for each TBC raid (common raid pathway)
const BOSS_KILL_ORDER = {
  "Karazhan": [
    "Servant Quarters",
    "Attumen the Huntsman",
    "Moroes",
    "Opera Event (The Big Bad Wolf / Julianne / The Crone)",
    "Maiden of Virtue",
    "The Curator",
    "Chess Event (Echo of Medivh)",
    "Terestian Illhoof",
    "Shade of Aran",
    "Netherspite",
    "Nightbane",
    "Prince Malchezaar"
  ],
  "Gruul's Lair": [
    "High King Maulgar", "Gruul the Dragonkiller",
    "Trash Drops"
  ],
  "Magtheridon's Lair": [
    "Magtheridon",
    "Trash Drops"
  ],
  "Serpentshrine Cavern": [
    "Hydross the Unstable", "The Lurker Below",
    "Leotheras the Blind", "Fathom-Lord Karathress",
    "Morogrim Tidewalker", "Lady Vashj",
    "Trash Drops"
  ],
  "Tempest Keep": [
    "Al'ar", "Void Reaver", "High Astromancer Solarian",
    "Cosmic Infuser", "Devastation", "Infinity Blades",
    "Netherstrand Longbow", "Phaseshift Bulwark", "Staff of Disintegration",
    "Warp Slicer", "Kael'thas Sunstrider",
    "Trash Drops"
  ],
  "Hyjal Summit": [
    "Rage Winterchill", "Anetheron", "Kaz'rogal", "Azgalor", "Archimonde",
    "Trash Drops"
  ],
  "Black Temple": [
    "High Warlord Naj'entus", "Supremus", "Shade of Akama",
    "Ashtongue Channeler",
    "Gurtogg Bloodboil",
    "Essence of Anger", "High Nethermancer Zerevor",
    "The Illidari Council",
    "Mother Shahraz", "Illidan Stormrage",
    "Trash Drops"
  ],
  "Zul'Aman": [
    "Nalorakk", "Akil'zon", "Jan'alai", "Halazzi",
    "Hex Lord Malacrass", "Zul'jin",
    "Trash Drops"
  ],
  "Sunwell Plateau": [
    "Brutallus", "Felmyst", "Kil'jaeden",
    "Trash Drops"
  ]
};

// Maps compound raid names (as stored in Firestore) to their component loot table names.
// Each component dungeon gets an equal share of the maxReserves limit (e.g. 2 reserves = 1 per dungeon).
const COMPOUND_RAID_PARTS = {
  "Gruul's + Mag's": ["Gruul's Lair", "Magtheridon's Lair"],
};

function sortBossesByKillOrder(bosses, raidName) {
  // Find the matching kill order list (fuzzy match on raid name)
  const normalized = (raidName || "").trim().toLowerCase();
  let orderList = null;
  for (const [key, list] of Object.entries(BOSS_KILL_ORDER)) {
    if (key.toLowerCase() === normalized || normalized.includes(key.toLowerCase().split("'")[0])) {
      orderList = list;
      break;
    }
  }
  if (!orderList) return bosses; // no match, keep original order

  // For compound raids, merge multiple kill orders
  if (!orderList && raidName) {
    const parts = raidName.split(/[+&,]/);
    if (parts.length > 1) {
      orderList = [];
      for (const part of parts) {
        const trimmed = part.trim().toLowerCase();
        for (const [key, list] of Object.entries(BOSS_KILL_ORDER)) {
          if (key.toLowerCase().includes(trimmed) || trimmed.includes(key.toLowerCase().split("'")[0])) {
            orderList.push(...list);
            break;
          }
        }
      }
    }
  }
  if (!orderList || !orderList.length) return bosses;

  const orderMap = new Map(orderList.map((name, idx) => [name.toLowerCase(), idx]));
  return [...bosses].sort((a, b) => {
    const ia = orderMap.get(a.name.toLowerCase()) ?? 999;
    const ib = orderMap.get(b.name.toLowerCase()) ?? 999;
    return ia - ib;
  });
}

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

// Tier token → eligible classes  (T4 Fallen, T5 Vanquished share the same grouping)
const TIER_TOKEN_CLASSES = {
  "Hero":       new Set(["Hunter", "Mage", "Warlock"]),
  "Champion":   new Set(["Paladin", "Rogue", "Shaman"]),
  "Defender":   new Set(["Warrior", "Priest", "Druid"]),
  // T6 uses different group names
  "Conqueror":  new Set(["Paladin", "Priest", "Warlock"]),
  "Protector":  new Set(["Warrior", "Hunter", "Shaman"]),
  "Vanquisher": new Set(["Rogue", "Mage", "Druid"]),
};

function getTierTokenGroup(itemName) {
  if (!itemName) return null;
  const m = itemName.match(/of the (?:Fallen|Vanquished|Forgotten) (\w+)$/);
  return m ? m[1] : null;
}

function canClassUseItem(wowClass, item) {
  if (!wowClass) return true;
  if (GENERIC_SLOTS.has(item.slot)) return true;
  // Tier tokens are class-specific
  if (item.slot === "Tier Token") {
    const group = getTierTokenGroup(item.name);
    if (group && TIER_TOKEN_CLASSES[group]) return TIER_TOKEN_CLASSES[group].has(wowClass);
    return true; // fallback if pattern doesn't match
  }
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
  if (item.slot === "Tier Token") return "Tier Token";
  if (item.slot === "Recipe") return item.subclass || "Recipe";
  if (item.slot === "Bag") return "Bag";
  if (item.subclass === "Mount") return "Mount";
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
  tooltipEl.setAttribute('popover', 'manual');
  tooltipEl.hidden = true;
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}

function wowheadUrl(itemId) {
  return `https://www.wowhead.com/tbc/item=${itemId}`;
}

function renderTooltipHtml(item) {
  let lines = '';

  // Prefer Wowhead-sourced tooltip HTML (accurate TBC Classic stats)
  if (item.wowheadTooltip) {
    lines = `<div class="wow-tt-wowhead-body">${item.wowheadTooltip}</div>`;
  } else if (item.tooltip?.length) {
    // Fallback to wow-classic-items parsed tooltip
    let prevAlignRight = false;
    for (const entry of item.tooltip) {
      const label = (entry.label || '').replace(/^\n+|\n+$/g, '');
      if (!label) continue;
      const fmt = entry.format || '';
      const color = TOOLTIP_FORMAT_COLORS[fmt] || '#e8dcc3';
      if (fmt === 'alignRight') {
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
  } else {
    return '';
  }

  // Wowhead link at the bottom of every tooltip
  if (item.itemId) {
    lines += `<div class="wow-tt-line wow-tt-wowhead"><a href="${wowheadUrl(item.itemId)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">View on Wowhead ↗</a></div>`;
  }
  return lines;
}

function showTooltip(itemId, x, y) {
  const item = itemTooltipMap.get(Number(itemId));
  if (!item) return;
  const el = ensureTooltipEl();
  el.innerHTML = renderTooltipHtml(item);
  el.hidden = false;
  try { el.showPopover(); } catch {}
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
  if (tooltipEl) {
    tooltipEl.hidden = true;
    try { tooltipEl.hidePopover(); } catch {}
  }
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
function isRaidPast(raid) {
  const rDate = parseDateOnly(raid.raidDate);
  if (!rDate) return false;
  const endHour = Number.isInteger(raid.raidEnd) ? raid.raidEnd : null;
  const startHour = Number.isInteger(raid.raidStart) ? raid.raidStart : null;
  const cutoffHour = endHour != null ? endHour : (startHour != null ? startHour : 0);
  const cutoff = new Date(rDate);
  cutoff.setHours(cutoffHour, 0, 0, 0);
  return cutoff.getTime() + 2 * 60 * 60 * 1000 < Date.now(); // +2h grace period
}

function renderRaidOptions() {
  const upcoming = [];
  const past = [];

  for (const raid of currentRaids) {
    if (isRaidPast(raid)) {
      past.push(raid);
    } else {
      upcoming.push(raid);
    }
  }

  // Upcoming: nearest first
  upcoming.sort((a, b) => {
    const da = parseDateOnly(a.raidDate)?.getTime() || 0;
    const db2 = parseDateOnly(b.raidDate)?.getTime() || 0;
    return da - db2;
  });

  // Past: most recent first
  past.sort((a, b) => {
    const da = parseDateOnly(a.raidDate)?.getTime() || 0;
    const db2 = parseDateOnly(b.raidDate)?.getTime() || 0;
    if (db2 !== da) return db2 - da;
    return (b.raidStart ?? 0) - (a.raidStart ?? 0);
  });

  softresRaidBadge.textContent = String(currentRaids.length);

  if (!upcoming.length && !past.length) {
    softresRaidGrid.innerHTML = '<p class="text-dim">No raids scheduled.</p>';
    return;
  }

  let html = '';

  // ── Upcoming / Current tiles (large) ──
  for (const raid of upcoming) {
    html += renderUpcomingTile(raid);
  }

  // ── Past divider + collapsible list ──
  if (past.length) {
    const isSelectedPast = past.some(r => r.id === selectedRaidId);
    html += `<details class="srt-past-details"${isSelectedPast ? ' open' : ''}>`;
    html += `<summary class="srt-past-summary">Completed Raids <span class="srt-past-count">(${past.length})</span></summary>`;
    html += '<div class="srt-past-list">';
    for (const raid of past) {
      html += renderPastRow(raid);
    }
    html += '</div></details>';
  }

  softresRaidGrid.innerHTML = html;
}

function renderUpcomingTile(raid) {
  const rDate = parseDateOnly(raid.raidDate);
  const isSelected = raid.id === selectedRaidId;
  const isLocked = !!raid.softresLocked;
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

  const classes = ['softres-raid-tile'];
  if (isSelected) classes.push('is-selected');

  return `<button type="button" class="${classes.join(' ')}" data-raid-id="${escapeHtml(raid.id)}">
    <span class="srt-status srt-status-upcoming">Upcoming</span>
    <span class="srt-name">${escapeHtml(raid.raidName || 'Raid')}${runType}${lockIcon}</span>
    <span class="srt-date">${escapeHtml(dateLabel)}</span>
    <span class="srt-time">${escapeHtml(timeStr)}${size ? ' · ' + escapeHtml(size) : ''}</span>
    <span class="srt-reserves">${resLabel}</span>
  </button>`;
}

function renderPastRow(raid) {
  const rDate = parseDateOnly(raid.raidDate);
  const isSelected = raid.id === selectedRaidId;
  const isLocked = !!raid.softresLocked;
  const resCount = currentReserves.filter(r => r.raidId === raid.id).length;

  const dateLabel = rDate
    ? rDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : '—';
  const start = Number.isInteger(raid.raidStart) ? hourLabel(raid.raidStart) : '';
  const end = Number.isInteger(raid.raidEnd) ? hourLabel(raid.raidEnd) : '';
  const timeStr = start ? `${start}${end ? ' – ' + end : ''} ST` : '';
  const runType = raid.runType ? ` (${escapeHtml(raid.runType)})` : '';
  const lockIcon = isLocked ? ' 🔒' : '';
  const resLabel = resCount > 0 ? `${resCount} res` : '0 res';

  const classes = ['srt-past-row'];
  if (isSelected) classes.push('is-selected');

  return `<button type="button" class="${classes.join(' ')}" data-raid-id="${escapeHtml(raid.id)}">
    <span class="srt-past-name">${escapeHtml(raid.raidName || 'Raid')}${runType}${lockIcon}</span>
    <span class="srt-past-date">${escapeHtml(dateLabel)}</span>
    <span class="srt-past-time">${escapeHtml(timeStr)}</span>
    <span class="srt-past-reserves">${resLabel}</span>
  </button>`;
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
    // Main character
    html += `<option value="${escapeHtml(ch.id)}">${escapeHtml(`${ch.characterName || "?"} (${ch.wowClass || "?"})`)}</option>`;
    // Alt characters embedded in the same profile document
    const alts = Array.isArray(ch.altCharacters) ? ch.altCharacters : [];
    alts.forEach((alt, idx) => {
      if (!alt || !alt.characterName) return;
      const altId = `${ch.id}::alt-${idx}`;
      html += `<option value="${escapeHtml(altId)}">${escapeHtml(`${alt.characterName} (${alt.wowClass || "?"}) [Alt]`)}</option>`;
    });
  }
  softresCharacterSelect.innerHTML = html;
  tryAutoSelectCharacter();
}

// Auto-select the character the current user signed up with for the selected raid.
// Skipped for admins (they need full visibility) and if a character is already chosen.
function tryAutoSelectCharacter() {
  if (!authUid || !selectedRaidId || softresCharacterSelect.value) return;
  const DECLINED = new Set(["decline", "withdrawn", "denied"]);
  const signup = currentSignups.find(s =>
    s.ownerUid === authUid && !DECLINED.has((s.status || "").toLowerCase())
  );
  if (!signup?.characterId) return;
  // Only set if that option actually exists in the dropdown
  const opt = softresCharacterSelect.querySelector(`option[value="${CSS.escape(signup.characterId)}"]`);
  if (opt) {
    softresCharacterSelect.value = signup.characterId;
    renderCharacterReserves();
  }
}

// ── Selected character state ────────────────────────────────────────────────
function getSelectedCharacter() {
  const charId = softresCharacterSelect.value;
  if (!charId) return null;
  // Handle alt characters: composite ID of "{docId}::alt-{index}"
  if (charId.includes("::alt-")) {
    const [docId, altPart] = charId.split("::");
    const idx = parseInt(altPart.replace("alt-", ""), 10);
    const parent = currentCharacters.find(c => c.id === docId);
    if (!parent) return null;
    const alts = Array.isArray(parent.altCharacters) ? parent.altCharacters : [];
    const alt = alts[idx];
    if (!alt || !alt.characterName) return null;
    return {
      id: charId,
      characterName: alt.characterName,
      wowClass: alt.wowClass || "",
      ownerUid: parent.ownerUid
    };
  }
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

    // Tier tokens are high priority when usable
    if (item.slot === "Tier Token") return 15;

    // Recipes, bags, mounts — usable but lower priority than gear
    if (item.slot === "Recipe" || item.slot === "Bag" || item.subclass === "Mount") return 60;

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
    lootTableRows.innerHTML = '<tr><td colspan="7" class="text-dim">Select a raid to browse loot.</td></tr>';
    return;
  }

  // Populate boss filter checkboxes
  const raid = currentRaids.find(r => r.id === selectedRaidId);
  const isPartial = raid?.runType === "Partial" && raid.plannedBosses?.length;
  const plannedSet = new Set((raid?.plannedBosses || []).map(b => b.toLowerCase()));

  function isBossPlanned(filterName) {
    if (!isPartial) return true;
    const lower = filterName.toLowerCase();
    for (const planned of plannedSet) {
      if (lower === planned || lower.startsWith(planned)) return true;
    }
    return false;
  }

  let bossCheckboxes = '';
  const slots = new Set();
  const types = new Set();
  // Sort bosses by new kill order and add order indicators
  let orderedBosses = sortBossesByKillOrder(selectedRaidLoot.bosses, selectedRaidLoot.name);
  let hasPartialSelection = false;
  orderedBosses.forEach((boss, idx) => {
    let displayName = boss.name;
    let filterName = boss.name;
    if (boss.name === "Echo of Medivh" || boss.name === "Chess Event" || boss.name === "Chess Event (Echo of Medivh)") {
      displayName = "Chess Event (Echo of Medivh)";
      filterName = "Chess Event (Echo of Medivh)";
    }
    if (boss.name === "Julianne" || boss.name === "Opera Event (The Big Bad Wolf / Julianne / The Crone)") {
      displayName = "Opera Event (The Big Bad Wolf / Julianne / The Crone)";
      filterName = "Opera Event (The Big Bad Wolf / Julianne / The Crone)";
    }
    // Add order indicator
    const orderLabel = ` (${idx + 1})`;
    const planned = isBossPlanned(filterName);
    const checked = isPartial && planned ? " checked" : "";
    const dimClass = isPartial && !planned ? " boss-not-planned" : "";
    if (isPartial && planned) hasPartialSelection = true;
    bossCheckboxes += `<label class="multi-select-option${dimClass}"><input type="checkbox" value="${escapeHtml(filterName)}"${checked} /> ${escapeHtml(displayName + orderLabel)}</label>`;
    for (const item of boss.items) {
      slots.add(item.slot);
      types.add(getItemType(item));
    }
  });
  lootBossOptions.innerHTML = bossCheckboxes;
  // For partial raids, uncheck "All" and show only planned bosses
  const allCheckbox = lootBossDropdown.querySelector('.multi-select-all input');
  if (isPartial && hasPartialSelection) {
    if (allCheckbox) allCheckbox.checked = false;
    updateBossToggleLabel();
  } else {
    if (allCheckbox) allCheckbox.checked = true;
    lootBossToggle.textContent = 'All Bosses';
  }

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

/**
 * Check whether an item matches a free-text search term.
 * Searches across: item name, boss name, slot, type (subclass), quality,
 * and special keywords like "tier", "token", "t4", "t5", "t6".
 */
function itemMatchesSearch(item, bossName, term) {
  const fields = [
    item.name,
    bossName,
    item.slot,
    getItemType(item),
    item.quality,
    item.subclass,
    item.class,
  ];

  // Direct match on any field
  for (const f of fields) {
    if (f && f.toLowerCase().includes(term)) return true;
  }

  // Keyword aliases — let users type intuitive terms
  const isTierToken = item.slot === "Tier Token";
  if (isTierToken) {
    // "tier", "token", "set piece" all match tier tokens
    if ("tier".includes(term) || "token".includes(term) || "set piece".includes(term)) return true;

    // "t4" / "t5" / "t6" match the corresponding tier set
    const name = (item.name || "").toLowerCase();
    if (term === "t4" && name.includes("fallen")) return true;
    if (term === "t5" && name.includes("vanquished")) return true;
    if (term === "t6" && name.includes("forgotten")) return true;
  }

  // iLvl search — e.g. "120" matches items with that item level
  if (item.itemLevel && String(item.itemLevel).includes(term)) return true;

  return false;
}

function filterLootTable() {
  if (!selectedRaidLoot) return;
  // Read selected bosses from multi-select
  const selectedBosses = getSelectedBosses();
  const typeFilter = lootTypeFilter.value;
  const slotFilter = lootSlotFilter.value;
  const searchFilter = (lootSearchFilter.value || "").trim().toLowerCase();

  // Class filter from selected character
  const ch = getSelectedCharacter();
  const wowClass = ch?.wowClass || null;

  // Current character reserves for +/- state
  const charReserves = ch ? getCharacterReserves(ch.id) : null;
  const reservedItems = getReserveItems(charReserves);
  // Use a count map so double-rolls (same item reserved twice) are tracked
  const reservedItemIds = new Map();
  for (const i of reservedItems) {
    const id = Number(i.itemId);
    reservedItemIds.set(id, (reservedItemIds.get(id) || 0) + 1);
  }
  const reserveCount = reservedItems.length;
  const maxReserves = getMaxReserves();

  // Per-dungeon limit for compound raids (e.g. "Gruul's + Mag's" → 1 per dungeon)
  const itemSourceMap = new Map();
  const reservedPerSource = {};
  let perDungeonLimit = null;
  if (selectedRaidLoot.sources?.length > 1) {
    perDungeonLimit = Math.floor(maxReserves / selectedRaidLoot.sources.length);
    for (const src of selectedRaidLoot.sources) reservedPerSource[src] = 0;
    for (const boss of selectedRaidLoot.bosses) {
      if (boss.sourceLoot) {
        for (const item of boss.items) itemSourceMap.set(item.itemId, boss.sourceLoot);
      }
    }
    for (const ri of reservedItems) {
      const src = itemSourceMap.get(Number(ri.itemId));
      if (src) reservedPerSource[src] = (reservedPerSource[src] || 0) + 1;
    }
  }

  // Is locked?
  const raid = currentRaids.find(r => r.id === selectedRaidId);
  const isLocked = raid?.softresLocked;

  // Collect all matching items into an array so we can sort by class relevance
  const itemList = [];
  for (const boss of selectedRaidLoot.bosses) {
    let filterName = boss.name;
    if (boss.name === "Echo of Medivh" || boss.name === "Chess Event") {
      filterName = "Chess Event (Echo of Medivh)";
    }
    if (boss.name === "Julianne" || boss.name === "Opera Event (The Big Bad Wolf / Julianne / The Crone)") {
      filterName = "Opera Event (The Big Bad Wolf / Julianne / The Crone)";
    }
    if (selectedBosses.size && !selectedBosses.has(filterName)) continue;
    for (const item of boss.items) {
      if (typeFilter && getItemType(item) !== typeFilter) continue;
      if (slotFilter && item.slot !== slotFilter) continue;
      if (searchFilter && !itemMatchesSearch(item, filterName, searchFilter)) continue;
      itemList.push({ item, bossName: filterName });
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
    const itemReserveCount = reservedItemIds.get(item.itemId) || 0;
    const isReserved = itemReserveCount > 0;
    let rowClass = isReserved ? "softres-loot-row softres-loot-reserved" : "softres-loot-row";
    if (!canUse) rowClass += " softres-loot-unusable";

    // +/- button: admins can always act; members only when unlocked and own character
    let actionHtml = '';
    const canModify = ch && (isAdmin || (!isLocked && ch.ownerUid === authUid));
    if (canModify && canUse) {
      const itemSrc = itemSourceMap.get(item.itemId);
      const dungeonFull = perDungeonLimit !== null && itemSrc != null && (reservedPerSource[itemSrc] || 0) >= perDungeonLimit;
      if (isReserved) {
        actionHtml = `<button class="softres-reserve-btn softres-remove-btn" data-reserve-action="remove" data-item-id="${item.itemId}" title="Remove one reserve">−</button>`;
      }
      if (reserveCount < maxReserves && !dungeonFull) {
        const countBadge = itemReserveCount > 0 ? `<span class="softres-item-roll-count" title="Reserved ${itemReserveCount}x">×${itemReserveCount}</span>` : '';
        actionHtml += `${countBadge}<button class="softres-reserve-btn softres-add-btn" data-reserve-action="add" data-item-id="${item.itemId}" title="Reserve this item${itemReserveCount > 0 ? ' again (double roll)' : ''}">+</button>`;
      }
    }

    // HR badge/button — visible to all; add button is admin-only
    const existingHR = currentHardReserves.find(hr => hr.raidId === selectedRaidId && Number(hr.itemId) === item.itemId);
    let hrHtml = '';
    if (existingHR) {
      const hrLabel = existingHR.characterName || (existingHR.note ? `Note: ${existingHR.note}` : 'Hard Reserved');
      hrHtml = `<span class="hardres-badge" title="Hard Reserved${existingHR.characterName ? ' for ' + existingHR.characterName : ''}${existingHR.note ? ' — ' + existingHR.note : ''}">HR${existingHR.characterName ? ': ' + escapeHtml(existingHR.characterName) : ''}</span>`;
    } else if (isAdmin) {
      hrHtml = `<button class="softres-reserve-btn hardres-btn" data-hr-open="${item.itemId}" data-hr-boss="${escapeHtml(bossName)}" title="Hard reserve this item">HR</button>`;
    }

    rows += `<tr data-item-id="${item.itemId}" class="${rowClass}">
      <td><img class="softres-item-icon" src="${escapeHtml(item.icon)}" alt="" loading="lazy" /></td>
      <td style="color:${canUse ? qualityColor : '#666'};font-weight:600">${escapeHtml(item.name)} <a href="${wowheadUrl(item.itemId)}" class="wowhead-link" target="_blank" rel="noopener" title="View on Wowhead" onclick="event.stopPropagation()">↗</a></td>
      <td>${escapeHtml(getItemType(item))}</td>
      <td>${escapeHtml(item.slot)}</td>
      <td>${escapeHtml(bossName)}</td>
      <td>${dropPct}</td>
      <td class="softres-loot-actions">${actionHtml}${hrHtml}</td>
    </tr>`;
  }
  if (!rows) rows = '<tr><td colspan="7" class="text-dim">No items match filters.</td></tr>';
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
          const removeBtn = isAdmin ? ` <button class="softres-item-remove-btn" data-action="remove-item" data-id="${escapeHtml(res.id)}" data-item-id="${it.itemId}" title="Remove this item">✕</button>` : '';
          return `<span data-item-id="${it.itemId}" class="softres-item-hover" style="color:${c};font-weight:600">${nameHtml}${dropPct}${countBadge}${removeBtn}</span>`;
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

  // Show accepted signups who haven't SR'd yet (only when not filtering by item)
  if (!itemDroppedFilter) {
    const reservedCharIds = new Set(raidReserves.map(r => r.characterId));
    const noSrSignups = currentSignups.filter(s => {
      const status = (s.status || "").toLowerCase();
      return (status === "accept" || status === "accepted") && !reservedCharIds.has(s.characterId);
    });
    if (noSrSignups.length) {
      noSrSignups.sort((a, b) => (a.characterName || "").localeCompare(b.characterName || ""));
      html += `<tr><td colspan="5" class="softres-nosr-header text-dim">No SR yet (${noSrSignups.length})</td></tr>`;
      for (const s of noSrSignups) {
        const wowClass = s.wowClass || "—";
        const classColor = WOW_CLASS_COLORS[wowClass] || "#ccc";
        html += `<tr class="softres-nosr-row">
          <td style="color:${classColor};font-weight:600;opacity:0.6">${escapeHtml(s.characterName || "—")}</td>
          <td style="color:${classColor};opacity:0.6">${escapeHtml(wowClass)}</td>
          <td colspan="3" class="text-dim">—</td>
        </tr>`;
      }
    }
  }

  // Update badge to reflect visible count when filtering
  softresReserveCount.textContent = itemDroppedFilter ? String(visibleCount) : String(raidReserves.length);
  softresRows.innerHTML = html;
}

// ── Raid Mode Modal ─────────────────────────────────────────────────────────
function openRaidMode() {
  if (!selectedRaidId || !raidModeDialog) return;

  const raid = currentRaids.find(r => r.id === selectedRaidId);
  if (!raid) return;

  raidModeTitle.textContent = `⚔️ Raid Loot Mode — ${raid.raidName || "Raid"}`;

  // Populate boss filter dropdown
  const bosses = selectedRaidLoot?.bosses || [];
  raidModeBossFilter.innerHTML = '<option value="">All Bosses</option>'
    + bosses.map(b => `<option value="${escapeHtml(b.name)}">${escapeHtml(b.name)}</option>`).join("");

  renderRaidModeBody("");
  raidModeDialog.showModal();
}

function renderRaidModeBody(bossFilter) {
  if (!raidModeBody) return;

  const raidReserves = currentReserves.filter(r => r.raidId === selectedRaidId);
  const raid = currentRaids.find(r => r.id === selectedRaidId);
  let bosses = sortBossesByKillOrder(selectedRaidLoot?.bosses || [], raid?.raidName);
  // Sort bosses by new kill order and add order indicators
  bosses = sortBossesByKillOrder(bosses, raid?.raidName).map((boss, idx) => {
    let displayName = boss.name;
    if (boss.name === "Echo of Medivh" || boss.name === "Chess Event" || boss.name === "Chess Event (Echo of Medivh)") displayName = "Chess Event (Echo of Medivh)";
    if (boss.name === "Julianne" || boss.name === "Opera Event (The Big Bad Wolf / Julianne / The Crone)") displayName = "Opera Event (The Big Bad Wolf / Julianne / The Crone)";
    // Add order indicator
    const orderLabel = ` (${idx + 1})`;
    return { ...boss, name: displayName + orderLabel };
  });

  if (!bosses.length) {
    raidModeBody.innerHTML = '<p class="text-dim">No loot table data available for this raid.</p>';
    return;
  }

  // Build a map: itemId -> [{ characterName, wowClass }]
  const itemReservers = new Map();
  for (const res of raidReserves) {
    const items = getReserveItems(res);
    for (const it of items) {
      const id = Number(it.itemId);
      if (!itemReservers.has(id)) itemReservers.set(id, []);
      itemReservers.get(id).push({
        characterName: res.characterName || "?",
        wowClass: res.wowClass || "?"
      });
    }
  }

  // Sort reservers alphabetically within each item
  for (const [, list] of itemReservers) {
    list.sort((a, b) => a.characterName.localeCompare(b.characterName));
  }

  // Build a map: itemId -> hard reserve entry for this raid
  const hardReserveMap = new Map();
  for (const hr of currentHardReserves) {
    if (hr.raidId === selectedRaidId) {
      hardReserveMap.set(Number(hr.itemId), hr);
    }
  }

  const filteredBosses = bossFilter
    ? bosses.filter(b => b.name === bossFilter)
    : bosses;

  if (!filteredBosses.length) {
    raidModeBody.innerHTML = '<p class="text-dim">No bosses match the filter.</p>';
    return;
  }

  let html = '<div class="raid-mode-bosses">';
  for (const boss of filteredBosses) {
    // Show items with at least one SR or an HR
    const reservedItems = boss.items.filter(item =>
      itemReservers.has(item.itemId) || hardReserveMap.has(item.itemId)
    );

    // Bosses with 5+ reserved items get a wider card
    const spanClass = reservedItems.length >= 5 ? " boss-span-2" : "";

    html += `<div class="raid-mode-boss-card${spanClass}">
      <div class="raid-mode-boss-header">${escapeHtml(boss.name)}</div>`;

    if (!reservedItems.length) {
      html += '<div class="raid-mode-no-reserves">No soft reserves for this boss</div>';
    } else {
      for (const item of reservedItems) {
        const color = QUALITY_COLORS[item.quality] || "#ccc";
        const reservers = itemReservers.get(item.itemId) || [];
        const hr = hardReserveMap.get(item.itemId);
        const dropPct = item.dropChance != null ? `<span class="softres-drop-pct">${(item.dropChance * 100).toFixed(1)}%</span>` : "";
        const slotLabel = item.slot || "";
        const typeName = getItemType(item);
        const iLvl = item.itemLevel ? `<span class="raid-mode-item-ilvl">iLvl ${item.itemLevel}</span>` : "";
        const iconUrl = item.icon ? `<img class="raid-mode-item-icon" src="${escapeHtml(item.icon)}" alt="" loading="lazy" />` : "";

        const charChips = reservers.map(r => {
          const classColor = WOW_CLASS_COLORS[r.wowClass] || "#ccc";
          return `<span class="raid-mode-char-chip" style="border-color:${classColor}"><span class="raid-mode-char-name" style="color:${classColor}">${escapeHtml(r.characterName)}</span><span class="raid-mode-char-class">${escapeHtml(r.wowClass)}</span></span>`;
        }).join("");

        const contestLabel = reservers.length > 1
          ? `<span class="softres-contention-badge" title="${reservers.length} characters reserved this">${reservers.length}</span>`
          : "";

        const hrBanner = hr
          ? `<div class="raid-mode-hr-banner"><span class="hardres-badge">HARD RESERVE</span><span class="raid-mode-hr-char">${escapeHtml(hr.characterName)}</span>${hr.note ? `<span class="raid-mode-hr-note text-dim">— ${escapeHtml(hr.note)}</span>` : ''}</div>`
          : "";

        html += `<div class="raid-mode-item" data-item-id="${item.itemId}">
          <div class="raid-mode-item-header">
            ${iconUrl}
            <div class="raid-mode-item-info">
              <span class="raid-mode-item-name" style="color:${color}">${escapeHtml(item.name)} <a href="${wowheadUrl(item.itemId)}" class="wowhead-link" target="_blank" rel="noopener" title="View on Wowhead" onclick="event.stopPropagation()">↗</a>${contestLabel}</span>
              <span class="raid-mode-item-meta">${escapeHtml(slotLabel)}${slotLabel && typeName ? ' · ' : ''}${escapeHtml(typeName)}${(slotLabel || typeName || iLvl) && dropPct ? ' · ' : ''}${dropPct}</span>
            </div>
          </div>
          ${hrBanner}
          <div class="raid-mode-char-list">${charChips}</div>
        </div>`;
      }
    }

    html += '</div>';
  }
  html += '</div>';

  raidModeBody.innerHTML = html;
}

// Raid Mode event listeners
if (raidModeBtn) {
  raidModeBtn.addEventListener("click", openRaidMode);
}
if (raidModeCloseBtn) {
  raidModeCloseBtn.addEventListener("click", () => {
    raidModeDialog.close();
  });
}
if (raidModeDialog) {
  // Click on backdrop (::backdrop) closes the dialog
  raidModeDialog.addEventListener("click", (e) => {
    if (e.target === raidModeDialog) {
      raidModeDialog.close();
    }
  });
  raidModeDialog.addEventListener("close", () => {
    hideTooltip();
  });
}
if (raidModeBossFilter) {
  raidModeBossFilter.addEventListener("change", () => {
    renderRaidModeBody(raidModeBossFilter.value);
  });
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
    if (generatePugLinkBtn) generatePugLinkBtn.hidden = true;
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
    if (generatePugLinkBtn) generatePugLinkBtn.hidden = true;
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

  // PUG link button — admin only, when a raid is selected
  if (generatePugLinkBtn) generatePugLinkBtn.hidden = false;
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
    if (hardresSection) hardresSection.hidden = true;
    if (softresAnnouncement) softresAnnouncement.hidden = true;
    if (softresAnnouncementCreateBtn) softresAnnouncementCreateBtn.hidden = true;
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

  // Handle compound raids (e.g., "Gruul's + Mag's") using the explicit parts map
  if (!selectedRaidLoot && raid.raidName) {
    const componentNames = COMPOUND_RAID_PARTS[raid.raidName] || [];
    if (componentNames.length > 0 && lootData?.raids) {
      const mergedBosses = [];
      const matchedSources = [];
      for (const componentName of componentNames) {
        const match = lootData.raids.find(r => r.name === componentName);
        if (match) {
          mergedBosses.push(...match.bosses.map(b => ({ ...b, sourceLoot: match.name })));
          matchedSources.push(match.name);
        }
      }
      if (mergedBosses.length > 0) {
        selectedRaidLoot = {
          name: raid.raidName,
          phase: raid.phase,
          bosses: mergedBosses,
          sources: matchedSources,
        };
      }
    }
  }

  renderCharacterReserves();
  renderLootBrowser();
  renderReserves();
  renderLockState();
  renderHardReserves();
  renderAnnouncement();

  // Subscribe to reserves and hard reserves for this raid
  subscribeToReserves();
  subscribeToHardReserves();
  subscribeToSignups();
}

// ── Announcement banner ─────────────────────────────────────────────────────
function renderAnnouncement() {
  const raid = currentRaids.find(r => r.id === selectedRaidId);
  const text = raid?.announcement || "";
  // Always show the button for admins when a raid is selected
  if (softresAnnouncementCreateBtn) softresAnnouncementCreateBtn.hidden = !isAdmin;
  if (text) {
    if (softresAnnouncement) softresAnnouncement.hidden = false;
    if (softresAnnouncementText) softresAnnouncementText.textContent = text;
    if (softresAnnouncementAdmin) softresAnnouncementAdmin.hidden = !isAdmin;
  } else {
    if (softresAnnouncement) softresAnnouncement.hidden = true;
  }
}

function openAnnouncementEditor() {
  const raid = currentRaids.find(r => r.id === selectedRaidId);
  if (announcementTextInput) announcementTextInput.value = raid?.announcement || "";
  if (announcementDialog) announcementDialog.showModal();
}

async function saveAnnouncement(text) {
  if (!db || !isAdmin || !selectedRaidId) return;
  const raid = currentRaids.find(r => r.id === selectedRaidId);
  if (!raid) return;
  try {
    const payload = buildRaidPayload(raid, { announcement: text || "" });
    await setDoc(doc(db, "raids", selectedRaidId), payload);
    raid.announcement = text || "";
    renderAnnouncement();
  } catch (err) {
    setMsg("Error saving announcement: " + err.message, true);
  }
}

if (softresAnnouncementEditBtn) softresAnnouncementEditBtn.addEventListener("click", openAnnouncementEditor);
if (softresAnnouncementCreateBtn) softresAnnouncementCreateBtn.addEventListener("click", openAnnouncementEditor);
if (softresAnnouncementClearBtn) softresAnnouncementClearBtn.addEventListener("click", () => {
  if (confirm("Clear the announcement?")) saveAnnouncement("");
});
if (announcementForm) announcementForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = (announcementTextInput?.value || "").trim();
  saveAnnouncement(text);
  if (announcementDialog) announcementDialog.close();
});
if (announcementCancelBtn) announcementCancelBtn.addEventListener("click", () => {
  if (announcementDialog) announcementDialog.close();
});
if (softresAnnouncementDismissBtn) softresAnnouncementDismissBtn.addEventListener("click", () => {
  if (softresAnnouncement) softresAnnouncement.hidden = true;
});

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

// ── Hard Reserves ────────────────────────────────────────────────────────────
function renderHardReserves() {
  if (!selectedRaidId || !hardresSection) return;
  hardresSection.hidden = false;

  const raidHRs = currentHardReserves.filter(hr => hr.raidId === selectedRaidId);
  if (hardresCount) hardresCount.textContent = String(raidHRs.length);
  if (hardresAdminControls) hardresAdminControls.hidden = !isAdmin;

  if (!hardresTableWrap || !hardresRows) return;
  if (!raidHRs.length) {
    hardresTableWrap.hidden = true;
    return;
  }

  hardresTableWrap.hidden = false;
  let html = '';
  for (const hr of raidHRs) {
    const color = QUALITY_COLORS[hr.itemQuality] || '#ccc';
    const iconHtml = hr.itemIcon ? `<img class="softres-item-icon" src="${escapeHtml(hr.itemIcon)}" alt="" loading="lazy" /> ` : '';
    const deleteBtn = isAdmin
      ? `<button class="secondary softres-action-btn softres-delete-btn" data-hr-action="delete" data-hr-id="${escapeHtml(hr.id)}" title="Remove hard reserve">✕</button>`
      : '';
    html += `<tr>
      <td>${iconHtml}<span data-item-id="${hr.itemId}" class="softres-item-hover" style="color:${color};font-weight:600">${escapeHtml(hr.itemName || '?')}</span> <span class="text-dim" style="font-size:0.8em">— ${escapeHtml(hr.bossName || '?')}</span></td>
      <td style="font-weight:600">${escapeHtml(hr.characterName || '—')}</td>
      <td class="text-dim">${escapeHtml(hr.note || '—')}</td>
      <td class="text-dim">${relativeTime(hr.createdAt)}</td>
      <td>${deleteBtn}</td>
    </tr>`;
  }
  hardresRows.innerHTML = html;
}

function subscribeToHardReserves() {
  if (unsubscribeHardReserves) {
    unsubscribeHardReserves();
    unsubscribeHardReserves = null;
  }
  if (!db || !selectedRaidId) return;

  const q = query(collection(db, "hardreserves"), where("raidId", "==", selectedRaidId));
  unsubscribeHardReserves = onSnapshot(q, (snapshot) => {
    currentHardReserves = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderHardReserves();
    filterLootTable(); // refresh HR badge/button state in loot table
    if (raidModeDialog?.open) renderRaidModeBody(raidModeBossFilter?.value || "");
  }, (err) => {
    console.error("Error loading hard reserves:", err);
  });
}

function subscribeToSignups() {
  if (unsubscribeSignups) { unsubscribeSignups(); unsubscribeSignups = null; }
  if (!db || !selectedRaidId) return;
  const q = query(collection(db, "signups"), where("raidId", "==", selectedRaidId));
  unsubscribeSignups = onSnapshot(q, (snapshot) => {
    currentSignups = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    tryAutoSelectCharacter();
    renderReserves();
  }, (err) => {
    console.error("Error loading signups:", err);
  });
}

// ── Reserve via +/- buttons ─────────────────────────────────────────────────
async function handleReserveButton(e) {
  const btn = e.target.closest("[data-reserve-action]");
  if (!btn) return;
  if (!db || !isApprovedUser || !selectedRaidId) return;

  const raid = currentRaids.find(r => r.id === selectedRaidId);
  if (!raid || (!isAdmin && raid.softresLocked)) {
    setMsg("Reserves are locked for this raid.", true);
    return;
  }

  const ch = getSelectedCharacter();
  if (!ch) {
    setMsg("Please select a character first.", true);
    return;
  }

  if (!isAdmin && ch.ownerUid !== authUid) {
    setMsg("You can only modify your own characters' reserves.", true);
    return;
  }

  const action = btn.dataset.reserveAction;
  const itemId = Number(btn.dataset.itemId);

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
        // Per-dungeon limit enforcement for compound raids
        if (selectedRaidLoot?.sources?.length > 1) {
          const srcMap = new Map();
          for (const boss of selectedRaidLoot.bosses) {
            if (boss.sourceLoot) {
              for (const bi of boss.items) srcMap.set(bi.itemId, boss.sourceLoot);
            }
          }
          const dungeonLimit = Math.floor(maxRes / selectedRaidLoot.sources.length);
          const newItemSrc = srcMap.get(itemId);
          if (newItemSrc) {
            const srcCount = currentItems.filter(i => srcMap.get(Number(i.itemId)) === newItemSrc).length;
            if (srcCount >= dungeonLimit) {
              setMsg(`Already have ${dungeonLimit} reserve${dungeonLimit !== 1 ? 's' : ''} from ${newItemSrc}. Remove it first.`, true);
              return;
            }
          }
        }
        const updatePayload = {
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
        };
        await setDoc(doc(db, "softreserves", existing.id), updatePayload);
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
        try {
          await addDoc(collection(db, "softreserves"), payload);
          setMsg(`Reserved ${item.name}.`);
        } catch (err) {
          setMsg("Error saving reserve: " + err.message, true);
        }
      }
    } else if (action === "remove") {
      if (!existing) return;
      const currentItems = getReserveItems(existing);
      // Remove only one instance (supports double-roll where same item is reserved twice)
      let removedOne = false;
      const filtered = currentItems.filter(i => {
        if (!removedOne && Number(i.itemId) === itemId) { removedOne = true; return false; }
        return true;
      });
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

  if (action === "remove-item") {
    if (!isAdmin) return;
    const itemId = Number(btn.dataset.itemId);
    const res = currentReserves.find(r => r.id === id);
    if (!res) return;
    const currentItems = Array.isArray(res.items) ? res.items : getReserveItems(res);
    const itemName = currentItems.find(i => Number(i.itemId) === itemId)?.name || "this item";
    if (!confirm(`Remove ${itemName} from ${res.characterName || "this character"}?`)) return;
    try {
      let removedOne = false;
      const filtered = currentItems.filter(i => {
        if (!removedOne && Number(i.itemId) === itemId) { removedOne = true; return false; }
        return true;
      });
      if (filtered.length === 0) {
        await deleteDoc(doc(db, "softreserves", id));
        setMsg("Last reserve removed — entry deleted.");
      } else {
        await setDoc(doc(db, "softreserves", id), {
          raidId:        res.raidId,
          raidName:      res.raidName || "",
          raidDate:      res.raidDate || "",
          characterId:   res.characterId,
          characterName: res.characterName || "",
          wowClass:      res.wowClass || "",
          ownerUid:      res.ownerUid,
          items:         filtered,
          createdAt:     res.createdAt || serverTimestamp(),
          updatedAt:     serverTimestamp()
        });
        setMsg(`Removed ${itemName}.`);
      }
    } catch (err) {
      setMsg("Error removing item: " + err.message, true);
    }
    return;
  }

  if (action === "delete") {
    if (!isAdmin) return; // Only admins can delete from overview
    if (!confirm("Delete all reserves for this character?")) return;
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
  if ('signupsLocked' in overrides || raid.signupsLocked != null) {
    payload.signupsLocked = overrides.signupsLocked ?? raid.signupsLocked;
  }
  if (raid.plannedBosses != null && !('plannedBosses' in overrides)) {
    payload.plannedBosses = raid.plannedBosses;
  }
  if ('announcement' in overrides) {
    if (overrides.announcement) payload.announcement = overrides.announcement;
  } else if (raid.announcement) {
    payload.announcement = raid.announcement;
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

/**
 * Compress a string using zlib (deflate with header) and return a base64 string.
 * This matches the format softres.it uses for Gargul exports.
 */
async function zlibBase64(str) {
  const bytes = new TextEncoder().encode(str);
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const chunks = [];
  const reader = cs.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  let binary = "";
  for (let i = 0; i < out.length; i++) binary += String.fromCharCode(out[i]);
  return btoa(binary);
}

async function copySRResults() {
  if (!selectedRaidId) return;
  const raidReserves = currentReserves.filter(r => r.raidId === selectedRaidId);
  const raidHRs = currentHardReserves.filter(hr => hr.raidId === selectedRaidId);
  if (!raidReserves.length && !raidHRs.length) {
    setMsg("No reserves to copy.", true);
    return;
  }

  const raid = currentRaids.find(r => r.id === selectedRaidId);
  const now = Math.floor(Date.now() / 1000);

  // Build softres.it Gargul export format: zlib(JSON) → base64
  // Structure decoded from a real softres.it export payload
  const payload = {
    metadata: {
      id: selectedRaidId,
      instance: null,
      instances: [(raid?.raidName || "raid").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 12)],
      hidden: false,
      createdAt: now,
      updatedAt: now,
      raidStartsAt: null,
      lockedAt: raid?.softresLocked ? now : null,
      discordUrl: "",
      note: ""
    },
    softreserves: raidReserves
      .filter(res => getReserveItems(res).length)
      .map(res => ({
        rollBonus: 0,
        plusOnes: 0,
        name: res.characterName || "",
        class: (res.wowClass || "").toLowerCase(),
        note: "",
        items: getReserveItems(res).map((it, idx) => ({ id: Number(it.itemId), note: "", order: idx }))
      })),
    hardreserves: raidHRs.map(hr => ({
      id: Number(hr.itemId),
      for: hr.characterName || "",
      note: hr.note || ""
    }))
  };

  try {
    const encoded = await zlibBase64(JSON.stringify(payload));
    await navigator.clipboard.writeText(encoded);
    const orig = softresCopyBtn.textContent;
    softresCopyBtn.textContent = "Copied!";
    setTimeout(() => { softresCopyBtn.textContent = orig; }, 2000);
  } catch {
    setMsg("Unable to copy to clipboard.", true);
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

// ── PUG token generation ─────────────────────────────────────────────────────
async function generatePugToken() {
  if (!db || !isAdmin || !selectedRaidId) return;
  const raid = currentRaids.find(r => r.id === selectedRaidId);
  if (!raid) return;

  const token = String(Math.floor(10000 + Math.random() * 90000));

  // Calculate expiry: raid end hour + 2h grace
  const raidDate = parseDateOnly(raid.raidDate);
  if (!raidDate) { setMsg("Cannot determine raid date for token.", true); return; }
  const endHour = Number.isInteger(raid.raidEnd) ? raid.raidEnd : 23;
  const expiresAt = new Date(raidDate);
  expiresAt.setHours(endHour + 2, 0, 0, 0);

  if (generatePugLinkBtn) generatePugLinkBtn.disabled = true;
  try {
    // Clean up expired tokens (fire and forget)
    cleanupExpiredPugTokens();

    await setDoc(doc(db, "pugTokens", token), {
      raidId: selectedRaidId,
      raidName: raid.raidName || "",
      raidDate: raid.raidDate || "",
      expiresAt: Timestamp.fromDate(expiresAt),
      createdBy: authUid,
      createdAt: serverTimestamp()
    });

    const url = `${location.origin}/softres-pug?t=${token}`;
    showPugLinkDialog(url, token, raid);
  } catch (err) {
    setMsg("Error generating PUG link: " + err.message, true);
  } finally {
    if (generatePugLinkBtn) generatePugLinkBtn.disabled = false;
  }
}

function showPugLinkDialog(url, token, raid) {
  if (!pugLinkDialog) return;
  if (pugLinkDialogRaid) pugLinkDialogRaid.textContent = `${raid.raidName || "Raid"} — ${formatMonthDayYear(raid.raidDate || "")}`;
  if (pugLinkUrlInput) pugLinkUrlInput.value = url;
  if (pugLinkToken) pugLinkToken.textContent = token;
  if (pugLinkCopyStatus) pugLinkCopyStatus.textContent = "";
  pugLinkDialog.showModal();
}

async function cleanupExpiredPugTokens() {
  try {
    const now = new Date();
    const tokensSnap = await getDocs(collection(db, "pugTokens"));
    for (const d of tokensSnap.docs) {
      const expiresAt = d.data().expiresAt?.toDate?.();
      if (expiresAt && expiresAt < now) await deleteDoc(d.ref);
    }
    const guestSnap = await getDocs(collection(db, "guestCharacters"));
    for (const d of guestSnap.docs) {
      const expiresAt = d.data().expiresAt?.toDate?.();
      if (expiresAt && expiresAt < now) await deleteDoc(d.ref);
    }
  } catch (err) {
    console.warn("PUG cleanup:", err);
  }
}

// ── Page visibility ─────────────────────────────────────────────────────────
function setPageVisibility() {
  // Show to all approved users (admins + members)
  softresSection.hidden = !isApprovedUser;
  if (!isApprovedUser) softresDetail.hidden = true;

  // Hide admin-only nav links from non-admin users
  const adminRaidsLink = document.getElementById("adminRaidsLink");
  const adminOpsLink = document.getElementById("adminOpsLink");
  if (adminRaidsLink) adminRaidsLink.hidden = !isAdmin;
  if (adminOpsLink) adminOpsLink.hidden = !isAdmin;
}

// ── Wire up events ──────────────────────────────────────────────────────────
softresRaidGrid.addEventListener("click", (e) => {
  const tile = e.target.closest("[data-raid-id]");
  if (!tile) return;
  onRaidSelected(tile.dataset.raidId);
});
// ── Boss multi-select dropdown behavior ─────────────────────────────────────
function getSelectedBosses() {
  const allCb = lootBossDropdown.querySelector('.multi-select-all input');
  if (allCb?.checked) return new Set(); // empty = all
  const checked = lootBossOptions.querySelectorAll('input:checked');
  const names = new Set();
  for (const cb of checked) names.add(cb.value);
  return names;
}

function updateBossToggleLabel() {
  const selected = getSelectedBosses();
  if (selected.size === 0) {
    lootBossToggle.textContent = 'All Bosses';
  } else if (selected.size === 1) {
    lootBossToggle.textContent = [...selected][0];
  } else {
    lootBossToggle.textContent = `${selected.size} Bosses`;
  }
}

lootBossToggle.addEventListener('click', () => {
  lootBossDropdown.hidden = !lootBossDropdown.hidden;
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!lootBossMultiSelect.contains(e.target)) {
    lootBossDropdown.hidden = true;
  }
});

// "All Bosses" checkbox behavior
lootBossDropdown.querySelector('.multi-select-all input').addEventListener('change', (e) => {
  if (e.target.checked) {
    // Uncheck all individual bosses
    for (const cb of lootBossOptions.querySelectorAll('input')) cb.checked = false;
  }
  updateBossToggleLabel();
  filterLootTable();
});

// Individual boss checkbox behavior
lootBossOptions.addEventListener('change', (e) => {
  if (!e.target.matches('input[type="checkbox"]')) return;
  const allCb = lootBossDropdown.querySelector('.multi-select-all input');
  const anyChecked = lootBossOptions.querySelector('input:checked');
  // If no individual boss checked, re-check "All"
  if (!anyChecked) {
    allCb.checked = true;
  } else {
    allCb.checked = false;
  }
  updateBossToggleLabel();
  filterLootTable();
});

softresCharacterSelect.addEventListener("change", renderCharacterReserves);
softresToggleLockBtn.addEventListener("click", toggleLock);
softresCopyBtn.addEventListener("click", copySRResults);
softresMaxReservesInput.addEventListener("change", updateMaxReserves);
softresRows.addEventListener("click", handleReserveAction);
lootTypeFilter.addEventListener("change", filterLootTable);
lootSlotFilter.addEventListener("change", filterLootTable);
lootSearchFilter.addEventListener("input", filterLootTable);
// Use multiple event types so mobile/predictive keyboards reliably trigger filtering
softresItemDroppedFilter.addEventListener("input", renderReserves);
softresItemDroppedFilter.addEventListener("keyup", renderReserves);
softresItemDroppedFilter.addEventListener("change", renderReserves);
softresItemDroppedFilter.addEventListener("compositionend", renderReserves);
lootTableRows.addEventListener("click", (e) => {
  // HR button — open dialog to collect character name + note
  const hrBtn = e.target.closest("[data-hr-open]");
  if (hrBtn && isAdmin && db) {
    const itemId = Number(hrBtn.dataset.hrOpen);
    const bossName = hrBtn.dataset.hrBoss || '';
    const allItems = selectedRaidLoot ? selectedRaidLoot.bosses.flatMap(b => b.items.map(i => ({ ...i, bossName: b.name }))) : [];
    const item = allItems.find(i => i.itemId === itemId);
    if (!item) return;
    pendingHrItem = { ...item, bossName };
    if (hardresDialogItemName) hardresDialogItemName.textContent = `${item.name} — ${bossName}`;
    if (hardresCharInput) hardresCharInput.value = '';
    if (hardresNoteInput) hardresNoteInput.value = '';
    hardresDialog?.showModal();
    return;
  }
  handleReserveButton(e);
});
softresCharReserves.addEventListener("click", handleReserveButton);

// Hard reserve dialog submit
if (hardresForm) {
  hardresForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!pendingHrItem || !db || !isAdmin || !selectedRaidId) return;
    const charName = (hardresCharInput?.value || '').trim();
    const note = (hardresNoteInput?.value || '').trim();
    const raid = currentRaids.find(r => r.id === selectedRaidId);
    try {
      await addDoc(collection(db, "hardreserves"), {
        raidId: selectedRaidId,
        raidName: raid?.raidName || '',
        raidDate: raid?.raidDate || '',
        itemId: pendingHrItem.itemId,
        itemName: pendingHrItem.name || '',
        itemIcon: pendingHrItem.icon || '',
        itemQuality: pendingHrItem.quality || 'Epic',
        bossName: pendingHrItem.bossName || '',
        characterName: charName,
        note: note,
        createdByUid: authUid,
        createdAt: serverTimestamp()
      });
      hardresDialog?.close();
      pendingHrItem = null;
    } catch (err) {
      console.error("Error adding hard reserve:", err);
    }
  });
}

if (hardresCancelBtn) {
  hardresCancelBtn.addEventListener("click", () => {
    hardresDialog?.close();
    pendingHrItem = null;
  });
}

// ── PUG link dialog event listeners ─────────────────────────────────────────
if (generatePugLinkBtn) {
  generatePugLinkBtn.addEventListener("click", generatePugToken);
}
if (pugLinkCloseBtn) {
  pugLinkCloseBtn.addEventListener("click", () => pugLinkDialog?.close());
}
if (pugLinkCopyBtn) {
  pugLinkCopyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(pugLinkUrlInput?.value || "");
      if (pugLinkCopyStatus) pugLinkCopyStatus.textContent = "✓ Copied!";
    } catch {
      if (pugLinkCopyStatus) pugLinkCopyStatus.textContent = "Copy failed — select and copy manually.";
    }
  });
}

// Hard reserve rows delete
if (hardresRows) {
  hardresRows.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-hr-action]");
    if (!btn || !isAdmin || !db) return;
    if (btn.dataset.hrAction === "delete") {
      const hrId = btn.dataset.hrId;
      if (!hrId || !confirm("Remove this hard reserve?")) return;
      try {
        await deleteDoc(doc(db, "hardreserves", hrId));
      } catch (err) {
        console.error("Error deleting hard reserve:", err);
      }
    }
  });
}

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

  // ── Email / Password auth ────────────────────────────────────────────────
  const authGateEmailForm = document.getElementById("authGateEmailForm");
  const authGateEmail = document.getElementById("authGateEmail");
  const authGatePassword = document.getElementById("authGatePassword");
  const authGateCreateAccount = document.getElementById("authGateCreateAccount");

  function getEmailAuthErrorMessage(error) {
    const code = error && error.code;
    switch (code) {
      case "auth/invalid-email": return "Invalid email address.";
      case "auth/user-disabled": return "This account has been disabled.";
      case "auth/user-not-found": return "No account found with that email. Click Create Account to register.";
      case "auth/wrong-password": return "Incorrect password.";
      case "auth/invalid-credential": return "Invalid email or password. If you don't have an account, click Create Account.";
      case "auth/email-already-in-use": return "An account with that email already exists. Try signing in instead.";
      case "auth/weak-password": return "Password must be at least 6 characters.";
      case "auth/too-many-requests": return "Too many attempts. Please try again later.";
      default: return getAuthErrorMessage(error);
    }
  }

  async function performEmailSignIn(isCreate) {
    const email = authGateEmail ? authGateEmail.value.trim() : "";
    const password = authGatePassword ? authGatePassword.value : "";
    if (!email || !password) return;
    const allBtns = [authGateSignInButton, authGateYahooButton, authGateEmailForm?.querySelector("[type=submit]"), authGateCreateAccount].filter(Boolean);
    allBtns.forEach(b => (b.disabled = true));
    try {
      if (isCreate) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        try {
          await signInWithEmailAndPassword(auth, email, password);
        } catch (signInError) {
          const code = signInError?.code;
          if (code === "auth/user-not-found" || code === "auth/invalid-credential") {
            try {
              await createUserWithEmailAndPassword(auth, email, password);
            } catch (createError) {
              if (createError?.code === "auth/email-already-in-use") {
                throw { code: "auth/wrong-password" };
              }
              throw createError;
            }
          } else {
            throw signInError;
          }
        }
      }
      setAuthGateState(true);
    } catch (error) {
      const errorText = getEmailAuthErrorMessage(error);
      if (authStatus) authStatus.textContent = errorText;
      setAuthGateState(false, errorText, true);
    } finally {
      allBtns.forEach(b => (b.disabled = false));
    }
  }

  if (authGateEmailForm) {
    authGateEmailForm.addEventListener("submit", (e) => {
      e.preventDefault();
      performEmailSignIn(false);
    });
  }
  if (authGateCreateAccount) {
    authGateCreateAccount.addEventListener("click", () => performEmailSignIn(true));
  }

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
    if (unsubscribeHardReserves) { unsubscribeHardReserves(); unsubscribeHardReserves = null; }
    if (unsubscribeSignups) { unsubscribeSignups(); unsubscribeSignups = null; }

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

    // Treat all logged-in users as members
    isApprovedUser = true;

    setAuthGateState(true);
    updateAuthActionButtons(user);
    updateUidDisplay(authUid);
    setPageVisibility();

    const userLabel = user.email || `${authUid.slice(0, 8)}...`;
    if (!isApprovedUser) {
      // This block will never run now, all users are approved
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
      // Auto-select the nearest upcoming raid on first load
      if (!selectedRaidId && currentRaids.length) {
        const upcoming = currentRaids
          .filter(r => !isRaidPast(r))
          .sort((a, b) => (parseDateOnly(a.raidDate)?.getTime() || 0) - (parseDateOnly(b.raidDate)?.getTime() || 0));
        const autoRaid = upcoming[0] || currentRaids[0];
        if (autoRaid) onRaidSelected(autoRaid.id);
      }
      renderLockState();
      renderAnnouncement();
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
