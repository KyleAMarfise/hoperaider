// Role icons (fix ReferenceError)
const ROLE_ICONS = {
  Tank: "🛡",
  Healer: "✚",
  DPS: "⚔"
};
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
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let db = null;
let authUid = null;
let authEmail = "";
let hasAdminUI = false;
// Global fields object for form fields
const fields = {
  wowClass: document.getElementById("wowClassPicker"),
  mainRole: document.getElementById("mainRole"),
  offRole: document.getElementById("offRole"),
  mainSpecialization: document.getElementById("mainSpecialization"),
  offSpecialization: document.getElementById("offSpecialization"),
  profileName: document.getElementById("profileName"),
  characterName: document.getElementById("characterName"),
  preferredStart1: document.getElementById("preferredStart1"),
  preferredEnd1: document.getElementById("preferredEnd1"),
  preferredStart2: document.getElementById("preferredStart2"),
  preferredEnd2: document.getElementById("preferredEnd2"),
  preferredDay1: document.getElementById("preferredDay1"),
  preferredDay2: document.getElementById("preferredDay2"),
};
// Raid row containers for renderRows (fix ReferenceError)
const raidRows = {
  current: document.getElementById("currentRaidRows"),
  upcoming: document.getElementById("upcomingRaidRows"),
  past: document.getElementById("pastRaidRows")
};

// WoW class colors (fix ReferenceError)
const WOW_CLASS_COLORS = {
  Druid: "#FF7D0A",
  Hunter: "#ABD473",
  Mage: "#69CCF0",
  Paladin: "#F58CBA",
  Priest: "#FFFFFF",
  Rogue: "#FFF569",
  Shaman: "#0070DE",
  Warlock: "#9482C9",
  Warrior: "#C79C6E"
};

// Raid count badges (fix ReferenceError)
const raidCountBadges = {
  current: document.getElementById("currentCountBadge"),
  upcoming: document.getElementById("upcomingCountBadge"),
  past: document.getElementById("pastCountBadge")
};
import { appSettings, firebaseConfig } from "./config/prod/firebase-config.js";

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

const SPEC_ICONS = {
  "Feral (Bear)": "🐻",
  Restoration: "💧",
  Balance: "🌙",
  "Feral (Cat)": "🐈",
  "Beast Mastery": "🐾",
  Marksmanship: "🎯",
  Survival: "🪤",
  Arcane: "✨",
  Fire: "🔥",
  Frost: "❄",
  Protection: "🛡",
  Holy: "✚",
  Retribution: "⚔",
  Discipline: "📿",
  Shadow: "🕯",
  Assassination: "🗡",
  Combat: "⚔",
  Subtlety: "🌑",
  Elemental: "⚡",
  Enhancement: "🔨",
  Affliction: "☠",
  Demonology: "👹",
  Destruction: "💥",
  Arms: "🪓",
  Fury: "💢"
};

// Safeguard: Prevent mass destructive actions if using prod DB
const PROD_DB_SAFEGUARD = typeof window !== 'undefined' && window.__HOPE_RAID_CONFIG && window.__HOPE_RAID_CONFIG.APP_PROD_DB_SAFEGUARD;

const SIGNUP_STATUSES = ["requested", "tentative", "decline"];

const TBC_SPECS_BY_CLASS_ROLE = {
  Druid: {
    Tank: ["Feral (Bear)"],
    Healer: ["Restoration"],
    DPS: ["Balance", "Feral (Cat)"]
  },
  Hunter: {
    DPS: ["Beast Mastery", "Marksmanship", "Survival"]
  },
  Mage: {
    DPS: ["Arcane", "Fire", "Frost"]
  },
  Paladin: {
    Tank: ["Protection"],
    Healer: ["Holy"],
    DPS: ["Retribution"]
  },
  Priest: {
    Healer: ["Discipline", "Holy"],
    DPS: ["Shadow"]
  },
  Rogue: {
    DPS: ["Assassination", "Combat", "Subtlety"]
  },
  Shaman: {
    Healer: ["Restoration"],
    DPS: ["Elemental", "Enhancement"]
  },
  Warlock: {
    DPS: ["Affliction", "Demonology", "Destruction"]
  },
  Warrior: {
    Tank: ["Protection"],
    DPS: ["Arms", "Fury"]
  }
};

const ARMORY_BASE_URL = "https://classic-armory.org/character/us/tbc-anniversary/dreamscythe";
const LOGS_BASE_URL = "https://fresh.warcraftlogs.com/character/us/dreamscythe";

const clockDaysEl = document.getElementById("clockDays");
const clockHoursEl = document.getElementById("clockHours");
const clockMinutesEl = document.getElementById("clockMinutes");
const clockSecondsEl = document.getElementById("clockSeconds");

const form = document.getElementById("signupForm");
const signupIdInput = document.getElementById("signupId");
const selectedRaidIdInput = document.getElementById("selectedRaidId");
const formHeading = document.getElementById("formHeading");
const saveButton = document.getElementById("saveButton");
const cancelEditButton = document.getElementById("cancelEditButton");
const formMessage = document.getElementById("formMessage");
const listMessage = document.getElementById("listMessage");
const raidSectionsEl = document.getElementById("raidSections");
const profileModal = document.getElementById("profileModal");
const profileModalHeading = document.getElementById("profileModalHeading");
const saveProfileButton = document.getElementById("saveProfileButton");
const deleteProfileButton = document.getElementById("deleteProfileButton");
const closeProfileModalButton = document.getElementById("closeProfileModalButton");
const addAltCharacterButton = document.getElementById("addAltCharacterButton");
const altCharactersContainer = document.getElementById("altCharactersContainer");
const editProfileButton = document.getElementById("editProfileButton");
const characterProfileSelect = document.getElementById("characterProfileSelect");
const addCharacterButton = document.getElementById("addCharacterButton");
const adminRaidSection = document.getElementById("adminRaidSection");
const raidForm = document.getElementById("raidForm");
const raidIdInput = document.getElementById("raidId");
const raidPhaseInput = document.getElementById("raidPhase");
const raidTemplateInput = document.getElementById("raidTemplate");
const raidEventDateInput = document.getElementById("raidEventDate");
const raidRunTypeInput = document.getElementById("raidRunType");
const raidStartInput = document.getElementById("raidStart");
const raidEndInput = document.getElementById("raidEnd");
const raidSizeInput = document.getElementById("raidSize");
const saveRaidButton = document.getElementById("saveRaidButton");
const cancelRaidEditButton = document.getElementById("cancelRaidEditButton");
const raidAdminRows = document.getElementById("raidAdminRows");
const raidAdminMessage = document.getElementById("raidAdminMessage");
const authStatus = document.getElementById("authStatus");
const appShell = document.getElementById("appShell");
const authGate = document.getElementById("authGate");
const authGateMessage = document.getElementById("authGateMessage");
const authGateSignInButton = document.getElementById("authGateSignInButton");
const currentUidEl = document.getElementById("currentUid");
const copyUidButton = document.getElementById("copyUidButton");
const signOutButton = document.getElementById("signOutButton");
const siteTitleEl = document.getElementById("siteTitle");
const guildDiscordLink = document.getElementById("guildDiscordLink");
const adminRaidsLink = document.getElementById("adminRaidsLink");
const adminOpsLink = document.getElementById("adminOpsLink");
const adminOpsBadge = document.getElementById("adminOpsBadge");
const adminMenu = document.getElementById("adminMenu");
const wowClassPicker = document.getElementById("wowClassPicker");
const wowClassTrigger = document.getElementById("wowClassTrigger");
const wowClassMenu = document.getElementById("wowClassMenu");
const wowClassTriggerText = document.getElementById("wowClassTriggerText")
  || (wowClassTrigger ? wowClassTrigger.querySelector("[data-wow-class-trigger-text]") : null);

let isAdmin = false;
let currentRows = [];
let currentRaids = [];
let currentCharacters = [];
let allCharacters = [];
let isDemoMode = false;
let pendingSignupStatus = "tentative";
let profileModalMode = "create";
const expandedRaidGroups = new Set();
const VIEWER_TIMEZONE_LABEL = detectViewerTimezoneLabel();
let raidCountdownIntervalId = null;
let unsubscribeSignups = null;
let unsubscribeRaids = null;
let unsubscribeCharacters = null;

if (siteTitleEl) {
  siteTitleEl.textContent = appSettings.siteTitle || "Hope Raid Tracker";
}
if (guildDiscordLink) {
  guildDiscordLink.href = appSettings.discordInviteUrl || "https://discord.gg/xYtxu6Yj";
}
decorateClassOptions();
decorateRoleOptions();
initializeClassPicker();
syncClassVisualTheme();
populateHourOptions(fields.preferredStart1, START_HOURS, "Select start");
populateHourOptions(fields.preferredEnd1, END_HOURS, "Select end");
populateHourOptions(fields.preferredStart2, START_HOURS, "Select start");
populateHourOptions(fields.preferredEnd2, END_HOURS, "Select end");
if (hasAdminUI) {
  populateHourOptions(raidStartInput, START_HOURS, "Select CST start");
  populateHourOptions(raidEndInput, END_HOURS, "Select CST end");
  populateRaidPhaseOptions();
  refreshRaidTemplateOptions();
  raidEventDateInput.value = toDateOnlyString(new Date());
}

function hasConfigValues() {
  return (
    firebaseConfig &&
    firebaseConfig.apiKey &&
    !firebaseConfig.apiKey.includes("REPLACE_ME") &&
    firebaseConfig.projectId &&
    !firebaseConfig.projectId.includes("REPLACE_ME")
  );
}

function setMessage(target, text, isError = false) {
  target.textContent = text;
  target.classList.toggle("error", isError);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.toString();
  } catch {
    return "";
  }
}

function buildExternalLink(urlValue, label) {
  const normalized = normalizeUrl(urlValue);
  if (!normalized) {
    return "—";
  }
  return `<a href="${escapeHtml(normalized)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
}

function buildArmoryUrl(characterName) {
  const slug = String(characterName || "").trim().toLowerCase();
  if (!slug) {
    return "";
  }
  return `${ARMORY_BASE_URL}/${encodeURIComponent(slug)}`;
}

function buildLogsUrl(characterName) {
  const slug = String(characterName || "").trim().toLowerCase();
  if (!slug) {
    return "";
  }
  return `${LOGS_BASE_URL}/${encodeURIComponent(slug)}`;
}

function buildProgressionUrl() {
  return "";
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
  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue)) {
    return null;
  }
  return parsedValue;
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
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function getRaidDateString(item) {
  if (typeof item.raidDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.raidDate)) {
    return item.raidDate;
  }

  const fallback = new Date(item.createdAt || item.updatedAt || Date.now());
  if (Number.isNaN(fallback.getTime())) {
    return "";
  }
  return toDateOnlyString(fallback);
}

function formatRaidDate(dateText) {
  const parsed = parseDateOnly(dateText);
  if (!parsed) {
    return "—";
  }
  return formatMonthDayYear(dateText);
}

function padCountdown(value) {
  return String(Math.max(0, Math.floor(value))).padStart(2, "0");
}

function parseRaidHourValue(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 23) {
    return null;
  }
  return parsed;
}

function parseRaidEndHourValue(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 24) {
    return null;
  }
  return parsed;
}

function toIntegerOrNull(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizeSignupPayloadForRules(payload) {
  const phase = toIntegerOrNull(payload.phase);
  const raidStart = toIntegerOrNull(payload.raidStart);
  const raidEnd = toIntegerOrNull(payload.raidEnd);

  if (!Number.isInteger(phase) || phase < 1 || phase > 5) {
    return null;
  }
  if (!Number.isInteger(raidStart) || raidStart < 0 || raidStart > 23) {
    return null;
  }
  if (!Number.isInteger(raidEnd) || raidEnd < 1 || raidEnd > 24 || raidStart >= raidEnd) {
    return null;
  }

  return {
    ...payload,
    phase,
    raidStart,
    raidEnd
  };
}

function setRaidClockDigits(days, hours, minutes, seconds) {
  if (!clockDaysEl || !clockHoursEl || !clockMinutesEl || !clockSecondsEl) {
    return;
  }
  clockDaysEl.textContent = padCountdown(days);
  clockHoursEl.textContent = padCountdown(hours);
  clockMinutesEl.textContent = padCountdown(minutes);
  clockSecondsEl.textContent = padCountdown(seconds);
}

function getRaidStartDateTime(raid) {
  const raidDateText = getRaidDateString(raid);
  const raidDate = parseDateOnly(raidDateText);
  if (!raidDate) {
    return null;
  }
  const raidStartHour = parseRaidHourValue(raid.raidStart);
  if (!Number.isInteger(raidStartHour)) {
    return null;
  }
  const start = new Date(raidDate);
  start.setHours(raidStartHour, 0, 0, 0);
  return start;
}

function getRaidCutoffDateTime(raid) {
  const raidDateText = getRaidDateString(raid);
  const raidDate = parseDateOnly(raidDateText);
  if (!raidDate) {
    return null;
  }

  const raidEndHour = parseRaidEndHourValue(raid.raidEnd);
  const fallbackStart = parseRaidHourValue(raid.raidStart);
  const cutoffHour = Number.isInteger(raidEndHour)
    ? raidEndHour
    : (Number.isInteger(fallbackStart) ? fallbackStart : 0);

  const cutoff = new Date(raidDate);
  cutoff.setHours(cutoffHour, 0, 0, 0);
  return cutoff;
}

function getNextRaid(raids) {
  const now = Date.now();
  const futureRaids = raids
    .map((raid) => ({ raid, start: getRaidStartDateTime(raid) }))
    .filter((entry) => entry.start && entry.start.getTime() > now)
    .sort((left, right) => left.start.getTime() - right.start.getTime());

  return futureRaids[0] || null;
}

function updateRaidCountdownClock() {
  if (!nextRaidLabel || !nextRaidSubLabel) {
    return;
  }

  const nextRaid = getNextRaid(currentRaids);
  if (!nextRaid) {
    nextRaidLabel.textContent = "No upcoming raids scheduled";
    nextRaidSubLabel.textContent = "Create a raid in Admin Panel to start the Alliance clock.";
    setRaidClockDigits(0, 0, 0, 0);
    return;
  }

  const { raid, start } = nextRaid;
  const msRemaining = Math.max(0, start.getTime() - Date.now());
  const totalSeconds = Math.floor(msRemaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  nextRaidLabel.textContent = `${raid.raidName || "Raid"} • ${formatMonthDayYear(getRaidDateString(raid))}`;
  const raidStartHour = parseRaidHourValue(raid.raidStart);
  nextRaidSubLabel.textContent = Number.isInteger(raidStartHour)
    ? `Starts ${hourLabel(raidStartHour)} CST`
    : "Start time unavailable";
  setRaidClockDigits(days, hours, minutes, seconds);
}

function startRaidCountdownTicker() {
  if (raidCountdownIntervalId) {
    return;
  }
  updateRaidCountdownClock();
  raidCountdownIntervalId = window.setInterval(updateRaidCountdownClock, 1000);
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

function formatPreferredTime(day, start, end) {
  if (!day || !Number.isInteger(start) || !Number.isInteger(end) || start >= end) {
    return "—";
  }
  return `${day}: ${hourLabel(start)} - ${hourLabel(end)}`;
}

function formatSpecDisplay(specName, wowClass, roleName = "") {
  if (!specName) {
    return "—";
  }
  const specWithClass = wowClass ? `${specName} - ${wowClass}` : specName;
  if (!roleName) {
    return specWithClass;
  }
  const roleIcon = ROLE_ICONS[roleName] || "•";
  return `${specWithClass} (${roleIcon} ${roleName})`;
}

function renderCharacterDisplay(signup) {
  const classColor = WOW_CLASS_COLORS[signup.wowClass] || "";
  const label = escapeHtml(signup.characterName || "—");
  if (!classColor) {
    return label;
  }
  return `<span class="class-colored-name" style="color:${classColor};">${label}</span>`;
}

function getRaidKey(item) {
  if (item.raidId) {
    return `raid:${item.raidId}`;
  }
  return [item.raidName || "", getRaidDateString(item), item.phase || ""].join("|");
}

function safeId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function getSelectedCharacterProfile() {
  const selectedId = characterProfileSelect.value;
  if (!selectedId) {
    return null;
  }
  return allCharacters.find((character) => character.id === selectedId) || null;
}

function generateFriendlyCharacterId(characterName) {
  const base = safeId(characterName) || "character";
  let candidate = base;
  let suffix = 2;
  const existingIds = new Set(allCharacters.map((character) => character.id));
  while (existingIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function groupRowsByRaid(rows) {
  const grouped = new Map();

  rows.forEach((item) => {
    const key = getRaidKey(item);
    if (!grouped.has(key)) {
      grouped.set(key, { key, summary: item, signups: [] });
    }
    grouped.get(key).signups.push(item);
  });

  return Array.from(grouped.values()).sort((left, right) => {
    const leftDate = parseDateOnly(getRaidDateString(left.summary))?.getTime() || 0;
    const rightDate = parseDateOnly(getRaidDateString(right.summary))?.getTime() || 0;
    if (leftDate !== rightDate) {
      return leftDate - rightDate;
    }
    return String(left.summary.raidName || "").localeCompare(String(right.summary.raidName || ""));
  });
}

function parseRaidSlots(raidSize) {
  const matched = String(raidSize || "").match(/^(\d+)-man$/i);
  if (!matched) {
    return 0;
  }
  return Number(matched[1]);
}

function shiftHourFromCst(hourValue, deltaHours) {
  return ((hourValue + deltaHours) % 24 + 24) % 24;
}

function detectViewerTimezoneLabel() {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (!timeZone) {
      return "";
    }

    if (["America/Chicago", "America/Winnipeg", "America/Matamoros"].includes(timeZone)) {
      return "CST";
    }
    if (["America/New_York", "America/Detroit", "America/Toronto"].includes(timeZone)) {
      return "EST";
    }
    if (["America/Denver", "America/Boise", "America/Phoenix"].includes(timeZone)) {
      return "MST";
    }
    if (["America/Los_Angeles", "America/Vancouver", "America/Tijuana"].includes(timeZone)) {
      return "PST";
    }
  } catch {
    return "";
  }

  return "";
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

function renderRaidWindowMultiline(raidStart, raidEnd, options = {}) {
  const { highlightLocal = false } = options;
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
      if (highlightLocal && VIEWER_TIMEZONE_LABEL && zoneLabel === VIEWER_TIMEZONE_LABEL) {
        classes.push("raid-time-local");
      }
      return `<span class="${classes.join(" ")}">${escapeHtml(line)}</span>`;
    })
    .join("");
}

function renderRaidDateWithTime(item) {
  const dateLabel = formatRaidDate(getRaidDateString(item));
  return escapeHtml(dateLabel);
}

function buildRosterMap(items) {
  const counts = new Map();

  items.forEach((item) => {
    if (item.__isSignup === false || !item.characterId) {
      return;
    }
    if (normalizeSignupStatus(item.status) !== "accept") {
      return;
    }
    const key = getRaidKey(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const rosterMap = new Map();
  items.forEach((item) => {
    const key = getRaidKey(item);
    const signed = counts.get(key) || 0;
    const size = parseRaidSlots(item.raidSize);
    const needed = Math.max(0, size - signed);
    let status = "roster-open";
    if (size > 0 && needed === 0) {
      status = "roster-full";
    } else if (size > 0 && signed >= Math.ceil(size / 2)) {
      status = "roster-mid";
    }
    rosterMap.set(key, { signed, size, needed, status });
  });

  return rosterMap;
}

function buildScheduleItems(signups) {
  const signupItems = hydrateRowsWithRaidWindow(signups).map((entry) => ({
    ...entry,
    __isSignup: true
  }));

  const raidsWithSignups = new Set(
    signupItems
      .map((entry) => entry.raidId)
      .filter(Boolean)
  );

  const raidOnlyItems = currentRaids
    .filter((raid) => !raidsWithSignups.has(raid.id))
    .map((raid) => ({
      ...raid,
      raidId: raid.id,
      __isSignup: false
    }));

  return sortRows([...signupItems, ...raidOnlyItems]);
}

function renderRosterProgress(item, rosterMap, signups = []) {
  const key = getRaidKey(item);
  const roster = rosterMap.get(key);
  if (!roster || roster.size <= 0) {
    return "—";
  }

  const totals = buildRoleSummary(signups);
  return `<div class="roster-stack">
      <span class="roster-chip ${roster.status}">${roster.signed}/${roster.size}</span>
      <span class="roster-role-row">
        <span class="roster-role roster-role-tank">🛡 <strong>${totals.Tank}</strong></span>
        <span class="roster-role roster-role-healer">✚ <strong>${totals.Healer}</strong></span>
        <span class="roster-role roster-role-dps">⚔ <strong>${totals.DPS}</strong></span>
      </span>
    </div>`;
}

function buildRoleSummary(signups) {
  const roleTotals = {
    Tank: 0,
    Healer: 0,
    DPS: 0
  };

  signups.forEach((signup) => {
    if (normalizeSignupStatus(signup.status) !== "accept") {
      return;
    }
    const role = signup.mainRole || signup.role;
    if (role in roleTotals) {
      roleTotals[role] += 1;
    }
  });

  return roleTotals;
}

function getCharacterById(characterId) {
  if (!characterId) {
    return null;
  }
  return allCharacters.find((character) => character.id === characterId)
    || currentCharacters.find((character) => character.id === characterId)
    || null;
}

function getProfileLabel(profile) {
  if (!profile) {
    return "";
  }
  const irlName = String(profile.profileName || "").trim();
  const mainCharacter = String(profile.characterName || "").trim();
  if (irlName && mainCharacter) {
    return `${irlName}-${mainCharacter}`;
  }
  return irlName || mainCharacter || String(profile.id || "");
}

function getProfileCharacterEntries(profile) {
  const entries = [];
  if (!profile) {
    return entries;
  }

  entries.push({
    key: "main",
    characterName: profile.characterName || "",
    wowClass: profile.wowClass || "",
    role: profile.role || profile.mainRole || "",
    mainRole: profile.mainRole || profile.role || "",
    offRole: profile.offRole || profile.mainRole || profile.role || "",
    mainSpecialization: profile.mainSpecialization || profile.specialization || "",
    offSpecialization: profile.offSpecialization || "",
    armoryUrl: buildArmoryUrl(profile.characterName || "") || profile.armoryUrl || "",
    logsUrl: buildLogsUrl(profile.characterName || "") || profile.logsUrl || "",
    progressionUrl: profile.progressionUrl || ""
  });

  const alts = Array.isArray(profile.altCharacters) ? profile.altCharacters : [];
  alts.forEach((alt, index) => {
    if (!alt || !alt.characterName) {
      return;
    }
    entries.push({
      key: `alt-${index}`,
      characterName: alt.characterName,
      wowClass: alt.wowClass || "",
      role: alt.mainRole || "",
      mainRole: alt.mainRole || "",
      offRole: alt.offRole || "",
      mainSpecialization: alt.mainSpecialization || "",
      offSpecialization: alt.offSpecialization || "",
      armoryUrl: buildArmoryUrl(alt.characterName || "") || alt.armoryUrl || profile.armoryUrl || "",
      logsUrl: buildLogsUrl(alt.characterName || "") || alt.logsUrl || profile.logsUrl || "",
      progressionUrl: alt.progressionUrl || profile.progressionUrl || ""
    });
  });

  return entries;
}

function findProfileCharacterEntry(profile, characterKey, characterName = "") {
  const entries = getProfileCharacterEntries(profile);
  if (characterKey) {
    const byKey = entries.find((entry) => entry.key === characterKey);
    if (byKey) {
      return byKey;
    }
  }
  if (characterName) {
    const normalizedName = String(characterName || "").trim().toLowerCase();
    const byName = entries.find((entry) => String(entry.characterName || "").trim().toLowerCase() === normalizedName);
    if (byName) {
      return byName;
    }
  }
  return entries[0] || null;
}

function resolveProfileForSignup(signup) {
  const direct = getCharacterById(signup.characterId);
  if (direct) {
    return direct;
  }

  const ownerUid = String(signup.ownerUid || "").trim();
  if (!ownerUid) {
    return null;
  }

  const ownerProfiles = allCharacters.filter((character) => String(character.ownerUid || character.id || "").trim() === ownerUid);
  if (!ownerProfiles.length) {
    return null;
  }

  const targetCharacterName = String(signup.profileCharacterName || signup.characterName || "").trim().toLowerCase();
  if (targetCharacterName) {
    const matchedByCharacter = ownerProfiles.find((profile) =>
      getProfileCharacterEntries(profile).some(
        (entry) => String(entry.characterName || "").trim().toLowerCase() === targetCharacterName
      )
    );
    if (matchedByCharacter) {
      return matchedByCharacter;
    }
  }

  return ownerProfiles[0];
}

function resolveSignupCharacterData(signup) {
  const matchedCharacter = resolveProfileForSignup(signup);
  if (!matchedCharacter) {
    const fallbackCharacterName = signup.profileCharacterName || signup.characterName || "";
    return {
      ...signup,
      characterName: fallbackCharacterName,
      wowClass: signup.wowClass || "",
      role: signup.role || "",
      mainRole: signup.mainRole || signup.role || "",
      offRole: signup.offRole || "",
      mainSpecialization: signup.mainSpecialization || signup.specialization || "",
      offSpecialization: signup.offSpecialization || "",
      specialization: signup.mainSpecialization || signup.specialization || "",
      armoryUrl: buildArmoryUrl(fallbackCharacterName) || signup.armoryUrl || "",
      logsUrl: signup.logsUrl || buildLogsUrl(fallbackCharacterName) || "",
      progressionUrl: signup.progressionUrl || ""
    };
  }

  const selectedEntry = findProfileCharacterEntry(
    matchedCharacter,
    signup.profileCharacterKey,
    signup.profileCharacterName
  );

  return {
    ...signup,
    characterName: selectedEntry?.characterName || signup.profileCharacterName || matchedCharacter.characterName || signup.characterName || "",
    wowClass: selectedEntry?.wowClass || matchedCharacter.wowClass || signup.wowClass || "",
    role: selectedEntry?.role || matchedCharacter.role || signup.role || "",
    mainRole: selectedEntry?.mainRole || matchedCharacter.mainRole || matchedCharacter.role || signup.mainRole || signup.role || "",
    offRole: selectedEntry?.offRole || matchedCharacter.offRole || matchedCharacter.mainRole || matchedCharacter.role || signup.offRole || "",
    mainSpecialization: selectedEntry?.mainSpecialization || matchedCharacter.mainSpecialization || matchedCharacter.specialization || signup.mainSpecialization || signup.specialization || "",
    offSpecialization: selectedEntry?.offSpecialization || matchedCharacter.offSpecialization || signup.offSpecialization || "",
    specialization: selectedEntry?.mainSpecialization || matchedCharacter.specialization || signup.specialization || "",
    armoryUrl: selectedEntry?.armoryUrl
      || buildArmoryUrl(selectedEntry?.characterName || signup.profileCharacterName || matchedCharacter.characterName || signup.characterName || "")
      || matchedCharacter.armoryUrl
      || signup.armoryUrl
      || "",
    logsUrl: selectedEntry?.logsUrl
      || signup.logsUrl
      || buildLogsUrl(selectedEntry?.characterName || signup.profileCharacterName || matchedCharacter.characterName || signup.characterName || "")
      || "",
    progressionUrl: selectedEntry?.progressionUrl || matchedCharacter.progressionUrl || signup.progressionUrl || ""
  };
}

function legacySignupProfileDeleteFields() {
  return {
    characterName: deleteField(),
    armoryUrl: deleteField(),
    progressionUrl: deleteField(),
    wowClass: deleteField(),
    role: deleteField(),
    mainRole: deleteField(),
    offRole: deleteField(),
    preferredDay1: deleteField(),
    preferredStart1: deleteField(),
    preferredEnd1: deleteField(),
    preferredDay2: deleteField(),
    preferredStart2: deleteField(),
    preferredEnd2: deleteField(),
    mainSpecialization: deleteField(),
    offSpecialization: deleteField(),
    specialization: deleteField()
  };
}

function normalizeSignupStatus(value) {
  const normalized = String(value || "").toLowerCase();
  if (SIGNUP_STATUSES.includes(normalized) || normalized === "accept" || normalized === "withdrawn" || normalized === "denied") {
    return normalized;
  }

  const legacyMap = {
    confirmed: "accept",
    benched: "decline",
    late: "decline",
    absent: "decline",
    pending: "requested"
  };

  if (legacyMap[normalized]) {
    return legacyMap[normalized];
  }

  return "tentative";
}

function statusLabel(statusValue) {
  const normalized = normalizeSignupStatus(statusValue);
  const labels = {
    requested: "Request Signup",
    accept: "Accepted",
    tentative: "Bench For Now",
    decline: "Can't Go",
    withdrawn: "Withdrawn",
    denied: "Denied"
  };
  return labels[normalized] || "Not Signed Up";
}

function renderSignupStatusOptions(selectedStatus) {
  const normalizedSelected = normalizeSignupStatus(selectedStatus);
  const options = [...SIGNUP_STATUSES];
  if (normalizedSelected === "accept") {
    options.unshift("accept");
  } else if (normalizedSelected === "denied") {
    options.unshift("denied");
  }

  return options
    .map((status) => {
      const isSelected = status === normalizedSelected;
      return `<option value="${status}" ${isSelected ? "selected" : ""}>${escapeHtml(statusLabel(status))}</option>`;
    })
    .join("");
}

function renderRaidProfileOptions(selectedCharacterId = "", selectedCharacterKey = "") {
  const selectedId = String(selectedCharacterId || "");
  const selectedKey = String(selectedCharacterKey || "");
  return [
    `<option value="">Select character</option>`,
    ...allCharacters.flatMap((profile) => {
      return getProfileCharacterEntries(profile).map((entry) => {
        const value = `${profile.id}::${entry.key}`;
        const isSelected = profile.id === selectedId && entry.key === (selectedKey || "main");
        return `<option value="${escapeHtml(value)}" ${isSelected ? "selected" : ""}>${escapeHtml(entry.characterName)}</option>`;
      });
    })
  ].join("");
}

function parseRaidProfileSelection(value) {
  const raw = String(value || "");
  if (!raw || !raw.includes("::")) {
    return { profileId: "", characterKey: "" };
  }
  const [profileId, characterKey] = raw.split("::", 2);
  return {
    profileId: profileId || "",
    characterKey: characterKey || ""
  };
}

function renderRaidProfileControl(raidId, signup) {
  const selectedCharacterId = signup?.characterId || "";
  const selectedCharacterKey = signup?.profileCharacterKey || "main";
  const signupStatus = normalizeSignupStatus(signup?.status || "");
  const isEditableRequested = Boolean(signup) && signupStatus === "requested";
  const isDisabled = Boolean(signup) && !isEditableRequested;
  return `<select class="raid-profile-select" data-raid-profile-select="true" data-raid-id="${escapeHtml(raidId)}" ${isDisabled ? "disabled" : ""}>
      ${renderRaidProfileOptions(selectedCharacterId, selectedCharacterKey)}
    </select>`;
}

function renderRaidCharacterControl(raidId, signup) {
  if (!raidId) {
    return `<span class="signup-control-disabled">Unavailable</span>`;
  }
  return renderRaidProfileControl(raidId, signup);
}

async function clearRaidSignup(signupId) {
  if (!signupId) {
    return;
  }

  if (isDemoMode) {
    currentRows = sortRows(currentRows.filter((entry) => entry.id !== signupId));
    saveDemoRows(currentRows);
    renderRows(currentRows);
    return;
  }

  await deleteDoc(doc(db, "signups", signupId));
  currentRows = sortRows(currentRows.filter((entry) => entry.id !== signupId));
  renderRows(currentRows);
}

function renderRaidSignupControl(raidId, signup) {
  if (!raidId) {
    return `<span class="signup-control-disabled">Unavailable</span>`;
  }

  const hasSignup = Boolean(signup);
  const selectedStatus = hasSignup ? normalizeSignupStatus(signup.status) : "";
  const isAccepted = selectedStatus === "accept";
  const isDenied = selectedStatus === "denied";
  const initialOption = isAccepted ? "" : `<option value="">Not Signed Up</option>`;
  const statusClass = selectedStatus ? `status-${selectedStatus}` : "status-none";
  const hasProfiles = allCharacters.length > 0;
  const selectOptions = isAccepted
    ? [
      `<option value="accept" selected>Accepted (Admin)</option>`,
      `<option value="withdrawn">Withdrawn</option>`
    ].join("")
    : isDenied
      ? [
        `<option value="denied" selected>Denied (Admin)</option>`,
        `<option value="requested">Request Signup</option>`
      ].join("")
    : renderSignupStatusOptions(selectedStatus);
  const isSelectDisabled = !hasProfiles && !hasSignup;

  return `<select class="raid-signup-select ${statusClass}" data-raid-signup-select="true" data-raid-id="${escapeHtml(raidId)}" data-signup-id="${escapeHtml(signup?.id || "")}" ${isSelectDisabled ? "disabled" : ""}>
      ${initialOption}
      ${selectOptions}
    </select>`;
}

function applySignupSelectStatusClass(selectElement, statusValue) {
  const statusClasses = ["status-accept", "status-tentative", "status-decline", "status-withdrawn", "status-denied", "status-none"];
  selectElement.classList.remove(...statusClasses);
  const normalized = normalizeSignupStatus(statusValue);
  if (!statusValue) {
    selectElement.classList.add("status-none");
    return;
  }
  selectElement.classList.add(`status-${normalized}`);
}

async function updateSignupStatus(signupId, nextStatus) {
  if (!signupId) {
    return;
  }

  const normalizedStatus = normalizeSignupStatus(nextStatus);
  const existingEntry = currentRows.find((entry) => entry.id === signupId);
  if (!existingEntry) {
    throw new Error("Signup record not found.");
  }
  const normalizedPayload = normalizeSignupPayloadForRules(existingEntry);
  if (!normalizedPayload) {
    throw new Error("Signup has invalid raid data. Re-select this raid and save again.");
  }

  if (isDemoMode) {
    currentRows = currentRows.map((entry) =>
      entry.id === signupId
        ? { ...entry, status: normalizedStatus, updatedAt: new Date().toISOString() }
        : entry
    );
    currentRows = sortRows(currentRows);
    saveDemoRows(currentRows);
    renderRows(currentRows);
    setMessage(formMessage, `Signup status set to ${statusLabel(normalizedStatus)} (demo mode).`);
    return;
  }

  await updateDoc(doc(db, "signups", signupId), {
    phase: normalizedPayload.phase,
    raidStart: normalizedPayload.raidStart,
    raidEnd: normalizedPayload.raidEnd,
    ownerUid: isDemoMode ? "demo-local" : authUid,
    status: normalizedStatus,
    ...legacySignupProfileDeleteFields(),
    updatedAt: serverTimestamp()
  });
  currentRows = currentRows.map((entry) =>
    entry.id === signupId
      ? { ...entry, status: normalizedStatus, updatedAt: new Date().toISOString() }
      : entry
  );
  currentRows = sortRows(currentRows);
  renderRows(currentRows);
  setMessage(formMessage, `Signup status set to ${statusLabel(normalizedStatus)}.`);
}

async function createRaidSignup(raid, selectedProfile, selectedCharacterEntry, statusValue) {
  const normalizedStatus = normalizeSignupStatus(statusValue);
  const rawPayload = {
    characterId: selectedProfile.id,
    profileCharacterKey: selectedCharacterEntry.key,
    profileCharacterName: selectedCharacterEntry.characterName,
    raidId: raid.id,
    raidDate: raid.raidDate,
    raidName: raid.raidName,
    phase: raid.phase,
    runType: raid.runType,
    raidSize: raid.raidSize,
    raidStart: raid.raidStart,
    raidEnd: raid.raidEnd,
    status: normalizedStatus,
    ownerUid: isDemoMode ? "demo-local" : authUid,
    updatedAt: serverTimestamp()
  };
  const payload = normalizeSignupPayloadForRules(rawPayload);
  if (!payload) {
    throw new Error("Selected raid has invalid schedule data. Please edit and re-save the raid in Admin Panel.");
  }

  if (isDemoMode) {
    currentRows.push({
      id: typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `demo-${Date.now()}`,
      ...payload,
      createdAt: new Date().toISOString()
    });
    currentRows = sortRows(currentRows);
    saveDemoRows(currentRows);
    renderRows(currentRows);
    return;
  }

  const createdDoc = await addDoc(collection(db, "signups"), {
    ...payload,
    createdAt: serverTimestamp()
  });

  currentRows.push({
    id: createdDoc.id,
    ...payload,
    createdAt: new Date().toISOString()
  });
  currentRows = sortRows(currentRows);
  renderRows(currentRows);
}

async function upsertRaidSignupForProfile(existingSignup, raid, selectedProfile, selectedCharacterEntry, statusValue) {
  const normalizedStatus = normalizeSignupStatus(statusValue);
  const rawPayload = {
    characterId: selectedProfile.id,
    profileCharacterKey: selectedCharacterEntry.key,
    profileCharacterName: selectedCharacterEntry.characterName,
    raidId: raid.id,
    raidDate: raid.raidDate,
    raidName: raid.raidName,
    phase: raid.phase,
    runType: raid.runType,
    raidSize: raid.raidSize,
    raidStart: raid.raidStart,
    raidEnd: raid.raidEnd,
    status: normalizedStatus,
    ownerUid: isDemoMode ? "demo-local" : authUid,
    updatedAt: serverTimestamp()
  };
  const payload = normalizeSignupPayloadForRules(rawPayload);
  if (!payload) {
    throw new Error("Selected raid has invalid schedule data. Please edit and re-save the raid in Admin Panel.");
  }

  if (isDemoMode) {
    currentRows = currentRows.map((entry) =>
      entry.id === existingSignup.id
        ? { ...entry, ...payload, updatedAt: new Date().toISOString() }
        : entry
    );
    currentRows = sortRows(currentRows);
    saveDemoRows(currentRows);
    renderRows(currentRows);
    return;
  }

  await updateDoc(doc(db, "signups", existingSignup.id), {
    ...payload,
    ...legacySignupProfileDeleteFields()
  });

  currentRows = currentRows.map((entry) =>
    entry.id === existingSignup.id
      ? { ...entry, ...payload, updatedAt: new Date().toISOString() }
      : entry
  );
  currentRows = sortRows(currentRows);
  renderRows(currentRows);
}

function getViewerOwnerUid() {
  return isDemoMode ? "demo-local" : authUid;
}

function findRaidFromSummary(summaryItem) {
  if (summaryItem.raidId) {
    const directMatch = currentRaids.find((raid) => raid.id === summaryItem.raidId);
    if (directMatch) {
      return directMatch;
    }
  }

  return currentRaids.find((raid) =>
    raid.raidName === summaryItem.raidName
    && raid.raidDate === getRaidDateString(summaryItem)
    && Number(raid.phase) === Number(summaryItem.phase)
  ) || null;
}

function renderRoleSummary(signups) {
  const totals = buildRoleSummary(signups);
  const roleOrder = ["Tank", "Healer", "DPS"];
  const chips = roleOrder
    .map((roleName) => `<span class="role-chip role-${roleName.toLowerCase()}"><strong>${totals[roleName]}</strong> ${ROLE_ICONS[roleName]} ${roleName}</span>`)
    .join("");

  return `<div class="role-summary">
      <span class="role-summary-label">Role Totals</span>
      <div class="role-chip-row">${chips}</div>
    </div>`;
}

function getSpecsForSelection(className, roleName) {
  const classSpecs = TBC_SPECS_BY_CLASS_ROLE[className] || {};
  return classSpecs[roleName] || [];
}

function getRolesForClass(className) {
  const classSpecs = TBC_SPECS_BY_CLASS_ROLE[className] || {};
  return Object.keys(classSpecs);
}

function buildRoleSelectOptions(selectedRole = "", className = "") {
  const classRoles = getRolesForClass(className);
  const roles = classRoles.length ? classRoles : ["Tank", "Healer", "DPS"];
  if (roles.length === 1) {
    const roleName = roles[0];
    return [`<option value="${roleName}" selected>${ROLE_ICONS[roleName]} ${roleName}</option>`].join("");
  }
  return [
    `<option value="">Select role</option>`,
    ...roles.map((roleName) => `<option value="${roleName}" ${selectedRole === roleName ? "selected" : ""}>${ROLE_ICONS[roleName]} ${roleName}</option>`)
  ].join("");
}

function applyRoleSelectBehavior(selectElement, className, selectedRole = "") {
  if (!(selectElement instanceof HTMLSelectElement)) {
    return;
  }

  const classRoles = getRolesForClass(className);
  const roles = classRoles.length ? classRoles : ["Tank", "Healer", "DPS"];
  if (roles.length === 1) {
    const lockedRole = roles[0];
    selectElement.innerHTML = buildRoleSelectOptions(lockedRole, className);
    selectElement.value = lockedRole;
    selectElement.disabled = true;
    selectElement.classList.add("role-locked");
    return;
  }

  const preferredRole = roles.includes(selectedRole) ? selectedRole : "";
  selectElement.innerHTML = buildRoleSelectOptions(preferredRole, className);
  selectElement.value = preferredRole;
  selectElement.disabled = false;
  selectElement.classList.remove("role-locked");
}

function decorateClassSelectOptions(selectElement) {
  if (!(selectElement instanceof HTMLSelectElement)) {
    return;
  }

  Array.from(selectElement.options).forEach((option) => {
    if (!option.value || !WOW_CLASS_COLORS[option.value]) {
      return;
    }
    option.style.color = WOW_CLASS_COLORS[option.value];
    option.style.fontWeight = "600";
  });
}

function buildAltSpecOptions(className, roleName, selectedSpec = "") {
  const specs = getSpecsForSelection(className, roleName);
  const placeholder = specs.length
    ? `<option value="">Select specialization</option>`
    : `<option value="">No spec for class/role</option>`;
  const options = specs
    .map((spec) => `<option value="${escapeHtml(spec)}" ${selectedSpec === spec ? "selected" : ""}>${escapeHtml(spec)}</option>`)
    .join("");
  return `${placeholder}${options}`;
}

function refreshAltCharacterTitles() {
  const cards = Array.from(altCharactersContainer.querySelectorAll(".alt-character-card"));
  cards.forEach((card, index) => {
    const summary = card.querySelector("summary");
    if (summary) {
      summary.textContent = `Alt Character ${index + 1}`;
    }
  });
}

function syncAltCardSpecs(card) {
  const classSelect = card.querySelector(".alt-class");
  const mainRoleSelect = card.querySelector(".alt-main-role");
  const offRoleSelect = card.querySelector(".alt-off-role");
  const mainSpecSelect = card.querySelector(".alt-main-spec");
  const offSpecSelect = card.querySelector(".alt-off-spec");

  if (!(classSelect instanceof HTMLSelectElement)
    || !(mainRoleSelect instanceof HTMLSelectElement)
    || !(offRoleSelect instanceof HTMLSelectElement)
    || !(mainSpecSelect instanceof HTMLSelectElement)
    || !(offSpecSelect instanceof HTMLSelectElement)) {
    return;
  }

  const existingMainSpec = mainSpecSelect.value;
  const existingOffSpec = offSpecSelect.value;
  const existingMainRole = mainRoleSelect.value;
  const existingOffRole = offRoleSelect.value;

  const selectedClass = classSelect.value;
  classSelect.dataset.wowClass = selectedClass ? selectedClass.toLowerCase() : "";
  const classColor = WOW_CLASS_COLORS[selectedClass] || "";
  if (classColor) {
    classSelect.style.setProperty("--selected-class-color", classColor);
  } else {
    classSelect.style.removeProperty("--selected-class-color");
  }

  applyRoleSelectBehavior(mainRoleSelect, selectedClass, existingMainRole);
  applyRoleSelectBehavior(offRoleSelect, selectedClass, existingOffRole);

  mainSpecSelect.innerHTML = buildAltSpecOptions(classSelect.value, mainRoleSelect.value, existingMainSpec);
  offSpecSelect.innerHTML = buildAltSpecOptions(classSelect.value, offRoleSelect.value, existingOffSpec);
}

function createAltCharacterCard(initialAlt = {}) {
  const card = document.createElement("details");
  card.className = "alt-character-card";
  card.open = true;

  const classOptions = ["Druid", "Hunter", "Mage", "Paladin", "Priest", "Rogue", "Shaman", "Warlock", "Warrior"]
    .map((className) => `<option value="${className}" ${initialAlt.wowClass === className ? "selected" : ""}>${className}</option>`)
    .join("");

  card.innerHTML = `
    <summary>Alt Character</summary>
    <div class="alt-character-grid">
      <label>
        Character Name
        <input type="text" class="alt-name" maxlength="24" value="${escapeHtml(initialAlt.characterName || "")}" />
      </label>
      <label>
        Class
        <select class="alt-class">
          <option value="">Select class</option>
          ${classOptions}
        </select>
      </label>
      <fieldset class="spec-role-group alt-main-setup">
        <legend>Main Setup (MS)</legend>
        <label>
          Main Role
          <select class="alt-main-role">${buildRoleSelectOptions(initialAlt.mainRole || "", initialAlt.wowClass || "")}</select>
        </label>
        <label>
          Main Specialization
          <select class="alt-main-spec"></select>
        </label>
      </fieldset>
      <fieldset class="spec-role-group alt-off-setup">
        <legend>Off Setup (OS)</legend>
        <label>
          Off Role
          <select class="alt-off-role">${buildRoleSelectOptions(initialAlt.offRole || "", initialAlt.wowClass || "")}</select>
        </label>
        <label>
          Off Specialization
          <select class="alt-off-spec"></select>
        </label>
      </fieldset>
      <button type="button" class="danger alt-remove-button alt-wide">Remove Alt</button>
    </div>
  `;

  const classSelect = card.querySelector(".alt-class");
  const mainRoleSelect = card.querySelector(".alt-main-role");
  const offRoleSelect = card.querySelector(".alt-off-role");
  const removeButton = card.querySelector(".alt-remove-button");
  const mainSpecSelect = card.querySelector(".alt-main-spec");
  const offSpecSelect = card.querySelector(".alt-off-spec");

  if (classSelect instanceof HTMLSelectElement) {
    decorateClassSelectOptions(classSelect);
    classSelect.addEventListener("change", () => syncAltCardSpecs(card));
  }
  if (mainRoleSelect instanceof HTMLSelectElement) {
    mainRoleSelect.addEventListener("change", () => syncAltCardSpecs(card));
  }
  if (offRoleSelect instanceof HTMLSelectElement) {
    offRoleSelect.addEventListener("change", () => syncAltCardSpecs(card));
  }
  if (removeButton instanceof HTMLButtonElement) {
    removeButton.addEventListener("click", () => {
      card.remove();
      refreshAltCharacterTitles();
    });
  }

  syncAltCardSpecs(card);
  if (mainSpecSelect instanceof HTMLSelectElement && initialAlt.mainSpecialization) {
    mainSpecSelect.value = initialAlt.mainSpecialization;
  }
  if (offSpecSelect instanceof HTMLSelectElement && initialAlt.offSpecialization) {
    offSpecSelect.value = initialAlt.offSpecialization;
  }
  altCharactersContainer.appendChild(card);
  refreshAltCharacterTitles();
}

function resetAltCharacters(alts = []) {
  if (!altCharactersContainer) {
    return;
  }
  altCharactersContainer.innerHTML = "";
  alts.forEach((alt) => createAltCharacterCard(alt));
}

function collectAltCharacters() {
  if (!altCharactersContainer) {
    return { alts: [], error: "" };
  }

  const cards = Array.from(altCharactersContainer.querySelectorAll(".alt-character-card"));
  const alts = [];

  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    const nameInput = card.querySelector(".alt-name");
    const classSelect = card.querySelector(".alt-class");
    const mainRoleSelect = card.querySelector(".alt-main-role");
    const mainSpecSelect = card.querySelector(".alt-main-spec");
    const offRoleSelect = card.querySelector(".alt-off-role");
    const offSpecSelect = card.querySelector(".alt-off-spec");

    if (!(nameInput instanceof HTMLInputElement)
      || !(classSelect instanceof HTMLSelectElement)
      || !(mainRoleSelect instanceof HTMLSelectElement)
      || !(mainSpecSelect instanceof HTMLSelectElement)
      || !(offRoleSelect instanceof HTMLSelectElement)
      || !(offSpecSelect instanceof HTMLSelectElement)) {
      continue;
    }

    const characterName = nameInput.value.trim();
    const wowClass = classSelect.value;
    const mainRole = mainRoleSelect.value;
    const offRole = offRoleSelect.value;
    const mainSpecialization = mainSpecSelect.value;
    const offSpecialization = offSpecSelect.value;

    const allEmpty = !characterName && !wowClass && !mainRole && !offRole && !mainSpecialization && !offSpecialization;
    if (allEmpty) {
      continue;
    }

    if (!characterName || !wowClass || !mainRole || !offRole || !mainSpecialization || !offSpecialization) {
      return { alts: [], error: `Alt Character ${index + 1} is incomplete. Fill all MS/OS fields.` };
    }

    alts.push({
      characterName,
      wowClass,
      mainRole,
      offRole,
      mainSpecialization,
      offSpecialization
    });
  }

  return { alts, error: "" };
}

function getSpecLabel(specName) {
  const icon = SPEC_ICONS[specName] || "✦";
  const selectedClass = fields.wowClass.value || "Class";
  return `${icon} ${specName} - ${selectedClass}`;
}

function decorateClassOptions() {
  Array.from(fields.wowClass.options).forEach((option) => {
    if (!option.value || !WOW_CLASS_COLORS[option.value]) {
      return;
    }
    option.style.color = WOW_CLASS_COLORS[option.value];
    option.style.fontWeight = "600";
  });
}

function toggleClassMenu(forceOpen) {
  if (!wowClassPicker || !wowClassMenu || !wowClassTrigger) {
    return;
  }

  const shouldOpen = typeof forceOpen === "boolean"
    ? forceOpen
    : wowClassMenu.hidden;

  wowClassMenu.hidden = !shouldOpen;
  wowClassPicker.dataset.open = shouldOpen ? "true" : "false";
  wowClassTrigger.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
}

function initializeClassPicker() {
  if (!wowClassPicker || !wowClassTrigger || !wowClassMenu) {
    return;
  }

  const classOptions = Array.from(fields.wowClass.options).filter((option) => option.value);
  wowClassMenu.innerHTML = classOptions
    .map((option) => {
      const className = option.value;
      const classColor = WOW_CLASS_COLORS[className] || "#e8dcc3";
      return `<button
        type="button"
        class="wow-class-option"
        data-value="${escapeHtml(className)}"
        role="option"
        style="--class-color: ${classColor};"
      >${escapeHtml(className)}</button>`;
    })
    .join("");
  wowClassMenu.hidden = true;
  wowClassPicker.dataset.open = "false";
  wowClassTrigger.setAttribute("aria-expanded", "false");

  wowClassTrigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleClassMenu();
  });

  wowClassMenu.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const optionButton = target.closest(".wow-class-option");
    if (!(optionButton instanceof HTMLButtonElement)) {
      return;
    }

    const selectedClass = optionButton.dataset.value || "";
    fields.wowClass.value = selectedClass;
    fields.wowClass.dispatchEvent(new Event("change", { bubbles: true }));
    toggleClassMenu(false);
    wowClassTrigger.focus();
  });

  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    if (!wowClassPicker.contains(target)) {
      toggleClassMenu(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      toggleClassMenu(false);
    }
  });
}

function decorateRoleOptions() {
  [fields.mainRole, fields.offRole].forEach((roleField) => {
    Array.from(roleField.options).forEach((option) => {
      if (!option.value || !ROLE_ICONS[option.value]) {
        return;
      }
      option.textContent = `${ROLE_ICONS[option.value]} ${option.value}`;
    });
  });
}

function syncClassVisualTheme() {
  const selectedClass = fields.wowClass.value;
  const classKey = selectedClass ? selectedClass.toLowerCase() : "";
  const classColor = WOW_CLASS_COLORS[selectedClass] || "";

  fields.wowClass.dataset.wowClass = classKey;
  fields.mainSpecialization.dataset.wowClass = classKey;
  fields.offSpecialization.dataset.wowClass = classKey;

  if (classColor) {
    fields.wowClass.style.setProperty("--selected-class-color", classColor);
    fields.mainSpecialization.style.setProperty("--selected-class-color", classColor);
    fields.offSpecialization.style.setProperty("--selected-class-color", classColor);
    if (wowClassTrigger) {
      wowClassTrigger.style.setProperty("--selected-class-color", classColor);
    }
  } else {
    fields.wowClass.style.removeProperty("--selected-class-color");
    fields.mainSpecialization.style.removeProperty("--selected-class-color");
    fields.offSpecialization.style.removeProperty("--selected-class-color");
    if (wowClassTrigger) {
      wowClassTrigger.style.removeProperty("--selected-class-color");
    }
  }

  if (wowClassTriggerText) {
    wowClassTriggerText.textContent = selectedClass || "Select class";
  }

  if (wowClassMenu) {
    Array.from(wowClassMenu.querySelectorAll(".wow-class-option")).forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }
      const isSelected = button.dataset.value === selectedClass;
      button.classList.toggle("active", isSelected);
      button.setAttribute("aria-selected", isSelected ? "true" : "false");
    });
  }
}

function buildSpecializationOptions(roleValue) {
  const specs = getSpecsForSelection(fields.wowClass.value, roleValue);
  const placeholder = specs.length
    ? `<option value="">Select specialization</option>`
    : `<option value="">No spec for class/role</option>`;
  return {
    specs,
    html: `${placeholder}${specs
      .map((spec) => `<option value="${escapeHtml(spec)}">${escapeHtml(getSpecLabel(spec))}</option>`)
      .join("")}`
  };
}

function refreshRoleOptionsForClass(className, selectedMainRole = "", selectedOffRole = "") {
  const mainRoleValue = selectedMainRole || fields.mainRole.value;
  const offRoleValue = selectedOffRole || fields.offRole.value;
  applyRoleSelectBehavior(fields.mainRole, className, mainRoleValue);
  applyRoleSelectBehavior(fields.offRole, className, offRoleValue);
}

function refreshSpecializationOptions(selectedMainSpec = "", selectedOffSpec = "") {
  const mainOptions = buildSpecializationOptions(fields.mainRole.value);
  const offOptions = buildSpecializationOptions(fields.offRole.value);

  fields.mainSpecialization.innerHTML = mainOptions.html;
  fields.offSpecialization.innerHTML = offOptions.html;

  if (selectedMainSpec && mainOptions.specs.includes(selectedMainSpec)) {
    fields.mainSpecialization.value = selectedMainSpec;
  }

  if (selectedOffSpec && offOptions.specs.includes(selectedOffSpec)) {
    fields.offSpecialization.value = selectedOffSpec;
  }
}

function isProfileSetupComplete() {
  const profileName = fields.profileName.value.trim();
  const characterName = fields.characterName.value.trim();
  const wowClass = fields.wowClass.value;
  const mainRole = fields.mainRole.value;
  const offRole = fields.offRole.value;
  const mainSpecialization = fields.mainSpecialization.value;
  const offSpecialization = fields.offSpecialization.value;
  const mainSpecializationOptions = getSpecsForSelection(wowClass, mainRole);
  const offSpecializationOptions = getSpecsForSelection(wowClass, offRole);

  return (
    Boolean(profileName)
    && Boolean(characterName)
    && Boolean(wowClass)
    && Boolean(mainRole)
    && Boolean(offRole)
    && Boolean(mainSpecialization)
    && Boolean(offSpecialization)
    && mainSpecializationOptions.includes(mainSpecialization)
    && offSpecializationOptions.includes(offSpecialization)
  );
}

function hasValidPreferredTimes() {
  const preferredDay1 = fields.preferredDay1.value;
  const preferredStart1 = parseHourValue(fields.preferredStart1.value);
  const preferredEnd1 = parseHourValue(fields.preferredEnd1.value);
  const preferredDay2 = fields.preferredDay2.value;
  const preferredStart2 = parseHourValue(fields.preferredStart2.value);
  const preferredEnd2 = parseHourValue(fields.preferredEnd2.value);

  return (
    Boolean(preferredDay1)
    && Boolean(preferredDay2)
    && Number.isInteger(preferredStart1)
    && Number.isInteger(preferredEnd1)
    && Number.isInteger(preferredStart2)
    && Number.isInteger(preferredEnd2)
    && preferredStart1 < preferredEnd1
    && preferredStart2 < preferredEnd2
  );
}

function updateSignupGate() {
  const profileReady = isProfileSetupComplete();
  const preferredTimesReady = hasValidPreferredTimes();
  const timeFields = [
    fields.preferredDay1,
    fields.preferredStart1,
    fields.preferredEnd1,
    fields.preferredDay2,
    fields.preferredStart2,
    fields.preferredEnd2
  ];

  timeFields.forEach((element) => {
    element.disabled = !profileReady;
  });

  if (saveProfileButton) {
    saveProfileButton.disabled = !profileReady || !preferredTimesReady;
  }
}

function updateSignupActionState() {
  if (!saveButton) {
    return;
  }

  const hasSelectedProfile = Boolean(getSelectedCharacterProfile());
  const hasSelectedRaid = Boolean(selectedRaidIdInput.value);
  const editingSignup = Boolean(signupIdInput.value);
  saveButton.disabled = !(hasSelectedProfile && (hasSelectedRaid || editingSignup));
}

function loadDemoCharacters() {
  try {
    const raw = window.localStorage.getItem(DEMO_CHARACTER_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDemoCharacters(characters) {
  window.localStorage.setItem(DEMO_CHARACTER_STORAGE_KEY, JSON.stringify(characters));
}

function sortCharacters(characters) {
  return [...characters].sort((left, right) =>
    String(getProfileLabel(left)).localeCompare(String(getProfileLabel(right)))
  );
}

function normalizeAltCharacters(alts) {
  if (!Array.isArray(alts)) {
    return [];
  }

  return alts
    .map((alt) => ({
      characterName: String(alt.characterName || "").trim(),
      wowClass: String(alt.wowClass || "").trim(),
      mainRole: String(alt.mainRole || "").trim(),
      offRole: String(alt.offRole || "").trim(),
      mainSpecialization: String(alt.mainSpecialization || "").trim(),
      offSpecialization: String(alt.offSpecialization || "").trim()
    }))
    .filter((alt) =>
      alt.characterName
      && alt.wowClass
      && alt.mainRole
      && alt.offRole
      && alt.mainSpecialization
      && alt.offSpecialization
    );
}

async function upsertCharacterProfile(profile, selectedCharacterId) {
  const normalizedProfile = {
    ...profile,
    altCharacters: normalizeAltCharacters(profile.altCharacters)
  };

  if (isDemoMode) {
    if (selectedCharacterId) {
      currentCharacters = currentCharacters.map((character) =>
        character.id === selectedCharacterId ? { ...character, ...normalizedProfile } : character
      );
      currentCharacters = sortCharacters(currentCharacters);
      allCharacters = sortCharacters(currentCharacters);
      saveDemoCharacters(currentCharacters);
      return selectedCharacterId;
    }

    const existing = currentCharacters.find(
      (character) =>
        String(character.profileName || "").toLowerCase() === String(profile.profileName || "").toLowerCase()
    );
    if (existing) {
      currentCharacters = currentCharacters.map((character) =>
        character.id === existing.id ? { ...character, ...normalizedProfile } : character
      );
      currentCharacters = sortCharacters(currentCharacters);
      allCharacters = sortCharacters(currentCharacters);
      saveDemoCharacters(currentCharacters);
      return existing.id;
    }

    const newId = generateFriendlyCharacterId(normalizedProfile.profileName || normalizedProfile.characterName);
    currentCharacters = sortCharacters([{ id: newId, ...normalizedProfile }, ...currentCharacters]);
    allCharacters = sortCharacters(currentCharacters);
    saveDemoCharacters(currentCharacters);
    return newId;
  }

  if (!db || !authUid) {
    throw new Error("Cannot save character profile yet.");
  }

  if (selectedCharacterId) {
    await updateDoc(doc(db, "characters", selectedCharacterId), {
      ...normalizedProfile,
      ownerUid: authUid,
      ownerEmail: authEmail || "",
      updatedAt: serverTimestamp()
    });
    return selectedCharacterId;
  }

  const newId = generateFriendlyCharacterId(normalizedProfile.profileName || normalizedProfile.characterName);
  await setDoc(doc(db, "characters", newId), {
    ...normalizedProfile,
    ownerUid: authUid,
    ownerEmail: authEmail || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return newId;
}

function refreshCharacterProfileOptions(selectedValue = "") {
  const options = [
    `<option value="">Select profile</option>`,
    ...allCharacters.map(
      (character) =>
        `<option value="${character.id}">${escapeHtml(getProfileLabel(character))} (${escapeHtml(
          character.characterName
        )} ${escapeHtml(
          character.wowClass
        )} ${escapeHtml(character.role)})</option>`
    )
  ];

  characterProfileSelect.innerHTML = options.join("");
  const hasSelectedCharacter = allCharacters.some((character) => character.id === selectedValue);
  characterProfileSelect.value = hasSelectedCharacter ? selectedValue : "";
  updateSignupActionState();
}

function loadCharacterIntoForm(character) {
  if (!character) {
    return;
  }

  fields.profileName.value = character.profileName || "";
  fields.characterName.value = character.characterName || "";
  fields.wowClass.value = character.wowClass || "";
  fields.mainRole.value = character.mainRole || character.role || "";
  fields.offRole.value = character.offRole || character.mainRole || character.role || "";
  fields.preferredDay1.value = character.preferredDay1 || "";
  fields.preferredStart1.value = Number.isInteger(character.preferredStart1)
    ? String(character.preferredStart1)
    : "";
  fields.preferredEnd1.value = Number.isInteger(character.preferredEnd1)
    ? String(character.preferredEnd1)
    : "";
  fields.preferredDay2.value = character.preferredDay2 || "";
  fields.preferredStart2.value = Number.isInteger(character.preferredStart2)
    ? String(character.preferredStart2)
    : "";
  fields.preferredEnd2.value = Number.isInteger(character.preferredEnd2)
    ? String(character.preferredEnd2)
    : "";
  refreshRoleOptionsForClass(
    fields.wowClass.value,
    character.mainRole || character.role || "",
    character.offRole || character.mainRole || character.role || ""
  );
  syncClassVisualTheme();
  refreshSpecializationOptions(
    character.mainSpecialization || character.specialization || "",
    character.offSpecialization || ""
  );
  resetAltCharacters(Array.isArray(character.altCharacters) ? character.altCharacters : []);
  updateSignupGate();
}

function setCharacterModeNew() {
  fields.profileName.value = "";
  fields.characterName.value = "";
  fields.wowClass.value = "";
  fields.mainRole.value = "";
  fields.offRole.value = "";
  fields.preferredDay1.value = "";
  fields.preferredStart1.value = "";
  fields.preferredEnd1.value = "";
  fields.preferredDay2.value = "";
  fields.preferredStart2.value = "";
  fields.preferredEnd2.value = "";
  refreshRoleOptionsForClass("", "", "");
  syncClassVisualTheme();
  refreshSpecializationOptions("", "");
  resetAltCharacters([]);
  updateSignupGate();
}

function openProfileModal(mode) {
  profileModalMode = mode;
  if (deleteProfileButton) {
    deleteProfileButton.hidden = mode !== "edit";
  }

  if (mode === "edit") {
    const selectedCharacter = getSelectedCharacterProfile();
    if (!selectedCharacter) {
      setMessage(formMessage, "Select a profile first, then click Edit Profile.", true);
      return;
    }
    profileModalHeading.textContent = `Edit Profile - ${getProfileLabel(selectedCharacter)}`;
    loadCharacterIntoForm(selectedCharacter);
  } else {
    profileModalHeading.textContent = "Create Profile";
    setCharacterModeNew();
  }

  if (profileModal && typeof profileModal.showModal === "function") {
    profileModal.showModal();
  }
  fields.characterName.focus();
}

function closeProfileModal() {
  if (profileModal && typeof profileModal.close === "function") {
    profileModal.close();
  }
}

function setAdminRaidVisibility() {
  if (!hasAdminUI || !adminRaidSection) {
    return;
  }
  adminRaidSection.hidden = !isAdmin;
}

function setAdminNavVisibility() {
  if (adminMenu) {
    adminMenu.hidden = !isAdmin;
  }
  if (adminRaidsLink) {
    adminRaidsLink.hidden = !isAdmin;
  }
  if (adminOpsLink) {
    adminOpsLink.hidden = !isAdmin;
  }
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

function updateAdminOpsPendingBadge(rows = []) {
  if (!adminOpsBadge || !isAdmin) {
    return;
  }

  const pendingCount = rows.filter((entry) => normalizeSignupStatus(entry.status) === "requested").length;
  adminOpsBadge.textContent = String(pendingCount);
  adminOpsBadge.hidden = pendingCount <= 0;
}

function populateRaidPhaseOptions() {
  if (!hasAdminUI) {
    return;
  }
  const phaseOptions = Object.keys(RAID_PRESETS_BY_PHASE)
    .sort((left, right) => Number(left) - Number(right))
    .map((phaseKey) => `<option value="${phaseKey}">Phase ${phaseKey}</option>`)
    .join("");

  raidPhaseInput.innerHTML = phaseOptions;
  if (!raidPhaseInput.value) {
    raidPhaseInput.value = "1";
  }
}

function refreshRaidTemplateOptions(selectedRaid = "") {
  if (!hasAdminUI) {
    return;
  }
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

function syncRaidSize() {
  if (!hasAdminUI) {
    return;
  }
  const selectedPhase = Number(raidPhaseInput.value);
  const selectedRaid = raidTemplateInput.value;
  const phaseRaids = RAID_PRESETS_BY_PHASE[selectedPhase] || [];
  const matched = phaseRaids.find((raid) => raid.name === selectedRaid);
  raidSizeInput.value = matched ? `${matched.size}-man` : "";
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

function renderAdminRaids(items) {
  if (!hasAdminUI) {
    return;
  }
  if (!isAdmin) {
    raidAdminRows.innerHTML = "";
    setMessage(raidAdminMessage, "");
    return;
  }

  if (!items.length) {
    raidAdminRows.innerHTML = `<tr><td colspan="7">No raids created yet.</td></tr>`;
    setMessage(raidAdminMessage, "");
    return;
  }

  raidAdminRows.innerHTML = items
    .map((item) => {
      const windowText = renderRaidWindowMultiline(item.raidStart, item.raidEnd);
      return `<tr>
        <td>${escapeHtml(`Phase ${String(item.phase)}`)}</td>
        <td>${escapeHtml(item.raidName)}</td>
        <td>${escapeHtml(formatMonthDayYear(item.raidDate))}</td>
        <td class="raid-time-cell">${windowText}</td>
        <td>${escapeHtml(item.runType)}</td>
        <td>${escapeHtml(item.raidSize || "—")}</td>
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

function resetRaidForm() {
  if (!hasAdminUI) {
    return;
  }
  raidIdInput.value = "";
  saveRaidButton.textContent = "Save Raid";
  cancelRaidEditButton.hidden = true;
  raidForm.reset();
  populateRaidPhaseOptions();
  refreshRaidTemplateOptions();
  raidEventDateInput.value = toDateOnlyString(new Date());
  setMessage(raidAdminMessage, "");
}

function loadRaidForm(item) {
  if (!hasAdminUI) {
    return;
  }
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
}

function legacyHourFromArray(hours) {
  if (!Array.isArray(hours) || !hours.length) {
    return null;
  }
  const parsed = hours
    .map((hourItem) => Number(String(hourItem).slice(0, 2)))
    .filter((hourItem) => Number.isInteger(hourItem) && hourItem >= 0 && hourItem <= 23)
    .sort((left, right) => left - right);

  if (!parsed.length) {
    return null;
  }

  const start = parsed[0];
  const end = Math.min(24, parsed[parsed.length - 1] + 1);
  return { start, end };
}

function migrateLegacySlot(item, slotNumber) {
  const dayKey = `preferredDay${slotNumber}`;
  const startKey = `preferredStart${slotNumber}`;
  const endKey = `preferredEnd${slotNumber}`;
  const hoursKey = `preferredHours${slotNumber}`;

  const directDay = item[dayKey] || "";
  const directStart = parseHourValue(String(item[startKey] ?? ""));
  const directEnd = parseHourValue(String(item[endKey] ?? ""));

  if (directDay && Number.isInteger(directStart) && Number.isInteger(directEnd)) {
    return { day: directDay, start: directStart, end: directEnd };
  }

  const arrayLegacy = legacyHourFromArray(item[hoursKey]);
  if (directDay && arrayLegacy) {
    return { day: directDay, start: arrayLegacy.start, end: arrayLegacy.end };
  }

  if (slotNumber === 1 && item.raidDate) {
    const legacyDate = new Date(item.raidDate);
    if (!Number.isNaN(legacyDate.getTime())) {
      const days = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday"
      ];
      const start = legacyDate.getHours();
      return {
        day: days[legacyDate.getDay()],
        start,
        end: Math.min(24, start + 1)
      };
    }
  }

  return { day: "", start: null, end: null };
}

function resetForm() {
  signupIdInput.value = "";
  selectedRaidIdInput.value = "";
  pendingSignupStatus = "tentative";
  formHeading.textContent = "Character Setup";
  saveButton.textContent = "Save Signup";
  cancelEditButton.hidden = true;
  updateSignupActionState();
  setMessage(formMessage, "");
}

function loadFormFromDoc(item) {
  signupIdInput.value = item.id;
  selectedRaidIdInput.value = item.raidId || "";
  formHeading.textContent = "Edit Signup";
  saveButton.textContent = "Update Signup";
  cancelEditButton.hidden = false;

  refreshCharacterProfileOptions(item.characterId || "");
  pendingSignupStatus = normalizeSignupStatus(item.status);
  updateSignupActionState();
}

function canEdit(item) {
  if (isDemoMode) {
    return true;
  }
  return item.ownerUid === authUid || isAdmin;
}

function loadDemoRows() {
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDemoRows(rows) {
  window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(rows));
}

function demoDateFromOffset(dayOffset) {
  const dt = new Date();
  dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() + dayOffset);
  return toDateOnlyString(dt);
}

function getSeedDemoRaids() {
  return [
    {
      id: "seed-raid-current",
      phase: 3,
      raidName: "Black Temple",
      raidDate: demoDateFromOffset(1),
      runType: "Progression",
      raidStart: 20,
      raidEnd: 23,
      raidSize: "25-man",
      createdByUid: "demo-local",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: "seed-raid-upcoming",
      phase: 4,
      raidName: "Zul'Aman",
      raidDate: demoDateFromOffset(5),
      runType: "Weekly",
      raidStart: 20,
      raidEnd: 22,
      raidSize: "10-man",
      createdByUid: "demo-local",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: "seed-raid-past",
      phase: 2,
      raidName: "The Eye",
      raidDate: demoDateFromOffset(-2),
      runType: "Farm",
      raidStart: 20,
      raidEnd: 23,
      raidSize: "25-man",
      createdByUid: "demo-local",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];
}

function getSeedDemoSignups(seedRaids) {
  const [currentRaid, upcomingRaid, pastRaid] = seedRaids;
  return [
    {
      id: "seed-signup-fury",
      characterId: "seed-char-fury",
      raidId: currentRaid.id,
      raidDate: currentRaid.raidDate,
      raidName: currentRaid.raidName,
      phase: currentRaid.phase,
      runType: currentRaid.runType,
      raidSize: currentRaid.raidSize,
      characterName: "Ironhowl",
      wowClass: "Warrior",
      role: "DPS",
      mainRole: "DPS",
      offRole: "Tank",
      mainSpecialization: "Fury",
      offSpecialization: "Protection",
      armoryUrl: buildArmoryUrl("Ironhowl"),
      progressionUrl: "",
      preferredDay1: "Tuesday",
      preferredStart1: 20,
      preferredEnd1: 23,
      preferredDay2: "Thursday",
      preferredStart2: 20,
      preferredEnd2: 23,
      status: "tentative",
      ownerUid: "demo-local",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: "seed-signup-ele",
      characterId: "seed-char-ele",
      raidId: upcomingRaid.id,
      raidDate: upcomingRaid.raidDate,
      raidName: upcomingRaid.raidName,
      phase: upcomingRaid.phase,
      runType: upcomingRaid.runType,
      raidSize: upcomingRaid.raidSize,
      characterName: "Stormtotem",
      wowClass: "Shaman",
      role: "DPS",
      mainRole: "DPS",
      offRole: "Healer",
      mainSpecialization: "Elemental",
      offSpecialization: "Restoration",
      armoryUrl: buildArmoryUrl("Stormtotem"),
      progressionUrl: "",
      preferredDay1: "Wednesday",
      preferredStart1: 20,
      preferredEnd1: 23,
      preferredDay2: "Sunday",
      preferredStart2: 19,
      preferredEnd2: 22,
      status: "tentative",
      ownerUid: "demo-local",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: "seed-signup-holy",
      characterId: "seed-char-holy",
      raidId: pastRaid.id,
      raidDate: pastRaid.raidDate,
      raidName: pastRaid.raidName,
      phase: pastRaid.phase,
      runType: pastRaid.runType,
      raidSize: pastRaid.raidSize,
      characterName: "Lightwarden",
      wowClass: "Paladin",
      role: "Healer",
      mainRole: "Healer",
      offRole: "Tank",
      mainSpecialization: "Holy",
      offSpecialization: "Protection",
      armoryUrl: buildArmoryUrl("Lightwarden"),
      progressionUrl: "",
      preferredDay1: "Monday",
      preferredStart1: 20,
      preferredEnd1: 23,
      preferredDay2: "Friday",
      preferredStart2: 20,
      preferredEnd2: 23,
      status: "tentative",
      ownerUid: "demo-local",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];
}

function ensureDemoExamples() {
  if (loadDemoRows().length) {
    return;
  }
  const seedRaids = sortRaids(getSeedDemoRaids());
  const seedRows = sortRows(getSeedDemoSignups(seedRaids));
  saveDemoRaids(seedRaids);
  saveDemoRows(seedRows);
}

function sortRows(rows) {
  return [...rows].sort((left, right) => {
    const leftRaidDate = parseDateOnly(getRaidDateString(left));
    const rightRaidDate = parseDateOnly(getRaidDateString(right));
    const leftRaidMs = leftRaidDate ? leftRaidDate.getTime() : 0;
    const rightRaidMs = rightRaidDate ? rightRaidDate.getTime() : 0;

    if (leftRaidMs !== rightRaidMs) {
      return leftRaidMs - rightRaidMs;
    }

    const leftCreated = new Date(left.createdAt || 0).getTime();
    const rightCreated = new Date(right.createdAt || 0).getTime();
    return leftCreated - rightCreated;
  });
}

function hydrateRowsWithRaidWindow(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    return [];
  }

  const raidsById = new Map(currentRaids.map((raid) => [raid.id, raid]));

  return rows.map((row) => {
    const hasWindow = Number.isInteger(row.raidStart) && Number.isInteger(row.raidEnd);
    if (hasWindow) {
      return row;
    }

    const matchedRaid = (row.raidId && raidsById.get(row.raidId)) || null;
    if (!matchedRaid) {
      return row;
    }

    return {
      ...row,
      raidStart: Number.isInteger(matchedRaid.raidStart) ? matchedRaid.raidStart : row.raidStart,
      raidEnd: Number.isInteger(matchedRaid.raidEnd) ? matchedRaid.raidEnd : row.raidEnd,
      raidDate: matchedRaid.raidDate || row.raidDate,
      raidName: matchedRaid.raidName || row.raidName,
      phase: matchedRaid.phase ?? row.phase,
      runType: matchedRaid.runType || row.runType,
      raidSize: matchedRaid.raidSize || row.raidSize
    };
  });
}

function renderCategoryRows(targetElement, rows, rosterMap) {
  if (!rows.length) {
    targetElement.innerHTML = `<tr><td colspan="10">No raids in this window.</td></tr>`;
    return;
  }

  const raidGroups = groupRowsByRaid(rows);

  targetElement.innerHTML = raidGroups
    .map((group) => {
      const item = group.summary;
      const detailId = `raid-detail-${safeId(group.key)}`;
      const raidSignups = group.signups.filter((signup) => signup.__isSignup !== false && signup.characterId);
      const signupCount = raidSignups.length;
      const resolvedSignups = raidSignups.map((signup) => resolveSignupCharacterData(signup));
      const isExpanded = expandedRaidGroups.has(group.key);
      const viewerOwnerUid = getViewerOwnerUid();
      const viewerSignup = viewerOwnerUid
        ? raidSignups.find((signup) => signup.ownerUid === viewerOwnerUid)
        : null;
      const selectedRaid = findRaidFromSummary(item);

      const detailRows = resolvedSignups
        .map((signup) => `<tr>
            <td>${renderCharacterDisplay(signup)}</td>
            <td>${escapeHtml(formatSpecDisplay(signup.mainSpecialization || signup.specialization || "", signup.wowClass || "", signup.mainRole || signup.role || ""))}</td>
            <td>${escapeHtml(formatSpecDisplay(signup.offSpecialization || "", signup.wowClass || "", signup.offRole || ""))}</td>
            <td><span class="signup-status-badge status-${normalizeSignupStatus(signup.status)}">${escapeHtml(statusLabel(signup.status))}</span></td>
            <td>${buildExternalLink(signup.armoryUrl, "Gear")}</td>
            <td>${buildExternalLink(signup.logsUrl || buildLogsUrl(signup.characterName || signup.profileCharacterName || ""), "Logs")}</td>
            <td>${signup.progressionUrl ? buildExternalLink(signup.progressionUrl, "Progress") : "TBD"}</td>
          </tr>`)
        .join("");

      return `<tr class="raid-summary-row">
          <td>
            ${renderRaidCharacterControl(selectedRaid?.id || "", viewerSignup)}
          </td>
          <td>
            ${renderRaidSignupControl(selectedRaid?.id || "", viewerSignup)}
          </td>
          <td>
            <div class="raid-date">${renderRaidDateWithTime(item)}</div>
          </td>
          <td class="raid-time-cell">${renderRaidWindowMultiline(item.raidStart, item.raidEnd, { highlightLocal: true })}</td>
          <td>${escapeHtml(item.phase ? `Phase ${String(item.phase)}` : "—")}</td>
          <td>${escapeHtml(item.raidName || "—")}</td>
          <td>${escapeHtml(item.runType || "—")}</td>
          <td>${escapeHtml(item.raidSize || "—")}</td>
          <td>${renderRosterProgress(item, rosterMap, resolvedSignups)}</td>
          <td>
            <button
              type="button"
              class="schedule-toggle"
              data-toggle-raid="${detailId}"
              data-raid-group-key="${escapeHtml(group.key)}"
              data-open-label="Hide Signups"
              data-closed-label="Show Signups (${signupCount})"
            >${isExpanded ? "Hide Signups" : `Show Signups (${signupCount})`}</button>
          </td>
        </tr>
        <tr id="${detailId}" class="raid-detail-row" ${isExpanded ? "" : "hidden"}>
          <td colspan="10">
            <div class="raid-detail-wrap">
              <table class="detail-table">
                <thead>
                  <tr>
                    <th>Character</th>
                    <th>MS (Role)</th>
                    <th>OS (Role)</th>
                    <th>Status</th>
                    <th>Gear</th>
                    <th>Logs</th>
                    <th>Raid Progression</th>
                  </tr>
                </thead>
                <tbody>${detailRows}</tbody>
              </table>
            </div>
          </td>
        </tr>`;
    })
    .join("");
}

function renderRows(items) {
  const scheduleItems = buildScheduleItems(items);
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const plusThree = new Date(startOfToday);
  plusThree.setDate(startOfToday.getDate() + 3);
  const plusSeven = new Date(startOfToday);
  plusSeven.setDate(startOfToday.getDate() + 7);

  const grouped = { current: [], upcoming: [], past: [] };

  scheduleItems.forEach((item) => {
    const cutoffDate = getRaidCutoffDateTime(item);
    if (!cutoffDate || cutoffDate.getTime() < now.getTime()) {
      grouped.past.push(item);
      return;
    }

    const raidDate = parseDateOnly(getRaidDateString(item));
    if (!raidDate) {
      grouped.upcoming.push(item);
      return;
    }
    if (raidDate <= plusThree) {
      grouped.current.push(item);
      return;
    }
    grouped.upcoming.push(item);
  });

  raidCountBadges.current.textContent = String(groupRowsByRaid(grouped.current).length);
  raidCountBadges.upcoming.textContent = String(groupRowsByRaid(grouped.upcoming).length);
  raidCountBadges.past.textContent = String(groupRowsByRaid(grouped.past).length);

  const rosterMap = buildRosterMap(scheduleItems);

  renderCategoryRows(raidRows.current, grouped.current, rosterMap);
  renderCategoryRows(raidRows.upcoming, grouped.upcoming, rosterMap);
  renderCategoryRows(raidRows.past, grouped.past, rosterMap);

  setMessage(listMessage, scheduleItems.length ? "" : "No raids scheduled yet.");
}

fields.wowClass.addEventListener("change", () => {
  refreshRoleOptionsForClass(fields.wowClass.value, fields.mainRole.value, fields.offRole.value);
  syncClassVisualTheme();
  refreshSpecializationOptions("", "");
  updateSignupGate();
});

fields.mainRole.addEventListener("change", () => {
  refreshSpecializationOptions("", fields.offSpecialization.value);
  updateSignupGate();
});

fields.offRole.addEventListener("change", () => {
  refreshSpecializationOptions(fields.mainSpecialization.value, "");
  updateSignupGate();
});

fields.characterName.addEventListener("input", updateSignupGate);
fields.mainSpecialization.addEventListener("change", updateSignupGate);
fields.offSpecialization.addEventListener("change", updateSignupGate);
fields.preferredDay1.addEventListener("change", updateSignupGate);
fields.preferredStart1.addEventListener("change", updateSignupGate);
fields.preferredEnd1.addEventListener("change", updateSignupGate);
fields.preferredDay2.addEventListener("change", updateSignupGate);
fields.preferredStart2.addEventListener("change", updateSignupGate);
fields.preferredEnd2.addEventListener("change", updateSignupGate);

characterProfileSelect.addEventListener("change", () => {
  updateSignupActionState();
});

addCharacterButton.addEventListener("click", () => {
  openProfileModal("create");
});

if (editProfileButton) {
  editProfileButton.addEventListener("click", (event) => {
    event.preventDefault();
    openProfileModal("edit");
  });
}

if (closeProfileModalButton) {
  closeProfileModalButton.addEventListener("click", closeProfileModal);
}

if (saveProfileButton) {
  saveProfileButton.addEventListener("click", async () => {
    if (!isDemoMode && !authUid) {
      setMessage(formMessage, "Still connecting. Try again in a moment.", true);
      return;
    }

    const characterName = fields.characterName.value.trim();
    const profileName = fields.profileName.value.trim();
    const normalizedArmoryUrl = buildArmoryUrl(characterName);
    const progressionUrl = buildProgressionUrl();
    const wowClass = fields.wowClass.value;
    const mainRole = fields.mainRole.value;
    const offRole = fields.offRole.value;
    const preferredDay1 = fields.preferredDay1.value;
    const preferredStart1 = parseHourValue(fields.preferredStart1.value);
    const preferredEnd1 = parseHourValue(fields.preferredEnd1.value);
    const preferredDay2 = fields.preferredDay2.value;
    const preferredStart2 = parseHourValue(fields.preferredStart2.value);
    const preferredEnd2 = parseHourValue(fields.preferredEnd2.value);
    const mainSpecialization = fields.mainSpecialization.value;
    const offSpecialization = fields.offSpecialization.value;
    const mainSpecs = getSpecsForSelection(wowClass, mainRole);
    const offSpecs = getSpecsForSelection(wowClass, offRole);

    if (
      !profileName || !characterName || !wowClass || !mainRole || !offRole ||
      !preferredDay1 || !preferredDay2 ||
      !Number.isInteger(preferredStart1) || !Number.isInteger(preferredEnd1) ||
      !Number.isInteger(preferredStart2) || !Number.isInteger(preferredEnd2) ||
      preferredStart1 >= preferredEnd1 || preferredStart2 >= preferredEnd2 ||
      !mainSpecialization || !offSpecialization ||
      !mainSpecs.includes(mainSpecialization) || !offSpecs.includes(offSpecialization)
    ) {
      setMessage(formMessage, "Please fill all required profile fields.", true);
      return;
    }

    const editingCharacter = profileModalMode === "edit" ? getSelectedCharacterProfile() : null;
    const duplicateProfile = allCharacters.find((character) =>
      character.id !== (editingCharacter?.id || "")
      && String(character.profileName || "").trim().toLowerCase() === profileName.toLowerCase()
    );
    if (duplicateProfile) {
      setMessage(formMessage, "Discord Name must be unique.", true);
      return;
    }

    const characterProfile = {
      profileName,
      characterName,
      wowClass,
      role: mainRole,
      mainRole,
      offRole,
      mainSpecialization,
      offSpecialization,
      armoryUrl: normalizedArmoryUrl,
      progressionUrl,
      preferredDay1,
      preferredStart1,
      preferredEnd1,
      preferredDay2,
      preferredStart2,
      preferredEnd2
    };

    const { alts, error } = collectAltCharacters();
    if (error) {
      setMessage(formMessage, error, true);
      return;
    }
    characterProfile.altCharacters = normalizeAltCharacters(alts);

    saveProfileButton.disabled = true;
    try {
      const characterId = await upsertCharacterProfile(characterProfile, editingCharacter?.id || "");

      const localCharacterRecord = {
        id: characterId,
        ...characterProfile,
        ownerUid: editingCharacter?.ownerUid || authUid || "demo-local"
      };
      const withoutCurrent = allCharacters.filter((character) => character.id !== characterId);
      allCharacters = sortCharacters([localCharacterRecord, ...withoutCurrent]);
      currentCharacters = sortCharacters(allCharacters);

      characterProfileSelect.value = characterId;
      refreshCharacterProfileOptions(characterId);
      closeProfileModal();
      setMessage(formMessage, profileModalMode === "edit" ? "Profile updated." : "Profile created.");
      updateSignupActionState();
    } catch (error) {
      setMessage(formMessage, error.message, true);
    } finally {
      saveProfileButton.disabled = false;
    }
  });
}

if (addAltCharacterButton) {
  addAltCharacterButton.addEventListener("click", () => {
    createAltCharacterCard({});
  });
}

if (deleteProfileButton) {
  deleteProfileButton.addEventListener("click", async () => {
    const selectedCharacter = getSelectedCharacterProfile();
    if (!selectedCharacter) {
      setMessage(formMessage, "Select a profile first, then click Edit Profile.", true);
      return;
    }

    const confirmed = window.confirm(`Delete profile ${getProfileLabel(selectedCharacter)}? This also deletes related raid signups.`);
    if (!confirmed) {
      return;
    }

    deleteProfileButton.disabled = true;
    try {
      let skippedSignupDeletes = 0;
      if (isDemoMode) {
        currentCharacters = currentCharacters.filter((character) => character.id !== selectedCharacter.id);
        allCharacters = allCharacters.filter((character) => character.id !== selectedCharacter.id);
        currentRows = currentRows.filter((row) => row.characterId !== selectedCharacter.id);
        saveDemoCharacters(currentCharacters);
        saveDemoRows(currentRows);
        renderRows(currentRows);
      } else {
        const signupsQuery = query(collection(db, "signups"), where("characterId", "==", selectedCharacter.id));
        const signupsSnapshot = await getDocs(signupsQuery);
        const deleteResults = await Promise.allSettled(
          signupsSnapshot.docs.map((signupDoc) => deleteDoc(signupDoc.ref))
        );
        skippedSignupDeletes = deleteResults.filter((result) => result.status === "rejected").length;
        await deleteDoc(doc(db, "characters", selectedCharacter.id));
      }

      refreshCharacterProfileOptions("");
      closeProfileModal();
      resetForm();
      if (skippedSignupDeletes > 0) {
        setMessage(formMessage, "Profile deleted. Some legacy signups could not be deleted and may remain visible.");
      } else {
        setMessage(formMessage, "Profile deleted.");
      }
    } catch (error) {
      setMessage(formMessage, error.message, true);
    } finally {
      deleteProfileButton.disabled = false;
    }
  });
}

if (hasAdminUI) {
  raidPhaseInput.addEventListener("change", refreshRaidTemplateOptions);
  raidTemplateInput.addEventListener("change", syncRaidSize);
  cancelRaidEditButton.addEventListener("click", resetRaidForm);
}

raidSectionsEl.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  const toggleTargetId = target.dataset.toggleRaid;
  if (toggleTargetId) {
    const detailRow = document.getElementById(toggleTargetId);
    const raidGroupKey = target.dataset.raidGroupKey || "";
    if (detailRow) {
      const shouldOpen = detailRow.hidden;
      detailRow.hidden = !shouldOpen;
      if (raidGroupKey) {
        if (shouldOpen) {
          expandedRaidGroups.add(raidGroupKey);
        } else {
          expandedRaidGroups.delete(raidGroupKey);
        }
      }
      target.textContent = shouldOpen
        ? (target.dataset.openLabel || "Hide Signups")
        : (target.dataset.closedLabel || "Show Signups");
    }
    return;
  }

  const action = target.dataset.action;
  const id = target.dataset.id;
  if (!action || !id) {
    return;
  }
  const item = currentRows.find((entry) => entry.id === id);
  if (!item || !canEdit(item)) {
    return;
  }
  if (action === "delete") {
    if (PROD_DB_SAFEGUARD) {
      setMessage(formMessage, "Mass delete actions are disabled in production safeguard mode.", true);
      return;
    }
    const confirmed = window.confirm(`Delete signup for ${item.characterName}?`);
    if (!confirmed) {
      return;
    }
    try {
      await deleteDoc(doc(db, "signups", id));
      setMessage(formMessage, "Signup deleted.");
      renderRows(currentRows);
    } catch (error) {
      setMessage(formMessage, error.message, true);
    }
    return;
  }
});

raidSectionsEl.addEventListener("change", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) {
    return;
  }

  if (target.dataset.raidProfileSelect === "true") {
    const parsed = parseRaidProfileSelection(target.value || "");
    if (parsed.profileId) {
      refreshCharacterProfileOptions(parsed.profileId);
    }
    updateSignupActionState();
    return;
  }

  if (target.dataset.raidSignupSelect !== "true") {
    return;
  }

  const nextStatus = target.value;
  const raidId = target.dataset.raidId || "";
  const signupId = target.dataset.signupId || "";

  if (nextStatus === "accept" || nextStatus === "denied") {
    setMessage(formMessage, "Accepted/Denied statuses are managed in the Admin Panel.", true);
    return;
  }

  if (!nextStatus) {
    if (signupId) {
      try {
        await clearRaidSignup(signupId);
        setMessage(formMessage, "Signup cleared. You can now pick a different character and request signup again.");
      } catch (error) {
        setMessage(formMessage, error.message, true);
      }
      return;
    }
    applySignupSelectStatusClass(target, "");
    return;
  }

  applySignupSelectStatusClass(target, nextStatus);

  if (signupId) {
    try {
      await updateSignupStatus(signupId, nextStatus);
    } catch (error) {
      setMessage(formMessage, error.message, true);
    }
    return;
  }

  const row = target.closest("tr");
  const rowProfileSelect = row
    ? row.querySelector('[data-raid-profile-select="true"]')
    : null;
  const selectedProfileValue = rowProfileSelect instanceof HTMLSelectElement
    ? rowProfileSelect.value
    : "";
  const selectedProfileRef = parseRaidProfileSelection(selectedProfileValue);

  if (!selectedProfileRef.profileId || !selectedProfileRef.characterKey) {
    setMessage(formMessage, "Choose a profile for this raid before selecting signup status.", true);
    target.value = "";
    applySignupSelectStatusClass(target, "");
    if (rowProfileSelect instanceof HTMLSelectElement) {
      rowProfileSelect.focus();
    }
    return;
  }

  refreshCharacterProfileOptions(selectedProfileRef.profileId);

  const selectedProfile = getCharacterById(selectedProfileRef.profileId);
  const selectedCharacterEntry = findProfileCharacterEntry(selectedProfile, selectedProfileRef.characterKey);
  if (!selectedProfile || !selectedCharacterEntry) {
    setMessage(formMessage, "Selected character could not be resolved from profile.", true);
    return;
  }

  const selectedRaid = currentRaids.find((raid) => raid.id === raidId);
  if (!selectedRaid) {
    setMessage(formMessage, "Raid is not available for signup yet.", true);
    return;
  }

  const existingForProfile = currentRows.find((entry) =>
    entry.raidId === selectedRaid.id
    && entry.characterId === selectedProfileRef.profileId
  );

  try {
    if (existingForProfile) {
      await upsertRaidSignupForProfile(existingForProfile, selectedRaid, selectedProfile, selectedCharacterEntry, nextStatus);
    } else {
      await createRaidSignup(selectedRaid, selectedProfile, selectedCharacterEntry, nextStatus);
    }
    setMessage(formMessage, `Signup status set to ${statusLabel(nextStatus)}.`);
  } catch (error) {
    setMessage(formMessage, error.message, true);
  }
});

cancelEditButton.addEventListener("click", resetForm);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isDemoMode && !authUid) {
    setMessage(formMessage, "Still connecting. Try again in a moment.", true);
    return;
  }

  saveButton.disabled = true;
  try {
    const editingId = signupIdInput.value;
    const existingEntry = editingId
      ? currentRows.find((entry) => entry.id === editingId)
      : null;

    const selectedCharacter = getSelectedCharacterProfile();
    if (!selectedCharacter) {
      setMessage(formMessage, "Select a profile before saving signup.", true);
      return;
    }

    const selectedRaidById = selectedRaidIdInput.value
      ? sortRaids(currentRaids).find((raid) => raid.id === selectedRaidIdInput.value)
      : null;
    const effectiveRaid = selectedRaidById
      || (existingEntry ? currentRaids.find((raid) => raid.id === existingEntry.raidId) : null);

    if (!effectiveRaid) {
      setMessage(formMessage, "Choose a raid from the Signup dropdown in the raid table first.", true);
      return;
    }

    const signupStatus = existingEntry
      ? normalizeSignupStatus(existingEntry.status)
      : normalizeSignupStatus(pendingSignupStatus);
    const selectedMainEntry = findProfileCharacterEntry(selectedCharacter, "main");
    const rawPayload = {
      characterId: selectedCharacter.id,
      profileCharacterKey: selectedMainEntry?.key || "main",
      profileCharacterName: selectedMainEntry?.characterName || selectedCharacter.characterName,
      raidId: effectiveRaid.id,
      raidDate: effectiveRaid.raidDate,
      raidName: effectiveRaid.raidName,
      phase: effectiveRaid.phase,
      runType: effectiveRaid.runType,
      raidSize: effectiveRaid.raidSize,
      raidStart: effectiveRaid.raidStart,
      raidEnd: effectiveRaid.raidEnd,
      status: signupStatus,
      ownerUid: isDemoMode ? "demo-local" : authUid,
      updatedAt: serverTimestamp()
    };
    const payload = normalizeSignupPayloadForRules(rawPayload);
    if (!payload) {
      setMessage(formMessage, "Selected raid has invalid schedule data. Please edit and re-save the raid in Admin Panel.", true);
      return;
    }

    if (isDemoMode) {
      if (editingId) {
        currentRows = currentRows.map((entry) =>
          entry.id === editingId ? { ...entry, ...payload } : entry
        );
        setMessage(formMessage, "Signup updated (demo mode).");
      } else {
        const existingForRaidProfile = currentRows.find((entry) =>
          entry.raidId === effectiveRaid.id
          && entry.characterId === selectedCharacter.id
        );
        if (existingForRaidProfile) {
          currentRows = currentRows.map((entry) =>
            entry.id === existingForRaidProfile.id
              ? { ...entry, ...payload, updatedAt: new Date().toISOString() }
              : entry
          );
          setMessage(formMessage, "Signup updated.");
        } else {
          currentRows.push({
            id: typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : `demo-${Date.now()}`,
            ...payload,
            createdAt: new Date().toISOString()
          });
          setMessage(formMessage, "Signup created (demo mode).");
        }
      }
      currentRows = sortRows(currentRows);
      saveDemoRows(currentRows);
      renderRows(currentRows);
      resetForm();
      return;
    }

    if (editingId) {
      const existing = currentRows.find((entry) => entry.id === editingId);
      if (!existing || !canEdit(existing)) {
        throw new Error("You do not have permission to edit this signup.");
      }
      await updateDoc(doc(db, "signups", editingId), {
        ...payload,
        ...legacySignupProfileDeleteFields()
      });
      setMessage(formMessage, "Signup updated.");
    } else {
      const existingForRaidProfile = currentRows.find((entry) =>
        entry.raidId === effectiveRaid.id
        && entry.characterId === selectedCharacter.id
      );
      if (existingForRaidProfile) {
        await updateDoc(doc(db, "signups", existingForRaidProfile.id), {
          ...payload,
          ...legacySignupProfileDeleteFields()
        });
        setMessage(formMessage, "Signup updated.");
      } else {
        await addDoc(collection(db, "signups"), {
          ...payload,
          createdAt: serverTimestamp()
        });
        setMessage(formMessage, "Signup created.");
      }
    }

    resetForm();
  } catch (error) {
    setMessage(formMessage, error.message, true);
  } finally {
    updateSignupActionState();
  }
});

if (!hasConfigValues()) {
  isDemoMode = true;
  isAdmin = true;
  setAuthGateState(true);
  updateAuthActionButtons({ uid: "demo" });
  updateUidDisplay("demo-local");
  ensureDemoExamples();
  startRaidCountdownTicker();
  setAdminRaidVisibility();
  setAdminNavVisibility();
  updateAdminOpsPendingBadge(currentRows);
  authStatus.textContent = "Demo mode: Firebase config not set (local testing enabled).";
  setMessage(listMessage, "Running in local demo mode. Example character rows are preloaded.");
  currentRaids = sortRaids(loadDemoRaids());
  currentRows = sortRows(loadDemoRows());
  updateAdminOpsPendingBadge(currentRows);
  renderRows(currentRows);
  if (hasAdminUI) {
    renderAdminRaids(currentRaids);
  }
  currentCharacters = sortCharacters(loadDemoCharacters());
  allCharacters = [...currentCharacters];
  refreshCharacterProfileOptions();
  updateSignupActionState();
  resetRaidForm();
  resetForm();
} else {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: "select_account" });
  db = getFirestore(app);
  const signupsRef = collection(db, "signups");
  const raidsRef = collection(db, "raids");
  const charactersRef = collection(db, "characters");
  const membersRef = collection(db, "members");

  async function reloadOwnCharacters() {
    if (!authUid) {
      return;
    }
    try {
      const ownedSnapshot = await getDocs(query(charactersRef, where("ownerUid", "==", authUid)));
      let docs = ownedSnapshot.docs;

      if (!docs.length && authEmail) {
        const legacySnapshot = await getDocs(query(charactersRef, where("ownerEmail", "==", authEmail)));
        docs = legacySnapshot.docs;

        await Promise.allSettled(
          docs.map((docItem) => updateDoc(docItem.ref, {
            ownerUid: authUid,
            ownerEmail: authEmail,
            updatedAt: serverTimestamp()
          }))
        );
      }

      allCharacters = docs.map((docItem) => ({
        id: docItem.id,
        ...docItem.data()
      }));
      currentCharacters = sortCharacters(allCharacters);
      refreshCharacterProfileOptions(characterProfileSelect.value);
      updateSignupActionState();
      renderRows(currentRows);
    } catch {
      // Preserve existing local state when fallback fetch fails.
    }
  }

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
      if (error && typeof error === "object" && ["auth/popup-blocked", "auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(error.code)) {
        const localUrl = `${location.protocol}//${location.host}${location.pathname}`;
        const msg = `Popups are blocked in this browser. Open this URL in Chrome or Safari to sign in: ${localUrl}`;
        authStatus.textContent = msg;
        setAuthGateState(false, msg, true);
        return;
      }
      const errorText = getGoogleAuthErrorMessage(error);
      authStatus.textContent = errorText;
      setAuthGateState(false, errorText, true);
      setMessage(formMessage, errorText, true);
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
        setMessage(formMessage, error.message, true);
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
    if (unsubscribeSignups) {
      unsubscribeSignups();
      unsubscribeSignups = null;
    }
    if (unsubscribeRaids) {
      unsubscribeRaids();
      unsubscribeRaids = null;
    }
    if (unsubscribeCharacters) {
      unsubscribeCharacters();
      unsubscribeCharacters = null;
    }

    if (!user) {
      authUid = null;
      authEmail = "";
      isAdmin = false;
      currentRows = [];
      currentRaids = [];
      currentCharacters = [];
      allCharacters = [];
      refreshCharacterProfileOptions();
      updateSignupActionState();
      renderRows(currentRows);
      if (hasAdminUI) {
        renderAdminRaids(currentRaids);
      }
      setAdminRaidVisibility();
      setAdminNavVisibility();
      updateAdminOpsPendingBadge([]);
      setAuthGateState(false, "Sign in with Google to continue.");
      updateAuthActionButtons(null);
      updateUidDisplay("");
      authStatus.textContent = "Signed out. Sign in with Google to continue.";
      return;
    }

    authUid = user.uid;
    authEmail = String(user.email || "").trim();
    const inStaticAdminAllowlist = Array.isArray(appSettings.adminUids) && appSettings.adminUids.includes(authUid);
    isAdmin = inStaticAdminAllowlist;
    hasAdminUI = isAdmin && !!adminRaidSection;
    console.log("[AUTH] uid:", authUid, "isAdmin:", isAdmin, "email:", authEmail);
    try {
      await setDoc(
        doc(membersRef, authUid),
        {
          uid: authUid,
          role: "member",
          displayName: String(user.displayName || "").trim(),
          email: authEmail || "",
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp()
        },
        { merge: true }
      );
      console.log("[AUTH] setDoc members OK");
    } catch (error) {
      console.error("[AUTH] setDoc members FAILED:", error?.code, error?.message);
      const fallback = "Signed in, but unable to initialize member access. Ask an admin to add your UID in Access Manager.";
      setAuthGateState(false, fallback, true);
      updateAuthActionButtons(user);
      updateUidDisplay(authUid);
      authStatus.textContent = fallback;
      setMessage(formMessage, error?.message || fallback, true);
      return;
    }

    setAuthGateState(true);
    updateAuthActionButtons(user);
    updateUidDisplay(authUid);
    setAdminRaidVisibility();
    setAdminNavVisibility();
    updateAdminOpsPendingBadge(currentRows);
    const userLabel = user.email || `${authUid.slice(0, 8)}...`;
    authStatus.textContent = isAdmin
      ? `Signed in as admin (${userLabel})`
      : `Signed in (${userLabel})`;

    const q = query(signupsRef, orderBy("createdAt", "asc"));

    unsubscribeSignups = onSnapshot(
      q,
      (snapshot) => {
        console.log("[SIGNUPS] snapshot received, count:", snapshot.docs.length);
        currentRows = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data()
        }));
        updateAdminOpsPendingBadge(currentRows);
        renderRows(currentRows);
      },
      (error) => {
        console.error("[SIGNUPS] error:", error.code, error.message);
        setMessage(listMessage, error.message, true);
      }
    );

    if (raidsRef) {
      const raidsQuery = query(raidsRef, orderBy("raidDate", "asc"));
      unsubscribeRaids = onSnapshot(
        raidsQuery,
        (snapshot) => {
          console.log("[RAIDS] snapshot received, count:", snapshot.docs.length);
          currentRaids = snapshot.docs.map((docItem) => ({
            id: docItem.id,
            ...docItem.data()
          }));
          currentRaids = sortRaids(currentRaids);
          if (!allCharacters.length) {
            void reloadOwnCharacters();
          }
          startRaidCountdownTicker();
          updateRaidCountdownClock();
          if (hasAdminUI) {
            renderAdminRaids(currentRaids);
          }
          renderRows(currentRows);
        },
        (error) => {
          if (hasAdminUI) {
            setMessage(raidAdminMessage, error.message, true);
          }
        }
      );
    }

    const charactersQuery = isAdmin
      ? query(charactersRef)
      : query(charactersRef, where("ownerUid", "==", authUid));

    unsubscribeCharacters = onSnapshot(
      charactersQuery,
      (snapshot) => {
        allCharacters = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data()
        }));
        currentCharacters = sortCharacters(allCharacters);
        refreshCharacterProfileOptions(characterProfileSelect.value);
        updateSignupActionState();
        renderRows(currentRows);
      },
      (error) => {
        setMessage(listMessage, error.message, true);
        void reloadOwnCharacters();
      }
    );

    resetRaidForm();
    resetForm();
    startRaidCountdownTicker();
    updateRaidCountdownClock();
  });

  void signupsRef;
  if (raidsRef) {
    void raidsRef;
  }
  void charactersRef;
  void membersRef;
}
