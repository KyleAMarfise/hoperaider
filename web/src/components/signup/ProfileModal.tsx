import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { Modal } from "../common/Modal";
import { WOW_CLASSES, WOW_CLASS_COLORS, ROLE_ICONS, getRolesForClass, getSpecsForSelection } from "../../constants/classes";
import { getProfileLabel, type CharacterProfile } from "../../lib/admin";
import { buildArmoryUrl } from "../../lib/armory";

interface ClassSetup {
  wowClass: string;
  mainRole: string;
  mainSpecialization: string;
  offRole: string;
  offSpecialization: string;
}
interface AltForm extends ClassSetup {
  characterName: string;
}

const EMPTY_SETUP: ClassSetup = { wowClass: "", mainRole: "", mainSpecialization: "", offRole: "", offSpecialization: "" };

function friendlyId(name: string, existingIds: Set<string>): string {
  const base =
    String(name || "")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "character";
  let candidate = base;
  let suffix = 2;
  while (existingIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

// Role + spec selects whose options cascade off the chosen class. Single-role classes
// (Hunter/Mage/Rogue/Warlock = DPS) lock the role select.
function RoleSpecPair({
  legend,
  wowClass,
  role,
  spec,
  onRole,
  onSpec
}: {
  legend: string;
  wowClass: string;
  role: string;
  spec: string;
  onRole: (v: string) => void;
  onSpec: (v: string) => void;
}) {
  const roles = getRolesForClass(wowClass);
  const lockedRole = roles.length === 1 ? roles[0] : "";
  const specs = getSpecsForSelection(wowClass, role);
  return (
    <fieldset className="spec-role-group">
      <legend>{legend}</legend>
      <label>
        {legend.startsWith("Main") ? "Main Role" : "Off Role"}
        <select value={role} disabled={!!lockedRole} className={lockedRole ? "role-locked" : ""} onChange={(e) => onRole(e.target.value)} required>
          {lockedRole ? (
            <option value={lockedRole}>
              {ROLE_ICONS[lockedRole]} {lockedRole}
            </option>
          ) : (
            <>
              <option value="">Select role</option>
              {(roles.length ? roles : ["Tank", "Healer", "DPS"]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_ICONS[r]} {r}
                </option>
              ))}
            </>
          )}
        </select>
      </label>
      <label>
        {legend.startsWith("Main") ? "Main Specialization (MS)" : "Off Specialization (OS)"}
        <select value={spec} onChange={(e) => onSpec(e.target.value)} required>
          <option value="">{specs.length ? "Select specialization" : "Select class and role first"}</option>
          {specs.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  );
}

// Class + main/off role-spec block, shared by the main character and each alt.
function ClassSetupFields({ value, onChange }: { value: ClassSetup; onChange: (next: ClassSetup) => void }) {
  // When class changes, lock single-role classes and clear now-invalid specs.
  const changeClass = (wowClass: string) => {
    const roles = getRolesForClass(wowClass);
    const locked = roles.length === 1 ? roles[0] : "";
    const next: ClassSetup = { ...value, wowClass };
    if (locked) {
      next.mainRole = locked;
      next.offRole = locked;
    } else {
      if (!roles.includes(value.mainRole)) next.mainRole = "";
      if (!roles.includes(value.offRole)) next.offRole = "";
    }
    if (!getSpecsForSelection(wowClass, next.mainRole).includes(value.mainSpecialization)) next.mainSpecialization = "";
    if (!getSpecsForSelection(wowClass, next.offRole).includes(value.offSpecialization)) next.offSpecialization = "";
    onChange(next);
  };
  const changeMainRole = (mainRole: string) => {
    const next = { ...value, mainRole };
    if (!getSpecsForSelection(value.wowClass, mainRole).includes(value.mainSpecialization)) next.mainSpecialization = "";
    onChange(next);
  };
  const changeOffRole = (offRole: string) => {
    const next = { ...value, offRole };
    if (!getSpecsForSelection(value.wowClass, offRole).includes(value.offSpecialization)) next.offSpecialization = "";
    onChange(next);
  };

  return (
    <>
      <label>
        Class
        <select value={value.wowClass} onChange={(e) => changeClass(e.target.value)} required style={value.wowClass ? { color: WOW_CLASS_COLORS[value.wowClass], fontWeight: 600 } : undefined}>
          <option value="">Select class</option>
          {WOW_CLASSES.map((c) => (
            <option key={c} value={c} style={{ color: WOW_CLASS_COLORS[c], fontWeight: 600 }}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <div className="spec-pair">
        <RoleSpecPair legend="Main Setup" wowClass={value.wowClass} role={value.mainRole} spec={value.mainSpecialization} onRole={changeMainRole} onSpec={(v) => onChange({ ...value, mainSpecialization: v })} />
        <RoleSpecPair legend="Off Setup" wowClass={value.wowClass} role={value.offRole} spec={value.offSpecialization} onRole={changeOffRole} onSpec={(v) => onChange({ ...value, offSpecialization: v })} />
      </div>
    </>
  );
}

export function ProfileModal({
  open,
  profile,
  allCharacters,
  onClose,
  onSaved
}: {
  open: boolean;
  profile: CharacterProfile | null;
  allCharacters: CharacterProfile[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { uid, user } = useAuth();
  const isEdit = !!profile;
  const [profileName, setProfileName] = useState("");
  const [characterName, setCharacterName] = useState("");
  const [setup, setSetup] = useState<ClassSetup>(EMPTY_SETUP);
  const [alts, setAlts] = useState<AltForm[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Re-seed the form whenever the modal opens (or which profile it targets changes).
  useEffect(() => {
    if (!open) return;
    setError("");
    setProfileName(profile?.profileName || "");
    setCharacterName(profile?.characterName || "");
    setSetup({
      wowClass: profile?.wowClass || "",
      mainRole: profile?.mainRole || profile?.role || "",
      mainSpecialization: profile?.mainSpecialization || profile?.specialization || "",
      offRole: profile?.offRole || "",
      offSpecialization: profile?.offSpecialization || ""
    });
    setAlts(
      (profile?.altCharacters || []).map((a) => ({
        characterName: a.characterName || "",
        wowClass: a.wowClass || "",
        mainRole: a.mainRole || "",
        mainSpecialization: a.mainSpecialization || "",
        offRole: a.offRole || "",
        offSpecialization: a.offSpecialization || ""
      }))
    );
  }, [open, profile]);

  const updateAlt = (i: number, next: Partial<AltForm>) => setAlts((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...next } : a)));
  const removeAlt = (i: number) => setAlts((prev) => prev.filter((_, idx) => idx !== i));
  const addAlt = () => setAlts((prev) => [...prev, { characterName: "", ...EMPTY_SETUP }]);

  const save = async () => {
    if (!uid) {
      setError("Cannot save character profile yet.");
      return;
    }
    if (!profileName.trim() || !characterName.trim() || !setup.wowClass || !setup.mainRole || !setup.mainSpecialization || !setup.offRole || !setup.offSpecialization) {
      setError("Fill in Discord name, character name, class, and both Main and Off role/spec.");
      return;
    }
    // Firestore rules enforce these lengths — check here for a friendly message.
    if (profileName.trim().length < 3) {
      setError("Discord name must be at least 3 characters.");
      return;
    }
    if (characterName.trim().length < 2) {
      setError("Character name must be at least 2 characters.");
      return;
    }
    // Only keep fully-completed alts (matches old normalizeAltCharacters).
    const cleanAlts = alts
      .map((a) => ({
        characterName: a.characterName.trim(),
        wowClass: a.wowClass.trim(),
        mainRole: a.mainRole.trim(),
        offRole: a.offRole.trim(),
        mainSpecialization: a.mainSpecialization.trim(),
        offSpecialization: a.offSpecialization.trim()
      }))
      .filter((a) => a.characterName && a.wowClass && a.mainRole && a.offRole && a.mainSpecialization && a.offSpecialization);

    const payload = {
      profileName: profileName.trim(),
      characterName: characterName.trim(),
      wowClass: setup.wowClass,
      // `role`, `armoryUrl` and `progressionUrl` are required by the Firestore
      // validCharacterData() rule (the old site set them too).
      role: setup.mainRole,
      mainRole: setup.mainRole,
      mainSpecialization: setup.mainSpecialization,
      offRole: setup.offRole,
      offSpecialization: setup.offSpecialization,
      armoryUrl: buildArmoryUrl(characterName.trim()),
      progressionUrl: "",
      altCharacters: cleanAlts
    };

    setBusy(true);
    try {
      let savedId = profile?.id || "";
      if (savedId) {
        await updateDoc(doc(db, "characters", savedId), { ...payload, ownerUid: uid, ownerEmail: user?.email || "", updatedAt: serverTimestamp() });
      } else {
        savedId = friendlyId(payload.profileName || payload.characterName, new Set(allCharacters.map((c) => c.id)));
        await setDoc(doc(db, "characters", savedId), { ...payload, ownerUid: uid, ownerEmail: user?.email || "", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      }
      onSaved(savedId);
      onClose();
    } catch (e: any) {
      setError(e?.message || "Save failed.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!profile) return;
    if (!window.confirm(`Delete profile ${getProfileLabel(profile)}? This also deletes related raid signups.`)) return;
    setBusy(true);
    try {
      const snap = await getDocs(query(collection(db, "signups"), where("characterId", "==", profile.id)));
      await Promise.allSettled(snap.docs.map((d) => deleteDoc(d.ref)));
      await deleteDoc(doc(db, "characters", profile.id));
      onClose();
    } catch (e: any) {
      setError(e?.message || "Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} className="profile-modal profile-modal-large">
      <div className="profile-modal-content">
        <div className="profile-modal-header">
          <h3>{isEdit ? "Edit Profile" : "Create Profile"}</h3>
        </div>
        <div className="primary-fields">
          <label>
            Discord Name
            <input type="text" maxLength={60} value={profileName} onChange={(e) => setProfileName(e.target.value)} required />
            <small className="help-text">Use your Discord display name to group your characters during signup.</small>
          </label>
          <label>
            Character Name
            <input type="text" maxLength={24} value={characterName} onChange={(e) => setCharacterName(e.target.value)} required />
            <small className="help-text">Must exactly match your in-game main raiding character name.</small>
          </label>
          <ClassSetupFields value={setup} onChange={setSetup} />
        </div>

        <section className="alt-characters-section">
          <div className="alt-characters-header">
            <h4>Alt Characters</h4>
            <button type="button" className="secondary" onClick={addAlt}>
              + Add Alt
            </button>
          </div>
          <div className="alt-characters-list">
            {alts.map((alt, i) => (
              <details className="alt-character-card" key={i} open>
                <summary>Alt Character {i + 1}</summary>
                <label>
                  Character Name
                  <input type="text" maxLength={24} value={alt.characterName} onChange={(e) => updateAlt(i, { characterName: e.target.value })} />
                </label>
                <ClassSetupFields value={alt} onChange={(next) => updateAlt(i, next)} />
                <button type="button" className="danger alt-remove-btn" onClick={() => removeAlt(i)}>
                  Remove Alt
                </button>
              </details>
            ))}
          </div>
          <small className="help-text">Add as many alts as needed. Each alt requires MS and OS setup.</small>
        </section>

        {error && <p className="message error">{error}</p>}

        <div className="actions">
          <button type="button" onClick={() => void save()} disabled={busy}>
            Save Profile
          </button>
          {isEdit && (
            <button type="button" className="danger" onClick={() => void remove()} disabled={busy}>
              Delete Profile
            </button>
          )}
          <button type="button" className="secondary" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
