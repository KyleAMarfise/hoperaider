import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  where,
  query
} from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import { ThemeProvider } from "../context/ThemeContext";
import { useCollection } from "../hooks/useCollection";
import { cx, formatMonthDayYear } from "../lib/formatters";
import { WOW_CLASSES, WOW_CLASS_COLORS } from "../constants/classes";
import {
  QUALITY_COLORS,
  buildTooltipMap,
  canClassUseItem,
  resolveRaidLoot,
  getItemSortScore,
  getItemType,
  getReserveItems,
  loadLootData,
  wowheadUrl,
  type HardReserve,
  type LootData,
  type LootItem,
  type RaidLoot,
  type ReserveItem,
  type SoftReserve
} from "../lib/loot";
import type { Raid } from "../types/firestore";

type Status = "loading" | "error" | "name" | "ready";

export function SoftReservesPugPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<{ title: string; message: string }>({ title: "", message: "" });
  const [authUid, setAuthUid] = useState("");
  const [token, setToken] = useState("");
  const [guestRaid, setGuestRaid] = useState<Raid | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestClass, setGuestClass] = useState("");

  const [lootData, setLootData] = useState<LootData | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean }>({ text: "", error: false });
  const [tooltip, setTooltip] = useState<{ item: LootItem; x: number; y: number } | null>(null);

  // ── Init: token → anon auth → validate → raid → existing guest doc ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = new URLSearchParams(location.search).get("t");
      if (!t) {
        setError({ title: "Invalid Link", message: "No guest token found in URL." });
        setStatus("error");
        return;
      }
      setToken(t);
      try {
        const cred = await signInAnonymously(auth);
        if (cancelled) return;
        const uid = cred.user.uid;
        setAuthUid(uid);

        const tokenSnap = await getDoc(doc(db, "pugTokens", t));
        if (!tokenSnap.exists()) {
          setError({ title: "Invalid Link", message: "This PUG link does not exist." });
          setStatus("error");
          return;
        }
        const tokenData = tokenSnap.data();
        const expiresAt = (tokenData.expiresAt as any)?.toDate?.();
        if (expiresAt && expiresAt < new Date()) {
          setError({ title: "Link Expired", message: "This PUG link has expired. Ask your raid leader for a new one." });
          setStatus("error");
          return;
        }

        const raidSnap = await getDoc(doc(db, "raids", tokenData.raidId));
        if (!raidSnap.exists()) {
          setError({ title: "Raid Not Found", message: "The raid for this link no longer exists." });
          setStatus("error");
          return;
        }
        const raid = { id: raidSnap.id, ...(raidSnap.data() as any) } as Raid;
        setGuestRaid(raid);

        const guestSnap = await getDoc(doc(db, "guestCharacters", uid));
        if (guestSnap.exists() && (guestSnap.data() as any).raidId === tokenData.raidId) {
          const g = guestSnap.data() as any;
          setGuestName(g.characterName || "");
          setGuestClass(g.wowClass || "");
          setStatus("ready");
        } else {
          setStatus("name");
        }
      } catch (err: any) {
        setError({ title: "Error", message: err?.message || "Could not start guest session." });
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status === "ready") void loadLootData().then(setLootData);
  }, [status]);
  const tooltipReady = !!lootData;
  const raidLoot: RaidLoot | null = useMemo(
    () => (tooltipReady ? resolveRaidLoot(lootData, guestRaid?.raidName) : null),
    [lootData, guestRaid, tooltipReady]
  );
  useMemo(() => buildTooltipMap(lootData), [lootData]); // warm the map (icons in items already)

  // ── Reserves subscription (only once we know the raid) ──
  const guestRaidId = guestRaid?.id || "";
  const reservesQuery = useMemo(
    () => (guestRaidId ? query(collection(db, "softreserves"), where("raidId", "==", guestRaidId)) : null),
    [guestRaidId]
  );
  const { docs: reserves } = useCollection<SoftReserve>(reservesQuery);
  const hrQuery = useMemo(
    () => (guestRaidId ? query(collection(db, "hardreserves"), where("raidId", "==", guestRaidId)) : null),
    [guestRaidId]
  );
  const { docs: hardReserves } = useCollection<HardReserve>(hrQuery);

  const maxReserves = (guestRaid as any)?.softresMaxReserves ?? 2;
  const isLocked = !!guestRaid?.softresLocked;
  const myReserve = reserves.find((r) => r.ownerUid === authUid) || null;
  const myItems = getReserveItems(myReserve);
  const myItemIds = new Set(myItems.map((i) => Number(i.itemId)));

  const setMsg = (text: string, error = false) => setMessage({ text, error });

  // ── Name entry ──
  const [nameInput, setNameInput] = useState("");
  const [classInput, setClassInput] = useState("");
  const [nameError, setNameError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submitName = async () => {
    const name = nameInput.trim();
    if (name.length < 2 || name.length > 24) {
      setNameError("Name must be 2–24 characters.");
      return;
    }
    if (!classInput) {
      setNameError("Please select a class.");
      return;
    }
    setSubmitting(true);
    setNameError("");
    try {
      // Reject names registered as guild members.
      const charsSnap = await getDocs(collection(db, "characters"));
      const nameLower = name.toLowerCase();
      let isGuildMember = false;
      for (const d of charsSnap.docs) {
        const data = d.data() as any;
        if ((data.characterName || "").toLowerCase() === nameLower) {
          isGuildMember = true;
          break;
        }
        for (const alt of Array.isArray(data.altCharacters) ? data.altCharacters : []) {
          if ((alt?.characterName || "").toLowerCase() === nameLower) {
            isGuildMember = true;
            break;
          }
        }
        if (isGuildMember) break;
      }
      if (isGuildMember) {
        setNameError("That name is a registered guild member. Please sign in through the main page.");
        setSubmitting(false);
        return;
      }
      const tokenSnap = await getDoc(doc(db, "pugTokens", token));
      const expiresAt = (tokenSnap.data() as any)?.expiresAt;
      await setDoc(doc(db, "guestCharacters", authUid), {
        characterName: name,
        wowClass: classInput,
        raidId: guestRaidId,
        raidName: guestRaid?.raidName || "",
        pugToken: token,
        expiresAt,
        createdAt: serverTimestamp()
      });
      setGuestName(name);
      setGuestClass(classInput);
      setStatus("ready");
    } catch (err: any) {
      setNameError("Error: " + (err?.message || "could not continue."));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Reserve actions ──
  const addReserve = async (item: LootItem) => {
    if (isLocked) {
      setMsg("Reserves are locked for this raid.", true);
      return;
    }
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
        if (current.length >= maxReserves) {
          setMsg(`Already at max reserves (${maxReserves}). Remove one first.`, true);
          return;
        }
        await setDoc(doc(db, "softreserves", myReserve.id), {
          raidId: myReserve.raidId,
          raidName: myReserve.raidName || "",
          raidDate: myReserve.raidDate || "",
          characterId: myReserve.characterId,
          characterName: myReserve.characterName || "",
          wowClass: myReserve.wowClass || "",
          ownerUid: authUid,
          isGuest: true,
          items: [...current, itemEntry],
          createdAt: (myReserve as any).createdAt || serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, "softreserves"), {
          raidId: guestRaidId,
          raidName: guestRaid?.raidName || "",
          raidDate: guestRaid?.raidDate || "",
          characterId: authUid,
          characterName: guestName,
          wowClass: guestClass,
          ownerUid: authUid,
          isGuest: true,
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

  const removeReserve = async (itemId: number) => {
    if (!myReserve) return;
    const current = getReserveItems(myReserve);
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
        await deleteDoc(doc(db, "softreserves", myReserve.id));
      } else {
        await setDoc(doc(db, "softreserves", myReserve.id), {
          raidId: myReserve.raidId,
          raidName: myReserve.raidName || "",
          raidDate: myReserve.raidDate || "",
          characterId: myReserve.characterId,
          characterName: myReserve.characterName || "",
          wowClass: myReserve.wowClass || "",
          ownerUid: authUid,
          isGuest: true,
          items: filtered,
          createdAt: (myReserve as any).createdAt || serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      setMsg("Reserve removed.");
    } catch (err: any) {
      setMsg("Error: " + err.message, true);
    }
  };

  // ── Loot filters ──
  const [bossFilter, setBossFilter] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const allItems: LootItem[] = useMemo(
    () => (raidLoot ? raidLoot.bosses.flatMap((b) => b.items.map((i) => ({ ...i, bossName: b.name }))) : []),
    [raidLoot]
  );
  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = allItems.filter((item) => {
      if (bossFilter.size && !bossFilter.has(item.bossName || "")) return false;
      if (term && !item.name.toLowerCase().includes(term)) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      const sa = getItemSortScore(a, guestClass);
      const sb = getItemSortScore(b, guestClass);
      if (sa !== sb) return sa - sb;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [allItems, bossFilter, search, guestClass]);

  const reserversByItem = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const r of reserves) for (const it of getReserveItems(r)) {
      const arr = m.get(Number(it.itemId)) || [];
      arr.push(r.characterName || "?");
      m.set(Number(it.itemId), arr);
    }
    return m;
  }, [reserves]);

  // ── Render ──
  if (status === "loading") {
    return (
      <ThemeProvider>
        <div className="auth-gate">
          <div className="auth-gate-card">
            <p className="auth-gate-message">Loading guest session…</p>
          </div>
        </div>
      </ThemeProvider>
    );
  }
  if (status === "error") {
    return (
      <ThemeProvider>
        <div className="auth-gate">
          <div className="auth-gate-card">
            <h1>{error.title}</h1>
            <p className="auth-gate-message error">{error.message}</p>
          </div>
        </div>
      </ThemeProvider>
    );
  }
  if (status === "name") {
    return (
      <ThemeProvider>
        <div className="auth-gate">
          <div className="auth-gate-card">
            <h1>Guest Soft Reserve</h1>
            <p className="auth-gate-message">
              {guestRaid?.raidName} — {formatMonthDayYear(guestRaid?.raidDate)}
            </p>
            <input
              className="auth-input"
              type="text"
              placeholder="Character name"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
            />
            <select className="auth-input" value={classInput} onChange={(e) => setClassInput(e.target.value)}>
              <option value="">Select class</option>
              {WOW_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button type="button" className="auth-btn auth-btn-email" disabled={submitting} onClick={() => void submitName()}>
              {submitting ? "Checking…" : "Continue"}
            </button>
            {nameError && <p className="auth-gate-message error">{nameError}</p>}
          </div>
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <main className="container">
        <section className="card softres-section">
          <div className="list-header">
            <h2>Soft Reserves (Guest)</h2>
            <span className="badge" style={{ color: WOW_CLASS_COLORS[guestClass] || "" }}>
              {guestName} — {guestClass}
            </span>
          </div>
          <p className="text-dim">
            {guestRaid?.raidName} — {formatMonthDayYear(guestRaid?.raidDate)} · reserve up to <strong>{maxReserves}</strong> item
            {maxReserves === 1 ? "" : "s"}.{isLocked ? " 🔒 Locked." : ""}
          </p>

          <div className="softres-character-bar">
            <div className="softres-char-reserves">
              {myItems.length === 0 ? (
                <span className="text-dim">
                  No reserves yet — click <strong>+</strong> below.
                </span>
              ) : (
                <>
                  <span className="softres-char-label">RESERVES:</span>
                  {myItems.map((it, i) => (
                    <span key={i} className="softres-char-reserve-item" style={{ color: QUALITY_COLORS[it.quality || ""] || "#ccc" }}>
                      • {it.name}
                      {!isLocked && (
                        <button type="button" className="softres-reserve-btn softres-remove-btn" onClick={() => void removeReserve(Number(it.itemId))}>
                          ✕
                        </button>
                      )}
                    </span>
                  ))}
                </>
              )}
            </div>
          </div>

          {hardReserves.length > 0 && (
            <div className="hardres-section">
              <h3>
                Hard Reserves <span className="badge">{hardReserves.length}</span>
              </h3>
              <ul>
                {hardReserves.map((hr) => (
                  <li key={hr.id}>
                    {hr.itemName} → {hr.characterName} {hr.note ? `(${hr.note})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!raidLoot ? (
            <p className="text-dim">Loading loot table…</p>
          ) : (
            <>
              <div className="softres-loot-filters">
                <div className="loot-boss-chips">
                  {raidLoot.bosses.map((b) => {
                    const on = bossFilter.has(b.name);
                    return (
                      <button
                        key={b.name}
                        type="button"
                        className={cx("strategy-tab", on && "is-active")}
                        onClick={() =>
                          setBossFilter((prev) => {
                            const next = new Set(prev);
                            if (next.has(b.name)) next.delete(b.name);
                            else next.add(b.name);
                            return next;
                          })
                        }
                      >
                        {b.name}
                      </button>
                    );
                  })}
                </div>
                <input type="text" placeholder="Item name…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>

              <div className="table-wrap">
                <table className="softres-table softres-loot-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Type</th>
                      <th>Boss</th>
                      <th>Reserved</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((item) => {
                      const usable = !guestClass || canClassUseItem(guestClass, item);
                      const reserved = myItemIds.has(Number(item.itemId));
                      const reservers = reserversByItem.get(Number(item.itemId)) || [];
                      return (
                        <tr
                          key={item.itemId}
                          className={cx(!usable && "loot-row-unusable")}
                          onMouseEnter={(e) => item.wowheadTooltip && setTooltip({ item, x: e.clientX, y: e.clientY })}
                          onMouseMove={(e) => tooltip && setTooltip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))}
                          onMouseLeave={() => setTooltip(null)}
                        >
                          <td>
                            <a href={wowheadUrl(item.itemId)} target="_blank" rel="noopener noreferrer" style={{ color: QUALITY_COLORS[item.quality || ""] || "#fff", textDecoration: "none" }}>
                              {item.icon && <img src={item.icon} alt="" width={20} height={20} style={{ verticalAlign: "middle", marginRight: 6, borderRadius: 3 }} />}
                              {item.name}
                            </a>
                          </td>
                          <td>{getItemType(item)}</td>
                          <td>{item.bossName}</td>
                          <td>{reservers.join(", ")}</td>
                          <td>
                            {!isLocked &&
                              (reserved ? (
                                <button type="button" className="softres-reserve-btn softres-remove-btn" onClick={() => void removeReserve(Number(item.itemId))}>
                                  −
                                </button>
                              ) : (
                                <button type="button" className="softres-reserve-btn softres-add-btn" disabled={myItems.length >= maxReserves} onClick={() => void addReserve(item)}>
                                  +
                                </button>
                              ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {message.text && <p className={cx("message", message.error && "error")}>{message.text}</p>}
        </section>
      </main>

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
    </ThemeProvider>
  );
}
