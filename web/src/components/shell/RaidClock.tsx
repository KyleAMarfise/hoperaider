import { useMemo } from "react";
import { collection, orderBy, query } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useCollection } from "../../hooks/useCollection";
import { useCountdown } from "../../hooks/useCountdown";
import { cstToInstant, hourLabel } from "../../lib/timezone";
import type { Raid } from "../../types/firestore";

// Styled as a WoW "target" frame, fixed to the right side of the screen — the
// next raid is the thing you're "targeting".
export function RaidClock() {
  const raidsQuery = useMemo(() => query(collection(db, "raids"), orderBy("raidDate", "asc")), []);
  const { docs: raids } = useCollection<Raid>(raidsQuery);

  const next = useMemo(() => {
    const now = Date.now();
    let best: { raid: Raid; at: Date } | null = null;
    for (const r of raids) {
      const at = cstToInstant(r.raidDate, r.raidStart);
      if (!at) continue;
      if (at.getTime() >= now && (!best || at.getTime() < best.at.getTime())) best = { raid: r, at };
    }
    return best;
  }, [raids]);

  const cd = useCountdown(next?.at ?? null);

  return (
    <div className="wow-target-frame" aria-live="polite">
      <div className="wow-target-label">Target</div>
      <div className="wow-target-inner">
        <div className="wow-target-portrait">{next ? "💀" : "❔"}</div>
        <div className="wow-target-bars">
          <div className="wow-target-name-row">
            <span className="wow-target-name">{next ? next.raid.raidName ?? "Raid" : "No Target"}</span>
            <span className="wow-target-level">??</span>
          </div>
          <div className="wow-target-health">
            <div className="wow-target-health-fill" />
            <span className="wow-target-countdown">
              {next ? `${cd.days}d ${cd.hours}:${cd.minutes}:${cd.seconds}` : "Awaiting pull…"}
            </span>
          </div>
          <div className="wow-target-sub">
            {next ? `${next.raid.raidDate} · ${hourLabel(next.raid.raidStart ?? 19)} CST` : "No raid scheduled"}
          </div>
        </div>
      </div>
    </div>
  );
}
