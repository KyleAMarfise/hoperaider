import { useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useCollection } from "../hooks/useCollection";
import { useDoc } from "../hooks/useDoc";
import { Modal } from "../components/common/Modal";
import { cx, normalizeUrl } from "../lib/formatters";
import {
  CONTENT_PHASES,
  LINK_FALLBACK_LABEL,
  LINK_ICONS,
  LINK_KINDS,
  parseEntryContent,
  sectionPhase,
  sectionVisibleInPhase,
  type FightPhase,
  type StrategyBlock
} from "../lib/strategy";
import type { LinkKind, StrategyConfig, StrategyDoc, StrategyLink } from "../types/firestore";
import { raidAccent } from "../constants/raids";

const DEFAULT_TITLE = "HOPE GUILD RAID STRATEGY";

// Distinct per-boss accent colours so that, when a phase lists several bosses, each
// card reads as its own block (easy to scan/audit). Rotates by position in the phase.
const BOSS_PALETTE = ["#e0a83c", "#3fb0a8", "#9b6dd6", "#d36fb0", "#5ec47a", "#5a9bd4", "#d1655d", "#d9b44a"];

// Sections removed from the page (matched by title, case-insensitive).
const HIDDEN_SECTION_TITLES = new Set(["roster", "reference"]);

interface SectionFormData {
  title: string;
  emoji: string;
  layout: "grid" | "list";
  phase: string;
}
interface EntryFormData {
  emoji: string;
  title: string;
  tag: string;
  notes: string[];
  links: StrategyLink[];
}

// ── Read-only render pieces ────────────────────────────────────────────────────
function Block({ block }: { block: StrategyBlock }) {
  return (
    <div className={`strategy-block strategy-tone-${block.tone}`}>
      <div className="strategy-block-label">{block.label}</div>
      {block.items.length > 0 && (
        <ul className="strategy-block-items">
          {block.items.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FightPhases({ phases }: { phases: FightPhase[] }) {
  const useTabs = phases.length > 1 || (phases[0] && !!phases[0].name);
  const [active, setActive] = useState(0);
  const idx = Math.min(active, phases.length - 1);
  const p = phases[idx];
  return (
    <div className="strategy-phases">
      {useTabs && (
        <div className="strategy-fp-tabs">
          {phases.map((ph, i) => (
            <button
              key={i}
              type="button"
              className={cx("strategy-fp-tab", i === idx && "is-active")}
              onClick={() => setActive(i)}
            >
              {ph.name || `Phase ${i + 1}`}
            </button>
          ))}
        </div>
      )}
      <div className="strategy-fp-panel" key={idx}>
        {p.loose.length > 0 && (
          <ul className="strategy-card-notes">
            {p.loose.map((x, j) => (
              <li key={j}>{x}</li>
            ))}
          </ul>
        )}
        {p.blocks.length > 0 && (
          <div className="strategy-blocks">
            {p.blocks.map((b, j) => (
              <Block key={j} block={b} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CardLinks({ links }: { links?: StrategyLink[] }) {
  const list = (links ?? [])
    .map((l) => ({ ...l, href: normalizeUrl(l.url) }))
    .filter((l) => l.href);
  if (!list.length) return null;
  return (
    <div className="strategy-links">
      {list.map((l, i) => {
        const kind: LinkKind = (LINK_KINDS as readonly string[]).includes(l.kind) ? l.kind : "link";
        const label = l.label && l.label.trim() ? l.label.trim() : LINK_FALLBACK_LABEL[kind];
        return (
          <a
            key={i}
            className={`strategy-link-btn strategy-link-${kind}`}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="strategy-link-icon">{LINK_ICONS[kind]}</span>
            {label}
          </a>
        );
      })}
    </div>
  );
}

function StrategyCard({
  entry,
  index,
  isAdmin,
  onEdit,
  onDelete
}: {
  entry: StrategyDoc;
  index: number;
  isAdmin: boolean;
  onEdit: (e: StrategyDoc) => void;
  onDelete: (e: StrategyDoc) => void;
}) {
  const { intro, phases } = useMemo(() => parseEntryContent(entry.notes), [entry.notes]);
  const accent = BOSS_PALETTE[index % BOSS_PALETTE.length];
  return (
    <div
      className={cx("strategy-card", phases.length > 0 && "strategy-card-phased")}
      style={{ ["--card-accent" as any]: accent }}
    >
      <div className="strategy-card-head">
        <span className="strategy-card-num" aria-hidden="true">{index + 1}</span>
        <h4 className="strategy-card-title">{entry.title || ""}</h4>
        {entry.tag && <span className="strategy-tag">{entry.tag}</span>}
        {isAdmin && (
          <div className="strategy-card-actions">
            <button type="button" className="sched-action-btn" title="Edit card" onClick={() => onEdit(entry)}>
              &#9998;
            </button>
            <button
              type="button"
              className="sched-action-btn sched-delete-btn"
              title="Delete card"
              onClick={() => onDelete(entry)}
            >
              &times;
            </button>
          </div>
        )}
      </div>
      {intro.length > 0 && (
        <ul className="strategy-card-notes">
          {intro.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      {phases.length > 0 && <FightPhases phases={phases} />}
      <CardLinks links={entry.links} />
    </div>
  );
}

function SectionView({
  section,
  entries,
  isAdmin,
  onAddEntry,
  onEditSection,
  onDeleteSection,
  onEditEntry,
  onDeleteEntry
}: {
  section: StrategyDoc;
  entries: StrategyDoc[];
  isAdmin: boolean;
  onAddEntry: (sectionId: string) => void;
  onEditSection: (s: StrategyDoc) => void;
  onDeleteSection: (s: StrategyDoc) => void;
  onEditEntry: (e: StrategyDoc) => void;
  onDeleteEntry: (e: StrategyDoc) => void;
}) {
  const orphan = section.id === "__unsectioned";
  const layoutClass = section.layout === "list" ? "strategy-list" : "strategy-grid";
  return (
    <section className="strategy-section" id={`section-${section.id}`} style={{ ["--section-accent" as any]: raidAccent(section.title) }}>
      <div className="strategy-section-head">
        <h3 className="strategy-section-title">{section.title}</h3>
        {isAdmin && !orphan && (
          <div className="strategy-section-actions">
            <button type="button" className="secondary" onClick={() => onAddEntry(section.id)}>
              + Card
            </button>
            <button type="button" className="sched-action-btn" title="Edit section" onClick={() => onEditSection(section)}>
              &#9998;
            </button>
            <button
              type="button"
              className="sched-action-btn sched-delete-btn"
              title="Delete section"
              onClick={() => onDeleteSection(section)}
            >
              &times;
            </button>
          </div>
        )}
      </div>
      <div className={layoutClass}>
        {entries.length > 0 ? (
          entries.map((e, i) => (
            <StrategyCard key={e.id} entry={e} index={i} isAdmin={isAdmin} onEdit={onEditEntry} onDelete={onDeleteEntry} />
          ))
        ) : (
          <p className="strategy-empty-section">
            No cards yet.{isAdmin && !orphan ? ' Use "+ Card" to add one.' : ""}
          </p>
        )}
      </div>
    </section>
  );
}

// ── Editing forms ──────────────────────────────────────────────────────────────
function SectionForm({
  section,
  defaultPhase,
  onSubmit,
  onDelete,
  onClose
}: {
  section: StrategyDoc | null;
  defaultPhase: string;
  onSubmit: (data: SectionFormData) => Promise<void>;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(section?.title ?? "");
  const [emoji, setEmoji] = useState(section?.emoji ?? "");
  const [layout, setLayout] = useState<"grid" | "list">(section?.layout ?? "grid");
  const [phase, setPhase] = useState(section ? sectionPhase(section) : defaultPhase);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ title: title.trim(), emoji: emoji.trim(), layout, phase });
    } catch (e: any) {
      setError(e?.message || "Save failed.");
      setBusy(false);
    }
  };

  return (
    <div className="sched-add-dialog-content">
      <h3 className="sched-add-dialog-title">{section ? "Edit Section" : "Add Section"}</h3>
      <div className="sched-edit-fields">
        <div className="sched-edit-row">
          <label className="sched-edit-label">
            Title
            <input className="sched-input" type="text" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="sched-edit-label">
            Layout
            <select className="sched-input" value={layout} onChange={(e) => setLayout(e.target.value as "grid" | "list")}>
              <option value="grid">Grid (cards side-by-side)</option>
              <option value="list">List (full-width cards)</option>
            </select>
          </label>
          <label className="sched-edit-label">
            Content Phase
            <select className="sched-input" value={phase} onChange={(e) => setPhase(e.target.value)}>
              <option value="1">Phase 1 (Kara · Gruul · Mag)</option>
              <option value="2">Phase 2 (SSC · Tempest Keep)</option>
              <option value="all">Both / General</option>
            </select>
          </label>
        </div>
      </div>
      <div className="sched-edit-actions">
        <button type="button" className="sched-save-btn" disabled={busy} onClick={submit}>
          Save
        </button>
        {section && (
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

const TONE_LEGEND = ["tank", "heal", "interrupt", "kill", "position", "threat", "utility", "neutral"];
const TONE_LABEL: Record<string, string> = {
  tank: "Tanks",
  heal: "Healers",
  interrupt: "Interrupts / Kicks",
  kill: "Kill Order",
  position: "Positioning",
  threat: "Misdirect",
  utility: "Curse / Utility",
  neutral: "Anything else"
};

function EntryForm({
  entry,
  onSubmit,
  onDelete,
  onClose
}: {
  entry: StrategyDoc | null;
  onSubmit: (data: EntryFormData) => Promise<void>;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [emoji, setEmoji] = useState(entry?.emoji ?? "");
  const [title, setTitle] = useState(entry?.title ?? "");
  const [tag, setTag] = useState(entry?.tag ?? "");
  const [notes, setNotes] = useState((entry?.notes ?? []).join("\n"));
  const [links, setLinks] = useState<StrategyLink[]>(entry?.links ? entry.links.map((l) => ({ ...l })) : []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const setLink = (i: number, patch: Partial<StrategyLink>) =>
    setLinks((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLink = () => setLinks((ls) => [...ls, { kind: "link", label: "", url: "" }]);
  const removeLink = (i: number) => setLinks((ls) => ls.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    const cleanNotes = notes.split("\n").map((s) => s.trim()).filter(Boolean);
    const cleanLinks = links
      .map((l) => ({ kind: l.kind, label: (l.label ?? "").trim(), url: l.url.trim() }))
      .filter((l) => l.url);
    setBusy(true);
    try {
      await onSubmit({ emoji: emoji.trim(), title: title.trim(), tag: tag.trim(), notes: cleanNotes, links: cleanLinks });
    } catch (e: any) {
      setError(e?.message || "Save failed.");
      setBusy(false);
    }
  };

  return (
    <div className="sched-add-dialog-content">
      <h3 className="sched-add-dialog-title">{entry ? "Edit Card" : "Add Card"}</h3>
      <div className="sched-edit-fields">
        <label className="sched-edit-label">
          Title
          <input className="sched-input" type="text" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="sched-edit-label">
          Tag <small className="help-text">(optional short label, e.g. "Council", "2 phases")</small>
          <input className="sched-input" type="text" maxLength={40} value={tag} onChange={(e) => setTag(e.target.value)} />
        </label>
        <label className="sched-edit-label">
          Notes <small className="help-text">(plain lines = bullets · # = fight phase · ## = colored group)</small>
          <textarea
            className="sched-input strategy-notes-input"
            rows={9}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={"Pull notes as plain bullets\n# Phase 1 — Platforms\n## Tanks\nTANK 1 → starts on Al'ar\n## Healers\n1 healer per tank"}
          />
        </label>
        <fieldset className="strategy-links-fieldset">
          <legend>
            Links <small className="help-text">(videos &amp; documents)</small>
          </legend>
          <div>
            {links.map((l, i) => (
              <div className="strategy-link-row" key={i}>
                <select
                  className="sched-input strategy-link-kind"
                  value={l.kind}
                  onChange={(e) => setLink(i, { kind: e.target.value as LinkKind })}
                >
                  {LINK_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k.charAt(0).toUpperCase() + k.slice(1)}
                    </option>
                  ))}
                </select>
                <input
                  className="sched-input strategy-link-label"
                  type="text"
                  maxLength={60}
                  placeholder="Label (optional)"
                  value={l.label ?? ""}
                  onChange={(e) => setLink(i, { label: e.target.value })}
                />
                <input
                  className="sched-input strategy-link-url"
                  type="text"
                  placeholder="https://…"
                  value={l.url}
                  onChange={(e) => setLink(i, { url: e.target.value })}
                />
                <button type="button" className="sched-action-btn strategy-link-remove" title="Remove link" onClick={() => removeLink(i)}>
                  &times;
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="secondary strategy-link-add-btn" onClick={addLink}>
            + Add link
          </button>
        </fieldset>
        <details className="strategy-format-help">
          <summary>Formatting &amp; colors</summary>
          <div className="strategy-format-help-body">
            <p>
              <code># Phase name</code> → adds a <strong>fight-phase tab</strong>.
            </p>
            <p>
              <code>## Group label</code> → a <strong>colored block</strong>; plain lines under it are its bullets.
            </p>
            <div className="strategy-format-legend">
              {TONE_LEGEND.map((t) => (
                <span key={t} className={`strategy-tone-${t}`}>
                  {TONE_LABEL[t]}
                </span>
              ))}
            </div>
          </div>
        </details>
      </div>
      <div className="sched-edit-actions">
        <button type="button" className="sched-save-btn" disabled={busy} onClick={submit}>
          Save
        </button>
        {entry && (
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

// ── Page ───────────────────────────────────────────────────────────────────────
export function StrategyPage() {
  // The Strategy page is editable & manageable by any signed-in member (not just
  // admins). The page already sits behind the sign-in gate, so any viewer is a
  // member. `isAdmin` here therefore gates "can edit" — kept as the name so the
  // existing edit controls/guards below don't need to change.
  const { user } = useAuth();
  const isAdmin = !!user;

  const strategyQuery = useMemo(() => query(collection(db, "strategy"), orderBy("order", "asc")), []);
  const pageConfigRef = useMemo(() => doc(db, "strategy", "pageConfig"), []);
  const { docs } = useCollection<StrategyDoc>(strategyQuery);
  const { data: config } = useDoc<StrategyConfig>(pageConfigRef);

  // Sections we no longer show on the strategy page (and their cards).
  const hiddenSectionIds = useMemo(
    () =>
      new Set(
        docs
          .filter((d) => d.kind === "section" && HIDDEN_SECTION_TITLES.has((d.title || "").trim().toLowerCase()))
          .map((d) => d.id)
      ),
    [docs]
  );
  const sections = useMemo(
    () =>
      docs
        .filter((d) => d.kind === "section" && !hiddenSectionIds.has(d.id))
        .sort((a, b) => (a.order || 0) - (b.order || 0)),
    [docs, hiddenSectionIds]
  );
  const entries = useMemo(
    () => docs.filter((d) => d.kind === "entry" && !hiddenSectionIds.has(d.sectionId || "")),
    [docs, hiddenSectionIds]
  );

  const title = config?.title || DEFAULT_TITLE;
  const intro = config?.intro || "";

  const [activeContentPhase, setActiveContentPhase] = useState<string>(() => {
    try {
      const s = localStorage.getItem("strategyContentPhase");
      if (s === "1" || s === "2") return s;
    } catch {
      /* ignore */
    }
    return "2";
  });
  const selectPhase = (p: string) => {
    setActiveContentPhase(p);
    try {
      localStorage.setItem("strategyContentPhase", p);
    } catch {
      /* ignore */
    }
  };

  const visibleSections = sections.filter((s) => sectionVisibleInPhase(s, activeContentPhase));
  const sectionIds = useMemo(() => new Set(sections.map((s) => s.id)), [sections]);
  const orphans = entries
    .filter((e) => !sectionIds.has(e.sectionId || ""))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  const entriesFor = (sid: string) =>
    entries.filter((e) => e.sectionId === sid).sort((a, b) => (a.order || 0) - (b.order || 0));

  const nextSectionOrder = () => sections.reduce((m, s) => Math.max(m, s.order || 0), 0) + 1000;
  const nextEntryOrder = (sid: string) => entriesFor(sid).reduce((m, e) => Math.max(m, e.order || 0), 0) + 10;

  // Modal + inline-edit state
  const [sectionDialog, setSectionDialog] = useState<{ open: boolean; section: StrategyDoc | null }>({
    open: false,
    section: null
  });
  const [entryDialog, setEntryDialog] = useState<{ open: boolean; entry: StrategyDoc | null; sectionId: string }>({
    open: false,
    entry: null,
    sectionId: ""
  });
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [introDraft, setIntroDraft] = useState("");

  const openTitleEdit = () => {
    setTitleDraft(title);
    setIntroDraft(intro);
    setTitleEditing(true);
  };
  const saveTitle = async () => {
    if (!isAdmin) return;
    if (!titleDraft.trim()) return;
    await setDoc(
      pageConfigRef,
      { title: titleDraft.trim(), intro: introDraft.trim(), updatedAt: serverTimestamp() },
      { merge: true }
    );
    setTitleEditing(false);
  };

  const saveSection = async (data: SectionFormData) => {
    if (!isAdmin) return;
    if (sectionDialog.section) {
      await updateDoc(doc(db, "strategy", sectionDialog.section.id), { ...data, updatedAt: serverTimestamp() });
    } else {
      await addDoc(collection(db, "strategy"), {
        kind: "section",
        ...data,
        order: nextSectionOrder(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
    setSectionDialog({ open: false, section: null });
  };

  const deleteSection = async (section: StrategyDoc) => {
    if (!isAdmin) return;
    const children = entries.filter((e) => e.sectionId === section.id);
    const childMsg = children.length ? ` and its ${children.length} card${children.length === 1 ? "" : "s"}` : "";
    if (!window.confirm(`Delete "${section.title}"${childMsg}? This cannot be undone.`)) return;
    try {
      await Promise.all([
        ...children.map((c) => deleteDoc(doc(db, "strategy", c.id))),
        deleteDoc(doc(db, "strategy", section.id))
      ]);
      setSectionDialog({ open: false, section: null });
    } catch (e: any) {
      window.alert(e?.message || "Delete failed.");
    }
  };

  const saveEntry = async (data: EntryFormData) => {
    if (!isAdmin) return;
    if (entryDialog.entry) {
      await updateDoc(doc(db, "strategy", entryDialog.entry.id), {
        kind: "entry",
        sectionId: entryDialog.entry.sectionId,
        ...data,
        updatedAt: serverTimestamp()
      });
    } else {
      await addDoc(collection(db, "strategy"), {
        kind: "entry",
        sectionId: entryDialog.sectionId,
        ...data,
        order: nextEntryOrder(entryDialog.sectionId),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
    setEntryDialog({ open: false, entry: null, sectionId: "" });
  };

  const deleteEntry = async (entry: StrategyDoc) => {
    if (!isAdmin) return;
    if (!window.confirm("Delete this card?")) return;
    try {
      await deleteDoc(doc(db, "strategy", entry.id));
    } catch (e: any) {
      window.alert(e?.message || "Delete failed.");
    }
  };

  const orphanSection: StrategyDoc = { id: "__unsectioned", title: "Unsectioned", emoji: "", layout: "grid" };
  const hasAny = sections.length > 0 || entries.length > 0;
  const nothingInPhase = visibleSections.length === 0 && orphans.length === 0;

  return (
    <div className="scroll-parchment strategy-parchment">
      <div className="scroll-parchment-inner">
        <div className="strategy-wip-banner" role="status">
          <span className="strategy-wip-icon" aria-hidden="true">🚧</span>
          <div className="strategy-wip-text">
            <strong>Work in progress — do not reference yet.</strong>
            <span>
              This page is still being built and tested. It is <em>not</em> official and may be incomplete or wrong. Don&apos;t
              use it to plan raids until it goes live — we&apos;ll remove this banner and announce when it&apos;s ready.
            </span>
          </div>
        </div>

        <div className="scroll-title-row">
          <h2 className="scroll-title">{title}</h2>
          {isAdmin && !titleEditing && (
            <button type="button" className="sched-action-btn" title="Edit title & intro" onClick={openTitleEdit}>
              &#9998;
            </button>
          )}
        </div>

        {!titleEditing && intro && <p className="strategy-intro">{intro}</p>}

        {titleEditing && (
          <div className="scroll-title-edit strategy-title-edit">
            <input
              className="sched-input scroll-title-input"
              type="text"
              maxLength={120}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              placeholder="Page title"
            />
            <textarea
              className="sched-input strategy-intro-input"
              rows={2}
              maxLength={300}
              value={introDraft}
              onChange={(e) => setIntroDraft(e.target.value)}
              placeholder="Short intro (optional)"
            />
            <div className="sched-edit-actions">
              <button type="button" className="sched-save-btn" onClick={() => void saveTitle()}>
                Save
              </button>
              <button type="button" className="secondary" onClick={() => setTitleEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="strategy-phase-tabs" role="tablist" aria-label="Content phase">
          {CONTENT_PHASES.map((p) => {
            const selected = p.id === activeContentPhase;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={cx("strategy-phase-tab", selected && "is-active")}
                onClick={() => selectPhase(p.id)}
              >
                <span className="strategy-phase-tab-check" aria-hidden="true">
                  {selected ? "✔" : ""}
                </span>
                <span className="strategy-phase-tab-text">
                  <span className="strategy-phase-tab-label">{p.label}</span>
                  <span className="strategy-phase-tab-hint">{p.hint}</span>
                </span>
                {selected && <span className="strategy-phase-tab-pill">Viewing</span>}
              </button>
            );
          })}
        </div>

        {visibleSections.length > 0 && (
          <nav className="strategy-tabs" aria-label="Strategy sections">
            {visibleSections.map((s) => (
              <a
                className="strategy-tab"
                href={`#section-${s.id}`}
                key={s.id}
                style={{ ["--section-accent" as any]: raidAccent(s.title) }}
              >
                <span className="strategy-tab-dot" aria-hidden="true" />
                {s.title}
              </a>
            ))}
          </nav>
        )}

        <hr className="scroll-divider" />

        <div className="strategy-doc">
          {!hasAny && (
            <p className="schedule-empty">
              No strategy sections yet.{isAdmin ? ' Click "+ Add Section" to start.' : ""}
            </p>
          )}
          {hasAny && nothingInPhase && (
            <p className="schedule-empty">
              Nothing in {activeContentPhase === "1" ? "Phase 1" : "Phase 2"} yet.
              {isAdmin ? " Add a section, or set an existing section's phase." : ""}
            </p>
          )}
          {visibleSections.map((section) => (
            <SectionView
              key={section.id}
              section={section}
              entries={entriesFor(section.id)}
              isAdmin={isAdmin}
              onAddEntry={(sectionId) => setEntryDialog({ open: true, entry: null, sectionId })}
              onEditSection={(s) => setSectionDialog({ open: true, section: s })}
              onDeleteSection={(s) => void deleteSection(s)}
              onEditEntry={(e) => setEntryDialog({ open: true, entry: e, sectionId: e.sectionId || "" })}
              onDeleteEntry={(e) => void deleteEntry(e)}
            />
          ))}
          {orphans.length > 0 && (
            <SectionView
              section={orphanSection}
              entries={orphans}
              isAdmin={isAdmin}
              onAddEntry={() => {}}
              onEditSection={() => {}}
              onDeleteSection={() => {}}
              onEditEntry={(e) => setEntryDialog({ open: true, entry: e, sectionId: e.sectionId || "" })}
              onDeleteEntry={(e) => void deleteEntry(e)}
            />
          )}
        </div>

        {isAdmin && (
          <div className="scroll-footer-actions">
            <button type="button" className="secondary" onClick={() => setSectionDialog({ open: true, section: null })}>
              + Add Section
            </button>
          </div>
        )}
      </div>

      <Modal
        open={sectionDialog.open}
        onClose={() => setSectionDialog({ open: false, section: null })}
        className="sched-add-dialog strategy-edit-dialog"
      >
        <SectionForm
          key={sectionDialog.section?.id ?? "new-section"}
          section={sectionDialog.section}
          defaultPhase={activeContentPhase}
          onSubmit={saveSection}
          onDelete={() => sectionDialog.section && void deleteSection(sectionDialog.section)}
          onClose={() => setSectionDialog({ open: false, section: null })}
        />
      </Modal>

      <Modal
        open={entryDialog.open}
        onClose={() => setEntryDialog({ open: false, entry: null, sectionId: "" })}
        className="sched-add-dialog strategy-entry-dialog strategy-edit-dialog"
      >
        <EntryForm
          key={entryDialog.entry?.id ?? `new-entry-${entryDialog.sectionId}`}
          entry={entryDialog.entry}
          onSubmit={saveEntry}
          onDelete={() => entryDialog.entry && void deleteEntry(entryDialog.entry)}
          onClose={() => setEntryDialog({ open: false, entry: null, sectionId: "" })}
        />
      </Modal>
    </div>
  );
}
