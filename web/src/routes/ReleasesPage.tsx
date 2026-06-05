import { useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useCollection } from "../hooks/useCollection";
import { Modal } from "../components/common/Modal";
import { cx } from "../lib/formatters";

interface Release {
  id: string;
  releaseDate?: string;
  version?: string;
  summary?: string;
  details?: string[];
}

interface ReleaseFormData {
  releaseDate: string;
  version: string;
  summary: string;
  details: string[];
}

function formatReleaseDate(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ReleaseForm({
  release,
  onSubmit,
  onDelete,
  onClose
}: {
  release: Release | null;
  onSubmit: (data: ReleaseFormData) => Promise<void>;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [releaseDate, setReleaseDate] = useState(release?.releaseDate ?? todayString());
  const [version, setVersion] = useState(release?.version ?? "");
  const [summary, setSummary] = useState(release?.summary ?? "");
  const [details, setDetails] = useState((release?.details ?? []).join("\n"));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!releaseDate) {
      setError("Date is required.");
      return;
    }
    if (!summary.trim()) {
      setError("Summary is required.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        releaseDate,
        version: version.trim(),
        summary: summary.trim(),
        details: details.split("\n").map((s) => s.trim()).filter(Boolean)
      });
    } catch (e: any) {
      setError(e?.message || "Save failed.");
      setBusy(false);
    }
  };

  return (
    <div className="sched-add-dialog-content">
      <h3 className="sched-add-dialog-title">{release ? "Edit Release Note" : "Add Release Note"}</h3>
      <div className="sched-edit-fields">
        <div className="sched-edit-row">
          <label className="sched-edit-label">
            Date
            <input className="sched-input" type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} />
          </label>
          <label className="sched-edit-label">
            Version <small className="help-text">(optional)</small>
            <input className="sched-input" type="text" maxLength={20} placeholder="v1.2.0" value={version} onChange={(e) => setVersion(e.target.value)} />
          </label>
        </div>
        <label className="sched-edit-label">
          Summary
          <input className="sched-input" type="text" maxLength={120} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </label>
        <label className="sched-edit-label">
          Details <small className="help-text">(one per line — bullets are added automatically)</small>
          <textarea className="sched-input" rows={6} value={details} onChange={(e) => setDetails(e.target.value)} />
        </label>
      </div>
      <div className="sched-edit-actions">
        <button type="button" className="sched-save-btn" disabled={busy} onClick={submit}>
          Save
        </button>
        {release && (
          <button type="button" className="danger" onClick={onDelete}>
            Delete
          </button>
        )}
        <button type="button" className="secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
      {error && <p className="message error">{error}</p>}
    </div>
  );
}

export function ReleasesPage() {
  const { isAdmin } = useAuth();
  const releasesQuery = useMemo(() => query(collection(db, "releases"), orderBy("releaseDate", "desc")), []);
  const { docs: releases } = useCollection<Release>(releasesQuery);

  const [dialog, setDialog] = useState<{ open: boolean; release: Release | null }>({ open: false, release: null });

  const saveRelease = async (data: ReleaseFormData) => {
    if (dialog.release) {
      await updateDoc(doc(db, "releases", dialog.release.id), { ...data, updatedAt: serverTimestamp() });
    } else {
      await addDoc(collection(db, "releases"), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }
    setDialog({ open: false, release: null });
  };

  const deleteRelease = async (release: Release) => {
    if (!window.confirm("Delete this release note?")) return;
    try {
      await deleteDoc(doc(db, "releases", release.id));
      setDialog({ open: false, release: null });
    } catch (e: any) {
      window.alert(e?.message || "Delete failed.");
    }
  };

  return (
    <div className="scroll-parchment releases-parchment">
      <div className="scroll-parchment-inner">
        <div className="scroll-title-row">
          <h2 className="scroll-title">Release Notes</h2>
        </div>
        <hr className="scroll-divider" />

        <div className="releases-doc">
          {releases.length === 0 && <p className="schedule-empty">No release notes yet.</p>}
          {releases.map((entry, index) => {
            const details = Array.isArray(entry.details) ? entry.details : [];
            const isLatest = index === 0;
            return (
              <div className={cx("release-entry", isLatest && "release-latest")} key={entry.id}>
                <div className="release-header">
                  <div className="release-meta">
                    <span className="release-date">{formatReleaseDate(entry.releaseDate)}</span>
                    {entry.version && <span className="release-version">{entry.version}</span>}
                    {isLatest && <span className="release-latest-badge">Latest</span>}
                  </div>
                  {isAdmin && (
                    <div className="sched-row-actions">
                      <button type="button" className="sched-action-btn" title="Edit" onClick={() => setDialog({ open: true, release: entry })}>
                        &#9998;
                      </button>
                      <button type="button" className="sched-action-btn sched-delete-btn" title="Delete" onClick={() => void deleteRelease(entry)}>
                        &times;
                      </button>
                    </div>
                  )}
                </div>
                <h3 className="release-summary">{entry.summary || ""}</h3>
                {details.length > 0 && (
                  <ul className="release-details">
                    {details.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {isAdmin && (
          <div className="scroll-footer-actions">
            <button type="button" className="secondary" onClick={() => setDialog({ open: true, release: null })}>
              + Add Release
            </button>
          </div>
        )}
      </div>

      <Modal open={dialog.open} onClose={() => setDialog({ open: false, release: null })} className="sched-add-dialog">
        <ReleaseForm
          key={dialog.release?.id ?? "new-release"}
          release={dialog.release}
          onSubmit={saveRelease}
          onDelete={() => dialog.release && void deleteRelease(dialog.release)}
          onClose={() => setDialog({ open: false, release: null })}
        />
      </Modal>
    </div>
  );
}
