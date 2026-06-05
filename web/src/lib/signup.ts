// Pure helpers for the Signup (home) page — ported 1:1 from js/app.js. Reuses the
// profile-resolution helpers from lib/admin.ts (identical data model) and the date
// helpers from lib/timezone.ts. Status normalization differs from admin's, so it is
// defined here and used consistently throughout the signup page.
import { buildArmoryUrl } from "./armory";
import { buildLogsUrl } from "./wcl";
import { cstToInstant } from "./timezone";
import {
  findProfileCharacterEntry,
  getCharacterMapById,
  resolveProfileForSignup as resolveProfileForSignupBase,
  type CharacterProfile,
  type RaidLite,
  type Signup
} from "./admin";

export type { CharacterProfile, RaidLite, Signup };

export interface ScheduleItem extends Signup {
  __isSignup?: boolean;
  raidLeader?: string;
  tankSlots?: number;
  healerSlots?: number;
  dpsSlots?: number;
  plannedBosses?: string[];
  signupsLocked?: boolean;
  softresLocked?: boolean;
  roleSpecSlots?: Array<{ role?: string; class?: string; spec?: string; count?: number }>;
}

export const SIGNUP_STATUSES = ["requested", "tentative", "decline"];

export function normalizeSignupStatus(value: any): string {
  const normalized = String(value || "").toLowerCase();
  if (SIGNUP_STATUSES.includes(normalized) || normalized === "accept" || normalized === "withdrawn" || normalized === "denied") {
    return normalized;
  }
  const legacyMap: Record<string, string> = { confirmed: "accept", benched: "decline", late: "decline", absent: "decline", pending: "requested" };
  if (legacyMap[normalized]) return legacyMap[normalized];
  return "tentative";
}

const STATUS_LABELS: Record<string, string> = {
  requested: "Request Signup",
  accept: "Accepted",
  tentative: "Bench For Now",
  decline: "Can't Go",
  withdrawn: "Withdrawn",
  denied: "Denied"
};
export function statusLabel(statusValue: any): string {
  return STATUS_LABELS[normalizeSignupStatus(statusValue)] || "Not Signed Up";
}

// ── dates / keys ──────────────────────────────────────────────────────────────
function toDateOnlyString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseDateOnly(dateText?: string): Date | null {
  if (!dateText || !/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return null;
  const parsed = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

export function getRaidDateString(item: any): string {
  if (typeof item.raidDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.raidDate)) return item.raidDate;
  const fallback = new Date(item.createdAt || item.updatedAt || Date.now());
  if (Number.isNaN(fallback.getTime())) return "";
  return toDateOnlyString(fallback);
}

export function getRaidKey(item: any): string {
  if (item.raidId) return `raid:${item.raidId}`;
  return [item.raidName || "", getRaidDateString(item), item.phase || ""].join("|");
}

export function safeId(value: any): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function parseRaidSlots(raidSize?: string): number {
  const matched = String(raidSize || "").match(/^(\d+)-man$/i);
  return matched ? Number(matched[1]) : 0;
}

function parseRaidHourValue(value: any): number | null {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

export function getRaidCutoffDateTime(item: any): Date | null {
  const raidDateText = getRaidDateString(item);
  if (!raidDateText) return null;
  const raidEndHour = parseRaidHourValue(item.raidEnd);
  const fallbackStart = parseRaidHourValue(item.raidStart);
  const cutoffHour = Number.isInteger(raidEndHour as number) ? (raidEndHour as number) : Number.isInteger(fallbackStart as number) ? (fallbackStart as number) : 0;
  return cstToInstant(raidDateText, cutoffHour);
}

export function getRaidStartDateTime(raid: any): Date | null {
  const raidDateText = getRaidDateString(raid);
  if (!raidDateText) return null;
  const startHour = parseRaidHourValue(raid.raidStart);
  if (!Number.isInteger(startHour as number)) return null;
  return cstToInstant(raidDateText, startHour as number);
}

export function isRaidLocked(raid?: any): boolean {
  if (!raid) return false;
  if (raid.signupsLocked === false) return false; // admin manual unlock overrides auto-lock
  if (raid.signupsLocked === true) return true; // admin manual lock
  const startDt = getRaidStartDateTime(raid);
  if (!startDt) return false;
  return Date.now() >= startDt.getTime() - 2 * 60 * 60 * 1000; // auto-lock 2h before start
}

// Raids the viewer is accepted into that still need a soft reserve (not past, not SR-locked).
export function getRaidsNeedingSR(uid: string | null, rows: Signup[], raids: RaidLite[], softReserves: any[]): RaidLite[] {
  if (!uid) return [];
  const seen = new Set<string>();
  const result: RaidLite[] = [];
  for (const signup of rows) {
    if (signup.ownerUid !== uid) continue;
    if (normalizeSignupStatus(signup.status) !== "accept") continue;
    if (!signup.raidId || seen.has(signup.raidId)) continue;
    seen.add(signup.raidId);
    const raid = raids.find((r) => r.id === signup.raidId) as any;
    if (!raid || raid.softresLocked) continue;
    const cutoff = getRaidCutoffDateTime(raid);
    if (cutoff && cutoff.getTime() < Date.now()) continue;
    if (!findSoftReserveForSignup(signup, softReserves)) result.push(raid);
  }
  return result;
}

export function viewerNeedsSR(raidId: string, uid: string | null, rows: Signup[], softReserves: any[]): boolean {
  if (!raidId || !uid) return false;
  const viewerSignup = rows.find((s) => s.raidId === raidId && s.ownerUid === uid && normalizeSignupStatus(s.status) === "accept");
  if (!viewerSignup) return false;
  return !findSoftReserveForSignup(viewerSignup, softReserves, raidId);
}

// ── row hydration / scheduling ────────────────────────────────────────────────
export function sortRows<T extends Record<string, any>>(rows: T[]): T[] {
  return [...rows].sort((left, right) => {
    const leftMs = parseDateOnly(getRaidDateString(left))?.getTime() || 0;
    const rightMs = parseDateOnly(getRaidDateString(right))?.getTime() || 0;
    if (leftMs !== rightMs) return leftMs - rightMs;
    const lc = new Date(left.createdAt || 0).getTime();
    const rc = new Date(right.createdAt || 0).getTime();
    return lc - rc;
  });
}

function hydrateRowsWithRaidWindow(rows: Signup[], raids: RaidLite[]): ScheduleItem[] {
  if (!Array.isArray(rows) || !rows.length) return [];
  const raidsById = new Map(raids.map((raid) => [raid.id, raid as any]));
  return rows.map((row) => {
    const matched = (row.raidId && raidsById.get(row.raidId)) || null;
    if (!matched) return row as ScheduleItem;
    return {
      ...row,
      raidDate: matched.raidDate || row.raidDate,
      raidName: matched.raidName || row.raidName,
      phase: matched.phase ?? row.phase,
      runType: matched.runType || row.runType,
      raidSize: matched.raidSize || row.raidSize,
      raidStart: Number.isInteger(matched.raidStart) ? matched.raidStart : row.raidStart,
      raidEnd: Number.isInteger(matched.raidEnd) ? matched.raidEnd : row.raidEnd,
      raidLeader: matched.raidLeader ?? (row as any).raidLeader ?? "",
      tankSlots: matched.tankSlots ?? (row as any).tankSlots ?? 0,
      healerSlots: matched.healerSlots ?? (row as any).healerSlots ?? 0,
      dpsSlots: matched.dpsSlots ?? (row as any).dpsSlots ?? 0,
      plannedBosses: matched.plannedBosses ?? (row as any).plannedBosses ?? [],
      roleSpecSlots: matched.roleSpecSlots ?? (row as any).roleSpecSlots ?? [],
      signupsLocked: matched.signupsLocked ?? (row as any).signupsLocked
    } as ScheduleItem;
  });
}

export function buildScheduleItems(signups: Signup[], raids: RaidLite[]): ScheduleItem[] {
  const activeRaidIds = new Set(raids.map((r) => r.id));
  const activeSignups = signups.filter((s) => !s.raidId || activeRaidIds.has(s.raidId));
  const signupItems = hydrateRowsWithRaidWindow(activeSignups, raids).map((entry) => ({ ...entry, __isSignup: true }));
  const raidsWithSignups = new Set(signupItems.map((entry) => entry.raidId).filter(Boolean));
  const raidOnlyItems: ScheduleItem[] = raids
    .filter((raid) => !raidsWithSignups.has(raid.id))
    .map((raid) => ({ ...(raid as any), raidId: raid.id, __isSignup: false }));
  return sortRows([...signupItems, ...raidOnlyItems]);
}

export interface RaidGroup {
  key: string;
  summary: ScheduleItem;
  signups: ScheduleItem[];
}
export function groupRowsByRaid(rows: ScheduleItem[]): RaidGroup[] {
  const grouped = new Map<string, RaidGroup>();
  rows.forEach((item) => {
    const key = getRaidKey(item);
    if (!grouped.has(key)) grouped.set(key, { key, summary: item, signups: [] });
    grouped.get(key)!.signups.push(item);
  });
  return Array.from(grouped.values()).sort((left, right) => {
    const ld = parseDateOnly(getRaidDateString(left.summary))?.getTime() || 0;
    const rd = parseDateOnly(getRaidDateString(right.summary))?.getTime() || 0;
    if (ld !== rd) return ld - rd;
    return String(left.summary.raidName || "").localeCompare(String(right.summary.raidName || ""));
  });
}

// ── roster / role composition ─────────────────────────────────────────────────
export function buildRoleSummary(signups: any[]): Record<"Tank" | "Healer" | "DPS", number> {
  const totals = { Tank: 0, Healer: 0, DPS: 0 } as Record<"Tank" | "Healer" | "DPS", number>;
  signups.forEach((signup) => {
    if (normalizeSignupStatus(signup.status) !== "accept") return;
    const role = signup.mainRole || signup.role;
    if (role in totals) (totals as any)[role] += 1;
  });
  return totals;
}

export interface RosterInfo {
  signed: number;
  size: number;
  needed: number;
  status: string;
}
export function buildRosterMap(items: ScheduleItem[]): Map<string, RosterInfo> {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    if (item.__isSignup === false || !item.characterId) return;
    if (normalizeSignupStatus(item.status) !== "accept") return;
    const key = getRaidKey(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const rosterMap = new Map<string, RosterInfo>();
  items.forEach((item) => {
    const key = getRaidKey(item);
    const signed = counts.get(key) || 0;
    const size = parseRaidSlots(item.raidSize);
    const needed = Math.max(0, size - signed);
    let status = "roster-open";
    if (size > 0 && needed === 0) status = "roster-full";
    else if (size > 0 && signed >= Math.ceil(size / 2)) status = "roster-mid";
    rosterMap.set(key, { signed, size, needed, status });
  });
  return rosterMap;
}

export function getRoleTargets(raidItem: any): Record<"Tank" | "Healer" | "DPS", number> {
  const raidSize = typeof raidItem === "string" ? raidItem : raidItem?.raidSize || "";
  const size = parseRaidSlots(raidSize);
  if (typeof raidItem === "object" && raidItem !== null) {
    const hasCfg = raidItem.tankSlots != null || raidItem.healerSlots != null || raidItem.dpsSlots != null;
    if (hasCfg) {
      return { Tank: Number(raidItem.tankSlots) || 0, Healer: Number(raidItem.healerSlots) || 0, DPS: Number(raidItem.dpsSlots) || 0 };
    }
  }
  if (size >= 25) return { Tank: 3, Healer: 6, DPS: size - 9 };
  if (size >= 10) return { Tank: 2, Healer: 3, DPS: size - 5 };
  return { Tank: 2, Healer: 3, DPS: 5 };
}

// ── character resolution ──────────────────────────────────────────────────────
export function resolveSignupCharacterData(signup: Signup, characters: CharacterProfile[]): any {
  const profilesById = getCharacterMapById(characters);
  const matchedCharacter = resolveProfileForSignupBase(signup, profilesById, characters);
  if (!matchedCharacter) {
    const fallbackName = signup.profileCharacterName || signup.characterName || "";
    return {
      ...signup,
      characterName: fallbackName,
      wowClass: signup.wowClass || "",
      role: signup.role || "",
      mainRole: signup.mainRole || signup.role || "",
      offRole: signup.offRole || "",
      mainSpecialization: signup.mainSpecialization || signup.specialization || "",
      offSpecialization: signup.offSpecialization || "",
      specialization: signup.mainSpecialization || signup.specialization || "",
      armoryUrl: buildArmoryUrl(fallbackName) || signup.armoryUrl || "",
      logsUrl: signup.logsUrl || buildLogsUrl(fallbackName) || ""
    };
  }
  const selectedEntry = findProfileCharacterEntry(matchedCharacter, signup.profileCharacterKey || "", signup.profileCharacterName || "");
  const charName = selectedEntry?.characterName || signup.profileCharacterName || matchedCharacter.characterName || signup.characterName || "";
  return {
    ...signup,
    characterName: charName,
    wowClass: selectedEntry?.wowClass || matchedCharacter.wowClass || signup.wowClass || "",
    role: selectedEntry?.mainRole || matchedCharacter.role || signup.role || "",
    mainRole: selectedEntry?.mainRole || matchedCharacter.mainRole || matchedCharacter.role || signup.mainRole || signup.role || "",
    offRole: selectedEntry?.offRole || matchedCharacter.offRole || matchedCharacter.mainRole || matchedCharacter.role || signup.offRole || "",
    mainSpecialization: selectedEntry?.mainSpecialization || matchedCharacter.mainSpecialization || matchedCharacter.specialization || signup.mainSpecialization || signup.specialization || "",
    offSpecialization: selectedEntry?.offSpecialization || matchedCharacter.offSpecialization || signup.offSpecialization || "",
    specialization: selectedEntry?.mainSpecialization || matchedCharacter.specialization || signup.specialization || "",
    armoryUrl: selectedEntry?.armoryUrl || buildArmoryUrl(charName) || matchedCharacter.armoryUrl || signup.armoryUrl || "",
    logsUrl: selectedEntry?.logsUrl || signup.logsUrl || buildLogsUrl(charName) || ""
  };
}

// ── signup writes: slot capacity + auto-approve + payload ─────────────────────
export function hasRoleSlotCapacity(raidId: string, role: string, raids: RaidLite[], rows: Signup[], characters: CharacterProfile[]): boolean {
  if (!raidId || !role) return true;
  const raid = raids.find((r) => r.id === raidId);
  if (!raid) return true;
  const hasCfg = raid.tankSlots != null || raid.healerSlots != null || raid.dpsSlots != null;
  if (!hasCfg) return true;
  const limits: Record<string, number> = { Tank: Number(raid.tankSlots) || 0, Healer: Number(raid.healerSlots) || 0, DPS: Number(raid.dpsSlots) || 0 };
  if (!(role in limits)) return true;
  let acceptedCount = 0;
  for (const s of rows) {
    if (String(s.raidId || "") !== raidId) continue;
    if (normalizeSignupStatus(s.status) !== "accept") continue;
    const resolved = resolveSignupCharacterData(s, characters);
    if ((resolved.mainRole || resolved.role) === role) acceptedCount++;
  }
  return acceptedCount < limits[role];
}

export function autoApproveIfAdmin(status: string, raidId: string, role: string, isAdmin: boolean, raids: RaidLite[], rows: Signup[], characters: CharacterProfile[]): string {
  if (isAdmin && status === "requested") {
    if (raidId && role && !hasRoleSlotCapacity(raidId, role, raids, rows, characters)) return "requested";
    return "accept";
  }
  return status;
}

function toIntegerOrNull(value: any): number | null {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

export function normalizeSignupPayloadForRules(payload: any): any | null {
  const phase = toIntegerOrNull(payload.phase);
  const raidStart = toIntegerOrNull(payload.raidStart);
  const raidEnd = toIntegerOrNull(payload.raidEnd);
  if (phase == null || phase < 1 || phase > 5) return null;
  if (raidStart == null || raidStart < 0 || raidStart > 23) return null;
  if (raidEnd == null || raidEnd < 1 || raidEnd > 24 || raidStart >= raidEnd) return null;
  return { ...payload, phase, raidStart, raidEnd };
}

// ── soft reserve matching for roster ──────────────────────────────────────────
export function findSoftReserveForSignup(signup: any, softReserves: any[], raidIdOverride: string | null = null): any | null {
  if (!signup) return null;
  const raidId = raidIdOverride || signup.raidId;
  if (!raidId) return null;
  const nameLc = String(signup.profileCharacterName || signup.characterName || "").trim().toLowerCase();
  return (
    softReserves.find((r) => {
      if (r.raidId !== raidId) return false;
      if (r.characterId === signup.characterId) return true;
      if (nameLc && String(r.characterName || "").trim().toLowerCase() === nameLc) {
        if (r.ownerUid && signup.ownerUid && r.ownerUid === signup.ownerUid) return true;
        if (typeof r.characterId === "string" && signup.characterId && r.characterId.startsWith(signup.characterId + "::")) return true;
      }
      return false;
    }) || null
  );
}
