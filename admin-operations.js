import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  GoogleAuthProvider,
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
  updateDoc
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
let isDemoMode = false;
let db = null;
let currentCharacters = [];
let currentSignups = [];
let currentAdminUids = [];
let currentMemberUids = [];
let unsubscribeCharacters = null;
let unsubscribeSignups = null;
let unsubscribeAdmins = null;
let unsubscribeMembers = null;

if (siteTitleEl) {
  siteTitleEl.textContent = `${appSettings.siteTitle || "Hope Raid Tracker"} - Admin Requests & Audit`;
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

function buildRequestQueueRows(rows, profilesById, actionMode = "full") {
  return rows
    .map((signup) => {
      const profile = profilesById.get(signup.characterId);
      const profileLabel = profile ? getProfileLabel(profile) : "Unknown Profile";
      const characterName = signup.profileCharacterName || signup.characterName || profile?.characterName || "—";
      const attributes = resolveSignupCharacterAttributes(signup, profilesById);
      const status = normalizeSignupStatus(signup.status);
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
      return `<tr>
        <td>${escapeHtml(formatMonthDayYear(signup.raidDate || ""))}</td>
        <td>${escapeHtml(signup.raidName || "—")}</td>
        <td>${escapeHtml(profileLabel)}</td>
        <td>${escapeHtml(characterName)}</td>
        <td>${renderClassText(attributes.wowClass)}</td>
        <td>${escapeHtml(attributes.specialization)}</td>
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
    const byName = entries.find((entry) => entry.characterName === characterName);
    if (byName) {
      return byName;
    }
  }
  return entries[0] || null;
}

function resolveSignupCharacterAttributes(signup, profilesById) {
  const profile = profilesById.get(signup.characterId);
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
    signupRequestRows.innerHTML = `<tr><td colspan="8">No active signup request records.</td></tr>`;
    setMessage(signupRequestMessage, "");
    return;
  }

  const profilesById = getCharacterMapById();
  const requestedHeader = requested.length
    ? `<tr class="request-group-row"><td colspan="8"><strong>Signup Requests (${requested.length})</strong></td></tr>${buildRequestQueueRows(requested, profilesById, "full")}`
    : "";
  const benchedHeader = benched.length
    ? `<tr class="request-group-row"><td colspan="8"><strong>Benched Themselves (${benched.length})</strong></td></tr>${buildRequestQueueRows(benched, profilesById, "accept-only")}`
    : "";
  const withdrewHeader = withdrew.length
    ? `<tr class="request-group-row"><td colspan="8"><strong>Accepted Then Withdrew (${withdrew.length})</strong></td></tr>${buildRequestQueueRows(withdrew, profilesById, "none")}`
    : "";

  signupRequestRows.innerHTML = `${requestedHeader}${benchedHeader}${withdrewHeader}`;

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
    armoryUrl: buildArmoryUrl(profile.characterName || "") || profile.armoryUrl || ""
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
      armoryUrl: buildArmoryUrl(alt.characterName || "") || alt.armoryUrl || profile.armoryUrl || ""
    });
  });

  return entries;
}

function formatHistorySummary(stats) {
  return `${stats.requested} Requested • ${stats.accept} Accept • ${stats.tentative} Tentative • ${stats.decline} Can't Go • ${stats.withdrawn} Withdrawn • ${stats.denied} Denied`;
}

function buildCharacterAuditRows(characters, signups) {
  const today = toDateOnlyString(new Date());
  const byProfileId = new Map();

  signups.forEach((signup) => {
    const profileId = String(signup.characterId || "");
    if (!profileId) {
      return;
    }
    const characterKey = String(signup.profileCharacterKey || "main");
    const mapKey = `${profileId}::${characterKey}`;
    if (!byProfileId.has(mapKey)) {
      byProfileId.set(mapKey, []);
    }
    byProfileId.get(mapKey).push(signup);
  });

  const auditRows = [];

  characters.forEach((profile) => {
    const profileId = String(profile.id || "");
    const profileLabel = getProfileLabel(profile);
    const entries = getProfileCharacterEntries(profile);
    const profileStats = { total: 0, requested: 0, accept: 0, tentative: 0, decline: 0, withdrawn: 0, denied: 0 };
    let profileLastRaidDate = "";
    let hasPastAcceptedRaid = false;

    const entryRows = entries.map((entry) => {
      const entryKey = `${profileId}::${entry.key}`;
      const relatedSignups = byProfileId.get(entryKey) || [];
      const stats = { total: 0, requested: 0, accept: 0, tentative: 0, decline: 0, withdrawn: 0, denied: 0 };
      let lastRaidDate = "";

      relatedSignups.forEach((signup) => {
        const status = normalizeSignupStatus(signup.status);
        stats.total += 1;
        stats[status] += 1;

        const raidDate = String(signup.raidDate || "");
        if (parseDateOnly(raidDate)) {
          if (!lastRaidDate || raidDate > lastRaidDate) {
            lastRaidDate = raidDate;
          }
          if (status === "accept" && raidDate < today) {
            hasPastAcceptedRaid = true;
          }
        }
      });

      profileStats.total += stats.total;
      profileStats.requested += stats.requested;
      profileStats.accept += stats.accept;
      profileStats.tentative += stats.tentative;
      profileStats.decline += stats.decline;
      profileStats.withdrawn += stats.withdrawn;
      profileStats.denied += stats.denied;

      if (lastRaidDate && (!profileLastRaidDate || lastRaidDate > profileLastRaidDate)) {
        profileLastRaidDate = lastRaidDate;
      }

      return {
        key: entry.key,
        isMain: entry.key === "main",
        characterName: entry.characterName || "—",
        wowClass: entry.wowClass || "—",
        mainRole: entry.mainRole || "—",
        offRole: entry.offRole || "—",
        mainSpecialization: entry.mainSpecialization || "—",
        offSpecialization: entry.offSpecialization || "—",
        armoryUrl: entry.armoryUrl || "",
        stats,
        lastRaidDate,
        hasSignups: stats.total > 0
      };
    });

    const classSet = new Set(
      entryRows
        .map((entry) => normalizeClassName(entry.wowClass))
        .filter((value) => value && value !== "—")
    );

    const searchIndex = [
      profileLabel,
      ...entryRows.flatMap((entry) => [
        entry.characterName,
        entry.wowClass,
        entry.mainRole,
        entry.offRole,
        entry.mainSpecialization,
        entry.offSpecialization
      ]),
      formatHistorySummary(profileStats)
    ].join(" ").toLowerCase();

    auditRows.push({
      id: profileId,
      profileLabel,
      entries: entryRows,
      classes: Array.from(classSet),
      stats: profileStats,
      historyText: formatHistorySummary(profileStats),
      lastRaidDate: profileLastRaidDate,
      lastRaidLabel: profileLastRaidDate ? formatMonthDayYear(profileLastRaidDate) : "—",
      hasSignups: profileStats.total > 0,
      hasPastAcceptedRaid,
      searchIndex
    });
  });

  return auditRows.sort((left, right) => left.profileLabel.localeCompare(right.profileLabel, undefined, { sensitivity: "base" }));
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

function renderGearLink(url) {
  const trimmed = String(url || "").trim();
  if (!trimmed) {
    return "—";
  }
  return `<a href="${escapeHtml(trimmed)}" target="_blank" rel="noopener noreferrer">Gear</a>`;
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

function refreshAuditClassFilterOptions(rows) {
  const classMap = new Map();
  rows
    .flatMap((row) => row.classes || [])
    .forEach((value) => {
      const normalized = normalizeClassName(value);
      const key = normalizeClassKey(normalized);
      if (!normalized || key === "—" || classMap.has(key)) {
        return;
      }
      classMap.set(key, normalized);
    });

  const classes = Array.from(classMap.values())
    .sort((left, right) => left.localeCompare(right));

  const currentValue = auditClassFilter.value;
  auditClassFilter.innerHTML = [
    `<option value="">All Classes</option>`,
    ...classes.map((className) => `<option value="${escapeHtml(className)}">${escapeHtml(className)}</option>`)
  ].join("");
  if (classes.includes(currentValue)) {
    auditClassFilter.value = currentValue;
  }
}

function filterAuditRows(rows) {
  const search = String(auditSearchInput.value || "").trim().toLowerCase();
  const classFilter = normalizeClassKey(auditClassFilter.value || "");
  const activityFilter = String(auditActivityFilter.value || "all");

  return rows.filter((row) => {
    if (classFilter && !(row.classes || []).some((className) => normalizeClassKey(className) === classFilter)) {
      return false;
    }

    if (activityFilter === "has-signups" && !row.hasSignups) {
      return false;
    }
    if (activityFilter === "no-signups" && row.hasSignups) {
      return false;
    }
    if (activityFilter === "past-accepted" && !row.hasPastAcceptedRaid) {
      return false;
    }

    if (!search) {
      return true;
    }

    return String(row.searchIndex || "").includes(search);
  });
}

function getVisibleAuditEntries(row, classFilterKey) {
  if (!classFilterKey) {
    return row.entries || [];
  }

  return (row.entries || []).filter((entry) => normalizeClassKey(entry.wowClass) === classFilterKey);
}

function renderCharacterAuditTable() {
  if (!isAdmin) {
    characterAuditRows.innerHTML = "";
    auditCountBadge.textContent = "0";
    setMessage(characterAuditMessage, "");
    return;
  }

  const allRows = buildCharacterAuditRows(currentCharacters, currentSignups);
  refreshAuditClassFilterOptions(allRows);
  const filteredRows = filterAuditRows(allRows);
  const classFilterKey = normalizeClassKey(auditClassFilter.value || "");
  auditCountBadge.textContent = String(filteredRows.length);

  if (!allRows.length) {
    characterAuditRows.innerHTML = `<tr><td colspan="8">No profile records found yet.</td></tr>`;
    setMessage(characterAuditMessage, "");
    return;
  }

  if (!filteredRows.length) {
    characterAuditRows.innerHTML = `<tr><td colspan="8">No matches for current search/filter.</td></tr>`;
    setMessage(characterAuditMessage, "");
    return;
  }

  characterAuditRows.innerHTML = filteredRows
    .map((row) => {
      const visibleEntries = getVisibleAuditEntries(row, classFilterKey);
      return `<tr>
        <td>${escapeHtml(row.profileLabel)}</td>
        <td class="audit-stack-cell">${renderAuditEntryLines(visibleEntries, (entry) => `${escapeHtml(entry.characterName)} <span class="audit-entry-tag">${entry.isMain ? "Main" : "Alt"}</span>`)}</td>
        <td class="audit-stack-cell">${renderAuditEntryLines(visibleEntries, (entry) => renderClassText(entry.wowClass))}</td>
        <td class="audit-stack-cell">${renderAuditEntryLines(visibleEntries, (entry) => renderRoleSpec(entry.mainRole, entry.mainSpecialization))}</td>
        <td class="audit-stack-cell">${renderAuditEntryLines(visibleEntries, (entry) => renderRoleSpec(entry.offRole, entry.offSpecialization))}</td>
        <td class="audit-stack-cell">${renderAuditEntryLines(visibleEntries, (entry) => renderGearLink(entry.armoryUrl))}</td>
        <td class="audit-history-col">${escapeHtml(row.historyText)}</td>
        <td>${escapeHtml(row.lastRaidLabel)}</td>
      </tr>`;
    })
    .join("");

  setMessage(characterAuditMessage, `${filteredRows.length} profile entries shown.`);
}

function setAdminVisibility() {
  signupRequestsSection.hidden = !isAdmin;
  characterAuditSection.hidden = !isAdmin;
  if (accessManagerSection) {
    accessManagerSection.hidden = !isAdmin;
  }
  if (!isAdmin && adminOpsBadge) {
    adminOpsBadge.hidden = true;
  }
}

function normalizeUid(value) {
  return String(value || "").trim();
}

function renderAccessRows() {
  if (!adminAccessRows || !memberAccessRows) {
    return;
  }

  if (!isAdmin) {
    adminAccessRows.innerHTML = "";
    memberAccessRows.innerHTML = "";
    return;
  }

  adminAccessRows.innerHTML = currentAdminUids.length
    ? currentAdminUids
      .map((uid) => `<tr><td class="access-uid-cell">${escapeHtml(uid)}</td><td><button type="button" class="danger" data-access-remove="admin" data-access-uid="${escapeHtml(uid)}">Remove</button></td></tr>`)
      .join("")
    : `<tr><td colspan="2">No admins found.</td></tr>`;

  memberAccessRows.innerHTML = currentMemberUids.length
    ? currentMemberUids
      .map((uid) => `<tr><td class="access-uid-cell">${escapeHtml(uid)}</td><td><button type="button" class="danger" data-access-remove="member" data-access-uid="${escapeHtml(uid)}">Remove</button></td></tr>`)
      .join("")
    : `<tr><td colspan="2">No members found.</td></tr>`;
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

auditClassFilter.addEventListener("change", () => {
  renderCharacterAuditTable();
});

auditActivityFilter.addEventListener("change", () => {
  renderCharacterAuditTable();
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
  setAuthGateState(true);
  setAdminVisibility();
  updateAuthActionButtons({ uid: "demo" });
  updateUidDisplay("demo-local");
  authStatus.textContent = "Demo mode: Firebase config not set (local testing enabled).";
  currentCharacters = loadDemoCharacters();
  currentSignups = loadDemoSignups();
  currentAdminUids = ["demo-local"];
  currentMemberUids = ["demo-local"];
  renderSignupRequestsTable();
  renderCharacterAuditTable();
  renderAccessRows();
} else {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: "select_account" });
  db = getFirestore(app);
  const charactersRef = collection(db, "characters");
  const signupsRef = collection(db, "signups");
  const adminsRef = collection(db, "admins");
  const membersRef = collection(db, "members");

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
      setMessage(signupRequestMessage, errorText, true);
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
    if (unsubscribeAdmins) {
      unsubscribeAdmins();
      unsubscribeAdmins = null;
    }
    if (unsubscribeMembers) {
      unsubscribeMembers();
      unsubscribeMembers = null;
    }

    if (!user) {
      authUid = null;
      isAdmin = false;
      currentCharacters = [];
      currentSignups = [];
      currentAdminUids = [];
      currentMemberUids = [];
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

    unsubscribeCharacters = onSnapshot(
      charactersRef,
      (snapshot) => {
        currentCharacters = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data()
        }));
        renderCharacterAuditTable();
      },
      (error) => {
        setMessage(characterAuditMessage, error.message, true);
      }
    );

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

    unsubscribeAdmins = onSnapshot(
      adminsRef,
      (snapshot) => {
        currentAdminUids = snapshot.docs
          .map((docItem) => String(docItem.id || "").trim())
          .filter(Boolean)
          .sort((left, right) => left.localeCompare(right));
        renderAccessRows();
      },
      (error) => {
        setMessage(accessManagerMessage, error.message, true);
      }
    );

    unsubscribeMembers = onSnapshot(
      membersRef,
      (snapshot) => {
        currentMemberUids = snapshot.docs
          .map((docItem) => String(docItem.id || "").trim())
          .filter(Boolean)
          .sort((left, right) => left.localeCompare(right));
        renderAccessRows();
      },
      (error) => {
        setMessage(accessManagerMessage, error.message, true);
      }
    );
  });
}
