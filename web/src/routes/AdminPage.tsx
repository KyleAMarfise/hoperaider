import { useEffect, useMemo, useState, type ReactNode } from "react";
import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useCollection } from "../hooks/useCollection";
import { WclParsesCell } from "../components/common/Parses";
import { WOW_CLASS_COLORS } from "../constants/classes";
import {
  buildRaidComp,
  buildUserAuditRows,
  checkRoleSlotConstraint,
  findExistingAssignment,
  formatMonthDayYear,
  formatRaidAssignmentLabel,
  getUpcomingRaidsForAssignment,
  getProfileLabel,
  getCharacterMapById,
  findProfileCharacterEntry,
  resolveProfileForSignup,
  resolveProfileCharacterForAssignment,
  resolveSignupCharacterAttributes,
  normalizeAssignmentPayloadForRules,
  normalizeSignupStatus,
  normalizeUid,
  isActiveSignup,
  parseDateOnly,
  signupStatusLabel,
  type AuditRow,
  type AuditCharEntry,
  type CharacterProfile,
  type DirectoryMeta,
  type RaidComp,
  type RaidLite,
  type Signup
} from "../lib/admin";

// ── small presentational helpers ────────────────────────────────────────────────
function ClassColoredName({ wowClass }: { wowClass?: string }) {
  const name = String(wowClass || "").trim() || "—";
  const color = WOW_CLASS_COLORS[name];
  return (
    <span className="class-colored-name" style={color ? { color } : undefined}>
      {name}
    </span>
  );
}

function ExternalLink({ url, label }: { url?: string; label: string }) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return <>—</>;
  return (
    <a href={trimmed} target="_blank" rel="noopener noreferrer" title={label}>
      ↗
    </a>
  );
}

function RoleSpec({ role, spec }: { role?: string; spec?: string }) {
  return (
    <>
      <span className="audit-role-main">{String(role || "—")}</span>
      <span className="audit-spec-muted">{String(spec || "—")}</span>
    </>
  );
}

function CompCard({ comp }: { comp: RaidComp }) {
  return (
    <div className="raid-comp-card">
      <div className="raid-comp-summary">
        <span className="raid-comp-title">{comp.raidLabel}</span>
        <span className="raid-comp-accepted">
          Accepted:{" "}
          <strong>
            {comp.acceptedCount}
            {comp.totalSlots ? `/${comp.totalSlots}` : ""}
          </strong>
        </span>
        {comp.totalSlots > 0 && (
          <span className={`raid-comp-spots${comp.openSpots <= 0 ? " comp-spots-full" : ""}`}>
            {comp.openSpots > 0 ? `${comp.openSpots} open spot${comp.openSpots !== 1 ? "s" : ""}` : "Full"}
          </span>
        )}
        <span className="raid-comp-roles">
          {comp.roleChips.map((r, i) => (
            <span key={r.label}>
              <span className={`comp-role-chip${r.isFull ? " comp-role-full" : ""}`}>
                {r.label} <strong>{r.slots != null ? `${r.count}/${r.slots}` : r.count}</strong>
              </span>
              {i < comp.roleChips.length - 1 && <span className="comp-role-sep"> · </span>}
            </span>
          ))}
        </span>
        <span className="raid-comp-classes">
          {comp.classChips.map((c) => (
            <span key={c.cls} className="comp-class-chip" style={{ color: c.color }}>
              {c.cls} <strong>{c.count}</strong>
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

// One signup row in the requests queue.
function RequestRow({
  signup,
  characters,
  actionMode,
  busy,
  onAction
}: {
  signup: Signup;
  characters: CharacterProfile[];
  actionMode: "full" | "accept-only" | "none";
  busy: boolean;
  onAction: (signupId: string, action: "accept" | "bench" | "deny") => void;
}) {
  const profilesById = getCharacterMapById(characters);
  const profile = resolveProfileForSignup(signup, profilesById, characters);
  const profileLabel = profile ? getProfileLabel(profile) : "Unknown Profile";
  const selectedEntry = profile
    ? findProfileCharacterEntry(profile, String(signup.profileCharacterKey || "main"), String(signup.profileCharacterName || signup.characterName || ""))
    : null;
  const characterName = signup.profileCharacterName || signup.characterName || selectedEntry?.characterName || profile?.characterName || "—";
  const attributes = resolveSignupCharacterAttributes(signup, profilesById, characters);
  const status = normalizeSignupStatus(signup.status);
  const gearUrl = String(signup.armoryUrl || selectedEntry?.armoryUrl || "").trim();
  const logsUrl = String(signup.logsUrl || selectedEntry?.logsUrl || "").trim();

  return (
    <tr>
      <td>{formatMonthDayYear(signup.raidDate || "")}</td>
      <td>{signup.raidName || "—"}</td>
      <td>{profileLabel}</td>
      <td>{characterName}</td>
      <td>
        <ClassColoredName wowClass={attributes.wowClass} />
      </td>
      <td>{attributes.specialization}</td>
      <td>
        <ExternalLink url={gearUrl} label="Gear" />
      </td>
      <td>
        <ExternalLink url={logsUrl} label="Logs" />
      </td>
      <td className="audit-parses-cell">
        <WclParsesCell characterName={String(characterName)} raidName={signup.raidName || ""} logsUrl={logsUrl} />
      </td>
      <td>
        <span className={`signup-status-badge status-${status}`}>{signupStatusLabel(signup.status)}</span>
      </td>
      <td>
        {actionMode === "none" ? (
          <span className="request-action-na">Record only</span>
        ) : (
          <div className="row-actions">
            <button type="button" disabled={busy} onClick={() => onAction(signup.id, "accept")}>
              Accept
            </button>
            <button type="button" className="bench" disabled={busy} onClick={() => onAction(signup.id, "bench")}>
              Bench
            </button>
            {actionMode === "full" && (
              <button type="button" className="danger" disabled={busy} onClick={() => onAction(signup.id, "deny")}>
                Deny
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function SignupRequestsSection({
  signups,
  characters,
  raids
}: {
  signups: Signup[];
  characters: CharacterProfile[];
  raids: RaidLite[];
}) {
  const { isAdmin } = useAuth();
  const [message, setMessage] = useState<{ text: string; error: boolean }>({ text: "", error: false });
  const [busyId, setBusyId] = useState<string | null>(null);

  const activeItems = useMemo(
    () =>
      signups
        .filter((s) => {
          const status = normalizeSignupStatus(s.status);
          return isActiveSignup(s) && (status === "requested" || status === "tentative" || status === "withdrawn");
        })
        .sort((left, right) => {
          const leftDate = parseDateOnly(left.raidDate)?.getTime() || 0;
          const rightDate = parseDateOnly(right.raidDate)?.getTime() || 0;
          if (leftDate !== rightDate) return leftDate - rightDate;
          return (Number(left.raidStart) || 0) - (Number(right.raidStart) || 0);
        }),
    [signups]
  );

  const actionableCount = useMemo(
    () => activeItems.filter((s) => ["requested", "tentative"].includes(normalizeSignupStatus(s.status))).length,
    [activeItems]
  );

  // group by raid
  const groups = useMemo(() => {
    const map = new Map<string, Signup[]>();
    for (const s of activeItems) {
      const key = s.raidId || `${s.raidName}|${s.raidDate}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.values());
  }, [activeItems]);

  const handleAction = async (signupId: string, action: "accept" | "bench" | "deny") => {
    if (!isAdmin) return;
    if (action === "accept") {
      const signup = signups.find((s) => s.id === signupId);
      if (signup) {
        const constraintMsg = checkRoleSlotConstraint(signup, raids, signups, characters);
        if (constraintMsg) {
          setMessage({ text: constraintMsg, error: true });
          return;
        }
      }
    }
    const nextStatus = action === "accept" ? "accept" : action === "bench" ? "tentative" : "denied";
    setBusyId(signupId);
    try {
      await updateDoc(doc(db, "signups", signupId), { status: nextStatus, updatedAt: serverTimestamp() });
      if (nextStatus === "denied") {
        const signup = signups.find((s) => s.id === signupId);
        if (signup?.raidId && signup?.characterId) {
          try {
            const srSnap = await getDocs(
              query(collection(db, "softreserves"), where("raidId", "==", signup.raidId), where("characterId", "==", signup.characterId))
            );
            for (const srDoc of srSnap.docs) await deleteDoc(doc(db, "softreserves", srDoc.id));
          } catch {
            /* ignore */
          }
        }
      }
      setMessage({ text: `Request ${action === "accept" ? "accepted" : action === "bench" ? "benched" : "denied"}.`, error: false });
    } catch (error: any) {
      setMessage({ text: error?.message || "Action failed.", error: true });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="card signup-requests-compact" id="signupRequestsSection">
      <div className="list-header">
        <h2>Signup Requests</h2>
        <span className="badge">{actionableCount}</span>
      </div>

      <div className="table-wrap signup-requests-scroll">
        <table>
          <thead>
            <tr>
              <th>Raid Date</th>
              <th>Raid</th>
              <th>Profile</th>
              <th>Character</th>
              <th>Class</th>
              <th>Spec</th>
              <th>Gear</th>
              <th>Logs</th>
              <th>Parses</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {!activeItems.length && (
              <tr>
                <td colSpan={11}>No active signup request records.</td>
              </tr>
            )}
            {groups.map((raidSignups, gi) => {
              const comp = buildRaidComp(raidSignups, signups, raids, characters);
              const requested = raidSignups.filter((s) => normalizeSignupStatus(s.status) === "requested");
              const benched = raidSignups.filter((s) => normalizeSignupStatus(s.status) === "tentative");
              const withdrew = raidSignups.filter((s) => normalizeSignupStatus(s.status) === "withdrawn");
              const withdrawnNames = withdrew
                .map((s) => s.profileCharacterName || getCharacterMapById(characters).get(s.characterId || "")?.characterName || "Unknown")
                .join(", ");
              return (
                <RaidGroup key={gi}>
                  {comp && (
                    <tr className="request-raid-header">
                      <td colSpan={11}>
                        <div className="request-raid-header-content">
                          <CompCard comp={comp} />
                        </div>
                      </td>
                    </tr>
                  )}
                  {requested.length > 0 && (
                    <>
                      <tr className="request-group-row">
                        <td colSpan={11}>
                          <strong>Signup Requests ({requested.length})</strong>
                        </td>
                      </tr>
                      {requested.map((s) => (
                        <RequestRow key={s.id} signup={s} characters={characters} actionMode="full" busy={busyId === s.id} onAction={handleAction} />
                      ))}
                    </>
                  )}
                  {benched.length > 0 && (
                    <>
                      <tr className="request-group-row">
                        <td colSpan={11}>
                          <strong>Benched Themselves ({benched.length})</strong>
                        </td>
                      </tr>
                      {benched.map((s) => (
                        <RequestRow key={s.id} signup={s} characters={characters} actionMode="accept-only" busy={busyId === s.id} onAction={handleAction} />
                      ))}
                    </>
                  )}
                  {withdrew.length > 0 && (
                    <tr className="request-group-row request-withdrew-row">
                      <td colSpan={11}>
                        <details className="withdrew-summary">
                          <summary>
                            <strong>Withdrew ({withdrew.length})</strong> <span className="withdrew-names">{withdrawnNames}</span>
                          </summary>
                          <table className="withdrew-detail-table">
                            <tbody>
                              {withdrew.map((s) => (
                                <RequestRow key={s.id} signup={s} characters={characters} actionMode="none" busy={false} onAction={handleAction} />
                              ))}
                            </tbody>
                          </table>
                        </details>
                      </td>
                    </tr>
                  )}
                </RaidGroup>
              );
            })}
          </tbody>
        </table>
      </div>
      {message.text && <p className={`message${message.error ? " error" : ""}`}>{message.text}</p>}
    </section>
  );
}

// Fragment wrapper so each raid group can render multiple <tr> rows under one key.
function RaidGroup({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function AdminPage() {
  const signupsQ = useMemo(() => collection(db, "signups"), []);
  const raidsQ = useMemo(() => collection(db, "raids"), []);
  const charactersQ = useMemo(() => collection(db, "characters"), []);
  const adminsQ = useMemo(() => collection(db, "admins"), []);
  const membersQ = useMemo(() => collection(db, "members"), []);
  const ownersQ = useMemo(() => collection(db, "owners"), []);
  const docksQ = useMemo(() => collection(db, "attendance_docks"), []);
  const coreQ = useMemo(() => collection(db, "coreRaiders"), []);

  const { docs: signups } = useCollection<Signup>(signupsQ);
  const { docs: rawRaids } = useCollection<RaidLite>(raidsQ);
  const { docs: characters } = useCollection<CharacterProfile>(charactersQ);
  const { docs: adminDocs } = useCollection<DirectoryMeta>(adminsQ);
  const { docs: memberDocs } = useCollection<DirectoryMeta>(membersQ);
  const { docs: ownerDocs } = useCollection<DirectoryMeta>(ownersQ);
  const { docs: dockDocs } = useCollection<{ docks?: number }>(docksQ);
  const { docs: coreDocs } = useCollection<{ isCoreRaider?: boolean }>(coreQ);

  const raids = useMemo(() => rawRaids, [rawRaids]);
  const adminUids = useMemo(() => adminDocs.map((d) => normalizeUid(d.id)).filter(Boolean), [adminDocs]);
  const memberUids = useMemo(() => memberDocs.map((d) => normalizeUid(d.id)).filter(Boolean), [memberDocs]);
  const ownerUids = useMemo(() => ownerDocs.map((d) => normalizeUid(d.id)).filter(Boolean), [ownerDocs]);
  const docksMap = useMemo(() => new Map(dockDocs.map((d) => [normalizeUid(d.id), Number(d.docks || 0)])), [dockDocs]);
  const coreSet = useMemo(() => new Set(coreDocs.filter((d) => d.isCoreRaider).map((d) => normalizeUid(d.id))), [coreDocs]);

  const userDirectory = useMemo(() => {
    const merged = new Map<string, DirectoryMeta>();
    memberDocs.forEach((m) => merged.set(normalizeUid(m.id), { uid: normalizeUid(m.id), displayName: m.displayName, email: m.email, profileName: m.profileName }));
    adminDocs.forEach((a) => {
      const uid = normalizeUid(a.id);
      const existing = merged.get(uid) || { uid };
      merged.set(uid, {
        uid,
        displayName: a.displayName || existing.displayName || "",
        email: a.email || existing.email || "",
        profileName: a.profileName || existing.profileName || ""
      });
    });
    return merged;
  }, [memberDocs, adminDocs]);

  // The original admin page set these classes on <body>; the audit table's sizing
  // rules (.admin-operations-page #characterAuditSection …) and the wider admin
  // container key off them. Mirror that here so all the existing CSS applies.
  useEffect(() => {
    document.body.classList.add("admin-operations-page", "admin-page");
    return () => document.body.classList.remove("admin-operations-page", "admin-page");
  }, []);

  return (
    <div className="admin-react-page">
      <SignupRequestsSection signups={signups} characters={characters} raids={raids} />
      <CharacterAuditSection
        signups={signups}
        characters={characters}
        raids={raids}
        adminUids={adminUids}
        memberUids={memberUids}
        ownerUids={ownerUids}
        userDirectory={userDirectory}
        docksMap={docksMap}
        coreSet={coreSet}
      />
    </div>
  );
}

// ── Character Audit ─────────────────────────────────────────────────────────────
function CharacterAuditSection({
  signups,
  characters,
  raids,
  adminUids,
  memberUids,
  ownerUids,
  userDirectory,
  docksMap,
  coreSet
}: {
  signups: Signup[];
  characters: CharacterProfile[];
  raids: RaidLite[];
  adminUids: string[];
  memberUids: string[];
  ownerUids: string[];
  userDirectory: Map<string, DirectoryMeta>;
  docksMap: Map<string, number>;
  coreSet: Set<string>;
}) {
  const { uid: authUid, isAdmin, isOwner } = useAuth();
  const [search, setSearch] = useState("");
  const [coreOnly, setCoreOnly] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean }>({ text: "", error: false });

  const allRows = useMemo(
    () => buildUserAuditRows(signups, characters, adminUids, memberUids, ownerUids, userDirectory, docksMap),
    [signups, characters, adminUids, memberUids, ownerUids, userDirectory, docksMap]
  );

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allRows.filter((row) => {
      if (term && !row.searchIndex.includes(term)) return false;
      if (coreOnly && !row.characterEntries.some((e) => coreSet.has(e.characterId))) return false;
      return true;
    });
  }, [allRows, search, coreOnly, coreSet]);

  const upcomingRaids = useMemo(() => getUpcomingRaidsForAssignment(raids), [raids]);

  // ── handlers ────────────────────────────────────────────────────────────────
  const toggleCore = async (charId: string) => {
    if (!isAdmin || !charId) return;
    try {
      if (coreSet.has(charId)) {
        await deleteDoc(doc(db, "coreRaiders", charId));
      } else {
        await setDoc(doc(db, "coreRaiders", charId), { isCoreRaider: true, updatedAt: serverTimestamp(), updatedBy: authUid || "" });
      }
    } catch (err: any) {
      setMessage({ text: "Error toggling Core Raider: " + err?.message, error: true });
    }
  };

  const changeDock = async (uid: string, action: "add" | "remove") => {
    if (!isAdmin || !uid) return;
    const current = docksMap.get(uid) || 0;
    const next = action === "add" ? current + 1 : Math.max(0, current - 1);
    try {
      await setDoc(doc(db, "attendance_docks", uid), { uid, docks: next, updatedAt: serverTimestamp(), updatedBy: authUid || "" });
    } catch (err: any) {
      setMessage({ text: "Error saving dock: " + err?.message, error: true });
    }
  };

  const changeRole = async (uid: string, nextRole: string, previousRole: string): Promise<boolean> => {
    if (!uid || !isAdmin || !["member", "admin", "remove", "nuke", "owner"].includes(nextRole)) return false;
    if ((nextRole === "nuke" || nextRole === "owner") && !isOwner) {
      setMessage({ text: nextRole === "nuke" ? "Only owners can nuke accounts." : "Only owners can assign the owner role.", error: true });
      return false;
    }
    if (previousRole === "owner" && !isOwner) {
      setMessage({ text: "Only owners can modify another owner's role.", error: true });
      return false;
    }
    try {
      const stamp = () => ({ updatedAt: serverTimestamp(), updatedByUid: authUid, createdAt: serverTimestamp() });
      if (nextRole === "member") {
        await setDoc(doc(db, "members", uid), { uid, role: "member", ...stamp() }, { merge: true });
        await deleteDoc(doc(db, "admins", uid)).catch(() => {});
        await deleteDoc(doc(db, "owners", uid)).catch(() => {});
        setMessage({ text: "Role updated to member.", error: false });
      } else if (nextRole === "admin") {
        await setDoc(doc(db, "admins", uid), { uid, role: "admin", ...stamp() }, { merge: true });
        await setDoc(doc(db, "members", uid), { uid, role: "member", ...stamp() }, { merge: true });
        await deleteDoc(doc(db, "owners", uid)).catch(() => {});
        setMessage({ text: "Role updated to admin.", error: false });
      } else if (nextRole === "remove") {
        await Promise.allSettled([deleteDoc(doc(db, "owners", uid)), deleteDoc(doc(db, "admins", uid)), deleteDoc(doc(db, "members", uid))]);
        setMessage({ text: "Soft ban applied — access revoked. Signups and profiles preserved.", error: false });
      } else if (nextRole === "nuke") {
        const confirmed = window.confirm(
          "NUKE ACCOUNT: This will permanently delete this user's access, ALL signups, and ALL character profiles. This cannot be undone. Continue?"
        );
        if (!confirmed) return false;
        await Promise.allSettled([deleteDoc(doc(db, "owners", uid)), deleteDoc(doc(db, "admins", uid)), deleteDoc(doc(db, "members", uid))]);
        const signupsSnap = await getDocs(query(collection(db, "signups"), where("ownerUid", "==", uid)));
        await Promise.allSettled(signupsSnap.docs.map((d) => deleteDoc(doc(db, "signups", d.id))));
        const charsSnap = await getDocs(query(collection(db, "characters"), where("ownerUid", "==", uid)));
        await Promise.allSettled(charsSnap.docs.map((d) => deleteDoc(doc(db, "characters", d.id))));
        setMessage({ text: "Account nuked — all data permanently deleted.", error: false });
      } else if (nextRole === "owner") {
        await setDoc(doc(db, "owners", uid), { uid, role: "owner", ...stamp() }, { merge: true });
        await setDoc(doc(db, "admins", uid), { uid, role: "admin", ...stamp() }, { merge: true });
        await setDoc(doc(db, "members", uid), { uid, role: "member", ...stamp() }, { merge: true });
        setMessage({ text: "Role updated to owner.", error: false });
      }
      return true;
    } catch (error: any) {
      setMessage({ text: error?.message || "Role update failed.", error: true });
      return false;
    }
  };

  return (
    <section className="card character-audit-grow" id="characterAuditSection">
      <div className="list-header">
        <h2>Character Audit</h2>
        <span className="badge">{filteredRows.length}</span>
      </div>

      <div className="audit-filters">
        <label>
          Search
          <input type="text" placeholder="Search Discord name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="audit-filter-toggle">
          <input type="checkbox" checked={coreOnly} onChange={(e) => setCoreOnly(e.target.checked)} /> ★ Core Raiders Only
        </label>
      </div>

      <div className="table-wrap audit-table-scroll">
        <table className="audit-table">
          <thead>
            <tr>
              <th>Discord</th>
              <th>Character</th>
              <th>Class</th>
              <th>MS</th>
              <th>OS</th>
              <th>Gear</th>
              <th>Logs</th>
              <th>Parses</th>
              <th className="audit-history-col">Attendance</th>
              <th>Role</th>
              <th>Assign Raid</th>
            </tr>
          </thead>
          <tbody>
            {!allRows.length && (
              <tr>
                <td colSpan={11}>No user records found yet.</td>
              </tr>
            )}
            {!!allRows.length && !filteredRows.length && (
              <tr>
                <td colSpan={11}>No matches for current search/filter.</td>
              </tr>
            )}
            {filteredRows.map((row) => (
              <AuditRowView
                key={row.uid}
                row={row}
                signups={signups}
                characters={characters}
                raids={raids}
                upcomingRaids={upcomingRaids}
                coreSet={coreSet}
                isAdmin={isAdmin}
                isOwner={isOwner}
                onToggleCore={toggleCore}
                onDock={changeDock}
                onChangeRole={changeRole}
                onMessage={(text, error) => setMessage({ text, error })}
              />
            ))}
          </tbody>
        </table>
      </div>
      {message.text && <p className={`message${message.error ? " error" : ""}`}>{message.text}</p>}
    </section>
  );
}

function AuditEntryLines({ entries, render }: { entries: AuditCharEntry[]; render: (e: AuditCharEntry) => ReactNode }) {
  if (!entries.length) return <>—</>;
  return (
    <>
      {entries.map((entry) => (
        <span key={entry.characterName} className={`audit-entry-line ${entry.isMain ? "is-main" : "is-alt"}`}>
          {render(entry)}
        </span>
      ))}
    </>
  );
}

function AuditRowView({
  row,
  signups,
  characters,
  raids,
  upcomingRaids,
  coreSet,
  isAdmin,
  isOwner,
  onToggleCore,
  onDock,
  onChangeRole,
  onMessage
}: {
  row: AuditRow;
  signups: Signup[];
  characters: CharacterProfile[];
  raids: RaidLite[];
  upcomingRaids: RaidLite[];
  coreSet: Set<string>;
  isAdmin: boolean;
  isOwner: boolean;
  onToggleCore: (charId: string) => void;
  onDock: (uid: string, action: "add" | "remove") => void;
  onChangeRole: (uid: string, next: string, prev: string) => Promise<boolean>;
  onMessage: (text: string, error: boolean) => void;
}) {
  const entries = row.characterEntries;
  const [roleValue, setRoleValue] = useState(row.role);

  return (
    <tr>
      <td title={row.tooltip}>{row.profileName || row.displayName}</td>
      <td className="audit-stack-cell">
        <AuditEntryLines
          entries={entries}
          render={(entry) => {
            const isCore = coreSet.has(entry.characterId);
            return (
              <>
                <span className="audit-character-name" title={`UID: ${row.uid}\nDiscord Name: ${row.profileName || row.displayName || "Unknown"}\nGoogle Email: ${row.email || "Unknown"}`}>
                  {entry.characterName || "—"}
                </span>
                {isCore && (
                  <span className="core-raider-badge" title="Core Raider">
                    ★
                  </span>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    className={`core-raider-toggle ${isCore ? "is-core" : ""}`}
                    title={isCore ? "Remove Core Raider status" : "Set as Core Raider"}
                    onClick={() => onToggleCore(entry.characterId)}
                  >
                    {isCore ? "★" : "☆"}
                  </button>
                )}
              </>
            );
          }}
        />
      </td>
      <td className="audit-stack-cell">
        <AuditEntryLines entries={entries} render={(e) => <ClassColoredName wowClass={e.wowClass} />} />
      </td>
      <td className="audit-stack-cell">
        <AuditEntryLines entries={entries} render={(e) => <RoleSpec role={e.mainRole} spec={e.mainSpecialization} />} />
      </td>
      <td className="audit-stack-cell">
        <AuditEntryLines entries={entries} render={(e) => <RoleSpec role={e.offRole} spec={e.offSpecialization} />} />
      </td>
      <td className="audit-stack-cell">
        <AuditEntryLines entries={entries} render={(e) => <ExternalLink url={e.armoryUrl} label="Gear" />} />
      </td>
      <td className="audit-stack-cell">
        <AuditEntryLines entries={entries} render={(e) => <ExternalLink url={e.logsUrl} label="Logs" />} />
      </td>
      <td className="audit-stack-cell audit-parses-cell">
        <AuditEntryLines entries={entries} render={(e) => <WclParsesCell characterName={e.characterName} />} />
      </td>
      <td className="audit-history-col">
        <span
          className="attendance-summary"
          title={`Attended: ${row.acceptedTotal} raid${row.acceptedTotal !== 1 ? "s" : ""} | Docked: ${row.docks} time${row.docks !== 1 ? "s" : ""}`}
        >
          <span className="attendance-attended">{row.acceptedTotal} ✓</span>
          {row.docks > 0 && <span className="attendance-docked"> {row.docks} ✗</span>}
        </span>
        {isAdmin && (
          <div className="attendance-dock-controls">
            <button className="attendance-dock-btn" title="Dock for missed raid" onClick={() => onDock(row.uid, "add")}>
              ✕
            </button>
            {row.docks > 0 && (
              <button className="attendance-dock-btn attendance-undock-btn" title="Remove last dock" onClick={() => onDock(row.uid, "remove")}>
                ↩
              </button>
            )}
          </div>
        )}
      </td>
      <td>
        <select
          data-role-uid={row.uid}
          value={roleValue}
          disabled={row.role === "owner" && !isOwner}
          title="Change this user's access role"
          onChange={async (e) => {
            const next = e.target.value;
            setRoleValue(next as AuditRow["role"]);
            const ok = await onChangeRole(row.uid, next, row.role);
            if (!ok) setRoleValue(row.role);
          }}
        >
          <option value="member" title="Standard access — can sign up for raids.">
            Member
          </option>
          <option value="admin" title="Full admin access — can manage raids, approve signups, and change roles.">
            Admin
          </option>
          <option value="remove" title="Revokes all access. Signups and profiles are preserved.">
            ⛔ Soft Ban
          </option>
          {(isOwner || row.role === "owner") && (
            <option value="owner" title="Full owner access — can manage admins, assign owners, and nuke accounts.">
              Owner
            </option>
          )}
          {isOwner && (
            <option value="nuke" title="PERMANENT: Deletes ALL access, signups, and character profiles. Cannot be undone.">
              ☢ Nuke Account
            </option>
          )}
        </select>
        <small className="audit-role-hint">{row.role === "remove" ? "⚠ Soft-banned" : row.role === "owner" ? "⭐ Owner" : ""}</small>
      </td>
      <td className="audit-assign-col">
        <AssignmentControl row={row} entries={entries} signups={signups} characters={characters} raids={raids} upcomingRaids={upcomingRaids} isAdmin={isAdmin} onMessage={onMessage} />
      </td>
    </tr>
  );
}

function AssignmentControl({
  row,
  entries,
  signups,
  characters,
  raids,
  upcomingRaids,
  isAdmin,
  onMessage
}: {
  row: AuditRow;
  entries: AuditCharEntry[];
  signups: Signup[];
  characters: CharacterProfile[];
  raids: RaidLite[];
  upcomingRaids: RaidLite[];
  isAdmin: boolean;
  onMessage: (text: string, error: boolean) => void;
}) {
  const { uid: authUid } = useAuth();
  const [busy, setBusy] = useState(false);

  // initial selection prefers an existing upcoming signup
  const upcomingIds = useMemo(() => new Set(upcomingRaids.map((r) => String(r.id))), [upcomingRaids]);
  const entryNames = useMemo(() => new Set(entries.map((e) => String(e.characterName || "").trim().toLowerCase())), [entries]);
  const existingUpcoming = useMemo(
    () =>
      signups.find((s) => {
        const ownerUid = normalizeUid(s.ownerUid);
        const characterName = String(s.profileCharacterName || s.characterName || "").trim().toLowerCase();
        return ownerUid === row.uid && upcomingIds.has(String(s.raidId || "")) && entryNames.has(characterName);
      }),
    [signups, row.uid, upcomingIds, entryNames]
  );

  const [raidId, setRaidId] = useState(() => String(existingUpcoming?.raidId || upcomingRaids[0]?.id || ""));
  const [charName, setCharName] = useState(() => {
    const selectedName = String(existingUpcoming?.profileCharacterName || existingUpcoming?.characterName || entries[0]?.characterName || "").trim().toLowerCase();
    return entries.find((e) => String(e.characterName || "").trim().toLowerCase() === selectedName)?.characterName || entries[0]?.characterName || "";
  });

  if (!entries.length) return <>—</>;
  if (!upcomingRaids.length) return <span className="request-action-na">No upcoming raids</span>;

  const existing = findExistingAssignment(row.uid, raidId, charName, signups);
  const state = !existing
    ? { label: "Unassigned", className: "is-unassigned", hasAssignment: false }
    : normalizeSignupStatus(existing.status) === "tentative"
    ? { label: "Benched", className: "is-benched", hasAssignment: true }
    : { label: "Assigned", className: "is-assigned", hasAssignment: true };

  const doAssign = async (action: "assign" | "bench" | "unassign") => {
    if (!isAdmin) return;
    const selectedRaid = raids.find((r) => r.id === raidId);
    if (!raidId || !charName || !selectedRaid) {
      onMessage("Select a raid and character before assigning.", true);
      return;
    }
    const existingNow = findExistingAssignment(row.uid, raidId, charName, signups);
    setBusy(true);
    try {
      if (action === "unassign") {
        if (!existingNow?.id) {
          onMessage("No existing signup found for that raid and character.", true);
          return;
        }
        await deleteDoc(doc(db, "signups", existingNow.id));
        onMessage(`Unassigned ${charName} from ${selectedRaid.raidName || "raid"}.`, false);
        return;
      }
      if (existingNow?.id) {
        onMessage("That character is already signed up for the selected raid. Use Unassign to remove them.", true);
        return;
      }
      const nextStatus = action === "bench" ? "tentative" : "accept";
      const resolved = resolveProfileCharacterForAssignment(row.uid, charName, characters);
      if (!resolved) {
        onMessage("Unable to resolve profile/character for assignment.", true);
        return;
      }
      const { profile, characterEntry } = resolved;
      const payload = normalizeAssignmentPayloadForRules({
        characterId: profile.id,
        profileCharacterKey: characterEntry.key || "main",
        profileCharacterName: characterEntry.characterName || charName,
        raidId: selectedRaid.id,
        raidDate: selectedRaid.raidDate,
        raidName: selectedRaid.raidName,
        phase: selectedRaid.phase,
        runType: selectedRaid.runType,
        raidSize: selectedRaid.raidSize,
        raidStart: selectedRaid.raidStart,
        raidEnd: selectedRaid.raidEnd,
        status: nextStatus,
        ownerUid: row.uid,
        updatedAt: serverTimestamp()
      });
      if (!payload) {
        onMessage("Selected raid has invalid schedule data. Please check raid start/end in Admin: Raids.", true);
        return;
      }
      await setDoc(doc(collection(db, "signups")), { ...payload, createdAt: serverTimestamp() });
      onMessage(`Assigned ${charName} to ${selectedRaid.raidName || "raid"} (${signupStatusLabel(nextStatus)}).`, false);
    } catch (error: any) {
      onMessage(error?.message || "Assignment failed.", true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="audit-assignment">
      <select value={raidId} onChange={(e) => setRaidId(e.target.value)}>
        {upcomingRaids.map((raid) => (
          <option key={raid.id} value={raid.id}>
            {formatRaidAssignmentLabel(raid)}
          </option>
        ))}
      </select>
      <select value={charName} onChange={(e) => setCharName(e.target.value)}>
        {entries.map((entry) => (
          <option key={entry.characterName} value={entry.characterName}>
            {entry.characterName}
          </option>
        ))}
      </select>
      <div className="audit-assignment-actions">
        <span className={`audit-assignment-state ${state.className}`}>{state.label}</span>
        {state.hasAssignment ? (
          <button type="button" className="audit-action-unassign" disabled={busy} onClick={() => doAssign("unassign")}>
            Unassign
          </button>
        ) : (
          <>
            <button type="button" className="audit-action-assign" disabled={busy} onClick={() => doAssign("assign")}>
              Assign
            </button>
            <button type="button" disabled={busy} onClick={() => doAssign("bench")}>
              Bench
            </button>
          </>
        )}
      </div>
    </div>
  );
}
