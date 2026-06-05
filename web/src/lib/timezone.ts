export function hourLabel(h: number): string {
  const n = ((h % 24) + 24) % 24;
  const suffix = n >= 12 ? "PM" : "AM";
  const t = n % 12 === 0 ? 12 : n % 12;
  return `${t}:00 ${suffix}`;
}

// Minutes that America/Chicago is offset from UTC at the given instant (DST-aware).
function centralOffsetMinutes(at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const parts = dtf.formatToParts(at);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour === "24" ? "0" : map.hour),
    Number(map.minute),
    Number(map.second)
  );
  return (asUTC - at.getTime()) / 60000;
}

export const START_HOURS = Array.from({ length: 24 }, (_, i) => i); // 0..23
export const END_HOURS = Array.from({ length: 24 }, (_, i) => i + 1); // 1..24

function shiftHourFromCst(h: number, delta: number): number {
  return (((h + delta) % 24) + 24) % 24;
}

export interface TimezoneLine {
  label: string;
  text: string;
}

// CST base time → the four US zone lines shown on schedule/raid rows.
export function buildTimezoneLines(startHour: number | null, endHour: number | null): TimezoneLine[] {
  if (!Number.isInteger(startHour as number) || !Number.isInteger(endHour as number)) return [];
  const zones = [
    { label: "CST", delta: 0 },
    { label: "EST", delta: 1 },
    { label: "MST", delta: -1 },
    { label: "PST", delta: -2 }
  ];
  return zones.map((z) => {
    const s = shiftHourFromCst(startHour as number, z.delta);
    const e = shiftHourFromCst(endHour as number, z.delta);
    return { label: z.label, text: `${z.label} ${hourLabel(s)} – ${hourLabel(e)}` };
  });
}

// Which US zone label matches the viewer's timezone (for highlighting), or "".
export function detectViewerTimezoneLabel(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (["America/Chicago", "America/Winnipeg", "America/Matamoros"].includes(tz)) return "CST";
    if (["America/New_York", "America/Detroit", "America/Toronto"].includes(tz)) return "EST";
    if (["America/Denver", "America/Boise", "America/Phoenix"].includes(tz)) return "MST";
    if (["America/Los_Angeles", "America/Vancouver", "America/Tijuana"].includes(tz)) return "PST";
  } catch {
    /* ignore */
  }
  return "";
}

// Convert a raid's CST wall-clock (YYYY-MM-DD + hour) to an absolute instant.
export function cstToInstant(dateStr?: string, hour?: number | null): Date | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  const h = Number.isFinite(hour as number) ? (hour as number) : 19;
  const guess = new Date(Date.UTC(y, m - 1, d, h, 0, 0));
  const off = centralOffsetMinutes(guess); // minutes Central is ahead of UTC (negative)
  return new Date(Date.UTC(y, m - 1, d, h, 0, 0) - off * 60000);
}
