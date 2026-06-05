// WarcraftLogs (Fresh TBC) parse fetching — ported 1:1 from the old js/admin.js +
// app.js singleton. Module-level state (token, cache, in-flight dedup, 3-slot queue,
// sessionStorage cache, no-cache-on-429) lives here so React StrictMode double-effects
// can't double-fire requests. Components consume it via the useWclParses hook.
import { appSettings } from "./config";

const WCL_BASE_URL = "https://fresh.warcraftlogs.com";
const WCL_SERVER_SLUG = "dreamscythe";
const WCL_SERVER_REGION = "US";

// Zones ordered highest tier first so we display the best tier a character has logs for.
export const WCL_TBC_ZONES = [
  { id: 1013, label: "Sunwell" },
  { id: 1011, label: "BT/Hyjal" },
  { id: 1012, label: "Zul'Aman" },
  { id: 1056, label: "SSC/TK" },
  { id: 1048, label: "Gruul/Mag" },
  { id: 1047, label: "Kara" }
] as const;

export interface WclParse {
  label: string;
  avg: number;
}

// Raid display-name → which WCL zone labels its parses come from.
export const RAID_NAME_TO_WCL_ZONES: Record<string, string[]> = {
  Karazhan: ["Kara"],
  "Gruul's Lair": ["Gruul/Mag"],
  "Magtheridon's Lair": ["Gruul/Mag"],
  "Gruul's + Mag's": ["Gruul/Mag"],
  "Serpentshrine Cavern": ["SSC/TK"],
  "The Eye": ["SSC/TK"],
  "Tempest Keep": ["SSC/TK"],
  "Tempest Keep: The Eye": ["SSC/TK"],
  "Hyjal Summit": ["BT/Hyjal"],
  "Black Temple": ["BT/Hyjal"],
  "Zul'Aman": ["Zul'Aman"],
  "Sunwell Plateau": ["Sunwell"]
};

export function wclConfigured(): boolean {
  return !!appSettings.wclClientId && !!appSettings.wclClientSecret;
}

export function wclParseColorClass(pct: number): string {
  if (pct >= 99) return "wcl-parse-gold";
  if (pct >= 95) return "wcl-parse-orange";
  if (pct >= 75) return "wcl-parse-purple";
  if (pct >= 50) return "wcl-parse-blue";
  if (pct >= 25) return "wcl-parse-green";
  return "wcl-parse-gray";
}

// Filter a character's parses down to the zones relevant to a given raid name.
// Mirrors the old applyWclResults logic: unknown raid name → no parses; no raid
// context → show everything.
export function filterParsesForRaid(results: WclParse[] | null, raidName?: string): WclParse[] {
  if (!results || !results.length) return [];
  const name = (raidName || "").trim();
  if (!name) return results;
  const allowed = RAID_NAME_TO_WCL_ZONES[name];
  if (!allowed) return [];
  return results.filter((r) => allowed.includes(r.label));
}

// ── module-level singleton state ────────────────────────────────────────────────
let wclTokenCache: string | null = null;
let wclTokenExpiry = 0;
let wclTokenFetchPromise: Promise<string | null> | null = null;
const wclParseCache = new Map<string, WclParse[] | null>(); // slug → results (null = errored)
const wclPendingFetches = new Map<string, Promise<WclParse[] | null>>();
let wclRateLimitedUntil = 0;

const WCL_SESSION_KEY = "wclParseCache_v3";
(function loadWclSessionCache() {
  try {
    const stored = sessionStorage.getItem(WCL_SESSION_KEY);
    if (stored) {
      Object.entries(JSON.parse(stored)).forEach(([k, v]) => wclParseCache.set(k, v as WclParse[]));
    }
  } catch {
    /* ignore */
  }
})();

function saveWclSessionCache() {
  try {
    const obj: Record<string, WclParse[]> = {};
    wclParseCache.forEach((v, k) => {
      if (v !== null) obj[k] = v;
    });
    sessionStorage.setItem(WCL_SESSION_KEY, JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

async function getWclToken(): Promise<string | null> {
  if (wclTokenCache && Date.now() < wclTokenExpiry) return wclTokenCache;
  if (wclTokenFetchPromise) return wclTokenFetchPromise;
  const clientId = appSettings.wclClientId;
  const clientSecret = appSettings.wclClientSecret;
  if (!clientId || !clientSecret) return null;
  wclTokenFetchPromise = (async () => {
    try {
      const creds = btoa(`${clientId}:${clientSecret}`);
      const res = await fetch(`${WCL_BASE_URL}/oauth/token`, {
        method: "POST",
        headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials"
      });
      if (!res.ok) return null;
      const data = await res.json();
      wclTokenCache = data.access_token;
      wclTokenExpiry = Date.now() + ((data.expires_in || 3600) - 60) * 1000;
      return wclTokenCache;
    } catch {
      return null;
    } finally {
      wclTokenFetchPromise = null;
    }
  })();
  return wclTokenFetchPromise;
}

// Limit concurrent WCL requests so we don't blow the rate-limit quota.
const WCL_MAX_CONCURRENT = 3;
let wclInFlight = 0;
const wclQueue: Array<() => void> = [];
function wclAcquireSlot(): Promise<void> {
  return new Promise((resolve) => {
    if (wclInFlight < WCL_MAX_CONCURRENT) {
      wclInFlight++;
      resolve();
    } else {
      wclQueue.push(() => {
        wclInFlight++;
        resolve();
      });
    }
  });
}
function wclReleaseSlot() {
  wclInFlight--;
  const next = wclQueue.shift();
  if (next) next();
}

// Synchronous cache peek so the hook can render instantly on a cache hit (and never
// flash back to a placeholder on re-render). Returns undefined if not yet fetched.
export function getCachedParses(name: string): WclParse[] | null | undefined {
  const slug = String(name || "").trim().toLowerCase();
  if (!slug) return null;
  return wclParseCache.has(slug) ? wclParseCache.get(slug) : undefined;
}

export async function fetchWclParses(characterName: string): Promise<WclParse[] | null> {
  const slug = String(characterName || "").trim().toLowerCase();
  if (!slug) return null;
  if (wclParseCache.has(slug)) return wclParseCache.get(slug) ?? null;
  if (wclPendingFetches.has(slug)) return wclPendingFetches.get(slug)!;

  const promise = (async (): Promise<WclParse[] | null> => {
    if (Date.now() < wclRateLimitedUntil) return null;

    const token = await getWclToken();
    if (!token) {
      wclParseCache.set(slug, null);
      return null;
    }

    const safeName = String(characterName).trim().replace(/[^a-zA-ZÀ-ɏ'-]/g, "");
    if (!safeName) {
      wclParseCache.set(slug, null);
      return null;
    }

    // partition: -1 = best across all partitions. Required for Fresh's SSC/TK zone,
    // which uses partition 2 — the default partition (1) has no rankings.
    const zoneFields = WCL_TBC_ZONES.map((z, i) => `z${i}: zoneRankings(zoneID: ${z.id}, partition: -1)`).join(" ");
    const query = `{ characterData { character(name: "${safeName}", serverSlug: "${WCL_SERVER_SLUG}", serverRegion: "${WCL_SERVER_REGION}") { ${zoneFields} } } }`;

    await wclAcquireSlot();
    try {
      const res = await fetch(`${WCL_BASE_URL}/api/v2/client`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });
      if (res.status === 429) {
        // Transient — back off and DO NOT cache null, so the next render retries.
        wclRateLimitedUntil = Date.now() + 10 * 60 * 1000;
        return null;
      }
      if (!res.ok) {
        wclParseCache.set(slug, null);
        return null;
      }
      const data = await res.json();
      const char = data?.data?.characterData?.character;
      if (!char) {
        wclParseCache.set(slug, null);
        return null;
      }
      const results: WclParse[] = [];
      for (let i = 0; i < WCL_TBC_ZONES.length; i++) {
        const zoneData = char[`z${i}`];
        const avg = zoneData?.bestPerformanceAverage;
        if (avg != null && avg > 0) {
          results.push({ label: WCL_TBC_ZONES[i].label, avg: Math.round(avg) });
        }
      }
      wclParseCache.set(slug, results);
      saveWclSessionCache();
      return results;
    } catch {
      wclParseCache.set(slug, null);
      return null;
    } finally {
      wclReleaseSlot();
    }
  })();

  wclPendingFetches.set(slug, promise);
  promise.finally(() => wclPendingFetches.delete(slug));
  return promise;
}

const LOGS_BASE_URL = "https://fresh.warcraftlogs.com/character/us/dreamscythe";
export function buildLogsUrl(characterName: string): string {
  const slug = String(characterName || "").trim().toLowerCase();
  if (!slug) return "";
  return `${LOGS_BASE_URL}/${encodeURIComponent(slug)}`;
}
