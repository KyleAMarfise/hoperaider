// Pure helpers for the Admin page — ported 1:1 from js/admin.js. Everything here is a
// pure function of the raw Firestore collections (passed in), so the React component
// can compute derived view-models without module-global state.
import { buildArmoryUrl } from "./armory";
import { buildLogsUrl } from "./wcl";
import { WOW_CLASS_COLORS } from "../constants/classes";

export interface Signup {
  id: string;
  ownerUid?: string;
  ownerEmail?: string;
  email?: string;
  characterId?: string;
  profileCharacterKey?: string;
  profileCharacterName?: string;
  characterName?: string;
  wowClass?: string;
  mainRole?: string;
  role?: string;
  offRole?: string;
  mainSpecialization?: string;
  specialization?: string;
  offSpecialization?: string;
  profileName?: string;
  displayName?: string;
  armoryUrl?: string;
  logsUrl?: string;
  raidId?: string;
  raidName?: string;
  raidDate?: string;
  phase?: number | string;
  runType?: string;
  raidSize?: string;
  raidStart?: number;
  raidEnd?: number;
  status?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface AltCharacter {
  characterName?: string;
  wowClass?: string;
  mainRole?: string;
  offRole?: string;
  mainSpecialization?: string;
  offSpecialization?: string;
  armoryUrl?: string;
  logsUrl?: string;
}

export interface CharacterProfile {
  id: string;
  ownerUid?: string;
  profileName?: string;
  email?: string;
  ownerEmail?: string;
  displayName?: string;
  characterName?: string;
  wowClass?: string;
  mainRole?: string;
  role?: string;
  offRole?: string;
  mainSpecialization?: string;
  specialization?: string;
  offSpecialization?: string;
  armoryUrl?: string;
  logsUrl?: string;
  altCharacters?: AltCharacter[];
}

export interface CharacterEntry {
  key: string;
  characterName: string;
  wowClass: string;
  mainRole: string;
  offRole: string;
  mainSpecialization: string;
  offSpecialization: string;
  armoryUrl: string;
  logsUrl: string;
}

export interface RaidLite {
  id: string;
  raidName?: string;
  raidDate?: string;
  phase?: number | string;
  runType?: string;
  raidSize?: string;
  raidStart?: number;
  raidEnd?: number;
  tankSlots?: number | null;
  healerSlots?: number | null;
  dpsSlots?: number | null;
}

// ── status ──────────────────────────────────────────────────────────────────────
export function normalizeUid(value: any): string {
  return String(value || "").trim();
}

export function normalizeSignupStatus(value: any): string {
  const normalized = String(value || "").toLowerCase();
  if (["requested", "accept", "tentative", "decline", "withdrawn", "denied"].includes(normalized)) return normalized;
  if (normalized === "confirmed") return "accept";
  if (normalized === "pending") return "requested";
  return "decline";
}

const STATUS_LABELS: Record<string, string> = {
  requested: "Request Signup",
  accept: "Accepted",
  tentative: "Bench For Now",
  decline: "Can't Go",
  withdrawn: "Withdrawn",
  denied: "Denied"
};
export function signupStatusLabel(value: any): string {
  return STATUS_LABELS[normalizeSignupStatus(value)] || "Unknown";
}

// ── dates / hours ─────────────────────────────────────────────────────────────
export function parseDateOnly(dateText?: string): Date | null {
  if (!dateText || !/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return null;
  const parsed = new Date(`${dateText}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatMonthDayYear(dateText?: string): string {
  const parsed = parseDateOnly(dateText);
  if (!parsed) return "—";
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${month}-${day}-${parsed.getFullYear()}`;
}

function parseRaidHour(value: any, min: number, max: number): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

export function formatCstHour(hourValue: number): string {
  if (!Number.isInteger(hourValue) || hourValue < 0 || hourValue > 24) return "?";
  if (hourValue === 0 || hourValue === 24) return "12 AM";
  if (hourValue === 12) return "12 PM";
  if (hourValue > 12) return `${hourValue - 12} PM`;
  return `${hourValue} AM`;
}

function getSignupCutoffDate(signup: { raidDate?: string; raidStart?: number; raidEnd?: number }): Date | null {
  const raidDate = parseDateOnly(signup.raidDate || "");
  if (!raidDate) return null;
  const raidEnd = parseRaidHour(signup.raidEnd, 1, 24);
  const fallbackStart = parseRaidHour(signup.raidStart, 0, 23);
  const cutoffHour = Number.isInteger(raidEnd as number) ? (raidEnd as number) : Number.isInteger(fallbackStart as number) ? (fallbackStart as number) : 0;
  const cutoff = new Date(raidDate);
  cutoff.setHours(cutoffHour, 0, 0, 0);
  return cutoff;
}

export function isActiveSignup(signup: { raidDate?: string; raidStart?: number; raidEnd?: number }): boolean {
  const cutoff = getSignupCutoffDate(signup);
  if (!cutoff) return true;
  return cutoff.getTime() >= Date.now();
}

export function sortRaidsForAssignment<T extends RaidLite>(raids: T[]): T[] {
  return [...raids].sort((left, right) => {
    const leftDate = parseDateOnly(left.raidDate || "")?.getTime() || 0;
    const rightDate = parseDateOnly(right.raidDate || "")?.getTime() || 0;
    if (leftDate !== rightDate) return leftDate - rightDate;
    return (Number(left.raidStart) || 0) - (Number(right.raidStart) || 0);
  });
}

export function getUpcomingRaidsForAssignment(raids: RaidLite[]): RaidLite[] {
  return sortRaidsForAssignment(raids).filter((raid) => isActiveSignup(raid));
}

export function formatRaidAssignmentLabel(raid: RaidLite): string {
  const dateLabel = formatMonthDayYear(raid.raidDate || "");
  const start = formatCstHour(Number(raid.raidStart));
  const end = formatCstHour(Number(raid.raidEnd));
  return `${dateLabel} • ${raid.raidName || "Raid"} • ${start} - ${end} CST`;
}

// ── profile / character resolution ──────────────────────────────────────────────
export function getProfileLabel(profile?: CharacterProfile | null): string {
  if (!profile) return "";
  const irlName = String(profile.profileName || "").trim();
  const mainCharacter = String(profile.characterName || "").trim();
  if (irlName && mainCharacter) return `${irlName}-${mainCharacter}`;
  return irlName || mainCharacter || String(profile.id || "");
}

export function getProfileCharacterEntries(profile?: CharacterProfile | null): CharacterEntry[] {
  const entries: CharacterEntry[] = [];
  if (!profile) return entries;
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
    if (!alt || !alt.characterName) return;
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

export function findProfileCharacterEntry(profile: CharacterProfile | null, characterKey = "", characterName = ""): CharacterEntry | null {
  const entries = getProfileCharacterEntries(profile);
  if (characterKey) {
    const byKey = entries.find((entry) => entry.key === characterKey);
    if (byKey) return byKey;
  }
  if (characterName) {
    const normalizedName = String(characterName || "").trim().toLowerCase();
    const byName = entries.find((entry) => String(entry.characterName || "").trim().toLowerCase() === normalizedName);
    if (byName) return byName;
  }
  return entries[0] || null;
}

export function getCharacterMapById(characters: CharacterProfile[]): Map<string, CharacterProfile> {
  return new Map(characters.map((entry) => [entry.id, entry]));
}

export function resolveProfileForSignup(signup: Signup, profilesById: Map<string, CharacterProfile>, characters: CharacterProfile[]): CharacterProfile | null {
  const byId = signup.characterId ? profilesById.get(signup.characterId) : null;
  if (byId) return byId;
  const ownerUid = normalizeUid(signup.ownerUid);
  if (!ownerUid) return null;
  const ownerProfiles = characters.filter((entry) => normalizeUid(entry.ownerUid || entry.id) === ownerUid);
  if (!ownerProfiles.length) return null;
  const targetCharacterName = String(signup.profileCharacterName || signup.characterName || "").trim().toLowerCase();
  if (targetCharacterName) {
    const matched = ownerProfiles.find((profile) =>
      getProfileCharacterEntries(profile).some((entry) => String(entry.characterName || "").trim().toLowerCase() === targetCharacterName)
    );
    if (matched) return matched;
  }
  return ownerProfiles[0];
}

export function resolveSignupCharacterAttributes(signup: Signup, profilesById: Map<string, CharacterProfile>, characters: CharacterProfile[]) {
  const profile = resolveProfileForSignup(signup, profilesById, characters);
  if (!profile) {
    return {
      wowClass: signup.wowClass || "—",
      specialization: signup.mainSpecialization || signup.specialization || "—"
    };
  }
  const selectedEntry = findProfileCharacterEntry(profile, String(signup.profileCharacterKey || "main"), String(signup.profileCharacterName || signup.characterName || ""));
  return {
    wowClass: selectedEntry?.wowClass || profile.wowClass || signup.wowClass || "—",
    specialization:
      selectedEntry?.mainSpecialization || profile.mainSpecialization || profile.specialization || signup.mainSpecialization || signup.specialization || "—"
  };
}

export function resolveSignupRole(signup: Signup, profilesById: Map<string, CharacterProfile>, characters: CharacterProfile[]): string {
  const profile = resolveProfileForSignup(signup, profilesById, characters);
  const selectedEntry = profile
    ? findProfileCharacterEntry(profile, String(signup.profileCharacterKey || "main"), String(signup.profileCharacterName || signup.characterName || ""))
    : null;
  return String(signup.mainRole || signup.role || selectedEntry?.mainRole || profile?.mainRole || profile?.role || "").trim();
}

export function resolveProfileCharacterForAssignment(
  ownerUid: string,
  characterName: string,
  characters: CharacterProfile[]
): { profile: CharacterProfile; characterEntry: CharacterEntry } | null {
  const normalizedOwnerUid = normalizeUid(ownerUid);
  const normalizedCharacterName = String(characterName || "").trim().toLowerCase();
  if (!normalizedOwnerUid || !normalizedCharacterName) return null;
  const ownerProfiles = characters.filter((entry) => normalizeUid(entry.ownerUid || entry.id) === normalizedOwnerUid);
  for (const profile of ownerProfiles) {
    const matchedEntry = getProfileCharacterEntries(profile).find(
      (entry) => String(entry.characterName || "").trim().toLowerCase() === normalizedCharacterName
    );
    if (matchedEntry) return { profile, characterEntry: matchedEntry };
  }
  return null;
}

// Validate + shape an assignment write so it passes the strict Firestore rules.
export function normalizeAssignmentPayloadForRules(payload: any): any | null {
  const phase = Number(payload.phase);
  const raidStart = Number(payload.raidStart);
  const raidEnd = Number(payload.raidEnd);
  if (!Number.isInteger(phase) || phase < 1 || phase > 5) return null;
  if (!Number.isInteger(raidStart) || raidStart < 0 || raidStart > 23) return null;
  if (!Number.isInteger(raidEnd) || raidEnd < 1 || raidEnd > 24 || raidStart >= raidEnd) return null;
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

export function findExistingAssignment(uid: string, raidId: string, characterName: string, signups: Signup[]): Signup | null {
  const normalizedUid = normalizeUid(uid);
  const normalizedRaidId = String(raidId || "").trim();
  const normalizedCharacterName = String(characterName || "").trim().toLowerCase();
  if (!normalizedUid || !normalizedRaidId || !normalizedCharacterName) return null;
  return (
    signups.find(
      (signup) =>
        normalizeUid(signup.ownerUid) === normalizedUid &&
        String(signup.raidId || "") === normalizedRaidId &&
        String(signup.profileCharacterName || signup.characterName || "").trim().toLowerCase() === normalizedCharacterName
    ) || null
  );
}

// ── role-slot constraint ──────────────────────────────────────────────────────
export function checkRoleSlotConstraint(signup: Signup, raids: RaidLite[], signups: Signup[], characters: CharacterProfile[]): string | null {
  const raidId = String(signup.raidId || "");
  if (!raidId) return null;
  const raid = raids.find((r) => r.id === raidId);
  if (!raid) return null;
  const hasCfg = raid.tankSlots != null || raid.healerSlots != null || raid.dpsSlots != null;
  if (!hasCfg) return null;
  const limits: Record<string, number> = {
    Tank: Number(raid.tankSlots) || 0,
    Healer: Number(raid.healerSlots) || 0,
    DPS: Number(raid.dpsSlots) || 0
  };
  const profilesById = getCharacterMapById(characters);
  const role = resolveSignupRole(signup, profilesById, characters);
  if (!role || !(role in limits)) return null;
  const acceptedForRole = signups.filter(
    (s) => String(s.raidId || "") === raidId && normalizeSignupStatus(s.status) === "accept" && resolveSignupRole(s, profilesById, characters) === role
  ).length;
  if (acceptedForRole >= limits[role]) {
    return `Cannot accept: ${role} slots are full (${acceptedForRole}/${limits[role]}). Remove an accepted ${role} first.`;
  }
  return null;
}

// ── raid composition summary ────────────────────────────────────────────────────
const CLASS_ORDER = ["Warrior", "Paladin", "Hunter", "Rogue", "Priest", "Shaman", "Mage", "Warlock", "Druid"];

export interface RaidComp {
  raidLabel: string;
  acceptedCount: number;
  totalSlots: number;
  openSpots: number;
  classChips: Array<{ cls: string; color: string; count: number }>;
  roleChips: Array<{ label: string; count: number; slots: number | null; isFull: boolean }>;
}

export function buildRaidComp(raidSignups: Signup[], allSignups: Signup[], raids: RaidLite[], characters: CharacterProfile[]): RaidComp | null {
  const raidId = raidSignups[0]?.raidId;
  if (!raidId) return null;
  const profilesById = getCharacterMapById(characters);
  const raidInfo = raidSignups[0];
  const raid = raids.find((r) => r.id === raidId);
  const raidLabel = `${raidInfo?.raidName || "Raid"} — ${formatMonthDayYear(raidInfo?.raidDate || "")}`;
  const accepted = allSignups.filter((s) => s.raidId === raidId && normalizeSignupStatus(s.status) === "accept");

  const raidSizeMatch = String(raid?.raidSize || "").match(/^(\d+)-man$/i);
  const totalSlots = raidSizeMatch ? Number(raidSizeMatch[1]) : 0;
  const tankSlots = raid?.tankSlots != null ? Number(raid.tankSlots) : null;
  const healerSlots = raid?.healerSlots != null ? Number(raid.healerSlots) : null;
  const dpsSlots = raid?.dpsSlots != null ? Number(raid.dpsSlots) : null;

  const classCounts: Record<string, number> = {};
  const roleCounts: Record<string, number> = { Tank: 0, Healer: 0, DPS: 0 };
  for (const s of accepted) {
    const attrs = resolveSignupCharacterAttributes(s, profilesById, characters);
    const cls = attrs.wowClass || "—";
    classCounts[cls] = (classCounts[cls] || 0) + 1;
    const role = resolveSignupRole(s, profilesById, characters);
    if (roleCounts[role] !== undefined) roleCounts[role]++;
  }

  const classChips = CLASS_ORDER.filter((cls) => classCounts[cls]).map((cls) => ({
    cls,
    color: WOW_CLASS_COLORS[cls] || "#ccc",
    count: classCounts[cls]
  }));

  const roleChips = [
    { label: "Tank", count: roleCounts.Tank, slots: tankSlots },
    { label: "Healer", count: roleCounts.Healer, slots: healerSlots },
    { label: "DPS", count: roleCounts.DPS, slots: dpsSlots }
  ].map((r) => ({ ...r, isFull: r.slots != null && r.count >= r.slots }));

  const openSpots = totalSlots > 0 ? totalSlots - accepted.length : 0;
  return { raidLabel, acceptedCount: accepted.length, totalSlots, openSpots, classChips, roleChips };
}

// ── audit rows ──────────────────────────────────────────────────────────────────
export interface AuditCharEntry extends CharacterEntry {
  isMain: boolean;
  characterId: string;
  acceptedCount: number;
}
export interface AuditRow {
  uid: string;
  displayName: string;
  profileName: string;
  email: string;
  role: "owner" | "admin" | "member" | "remove";
  acceptedTotal: number;
  docks: number;
  characterEntries: AuditCharEntry[];
  tooltip: string;
  searchIndex: string;
}

export interface DirectoryMeta {
  uid: string;
  displayName?: string;
  profileName?: string;
  email?: string;
}

function buildAuditSearchIndex(row: AuditRow): string {
  const baseParts = [row.uid, row.displayName, row.profileName, row.email, row.role, String(row.acceptedTotal || 0), row.tooltip];
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

export function buildUserAuditRows(
  signups: Signup[],
  characters: CharacterProfile[],
  adminUids: string[],
  memberUids: string[],
  ownerUids: string[],
  userDirectory: Map<string, DirectoryMeta>,
  docksMap: Map<string, number>
): AuditRow[] {
  const profilesById = getCharacterMapById(characters);
  const acceptedTotals = new Map<string, number>();
  const characterSummariesByUid = new Map<string, Map<string, AuditCharEntry>>();
  const profileNamesByUid = new Map<string, string>();
  const emailsByUid = new Map<string, string>();

  const ensureCharacterMap = (uid: string) => {
    if (!characterSummariesByUid.has(uid)) characterSummariesByUid.set(uid, new Map());
    return characterSummariesByUid.get(uid)!;
  };

  const getUserDirectoryMeta = (uid: string): DirectoryMeta | null => {
    const normalized = normalizeUid(uid);
    if (!normalized) return null;
    const fromDirectory = userDirectory.get(normalized);
    if (fromDirectory) return fromDirectory;
    const fromCharacter = characters.find((entry) => normalizeUid(entry.ownerUid || entry.id) === normalized);
    if (!fromCharacter) return null;
    return {
      uid: normalized,
      displayName: String(fromCharacter.displayName || "").trim(),
      profileName: String(fromCharacter.profileName || "").trim(),
      email: String(fromCharacter.email || fromCharacter.ownerEmail || "").trim()
    };
  };

  signups.forEach((signup) => {
    const uid = normalizeUid(signup.ownerUid);
    if (!uid) return;
    const signupProfileName = String(signup.profileName || signup.displayName || "").trim();
    if (signupProfileName && !profileNamesByUid.has(uid)) profileNamesByUid.set(uid, signupProfileName);
    const signupEmail = String(signup.ownerEmail || signup.email || "").trim();
    if (signupEmail && !emailsByUid.has(uid)) emailsByUid.set(uid, signupEmail);

    const profile = resolveProfileForSignup(signup, profilesById, characters);
    const profileNameFromProfile = String(profile?.profileName || "").trim();
    if (profileNameFromProfile && !profileNamesByUid.has(uid)) profileNamesByUid.set(uid, profileNameFromProfile);
    const selectedEntry = profile
      ? findProfileCharacterEntry(profile, String(signup.profileCharacterKey || "main"), String(signup.profileCharacterName || signup.characterName || ""))
      : null;
    const characterName = String(
      signup.profileCharacterName || signup.characterName || selectedEntry?.characterName || profile?.characterName || ""
    ).trim();
    if (characterName) {
      const key = characterName.toLowerCase();
      const bucket = ensureCharacterMap(uid);
      const previous = bucket.get(key);
      const acceptedForCharacter =
        normalizeSignupStatus(signup.status) === "accept" ? (previous?.acceptedCount || 0) + 1 : previous?.acceptedCount || 0;
      bucket.set(key, {
        isMain: Boolean(selectedEntry?.key === "main"),
        key: String(selectedEntry?.key || previous?.key || "main"),
        characterId: previous?.characterId || "",
        characterName,
        wowClass: String(signup.wowClass || selectedEntry?.wowClass || profile?.wowClass || previous?.wowClass || "").trim() || "—",
        mainRole:
          String(signup.mainRole || signup.role || selectedEntry?.mainRole || profile?.mainRole || profile?.role || previous?.mainRole || "").trim() || "—",
        mainSpecialization:
          String(
            signup.mainSpecialization ||
              signup.specialization ||
              selectedEntry?.mainSpecialization ||
              profile?.mainSpecialization ||
              profile?.specialization ||
              previous?.mainSpecialization ||
              ""
          ).trim() || "—",
        offRole: String(signup.offRole || selectedEntry?.offRole || profile?.offRole || previous?.offRole || "").trim() || "—",
        offSpecialization:
          String(signup.offSpecialization || selectedEntry?.offSpecialization || profile?.offSpecialization || previous?.offSpecialization || "").trim() ||
          "—",
        armoryUrl: String(signup.armoryUrl || previous?.armoryUrl || buildArmoryUrl(characterName)).trim(),
        logsUrl: String(signup.logsUrl || selectedEntry?.logsUrl || previous?.logsUrl || buildLogsUrl(characterName)).trim(),
        acceptedCount: acceptedForCharacter
      });
    }

    if (normalizeSignupStatus(signup.status) !== "accept") return;
    acceptedTotals.set(uid, (acceptedTotals.get(uid) || 0) + 1);
  });

  const adminSet = new Set(adminUids);
  const memberSet = new Set(memberUids);
  const uidSet = new Set<string>([...adminUids, ...memberUids, ...acceptedTotals.keys()]);

  characters.forEach((profile) => {
    const uid = normalizeUid(profile.ownerUid || profile.id);
    if (!uid) return;
    uidSet.add(uid);
    const profileNameFromProfile = String(profile.profileName || "").trim();
    if (profileNameFromProfile && !profileNamesByUid.has(uid)) profileNamesByUid.set(uid, profileNameFromProfile);
    const emailFromProfile = String(profile.email || profile.ownerEmail || "").trim();
    if (emailFromProfile && !emailsByUid.has(uid)) emailsByUid.set(uid, emailFromProfile);

    const bucket = ensureCharacterMap(uid);
    getProfileCharacterEntries(profile).forEach((entry) => {
      const characterName = String(entry.characterName || "").trim();
      if (!characterName) return;
      const key = characterName.toLowerCase();
      const previous = bucket.get(key);
      bucket.set(key, {
        isMain: Boolean(entry.key === "main"),
        key: String(entry.key || previous?.key || "main"),
        characterId: String(profile.id || previous?.characterId || ""),
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

  const rows: AuditRow[] = Array.from(uidSet).map((uid) => {
    const normalizedUid = normalizeUid(uid);
    const source: DirectoryMeta = getUserDirectoryMeta(normalizedUid) || { uid: normalizedUid };
    const email = String(source.email || emailsByUid.get(normalizedUid) || "").trim();
    const emailLocalPart = email.includes("@") ? email.split("@")[0] : "";
    const profileName = String(
      source.profileName || profileNamesByUid.get(normalizedUid) || source.displayName || emailLocalPart || "No Profile Name"
    ).trim();
    const role = ownerUids.includes(normalizedUid)
      ? "owner"
      : adminSet.has(normalizedUid)
      ? "admin"
      : memberSet.has(normalizedUid)
      ? "member"
      : "remove";
    const acceptedTotal = acceptedTotals.get(normalizedUid) || 0;
    const docks = docksMap.get(normalizedUid) || 0;
    const characterEntries = Array.from(characterSummariesByUid.get(normalizedUid)?.values() || []).sort((left, right) =>
      left.characterName.localeCompare(right.characterName, undefined, { sensitivity: "base" })
    );
    const tooltip = [`Discord Name: ${profileName || "Unknown"}`, `Google Email: ${email || "Unknown"}`].join("\n");
    return { uid: normalizedUid, displayName: profileName, profileName, email, role, acceptedTotal, docks, characterEntries, tooltip, searchIndex: "" };
  });

  rows.forEach((row) => {
    row.searchIndex = buildAuditSearchIndex(row);
  });

  return rows.sort((left, right) => left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" }));
}
