// Utility: truncate text to maxLen, add ellipsis if needed
function truncateText(str, maxLen) {
  if (!str) return "";
  return str.length > maxLen ? str.slice(0, maxLen - 1) + "…" : str;
}
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
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  query
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { appSettings, firebaseConfig } from "./config/prod/firebase-config.js";

const authStatus = document.getElementById("adminAuthStatus");
const appShell = document.getElementById("appShell");
const authGate = document.getElementById("authGate");
const authGateMessage = document.getElementById("authGateMessage");
const authGateSignInButton = document.getElementById("authGateSignInButton");
const currentUidEl = document.getElementById("currentUid");
const copyUidButton = document.getElementById("copyUidButton");
const signupRequestsSection = document.getElementById("signupRequestsSection");
const signupRequestRows = document.getElementById("signupRequestRows");
const signupRequestMessage = document.getElementById("signupRequestMessage");
const signupRequestBadge = document.getElementById("signupRequestBadge");
const characterAuditSection = document.getElementById("characterAuditSection");
const auditSearchInput = document.getElementById("auditSearch");
const auditClassFilter = document.getElementById("auditClassFilter");
const auditActivityFilter = document.getElementById("auditActivityFilter");
const characterAuditRows = document.getElementById("characterAuditRows");
const characterAuditMessage = document.getElementById("characterAuditMessage");
const auditCountBadge = document.getElementById("auditCountBadge");
const accessManagerSection = document.getElementById("accessManagerSection");
const accessForm = document.getElementById("accessForm");
const accessUidInput = document.getElementById("accessUidInput");
const accessTypeSelect = document.getElementById("accessTypeSelect");
const accessAddButton = document.getElementById("accessAddButton");
const accessManagerMessage = document.getElementById("accessManagerMessage");
const adminAccessRows = document.getElementById("adminAccessRows");
const memberAccessRows = document.getElementById("memberAccessRows");
const siteTitleEl = document.getElementById("siteTitle");
const guildDiscordLink = document.getElementById("guildDiscordLink");
const adminOpsBadge = document.getElementById("adminOpsBadge");
const signOutButton = document.getElementById("signOutButton");

const DEMO_CHARACTER_STORAGE_KEY = "hopeRaidTrackerDemoCharacters";
const DEMO_SIGNUP_STORAGE_KEY = "hopeRaidSignupDemoRows";
const ARMORY_BASE_URL = "https://classic-armory.org/character/us/tbc-anniversary/dreamscythe";
const ARMORY_API_URL = "https://classic-armory.org/api/v1/character";
const ARMORY_REGION = "us";
const ARMORY_REALM = "dreamscythe";
const ARMORY_FLAVOR = "tbc-anniversary";
const LOGS_BASE_URL = "https://fresh.warcraftlogs.com/character/us/dreamscythe";

const armoryDataCache = new Map();

function fetchArmoryData(characterName) {
  const slug = String(characterName || "").trim().toLowerCase();
  if (!slug) return Promise.resolve(null);
  if (armoryDataCache.has(slug)) return Promise.resolve(armoryDataCache.get(slug));

  return fetch(ARMORY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ region: ARMORY_REGION, realm: ARMORY_REALM, name: characterName.trim(), flavor: ARMORY_FLAVOR })
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data?.character) {
        const result = {
          guildName: data.character.guild_name || "",
          itemLevel: data.character.item_level || 0
        };
        armoryDataCache.set(slug, result);
        return result;
      }
      armoryDataCache.set(slug, null);
      return null;
    })
    .catch(() => {
      armoryDataCache.set(slug, null);
      return null;
    });
}

function enrichArmoryColumns(containerEl) {
  if (!containerEl) return;
  const cells = containerEl.querySelectorAll("[data-armory-char]");
  const uniqueNames = new Set();
  cells.forEach((cell) => uniqueNames.add(cell.dataset.armoryChar));
  uniqueNames.forEach((name) => {
    fetchArmoryData(name).then((data) => {
      if (!data) return;
      containerEl.querySelectorAll(`[data-armory-char="${CSS.escape(name)}"]`).forEach((cell) => {
        if (cell.dataset.armoryField === "guild") {
          if (data.guildName) {
            cell.textContent = truncateText(data.guildName, 16);
            cell.title = data.guildName;
          } else {
            cell.textContent = "—";
            cell.title = "";
          }
        } else if (cell.dataset.armoryField === "ilvl") {
          if (data.itemLevel) {
            cell.textContent = String(data.itemLevel);
            cell.title = `Item Level: ${data.itemLevel}`;
          } else {
            cell.textContent = "—";
            cell.title = "";
          }
        }
      function truncateText(str, maxLen) {
        if (!str) return "";
        return str.length > maxLen ? str.slice(0, maxLen - 1) + "…" : str;
      }
      });
    });
  });
}

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

const ROLE_ICONS = {
  Tank: "🛡",
  Healer: "✚",
  DPS: "⚔"
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

let authUid = null;
let isAdmin = false;
let isOwner = false;
let isDemoMode = false;
let db = null;
let currentCharacters = [];
let currentUserDirectory = new Map();
let currentSignups = [];
let currentRaids = [];
let currentAdminUids = [];
let currentMemberUids = [];
let currentAdminDirectory = new Map();
let currentMemberDirectory = new Map();
let currentOwnerUids = [];
let unsubscribeCharacters = null;
let unsubscribeSignups = null;
let unsubscribeRaids = null;
let unsubscribeAdmins = null;
let unsubscribeMembers = null;
let unsubscribeOwners = null;

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

function parseDateOnly(dateText) {
  if (!dateText || !/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    return null;
  }
  const parsed = new Date(`${dateText}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDateOnlyString(dateValue) {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function parseRaidHour(value, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return null;
  }
  return parsed;
}

function getSignupCutoffDate(signup) {
  const raidDate = parseDateOnly(signup.raidDate || "");
  if (!raidDate) {
    return null;
  }

  const raidEnd = parseRaidHour(signup.raidEnd, 1, 24);
  const fallbackStart = parseRaidHour(signup.raidStart, 0, 23);
  const cutoffHour = Number.isInteger(raidEnd)
    ? raidEnd
    : (Number.isInteger(fallbackStart) ? fallbackStart : 0);

  const cutoff = new Date(raidDate);
  cutoff.setHours(cutoffHour, 0, 0, 0);
  return cutoff;
}

function isActiveSignup(signup) {
  const cutoff = getSignupCutoffDate(signup);
  if (!cutoff) {
    return true;
  }
  return cutoff.getTime() >= Date.now();
}

function sortRaidsForAssignment(raids) {
  return [...raids].sort((left, right) => {
    const leftDate = parseDateOnly(left.raidDate || "")?.getTime() || 0;
    const rightDate = parseDateOnly(right.raidDate || "")?.getTime() || 0;
    if (leftDate !== rightDate) {
      return leftDate - rightDate;
    }
    return (Number(left.raidStart) || 0) - (Number(right.raidStart) || 0);
  });
}

function getUpcomingRaidsForAssignment() {
  return sortRaidsForAssignment(currentRaids).filter((raid) => isActiveSignup(raid));
}

function formatRaidAssignmentLabel(raid) {
  const dateLabel = formatMonthDayYear(raid.raidDate || "");
  const start = formatCstHour(Number(raid.raidStart));
  const end = formatCstHour(Number(raid.raidEnd));
  return `${dateLabel} • ${raid.raidName || "Raid"} • ${start} - ${end} CST`;
}

function formatCstHour(hourValue) {
  if (!Number.isInteger(hourValue) || hourValue < 0 || hourValue > 24) {
    return "?";
  }
  if (hourValue === 0 || hourValue === 24) {
    return "12 AM";
  }
  if (hourValue === 12) {
    return "12 PM";
  }
  if (hourValue > 12) {
    return `${hourValue - 12} PM`;
  }
  return `${hourValue} AM`;
}

function buildRequestQueueRows(rows, profilesById, actionMode = "full") {
  return rows
    .map((signup) => {
      const profile = resolveProfileForSignup(signup, profilesById);
      const profileLabel = profile ? getProfileLabel(profile) : "Unknown Profile";
      const selectedProfileEntry = profile
        ? findProfileCharacterEntry(
          profile,
          String(signup.profileCharacterKey || "main"),
          String(signup.profileCharacterName || signup.characterName || "")
        )
        : null;
      const characterName = signup.profileCharacterName || signup.characterName || selectedProfileEntry?.characterName || profile?.characterName || "—";
      const attributes = resolveSignupCharacterAttributes(signup, profilesById);
      const status = normalizeSignupStatus(signup.status);
      const gearUrl = String(signup.armoryUrl || buildArmoryUrl(characterName)).trim();
      const logsUrl = String(signup.logsUrl || selectedProfileEntry?.logsUrl || buildLogsUrl(characterName)).trim();
      const actionCell = actionMode === "full"
        ? `<div class="row-actions">
            <button type="button" data-request-action="accept" data-signup-id="${escapeHtml(signup.id)}">Accept</button>
            <button type="button" class="danger" data-request-action="deny" data-signup-id="${escapeHtml(signup.id)}">Deny</button>
          </div>`
        : actionMode === "accept-only"
          ? `<div class="row-actions">
              <button type="button" data-request-action="accept" data-signup-id="${escapeHtml(signup.id)}">Accept</button>
            </div>`
          : `<span class="request-action-na">Record only</span>`;
      const charSlug = String(characterName || "").trim().toLowerCase();
      return `<tr>
        <td>${escapeHtml(formatMonthDayYear(signup.raidDate || ""))}</td>
        <td>${escapeHtml(signup.raidName || "—")}</td>
        <td>${escapeHtml(profileLabel)}</td>
        <td>${escapeHtml(characterName)}</td>
        <td>${renderClassText(attributes.wowClass)}</td>
        <td>${escapeHtml(attributes.specialization)}</td>
        <td class="armory-col-narrow" data-armory-char="${escapeHtml(charSlug)}" data-armory-field="guild">…</td>
        <td class="armory-col-narrow" data-armory-char="${escapeHtml(charSlug)}" data-armory-field="ilvl">…</td>
        <td>${renderGearLink(gearUrl)}</td>
        <td>${renderExternalLink(logsUrl, "Logs")}</td>
        <td><span class="signup-status-badge status-${escapeHtml(status)}">${escapeHtml(signupStatusLabel(signup.status))}</span></td>
        <td>${actionCell}</td>
      </tr>`;
    })
    .join("");
}

function normalizeSignupStatus(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "requested" || normalized === "accept" || normalized === "tentative" || normalized === "decline" || normalized === "withdrawn" || normalized === "denied") {
    return normalized;
  }

  if (normalized === "confirmed") {
    return "accept";
  }
  if (normalized === "pending") {
    return "requested";
  }
  return "decline";
}

function signupStatusLabel(value) {
  const normalized = normalizeSignupStatus(value);
  const labels = {
    requested: "Request Signup",
    accept: "Accepted",
    tentative: "Bench For Now",
    decline: "Can't Go",
    withdrawn: "Withdrawn",
    denied: "Denied"
  };
  return labels[normalized] || "Unknown";
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

function saveDemoSignups(signups) {
  window.localStorage.setItem(DEMO_SIGNUP_STORAGE_KEY, JSON.stringify(signups));
}

function getCharacterMapById() {
  return new Map(currentCharacters.map((entry) => [entry.id, entry]));
}

function getUserDirectoryMeta(uid) {
  const normalized = normalizeUid(uid);
  if (!normalized) {
    return null;
  }

  const fromDirectory = currentUserDirectory.get(normalized);
  if (fromDirectory) {
    return fromDirectory;
  }

  const fromCharacter = currentCharacters.find((entry) => normalizeUid(entry.ownerUid || entry.id) === normalized);
  if (!fromCharacter) {
    return null;
  }

  return {
    uid: normalized,
    displayName: String(fromCharacter.displayName || "").trim(),
    profileName: String(fromCharacter.profileName || "").trim(),
    email: String(fromCharacter.email || fromCharacter.ownerEmail || "").trim()
  };
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

function findProfileCharacterEntry(profile, characterKey = "", characterName = "") {
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

function resolveProfileForSignup(signup, profilesById) {
  const byId = signup.characterId ? profilesById.get(signup.characterId) : null;
  if (byId) {
    return byId;
  }

  const ownerUid = normalizeUid(signup.ownerUid);
  if (!ownerUid) {
    return null;
  }

  const ownerProfiles = currentCharacters.filter((entry) => normalizeUid(entry.ownerUid || entry.id) === ownerUid);
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

function resolveSignupCharacterAttributes(signup, profilesById) {
  const profile = resolveProfileForSignup(signup, profilesById);
  if (!profile) {
    return {
      wowClass: signup.wowClass || "—",
      specialization: signup.mainSpecialization || signup.specialization || "—"
    };
  }

  const selectedEntry = findProfileCharacterEntry(
    profile,
    String(signup.profileCharacterKey || "main"),
    String(signup.profileCharacterName || signup.characterName || "")
  );

  return {
    wowClass: selectedEntry?.wowClass || profile.wowClass || signup.wowClass || "—",
    specialization: selectedEntry?.mainSpecialization
      || profile.mainSpecialization
      || profile.specialization
      || signup.mainSpecialization
      || signup.specialization
      || "—"
  };
}

function updatePendingBadge() {
  if (!adminOpsBadge || !isAdmin) {
    return;
  }
  const pendingCount = currentSignups.filter((signup) => {
    const status = normalizeSignupStatus(signup.status);
    return isActiveSignup(signup) && (status === "requested" || status === "tentative" || status === "withdrawn");
  }).length;
  adminOpsBadge.textContent = String(pendingCount);
  adminOpsBadge.hidden = pendingCount <= 0;
}

function renderSignupRequestsTable() {
  if (!isAdmin) {
    signupRequestRows.innerHTML = "";
    signupRequestBadge.textContent = "0";
    setMessage(signupRequestMessage, "");
    return;
  }

  const activeItems = currentSignups
    .filter((signup) => {
      const status = normalizeSignupStatus(signup.status);
      return isActiveSignup(signup) && (status === "requested" || status === "tentative" || status === "withdrawn");
    })
    .sort((left, right) => {
      const leftDate = parseDateOnly(left.raidDate)?.getTime() || 0;
      const rightDate = parseDateOnly(right.raidDate)?.getTime() || 0;
      if (leftDate !== rightDate) {
        return leftDate - rightDate;
      }
      return (Number(left.raidStart) || 0) - (Number(right.raidStart) || 0);
    });

  const requested = activeItems.filter((signup) => normalizeSignupStatus(signup.status) === "requested");
  const benched = activeItems.filter((signup) => normalizeSignupStatus(signup.status) === "tentative");
  const withdrew = activeItems.filter((signup) => normalizeSignupStatus(signup.status) === "withdrawn");

  signupRequestBadge.textContent = String(activeItems.length);
  updatePendingBadge();
  const existingAuthText = String(authStatus.textContent || "").split(" • Pending requests:")[0];
  authStatus.textContent = `${existingAuthText} • Pending requests: ${activeItems.length}`;

  if (!activeItems.length) {
    signupRequestRows.innerHTML = `<tr><td colspan="12">No active signup request records.</td></tr>`;
    setMessage(signupRequestMessage, "");
    return;
  }

  const profilesById = getCharacterMapById();
  const requestedHeader = requested.length
    ? `<tr class="request-group-row"><td colspan="12"><strong>Signup Requests (${requested.length})</strong></td></tr>${buildRequestQueueRows(requested, profilesById, "full")}`
    : "";
  const benchedHeader = benched.length
    ? `<tr class="request-group-row"><td colspan="12"><strong>Benched Themselves (${benched.length})</strong></td></tr>${buildRequestQueueRows(benched, profilesById, "accept-only")}`
    : "";
  const withdrewHeader = withdrew.length
    ? `<tr class="request-group-row"><td colspan="12"><strong>Accepted Then Withdrew (${withdrew.length})</strong></td></tr>${buildRequestQueueRows(withdrew, profilesById, "none")}`
    : "";

  signupRequestRows.innerHTML = `${requestedHeader}${benchedHeader}${withdrewHeader}`;
  enrichArmoryColumns(signupRequestRows);

  setMessage(signupRequestMessage, `${activeItems.length} active signup record(s) across requests, benches, and withdrawals.`);
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
    mainRole: profile.mainRole || profile.role || "",
    offRole: profile.offRole || "",
    mainSpecialization: profile.mainSpecialization || profile.specialization || "",
    offSpecialization: profile.offSpecialization || "",
    armoryUrl: buildArmoryUrl(profile.characterName || "") || profile.armoryUrl || "",
    logsUrl: buildLogsUrl(profile.characterName || "") || profile.logsUrl || ""
  });

  const alts = Array.isArray(profile.altCharacters) ? profile.altCharacters : [];
  alts.forEach((alt, index) => {
    if (!alt || !alt.characterName) {
      return;
    }
    entries.push({
      key: `alt-${index}`,
      characterName: alt.characterName || "",
      wowClass: alt.wowClass || "",
      mainRole: alt.mainRole || "",
      offRole: alt.offRole || "",
      mainSpecialization: alt.mainSpecialization || "",
      offSpecialization: alt.offSpecialization || "",
      armoryUrl: buildArmoryUrl(alt.characterName || "") || alt.armoryUrl || profile.armoryUrl || "",
      logsUrl: buildLogsUrl(alt.characterName || "") || alt.logsUrl || profile.logsUrl || ""
    });
  });

  return entries;
}

function formatHistorySummary(stats) {
  return `${stats.requested} Requested • ${stats.accept} Accept • ${stats.tentative} Tentative • ${stats.decline} Can't Go • ${stats.withdrawn} Withdrawn • ${stats.denied} Denied`;
}

function buildAuditSearchIndex(row) {
  const baseParts = [
    row.uid,
    row.displayName,
    row.profileName,
    row.email,
    row.role,
    String(row.acceptedTotal || 0),
    row.tooltip
  ];

  const characterParts = (row.characterEntries || []).flatMap((entry) => [
    entry.characterName,
    entry.wowClass,
    entry.mainRole,
    entry.mainSpecialization,
    entry.offRole,
    entry.offSpecialization,
    entry.armoryUrl,
    entry.logsUrl,
    entry.isMain ? "main" : "alt",
    String(entry.acceptedCount || 0)
  ]);

  return [...baseParts, ...characterParts]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function buildUserAuditRows(signups) {
  const acceptedTotals = new Map();
  const characterSummariesByUid = new Map();
  const profileNamesByUid = new Map();
  const emailsByUid = new Map();

  function ensureCharacterMap(uid) {
    if (!characterSummariesByUid.has(uid)) {
      characterSummariesByUid.set(uid, new Map());
    }
    return characterSummariesByUid.get(uid);
  }

  signups.forEach((signup) => {
    const uid = normalizeUid(signup.ownerUid);
    if (!uid) {
      return;
    }
    const signupProfileName = String(signup.profileName || signup.displayName || "").trim();
    if (signupProfileName && !profileNamesByUid.has(uid)) {
      profileNamesByUid.set(uid, signupProfileName);
    }
    const signupEmail = String(signup.ownerEmail || signup.email || "").trim();
    if (signupEmail && !emailsByUid.has(uid)) {
      emailsByUid.set(uid, signupEmail);
    }

    const profile = resolveProfileForSignup(signup, getCharacterMapById());
    const profileNameFromProfile = String(profile?.profileName || "").trim();
    if (profileNameFromProfile && !profileNamesByUid.has(uid)) {
      profileNamesByUid.set(uid, profileNameFromProfile);
    }
    const selectedEntry = profile
      ? findProfileCharacterEntry(
        profile,
        String(signup.profileCharacterKey || "main"),
        String(signup.profileCharacterName || signup.characterName || "")
      )
      : null;
    const characterName = String(signup.profileCharacterName || signup.characterName || selectedEntry?.characterName || profile?.characterName || "").trim();
    if (characterName) {
      const key = characterName.toLowerCase();
      const bucket = ensureCharacterMap(uid);
      const previous = bucket.get(key);
      const acceptedForCharacter = normalizeSignupStatus(signup.status) === "accept"
        ? (previous?.acceptedCount || 0) + 1
        : (previous?.acceptedCount || 0);
      bucket.set(key, {
        isMain: Boolean(selectedEntry?.key === "main"),
        characterKey: String(selectedEntry?.key || previous?.characterKey || "main"),
        characterName,
        wowClass: String(signup.wowClass || selectedEntry?.wowClass || profile?.wowClass || previous?.wowClass || "").trim() || "—",
        mainRole: String(signup.mainRole || signup.role || selectedEntry?.mainRole || profile?.mainRole || profile?.role || previous?.mainRole || "").trim() || "—",
        mainSpecialization: String(signup.mainSpecialization || signup.specialization || selectedEntry?.mainSpecialization || profile?.mainSpecialization || profile?.specialization || previous?.mainSpecialization || "").trim() || "—",
        offRole: String(signup.offRole || selectedEntry?.offRole || profile?.offRole || previous?.offRole || "").trim() || "—",
        offSpecialization: String(signup.offSpecialization || selectedEntry?.offSpecialization || profile?.offSpecialization || previous?.offSpecialization || "").trim() || "—",
        armoryUrl: String(signup.armoryUrl || previous?.armoryUrl || buildArmoryUrl(characterName)).trim(),
        logsUrl: String(signup.logsUrl || selectedEntry?.logsUrl || previous?.logsUrl || buildLogsUrl(characterName)).trim(),
        guildName: String(signup.guildName || selectedEntry?.guildName || profile?.guildName || previous?.guildName || "").trim(),
        acceptedCount: acceptedForCharacter
      });
    }

    if (normalizeSignupStatus(signup.status) !== "accept") {
      return;
    }
    acceptedTotals.set(uid, (acceptedTotals.get(uid) || 0) + 1);
  });

  const adminSet = new Set(currentAdminUids);
  const memberSet = new Set(currentMemberUids);
  const uidSet = new Set([...currentAdminUids, ...currentMemberUids, ...acceptedTotals.keys()]);

  currentCharacters.forEach((profile) => {
    const uid = normalizeUid(profile.ownerUid || profile.id);
    if (!uid) {
      return;
    }
    uidSet.add(uid);

    const profileNameFromProfile = String(profile.profileName || "").trim();
    if (profileNameFromProfile && !profileNamesByUid.has(uid)) {
      profileNamesByUid.set(uid, profileNameFromProfile);
    }

    const emailFromProfile = String(profile.email || profile.ownerEmail || "").trim();
    if (emailFromProfile && !emailsByUid.has(uid)) {
      emailsByUid.set(uid, emailFromProfile);
    }

    const bucket = ensureCharacterMap(uid);
    const profileEntries = getProfileCharacterEntries(profile);
    profileEntries.forEach((entry) => {
      const characterName = String(entry.characterName || "").trim();
      if (!characterName) {
        return;
      }
      const key = characterName.toLowerCase();
      const previous = bucket.get(key);
      bucket.set(key, {
        isMain: Boolean(entry.key === "main"),
        characterKey: String(entry.key || previous?.characterKey || "main"),
        characterName,
        wowClass: String(entry.wowClass || previous?.wowClass || "").trim() || "—",
        mainRole: String(entry.mainRole || previous?.mainRole || "").trim() || "—",
        mainSpecialization: String(entry.mainSpecialization || previous?.mainSpecialization || "").trim() || "—",
        offRole: String(entry.offRole || previous?.offRole || "").trim() || "—",
        offSpecialization: String(entry.offSpecialization || previous?.offSpecialization || "").trim() || "—",
        armoryUrl: String(entry.armoryUrl || previous?.armoryUrl || buildArmoryUrl(characterName)).trim(),
        logsUrl: String(entry.logsUrl || previous?.logsUrl || buildLogsUrl(characterName)).trim(),
        acceptedCount: previous?.acceptedCount || 0
      });
    });
  });

  signups.forEach((signup) => {
    const uid = normalizeUid(signup.ownerUid);
    if (uid) {
      uidSet.add(uid);
    }
  });

  const rows = Array.from(uidSet).map((uid) => {
    const normalizedUid = normalizeUid(uid);
    const source = getUserDirectoryMeta(normalizedUid) || {};
    const email = String(source.email || emailsByUid.get(normalizedUid) || "").trim();
    const emailLocalPart = email.includes("@") ? email.split("@")[0] : "";
    const profileName = String(source.profileName || profileNamesByUid.get(normalizedUid) || source.displayName || emailLocalPart || "No Profile Name").trim();
    const role = currentOwnerUids.includes(normalizedUid) ? "owner" : adminSet.has(normalizedUid) ? "admin" : memberSet.has(normalizedUid) ? "member" : "remove";
    const acceptedTotal = acceptedTotals.get(normalizedUid) || 0;
    const characterEntries = Array.from(characterSummariesByUid.get(normalizedUid)?.values() || [])
      .sort((left, right) => left.characterName.localeCompare(right.characterName, undefined, { sensitivity: "base" }));
    const tooltip = [
      `Discord Name: ${profileName || "Unknown"}`,
      `Google Email: ${email || "Unknown"}`
    ].join("\n");

    return {
      uid: normalizedUid,
      displayName: profileName,
      profileName,
      email,
      role,
      acceptedTotal,
      characterEntries,
      tooltip,
      searchIndex: ""
    };
  });

  rows.forEach((row) => {
    row.searchIndex = buildAuditSearchIndex(row);
  });

  return rows.sort((left, right) => left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" }));
}

function renderAuditEntryLines(entries, renderLine) {
  return entries
    .map((entry) => `<span class="audit-entry-line ${entry.isMain ? "is-main" : "is-alt"}">${renderLine(entry)}</span>`)
    .join("");
}

function renderRoleSpec(role, specialization) {
  const roleLabel = String(role || "—");
  const specLabel = String(specialization || "—");
  return `<span class="audit-role-main">${escapeHtml(roleLabel)}</span><span class="audit-spec-muted">${escapeHtml(specLabel)}</span>`;
}

function renderCharacterCell(entry, row) {
  const characterName = escapeHtml(entry.characterName || "—");
  const charTooltip = [`UID: ${row.uid}`, `Discord Name: ${row.profileName || row.displayName || "Unknown"}`, `Google Email: ${row.email || "Unknown"}`].join("\n");
  return `<span class="audit-character-name" title="${escapeHtml(charTooltip)}">${characterName}</span>`;
}

function findExistingAssignment(uid, raidId, characterName) {
  const normalizedUid = normalizeUid(uid);
  const normalizedRaidId = String(raidId || "").trim();
  const normalizedCharacterName = String(characterName || "").trim().toLowerCase();
  if (!normalizedUid || !normalizedRaidId || !normalizedCharacterName) {
    return null;
  }

  return currentSignups.find((signup) =>
    normalizeUid(signup.ownerUid) === normalizedUid
    && String(signup.raidId || "") === normalizedRaidId
    && String(signup.profileCharacterName || signup.characterName || "").trim().toLowerCase() === normalizedCharacterName
  ) || null;
}

function getAssignmentState(existingAssignment) {
  if (!existingAssignment) {
    return { label: "Unassigned", className: "is-unassigned", hasAssignment: false };
  }
  const status = normalizeSignupStatus(existingAssignment.status);
  if (status === "tentative") {
    return { label: "Benched", className: "is-benched", hasAssignment: true };
  }
  return { label: "Assigned", className: "is-assigned", hasAssignment: true };
}

function renderAssignmentActions(uid, existingAssignment) {
  const escapedUid = escapeHtml(uid);
  const state = getAssignmentState(existingAssignment);
  const stateBadge = `<span class="audit-assignment-state ${escapeHtml(state.className)}">${escapeHtml(state.label)}</span>`;
  if (state.hasAssignment) {
    return `${stateBadge}<button type="button" class="audit-action-unassign" data-audit-action="unassign" data-audit-action-uid="${escapedUid}">Unassign</button>`;
  }

  return [
    stateBadge,
    `<button type="button" class="audit-action-assign" data-audit-action="assign" data-audit-action-uid="${escapedUid}">Assign</button>`,
    `<button type="button" data-audit-action="bench" data-audit-action-uid="${escapedUid}">Bench</button>`
  ].join("");
}

function setAuditAssignmentButtonsDisabled(container, disabled) {
  if (!(container instanceof HTMLElement)) {
    return;
  }
  container.querySelectorAll("button[data-audit-action]").forEach((button) => {
    if (button instanceof HTMLButtonElement) {
      button.disabled = disabled;
    }
  });
}

function refreshAuditAssignmentButtonState(container, uid) {
  if (!(container instanceof HTMLElement)) {
    return;
  }
  const raidSelect = container.querySelector("select[data-audit-raid-select]");
  const characterSelect = container.querySelector("select[data-audit-character-select]");
  const actionWrap = container.querySelector("[data-audit-actions]");
  if (!(raidSelect instanceof HTMLSelectElement) || !(characterSelect instanceof HTMLSelectElement) || !(actionWrap instanceof HTMLElement)) {
    return;
  }

  const existing = findExistingAssignment(uid, raidSelect.value, characterSelect.value);
  actionWrap.innerHTML = renderAssignmentActions(uid, existing);
}

function renderAuditAssignmentControl(row, entries, upcomingRaids) {
  if (!entries.length) {
    return "—";
  }
  if (!upcomingRaids.length) {
    return `<span class="request-action-na">No upcoming raids</span>`;
  }

  const upcomingRaidIds = new Set(upcomingRaids.map((raid) => String(raid.id)));
  const entryNames = new Set(entries.map((entry) => String(entry.characterName || "").trim().toLowerCase()));
  const existingUpcomingSignup = currentSignups.find((signup) => {
    const ownerUid = normalizeUid(signup.ownerUid);
    const raidId = String(signup.raidId || "");
    const characterName = String(signup.profileCharacterName || signup.characterName || "").trim().toLowerCase();
    return ownerUid === row.uid && upcomingRaidIds.has(raidId) && entryNames.has(characterName);
  });

  const selectedRaidId = String(existingUpcomingSignup?.raidId || upcomingRaids[0]?.id || "");
  const selectedCharacterName = String(existingUpcomingSignup?.profileCharacterName || existingUpcomingSignup?.characterName || entries[0]?.characterName || "").trim().toLowerCase();
  const selectedCharacterValue = entries.find((entry) => String(entry.characterName || "").trim().toLowerCase() === selectedCharacterName)?.characterName
    || entries[0]?.characterName
    || "";
  const selectedEntryAssignment = findExistingAssignment(row.uid, selectedRaidId, selectedCharacterValue);

  const raidOptions = upcomingRaids
    .map((raid) => `<option value="${escapeHtml(raid.id)}" ${String(raid.id) === selectedRaidId ? "selected" : ""}>${escapeHtml(formatRaidAssignmentLabel(raid))}</option>`)
    .join("");

  const characterOptions = entries
    .map((entry) => {
      const characterName = String(entry.characterName || "").trim();
      const isSelected = characterName.toLowerCase() === selectedCharacterName;
      return `<option value="${escapeHtml(characterName)}" ${isSelected ? "selected" : ""}>${escapeHtml(characterName)}</option>`;
    })
    .join("");

  return `<div class="audit-assignment" data-audit-assign-wrap="${escapeHtml(row.uid)}">
    <select data-audit-raid-select="${escapeHtml(row.uid)}">${raidOptions}</select>
    <select data-audit-character-select="${escapeHtml(row.uid)}">${characterOptions}</select>
    <div class="audit-assignment-actions" data-audit-actions="${escapeHtml(row.uid)}">${renderAssignmentActions(row.uid, selectedEntryAssignment)}</div>
  </div>`;
}

function normalizeAssignmentPayloadForRules(payload) {
  const phase = Number(payload.phase);
  const raidStart = Number(payload.raidStart);
  const raidEnd = Number(payload.raidEnd);
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
    characterId: String(payload.characterId || "").trim(),
    profileCharacterKey: String(payload.profileCharacterKey || "").trim(),
    profileCharacterName: String(payload.profileCharacterName || "").trim(),
    raidId: String(payload.raidId || "").trim(),
    raidDate: String(payload.raidDate || "").trim(),
    raidName: String(payload.raidName || "").trim(),
    phase,
    runType: String(payload.runType || "").trim(),
    raidSize: String(payload.raidSize || "").trim(),
    raidStart,
    raidEnd,
    status: normalizeSignupStatus(payload.status),
    ownerUid: String(payload.ownerUid || "").trim(),
    updatedAt: payload.updatedAt
  };
}

function resolveProfileCharacterForAssignment(ownerUid, characterName) {
  const normalizedOwnerUid = normalizeUid(ownerUid);
  const normalizedCharacterName = String(characterName || "").trim().toLowerCase();
  if (!normalizedOwnerUid || !normalizedCharacterName) {
    return null;
  }

  const ownerProfiles = currentCharacters.filter((entry) => normalizeUid(entry.ownerUid || entry.id) === normalizedOwnerUid);
  for (const profile of ownerProfiles) {
    const matchedEntry = getProfileCharacterEntries(profile).find(
      (entry) => String(entry.characterName || "").trim().toLowerCase() === normalizedCharacterName
    );
    if (matchedEntry) {
      return { profile, characterEntry: matchedEntry };
    }
  }

  return null;
}

function renderGearLink(url) {
  return renderExternalLink(url, "Gear");
}

function renderExternalLink(url, label = "Link") {
  const trimmed = String(url || "").trim();
  if (!trimmed) {
    return "—";
  }
  return `<a href="${escapeHtml(trimmed)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

function renderClassText(wowClass) {
  const className = normalizeClassName(wowClass) || "—";
  const color = WOW_CLASS_COLORS[className];
  if (!color) {
    return `<span class="class-colored-name">${escapeHtml(className)}</span>`;
  }
  return `<span class="class-colored-name" style="color:${escapeHtml(color)}">${escapeHtml(className)}</span>`;
}

function normalizeClassName(value) {
  return String(value || "").trim();
}

function normalizeClassKey(value) {
  return normalizeClassName(value).toLowerCase();
}

function filterAuditRows(rows) {
  const search = String(auditSearchInput.value || "").trim().toLowerCase();

  return rows.filter((row) => {
    if (!search) {
      return true;
    }

    return String(row.searchIndex || "").includes(search);
  });
}

function renderCharacterAuditTable() {
  if (!isAdmin) {
    characterAuditRows.innerHTML = "";
    auditCountBadge.textContent = "0";
    setMessage(characterAuditMessage, "");
    return;
  }

  const allRows = buildUserAuditRows(currentSignups);
  const filteredRows = filterAuditRows(allRows);
  const upcomingRaids = getUpcomingRaidsForAssignment();
  auditCountBadge.textContent = String(filteredRows.length);

  if (!allRows.length) {
    characterAuditRows.innerHTML = `<tr><td colspan="12">No user records found yet.</td></tr>`;
    setMessage(characterAuditMessage, "");
    return;
  }

  if (!filteredRows.length) {
    characterAuditRows.innerHTML = `<tr><td colspan="12">No matches for current search/filter.</td></tr>`;
    setMessage(characterAuditMessage, "");
    return;
  }

  characterAuditRows.innerHTML = filteredRows
    .map((row) => {
      const entries = row.characterEntries || [];
      return `<tr>
        <td><span class="audit-user-name" title="${escapeHtml(row.tooltip)}">${escapeHtml(row.profileName || row.displayName)}</span></td>
        <td class="audit-stack-cell">${entries.length ? renderAuditEntryLines(entries, (entry) => renderCharacterCell(entry, row)) : "—"}</td>
        <td class="audit-stack-cell">${entries.length ? renderAuditEntryLines(entries, (entry) => renderClassText(entry.wowClass)) : "—"}</td>
        <td class="audit-stack-cell">${entries.length ? renderAuditEntryLines(entries, (entry) => renderRoleSpec(entry.mainRole, entry.mainSpecialization)) : "—"}</td>
        <td class="audit-stack-cell">${entries.length ? renderAuditEntryLines(entries, (entry) => renderRoleSpec(entry.offRole, entry.offSpecialization)) : "—"}</td>
        <td class="audit-stack-cell">${entries.length ? renderAuditEntryLines(entries, (entry) => renderExternalLink(entry.armoryUrl, "Gear")) : "—"}</td>
        <td class="audit-stack-cell">${entries.length ? renderAuditEntryLines(entries, (entry) => renderExternalLink(entry.logsUrl, "Logs")) : "—"}</td>
        <td class="audit-stack-cell armory-col-narrow">${entries.length ? renderAuditEntryLines(entries, (entry) => entry.guildName ? `<a href="https://classic-armory.org/guild/us/tbc-anniversary/dreamscythe/${encodeURIComponent(entry.guildName)}" target="_blank" rel="noopener" class="guild-link guild-muted" title="${escapeHtml(entry.guildName)}">${escapeHtml(truncateText(entry.guildName, 16))}</a>` : "—") : "—"}</td>
        <td class="audit-history-col">(${escapeHtml(row.acceptedTotal)})</td>
        <td>
          <select data-role-uid="${escapeHtml(row.uid)}" data-role-current="${escapeHtml(row.role)}" title="Change this user's access role" ${row.role === "owner" && !isOwner ? "disabled" : ""}>
            <option value="member" ${row.role === "member" ? "selected" : ""} title="Standard access — can sign up for raids.">Member</option>
            <option value="admin" ${row.role === "admin" ? "selected" : ""} title="Full admin access — can manage raids, approve signups, and change roles.">Admin</option>
            <option value="remove" ${row.role === "remove" ? "selected" : ""} title="Revokes all access. Signups and profiles are preserved.">⛔ Soft Ban</option>
            ${isOwner ? `<option value="owner" ${row.role === "owner" ? "selected" : ""} title="Full owner access — can manage admins, assign owners, and nuke accounts.">Owner</option>` : ""}
            ${isOwner ? `<option value="nuke" title="PERMANENT: Deletes ALL access, signups, and character profiles. Cannot be undone.">☢ Nuke Account</option>` : ""}
          </select>
          <small class="audit-role-hint">${row.role === "remove" ? "⚠ Soft-banned" : row.role === "owner" ? "⭐ Owner" : ""}</small>
        </td>
        <td class="audit-assign-col">${renderAuditAssignmentControl(row, entries, upcomingRaids)}</td>
      </tr>`;
    })
    .join("");

  setMessage(characterAuditMessage, `${filteredRows.length} user access record(s) shown.`);
  enrichArmoryColumns(characterAuditRows);
}

function setAdminVisibility() {
  signupRequestsSection.hidden = !isAdmin;
  characterAuditSection.hidden = !isAdmin;
  if (!isAdmin && adminOpsBadge) {
    adminOpsBadge.hidden = true;
  }
}

function normalizeUid(value) {
  return String(value || "").trim();
}

function rebuildUserDirectory() {
  const merged = new Map();

  currentMemberDirectory.forEach((meta, uid) => {
    merged.set(uid, {
      id: uid,
      uid,
      displayName: String(meta.displayName || "").trim(),
      email: String(meta.email || "").trim(),
      profileName: String(meta.profileName || "").trim()
    });
  });

  currentAdminDirectory.forEach((meta, uid) => {
    const existing = merged.get(uid) || { id: uid, uid, displayName: "", email: "", profileName: "" };
    merged.set(uid, {
      ...existing,
      displayName: String(meta.displayName || existing.displayName || "").trim(),
      email: String(meta.email || existing.email || "").trim(),
      profileName: String(meta.profileName || existing.profileName || "").trim()
    });
  });

  currentUserDirectory = merged;
}

function renderAccessRows() {
  renderCharacterAuditTable();
}

async function upsertAccessUid(uid, accessType) {
  const targetCollection = accessType === "admin" ? "admins" : "members";
  await setDoc(doc(db, targetCollection, uid), {
    uid,
    role: accessType,
    updatedAt: serverTimestamp(),
    updatedByUid: authUid,
    createdAt: serverTimestamp()
  }, { merge: true });
}

async function removeAccessUid(uid, accessType) {
  const targetCollection = accessType === "admin" ? "admins" : "members";
  await deleteDoc(doc(db, targetCollection, uid));
}

async function nukeAccountByUid(uid) {
  // 1. Delete access docs (owners + admins + members)
  await Promise.allSettled([
    deleteDoc(doc(db, "owners", uid)),
    deleteDoc(doc(db, "admins", uid)),
    deleteDoc(doc(db, "members", uid))
  ]);

  // 2. Delete all signups owned by this user
  const signupsSnap = await getDocs(query(collection(db, "signups"), where("ownerUid", "==", uid)));
  const signupDeletes = signupsSnap.docs.map((d) => deleteDoc(doc(db, "signups", d.id)));
  await Promise.allSettled(signupDeletes);

  // 3. Delete all character profiles owned by this user
  const charsSnap = await getDocs(query(collection(db, "characters"), where("ownerUid", "==", uid)));
  const charDeletes = charsSnap.docs.map((d) => deleteDoc(doc(db, "characters", d.id)));
  await Promise.allSettled(charDeletes);
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

function getAuthErrorMessage(error) {
  if (error?.code === "auth/unauthorized-domain") {
    const host = window.location.hostname || "this domain";
    return `Sign-in is blocked for ${host}. Add it in Firebase Console → Authentication → Settings → Authorized domains.`;
  }
  return error?.message || "Sign-in failed.";
}

/* ── Role Slot Constraint Check ── */
function resolveSignupRole(signup) {
  const profilesById = getCharacterMapById();
  const profile = resolveProfileForSignup(signup, profilesById);
  const selectedEntry = profile
    ? findProfileCharacterEntry(
      profile,
      String(signup.profileCharacterKey || "main"),
      String(signup.profileCharacterName || signup.characterName || "")
    )
    : null;
  return String(
    signup.mainRole || signup.role
    || selectedEntry?.mainRole || selectedEntry?.role
    || profile?.mainRole || profile?.role
    || ""
  ).trim();
}

function checkRoleSlotConstraint(signup) {
  const raidId = String(signup.raidId || "");
  if (!raidId) {
    return null;
  }

  const raid = currentRaids.find((r) => r.id === raidId);
  if (!raid) {
    return null;
  }

  const hasCfg = raid.tankSlots != null || raid.healerSlots != null || raid.dpsSlots != null;
  if (!hasCfg) {
    return null;
  }

  const limits = {
    Tank: Number(raid.tankSlots) || 0,
    Healer: Number(raid.healerSlots) || 0,
    DPS: Number(raid.dpsSlots) || 0
  };

  const role = resolveSignupRole(signup);
  if (!role || !(role in limits)) {
    return null;
  }

  const acceptedForRole = currentSignups.filter((s) => {
    return String(s.raidId || "") === raidId
      && normalizeSignupStatus(s.status) === "accept"
      && resolveSignupRole(s) === role;
  }).length;

  if (acceptedForRole >= limits[role]) {
    return `Cannot accept: ${role} slots are full (${acceptedForRole}/${limits[role]}). Remove an accepted ${role} first.`;
  }

  return null;
}

signupRequestsSection.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  const action = target.dataset.requestAction;
  const signupId = target.dataset.signupId;
  if (!action || !signupId || !isAdmin) {
    return;
  }

  /* ── Enforce role slot constraint on accept ── */
  if (action === "accept") {
    const signup = currentSignups.find((s) => s.id === signupId);
    if (signup) {
      const constraintMsg = checkRoleSlotConstraint(signup);
      if (constraintMsg) {
        setMessage(signupRequestMessage, constraintMsg, true);
        return;
      }
    }
  }

  const nextStatus = action === "accept" ? "accept" : "denied";
  target.disabled = true;

  try {
    if (isDemoMode) {
      currentSignups = currentSignups.map((signup) =>
        signup.id === signupId
          ? { ...signup, status: nextStatus, updatedAt: new Date().toISOString() }
          : signup
      );
      saveDemoSignups(currentSignups);
      renderSignupRequestsTable();
      renderCharacterAuditTable();
      setMessage(signupRequestMessage, `Request ${action === "accept" ? "accepted" : "denied"} (demo mode).`);
      return;
    }

    await updateDoc(doc(db, "signups", signupId), {
      status: nextStatus,
      updatedAt: serverTimestamp()
    });
    setMessage(signupRequestMessage, `Request ${action === "accept" ? "accepted" : "denied"}.`);
  } catch (error) {
    setMessage(signupRequestMessage, error.message, true);
  } finally {
    target.disabled = false;
  }
});

auditSearchInput.addEventListener("input", () => {
  renderCharacterAuditTable();
});

if (auditClassFilter) {
  auditClassFilter.addEventListener("change", () => {
    renderCharacterAuditTable();
  });
}

if (auditActivityFilter) {
  auditActivityFilter.addEventListener("change", () => {
    renderCharacterAuditTable();
  });
}

characterAuditSection.addEventListener("change", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) {
    return;
  }

  const uid = normalizeUid(target.dataset.roleUid || "");
  if (!uid) {
    return;
  }
  const nextRole = String(target.value || "");
  const previousRole = String(target.dataset.roleCurrent || "");
  if (!uid || !isAdmin || !db || !["member", "admin", "remove", "nuke", "owner"].includes(nextRole)) {
    return;
  }

  if (nextRole === "nuke" && !isOwner) {
    setMessage(characterAuditMessage, "Only owners can nuke accounts.", true);
    target.value = previousRole || "member";
    return;
  }

  if (nextRole === "owner" && !isOwner) {
    setMessage(characterAuditMessage, "Only owners can assign the owner role.", true);
    target.value = previousRole || "member";
    return;
  }

  if (previousRole === "owner" && !isOwner) {
    setMessage(characterAuditMessage, "Only owners can modify another owner's role.", true);
    target.value = previousRole;
    return;
  }

  target.disabled = true;
  try {
    if (nextRole === "member") {
      await setDoc(doc(db, "members", uid), {
        uid,
        role: "member",
        updatedAt: serverTimestamp(),
        updatedByUid: authUid,
        createdAt: serverTimestamp()
      }, { merge: true });
      await deleteDoc(doc(db, "admins", uid)).catch(() => {});
      await deleteDoc(doc(db, "owners", uid)).catch(() => {});
      setMessage(characterAuditMessage, "Role updated to member.");
    } else if (nextRole === "admin") {
      await setDoc(doc(db, "admins", uid), {
        uid,
        role: "admin",
        updatedAt: serverTimestamp(),
        updatedByUid: authUid,
        createdAt: serverTimestamp()
      }, { merge: true });
      await setDoc(doc(db, "members", uid), {
        uid,
        role: "member",
        updatedAt: serverTimestamp(),
        updatedByUid: authUid,
        createdAt: serverTimestamp()
      }, { merge: true });
      await deleteDoc(doc(db, "owners", uid)).catch(() => {});
      setMessage(characterAuditMessage, "Role updated to admin.");
    } else if (nextRole === "remove") {
      await Promise.allSettled([
        deleteDoc(doc(db, "owners", uid)),
        deleteDoc(doc(db, "admins", uid)),
        deleteDoc(doc(db, "members", uid))
      ]);
      setMessage(characterAuditMessage, "Soft ban applied — access revoked. Signups and profiles preserved.");
    } else if (nextRole === "nuke") {
      const confirmed = window.confirm(
        "NUKE ACCOUNT: This will permanently delete this user's access, ALL signups, and ALL character profiles. This cannot be undone. Continue?"
      );
      if (!confirmed) {
        target.value = previousRole || "member";
        target.disabled = false;
        return;
      }
      await nukeAccountByUid(uid);
      setMessage(characterAuditMessage, "Account nuked — all data permanently deleted.");
    } else if (nextRole === "owner") {
      await setDoc(doc(db, "owners", uid), {
        uid,
        role: "owner",
        updatedAt: serverTimestamp(),
        updatedByUid: authUid,
        createdAt: serverTimestamp()
      }, { merge: true });
      await setDoc(doc(db, "admins", uid), {
        uid,
        role: "admin",
        updatedAt: serverTimestamp(),
        updatedByUid: authUid,
        createdAt: serverTimestamp()
      }, { merge: true });
      await setDoc(doc(db, "members", uid), {
        uid,
        role: "member",
        updatedAt: serverTimestamp(),
        updatedByUid: authUid,
        createdAt: serverTimestamp()
      }, { merge: true });
      setMessage(characterAuditMessage, "Role updated to owner.");
    }
  } catch (error) {
    setMessage(characterAuditMessage, error.message, true);
    target.value = previousRole || "remove";
  } finally {
    target.disabled = false;
  }
});

characterAuditSection.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const actionButton = target.closest("button[data-audit-action][data-audit-action-uid]");
  if (!(actionButton instanceof HTMLButtonElement)) {
    return;
  }

  if (!isAdmin || !db) {
    return;
  }

  const uid = normalizeUid(actionButton.dataset.auditActionUid || "");
  const action = String(actionButton.dataset.auditAction || "").trim().toLowerCase();
  const wrap = actionButton.closest(".audit-assignment");
  if (!uid || !(wrap instanceof HTMLElement)) {
    return;
  }

  const raidSelect = wrap.querySelector("select[data-audit-raid-select]");
  const characterSelect = wrap.querySelector("select[data-audit-character-select]");
  if (!(raidSelect instanceof HTMLSelectElement) || !(characterSelect instanceof HTMLSelectElement)) {
    return;
  }

  const raidId = String(raidSelect.value || "").trim();
  const characterName = String(characterSelect.value || "").trim();
  const selectedRaid = currentRaids.find((raid) => raid.id === raidId);
  if (!raidId || !characterName || !selectedRaid) {
    setMessage(characterAuditMessage, "Select a raid and character before assigning.", true);
    return;
  }

  const existing = findExistingAssignment(uid, raidId, characterName);

  if (action === "unassign") {
    if (!existing?.id) {
      setMessage(characterAuditMessage, "No existing signup found for that raid and character.", true);
      refreshAuditAssignmentButtonState(wrap, uid);
      return;
    }

    setAuditAssignmentButtonsDisabled(wrap, true);
    try {
      if (isDemoMode) {
        currentSignups = currentSignups.filter((signup) => signup.id !== existing.id);
        saveDemoSignups(currentSignups);
        renderSignupRequestsTable();
        renderCharacterAuditTable();
      } else {
        await deleteDoc(doc(db, "signups", existing.id));
      }
      setMessage(characterAuditMessage, `Unassigned ${characterName} from ${selectedRaid.raidName || "raid"}.`);
      refreshAuditAssignmentButtonState(wrap, uid);
    } catch (error) {
      setMessage(characterAuditMessage, error.message, true);
    } finally {
      setAuditAssignmentButtonsDisabled(wrap, false);
    }
    return;
  }

  if (action !== "assign" && action !== "bench") {
    return;
  }

  if (existing?.id) {
    setMessage(characterAuditMessage, "That character is already signed up for the selected raid. Use Unassign to remove them.", true);
    refreshAuditAssignmentButtonState(wrap, uid);
    return;
  }

  const nextStatus = action === "bench" ? "tentative" : "accept";

  const resolved = resolveProfileCharacterForAssignment(uid, characterName);
  if (!resolved) {
    setMessage(characterAuditMessage, "Unable to resolve profile/character for assignment.", true);
    return;
  }

  const { profile, characterEntry } = resolved;
  const rawPayload = {
    characterId: profile.id,
    profileCharacterKey: characterEntry.key || "main",
    profileCharacterName: characterEntry.characterName || characterName,
    raidId: selectedRaid.id,
    raidDate: selectedRaid.raidDate,
    raidName: selectedRaid.raidName,
    phase: selectedRaid.phase,
    runType: selectedRaid.runType,
    raidSize: selectedRaid.raidSize,
    raidStart: selectedRaid.raidStart,
    raidEnd: selectedRaid.raidEnd,
    status: nextStatus,
    ownerUid: uid,
    updatedAt: serverTimestamp()
  };
  const payload = normalizeAssignmentPayloadForRules(rawPayload);
  if (!payload) {
    setMessage(characterAuditMessage, "Selected raid has invalid schedule data. Please check raid start/end in Admin: Raids.", true);
    return;
  }

  setAuditAssignmentButtonsDisabled(wrap, true);
  try {
    if (isDemoMode) {
      const nextEntry = {
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `demo-${Date.now()}`,
        ...payload,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };
      currentSignups = [nextEntry, ...currentSignups];
      saveDemoSignups(currentSignups);
      renderSignupRequestsTable();
      renderCharacterAuditTable();
      setMessage(characterAuditMessage, `Assigned ${characterName} to ${selectedRaid.raidName || "raid"} (${signupStatusLabel(nextStatus)}).`);
      return;
    }

    await setDoc(doc(collection(db, "signups")), {
      ...payload,
      createdAt: serverTimestamp()
    });
    setMessage(characterAuditMessage, `Assigned ${characterName} to ${selectedRaid.raidName || "raid"} (${signupStatusLabel(nextStatus)}).`);
    refreshAuditAssignmentButtonState(wrap, uid);
  } catch (error) {
    setMessage(characterAuditMessage, error.message, true);
  } finally {
    setAuditAssignmentButtonsDisabled(wrap, false);
  }
});

characterAuditSection.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const wrap = target.closest(".audit-assignment");
  if (!(wrap instanceof HTMLElement)) {
    return;
  }
  const raidSelect = wrap.querySelector("select[data-audit-raid-select]");
  const uid = normalizeUid(raidSelect instanceof HTMLSelectElement ? (raidSelect.dataset.auditRaidSelect || "") : "");
  if (!uid) {
    return;
  }
  refreshAuditAssignmentButtonState(wrap, uid);
});

if (accessForm) {
  accessForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isAdmin || !db) {
      setMessage(accessManagerMessage, "Admin access is required.", true);
      return;
    }

    const uid = normalizeUid(accessUidInput?.value);
    const accessType = String(accessTypeSelect?.value || "member") === "admin" ? "admin" : "member";
    if (!uid) {
      setMessage(accessManagerMessage, "Enter a valid UID.", true);
      return;
    }

    accessAddButton.disabled = true;
    try {
      await upsertAccessUid(uid, accessType);
      setMessage(accessManagerMessage, `${accessType === "admin" ? "Admin" : "Member"} access granted.`);
      accessUidInput.value = "";
      accessUidInput.focus();
    } catch (error) {
      setMessage(accessManagerMessage, error.message, true);
    } finally {
      accessAddButton.disabled = false;
    }
  });
}

if (accessManagerSection) {
  accessManagerSection.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    const uid = normalizeUid(target.dataset.accessUid);
    const accessType = target.dataset.accessRemove === "admin" ? "admin" : target.dataset.accessRemove === "member" ? "member" : "";
    if (!uid || !accessType || !isAdmin || !db) {
      return;
    }

    target.disabled = true;
    try {
      await removeAccessUid(uid, accessType);
      setMessage(accessManagerMessage, `${accessType === "admin" ? "Admin" : "Member"} access removed.`);
    } catch (error) {
      setMessage(accessManagerMessage, error.message, true);
    } finally {
      target.disabled = false;
    }
  });
}

if (!hasConfigValues()) {
  isDemoMode = true;
  isAdmin = true;
  isOwner = true;
  setAuthGateState(true);
  setAdminVisibility();
  updateAuthActionButtons({ uid: "demo" });
  updateUidDisplay("demo-local");
  authStatus.textContent = "Demo mode: Firebase config not set (local testing enabled).";
  currentCharacters = [{
    id: "demo-local",
    ownerUid: "demo-local",
    uid: "demo-local",
    displayName: "demo-local",
    email: "demo@example.com",
    profileName: "demo-local"
  }];
  currentUserDirectory = new Map([[
    "demo-local",
    {
      uid: "demo-local",
      displayName: "demo-local",
      profileName: "demo-local",
      email: "demo@example.com"
    }
  ]]);
  currentSignups = loadDemoSignups();
  currentRaids = [];
  currentAdminUids = ["demo-local"];
  currentMemberUids = ["demo-local"];
  currentAdminDirectory = new Map([["demo-local", { displayName: "demo-local", email: "demo@example.com" }]]);
  currentMemberDirectory = new Map([["demo-local", { displayName: "demo-local", email: "demo@example.com" }]]);
  renderSignupRequestsTable();
  renderCharacterAuditTable();
  renderAccessRows();
} else {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: "select_account" });
  const yahooProvider = new OAuthProvider("yahoo.com");
  db = getFirestore(app);
  const signupsRef = collection(db, "signups");
  const raidsRef = collection(db, "raids");
  const charactersRef = collection(db, "characters");
  const adminsRef = collection(db, "admins");
  const membersRef = collection(db, "members");
  const ownersRef = collection(db, "owners");

  setAuthPendingState();
  updateAuthActionButtons(null);
  updateUidDisplay("");
  authStatus.textContent = "Checking sign-in status...";

  const authGateYahooButton = document.getElementById("authGateYahooButton");

  async function performSignIn(provider) {
    const buttons = [authGateSignInButton, authGateYahooButton].filter(Boolean);
    buttons.forEach((b) => (b.disabled = true));
    try {
      await signInWithPopup(auth, provider);
      setAuthGateState(true);
    } catch (error) {
      const errorText = getAuthErrorMessage(error);
      authStatus.textContent = errorText;
      setAuthGateState(false, errorText, true);
      setMessage(signupRequestMessage, errorText, true);
    } finally {
      buttons.forEach((b) => (b.disabled = false));
    }
  }

  if (authGateSignInButton) {
    authGateSignInButton.addEventListener("click", () => performSignIn(googleProvider));
  }
  if (authGateYahooButton) {
    authGateYahooButton.addEventListener("click", () => performSignIn(yahooProvider));
  }

  if (signOutButton) {
    signOutButton.addEventListener("click", async () => {
      signOutButton.disabled = true;
      try {
        await signOut(auth);
      } catch (error) {
        setMessage(signupRequestMessage, error.message, true);
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
    if (unsubscribeCharacters) {
      unsubscribeCharacters();
      unsubscribeCharacters = null;
    }
    if (unsubscribeSignups) {
      unsubscribeSignups();
      unsubscribeSignups = null;
    }
    if (unsubscribeRaids) {
      unsubscribeRaids();
      unsubscribeRaids = null;
    }
    if (unsubscribeAdmins) {
      unsubscribeAdmins();
      unsubscribeAdmins = null;
    }
    if (unsubscribeMembers) {
      unsubscribeMembers();
      unsubscribeMembers = null;
    }
    if (unsubscribeOwners) {
      unsubscribeOwners();
      unsubscribeOwners = null;
    }

    if (!user) {
      authUid = null;
      isAdmin = false;
      isOwner = false;
      currentCharacters = [];
      currentUserDirectory = new Map();
      currentSignups = [];
      currentRaids = [];
      currentAdminUids = [];
      currentMemberUids = [];
      currentOwnerUids = [];
      currentAdminDirectory = new Map();
      currentMemberDirectory = new Map();
      setAdminVisibility();
      renderSignupRequestsTable();
      renderCharacterAuditTable();
      renderAccessRows();
      signupRequestBadge.textContent = "0";
      if (adminOpsBadge) {
        adminOpsBadge.hidden = true;
      }
      setAuthGateState(false, "Sign in with Google to continue.");
      updateAuthActionButtons(null);
      updateUidDisplay("");
      authStatus.textContent = "Signed out. Sign in with Google to continue.";
      return;
    }

    authUid = user.uid;
    const inStaticAdminAllowlist = Array.isArray(appSettings.adminUids) && appSettings.adminUids.includes(authUid);
    let hasAdminDoc = false;
    let hasOwnerDoc = false;
    try {
      hasAdminDoc = (await getDoc(doc(db, "admins", authUid))).exists();
    } catch {
      hasAdminDoc = false;
    }
    try {
      hasOwnerDoc = (await getDoc(doc(db, "owners", authUid))).exists();
    } catch {
      hasOwnerDoc = false;
    }
    isOwner = hasOwnerDoc;
    isAdmin = inStaticAdminAllowlist || hasAdminDoc || isOwner;
    setAuthGateState(true);
    updateAuthActionButtons(user);
    updateUidDisplay(authUid);
    setAdminVisibility();
    const userLabel = user.email || `${authUid.slice(0, 8)}...`;
    if (!isAdmin) {
      if (adminOpsBadge) {
        adminOpsBadge.hidden = true;
      }
      authStatus.textContent = `Signed in (${userLabel}) — Not authorized for requests/audit.`;
      setMessage(signupRequestMessage, "Your account is not in the admin allowlist.", true);
      setMessage(characterAuditMessage, "Your account is not in the admin allowlist.", true);
      setMessage(accessManagerMessage, "Your account is not in the admin allowlist.", true);
      return;
    }

    authStatus.textContent = `Signed in (${userLabel}) — Requests and audit enabled`;

    unsubscribeSignups = onSnapshot(
      signupsRef,
      (snapshot) => {
        currentSignups = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data()
        }));
        renderSignupRequestsTable();
        renderCharacterAuditTable();
      },
      (error) => {
        setMessage(characterAuditMessage, error.message, true);
      }
    );

    unsubscribeRaids = onSnapshot(
      raidsRef,
      (snapshot) => {
        currentRaids = sortRaidsForAssignment(
          snapshot.docs.map((docItem) => ({
            id: docItem.id,
            ...docItem.data()
          }))
        );
        renderCharacterAuditTable();
      },
      (error) => {
        setMessage(characterAuditMessage, error.message, true);
      }
    );

    unsubscribeCharacters = onSnapshot(
      charactersRef,
      (snapshot) => {
        currentCharacters = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data()
        }));
        renderSignupRequestsTable();
        renderCharacterAuditTable();
      },
      (error) => {
        setMessage(characterAuditMessage, error.message, true);
      }
    );

    unsubscribeAdmins = onSnapshot(
      adminsRef,
      (snapshot) => {
        currentAdminDirectory = new Map(
          snapshot.docs.map((docItem) => [String(docItem.id || "").trim(), docItem.data() || {}])
        );
        currentAdminUids = snapshot.docs
          .map((docItem) => String(docItem.id || "").trim())
          .filter(Boolean)
          .sort((left, right) => left.localeCompare(right));
        rebuildUserDirectory();
        renderAccessRows();
      },
      (error) => {
        setMessage(accessManagerMessage, error.message, true);
      }
    );

    unsubscribeMembers = onSnapshot(
      membersRef,
      (snapshot) => {
        currentMemberDirectory = new Map(
          snapshot.docs.map((docItem) => [String(docItem.id || "").trim(), docItem.data() || {}])
        );
        currentMemberUids = snapshot.docs
          .map((docItem) => String(docItem.id || "").trim())
          .filter(Boolean)
          .sort((left, right) => left.localeCompare(right));
        rebuildUserDirectory();
        renderAccessRows();
      },
      (error) => {
        setMessage(accessManagerMessage, error.message, true);
      }
    );

    unsubscribeOwners = onSnapshot(
      ownersRef,
      (snapshot) => {
        currentOwnerUids = snapshot.docs
          .map((docItem) => String(docItem.id || "").trim())
          .filter(Boolean);
        // Re-render audit table so owner badges and options update
        renderCharacterAuditTable();
      },
      (error) => {
        console.warn("[OWNERS] snapshot error:", error.message);
      }
    );
  });
}
