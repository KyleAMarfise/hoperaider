import type { ReactNode } from "react";
import { useWclParses } from "../../hooks/useWclParses";
import { useArmory } from "../../hooks/useArmory";
import { buildLogsUrl, filterParsesForRaid, wclConfigured, wclParseColorClass } from "../../lib/wcl";
import { classColor } from "../../constants/classes";

// WCL parse badges for one character, optionally filtered to a raid's zones.
export function WclParsesCell({ characterName, raidName, logsUrl }: { characterName?: string; raidName?: string; logsUrl?: string }) {
  const name = (characterName || "").trim();
  const { loading, results } = useWclParses(name);
  if (!name) return <span className="text-dim">—</span>;
  if (!wclConfigured()) return <span className="text-dim">—</span>;
  const href = (logsUrl && logsUrl.trim()) || buildLogsUrl(name);

  if (loading) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="wcl-parse-link">
        …
      </a>
    );
  }
  const filtered = filterParsesForRaid(results, raidName);
  if (!filtered.length) {
    return (
      <span className="text-dim" title={raidName ? "No parses for this raid" : "No parses found"}>
        N/A
      </span>
    );
  }
  return (
    <>
      {filtered.map((r) => (
        <a
          key={r.label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={`wcl-parse-badge ${wclParseColorClass(r.avg)}`}
          title={`${r.label} – ${r.avg}% avg`}
        >
          {r.avg}
          <span className="wcl-badge-pct">%</span>
          <span className="wcl-badge-zone">{r.label}</span>
        </a>
      ))}
    </>
  );
}

// classic-armory item level for one character.
export function ArmoryIlvl({ characterName }: { characterName?: string }) {
  const name = (characterName || "").trim();
  const { loading, data } = useArmory(name);
  if (!name) return <span className="text-dim">—</span>;
  if (loading) return <span className="text-dim">…</span>;
  if (!data || !data.itemLevel) return <span className="text-dim">—</span>;
  return <span title={`Item Level: ${data.itemLevel}`}>{data.itemLevel}</span>;
}

// Class-colored character/text label.
export function ClassText({ children, wowClass }: { children: ReactNode; wowClass?: string }) {
  return <span style={{ color: classColor(wowClass), fontWeight: 600 }}>{children}</span>;
}
