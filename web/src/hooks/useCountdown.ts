import { useEffect, useState } from "react";

export interface Countdown {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
  done: boolean;
}

function pad(n: number): string {
  return String(Math.max(0, n)).padStart(2, "0");
}

export function useCountdown(target: Date | null): Countdown {
  const [now, setNow] = useState(() => Date.now());
  const targetMs = target ? target.getTime() : 0;

  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [targetMs, target]);

  if (!target) return { days: "00", hours: "00", minutes: "00", seconds: "00", done: false };

  let diff = Math.max(0, targetMs - now);
  const done = targetMs - now <= 0;
  const d = Math.floor(diff / 86_400_000);
  diff -= d * 86_400_000;
  const h = Math.floor(diff / 3_600_000);
  diff -= h * 3_600_000;
  const m = Math.floor(diff / 60_000);
  diff -= m * 60_000;
  const s = Math.floor(diff / 1000);
  return { days: pad(d), hours: pad(h), minutes: pad(m), seconds: pad(s), done };
}
