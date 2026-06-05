// classic-armory.org item-level lookup — ported from js/admin.js. Module-level cache
// dedupes across components/renders. Consumed via the useArmory hook.

const ARMORY_API_URL = "https://classic-armory.org/api/v1/character";
const ARMORY_REGION = "us";
const ARMORY_REALM = "dreamscythe";
const ARMORY_FLAVOR = "tbc-anniversary";
const ARMORY_BASE_URL = "https://classic-armory.org/character/us/tbc-anniversary/dreamscythe";

export interface ArmoryData {
  itemLevel: number;
}

const armoryDataCache = new Map<string, ArmoryData | null>();

export function buildArmoryUrl(characterName: string): string {
  const slug = String(characterName || "").trim().toLowerCase();
  if (!slug) return "";
  return `${ARMORY_BASE_URL}/${encodeURIComponent(slug)}`;
}

export function getCachedArmory(name: string): ArmoryData | null | undefined {
  const slug = String(name || "").trim().toLowerCase();
  if (!slug) return null;
  return armoryDataCache.has(slug) ? armoryDataCache.get(slug) : undefined;
}

export async function fetchArmoryData(characterName: string): Promise<ArmoryData | null> {
  const slug = String(characterName || "").trim().toLowerCase();
  if (!slug) return null;
  if (armoryDataCache.has(slug)) return armoryDataCache.get(slug) ?? null;
  try {
    const res = await fetch(ARMORY_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ region: ARMORY_REGION, realm: ARMORY_REALM, name: characterName.trim(), flavor: ARMORY_FLAVOR })
    });
    const data = res.ok ? await res.json() : null;
    if (data?.character) {
      const result: ArmoryData = { itemLevel: data.character.item_level || 0 };
      armoryDataCache.set(slug, result);
      return result;
    }
    armoryDataCache.set(slug, null);
    return null;
  } catch {
    armoryDataCache.set(slug, null);
    return null;
  }
}
