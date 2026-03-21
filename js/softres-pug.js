import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
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
  query,
  serverTimestamp,
  setDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { appSettings, firebaseConfig } from "../config/prod/firebase-config.js";

// ── DOM refs ─────────────────────────────────────────────────────────────────
const pugLoadingState   = document.getElementById("pugLoadingState");
const pugErrorState     = document.getElementById("pugErrorState");
const pugErrorTitle     = document.getElementById("pugErrorTitle");
const pugErrorMessage   = document.getElementById("pugErrorMessage");
const pugNameModal      = document.getElementById("pugNameModal");
const pugNameRaidInfo   = document.getElementById("pugNameRaidInfo");
const pugNameForm       = document.getElementById("pugNameForm");
const pugCharNameInput  = document.getElementById("pugCharNameInput");
const pugNameError      = document.getElementById("pugNameError");
const pugNameSubmit     = document.getElementById("pugNameSubmit");
const pugClassSelect    = document.getElementById("pugClassSelect");
const pugShell          = document.getElementById("pugShell");
const pugGuestName      = document.getElementById("pugGuestName");
const pugRaidName       = document.getElementById("pugRaidName");
const pugRaidMeta       = document.getElementById("pugRaidMeta");
const pugLockBadge      = document.getElementById("pugLockBadge");
const pugCharLabel      = document.getElementById("pugCharLabel");
const hardresSection    = document.getElementById("hardresSection");
const hardresCount      = document.getElementById("hardresCount");
const hardresTableWrap  = document.getElementById("hardresTableWrap");
const hardresRows       = document.getElementById("hardresRows");
const softresOverview   = document.getElementById("softresOverview");
const softresRaidTitle  = document.getElementById("softresRaidTitle");
const softresReserveCount = document.getElementById("softresReserveCount");
const softresItemDroppedFilter = document.getElementById("softresItemDroppedFilter");
const softresRows       = document.getElementById("softresRows");
const softresMessage    = document.getElementById("softresMessage");
const softresAdminAdd   = document.getElementById("softresAdminAdd");
const softresCharReserves = document.getElementById("softresCharReserves");
const softresLootBrowser = document.getElementById("softresLootBrowser");
const lootBossMultiSelect = document.getElementById("lootBossMultiSelect");
const lootBossToggle    = document.getElementById("lootBossToggle");
const lootBossDropdown  = document.getElementById("lootBossDropdown");
const lootBossOptions   = document.getElementById("lootBossOptions");
const lootTypeFilter    = document.getElementById("lootTypeFilter");
const lootSlotFilter    = document.getElementById("lootSlotFilter");
const lootSearchFilter  = document.getElementById("lootSearchFilter");
const lootTableRows     = document.getElementById("lootTableRows");

// ── State ────────────────────────────────────────────────────────────────────
let db, auth;
let authUid         = null;
let guestCharName   = null;
let guestCharClass  = "";
let guestRaidId     = null;
let guestRaid       = null;       // full raid Firestore doc data
let pugTokenStr     = null;       // the 5-digit token string
let pugTokenData    = null;       // full token doc data (contains expiresAt)
let selectedRaidLoot = null;
let lootData        = null;
let itemTooltipMap  = new Map();
let tooltipEl       = null;
let currentReserves      = [];
let currentHardReserves  = [];
let unsubscribeReserves     = null;
let unsubscribeHardReserves = null;

// ── Constants ────────────────────────────────────────────────────────────────
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

const BOSS_KILL_ORDER = {
  "Karazhan": [
    "Servant Quarters", "Attumen the Huntsman", "Moroes",
    "Opera Event (The Big Bad Wolf / Julianne / The Crone)",
    "Maiden of Virtue", "The Curator",
    "Chess Event (Echo of Medivh)", "Terestian Illhoof",
    "Shade of Aran", "Netherspite", "Nightbane", "Prince Malchezaar"
  ],
  "Gruul's Lair": ["High King Maulgar", "Gruul the Dragonkiller", "Trash Drops"],
  "Magtheridon's Lair": ["Magtheridon", "Trash Drops"],
  "Serpentshrine Cavern": [
    "Hydross the Unstable", "The Lurker Below", "Leotheras the Blind",
    "Fathom-Lord Karathress", "Morogrim Tidewalker", "Lady Vashj", "Trash Drops"
  ],
  "Tempest Keep": [
    "Al'ar", "Void Reaver", "High Astromancer Solarian",
    "Cosmic Infuser", "Devastation", "Infinity Blades",
    "Netherstrand Longbow", "Phaseshift Bulwark", "Staff of Disintegration",
    "Warp Slicer", "Kael'thas Sunstrider", "Trash Drops"
  ],
  "Hyjal Summit": [
    "Rage Winterchill", "Anetheron", "Kaz'rogal", "Azgalor", "Archimonde", "Trash Drops"
  ],
  "Black Temple": [
    "High Warlord Naj'entus", "Supremus", "Shade of Akama",
    "Ashtongue Channeler", "Gurtogg Bloodboil",
    "Essence of Anger", "High Nethermancer Zerevor",
    "The Illidari Council", "Mother Shahraz", "Illidan Stormrage", "Trash Drops"
  ],
  "Zul'Aman": [
    "Nalorakk", "Akil'zon", "Jan'alai", "Halazzi",
    "Hex Lord Malacrass", "Zul'jin", "Trash Drops"
  ],
  "Sunwell Plateau": ["Brutallus", "Felmyst", "Kil'jaeden", "Trash Drops"]
};

const COMPOUND_RAID_PARTS = {
  "Gruul's + Mag's": ["Gruul's Lair", "Magtheridon's Lair"]
};

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
const TIER_TOKEN_CLASSES = {
  "Hero":       new Set(["Hunter", "Mage", "Warlock"]),
  "Champion":   new Set(["Paladin", "Rogue", "Shaman"]),
  "Defender":   new Set(["Warrior", "Priest", "Druid"]),
  "Conqueror":  new Set(["Paladin", "Priest", "Warlock"]),
  "Protector":  new Set(["Warrior", "Hunter", "Shaman"]),
  "Vanquisher": new Set(["Rogue", "Mage", "Druid"])
};

// ── Utility functions ────────────────────────────────────────────────────────
function escapeHtml(val) {
  return String(val).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
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

function setMsg(text, isError = false) {
  if (!softresMessage) return;
  softresMessage.textContent = text;
  softresMessage.classList.toggle("error", isError);
}

function showError(title, message) {
  if (pugLoadingState) pugLoadingState.hidden = true;
  if (pugNameModal?.open) pugNameModal.close();
  if (pugErrorTitle) pugErrorTitle.textContent = title;
  if (pugErrorMessage) pugErrorMessage.textContent = message;
  if (pugErrorState) pugErrorState.hidden = false;
}

// ── Item / class helpers ─────────────────────────────────────────────────────
function getTierTokenGroup(itemName) {
  if (!itemName) return null;
  const m = itemName.match(/of the (?:Fallen|Vanquished|Forgotten) (\w+)$/);
  return m ? m[1] : null;
}

function canClassUseItem(wowClass, item) {
  if (!wowClass) return true;
  if (GENERIC_SLOTS.has(item.slot)) return true;
  if (item.slot === "Tier Token") {
    const group = getTierTokenGroup(item.name);
    if (group && TIER_TOKEN_CLASSES[group]) return TIER_TOKEN_CLASSES[group].has(wowClass);
    return true;
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

function getReserveItems(reserve) {
  if (!reserve) return [];
  if (Array.isArray(reserve.items) && reserve.items.length > 0) return reserve.items;
  // Legacy format
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

function itemMatchesSearch(item, bossName, term) {
  const fields = [item.name, bossName, item.slot, getItemType(item), item.quality, item.subclass, item.class];
  for (const f of fields) {
    if (f && f.toLowerCase().includes(term)) return true;
  }
  const isTierToken = item.slot === "Tier Token";
  if (isTierToken) {
    if ("tier".includes(term) || "token".includes(term) || "set piece".includes(term)) return true;
    const name = (item.name || "").toLowerCase();
    if (term === "t4" && name.includes("fallen")) return true;
    if (term === "t5" && name.includes("vanquished")) return true;
    if (term === "t6" && name.includes("forgotten")) return true;
  }
  if (item.itemLevel && String(item.itemLevel).includes(term)) return true;
  return false;
}

function sortBossesByKillOrder(bosses, raidName) {
  const normalized = (raidName || "").trim().toLowerCase();
  let orderList = null;
  for (const [key, list] of Object.entries(BOSS_KILL_ORDER)) {
    if (key.toLowerCase() === normalized || normalized.includes(key.toLowerCase().split("'")[0])) {
      orderList = list;
      break;
    }
  }
  if (!orderList) return bosses;
  const orderMap = new Map(orderList.map((name, idx) => [name.toLowerCase(), idx]));
  return [...bosses].sort((a, b) => {
    const ia = orderMap.get(a.name.toLowerCase()) ?? 999;
    const ib = orderMap.get(b.name.toLowerCase()) ?? 999;
    return ia - ib;
  });
}

function wowheadUrl(itemId) {
  return `https://www.wowhead.com/tbc/item=${itemId}`;
}

// ── Tooltip system ───────────────────────────────────────────────────────────
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
  tooltipEl = document.createElement("div");
  tooltipEl.className = "wow-tooltip";
  tooltipEl.setAttribute("popover", "manual");
  tooltipEl.hidden = true;
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}

function renderTooltipHtml(item) {
  let lines = "";
  if (item.wowheadTooltip) {
    lines = `<div class="wow-tt-wowhead-body">${item.wowheadTooltip}</div>`;
  } else if (item.tooltip?.length) {
    for (const entry of item.tooltip) {
      const label = (entry.label || "").replace(/^\n+|\n+$/g, "");
      if (!label) continue;
      const fmt = entry.format || "";
      const color = TOOLTIP_FORMAT_COLORS[fmt] || "#e8dcc3";
      if (fmt === "alignRight") {
        if (lines.endsWith("</div>")) {
          lines = lines.slice(0, -6) +
            `<span class="wow-tt-right" style="color:${color}">${escapeHtml(label)}</span></div>`;
        }
        continue;
      }
      const indent = fmt === "indent" ? " wow-tt-indent" : "";
      lines += `<div class="wow-tt-line${indent}" style="color:${color}">${escapeHtml(label)}</div>`;
    }
  } else {
    return "";
  }
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
  let top  = y + pad;
  if (left + rect.width  > window.innerWidth  - pad) left = x - rect.width  - pad;
  if (top  + rect.height > window.innerHeight - pad) top  = y - rect.height - pad;
  if (left < pad) left = pad;
  if (top  < pad) top  = pad;
  el.style.left = left + "px";
  el.style.top  = top  + "px";
}

function hideTooltip() {
  if (tooltipEl) {
    tooltipEl.hidden = true;
    try { tooltipEl.hidePopover(); } catch {}
  }
}

document.addEventListener("mouseover", (e) => {
  const trigger = e.target.closest("[data-item-id]");
  if (trigger) showTooltip(trigger.dataset.itemId, e.clientX, e.clientY);
});
document.addEventListener("mousemove", (e) => {
  if (tooltipEl && !tooltipEl.hidden) positionTooltip(e.clientX, e.clientY);
});
document.addEventListener("mouseout", (e) => {
  const trigger = e.target.closest("[data-item-id]");
  if (trigger) hideTooltip();
});

// ── Loot data loading ────────────────────────────────────────────────────────
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
  if (!lootData?.raids) return null;
  const normalized = String(raidName || "").trim().toLowerCase();
  return lootData.raids.find(r => r.name.toLowerCase() === normalized) || null;
}

// ── Max reserves ─────────────────────────────────────────────────────────────
function getMaxReserves() {
  return guestRaid?.softresMaxReserves ?? 2;
}

// ── Render: raid info bar ────────────────────────────────────────────────────
function renderRaidInfo() {
  if (!guestRaid) return;
  if (pugRaidName) pugRaidName.textContent = guestRaid.raidName || "Raid";

  const rDate = parseDateOnly(guestRaid.raidDate);
  const dateLabel = rDate
    ? rDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : "—";
  const start = Number.isInteger(guestRaid.raidStart) ? hourLabel(guestRaid.raidStart) : "";
  const end   = Number.isInteger(guestRaid.raidEnd)   ? hourLabel(guestRaid.raidEnd)   : "";
  const timeStr  = start ? `${start}${end ? " – " + end : ""} ST` : "";
  const sizeStr  = guestRaid.raidSize ? ` · ${guestRaid.raidSize}` : "";
  if (pugRaidMeta) pugRaidMeta.textContent = `${dateLabel}${timeStr ? "  " + timeStr : ""}${sizeStr}`;

  if (pugLockBadge) {
    const isLocked = !!guestRaid.softresLocked;
    pugLockBadge.textContent = isLocked ? "🔒 Locked" : "🔓 Open";
    pugLockBadge.className = "softres-lock-badge " + (isLocked ? "softres-locked" : "softres-open");
  }
}

// ── Render: hard reserves (read-only for guests) ─────────────────────────────
function renderHardReserves() {
  if (!hardresSection) return;
  hardresSection.hidden = false;

  const raidHRs = currentHardReserves.filter(hr => hr.raidId === guestRaidId);
  if (hardresCount) hardresCount.textContent = String(raidHRs.length);

  if (!hardresTableWrap || !hardresRows) return;
  if (!raidHRs.length) {
    hardresTableWrap.hidden = true;
    return;
  }
  hardresTableWrap.hidden = false;
  let html = "";
  for (const hr of raidHRs) {
    const color = QUALITY_COLORS[hr.itemQuality] || "#ccc";
    const iconHtml = hr.itemIcon
      ? `<img class="softres-item-icon" src="${escapeHtml(hr.itemIcon)}" alt="" loading="lazy" /> `
      : "";
    html += `<tr>
      <td>${iconHtml}<span data-item-id="${hr.itemId}" class="softres-item-hover" style="color:${color};font-weight:600">${escapeHtml(hr.itemName || "?")}</span> <span class="text-dim" style="font-size:0.8em">— ${escapeHtml(hr.bossName || "?")}</span></td>
      <td style="font-weight:600">${escapeHtml(hr.characterName || "—")}</td>
      <td class="text-dim">${escapeHtml(hr.note || "—")}</td>
      <td class="text-dim">${relativeTime(hr.createdAt)}</td>
      <td></td>
    </tr>`;
  }
  hardresRows.innerHTML = html;
}

// ── Render: reserves overview ────────────────────────────────────────────────
function renderReserves() {
  if (!guestRaidId) {
    if (softresOverview) softresOverview.hidden = true;
    return;
  }
  if (softresOverview) softresOverview.hidden = false;

  const raidReserves = currentReserves.filter(r => r.raidId === guestRaidId);
  if (softresReserveCount) softresReserveCount.textContent = String(raidReserves.length);

  const itemDroppedFilter = (softresItemDroppedFilter?.value || "").trim().toLowerCase();

  if (!raidReserves.length) {
    if (softresRows) softresRows.innerHTML = '<tr><td colspan="5" class="text-dim">No reserves yet for this raid.</td></tr>';
    return;
  }

  raidReserves.sort((a, b) =>
    (a.characterName || "").toLowerCase().localeCompare((b.characterName || "").toLowerCase())
  );

  // Build item reservation counts
  const itemReserveCount = new Map();
  for (const res of raidReserves) {
    const items = getReserveItems(res);
    for (const it of items) {
      const id = Number(it.itemId);
      itemReserveCount.set(id, (itemReserveCount.get(id) || 0) + 1);
    }
  }

  const maxRes = getMaxReserves();
  let html = "";
  let visibleCount = 0;

  for (const res of raidReserves) {
    const charName = res.characterName || "—";
    const wowClass = res.wowClass || "—";
    const classColor = WOW_CLASS_COLORS[wowClass] || "#ccc";
    const items = getReserveItems(res);

    if (itemDroppedFilter) {
      const hasMatch = items.some(it => (it.name || "").toLowerCase().includes(itemDroppedFilter));
      if (!hasMatch) continue;
    }

    const isOwnReserve = res.ownerUid === authUid;
    const isLocked = !!guestRaid?.softresLocked;
    const canRemove = isOwnReserve && !isLocked;

    const itemsHtml = items.length > 0
      ? items.map(it => {
          const c = QUALITY_COLORS[it.quality] || "#ccc";
          const lootItem = itemTooltipMap.get(Number(it.itemId));
          const dropPct = lootItem?.dropChance != null
            ? ` <span class="softres-drop-pct">${(lootItem.dropChance * 100).toFixed(1)}%</span>`
            : "";
          const count = itemReserveCount.get(Number(it.itemId)) || 0;
          const countBadge = count > 1
            ? ` <span class="softres-contention-badge" title="${count} characters reserved this item">🎲 ${count}</span>`
            : "";
          const rawName = it.name || "—";
          let nameHtml;
          if (itemDroppedFilter && rawName.toLowerCase().includes(itemDroppedFilter)) {
            const idx = rawName.toLowerCase().indexOf(itemDroppedFilter);
            const before = rawName.slice(0, idx);
            const match  = rawName.slice(idx, idx + itemDroppedFilter.length);
            const after  = rawName.slice(idx + itemDroppedFilter.length);
            nameHtml = `${escapeHtml(before)}<mark class="softres-highlight">${escapeHtml(match)}</mark>${escapeHtml(after)}`;
          } else {
            nameHtml = escapeHtml(rawName);
          }
          return `<span data-item-id="${it.itemId}" class="softres-item-hover" style="color:${c};font-weight:600">${nameHtml}${dropPct}${countBadge}</span>`;
        }).join('<span class="softres-reserve-sep-table"> · </span>')
      : "—";

    // Guests can only delete their own reserve from the overview
    let actionsHtml = "";
    if (canRemove) {
      actionsHtml = `<button class="secondary softres-action-btn softres-delete-btn" data-action="delete-own" data-id="${escapeHtml(res.id)}" title="Remove your reserve">✕</button>`;
    }

    visibleCount++;
    html += `<tr>
      <td style="color:${classColor};font-weight:600">${escapeHtml(charName)}</td>
      <td style="color:${classColor}">${escapeHtml(wowClass === "—" ? "—" : wowClass)}</td>
      <td>${itemsHtml}</td>
      <td class="text-dim">${relativeTime(res.updatedAt)}</td>
      <td>${actionsHtml}</td>
    </tr>`;
  }

  if (!html) {
    html = '<tr><td colspan="5" class="text-dim">No characters reserved a matching item.</td></tr>';
  }

  if (softresReserveCount) {
    softresReserveCount.textContent = itemDroppedFilter ? String(visibleCount) : String(raidReserves.length);
  }
  if (softresRows) softresRows.innerHTML = html;
}

// ── Render: guest character's own reserves ───────────────────────────────────
function renderGuestCharReserves() {
  if (!guestCharName || !authUid) { if (softresCharReserves) softresCharReserves.innerHTML = ""; return; }

  const res = getGuestReserve();
  const items = getReserveItems(res);
  const isLocked = !!guestRaid?.softresLocked;
  const canModify = !isLocked;

  if (!items.length) {
    if (softresCharReserves) softresCharReserves.innerHTML = '<span class="text-dim">No reserves yet — click <strong>+</strong> on items below</span>';
  } else {
    let html = '<span class="softres-char-label">Reserves:</span> ';
    items.forEach((it, idx) => {
      const color = QUALITY_COLORS[it.quality] || "#ccc";
      const lootItem = itemTooltipMap.get(Number(it.itemId));
      const dropPct = lootItem?.dropChance != null
        ? ` <span class="softres-drop-pct">${(lootItem.dropChance * 100).toFixed(1)}%</span>`
        : "";
      const removeBtn = canModify
        ? ` <button class="softres-reserve-btn softres-remove-btn softres-inline-remove" data-reserve-action="remove" data-item-id="${it.itemId}" title="Remove reserve">✕</button>`
        : "";
      if (idx > 0) html += '<span class="softres-char-reserve-sep">&</span>';
      html += `<span class="softres-char-reserve-item" style="color:${color}" data-item-id="${it.itemId}">${escapeHtml(it.name)}${dropPct}${removeBtn}</span>`;
    });
    if (softresCharReserves) softresCharReserves.innerHTML = html;
  }
  filterLootTable();
}

function getGuestReserve() {
  if (!authUid || !guestRaidId) return null;
  return currentReserves.find(r => r.raidId === guestRaidId && r.ownerUid === authUid) || null;
}

// ── Boss multi-select helpers ────────────────────────────────────────────────
function getSelectedBosses() {
  const allCb = lootBossDropdown.querySelector(".multi-select-all input");
  if (allCb?.checked) return new Set();
  const checked = lootBossOptions.querySelectorAll("input:checked");
  const names = new Set();
  for (const cb of checked) names.add(cb.value);
  return names;
}

function updateBossToggleLabel() {
  const selected = getSelectedBosses();
  if (selected.size === 0) {
    lootBossToggle.textContent = "All Bosses";
  } else if (selected.size === 1) {
    lootBossToggle.textContent = [...selected][0];
  } else {
    lootBossToggle.textContent = `${selected.size} Bosses`;
  }
}

// ── Render: loot browser ─────────────────────────────────────────────────────
function renderLootBrowser() {
  if (!selectedRaidLoot) {
    if (lootTableRows) lootTableRows.innerHTML = '<tr><td colspan="7" class="text-dim">No loot data for this raid.</td></tr>';
    return;
  }

  const isPartial = guestRaid?.runType === "Partial" && guestRaid.plannedBosses?.length;
  const plannedSet = new Set((guestRaid?.plannedBosses || []).map(b => b.toLowerCase()));

  function isBossPlanned(filterName) {
    if (!isPartial) return true;
    const lower = filterName.toLowerCase();
    for (const planned of plannedSet) {
      if (lower === planned || lower.startsWith(planned)) return true;
    }
    return false;
  }

  let bossCheckboxes = "";
  const slots = new Set();
  const types = new Set();
  let orderedBosses = sortBossesByKillOrder(selectedRaidLoot.bosses, selectedRaidLoot.name);
  let hasPartialSelection = false;

  orderedBosses.forEach((boss, idx) => {
    let displayName = boss.name;
    let filterName  = boss.name;
    if (boss.name === "Echo of Medivh" || boss.name === "Chess Event" || boss.name === "Chess Event (Echo of Medivh)") {
      displayName = "Chess Event (Echo of Medivh)";
      filterName  = "Chess Event (Echo of Medivh)";
    }
    if (boss.name === "Julianne" || boss.name === "Opera Event (The Big Bad Wolf / Julianne / The Crone)") {
      displayName = "Opera Event (The Big Bad Wolf / Julianne / The Crone)";
      filterName  = "Opera Event (The Big Bad Wolf / Julianne / The Crone)";
    }
    const orderLabel = ` (${idx + 1})`;
    const planned    = isBossPlanned(filterName);
    const checked    = isPartial && planned ? " checked" : "";
    const dimClass   = isPartial && !planned ? " boss-not-planned" : "";
    if (isPartial && planned) hasPartialSelection = true;
    bossCheckboxes += `<label class="multi-select-option${dimClass}"><input type="checkbox" value="${escapeHtml(filterName)}"${checked} /> ${escapeHtml(displayName + orderLabel)}</label>`;
    for (const item of boss.items) {
      slots.add(item.slot);
      types.add(getItemType(item));
    }
  });

  lootBossOptions.innerHTML = bossCheckboxes;
  const allCheckbox = lootBossDropdown.querySelector(".multi-select-all input");
  if (isPartial && hasPartialSelection) {
    if (allCheckbox) allCheckbox.checked = false;
    updateBossToggleLabel();
  } else {
    if (allCheckbox) allCheckbox.checked = true;
    if (lootBossToggle) lootBossToggle.textContent = "All Bosses";
  }

  let typeHtml = '<option value="">All Types</option>';
  for (const t of [...types].sort()) {
    typeHtml += `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`;
  }
  if (lootTypeFilter) lootTypeFilter.innerHTML = typeHtml;

  let slotHtml = '<option value="">All Slots</option>';
  for (const slot of [...slots].sort()) {
    slotHtml += `<option value="${escapeHtml(slot)}">${escapeHtml(slot)}</option>`;
  }
  if (lootSlotFilter) lootSlotFilter.innerHTML = slotHtml;

  filterLootTable();
}

function filterLootTable() {
  if (!selectedRaidLoot || !lootTableRows) return;

  const selectedBosses = getSelectedBosses();
  const typeFilter   = lootTypeFilter?.value || "";
  const slotFilter   = lootSlotFilter?.value || "";
  const searchFilter = (lootSearchFilter?.value || "").trim().toLowerCase();

  // Guest's own current reserves
  const guestRes     = getGuestReserve();
  const reservedItems = getReserveItems(guestRes);
  const reservedItemIds = new Map();
  for (const i of reservedItems) {
    const id = Number(i.itemId);
    reservedItemIds.set(id, (reservedItemIds.get(id) || 0) + 1);
  }
  const reserveCount = reservedItems.length;
  const maxReserves  = getMaxReserves();
  const isLocked     = !!guestRaid?.softresLocked;
  const canModify    = !isLocked;

  // Per-dungeon limit for compound raids
  const itemSourceMap    = new Map();
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
      if (typeFilter   && getItemType(item) !== typeFilter) continue;
      if (slotFilter   && item.slot         !== slotFilter)  continue;
      if (searchFilter && !itemMatchesSearch(item, filterName, searchFilter)) continue;
      itemList.push({ item, bossName: filterName });
    }
  }

  let rows = "";
  for (const { item, bossName } of itemList) {
    const qualityColor   = QUALITY_COLORS[item.quality] || "#ccc";
    const dropPct        = item.dropChance != null ? `${(item.dropChance * 100).toFixed(1)}%` : "—";
    const itemReserveCount = reservedItemIds.get(item.itemId) || 0;
    const isReserved     = itemReserveCount > 0;
    const rowClass       = isReserved ? "softres-loot-row softres-loot-reserved" : "softres-loot-row";

    // +/- buttons for guest's own reserves
    let actionHtml = "";
    if (canModify) {
      const itemSrc   = itemSourceMap.get(item.itemId);
      const dungeonFull = perDungeonLimit !== null && itemSrc != null && (reservedPerSource[itemSrc] || 0) >= perDungeonLimit;
      if (isReserved) {
        actionHtml = `<button class="softres-reserve-btn softres-remove-btn" data-reserve-action="remove" data-item-id="${item.itemId}" title="Remove one reserve">−</button>`;
      }
      if (reserveCount < maxReserves && !dungeonFull) {
        const countBadge = itemReserveCount > 0
          ? `<span class="softres-item-roll-count" title="Reserved ${itemReserveCount}x">×${itemReserveCount}</span>`
          : "";
        actionHtml += `${countBadge}<button class="softres-reserve-btn softres-add-btn" data-reserve-action="add" data-item-id="${item.itemId}" title="Reserve this item${itemReserveCount > 0 ? " again (double roll)" : ""}">+</button>`;
      }
    }

    // HR badge — read-only for guests
    const existingHR = currentHardReserves.find(hr => hr.raidId === guestRaidId && Number(hr.itemId) === item.itemId);
    let hrHtml = "";
    if (existingHR) {
      hrHtml = `<span class="hardres-badge" title="Hard Reserved${existingHR.characterName ? " for " + existingHR.characterName : ""}${existingHR.note ? " — " + existingHR.note : ""}">HR${existingHR.characterName ? ": " + escapeHtml(existingHR.characterName) : ""}</span>`;
    }

    rows += `<tr data-item-id="${item.itemId}" class="${rowClass}">
      <td><img class="softres-item-icon" src="${escapeHtml(item.icon)}" alt="" loading="lazy" /></td>
      <td style="color:${qualityColor};font-weight:600">${escapeHtml(item.name)} <a href="${wowheadUrl(item.itemId)}" class="wowhead-link" target="_blank" rel="noopener" title="View on Wowhead" onclick="event.stopPropagation()">↗</a></td>
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

// ── Reserve button handler ───────────────────────────────────────────────────
async function handleReserveButton(e) {
  const btn = e.target.closest("[data-reserve-action]");
  if (!btn) return;
  if (!db || !authUid || !guestRaidId) return;

  if (guestRaid?.softresLocked) {
    setMsg("Reserves are locked for this raid.", true);
    return;
  }

  const action = btn.dataset.reserveAction;
  const itemId = Number(btn.dataset.itemId);

  const allItems = selectedRaidLoot
    ? selectedRaidLoot.bosses.flatMap(b => b.items.map(i => ({ ...i, bossName: b.name })))
    : [];
  const item = allItems.find(i => i.itemId === itemId);
  if (!item && action === "add") {
    setMsg("Item not found in loot table.", true);
    return;
  }

  const existing   = getGuestReserve();
  const maxRes     = getMaxReserves();
  const itemEntry  = item ? {
    itemId:  item.itemId,
    name:    item.name,
    icon:    item.icon || "",
    quality: item.quality || "Epic",
    slot:    item.slot || "",
    boss:    item.bossName || ""
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
        // Per-dungeon limit for compound raids
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
              setMsg(`Already have ${dungeonLimit} reserve${dungeonLimit !== 1 ? "s" : ""} from ${newItemSrc}. Remove it first.`, true);
              return;
            }
          }
        }
        await setDoc(doc(db, "softreserves", existing.id), {
          raidId:        existing.raidId,
          raidName:      existing.raidName || "",
          raidDate:      existing.raidDate || "",
          characterId:   existing.characterId,
          characterName: existing.characterName || "",
          wowClass:      existing.wowClass || "",
          ownerUid:      authUid,
          items:         [...getReserveItems(existing), itemEntry],
          createdAt:     existing.createdAt || serverTimestamp(),
          updatedAt:     serverTimestamp()
        });
        setMsg(`Reserved ${item.name}.`);
      } else {
        await addDoc(collection(db, "softreserves"), {
          raidId:        guestRaidId,
          raidName:      guestRaid.raidName || "",
          raidDate:      guestRaid.raidDate || "",
          characterId:   authUid,
          characterName: guestCharName,
          wowClass:      guestCharClass,
          ownerUid:      authUid,
          items:         [itemEntry],
          createdAt:     serverTimestamp(),
          updatedAt:     serverTimestamp()
        });
        setMsg(`Reserved ${item.name}.`);
      }
    } else if (action === "remove") {
      if (!existing) return;
      const currentItems = getReserveItems(existing);
      let removedOne = false;
      const filtered = currentItems.filter(i => {
        if (!removedOne && Number(i.itemId) === itemId) { removedOne = true; return false; }
        return true;
      });
      if (filtered.length === 0) {
        await deleteDoc(doc(db, "softreserves", existing.id));
        setMsg("Reserve removed.");
      } else {
        await setDoc(doc(db, "softreserves", existing.id), {
          raidId:        existing.raidId,
          raidName:      existing.raidName || "",
          raidDate:      existing.raidDate || "",
          characterId:   existing.characterId,
          characterName: existing.characterName || "",
          wowClass:      existing.wowClass || "",
          ownerUid:      authUid,
          items:         filtered,
          createdAt:     existing.createdAt || serverTimestamp(),
          updatedAt:     serverTimestamp()
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

// ── Reserve overview action handler (guest own delete) ───────────────────────
async function handleReserveAction(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const id     = btn.dataset.id;
  if (!action || !id) return;

  if (action === "delete-own") {
    const res = currentReserves.find(r => r.id === id);
    if (!res || res.ownerUid !== authUid) return;
    if (!confirm("Remove your reserve?")) return;
    try {
      await deleteDoc(doc(db, "softreserves", id));
      setMsg("Reserve removed.");
    } catch (err) {
      setMsg("Error removing reserve: " + err.message, true);
    }
  }
}

// ── Firestore subscriptions ───────────────────────────────────────────────────
function subscribeToReserves() {
  if (unsubscribeReserves) { unsubscribeReserves(); unsubscribeReserves = null; }
  if (!db || !guestRaidId) return;

  const q = query(collection(db, "softreserves"), where("raidId", "==", guestRaidId));
  unsubscribeReserves = onSnapshot(q, (snapshot) => {
    currentReserves = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderReserves();
    renderGuestCharReserves();
  }, (err) => {
    setMsg("Error loading reserves: " + err.message, true);
  });
}

function subscribeToHardReserves() {
  if (unsubscribeHardReserves) { unsubscribeHardReserves(); unsubscribeHardReserves = null; }
  if (!db || !guestRaidId) return;

  const q = query(collection(db, "hardreserves"), where("raidId", "==", guestRaidId));
  unsubscribeHardReserves = onSnapshot(q, (snapshot) => {
    currentHardReserves = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderHardReserves();
    filterLootTable();
  }, (err) => {
    console.error("Error loading hard reserves:", err);
  });
}

// ── Name modal ────────────────────────────────────────────────────────────────
function showNameModal() {
  if (pugLoadingState) pugLoadingState.hidden = true;
  const rDate = parseDateOnly(guestRaid?.raidDate || "");
  const dateStr = rDate
    ? rDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : "";
  if (pugNameRaidInfo) {
    pugNameRaidInfo.textContent = `${guestRaid?.raidName || "Raid"}${dateStr ? "  —  " + dateStr : ""}`;
  }
  // Color the class select on change
  if (pugClassSelect) {
    pugClassSelect.addEventListener("change", () => {
      pugClassSelect.style.color = WOW_CLASS_COLORS[pugClassSelect.value] || "";
    });
  }

  pugNameModal.showModal();
  // Block Escape key
  pugNameModal.addEventListener("cancel", e => e.preventDefault());
}

async function handleNameSubmit(e) {
  e.preventDefault();
  const name = (pugCharNameInput?.value || "").trim();
  if (!name || name.length < 2 || name.length > 24) {
    showNameError("Name must be 2–24 characters.");
    return;
  }
  const selectedClass = pugClassSelect?.value || "";
  if (!selectedClass) { showNameError("Please select a class."); return; }

  // Disable button while checking
  if (pugNameSubmit) { pugNameSubmit.disabled = true; pugNameSubmit.textContent = "Checking…"; }
  if (pugNameError)  pugNameError.hidden = true;

  try {
    // Check against guild characters
    const charsSnap = await getDocs(collection(db, "characters"));
    const nameLower = name.toLowerCase();
    let isGuildMember = false;

    for (const d of charsSnap.docs) {
      const data = d.data();
      if ((data.characterName || "").toLowerCase() === nameLower) {
        isGuildMember = true;
        break;
      }
      const alts = Array.isArray(data.altCharacters) ? data.altCharacters : [];
      for (const alt of alts) {
        if ((alt?.characterName || "").toLowerCase() === nameLower) {
          isGuildMember = true;
          break;
        }
      }
      if (isGuildMember) break;
    }

    if (isGuildMember) {
      showNameError("This character name is registered as a guild member. Please sign in through the main page to manage your reserves.");
      return;
    }

    // Create the guestCharacters doc
    await createGuestCharDoc(name, selectedClass);
    guestCharName  = name;
    guestCharClass = selectedClass;
    pugNameModal.close();
    setupSRPage();
  } catch (err) {
    showNameError("Error checking name: " + err.message);
  } finally {
    if (pugNameSubmit) { pugNameSubmit.disabled = false; pugNameSubmit.textContent = "Continue"; }
  }
}

function showNameError(msg) {
  if (pugNameError) {
    pugNameError.textContent = msg;
    pugNameError.hidden = false;
  }
}

async function createGuestCharDoc(name, wowClass) {
  const payload = {
    characterName: name,
    wowClass:      wowClass || "",
    raidId:        guestRaidId,
    raidName:      guestRaid.raidName || "",
    pugToken:      pugTokenStr,
    expiresAt:     pugTokenData.expiresAt,
    createdAt:     serverTimestamp()
  };
  await setDoc(doc(db, "guestCharacters", authUid), payload);
}

// ── Setup SR page (post-name-entry) ──────────────────────────────────────────
async function setupSRPage() {
  if (pugLoadingState) pugLoadingState.hidden = true;
  if (pugShell)        pugShell.hidden = false;

  if (pugGuestName) {
    pugGuestName.textContent = guestCharName;
    if (guestCharClass) pugGuestName.style.color = WOW_CLASS_COLORS[guestCharClass] || "";
  }
  if (pugCharLabel) {
    const classTag = guestCharClass ? ` — ${guestCharClass}` : "";
    pugCharLabel.textContent = `${guestCharName}${classTag} (Guest)`;
    if (guestCharClass) pugCharLabel.style.color = WOW_CLASS_COLORS[guestCharClass] || "";
  }

  renderRaidInfo();

  // Raid title in overview header
  if (softresRaidTitle) {
    softresRaidTitle.textContent = `${guestRaid.raidName || "Raid"} — ${formatMonthDayYear(guestRaid.raidDate || "")}`;
  }

  // Load loot data
  await loadLootData();
  buildTooltipMap();

  selectedRaidLoot = findRaidLoot(guestRaid.raidName);

  // Handle compound raids
  if (!selectedRaidLoot && guestRaid.raidName) {
    const componentNames = COMPOUND_RAID_PARTS[guestRaid.raidName] || [];
    if (componentNames.length > 0 && lootData?.raids) {
      const mergedBosses   = [];
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
          name:    guestRaid.raidName,
          phase:   guestRaid.phase,
          bosses:  mergedBosses,
          sources: matchedSources
        };
      }
    }
  }

  // Show character bar
  if (softresAdminAdd)   softresAdminAdd.hidden   = false;
  if (softresLootBrowser) softresLootBrowser.hidden = false;
  if (softresOverview)   softresOverview.hidden   = false;

  renderLootBrowser();
  renderHardReserves();

  subscribeToReserves();
  subscribeToHardReserves();

  // Wire up event listeners
  wireLootBrowserEvents();
  if (softresRows) softresRows.addEventListener("click", handleReserveAction);
  if (softresItemDroppedFilter) {
    softresItemDroppedFilter.addEventListener("input",          renderReserves);
    softresItemDroppedFilter.addEventListener("keyup",          renderReserves);
    softresItemDroppedFilter.addEventListener("change",         renderReserves);
    softresItemDroppedFilter.addEventListener("compositionend", renderReserves);
  }
  if (lootTableRows) {
    lootTableRows.addEventListener("click", handleReserveButton);
  }
  if (softresCharReserves) {
    softresCharReserves.addEventListener("click", handleReserveButton);
  }
}

function wireLootBrowserEvents() {
  if (lootBossToggle) {
    lootBossToggle.addEventListener("click", () => {
      lootBossDropdown.hidden = !lootBossDropdown.hidden;
    });
  }
  document.addEventListener("click", (e) => {
    if (lootBossMultiSelect && !lootBossMultiSelect.contains(e.target)) {
      if (lootBossDropdown) lootBossDropdown.hidden = true;
    }
  });
  const allCb = lootBossDropdown?.querySelector(".multi-select-all input");
  if (allCb) {
    allCb.addEventListener("change", (e) => {
      if (e.target.checked) {
        for (const cb of lootBossOptions.querySelectorAll("input")) cb.checked = false;
      }
      updateBossToggleLabel();
      filterLootTable();
    });
  }
  if (lootBossOptions) {
    lootBossOptions.addEventListener("change", (e) => {
      if (!e.target.matches('input[type="checkbox"]')) return;
      const allCheckbox = lootBossDropdown?.querySelector(".multi-select-all input");
      const anyChecked  = lootBossOptions.querySelector("input:checked");
      if (!anyChecked) {
        if (allCheckbox) allCheckbox.checked = true;
      } else {
        if (allCheckbox) allCheckbox.checked = false;
      }
      updateBossToggleLabel();
      filterLootTable();
    });
  }
  if (lootTypeFilter)   lootTypeFilter.addEventListener("change", filterLootTable);
  if (lootSlotFilter)   lootSlotFilter.addEventListener("change", filterLootTable);
  if (lootSearchFilter) lootSearchFilter.addEventListener("input", filterLootTable);
}

// ── Config check ─────────────────────────────────────────────────────────────
function hasConfigValues() {
  return firebaseConfig && firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("REPLACE_ME")
    && firebaseConfig.projectId && !firebaseConfig.projectId.includes("REPLACE_ME");
}

// ── Main init ─────────────────────────────────────────────────────────────────
async function init() {
  // 1. Parse token from URL
  const params = new URLSearchParams(location.search);
  const tokenParam = params.get("t");
  if (!tokenParam) {
    showError("Invalid Link", "No guest token found in URL.");
    return;
  }
  pugTokenStr = tokenParam;

  if (!hasConfigValues()) {
    showError("Configuration Error", "Firebase is not configured. Run this page from a deployed environment.");
    return;
  }

  // 2. Init Firebase
  const app = initializeApp(firebaseConfig);
  db   = getFirestore(app);
  auth = getAuth(app);

  // 3. Sign in anonymously
  let user;
  try {
    const cred = await signInAnonymously(auth);
    user    = cred.user;
    authUid = user.uid;
  } catch (err) {
    showError("Authentication Error", "Could not start guest session: " + err.message);
    return;
  }

  // 4. Validate token
  let tokenSnap;
  try {
    tokenSnap = await getDoc(doc(db, "pugTokens", pugTokenStr));
  } catch (err) {
    showError("Invalid Link", "Could not verify guest token: " + err.message);
    return;
  }

  if (!tokenSnap.exists()) {
    showError("Invalid Link", "This PUG link does not exist.");
    return;
  }

  pugTokenData = tokenSnap.data();

  const expiresAt = pugTokenData.expiresAt?.toDate?.();
  if (expiresAt && expiresAt < new Date()) {
    showError("Link Expired", "This PUG link has expired. Ask your raid leader to generate a new one.");
    return;
  }

  guestRaidId = pugTokenData.raidId;

  // 5. Fetch raid
  let raidSnap;
  try {
    raidSnap = await getDoc(doc(db, "raids", guestRaidId));
  } catch (err) {
    showError("Raid Not Found", "Could not load raid data: " + err.message);
    return;
  }

  if (!raidSnap.exists()) {
    showError("Raid Not Found", "The raid for this link no longer exists.");
    return;
  }

  guestRaid = { id: raidSnap.id, ...raidSnap.data() };

  // 6. Check for existing guest session (same user, same raid)
  let guestCharSnap;
  try {
    guestCharSnap = await getDoc(doc(db, "guestCharacters", authUid));
  } catch {
    guestCharSnap = null;
  }

  if (guestCharSnap?.exists()) {
    const guestCharData = guestCharSnap.data();
    if (guestCharData.raidId === guestRaidId) {
      // Restore session — skip modal
      guestCharName  = guestCharData.characterName;
      guestCharClass = guestCharData.wowClass || "";
      if (pugLoadingState) pugLoadingState.hidden = true;
      setupSRPage();
      return;
    }
  }

  // 7. Show name modal
  showNameModal();
  if (pugNameForm) pugNameForm.addEventListener("submit", handleNameSubmit);
}

init();
