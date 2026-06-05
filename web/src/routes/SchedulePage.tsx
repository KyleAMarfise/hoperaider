import { useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, orderBy, query, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useCollection } from "../hooks/useCollection";
import { useDoc } from "../hooks/useDoc";
import { Modal } from "../components/common/Modal";
import { cx } from "../lib/formatters";
import { END_HOURS, START_HOURS, buildTimezoneLines, detectViewerTimezoneLabel, hourLabel } from "../lib/timezone";

const DAY_ORDER = ["Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Monday"];
const VIEWER_TZ = detectViewerTimezoneLabel();
const DEFAULT_TITLE = "HOPE GUILD RAID SCHEDULE";

interface ScheduleEntry {
  id: string;
  day?: string;
  emoji?: string;
  title?: string;
  startHour?: number | null;
  endHour?: number | null;
  details?: string[];
  sortOrder?: number;
  time?: string; // legacy freeform
}
interface ScheduleConfig {
  id?: string;
  title?: string;
  goalsTitle?: string;
  goals?: string[];
}
interface EntryFields {
  day: string;
  emoji: string;
  title: string;
  startHour: number | null;
  endHour: number | null;
  details: string[];
}

function HourSelect({ hours, value, onChange }: { hours: number[]; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <select
      className="sched-input"
      value={value === null || value === undefined ? "" : String(value)}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
    >
      <option value="">None</option>
      {hours.map((h) => (
        <option key={h} value={h}>
          {hourLabel(h)}
        </option>
      ))}
    </select>
  );
}

function TimezoneBlock({ entry }: { entry: ScheduleEntry }) {
  const startHour = Number.isInteger(entry.startHour as number) ? (entry.startHour as number) : null;
  const endHour = Number.isInteger(entry.endHour as number) ? (entry.endHour as number) : null;
  const legacyTime = !startHour && !endHour && entry.time ? entry.time : null;
  if (legacyTime) {
    return (
      <div className="sched-time">
        <span className="sched-tz-cst">{legacyTime}</span>
      </div>
    );
  }
  const lines = buildTimezoneLines(startHour, endHour);
  if (!lines.length) return null;
  return (
    <div className="sched-time">
      {lines.map((l) => (
        <span
          key={l.label}
          className={cx("sched-tz-line", l.label === "CST" && "sched-tz-cst", VIEWER_TZ && l.label === VIEWER_TZ && "sched-tz-local")}
        >
          {l.text}
        </span>
      ))}
    </div>
  );
}

function EditRow({
  entry,
  onSave,
  onCancel
}: {
  entry: ScheduleEntry;
  onSave: (fields: EntryFields) => Promise<void>;
  onCancel: () => void;
}) {
  const [day, setDay] = useState(entry.day ?? "Tuesday");
  const [emoji, setEmoji] = useState(entry.emoji ?? "");
  const [title, setTitle] = useState(entry.title ?? "");
  const [startHour, setStartHour] = useState<number | null>(Number.isInteger(entry.startHour as number) ? (entry.startHour as number) : null);
  const [endHour, setEndHour] = useState<number | null>(Number.isInteger(entry.endHour as number) ? (entry.endHour as number) : null);
  const [details, setDetails] = useState((entry.details ?? []).join("\n"));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setBusy(true);
    try {
      await onSave({
        day,
        emoji: emoji.trim(),
        title: title.trim(),
        startHour,
        endHour,
        details: details.split("\n").map((l) => l.trim()).filter(Boolean)
      });
    } catch (e: any) {
      setError(e?.message || "Save failed.");
      setBusy(false);
    }
  };

  return (
    <div className="sched-row sched-row-editing">
      <div className="sched-edit-fields">
        <div className="sched-edit-row">
          <label className="sched-edit-label">
            Day
            <select className="sched-input" value={day} onChange={(e) => setDay(e.target.value)}>
              {DAY_ORDER.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="sched-edit-label sched-edit-label-sm">
            Emoji
            <input className="sched-input" type="text" maxLength={4} value={emoji} onChange={(e) => setEmoji(e.target.value)} />
          </label>
        </div>
        <label className="sched-edit-label">
          Title
          <input className="sched-input" type="text" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="sched-edit-row">
          <label className="sched-edit-label">
            Start Time (CST) <small className="help-text">(leave as None for off/flex days)</small>
            <HourSelect hours={START_HOURS} value={startHour} onChange={setStartHour} />
          </label>
          <label className="sched-edit-label">
            End Time (CST) <small className="help-text">&nbsp;</small>
            <HourSelect hours={END_HOURS} value={endHour} onChange={setEndHour} />
          </label>
        </div>
        <label className="sched-edit-label">
          Details <small className="help-text">(one per line — bullets are added automatically)</small>
          <textarea className="sched-input" rows={5} value={details} onChange={(e) => setDetails(e.target.value)} />
        </label>
      </div>
      <div className="sched-edit-actions">
        <button type="button" className="sched-save-btn" disabled={busy} onClick={submit}>
          Save
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {error && <p className="sched-edit-msg message error">{error}</p>}
    </div>
  );
}

export function SchedulePage() {
  const { isAdmin } = useAuth();
  const scheduleQuery = useMemo(() => query(collection(db, "schedule"), orderBy("sortOrder", "asc")), []);
  const configRef = useMemo(() => doc(db, "schedule", "scheduleConfig"), []);
  const { docs } = useCollection<ScheduleEntry>(scheduleQuery);
  const { data: config } = useDoc<ScheduleConfig>(configRef);

  const entries = useMemo(
    () =>
      docs
        .filter((d) => d.id !== "scheduleConfig")
        .slice()
        .sort((a, b) => {
          const ai = DAY_ORDER.indexOf(a.day ?? "");
          const bi = DAY_ORDER.indexOf(b.day ?? "");
          if (ai !== bi) return ai - bi;
          return (a.sortOrder || 0) - (b.sortOrder || 0);
        }),
    [docs]
  );

  const title = config?.title || DEFAULT_TITLE;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const saveTitle = async () => {
    if (!titleDraft.trim()) return;
    await setDoc(configRef, { title: titleDraft.trim(), updatedAt: serverTimestamp() }, { merge: true });
    setTitleEditing(false);
  };

  const saveEntry = async (docId: string, fields: EntryFields) => {
    await updateDoc(doc(db, "schedule", docId), {
      ...fields,
      sortOrder: DAY_ORDER.indexOf(fields.day),
      updatedAt: serverTimestamp()
    });
    setEditingId(null);
  };

  const addEntry = async (fields: EntryFields) => {
    await addDoc(collection(db, "schedule"), {
      ...fields,
      sortOrder: DAY_ORDER.indexOf(fields.day),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    setAddOpen(false);
  };

  const deleteEntry = async (docId: string) => {
    if (!window.confirm("Delete this day from the schedule?")) return;
    try {
      await deleteDoc(doc(db, "schedule", docId));
      if (editingId === docId) setEditingId(null);
    } catch (e: any) {
      window.alert(e?.message || "Delete failed.");
    }
  };

  return (
    <div className="scroll-parchment schedule-parchment">
      <div className="scroll-parchment-inner">
        <div className="scroll-title-row">
          <h2 className="scroll-title">{title}</h2>
          {isAdmin && !titleEditing && (
            <button
              type="button"
              className="sched-action-btn"
              title="Edit title"
              onClick={() => {
                setTitleDraft(title);
                setTitleEditing(true);
              }}
            >
              &#9998;
            </button>
          )}
        </div>
        {titleEditing && (
          <div className="scroll-title-edit">
            <input className="sched-input scroll-title-input" type="text" maxLength={120} value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} />
            <button type="button" className="sched-save-btn" onClick={() => void saveTitle()}>
              Save
            </button>
            <button type="button" className="secondary" onClick={() => setTitleEditing(false)}>
              Cancel
            </button>
          </div>
        )}

        <hr className="scroll-divider" />

        <div className="schedule-doc">
          {entries.length === 0 && <p className="schedule-empty">No schedule entries yet.</p>}
          {entries.map((entry) =>
            editingId === entry.id ? (
              <EditRow key={entry.id} entry={entry} onSave={(fields) => saveEntry(entry.id, fields)} onCancel={() => setEditingId(null)} />
            ) : (
              <div className="sched-row" key={entry.id}>
                <div className="sched-row-columns">
                  <div className="sched-row-left">
                    <div className="sched-row-head">
                      <span className="sched-emoji">{entry.emoji || ""}</span>
                      <span className="sched-day">{entry.day}</span>
                      <span className="sched-sep">–</span>
                      <span className="sched-title">{entry.title}</span>
                    </div>
                    {Array.isArray(entry.details) && entry.details.length > 0 && (
                      <ul className="sched-details">
                        {entry.details.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="sched-row-right">
                    <TimezoneBlock entry={entry} />
                    {isAdmin && (
                      <div className="sched-row-actions">
                        <button type="button" className="sched-action-btn" title="Edit" onClick={() => setEditingId(entry.id)}>
                          &#9998;
                        </button>
                        <button type="button" className="sched-action-btn sched-delete-btn" title="Delete" onClick={() => void deleteEntry(entry.id)}>
                          &times;
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          )}
        </div>

        {isAdmin && (
          <div className="scroll-footer-actions">
            <button type="button" className="secondary" onClick={() => setAddOpen(true)}>
              + Add Day
            </button>
          </div>
        )}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} className="sched-add-dialog">
        <div className="sched-add-dialog-content">
          <h3 className="sched-add-dialog-title">Add Day to Schedule</h3>
          <EditRow
            key={addOpen ? "add" : "closed"}
            entry={{ id: "new", day: "Tuesday", emoji: "", title: "", startHour: null, endHour: null, details: [] }}
            onSave={addEntry}
            onCancel={() => setAddOpen(false)}
          />
        </div>
      </Modal>
    </div>
  );
}
