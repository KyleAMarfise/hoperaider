import { useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useCollection } from "../hooks/useCollection";
import { Modal } from "../components/common/Modal";
import { cx, normalizeUrl } from "../lib/formatters";

type ResourceType = "addon" | "macro" | "weakaura" | "other";

interface Resource {
  id: string;
  type?: ResourceType;
  title?: string;
  url?: string;
  code?: string;
  description?: string;
  postedByName?: string;
  postedByUid?: string;
  createdAt?: any;
}

interface ResourceFormData {
  type: ResourceType;
  title: string;
  url: string;
  code: string;
  description: string;
}

const TYPE_META: Record<ResourceType, { label: string; plural: string; icon: string }> = {
  addon: { label: "Addon", plural: "Addons", icon: "🧩" },
  macro: { label: "Macro", plural: "Macros", icon: "⌨️" },
  weakaura: { label: "WeakAura", plural: "WeakAuras", icon: "✨" },
  other: { label: "Other", plural: "Other", icon: "🔧" }
};
const TYPE_ORDER: ResourceType[] = ["addon", "macro", "weakaura", "other"];

function posterName(user: { displayName?: string | null; email?: string | null } | null): string {
  if (user?.displayName) return user.displayName;
  if (user?.email) return user.email.split("@")[0];
  return "Unknown";
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — user can still select the text */
    }
  };
  return (
    <div className="resource-code-wrap">
      <button type="button" className="resource-code-copy" onClick={() => void copy()}>
        {copied ? "Copied!" : "Copy"}
      </button>
      <pre className="resource-code">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function ResourceForm({
  resource,
  onSubmit,
  onDelete,
  onClose
}: {
  resource: Resource | null;
  onSubmit: (data: ResourceFormData) => Promise<void>;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<ResourceType>(resource?.type ?? "addon");
  const [title, setTitle] = useState(resource?.title ?? "");
  const [url, setUrl] = useState(resource?.url ?? "");
  const [code, setCode] = useState(resource?.code ?? "");
  const [description, setDescription] = useState(resource?.description ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!url.trim() && !code.trim() && !description.trim()) {
      setError("Add at least a link, a code/import string, or a description.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ type, title: title.trim(), url: url.trim(), code: code.trim(), description: description.trim() });
    } catch (e: any) {
      setError(e?.message || "Save failed.");
      setBusy(false);
    }
  };

  return (
    <div className="sched-add-dialog-content">
      <h3 className="sched-add-dialog-title">{resource ? "Edit Resource" : "Add Resource"}</h3>
      <div className="sched-edit-fields">
        <div className="sched-edit-row">
          <label className="sched-edit-label resource-type-field">
            Type
            <select className="sched-input" value={type} onChange={(e) => setType(e.target.value as ResourceType)}>
              {TYPE_ORDER.map((t) => (
                <option key={t} value={t}>
                  {TYPE_META[t].icon} {TYPE_META[t].label}
                </option>
              ))}
            </select>
          </label>
          <label className="sched-edit-label">
            Title
            <input className="sched-input" type="text" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
        </div>
        <label className="sched-edit-label">
          Link <small className="help-text">(optional — CurseForge, GitHub, Wago.io, etc.)</small>
          <input className="sched-input" type="text" maxLength={400} placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <label className="sched-edit-label">
          Code / Import string <small className="help-text">(optional — paste a macro or WeakAura import string)</small>
          <textarea className="sched-input resource-textarea" rows={8} value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        <label className="sched-edit-label">
          Description <small className="help-text">(what it does / why it's useful)</small>
          <textarea className="sched-input resource-textarea" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
      </div>
      <div className="sched-edit-actions">
        <button type="button" className="sched-save-btn" disabled={busy} onClick={() => void submit()}>
          Save
        </button>
        {resource && (
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

function ResourceCard({
  resource,
  postedBy,
  canManage,
  onEdit,
  onDelete
}: {
  resource: Resource;
  postedBy: string;
  canManage: boolean;
  onEdit: (r: Resource) => void;
  onDelete: (r: Resource) => void;
}) {
  const href = normalizeUrl(resource.url);
  const meta = TYPE_META[resource.type ?? "other"];
  return (
    <div className="resource-card">
      <div className="resource-card-head">
        <span className={cx("resource-type-badge", `resource-type-${resource.type ?? "other"}`)}>
          {meta.icon} {meta.label}
        </span>
        {href ? (
          <a className="resource-title" href={href} target="_blank" rel="noopener noreferrer">
            {resource.title || "Untitled"} ↗
          </a>
        ) : (
          <span className="resource-title resource-title-plain">{resource.title || "Untitled"}</span>
        )}
        {canManage && (
          <div className="sched-row-actions resource-actions">
            <button type="button" className="sched-action-btn" title="Edit" onClick={() => onEdit(resource)}>
              &#9998;
            </button>
            <button type="button" className="sched-action-btn sched-delete-btn" title="Delete" onClick={() => onDelete(resource)}>
              &times;
            </button>
          </div>
        )}
      </div>
      {resource.description && <p className="resource-desc">{resource.description}</p>}
      {resource.code && <CodeBlock code={resource.code} />}
      <div className="resource-foot">Posted by {postedBy}</div>
    </div>
  );
}

export function ResourcesPage() {
  const { isAdmin, uid, user } = useAuth();
  const resourcesQuery = useMemo(() => query(collection(db, "resources"), orderBy("createdAt", "desc")), []);
  const { docs: resources } = useCollection<Resource>(resourcesQuery);
  // Load profiles so "Posted by" can show each poster's main character name.
  const charactersQuery = useMemo(() => collection(db, "characters"), []);
  const { docs: characters } = useCollection<{ id: string; ownerUid?: string; characterName?: string }>(charactersQuery);

  const [dialog, setDialog] = useState<{ open: boolean; resource: Resource | null }>({ open: false, resource: null });

  // uid → main character name (first profile per owner).
  const mainNameByUid = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of characters) {
      const o = String(c.ownerUid || "");
      if (o && c.characterName && !m.has(o)) m.set(o, c.characterName);
    }
    return m;
  }, [characters]);

  const posterFor = (r: Resource) => mainNameByUid.get(String(r.postedByUid || "")) || r.postedByName || "Unknown";
  const canManage = (r: Resource) => isAdmin || (!!uid && r.postedByUid === uid);

  const grouped = useMemo(() => {
    const map: Record<ResourceType, Resource[]> = { addon: [], macro: [], weakaura: [], other: [] };
    for (const r of resources) map[(r.type as ResourceType) in map ? (r.type as ResourceType) : "other"].push(r);
    return map;
  }, [resources]);

  const saveResource = async (data: ResourceFormData) => {
    if (dialog.resource) {
      // Editing — keep the original poster credit.
      await updateDoc(doc(db, "resources", dialog.resource.id), { ...data, updatedAt: serverTimestamp() });
    } else {
      await addDoc(collection(db, "resources"), {
        ...data,
        postedByUid: uid ?? "",
        postedByName: (uid && mainNameByUid.get(uid)) || posterName(user),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
    setDialog({ open: false, resource: null });
  };

  const deleteResource = async (resource: Resource) => {
    if (!window.confirm("Delete this resource?")) return;
    try {
      await deleteDoc(doc(db, "resources", resource.id));
      setDialog({ open: false, resource: null });
    } catch (e: any) {
      window.alert(e?.message || "Delete failed.");
    }
  };

  return (
    <div className="scroll-parchment resources-parchment">
      <div className="scroll-parchment-inner">
        <div className="scroll-title-row">
          <h2 className="scroll-title">Tips</h2>
        </div>
        <p className="resources-intro">Handy addons, macros, and WeakAuras shared by the team.</p>
        <hr className="scroll-divider" />

        <div className="resources-doc">
          {resources.length === 0 && <p className="schedule-empty">No resources posted yet.</p>}
          {TYPE_ORDER.map((t) => {
            const items = grouped[t];
            if (!items.length) return null;
            return (
              <section className="resource-section" key={t}>
                <h3 className="resource-section-title">
                  {TYPE_META[t].icon} {TYPE_META[t].plural} <span className="resource-section-count">({items.length})</span>
                </h3>
                <div className="resource-grid">
                  {items.map((r) => (
                    <ResourceCard
                      key={r.id}
                      resource={r}
                      postedBy={posterFor(r)}
                      canManage={canManage(r)}
                      onEdit={(res) => setDialog({ open: true, resource: res })}
                      onDelete={(res) => void deleteResource(res)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {!!uid && (
          <div className="scroll-footer-actions">
            <button type="button" className="secondary" onClick={() => setDialog({ open: true, resource: null })}>
              + Add Tip
            </button>
          </div>
        )}
      </div>

      <Modal open={dialog.open} onClose={() => setDialog({ open: false, resource: null })} className="sched-add-dialog resource-edit-dialog">
        <ResourceForm
          key={dialog.resource?.id ?? "new-resource"}
          resource={dialog.resource}
          onSubmit={saveResource}
          onDelete={() => dialog.resource && void deleteResource(dialog.resource)}
          onClose={() => setDialog({ open: false, resource: null })}
        />
      </Modal>
    </div>
  );
}
