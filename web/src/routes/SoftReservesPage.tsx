import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  Timestamp,
  where,
  query,
  orderBy
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useCollection } from "../hooks/useCollection";
import { cx, formatMonthDayYear, normalizeSignupStatus, parseDateOnly, relativeTime } from "../lib/formatters";
import { hourLabel } from "../lib/timezone";
import { WOW_CLASS_COLORS } from "../constants/classes";
import { raidAccent } from "../constants/raids";
import {
  QUALITY_COLORS,
  buildTooltipMap,
  canClassUseItem,
  getItemSortScore,
  getItemType,
  getReserveItems,
  itemMatchesSearch,
  loadLootData,
  resolveRaidLoot,
  wowheadUrl,
  type HardReserve,
  type LootData,
  type LootItem,
  type RaidLoot,
  type ReserveItem,
  type SoftReserve
} from "../lib/loot";
import { Modal } from "../components/common/Modal";
import type { Raid } from "../types/firestore";

interface CharOption {
  id: string;
  characterName: string;
  wowClass: string;
  ownerUid: string;
  own: boolean;
}
interface Signup {
  id: string;
  raidId?: string;
  ownerUid?: string;
  status?: string;
  profileCharacterName?: string;
  characterName?: string;
}

function isRaidPast(raid: Raid): boolean {
  const d = parseDateOnly(raid.raidDate);
  if (!d) return false;
  const hour = Number.isInteger(raid.raidEnd as number)
    ? (raid.raidEnd as number)
    : Number.isInteger(raid.raidStart as number)
    ? (raid.raidStart as number)
    : 0;
  const cutoff = new Date(d);
  cutoff.setHours(hour, 0, 0, 0);
  return cutoff.getTime() + 2 * 3600_000 < Date.now();
}

function timeWindow(raid: Raid): string {
  const start = Number.isInteger(raid.raidStart as number) ? hourLabel(raid.raidStart as number) : "";
  const end = Number.isInteger(raid.raidEnd as number) ? hourLabel(raid.raidEnd as number) : "";
  return start ? `${start}${end ? " – " + end : ""} ST` : "";
}

function MySignupBadge({ raidId, signups }: { raidId: string; signups: Signup[] }) {
  const mine = signups.filter((s) => s.raidId === raidId);
  if (!mine.length) return null;
  const priority: Record<string, number> = { accept: 4, tentative: 3, requested: 2, withdrawn: 1, decline: 1, denied: 1 };
  const best = mine.reduce((top, s) =>
    (priority[normalizeSignupStatus(s.status)] || 0) > (priority[normalizeSignupStatus(top.status)] || 0) ? s : top, mine[0]);
  const names = mine
    .filter((s) => ["accept", "requested", "tentative"].includes(normalizeSignupStatus(s.status)))
    .map((s) => s.profileCharacterName || s.characterName)
    .filter(Boolean);
  const label = names.length ? ` (${names.join(", ")})` : "";
  const status = normalizeSignupStatus(best.status);
  if (status === "accept") return <span className="srt-mysignup srt-mysignup-accepted">✓ Accepted{label}</span>;
  if (status === "tentative") return <span className="srt-mysignup srt-mysignup-benched">🪑 Benched{label}</span>;
  if (status === "requested") return <span className="srt-mysignup srt-mysignup-pending">⏳ Pending{label}</span>;
  return null;
}

function BossMultiSelect({ bosses, selected, onChange }: { bosses: string[]; selected: Set<string>; onChange: (s: Set<string>) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);
  const allChecked = selected.size === 0;
  return (
    <div className="multi-select" ref={ref}>
      <button
        type="button"
        className="multi-select-toggle"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {allChecked ? "All Bosses" : selected.size === 1 ? [...selected][0] : `${selected.size} Bosses`}
      </button>
      {open && (
        <div className="multi-select-dropdown">
          <label className="multi-select-option multi-select-all">
            <input type="checkbox" checked={allChecked} onChange={() => onChange(new Set())} /> All Bosses
          </label>
          {bosses.map((b, i) => (
            <label className="multi-select-option" key={b}>
              <input
                type="checkbox"
                checked={selected.has(b)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(b);
                  else next.delete(b);
                  onChange(next);
                }}
              />{" "}
              {b} ({i + 1})
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

async function zlibBase64(str: string): Promise<string> {
  const bytes = new TextEncoder().encode(str);
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  void writer.write(bytes);
  void writer.close();
  const chunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  let binary = "";
  for (let i = 0; i < out.length; i++) binary += String.fromCharCode(out[i]);
  return btoa(binary);
}

export function SoftReservesPage() {
  const { uid, isAdmin } = useAuth();

  const [lootData, setLootData] = useState<LootData | null>(null);
  useEffect(() => {
    void loadLootData().then(setLootData);
  }, []);

  const raidsQuery = useMemo(() => query(collection(db, "raids"), orderBy("raidDate", "asc")), []);
  const { docs: raids } = useCollection<Raid>(raidsQuery);

  const charsQuery = useMemo(
    () => (uid ? query(collection(db, "characters"), where("ownerUid", "==", uid)) : null),
    [uid]
  );
  const { docs: ownChars } = useCollection<any>(charsQuery);

  const mySignupsQuery = useMemo(
    () => (uid ? query(collection(db, "signups"), where("ownerUid", "==", uid)) : null),
    [uid]
  );
  const { docs: mySignups } = useCollection<Signup>(mySignupsQuery);

  const [selectedRaidId, setSelectedRaidId] = useState("");
  const reservesQuery = useMemo(
    () => (selectedRaidId ? query(collection(db, "softreserves"), where("raidId", "==", selectedRaidId)) : null),
    [selectedRaidId]
  );
  const { docs: reserves } = useCollection<SoftReserve>(reservesQuery);
  const hrQuery = useMemo(
    () => (selectedRaidId ? query(collection(db, "hardreserves"), where("raidId", "==", selectedRaidId)) : null),
    [selectedRaidId]
  );
  const { docs: hardReserves } = useCollection<HardReserve>(hrQuery);
  const raidSignupsQuery = useMemo(
    () => (selectedRaidId ? query(collection(db, "signups"), where("raidId", "==", selectedRaidId)) : null),
    [selectedRaidId]
  );
  const { docs: raidSignups } = useCollection<Signup & { characterId?: string; wowClass?: string }>(raidSignupsQuery);
  const tooltipMap = useMemo(() => buildTooltipMap(lootData), [lootData]);

  const raid = raids.find((r) => r.id === selectedRaidId) || null;
  const raidLoot: RaidLoot | null = useMemo(() => resolveRaidLoot(lootData, raid?.raidName), [lootData, raid]);
  const maxReserves = (raid as any)?.softresMaxReserves ?? 2;
  const isLocked = !!raid?.softresLocked;

  // Per-dungeon source map for compound raids
  const sourceMap = useMemo(() => {
    const m = new Map<number, string>();
    if (raidLoot?.sources && raidLoot.sources.length > 1) {
      for (const boss of raidLoot.bosses) if (boss.sourceLoot) for (const it of boss.items) m.set(it.itemId, boss.sourceLoot);
    }
    return m;
  }, [raidLoot]);
  const perDungeonLimit =
    raidLoot?.sources && raidLoot.sources.length > 1 ? Math.floor(maxReserves / raidLoot.sources.length) : null;

  // ── Character options ──
  const charOptions: CharOption[] = useMemo(() => {
    const opts: CharOption[] = ownChars.map((c) => ({
      id: c.id,
      characterName: c.characterName || "",
      wowClass: c.wowClass || "",
      ownerUid: c.ownerUid || uid || "",
      own: true
    }));
    if (isAdmin) {
      const seen = new Set(opts.map((o) => o.id));
      for (const r of reserves) {
        if (r.characterId && !seen.has(r.characterId)) {
          seen.add(r.characterId);
          opts.push({
            id: r.characterId,
            characterName: r.characterName || "",
            wowClass: r.wowClass || "",
            ownerUid: r.ownerUid || "",
            own: false
          });
        }
      }
    }
    return opts;
  }, [ownChars, reserves, isAdmin, uid]);

  const [selectedCharId, setSelectedCharId] = useState("");
  useEffect(() => {
    if (!selectedCharId && charOptions.length) setSelectedCharId(charOptions[0].id);
  }, [charOptions, selectedCharId]);
  const selectedChar = charOptions.find((c) => c.id === selectedCharId) || null;

  // ── Filters ──
  const [bossFilter, setBossFilter] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState("");
  const [slotFilter, setSlotFilter] = useState("");
  const [search, setSearch] = useState("");
  // Reset filters + default-filter to planned bosses for Partial raids.
  useEffect(() => {
    setTypeFilter("");
    setSlotFilter("");
    setSearch("");
    if (raid?.runType === "Partial" && raid.plannedBosses?.length && raidLoot) {
      const planned = new Set(raid.plannedBosses.map((b) => b.toLowerCase()));
      const matched = new Set(
        raidLoot.bosses
          .map((b) => b.name)
          .filter((name) => [...planned].some((p) => name.toLowerCase() === p || name.toLowerCase().startsWith(p)))
      );
      setBossFilter(matched);
    } else {
      setBossFilter(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRaidId, raidLoot]);

  const [message, setMessage] = useState<{ text: string; error: boolean }>({ text: "", error: false });
  const setMsg = (text: string, error = false) => setMessage({ text, error });
  const [tooltip, setTooltip] = useState<{ item: LootItem; x: number; y: number } | null>(null);

  // ── Derived loot list ──
  const allItems: Array<LootItem & { bossName: string }> = useMemo(() => {
    if (!raidLoot) return [];
    return raidLoot.bosses.flatMap((b) => b.items.map((i) => ({ ...i, bossName: b.name })));
  }, [raidLoot]);
  const itemTypes = useMemo(() => Array.from(new Set(allItems.map(getItemType))).sort(), [allItems]);
  const itemSlots = useMemo(
    () => Array.from(new Set(allItems.map((i) => i.slot).filter(Boolean) as string[])).sort(),
    [allItems]
  );

  const myReserve = useMemo(
    () => reserves.find((r) => r.characterId === selectedCharId) || null,
    [reserves, selectedCharId]
  );
  const myItems = getReserveItems(myReserve);
  const myItemCounts = useMemo(() => {
    const m = new Map<number, number>();
    for (const it of myItems) m.set(Number(it.itemId), (m.get(Number(it.itemId)) || 0) + 1);
    return m;
  }, [myItems]);
  const reservedPerSource = useMemo(() => {
    const r: Record<string, number> = {};
    for (const it of myItems) {
      const src = sourceMap.get(Number(it.itemId));
      if (src) r[src] = (r[src] || 0) + 1;
    }
    return r;
  }, [myItems, sourceMap]);

  const canModifySelected = !!selectedChar && (isAdmin || (!isLocked && selectedChar.ownerUid === uid));

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = allItems.filter((item) => {
      if (bossFilter.size && !bossFilter.has(item.bossName)) return false;
      if (typeFilter && getItemType(item) !== typeFilter) return false;
      if (slotFilter && item.slot !== slotFilter) return false;
      if (term && !itemMatchesSearch(item, item.bossName, term)) return false;
      return true;
    });
    const wowClass = selectedChar?.wowClass || "";
    list = [...list].sort((a, b) => {
      const sa = getItemSortScore(a, wowClass);
      const sb = getItemSortScore(b, wowClass);
      if (sa !== sb) return sa - sb;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [allItems, bossFilter, typeFilter, slotFilter, search, selectedChar]);

  const hrByItem = useMemo(() => {
    const m = new Map<number, HardReserve>();
    for (const hr of hardReserves) m.set(Number(hr.itemId), hr);
    return m;
  }, [hardReserves]);

  const reserveCountByRaid = useMemo(() => {
    // total reserves per raid (for tile labels) — only have selected raid's reserves live,
    // so this is best-effort for the selected raid.
    const m = new Map<string, number>();
    for (const r of reserves) m.set(r.raidId, (m.get(r.raidId) || 0) + 1);
    return m;
  }, [reserves]);

  // ── Character Loot overview helpers ──
  const CLASS_ORDER = ["Warrior", "Paladin", "Hunter", "Rogue", "Priest", "Shaman", "Mage", "Warlock", "Druid"];
  const sortedReserves = useMemo(
    () =>
      [...reserves].sort((a, b) => {
        const ia = CLASS_ORDER.indexOf(a.wowClass || "");
        const ib = CLASS_ORDER.indexOf(b.wowClass || "");
        const oa = ia >= 0 ? ia : 99;
        const ob = ib >= 0 ? ib : 99;
        if (oa !== ob) return oa - ob;
        return (a.characterName || "").toLowerCase().localeCompare((b.characterName || "").toLowerCase());
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reserves]
  );
  const contention = useMemo(() => {
    const m = new Map<number, number>();
    for (const res of reserves) for (const it of getReserveItems(res)) m.set(Number(it.itemId), (m.get(Number(it.itemId)) || 0) + 1);
    return m;
  }, [reserves]);
  const reserveStatus = (res: SoftReserve): { cls: string; label: string; title: string } | null => {
    const sig = raidSignups.find((s) => (s as any).characterId === res.characterId || s.ownerUid === res.ownerUid);
    const status = sig ? normalizeSignupStatus(sig.status) : null;
    if (res.isGuest && !sig) return { cls: "sr-status-pug", label: "🔗 PUG", title: "Joined via a PUG invite link (not a guild member)." };
    if (!sig) return { cls: "sr-status-warning sr-no-signup", label: "⚠ No Signup", title: "Not signed up yet — reserves are still saved." };
    if (status === "accept") return { cls: "sr-status-accepted", label: "✓ Accepted", title: "Accepted into the raid roster." };
    if (status === "tentative") return { cls: "sr-status-warning sr-benched", label: "🪑 Benched", title: "Benched (tentative)." };
    if (status === "requested") return { cls: "sr-status-warning sr-pending", label: "⏳ Pending", title: "Signup requested but not yet accepted." };
    if (["decline", "withdrawn", "denied"].includes(status || ""))
      return { cls: "sr-status-warning sr-declined", label: "❌ Not Going", title: "Declined, withdrew, or was denied." };
    return null;
  };

  // ── Reserve actions ──
  const addReserve = async (item: LootItem & { bossName?: string }) => {
    if (!raid || !selectedChar) {
      setMsg("Select a character first.", true);
      return;
    }
    if (!isAdmin && isLocked) return setMsg("Reserves are locked for this raid.", true);
    if (!isAdmin && selectedChar.ownerUid !== uid) return setMsg("You can only modify your own reserves.", true);
    const itemEntry: ReserveItem = {
      itemId: item.itemId,
      name: item.name,
      icon: item.icon || "",
      quality: item.quality || "Epic",
      slot: item.slot || "",
      boss: item.bossName || ""
    };
    try {
      if (myReserve) {
        const current = getReserveItems(myReserve);
        if (current.length >= maxReserves) return setMsg(`Already at max reserves (${maxReserves}).`, true);
        const src = sourceMap.get(item.itemId);
        if (perDungeonLimit != null && src && (reservedPerSource[src] || 0) >= perDungeonLimit)
          return setMsg(`Already have ${perDungeonLimit} reserve(s) from ${src}.`, true);
        await setDoc(doc(db, "softreserves", myReserve.id), {
          raidId: myReserve.raidId,
          raidName: myReserve.raidName || "",
          raidDate: myReserve.raidDate || "",
          characterId: myReserve.characterId,
          characterName: myReserve.characterName || "",
          wowClass: myReserve.wowClass || "",
          ownerUid: myReserve.ownerUid || uid,
          items: [...current, itemEntry],
          createdAt: (myReserve as any).createdAt || serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, "softreserves"), {
          raidId: selectedRaidId,
          raidName: raid.raidName || "",
          raidDate: raid.raidDate || "",
          characterId: selectedChar.id,
          characterName: selectedChar.characterName || "",
          wowClass: selectedChar.wowClass || "",
          ownerUid: selectedChar.ownerUid || uid,
          items: [itemEntry],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      setMsg(`Reserved ${item.name}.`);
    } catch (err: any) {
      setMsg("Error saving reserve: " + err.message, true);
    }
  };

  const removeReserve = async (reserve: SoftReserve, itemId: number) => {
    const current = getReserveItems(reserve);
    let removed = false;
    const filtered = current.filter((i) => {
      if (!removed && Number(i.itemId) === itemId) {
        removed = true;
        return false;
      }
      return true;
    });
    try {
      if (filtered.length === 0) {
        await deleteDoc(doc(db, "softreserves", reserve.id));
      } else {
        await setDoc(doc(db, "softreserves", reserve.id), {
          raidId: reserve.raidId,
          raidName: reserve.raidName || "",
          raidDate: reserve.raidDate || "",
          characterId: reserve.characterId,
          characterName: reserve.characterName || "",
          wowClass: reserve.wowClass || "",
          ownerUid: reserve.ownerUid || uid,
          items: filtered,
          createdAt: (reserve as any).createdAt || serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      setMsg("Reserve removed.");
    } catch (err: any) {
      setMsg("Error: " + err.message, true);
    }
  };

  // ── Raid admin payloads ──
  const buildRaidPayload = (r: Raid, overrides: Record<string, any>) => {
    const payload: Record<string, any> = {
      phase: r.phase,
      raidName: r.raidName,
      raidDate: r.raidDate,
      runType: r.runType,
      raidStart: r.raidStart,
      raidEnd: r.raidEnd,
      raidSize: r.raidSize,
      createdByUid: uid,
      createdAt: (r as any).createdAt,
      updatedAt: serverTimestamp(),
      ...overrides
    };
    if (r.tankSlots != null) payload.tankSlots = r.tankSlots;
    if (r.healerSlots != null) payload.healerSlots = r.healerSlots;
    if (r.dpsSlots != null) payload.dpsSlots = r.dpsSlots;
    if (r.raidLeader != null) payload.raidLeader = r.raidLeader;
    if (!("softresLocked" in overrides) && r.softresLocked != null) payload.softresLocked = r.softresLocked;
    if (!("softresMaxReserves" in overrides) && (r as any).softresMaxReserves != null)
      payload.softresMaxReserves = (r as any).softresMaxReserves;
    if (r.signupsLocked != null) payload.signupsLocked = r.signupsLocked;
    if (r.plannedBosses != null && !("plannedBosses" in overrides)) payload.plannedBosses = r.plannedBosses;
    if ("announcement" in overrides) {
      if (overrides.announcement) payload.announcement = overrides.announcement;
      else delete payload.announcement;
    } else if ((r as any).announcement) payload.announcement = (r as any).announcement;
    return payload;
  };

  const toggleLock = async () => {
    if (!raid) return;
    try {
      await updateDoc(doc(db, "raids", raid.id), buildRaidPayload(raid, { softresLocked: !raid.softresLocked }));
    } catch (err: any) {
      setMsg("Error: " + err.message, true);
    }
  };
  const setMaxReserves = async (val: number) => {
    if (!raid || isNaN(val) || val < 1 || val > 10) return;
    try {
      await updateDoc(doc(db, "raids", raid.id), buildRaidPayload(raid, { softresMaxReserves: val }));
    } catch (err: any) {
      setMsg("Error: " + err.message, true);
    }
  };

  const copySR = async () => {
    if (!raid) return;
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      metadata: {
        id: raid.id,
        instance: null,
        instances: [(raid.raidName || "raid").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 12)],
        hidden: false,
        createdAt: now,
        updatedAt: now,
        raidStartsAt: null,
        lockedAt: raid.softresLocked ? now : null,
        discordUrl: "",
        note: ""
      },
      softreserves: reserves
        .filter((res) => getReserveItems(res).length)
        .map((res) => ({
          rollBonus: 0,
          plusOnes: 0,
          name: res.characterName || "",
          class: (res.wowClass || "").toLowerCase(),
          note: "",
          items: getReserveItems(res).map((it, idx) => ({ id: Number(it.itemId), note: "", order: idx }))
        })),
      hardreserves: hardReserves.map((hr) => ({ id: Number(hr.itemId), for: hr.characterName || "", note: hr.note || "" }))
    };
    if (!payload.softreserves.length && !payload.hardreserves.length) return setMsg("No reserves to copy.", true);
    try {
      await navigator.clipboard.writeText(await zlibBase64(JSON.stringify(payload)));
      setMsg("Copied Gargul import string!");
    } catch {
      setMsg("Unable to copy to clipboard.", true);
    }
  };

  const [pugLink, setPugLink] = useState("");
  const generatePug = async () => {
    if (!raid) return;
    const token = String(Math.floor(10000 + Math.random() * 90000));
    const d = parseDateOnly(raid.raidDate);
    if (!d) return setMsg("Cannot determine raid date for token.", true);
    const endHour = Number.isInteger(raid.raidEnd as number) ? (raid.raidEnd as number) : 23;
    const expiresAt = new Date(d);
    expiresAt.setHours(endHour + 2, 0, 0, 0);
    try {
      await setDoc(doc(db, "pugTokens", token), {
        raidId: raid.id,
        raidName: raid.raidName || "",
        raidDate: raid.raidDate || "",
        expiresAt: Timestamp.fromDate(expiresAt),
        createdBy: uid,
        createdAt: serverTimestamp()
      });
      setPugLink(`${location.origin}/softres-pug?t=${token}`);
    } catch (err: any) {
      setMsg("Error generating PUG link: " + err.message, true);
    }
  };

  const announcement = (raid as any)?.announcement || "";
  const [annOpen, setAnnOpen] = useState(false);
  const [annDraft, setAnnDraft] = useState("");
  const [annDismissed, setAnnDismissed] = useState(false);
  useEffect(() => setAnnDismissed(false), [selectedRaidId, announcement]);
  // Minimal update so we don't disturb other raid fields; deleteField() clears it.
  const saveAnnouncement = async (text: string) => {
    if (!raid) return;
    try {
      await updateDoc(doc(db, "raids", raid.id), { announcement: text ? text : deleteField(), updatedAt: serverTimestamp() });
      setAnnOpen(false);
    } catch (err: any) {
      setMsg("Error saving announcement: " + err.message, true);
    }
  };

  const [hrDialog, setHrDialog] = useState<{ open: boolean; item: LootItem | null }>({ open: false, item: null });
  const [hrChar, setHrChar] = useState("");
  const [hrNote, setHrNote] = useState("");
  const addHardReserve = async () => {
    if (!hrDialog.item || !raid || !hrChar.trim()) return;
    try {
      await addDoc(collection(db, "hardreserves"), {
        raidId: raid.id,
        itemId: hrDialog.item.itemId,
        itemName: hrDialog.item.name,
        characterName: hrChar.trim(),
        note: hrNote.trim(),
        ownerUid: uid,
        addedAt: serverTimestamp()
      });
      setHrDialog({ open: false, item: null });
      setHrChar("");
      setHrNote("");
    } catch (err: any) {
      setMsg("Error: " + err.message, true);
    }
  };

  // ── Tiles ──
  const upcoming = useMemo(
    () => raids.filter((r) => !isRaidPast(r)).sort((a, b) => (parseDateOnly(a.raidDate)?.getTime() || 0) - (parseDateOnly(b.raidDate)?.getTime() || 0)),
    [raids]
  );
  const past = useMemo(
    () => raids.filter((r) => isRaidPast(r)).sort((a, b) => (parseDateOnly(b.raidDate)?.getTime() || 0) - (parseDateOnly(a.raidDate)?.getTime() || 0)),
    [raids]
  );
  // Production pre-selects the nearest upcoming raid on load.
  useEffect(() => {
    if (!selectedRaidId && upcoming.length) setSelectedRaidId(upcoming[0].id);
  }, [upcoming, selectedRaidId]);

  const renderTile = (r: Raid) => {
    const rDate = parseDateOnly(r.raidDate);
    const dateLabel = rDate ? rDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "—";
    const resCount = r.id === selectedRaidId ? reserveCountByRaid.get(r.id) || 0 : null;
    const size = r.raidSize || "";
    const hasSig = mySignups.some(
      (s) => s.raidId === r.id && ["accept", "tentative", "requested"].includes(normalizeSignupStatus(s.status))
    );
    return (
      <button
        key={r.id}
        type="button"
        className={cx("softres-raid-tile", r.id === selectedRaidId && "is-selected", hasSig && "has-my-signup")}
        style={{ ["--tile-accent" as any]: raidAccent(r.raidName) }}
        onClick={() => setSelectedRaidId(r.id)}
      >
        <span className="srt-status srt-status-upcoming">Upcoming</span>
        <span className="srt-name">
          {r.raidName}
          {r.runType ? ` (${r.runType})` : ""}
          {r.softresLocked ? " 🔒" : ""}
        </span>
        <span className="srt-date">{dateLabel}</span>
        <span className="srt-time">
          {timeWindow(r)}
          {size ? ` · ${size}` : ""}
        </span>
        <span className="srt-reserves">{resCount === null ? "" : resCount > 0 ? `${resCount} reserves` : "No reserves"}</span>
        <MySignupBadge raidId={r.id} signups={mySignups} />
      </button>
    );
  };

  return (
    <>
      {announcement && !annDismissed && (
        <div className="softres-announcement">
          <div className="softres-announcement-text">{announcement}</div>
          {isAdmin && (
            <div className="softres-announcement-admin">
              <button type="button" className="secondary" onClick={() => { setAnnDraft(announcement); setAnnOpen(true); }}>
                Edit
              </button>
              <button type="button" className="secondary" onClick={() => { if (window.confirm("Clear the announcement?")) void saveAnnouncement(""); }}>
                Clear
              </button>
            </div>
          )}
          <button type="button" className="softres-announcement-dismiss-btn" title="Dismiss" onClick={() => setAnnDismissed(true)}>
            ✕
          </button>
        </div>
      )}

      <section className="card softres-section softres-picker-card">
        <div className="list-header">
          <h2>Soft Reserves</h2>
          <span className="badge">{raids.length}</span>
        </div>
        <div className="softres-raid-grid">
          {upcoming.map(renderTile)}
          {past.length > 0 && (
            <details className="srt-past-details" open={past.some((r) => r.id === selectedRaidId)}>
              <summary className="srt-past-summary">
                Completed Raids <span className="srt-past-count">({past.length})</span>
              </summary>
              <div className="srt-past-list">
                {past.map((r) => {
                  const rDate = parseDateOnly(r.raidDate);
                  const dateLabel = rDate ? rDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "—";
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className={cx("srt-past-row", r.id === selectedRaidId && "is-selected")}
                      style={{ ["--tile-accent" as any]: raidAccent(r.raidName) }}
                      onClick={() => setSelectedRaidId(r.id)}
                    >
                      <span className="srt-past-name">
                        {r.raidName}
                        {r.runType ? ` (${r.runType})` : ""}
                      </span>
                      <span className="srt-past-date">{dateLabel}</span>
                      <span className="srt-past-time">{timeWindow(r)}</span>
                    </button>
                  );
                })}
              </div>
            </details>
          )}
        </div>
      </section>

      {raid && (
        <section className="card softres-section softres-detail-card">
          <div className="softres-controls">
            <div className="softres-lock-controls">
              {isAdmin && (
                <label className="softres-max-reserves-label">
                  Max Reserves
                  <input
                    type="number"
                    min={1}
                    max={10}
                    defaultValue={(raid as any).softresMaxReserves ?? 2}
                    key={`${raid.id}-${(raid as any).softresMaxReserves ?? 2}`}
                    className="softres-max-reserves-input"
                    onBlur={(e) => void setMaxReserves(parseInt(e.target.value, 10))}
                  />
                </label>
              )}
              <span className={cx("softres-lock-badge", isLocked ? "softres-locked" : "softres-open")}>
                {isLocked
                  ? "🔒 Locked"
                  : isAdmin
                  ? "🔓 Open"
                  : `🔓 Open — ${maxReserves} reserve${maxReserves !== 1 ? "s" : ""} per character`}
              </span>
              {isAdmin && (
                <>
                  <button type="button" className="secondary" onClick={() => void toggleLock()}>
                    {isLocked ? "Unlock Reserves" : "Lock Reserves"}
                  </button>
                  <button type="button" className="secondary" onClick={() => void copySR()}>
                    Copy SR Results
                  </button>
                  <button type="button" className="secondary" onClick={() => void generatePug()}>
                    🔗 PUG Link
                  </button>
                  <button type="button" className="secondary" onClick={() => { setAnnDraft(announcement); setAnnOpen(true); }}>
                    📢 Announcement
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="softres-top-row">
            <div className="softres-character-bar">
              <h4 className="softres-char-heading">Character Selection</h4>
              <div className="softres-char-row">
                <label>
                  Reserve as
                  <select value={selectedCharId} onChange={(e) => setSelectedCharId(e.target.value)}>
                    {charOptions.length === 0 && <option value="">— Select character —</option>}
                    {charOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.characterName}
                        {c.wowClass ? ` (${c.wowClass})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="softres-char-reserves">
                  {myItems.length === 0 ? (
                    <span className="text-dim">No reserves yet — click <strong>+</strong> on items below</span>
                  ) : (
                    <>
                      <span className="softres-char-label">RESERVES:</span>
                      {myItems.map((it, i) => (
                        <span key={i} className="softres-char-reserve-item" style={{ color: QUALITY_COLORS[it.quality || ""] || "#ccc" }}>
                          • {it.name}
                          {canModifySelected && (
                            <button type="button" className="softres-reserve-btn softres-remove-btn" onClick={() => myReserve && void removeReserve(myReserve, Number(it.itemId))}>
                              ✕
                            </button>
                          )}
                        </span>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="hardres-section">
              <div className="list-header">
                <h3>Hard Reserves <span className="badge">{hardReserves.length}</span></h3>
                {isAdmin && <div className="hardres-admin-hint text-dim">Click <strong>HR</strong> on an item below to hard reserve it</div>}
              </div>
              {hardReserves.length > 0 && (
                <div className="table-wrap">
                  <table className="softres-table hardres-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>For</th>
                        <th>Note</th>
                        {isAdmin && <th></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {hardReserves.map((hr) => (
                        <tr key={hr.id}>
                          <td>{hr.itemName}</td>
                          <td>{hr.characterName}</td>
                          <td>{hr.note}</td>
                          {isAdmin && (
                            <td>
                              <button type="button" className="sched-action-btn sched-delete-btn" onClick={() => void deleteDoc(doc(db, "hardreserves", hr.id))}>
                                &times;
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Loot browser */}
          {!raidLoot ? (
            <p className="text-dim">No loot table found for this raid.</p>
          ) : (
            <div className="softres-loot-browser">
              <div className="list-header">
                <h3>Loot Table</h3>
              </div>
              <p className="softres-loot-disclaimer">Item stats sourced from Wowhead. Click ↗ to view full details.</p>
              <div className="softres-loot-filters">
                <label>
                  Boss
                  <BossMultiSelect bosses={raidLoot.bosses.map((b) => b.name)} selected={bossFilter} onChange={setBossFilter} />
                </label>
                <label>
                  Type
                  <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                    <option value="">All Types</option>
                    {itemTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Slot
                  <select value={slotFilter} onChange={(e) => setSlotFilter(e.target.value)}>
                    <option value="">All Slots</option>
                    {itemSlots.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Search
                  <input type="text" placeholder="Item name…" value={search} onChange={(e) => setSearch(e.target.value)} />
                </label>
              </div>

              <div className="table-wrap softres-loot-scroll">
                <table className="softres-table softres-loot-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Item</th>
                      <th>Type</th>
                      <th>Slot</th>
                      <th>Boss</th>
                      <th>Drop %</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-dim">
                          No items match filters.
                        </td>
                      </tr>
                    )}
                    {visibleItems.map((item) => {
                      const canUse = !selectedChar?.wowClass || canClassUseItem(selectedChar.wowClass, item);
                      const count = myItemCounts.get(Number(item.itemId)) || 0;
                      const reserved = count > 0;
                      const dropPct = item.dropChance != null ? `${(item.dropChance * 100).toFixed(1)}%` : "—";
                      const src = sourceMap.get(item.itemId);
                      const dungeonFull = perDungeonLimit != null && src != null && (reservedPerSource[src] || 0) >= perDungeonLimit;
                      const hr = hrByItem.get(Number(item.itemId));
                      return (
                        <tr
                          key={item.itemId}
                          className={cx("softres-loot-row", reserved && "softres-loot-reserved", !canUse && "softres-loot-unusable")}
                          onMouseEnter={(e) => item.wowheadTooltip && setTooltip({ item, x: e.clientX, y: e.clientY })}
                          onMouseMove={(e) => tooltip && setTooltip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))}
                          onMouseLeave={() => setTooltip(null)}
                        >
                          <td>
                            {item.icon && <img className="softres-item-icon" src={item.icon} alt="" loading="lazy" width={24} height={24} />}
                          </td>
                          <td style={{ color: canUse ? QUALITY_COLORS[item.quality || ""] || "#ccc" : "#666", fontWeight: 600 }}>
                            {item.name}{" "}
                            <a href={wowheadUrl(item.itemId)} className="wowhead-link" target="_blank" rel="noopener noreferrer" title="View on Wowhead">
                              ↗
                            </a>
                          </td>
                          <td>{getItemType(item)}</td>
                          <td>{item.slot}</td>
                          <td>{item.bossName}</td>
                          <td>{dropPct}</td>
                          <td className="softres-loot-actions">
                            {canModifySelected && canUse && (
                              <>
                                {reserved && (
                                  <button type="button" className="softres-reserve-btn softres-remove-btn" title="Remove one reserve" onClick={() => myReserve && void removeReserve(myReserve, Number(item.itemId))}>
                                    −
                                  </button>
                                )}
                                {count > 0 && <span className="softres-item-roll-count">×{count}</span>}
                                {myItems.length < maxReserves && !dungeonFull && (
                                  <button type="button" className="softres-reserve-btn softres-add-btn" title="Reserve this item" onClick={() => void addReserve(item)}>
                                    +
                                  </button>
                                )}
                              </>
                            )}
                            {hr ? (
                              <span className="hardres-badge" title={`Hard Reserved${hr.characterName ? " for " + hr.characterName : ""}`}>
                                HR{hr.characterName ? `: ${hr.characterName}` : ""}
                              </span>
                            ) : (
                              isAdmin && (
                                <button type="button" className="softres-reserve-btn hardres-btn" title="Hard reserve" onClick={() => setHrDialog({ open: true, item })}>
                                  HR
                                </button>
                              )
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Reserves overview */}
          <div className="softres-overview">
            <div className="softres-overview-header">
              <h3>Character Loot</h3>
              <span className="badge">{reserves.length}</span>
            </div>
            <div className="table-wrap">
              <table className="softres-table">
                <thead>
                  <tr>
                    <th>Character</th>
                    <th>Reserves</th>
                    <th>Updated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {reserves.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-dim">
                        No reserves yet for this raid.
                      </td>
                    </tr>
                  )}
                  {sortedReserves.map((res) => {
                    const items = getReserveItems(res);
                    const status = reserveStatus(res);
                    const isOwn = res.ownerUid === uid;
                    return (
                      <tr key={res.id}>
                        <td style={{ color: WOW_CLASS_COLORS[res.wowClass || ""] || "#fff", fontWeight: 600 }}>
                          {res.characterName}
                          {status && (
                            <span className={status.cls} title={status.title}>
                              {" "}
                              {status.label}
                            </span>
                          )}
                        </td>
                        <td>
                          {items.length === 0
                            ? "—"
                            : items.map((it, i) => {
                                const lootItem = tooltipMap.get(Number(it.itemId));
                                const drop = lootItem?.dropChance != null ? ` ${(lootItem.dropChance * 100).toFixed(1)}%` : "";
                                const count = contention.get(Number(it.itemId)) || 0;
                                return (
                                  <span key={i}>
                                    {i > 0 && <span className="softres-reserve-sep-table"> · </span>}
                                    <span
                                      className="softres-item-hover"
                                      style={{ color: QUALITY_COLORS[it.quality || ""] || "#ccc", fontWeight: 600 }}
                                      onMouseEnter={(e) => {
                                        if (lootItem?.wowheadTooltip) setTooltip({ item: lootItem, x: e.clientX, y: e.clientY });
                                      }}
                                      onMouseMove={(e) => tooltip && setTooltip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))}
                                      onMouseLeave={() => setTooltip(null)}
                                    >
                                      {it.name}
                                      {drop && <span className="softres-drop-pct">{drop}</span>}
                                      {count > 1 && (
                                        <span className="softres-contention-badge" title={`${count} characters reserved this`}>
                                          {" "}🎲 {count}
                                        </span>
                                      )}
                                      {isAdmin && (
                                        <button type="button" className="softres-item-remove-btn" title="Remove this item" onClick={() => void removeReserve(res, Number(it.itemId))}>
                                          ✕
                                        </button>
                                      )}
                                    </span>
                                  </span>
                                );
                              })}
                        </td>
                        <td className="text-dim">{relativeTime((res as any).updatedAt)}</td>
                        <td>
                          {(isAdmin || isOwn) && (
                            <button type="button" className="secondary softres-action-btn" onClick={() => setSelectedCharId(res.characterId)}>
                              Select
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              type="button"
                              className="secondary softres-action-btn softres-delete-btn"
                              title="Delete all reserves for this character"
                              onClick={() => {
                                if (window.confirm("Delete all reserves for this character?")) void deleteDoc(doc(db, "softreserves", res.id));
                              }}
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {message.text && <p className={cx("message", message.error && "error")}>{message.text}</p>}
          </div>
        </section>
      )}

      {tooltip?.item.wowheadTooltip && (
        <div
          className="wow-tooltip"
          style={{
            left: Math.min(tooltip.x + 16, window.innerWidth - 360),
            top: Math.min(tooltip.y + 16, window.innerHeight - 260)
          }}
          dangerouslySetInnerHTML={{
            __html: `<div class="wow-tt-wowhead-body">${tooltip.item.wowheadTooltip}</div><div class="wow-tt-line wow-tt-wowhead"><a href="${wowheadUrl(tooltip.item.itemId)}" target="_blank" rel="noopener noreferrer">View on Wowhead ↗</a></div>`
          }}
        />
      )}

      <Modal open={hrDialog.open} onClose={() => setHrDialog({ open: false, item: null })} className="sched-add-dialog">
        <div className="sched-add-dialog-content">
          <h3 className="sched-add-dialog-title">Hard Reserve</h3>
          <p className="hardres-dialog-item-name">{hrDialog.item?.name}</p>
          <label className="sched-edit-label">
            Character
            <input className="sched-input" type="text" placeholder="Character name…" value={hrChar} onChange={(e) => setHrChar(e.target.value)} />
          </label>
          <label className="sched-edit-label">
            Note
            <input className="sched-input" type="text" placeholder="e.g. Tank BIS" value={hrNote} onChange={(e) => setHrNote(e.target.value)} />
          </label>
          <div className="sched-edit-actions">
            <button type="button" className="sched-save-btn" onClick={() => void addHardReserve()}>
              Add
            </button>
            <button type="button" className="secondary" onClick={() => setHrDialog({ open: false, item: null })}>
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={annOpen} onClose={() => setAnnOpen(false)} className="sched-add-dialog">
        <div className="sched-add-dialog-content">
          <h3 className="sched-add-dialog-title">Raid Announcement</h3>
          <textarea className="sched-input" rows={3} value={annDraft} onChange={(e) => setAnnDraft(e.target.value)} placeholder="Shown as a banner to everyone on this raid…" />
          <div className="sched-edit-actions">
            <button type="button" className="sched-save-btn" onClick={() => void saveAnnouncement(annDraft.trim())}>
              Save
            </button>
            <button type="button" className="secondary" onClick={() => setAnnOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!pugLink} onClose={() => setPugLink("")} className="sched-add-dialog">
        <div className="sched-add-dialog-content">
          <h3 className="sched-add-dialog-title">🔗 PUG Guest Link</h3>
          <p className="text-dim" style={{ margin: 0 }}>
            Share this with a PUG — no account needed. It expires ~2 hours after the raid ends.
          </p>
          <input
            className="sched-input"
            type="text"
            readOnly
            value={pugLink}
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="sched-edit-actions">
            <button
              type="button"
              className="sched-save-btn"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(pugLink);
                  setMsg("PUG link copied!");
                } catch {
                  /* ignore */
                }
              }}
            >
              Copy Link
            </button>
            <button type="button" className="secondary" onClick={() => setPugLink("")}>
              Close
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
