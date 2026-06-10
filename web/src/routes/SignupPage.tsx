import { useMemo, useState, type ReactNode } from "react";
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useCollection } from "../hooks/useCollection";
import { ProfileModal } from "../components/signup/ProfileModal";
import { WclParsesCell } from "../components/common/Parses";
import { WOW_CLASS_COLORS, ROLE_ICONS } from "../constants/classes";
import { buildArmoryUrl } from "../lib/armory";
import { buildLogsUrl } from "../lib/wcl";
import { sendDiscordSignupNotification } from "../lib/discord";
import { QUALITY_COLORS } from "../lib/loot";
import { ItemTooltipProvider, useItemTooltipCtx } from "../components/common/ItemTooltip";
import { hourLabel, buildTimezoneLines, detectViewerTimezoneLabel } from "../lib/timezone";
import {
  getProfileCharacterEntries,
  findProfileCharacterEntry,
  getProfileLabel,
  formatMonthDayYear,
  type CharacterProfile,
  type CharacterEntry,
  type RaidLite
} from "../lib/admin";
import {
  autoApproveIfAdmin,
  buildRoleSummary,
  buildRosterMap,
  buildScheduleItems,
  findSoftReserveForSignup,
  getRaidCutoffDateTime,
  getRaidDateString,
  getRaidKey,
  getRaidsNeedingSR,
  getRoleTargets,
  groupRowsByRaid,
  isRaidLocked,
  normalizeSignupStatus,
  normalizeSignupPayloadForRules,
  parseRaidSlots,
  resolveSignupCharacterData,
  safeId,
  statusLabel,
  viewerNeedsSR,
  SIGNUP_STATUSES,
  type RaidGroup,
  type ScheduleItem,
  type Signup
} from "../lib/signup";

const VIEWER_TZ = detectViewerTimezoneLabel();

// ── time helpers ────────────────────────────────────────────────────────────────
function RaidWindow({ start, end }: { start?: number; end?: number }) {
  const lines = useMemo(() => buildTimezoneLines(Number.isInteger(start) ? (start as number) : null, Number.isInteger(end) ? (end as number) : null), [start, end]);
  if (!lines.length) return <>—</>;
  return (
    <>
      {lines.map((l) => (
        <span key={l.label} className={`raid-time-line${l.label === "CST" ? " raid-time-cst" : ""}${VIEWER_TZ && l.label === VIEWER_TZ ? " raid-time-local" : ""}`}>
          {l.text}
        </span>
      ))}
    </>
  );
}

function formatRaidDate(dateText?: string): string {
  if (!dateText || !/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return "—";
  const d = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("en-US", { weekday: "short" })}, ${formatMonthDayYear(dateText)}`;
}

function ExternalLink({ url, label }: { url?: string; label: string }) {
  const u = String(url || "").trim();
  if (!u) return <>—</>;
  return (
    <a href={u} target="_blank" rel="noreferrer" title={label}>
      ↗
    </a>
  );
}

// ── role composition bar ──────────────────────────────────────────────────────
function RoleCompositionBar({ resolvedSignups, raidItem }: { resolvedSignups: any[]; raidItem: ScheduleItem }) {
  const targets = getRoleTargets(raidItem);
  const totals = buildRoleSummary(resolvedSignups);
  const totalSize = parseRaidSlots(raidItem.raidSize) || targets.Tank + targets.Healer + targets.DPS;
  const roles = [
    { key: "Tank" as const, icon: "🛡", label: "Tank", cssClass: "role-bar-tank" },
    { key: "Healer" as const, icon: "✚", label: "Healer", cssClass: "role-bar-healer" },
    { key: "DPS" as const, icon: "⚔", label: "DPS", cssClass: "role-bar-dps" }
  ];
  const totalFilled = totals.Tank + totals.Healer + totals.DPS;
  const totalOpen = Math.max(0, totalSize - totalFilled);
  const totalOver = Math.max(0, totalFilled - totalSize);
  const totalLabel = totalOver > 0 ? `${totalFilled}/${totalSize} (+${totalOver} over)` : totalOpen > 0 ? `${totalFilled}/${totalSize} (${totalOpen} open)` : `${totalFilled}/${totalSize} Full`;
  const specs = Array.isArray(raidItem.roleSpecSlots) ? raidItem.roleSpecSlots.filter((s) => s.role) : [];

  return (
    <div className="role-composition-panel">
      <div className="role-composition-header">
        <span className="role-composition-title">Role Composition</span>
        <span className="role-composition-total">{totalLabel}</span>
      </div>
      {roles.map((role) => {
        const filled = totals[role.key] || 0;
        const target = targets[role.key] || 0;
        const open = Math.max(0, target - filled);
        const over = Math.max(0, filled - target);
        const filledPct = totalSize > 0 ? (Math.min(filled, target) / totalSize) * 100 : 0;
        const openPct = totalSize > 0 ? (open / totalSize) * 100 : 0;
        const overPct = totalSize > 0 ? (over / totalSize) * 100 : 0;
        return (
          <div className="role-bar-row" key={role.key}>
            <span className="role-bar-label">
              {role.icon} {role.label}
            </span>
            <div className="role-bar-track">
              <div className={`role-bar-filled ${role.cssClass}`} style={{ width: `${filledPct.toFixed(1)}%` }} />
              <div className="role-bar-open" style={{ width: `${openPct.toFixed(1)}%` }} />
              {over > 0 && <div className={`role-bar-overflow ${role.cssClass}`} style={{ width: `${overPct.toFixed(1)}%` }} />}
            </div>
            <span className="role-bar-count">
              {filled}/{target}
            </span>
            {over > 0 && <span className="role-bar-over-label">+{over} over</span>}
            {open > 0 && <span className="role-bar-open-label">{open} open</span>}
            {open === 0 && over === 0 && <span className="role-bar-full-label">Full</span>}
          </div>
        );
      })}
      {specs.length > 0 && (
        <div className="role-spec-details">
          <span className="role-spec-details-label">Looking for:</span>
          {specs.map((s, i) => (
            <span className="role-spec-detail" key={i}>
              {ROLE_ICONS[s.role || ""] || ""} {[s.count && s.count > 1 ? `${s.count}x` : "", s.spec || "", s.class || "", s.role].filter(Boolean).join(" ")}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const CLASS_ORDER = ["Warrior", "Paladin", "Hunter", "Rogue", "Priest", "Shaman", "Mage", "Warlock", "Druid"];

function RosterTable({ resolvedSignups, raidName, raidId, softReserves, hardReserves }: { resolvedSignups: any[]; raidName?: string; raidId?: string; softReserves: any[]; hardReserves: any[] }) {
  const { hoverPropsForItemId } = useItemTooltipCtx();
  if (!resolvedSignups.length) return <p className="roster-empty">No signups yet.</p>;

  const hrByName = new Map<string, any[]>();
  const unassignedHRs: any[] = [];
  if (raidId) {
    for (const hr of hardReserves) {
      if (hr.raidId !== raidId) continue;
      if (!hr.characterName) {
        unassignedHRs.push(hr);
        continue;
      }
      const key = hr.characterName.toLowerCase();
      if (!hrByName.has(key)) hrByName.set(key, []);
      hrByName.get(key)!.push(hr);
    }
  }

  const accepted = resolvedSignups.filter((s) => normalizeSignupStatus(s.status) === "accept");
  const pending = resolvedSignups.filter((s) => !["accept", "decline", "withdrawn", "denied"].includes(normalizeSignupStatus(s.status)));
  const declined = resolvedSignups.filter((s) => ["decline", "withdrawn", "denied"].includes(normalizeSignupStatus(s.status)));

  const renderSection = (signups: any[], label: string) => {
    if (!signups.length) return null;
    const sorted = [...signups].sort((a, b) => {
      const ia = CLASS_ORDER.indexOf(a.wowClass || "");
      const ib = CLASS_ORDER.indexOf(b.wowClass || "");
      const oa = ia >= 0 ? ia : 99;
      const ob = ib >= 0 ? ib : 99;
      if (oa !== ob) return oa - ob;
      return (a.characterName || "").toLowerCase().localeCompare((b.characterName || "").toLowerCase());
    });
    let lastClass: string | null = null;
    return (
      <>
        <tr className="roster-section-header">
          <td colSpan={8}>
            {label} ({sorted.length})
          </td>
        </tr>
        {sorted.map((signup, idx) => {
          const role = signup.mainRole || signup.role || "";
          const wowClass = signup.wowClass || "";
          const color = WOW_CLASS_COLORS[wowClass] || "";
          const charName = signup.characterName || signup.profileCharacterName || "Unknown";
          const spec = signup.mainSpecialization || signup.specialization || "";
          const statusNorm = normalizeSignupStatus(signup.status);
          const sr = raidId ? findSoftReserveForSignup(signup, softReserves, raidId) : null;
          const reserveItems: any[] = sr && Array.isArray(sr.items) ? sr.items : [];
          const charHRs = hrByName.get(charName.toLowerCase()) || [];
          const gap = wowClass !== lastClass && lastClass !== null;
          lastClass = wowClass;
          const parts = [
            ...reserveItems.map((it, i) => (
              <span key={`sr${i}`} style={{ color: QUALITY_COLORS[it.quality] || "#ccc", fontWeight: 600, cursor: "help" }} {...hoverPropsForItemId(it.itemId)}>
                {it.name || "?"}
              </span>
            )),
            ...charHRs.map((hr, i) => (
              <span key={`hr${i}`} className="hardres-badge roster-hr-inline" style={{ cursor: "help" }} title={hr.note || "Hard Reserve"} {...hoverPropsForItemId(hr.itemId)}>
                {hr.itemName || "?"}
              </span>
            ))
          ];
          return (
            <RosterFragment key={signup.id || idx} gap={gap}>
              <tr className={`roster-row roster-status-${statusNorm}`}>
                <td className="roster-char-indent" style={color ? { color, fontWeight: 600 } : undefined}>
                  {charName}
                </td>
                <td style={color ? { color } : undefined}>{wowClass}</td>
                <td>
                  <span className="audit-role-main"> {role || "—"}</span>
                  <span className="audit-spec-muted">{spec || ""}</span>
                </td>
                <td className="roster-sr-col">{parts.length ? joinDots(parts) : <span className="text-dim">—</span>}</td>
                <td>
                  <span className={`signup-status-badge status-${statusNorm}`}>{statusLabel(signup.status)}</span>
                </td>
                <td>
                  <WclParsesCell characterName={charName} raidName={raidName} logsUrl={signup.logsUrl} />
                </td>
                <td>
                  <ExternalLink url={signup.armoryUrl || buildArmoryUrl(charName)} label="Gear" />
                </td>
                <td>
                  <ExternalLink url={signup.logsUrl || buildLogsUrl(charName)} label="Logs" />
                </td>
              </tr>
            </RosterFragment>
          );
        })}
      </>
    );
  };

  return (
    <table className="roster-table">
      <thead>
        <tr>
          <th className="roster-char-indent">Character</th>
          <th>Class</th>
          <th>Main Spec</th>
          <th>Soft &amp; Hard Reserves</th>
          <th>Status</th>
          <th>Parses</th>
          <th>Gear</th>
          <th>Logs</th>
        </tr>
      </thead>
      <tbody>
        {unassignedHRs.length > 0 && (
          <>
            <tr className="roster-section-header">
              <td colSpan={8}>Unassigned Hard Reserves ({unassignedHRs.length})</td>
            </tr>
            <tr className="roster-row">
              <td className="roster-char-indent text-dim">—</td>
              <td />
              <td />
              <td className="roster-sr-col">
                {joinDots(
                  unassignedHRs.map((hr, i) => (
                    <span key={i} className="hardres-badge roster-hr-inline" style={{ cursor: "help" }} title={hr.note || "Hard Reserve"} {...hoverPropsForItemId(hr.itemId)}>
                      {hr.itemName || "?"}
                    </span>
                  ))
                )}
              </td>
              <td />
              <td />
              <td />
              <td />
            </tr>
          </>
        )}
        {renderSection(accepted, "Accepted")}
        {renderSection(pending, "Pending")}
        {renderSection(declined, "Declined / Withdrawn")}
      </tbody>
    </table>
  );
}

function RosterFragment({ gap, children }: { gap: boolean; children: ReactNode }) {
  return (
    <>
      {gap && (
        <tr className="roster-class-gap">
          <td colSpan={8} />
        </tr>
      )}
      {children}
    </>
  );
}

function joinDots(parts: ReactNode[]): ReactNode {
  return parts.flatMap((p, i) => (i === 0 ? [p] : [<span key={`d${i}`} className="text-dim"> · </span>, p]));
}

// ── per-raid signup controls ────────────────────────────────────────────────────
interface SignupHandlers {
  createSignup: (raid: RaidLite, profile: CharacterProfile, entry: CharacterEntry, status: string) => Promise<void>;
  upsertSignup: (existing: Signup, raid: RaidLite, profile: CharacterProfile, entry: CharacterEntry, status: string) => Promise<void>;
  updateStatus: (existing: Signup, status: string) => Promise<void>;
  clearSignup: (signupId: string) => Promise<void>;
  toggleLock: (raid: RaidLite, locked: boolean) => Promise<void>;
}

function RaidControls({
  selectedRaid,
  viewerSignup,
  myCharacters,
  coreSet,
  isAdmin,
  handlers,
  onError
}: {
  selectedRaid: RaidLite | null;
  viewerSignup: Signup | null;
  myCharacters: CharacterProfile[];
  coreSet: Set<string>;
  isAdmin: boolean;
  handlers: SignupHandlers;
  onError: (msg: string) => void;
}) {
  const isCoreGroup = (selectedRaid as any)?.runType === "Core Group";
  const userHasCore = myCharacters.some((c) => coreSet.has(c.id));

  // character options (profileId::key)
  const charOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = [];
    for (const profile of myCharacters) {
      if (isCoreGroup && !coreSet.has(profile.id)) continue;
      for (const entry of getProfileCharacterEntries(profile)) {
        opts.push({ value: `${profile.id}::${entry.key}`, label: `${entry.characterName}${coreSet.has(profile.id) ? " ★" : ""}` });
      }
    }
    return opts;
  }, [myCharacters, coreSet, isCoreGroup]);

  const signupStatus = viewerSignup ? normalizeSignupStatus(viewerSignup.status) : "";
  const charEditable = !viewerSignup || signupStatus === "requested" || signupStatus === "withdrawn";
  const defaultCharValue = viewerSignup ? `${viewerSignup.characterId}::${viewerSignup.profileCharacterKey || "main"}` : charOptions[0]?.value || "";
  const [charValue, setCharValue] = useState(defaultCharValue);
  const effectiveCharValue = charOptions.some((o) => o.value === charValue) ? charValue : defaultCharValue;

  const resolveSelected = (value: string): { profile: CharacterProfile; entry: CharacterEntry } | null => {
    const [profileId, key] = String(value || "").split("::");
    const profile = myCharacters.find((c) => c.id === profileId);
    if (!profile) return null;
    const entry = findProfileCharacterEntry(profile, key || "main", "");
    if (!entry) return null;
    return { profile, entry };
  };

  if (!selectedRaid) return <span className="signup-control-disabled">Unavailable</span>;

  const locked = isRaidLocked(selectedRaid);

  // Non-admin locked view
  if (!isAdmin && locked) {
    return (
      <div className="raid-controls-cell">
        {signupStatus ? <span className={`signup-status-badge status-${signupStatus}`}>🔒 {statusLabel(viewerSignup!.status)}</span> : <span className="signup-control-disabled">🔒 Locked</span>}
      </div>
    );
  }
  if (!isAdmin && isCoreGroup && !viewerSignup && !userHasCore) {
    return <span className="signup-control-disabled">★ Core Raiders Only</span>;
  }

  const isAccepted = signupStatus === "accept";
  const isDenied = signupStatus === "denied";
  const statusOptions: Array<{ value: string; label: string }> = isAccepted
    ? [
        { value: "accept", label: "Accepted (Admin)" },
        { value: "withdrawn", label: "Withdrawn" }
      ]
    : isDenied
    ? [
        { value: "denied", label: "Denied (Admin)" },
        { value: "requested", label: "Request Signup" }
      ]
    : [{ value: "", label: "Not Signed Up" }, ...SIGNUP_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))];

  const onCharChange = async (value: string) => {
    setCharValue(value);
    // If there's an editable existing signup, re-point it to the new character immediately.
    if (viewerSignup && charEditable) {
      const sel = resolveSelected(value);
      if (sel) await handlers.upsertSignup(viewerSignup, selectedRaid, sel.profile, sel.entry, normalizeSignupStatus(viewerSignup.status));
    }
  };

  const onStatusChange = async (value: string) => {
    if (value === "") {
      if (viewerSignup) await handlers.clearSignup(viewerSignup.id);
      return;
    }
    const sel = resolveSelected(effectiveCharValue);
    if (viewerSignup) {
      if (sel) await handlers.upsertSignup(viewerSignup, selectedRaid, sel.profile, sel.entry, value);
      else await handlers.updateStatus(viewerSignup, value);
    } else {
      if (!sel) {
        onError("Select a character before signing up.");
        return;
      }
      await handlers.createSignup(selectedRaid, sel.profile, sel.entry, value);
    }
  };

  const statusClass = signupStatus ? `status-${signupStatus}` : "status-none";
  const hasProfiles = myCharacters.length > 0;

  return (
    <div className="raid-controls-cell">
      <select className="raid-profile-select" value={effectiveCharValue} disabled={!charEditable} onChange={(e) => void onCharChange(e.target.value)}>
        {!charOptions.length && <option value="">{isCoreGroup ? "No core raider characters" : "Select character"}</option>}
        {charOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select className={`raid-signup-select ${statusClass}`} value={signupStatus || ""} disabled={!hasProfiles && !viewerSignup} onChange={(e) => void onStatusChange(e.target.value)}>
        {statusOptions.map((o) => (
          <option key={o.value || "none"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── raid row + detail ───────────────────────────────────────────────────────────
function RaidSummaryRows({
  group,
  rosterMap,
  raids,
  signups,
  allCharacters,
  myCharacters,
  softReserves,
  hardReserves,
  coreSet,
  uid,
  isAdmin,
  expanded,
  onToggle,
  handlers,
  onError
}: {
  group: RaidGroup;
  rosterMap: Map<string, any>;
  raids: RaidLite[];
  signups: Signup[];
  allCharacters: CharacterProfile[];
  myCharacters: CharacterProfile[];
  softReserves: any[];
  hardReserves: any[];
  coreSet: Set<string>;
  uid: string | null;
  isAdmin: boolean;
  expanded: boolean;
  onToggle: () => void;
  handlers: SignupHandlers;
  onError: (m: string) => void;
}) {
  const item = group.summary;
  const detailId = `raid-detail-${safeId(group.key)}`;
  const raidSignups = group.signups.filter((s) => s.__isSignup !== false && s.characterId);
  const activeSignups = raidSignups.filter((s) => !["decline", "withdrawn", "denied"].includes(normalizeSignupStatus(s.status)));
  const signupCount = activeSignups.length;
  const resolvedSignups = raidSignups.map((s) => resolveSignupCharacterData(s, allCharacters));
  const selectedRaid = (item.raidId && raids.find((r) => r.id === item.raidId)) || null;
  const viewerSignup = uid ? raidSignups.find((s) => s.ownerUid === uid) || null : null;
  const roster = rosterMap.get(getRaidKey(item));
  const totals = buildRoleSummary(resolvedSignups);
  const needsSR = selectedRaid ? viewerNeedsSR(selectedRaid.id, uid, signups, softReserves) : false;
  const mySrLink = selectedRaid ? `/softres?raidId=${encodeURIComponent(selectedRaid.id)}` : "";
  const iAmIn = selectedRaid && uid ? signups.some((s) => s.raidId === selectedRaid.id && s.ownerUid === uid && ["accept", "requested", "tentative"].includes(normalizeSignupStatus(s.status))) : false;
  const locked = isRaidLocked(selectedRaid);

  return (
    <>
      <tr className="raid-summary-row">
        <td colSpan={2}>
          <RaidControls selectedRaid={selectedRaid} viewerSignup={viewerSignup} myCharacters={myCharacters} coreSet={coreSet} isAdmin={isAdmin} handlers={handlers} onError={onError} />
        </td>
        <td>
          <div className="raid-date">{formatRaidDate(getRaidDateString(item))}</div>
        </td>
        <td className="raid-time-cell">
          <RaidWindow start={item.raidStart} end={item.raidEnd} />
        </td>
        <td>{item.phase ? `Phase ${item.phase}` : "—"}</td>
        <td>
          <span className="raid-name-glow">{item.raidName || "—"}</span>
          {selectedRaid && needsSR && (
            <a className="sr-needed-badge sr-needed-link" href={mySrLink} title="Click to soft reserve for this exact raid">
              {" "}
              SR Needed →
            </a>
          )}
          {selectedRaid && !needsSR && iAmIn && (
            <a className="sr-open-link" href={mySrLink} title="Open Soft Reserves for this raid">
              {" "}
              Open SR →
            </a>
          )}
          {item.raidLeader && (
            <>
              <br />
              <span className="raid-leader-label">RL: {item.raidLeader}</span>
            </>
          )}
        </td>
        <td>
          {item.runType || "—"}
          {item.runType === "Partial" && item.plannedBosses?.length ? (
            <div className="planned-bosses-list">
              {item.plannedBosses.map((b) => (
                <span className="planned-boss-tag" key={b}>
                  {b}
                </span>
              ))}
            </div>
          ) : null}
        </td>
        <td>{item.raidSize || "—"}</td>
        <td>
          {roster && roster.size > 0 ? (
            <div className="roster-stack">
              <span className={`roster-chip ${roster.status}`}>
                {roster.signed}/{roster.size}
              </span>
              <span className="roster-role-row">
                <span className="roster-role roster-role-tank">🛡 <strong>{totals.Tank}</strong></span>
                <span className="roster-role roster-role-healer">✚ <strong>{totals.Healer}</strong></span>
                <span className="roster-role roster-role-dps">⚔ <strong>{totals.DPS}</strong></span>
              </span>
            </div>
          ) : (
            "—"
          )}
        </td>
        <td>
          <button type="button" className="schedule-toggle" onClick={onToggle}>
            {expanded ? "Hide Signups" : `Show Signups (${signupCount})`}
          </button>
          {isAdmin && selectedRaid && (
            <button type="button" className={`raid-lock-btn ${locked ? "raid-locked" : ""}`} title={locked ? "Unlock signups" : "Lock signups"} onClick={() => void handlers.toggleLock(selectedRaid, locked)}>
              {locked ? "🔒 Unlock" : "🔓 Lock"}
            </button>
          )}
          {!isAdmin && locked && <span className="raid-lock-indicator">🔒 Locked</span>}
        </td>
      </tr>
      <tr id={detailId} className="raid-detail-row" hidden={!expanded}>
        <td colSpan={10}>
          <div className="raid-detail-wrap">
            <RoleCompositionBar resolvedSignups={resolvedSignups} raidItem={item} />
            <RosterTable resolvedSignups={resolvedSignups} raidName={item.raidName} raidId={selectedRaid?.id || item.raidId} softReserves={softReserves} hardReserves={hardReserves} />
          </div>
        </td>
      </tr>
    </>
  );
}

// ── past raids (compact) ──────────────────────────────────────────────────────
function PastRaids({ groups, allCharacters, softReserves, hardReserves, expanded, onToggle }: { groups: RaidGroup[]; allCharacters: CharacterProfile[]; softReserves: any[]; hardReserves: any[]; expanded: Set<string>; onToggle: (k: string) => void }) {
  if (!groups.length) return null;
  return (
    <details className="past-raids-details">
      <summary className="past-raids-summary">
        Completed Raids <span className="past-raids-count">({groups.length})</span>
      </summary>
      <div className="past-raids-list">
        {groups.map((group) => {
          const item = group.summary;
          const detailId = `past-detail-${safeId(group.key)}`;
          const rDate = getRaidDateString(item);
          const dateLabel = rDate ? new Date(`${rDate}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "—";
          const start = Number.isInteger(item.raidStart) ? hourLabel(item.raidStart as number) : "";
          const end = Number.isInteger(item.raidEnd) ? hourLabel(item.raidEnd as number) : "";
          const timeStr = start ? `${start}${end ? " – " + end : ""} CST` : "";
          const raidSignups = group.signups.filter((s) => s.__isSignup !== false && s.characterId);
          const activeCount = raidSignups.filter((s) => !["decline", "withdrawn", "denied"].includes(normalizeSignupStatus(s.status))).length;
          const resolvedSignups = raidSignups.map((s) => resolveSignupCharacterData(s, allCharacters));
          const isOpen = expanded.has(group.key);
          return (
            <div key={group.key}>
              <button type="button" className={`past-raid-row${isOpen ? " is-expanded" : ""}`} onClick={() => onToggle(group.key)}>
                <span className="past-raid-name">
                  {item.raidName || "Raid"}
                  {item.runType ? ` (${item.runType})` : ""}
                </span>
                <span className="past-raid-date">{dateLabel}</span>
                <span className="past-raid-time">{timeStr}</span>
                <span className="past-raid-signups">{activeCount > 0 ? `${activeCount} signup${activeCount !== 1 ? "s" : ""}` : "0 signups"}</span>
              </button>
              <div id={detailId} className="past-raid-detail" hidden={!isOpen}>
                <RoleCompositionBar resolvedSignups={resolvedSignups} raidItem={item} />
                <RosterTable resolvedSignups={resolvedSignups} raidName={item.raidName} raidId={item.raidId} softReserves={softReserves} hardReserves={hardReserves} />
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}

// ── calendar ──────────────────────────────────────────────────────────────────
function CalendarView({
  scheduleItems,
  offset,
  onOffset,
  uid
}: {
  scheduleItems: ScheduleItem[];
  offset: number;
  onOffset: (next: number, userNavigated: boolean) => void;
  uid: string | null;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { year, month } = { year: today.getFullYear(), month: today.getMonth() + offset };
  const first = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const startDow = first.getDay();
  const totalCells = Math.ceil((startDow + lastOfMonth.getDate()) / 7) * 7;
  const startDate = new Date(first);
  startDate.setDate(1 - startDow);
  const rangeLabel = first.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const raidsByDate = new Map<string, RaidGroup[]>();
  groupRowsByRaid(scheduleItems).forEach((g) => {
    const ds = getRaidDateString(g.summary);
    if (!ds) return;
    if (!raidsByDate.has(ds)) raidsByDate.set(ds, []);
    raidsByDate.get(ds)!.push(g);
  });

  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const cells = [];
  for (let i = 0; i < totalCells; i++) {
    const cellDate = new Date(startDate);
    cellDate.setDate(startDate.getDate() + i);
    const ds = `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, "0")}-${String(cellDate.getDate()).padStart(2, "0")}`;
    const isToday = cellDate.getTime() === today.getTime();
    const isPast = cellDate.getTime() < today.getTime();
    const outside = cellDate < first || cellDate > lastOfMonth;
    const raids = raidsByDate.get(ds) || [];
    const dayNum = cellDate.getDate();
    const monthLabel = dayNum === 1 || i === 0 ? cellDate.toLocaleDateString("en-US", { month: "short" }) + " " : "";
    const MAX = 3;
    cells.push(
      <div key={i} className={`calendar-day${isToday ? " is-today" : ""}${isPast && !isToday ? " is-past" : ""}${outside ? " is-outside-month" : ""}`}>
        <div className="calendar-day-number">
          {monthLabel}
          {dayNum}
        </div>
        {raids.slice(0, MAX).map((g, gi) => {
          const raid = g.summary;
          const rSignups = g.signups.filter((s) => s.__isSignup !== false && s.characterId);
          const viewerIn = uid ? rSignups.some((s) => s.ownerUid === uid) : false;
          const startHour = raid.raidStart != null ? hourLabel(raid.raidStart) : "";
          const count = rSignups.filter((s) => !["decline", "withdrawn", "denied"].includes(normalizeSignupStatus(s.status))).length;
          return (
            <div key={gi} className={`calendar-raid-chip${viewerIn ? " has-signup" : ""}`} title={`${raid.raidName || "Raid"}${raid.runType ? ` (${raid.runType})` : ""} — ${count} signups`}>
              {raid.raidName || "Raid"}
              {raid.runType ? ` (${raid.runType})` : ""}
              {startHour && <span className="chip-time">{startHour} CST</span>}
              <span className="chip-time">
                {count}
                {raid.raidSize ? `/${raid.raidSize}` : ""} signed
              </span>
            </div>
          );
        })}
        {raids.length > MAX && <div className="calendar-raid-more">+{raids.length - MAX} more</div>}
      </div>
    );
  }

  return (
    <div className="raid-calendar">
      <div className="calendar-header">
        <button type="button" className="calendar-nav" title="Previous month" onClick={() => onOffset(offset - 1, true)}>
          ◀
        </button>
        <span className="calendar-range-label">{rangeLabel}</span>
        <button type="button" className="calendar-nav" title="Next month" onClick={() => onOffset(offset + 1, true)}>
          ▶
        </button>
        <button type="button" className="calendar-nav calendar-today-btn" title="Jump to today" onClick={() => onOffset(0, true)}>
          Today
        </button>
      </div>
      <div className="calendar-grid">
        {DAY_NAMES.map((n) => (
          <div className="calendar-day-header" key={n}>
            {n}
          </div>
        ))}
        {cells}
      </div>
    </div>
  );
}

// ── page ────────────────────────────────────────────────────────────────────────
export function SignupPage() {
  const { uid, isAdmin } = useAuth();

  const signupsQ = useMemo(() => collection(db, "signups"), []);
  const raidsQ = useMemo(() => collection(db, "raids"), []);
  const charactersQ = useMemo(() => collection(db, "characters"), []);
  const coreQ = useMemo(() => collection(db, "coreRaiders"), []);
  const srQ = useMemo(() => collection(db, "softreserves"), []);
  const hrQ = useMemo(() => collection(db, "hardreserves"), []);

  const { docs: signups } = useCollection<Signup>(signupsQ);
  const { docs: raids } = useCollection<RaidLite>(raidsQ);
  const { docs: allCharacters, loading: charactersLoading } = useCollection<CharacterProfile>(charactersQ);
  const { docs: coreDocs } = useCollection<{ isCoreRaider?: boolean }>(coreQ);
  const { docs: softReserves } = useCollection<any>(srQ);
  const { docs: hardReserves } = useCollection<any>(hrQ);

  const myCharacters = useMemo(() => allCharacters.filter((c) => c.ownerUid === uid), [allCharacters, uid]);
  const coreSet = useMemo(() => new Set(coreDocs.filter((d) => d.isCoreRaider).map((d) => d.id)), [coreDocs]);

  const scheduleItems = useMemo(() => buildScheduleItems(signups, raids), [signups, raids]);
  const rosterMap = useMemo(() => buildRosterMap(scheduleItems), [scheduleItems]);

  const { upcomingGroups, pastGroups } = useMemo(() => {
    const now = Date.now();
    const upcoming: ScheduleItem[] = [];
    const past: ScheduleItem[] = [];
    scheduleItems.forEach((item) => {
      const cutoff = getRaidCutoffDateTime(item);
      if (!cutoff || cutoff.getTime() < now) past.push(item);
      else upcoming.push(item);
    });
    return { upcomingGroups: groupRowsByRaid(upcoming), pastGroups: groupRowsByRaid(past).reverse() };
  }, [scheduleItems]);

  const srNeeded = useMemo(() => getRaidsNeedingSR(uid, signups, raids, softReserves), [uid, signups, raids, softReserves]);

  const [view, setView] = useState<"list" | "calendar">("list");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [calOffset, setCalOffset] = useState(0);
  const [calNavigated, setCalNavigated] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<CharacterProfile | null>(null);
  const [message, setMessage] = useState("");

  // Auto-jump the calendar to the month of the nearest upcoming raid (until the user navigates).
  const smartOffset = useMemo(() => {
    const now = Date.now();
    const today = new Date();
    let nearest: Date | null = null;
    for (const item of scheduleItems) {
      const cutoff = getRaidCutoffDateTime(item);
      if (!cutoff || cutoff.getTime() < now) continue;
      const ds = getRaidDateString(item);
      const rd = ds ? new Date(`${ds}T00:00:00`) : null;
      if (!rd) continue;
      if (!nearest || rd < nearest) nearest = rd;
    }
    if (!nearest) return 0;
    return (nearest.getFullYear() - today.getFullYear()) * 12 + (nearest.getMonth() - today.getMonth());
  }, [scheduleItems]);
  const effectiveOffset = calNavigated ? calOffset : smartOffset;

  const toggle = (key: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  // ── signup write handlers ──────────────────────────────────────────────────
  const makePayload = (raid: RaidLite, profile: CharacterProfile, entry: CharacterEntry, status: string) => {
    const role = entry.mainRole || "";
    const normalized = autoApproveIfAdmin(normalizeSignupStatus(status), raid.id, role, isAdmin, raids, signups, allCharacters);
    return normalizeSignupPayloadForRules({
      characterId: profile.id,
      profileCharacterKey: entry.key,
      profileCharacterName: entry.characterName,
      raidId: raid.id,
      raidDate: raid.raidDate,
      raidName: raid.raidName,
      phase: raid.phase,
      runType: (raid as any).runType,
      raidSize: raid.raidSize,
      raidStart: raid.raidStart,
      raidEnd: raid.raidEnd,
      status: normalized,
      ownerUid: uid,
      updatedAt: serverTimestamp()
    });
  };

  const handlers: SignupHandlers = {
    createSignup: async (raid, profile, entry, status) => {
      const payload = makePayload(raid, profile, entry, status);
      if (!payload) {
        setMessage("Selected raid has invalid schedule data.");
        return;
      }
      try {
        await addDoc(collection(db, "signups"), { ...payload, createdAt: serverTimestamp() });
        sendDiscordSignupNotification(payload, entry);
      } catch (e: any) {
        setMessage(e?.message || "Signup failed.");
      }
    },
    upsertSignup: async (existing, raid, profile, entry, status) => {
      const payload = makePayload(raid, profile, entry, status);
      if (!payload) {
        setMessage("Selected raid has invalid schedule data.");
        return;
      }
      try {
        await updateDoc(doc(db, "signups", existing.id), payload);
      } catch (e: any) {
        setMessage(e?.message || "Update failed.");
      }
    },
    updateStatus: async (existing, status) => {
      const role = (existing.mainRole || existing.role || "") as string;
      const normalized = autoApproveIfAdmin(normalizeSignupStatus(status), String(existing.raidId || ""), role, isAdmin, raids, signups, allCharacters);
      try {
        await updateDoc(doc(db, "signups", existing.id), { status: normalized, updatedAt: serverTimestamp() });
        if (["withdrawn", "decline", "denied"].includes(normalized) && existing.raidId && existing.characterId) {
          const sr = findSoftReserveForSignup(existing, softReserves);
          if (sr) await deleteDoc(doc(db, "softreserves", sr.id)).catch(() => {});
        }
      } catch (e: any) {
        setMessage(e?.message || "Update failed.");
      }
    },
    clearSignup: async (signupId) => {
      try {
        await deleteDoc(doc(db, "signups", signupId));
      } catch (e: any) {
        setMessage(e?.message || "Could not remove signup.");
      }
    },
    toggleLock: async (raid, locked) => {
      try {
        await updateDoc(doc(db, "raids", raid.id), { signupsLocked: !locked });
      } catch (e: any) {
        setMessage(e?.message || "Could not toggle lock.");
      }
    }
  };

  const openCreate = () => {
    setEditProfile(null);
    setModalOpen(true);
  };
  const openEdit = (p: CharacterProfile) => {
    setEditProfile(p);
    setModalOpen(true);
  };

  return (
    <ItemTooltipProvider>
    <section className="card" id="raidSections">
      {srNeeded.length > 0 && (
        <div className="sr-needed-banner">
          <div className="sr-needed-banner-content">
            <span className="sr-needed-banner-icon">📋</span>
            <span className="sr-needed-text">
              You have <strong>{srNeeded.length}</strong> raid{srNeeded.length > 1 ? "s" : ""} that need{srNeeded.length === 1 ? "s" : ""} soft reserves:{" "}
              {srNeeded.map((r) => `${r.raidName} (${formatMonthDayYear(r.raidDate)})`).join(", ")}
            </span>
            <a href={`/softres?raidId=${encodeURIComponent(srNeeded[0].id)}`} className="sr-needed-link">
              Go to Soft Reserves →
            </a>
          </div>
        </div>
      )}

      {/* Wait for the characters collection to load before deciding which to show —
          otherwise the onboarding banner flashes for a frame on every navigation. */}
      {charactersLoading ? null : myCharacters.length === 0 ? (
        <div className="onboarding-banner">
          <div className="onboarding-banner-content">
            <strong>Welcome to Hope Raider!</strong>
            <p>Before you can sign up for raids, you need to create a character profile.</p>
            <button type="button" className="onboarding-cta" onClick={openCreate}>
              Create Your Profile
            </button>
          </div>
        </div>
      ) : (
        <div className="profile-bar">
          <span className="profile-bar-label">My Characters:</span>
          {myCharacters.map((p) => (
            <button type="button" key={p.id} className="profile-bar-chip" onClick={() => openEdit(p)} title="Edit this profile">
              {getProfileLabel(p)}
            </button>
          ))}
          <button type="button" className="secondary profile-bar-add" onClick={openCreate}>
            + Add Profile
          </button>
        </div>
      )}

      <div className="list-header">
        <h2>Raid Schedule</h2>
        <div className="view-toggle-group">
          <button type="button" className={`view-toggle${view === "list" ? " active" : ""}`} title="List view" onClick={() => setView("list")}>
            ☰ List
          </button>
          <button type="button" className={`view-toggle${view === "calendar" ? " active" : ""}`} title="Calendar view" onClick={() => setView("calendar")}>
            📅 Calendar
          </button>
        </div>
      </div>

      {view === "calendar" ? (
        <CalendarView
          scheduleItems={scheduleItems}
          offset={effectiveOffset}
          onOffset={(next, navd) => {
            setCalOffset(next);
            setCalNavigated(navd);
          }}
          uid={uid}
        />
      ) : (
        <div className="raid-groups">
          <section className="raid-group upcoming-raids">
            <div className="list-header">
              <h3>Up-Coming Raids</h3>
              <span className="badge">{upcomingGroups.length}</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Character</th>
                    <th>Signup</th>
                    <th>Date</th>
                    <th>Timezone</th>
                    <th>Phase</th>
                    <th>Raid</th>
                    <th>Run Type</th>
                    <th>Size</th>
                    <th>Roster</th>
                    <th>Signups</th>
                  </tr>
                </thead>
                <tbody>
                  {!upcomingGroups.length && (
                    <tr>
                      <td colSpan={10}>No raids in this window.</td>
                    </tr>
                  )}
                  {upcomingGroups.map((group) => (
                    <RaidSummaryRows
                      key={group.key}
                      group={group}
                      rosterMap={rosterMap}
                      raids={raids}
                      signups={signups}
                      allCharacters={allCharacters}
                      myCharacters={myCharacters}
                      softReserves={softReserves}
                      hardReserves={hardReserves}
                      coreSet={coreSet}
                      uid={uid}
                      isAdmin={isAdmin}
                      expanded={expanded.has(group.key)}
                      onToggle={() => toggle(group.key)}
                      handlers={handlers}
                      onError={setMessage}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <PastRaids groups={pastGroups} allCharacters={allCharacters} softReserves={softReserves} hardReserves={hardReserves} expanded={expanded} onToggle={toggle} />
        </div>
      )}

      {message && <p className="message">{message}</p>}

      <ProfileModal open={modalOpen} profile={editProfile} allCharacters={allCharacters} onClose={() => setModalOpen(false)} onSaved={() => setMessage("Profile saved.")} />
    </section>
    </ItemTooltipProvider>
  );
}
