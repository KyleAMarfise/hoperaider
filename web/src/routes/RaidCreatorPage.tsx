import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useCollection } from "../hooks/useCollection";
import { cx, formatMonthDayYear, parseDateOnly, toDateOnlyString } from "../lib/formatters";
import { END_HOURS, START_HOURS, buildTimezoneLines, hourLabel } from "../lib/timezone";
import {
  BOSS_KILL_ORDER,
  RAID_PRESETS_BY_PHASE,
  getClassesForRole,
  getDefaultRoleSlots,
  getSpecsForRoleClass,
  migrateRaidName,
  type RoleSpecSlot
} from "../constants/raids";
import type { Raid } from "../types/firestore";

function getRaidCutoffDate(item: Raid): Date | null {
  const raidDate = parseDateOnly(item.raidDate);
  if (!raidDate) return null;
  const hour = Number.isInteger(item.raidEnd as number)
    ? (item.raidEnd as number)
    : Number.isInteger(item.raidStart as number)
    ? (item.raidStart as number)
    : 0;
  const cutoff = new Date(raidDate);
  cutoff.setHours(hour, 0, 0, 0);
  return cutoff;
}

function sortRaids(rows: Raid[]): Raid[] {
  return [...rows].sort((a, b) => {
    const am = parseDateOnly(a.raidDate)?.getTime() || 0;
    const bm = parseDateOnly(b.raidDate)?.getTime() || 0;
    if (am !== bm) return am - bm;
    return (a.raidStart ?? 0) - (b.raidStart ?? 0);
  });
}

function RaidWindow({ start, end }: { start?: number; end?: number }) {
  const lines = buildTimezoneLines(
    Number.isInteger(start as number) ? (start as number) : null,
    Number.isInteger(end as number) ? (end as number) : null
  );
  if (!lines.length) return <>—</>;
  return (
    <>
      {lines.map((l) => (
        <span key={l.label} className={cx("raid-time-line", l.label === "CST" && "raid-time-cst")}>
          {l.text}
        </span>
      ))}
    </>
  );
}

function RaidTable({
  items,
  editingId,
  onEdit,
  onDelete
}: {
  items: Raid[];
  editingId: string;
  onEdit: (r: Raid) => void;
  onDelete: (r: Raid) => void;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Phase</th>
            <th>Raid</th>
            <th>Date</th>
            <th>Window (CST base)</th>
            <th>Run Type</th>
            <th>Leader</th>
            <th>Size</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={8}>No raids.</td>
            </tr>
          )}
          {items.map((item) => {
            const slotParts: string[] = [];
            if (item.tankSlots != null) slotParts.push(`🛡${item.tankSlots}`);
            if (item.healerSlots != null) slotParts.push(`✚${item.healerSlots}`);
            if (item.dpsSlots != null) slotParts.push(`⚔${item.dpsSlots}`);
            return (
              <tr key={item.id} className={cx(item.id === editingId && "raid-row-editing")}>
                <td>Phase {item.phase}</td>
                <td>{item.raidName}</td>
                <td>{formatMonthDayYear(item.raidDate)}</td>
                <td className="raid-time-cell">
                  <RaidWindow start={item.raidStart} end={item.raidEnd} />
                </td>
                <td>
                  {item.runType}
                  {item.runType === "Partial" && item.plannedBosses?.length ? (
                    <>
                      <br />
                      <span className="planned-bosses-inline">
                        {item.plannedBosses.length} boss{item.plannedBosses.length > 1 ? "es" : ""}
                      </span>
                    </>
                  ) : null}
                </td>
                <td>{item.raidLeader || "—"}</td>
                <td>
                  {item.raidSize || "—"}
                  {slotParts.length > 0 && (
                    <>
                      <br />
                      <span className="raid-slot-mini">{slotParts.join(" ")}</span>
                    </>
                  )}
                </td>
                <td>
                  <div className="row-actions">
                    <button
                      type="button"
                      className={cx(item.id === editingId && "raid-row-editing-btn")}
                      onClick={() => onEdit(item)}
                    >
                      {item.id === editingId ? "✎ Editing" : "Edit"}
                    </button>
                    <button type="button" className="danger" onClick={() => onDelete(item)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RaidCreatorPage() {
  const { isAdmin, uid } = useAuth();
  const raidsQuery = useMemo(() => query(collection(db, "raids"), orderBy("raidDate", "asc")), []);
  const { docs: raids } = useCollection<Raid>(raidsQuery);

  const [adminMainChar, setAdminMainChar] = useState("");
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "characters"), where("ownerUid", "==", uid), limit(1)));
        if (!cancelled && !snap.empty) {
          const d = snap.docs[0].data() as { characterName?: string };
          setAdminMainChar(d.characterName || "");
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // ── Form state ──
  const [editingId, setEditingId] = useState("");
  const [phase, setPhase] = useState(1);
  const [raidName, setRaidName] = useState(RAID_PRESETS_BY_PHASE[1][0].name);
  const [raidDate, setRaidDate] = useState(toDateOnlyString(new Date()));
  const [runType, setRunType] = useState("Weekly");
  const [raidLeader, setRaidLeader] = useState("");
  const [raidStart, setRaidStart] = useState<number | null>(null);
  const [raidEnd, setRaidEnd] = useState<number | null>(null);
  const [tankSlots, setTankSlots] = useState("");
  const [healerSlots, setHealerSlots] = useState("");
  const [dpsSlots, setDpsSlots] = useState("");
  const [roleSpecSlots, setRoleSpecSlots] = useState<RoleSpecSlot[]>([]);
  const [plannedBosses, setPlannedBosses] = useState<string[]>([]);
  const [message, setMessage] = useState<{ text: string; error: boolean }>({ text: "", error: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (adminMainChar && !editingId && !raidLeader) setRaidLeader(adminMainChar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminMainChar]);

  const presets = RAID_PRESETS_BY_PHASE[phase] || [];
  const matched = presets.find((r) => r.name === raidName);
  const raidSize = matched ? `${matched.size}-man` : "";
  const bosses = BOSS_KILL_ORDER[raidName] || BOSS_KILL_ORDER[migrateRaidName(raidName)] || [];
  const showBosses = runType === "Partial" && bosses.length > 0;
  const endHourOptions = raidStart === null ? END_HOURS : END_HOURS.filter((h) => h > raidStart);

  const applyDefaults = (ph: number, name: string) => {
    const m = (RAID_PRESETS_BY_PHASE[ph] || []).find((r) => r.name === name);
    if (m) {
      setTankSlots(String(m.tanks));
      setHealerSlots(String(m.healers));
      setDpsSlots(String(m.dps));
    } else {
      const d = getDefaultRoleSlots("");
      setTankSlots(String(d.tank));
      setHealerSlots(String(d.healer));
      setDpsSlots(String(d.dps));
    }
  };

  const onPhaseChange = (np: number) => {
    setPhase(np);
    const first = (RAID_PRESETS_BY_PHASE[np] || [])[0];
    const name = first ? first.name : "";
    setRaidName(name);
    applyDefaults(np, name);
    setPlannedBosses([]);
  };
  const onRaidChange = (name: string) => {
    setRaidName(name);
    applyDefaults(phase, name);
    setPlannedBosses([]);
  };

  const addSpecRow = () => setRoleSpecSlots((s) => [...s, { role: "", class: "", spec: "", count: 1 }]);
  const removeSpecRow = (i: number) => setRoleSpecSlots((s) => s.filter((_, idx) => idx !== i));
  const updateSpecRow = (i: number, patch: Partial<RoleSpecSlot>) =>
    setRoleSpecSlots((s) =>
      s.map((r, idx) => {
        if (idx !== i) return r;
        const next = { ...r, ...patch };
        if (patch.role !== undefined) {
          const classes = getClassesForRole(patch.role);
          next.class = "";
          next.spec = "";
          if (classes.length === 1) {
            next.class = classes[0];
            const specs = getSpecsForRoleClass(patch.role, classes[0]);
            if (specs.length === 1) next.spec = specs[0];
          }
        }
        if (patch.class !== undefined) {
          next.spec = "";
          const specs = getSpecsForRoleClass(next.role, patch.class);
          if (specs.length === 1) next.spec = specs[0];
        }
        return next;
      })
    );

  const resetForm = () => {
    setEditingId("");
    setPhase(1);
    setRaidName(RAID_PRESETS_BY_PHASE[1][0].name);
    setRaidDate(toDateOnlyString(new Date()));
    setRunType("Weekly");
    setRaidLeader(adminMainChar);
    setRaidStart(null);
    setRaidEnd(null);
    applyDefaults(1, RAID_PRESETS_BY_PHASE[1][0].name);
    setRoleSpecSlots([]);
    setPlannedBosses([]);
    setMessage({ text: "", error: false });
  };

  const cancelEdit = () => {
    if (
      window.confirm(
        "Discard your unsaved changes to this raid?\n\nThe raid itself — and its sign-ups and soft reserves — are NOT deleted. Only your in-progress edits are discarded."
      )
    ) {
      resetForm();
    }
  };

  const loadForm = (item: Raid) => {
    setEditingId(item.id);
    setPhase(item.phase || 1);
    setRaidName(item.raidName || "");
    setRaidDate(item.raidDate || "");
    setRunType(item.runType || "Weekly");
    setRaidLeader(item.raidLeader || "");
    setRaidStart(Number.isInteger(item.raidStart as number) ? (item.raidStart as number) : null);
    setRaidEnd(Number.isInteger(item.raidEnd as number) ? (item.raidEnd as number) : null);
    setTankSlots(item.tankSlots != null ? String(item.tankSlots) : "");
    setHealerSlots(item.healerSlots != null ? String(item.healerSlots) : "");
    setDpsSlots(item.dpsSlots != null ? String(item.dpsSlots) : "");
    setRoleSpecSlots(item.roleSpecSlots || []);
    setPlannedBosses(item.plannedBosses || []);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setMessage({ text: "Admin access is required.", error: true });
      return;
    }
    if (!presets.some((r) => r.name === raidName)) {
      setMessage({ text: "Please select a valid raid for the chosen phase.", error: true });
      return;
    }
    if (!parseDateOnly(raidDate)) {
      setMessage({ text: "Please select a valid raid date.", error: true });
      return;
    }
    if (raidStart === null) {
      setMessage({ text: "Please select a start time.", error: true });
      return;
    }
    if (raidEnd === null) {
      setMessage({ text: "Please select an end time.", error: true });
      return;
    }
    if (raidEnd <= raidStart) {
      setMessage({ text: "End time must be after the start time.", error: true });
      return;
    }

    const payload = {
      phase,
      raidName,
      raidDate,
      runType,
      raidLeader: raidLeader.trim(),
      raidStart,
      raidEnd,
      raidSize,
      tankSlots: Number(tankSlots) || 0,
      healerSlots: Number(healerSlots) || 0,
      dpsSlots: Number(dpsSlots) || 0,
      plannedBosses: runType === "Partial" ? plannedBosses : [],
      roleSpecSlots: roleSpecSlots
        .filter((s) => s.role)
        .map((s) => ({ role: s.role, class: s.class, spec: s.spec, count: Number(s.count) || 1 })),
      createdByUid: uid,
      updatedAt: serverTimestamp()
    };

    setBusy(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, "raids", editingId), payload);
        setMessage({ text: "Raid updated.", error: false });
      } else {
        await addDoc(collection(db, "raids"), { ...payload, createdAt: serverTimestamp() });
        setMessage({ text: "Raid created.", error: false });
      }
      resetForm();
    } catch (err: any) {
      setMessage({ text: err?.message || "Save failed.", error: true });
    } finally {
      setBusy(false);
    }
  };

  const deleteRaid = async (item: Raid) => {
    if (!window.confirm(`Delete raid ${item.raidName} on ${item.raidDate}? This also deletes all signups for this raid.`)) return;
    try {
      const signupsSnap = await getDocs(query(collection(db, "signups"), where("raidId", "==", item.id)));
      await Promise.allSettled(signupsSnap.docs.map((s) => deleteDoc(s.ref)));
      await deleteDoc(doc(db, "raids", item.id));
      if (editingId === item.id) resetForm();
      setMessage({ text: "Raid and associated signups deleted.", error: false });
    } catch (err: any) {
      setMessage({ text: err?.message || "Delete failed.", error: true });
    }
  };

  // ── Grouping for the lists ──
  const { current, past } = useMemo(() => {
    const now = new Date();
    const sorted = sortRaids(raids);
    const cur: Raid[] = [];
    const pst: Raid[] = [];
    for (const item of sorted) {
      const cutoff = getRaidCutoffDate(item);
      if (cutoff && cutoff < now) pst.push(item);
      else cur.push(item);
    }
    pst.sort((a, b) => {
      const am = parseDateOnly(a.raidDate)?.getTime() || 0;
      const bm = parseDateOnly(b.raidDate)?.getTime() || 0;
      if (bm !== am) return bm - am;
      return (b.raidStart ?? 0) - (a.raidStart ?? 0);
    });
    return { current: cur, past: pst };
  }, [raids]);

  if (!isAdmin) {
    return (
      <section className="card">
        <p className="message">This page is for admins only.</p>
      </section>
    );
  }

  const editingRaid = editingId ? raids.find((r) => r.id === editingId) : null;

  return (
    <section className={cx("card admin-raid-section-compact", editingId && "raid-editing")}>
      <div className="list-header">
        <h2>{editingId ? "Editing Raid (Admin)" : "Raid Creation (Admin)"}</h2>
      </div>

      {editingId && (
        <div className="raid-edit-banner">
          <span>
            ✎ Now editing <strong>{editingRaid?.raidName ?? "this raid"}</strong>
            {editingRaid?.raidDate ? ` — ${formatMonthDayYear(editingRaid.raidDate)}` : ""}. Make your changes and press
            {" "}
            <strong>Update Raid</strong>.
          </span>
          <button type="button" className="secondary raid-cancel-btn" onClick={cancelEdit}>
            Cancel Edit
          </button>
        </div>
      )}

      <form className="form admin-form" onSubmit={submit}>
        <div className="primary-fields raid-primary-fields">
          <label>
            Phase
            <select value={phase} onChange={(e) => onPhaseChange(Number(e.target.value))}>
              {Object.keys(RAID_PRESETS_BY_PHASE)
                .map(Number)
                .sort((a, b) => a - b)
                .map((p) => (
                  <option key={p} value={p}>
                    Phase {p}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Raid
            <select value={raidName} onChange={(e) => onRaidChange(e.target.value)}>
              {presets.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Raid Date
            <input type="date" value={raidDate} onChange={(e) => setRaidDate(e.target.value)} required />
          </label>
          <label>
            Run Type
            <select value={runType} onChange={(e) => setRunType(e.target.value)}>
              <option value="Weekly">Weekly — Full raid, all bosses</option>
              <option value="Partial">Partial — Select bosses only</option>
              <option value="Core Group">Core Group — Core raiders only</option>
            </select>
          </label>
          <label>
            Raid Leader
            <input type="text" maxLength={40} placeholder="Character name" value={raidLeader} onChange={(e) => setRaidLeader(e.target.value)} />
          </label>
        </div>

        <div className="time-slots">
          <fieldset className="slot-group">
            <legend>Raid Window (CST)</legend>
            <div className="slot-range">
              <label>
                CST Start Time
                <select value={raidStart === null ? "" : String(raidStart)} onChange={(e) => setRaidStart(e.target.value === "" ? null : Number(e.target.value))} required>
                  <option value="">Select CST start</option>
                  {START_HOURS.map((h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                CST End Time
                <select value={raidEnd === null ? "" : String(raidEnd)} onChange={(e) => setRaidEnd(e.target.value === "" ? null : Number(e.target.value))} required>
                  <option value="">Select CST end</option>
                  {endHourOptions.map((h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="slot-size-inline">
                Raid Size
                <input type="text" readOnly value={raidSize} />
              </label>
            </div>
          </fieldset>
        </div>

        <div className="time-slots">
          <fieldset className="slot-group">
            <legend>Role Slots</legend>
            <div className="slot-range slot-range-3col">
              <label>
                🛡 Tanks
                <input type="number" min={0} max={25} value={tankSlots} onChange={(e) => setTankSlots(e.target.value)} />
              </label>
              <label>
                ✚ Healers
                <input type="number" min={0} max={25} value={healerSlots} onChange={(e) => setHealerSlots(e.target.value)} />
              </label>
              <label>
                ⚔ DPS
                <input type="number" min={0} max={25} value={dpsSlots} onChange={(e) => setDpsSlots(e.target.value)} />
              </label>
            </div>
          </fieldset>
        </div>

        <div className="time-slots">
          <fieldset className="slot-group">
            <legend>Role Composition (Optional)</legend>
            <small className="help-text">Specify exactly what classes/specs you need per role. Leave empty to use total slot counts only.</small>
            <div className="role-spec-rows">
              {roleSpecSlots.map((row, i) => {
                const classes = row.role ? getClassesForRole(row.role) : [];
                const specs = row.role && row.class ? getSpecsForRoleClass(row.role, row.class) : [];
                return (
                  <div className="role-spec-row" key={i}>
                    <select className="role-spec-role" value={row.role} onChange={(e) => updateSpecRow(i, { role: e.target.value })}>
                      <option value="">Role</option>
                      <option value="Tank">🛡 Tank</option>
                      <option value="Healer">✚ Healer</option>
                      <option value="DPS">⚔ DPS</option>
                    </select>
                    <select className="role-spec-class" value={row.class} onChange={(e) => updateSpecRow(i, { class: e.target.value })}>
                      <option value="">Class</option>
                      {classes.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <select className="role-spec-spec" value={row.spec} onChange={(e) => updateSpecRow(i, { spec: e.target.value })}>
                      <option value="">Any Spec</option>
                      {specs.map((sp) => (
                        <option key={sp} value={sp}>
                          {sp}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      className="role-spec-count"
                      min={1}
                      max={25}
                      value={row.count}
                      title="How many"
                      onChange={(e) => updateSpecRow(i, { count: Number(e.target.value) || 1 })}
                    />
                    <button type="button" className="role-spec-remove-btn" title="Remove" onClick={() => removeSpecRow(i)}>
                      &times;
                    </button>
                  </div>
                );
              })}
            </div>
            <button type="button" className="secondary role-spec-add-btn" onClick={addSpecRow}>
              + Add Spec Slot
            </button>
          </fieldset>
        </div>

        {showBosses && (
          <div className="time-slots">
            <fieldset className="slot-group">
              <legend>Planned Bosses</legend>
              <div className="partial-boss-grid">
                {bosses.map((boss) => {
                  const checked = plannedBosses.includes(boss);
                  return (
                    <label className="partial-boss-label" key={boss}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setPlannedBosses((prev) => (e.target.checked ? [...prev, boss] : prev.filter((b) => b !== boss)))
                        }
                      />{" "}
                      {boss}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </div>
        )}

        <div className="actions">
          <button type="submit" className={cx(editingId && "raid-update-btn")} disabled={busy}>
            {editingId ? "Update Raid" : "Save Raid"}
          </button>
          {editingId && (
            <button type="button" className="secondary raid-cancel-btn" onClick={cancelEdit}>
              Cancel Edit
            </button>
          )}
        </div>
      </form>

      <div className="raid-groups admin-raid-groups">
        <section className="raid-group current-raids">
          <div className="list-header">
            <h3>Current / Up-Coming Raids</h3>
            <span className="badge">{current.length}</span>
          </div>
          <RaidTable items={current} editingId={editingId} onEdit={loadForm} onDelete={deleteRaid} />
        </section>

        <details className="raid-group past-raids admin-past-details">
          <summary className="list-header">
            <h3>
              Previous / Past Raids <span className="past-toggle-hint">(expand / collapse)</span>
            </h3>
            <span className="badge">{past.length}</span>
          </summary>
          <RaidTable items={past} editingId={editingId} onEdit={loadForm} onDelete={deleteRaid} />
        </details>
      </div>

      {message.text && <p className={cx("message", message.error && "error")}>{message.text}</p>}
    </section>
  );
}
