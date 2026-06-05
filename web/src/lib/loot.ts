// ── Loot table types ───────────────────────────────────────────────────────
export interface LootItem {
  itemId: number;
  name: string;
  icon?: string;
  quality?: string;
  itemLevel?: number;
  slot?: string;
  class?: string;
  subclass?: string;
  dropChance?: number | null;
  wowheadTooltip?: string;
  bossName?: string;
}
export interface LootBoss {
  name: string;
  items: LootItem[];
  sourceLoot?: string;
}
export interface RaidLoot {
  zoneId?: number;
  name: string;
  phase?: number;
  size?: number;
  bosses: LootBoss[];
  sources?: string[];
}
export interface LootData {
  generatedAt?: string;
  raids: RaidLoot[];
}

export interface ReserveItem {
  itemId: number;
  name: string;
  icon?: string;
  quality?: string;
  slot?: string;
  boss?: string;
}
export interface SoftReserve {
  id: string;
  raidId: string;
  raidName?: string;
  raidDate?: string;
  characterId: string;
  characterName?: string;
  wowClass?: string;
  ownerUid?: string;
  isGuest?: boolean;
  items?: ReserveItem[];
}
export interface HardReserve {
  id: string;
  raidId: string;
  itemId: number;
  itemName?: string;
  characterName?: string;
  characterId?: string;
  note?: string;
}

export const QUALITY_COLORS: Record<string, string> = {
  Legendary: "#ff8000",
  Epic: "#a335ee",
  Rare: "#0070dd",
  Uncommon: "#1eff00"
};

// ── Loot table loader (fetch once, memoize) ─────────────────────────────────
let lootData: LootData | null = null;
let lootPromise: Promise<LootData | null> | null = null;

export async function loadLootData(): Promise<LootData | null> {
  if (lootData) return lootData;
  if (!lootPromise) {
    lootPromise = fetch("/data/tbc-raid-loot.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: LootData) => {
        lootData = d;
        return d;
      })
      .catch((err) => {
        console.error("Failed to load loot table:", err);
        return null;
      });
  }
  return lootPromise;
}

export function buildTooltipMap(data: LootData | null): Map<number, LootItem> {
  const map = new Map<number, LootItem>();
  if (!data?.raids) return map;
  for (const raid of data.raids) {
    for (const boss of raid.bosses) {
      for (const item of boss.items) {
        if (!map.has(item.itemId)) map.set(item.itemId, item);
      }
    }
  }
  return map;
}

const LOOT_NAME_ALIASES: Record<string, string> = {
  "the eye": "Tempest Keep: The Eye",
  "tempest keep": "Tempest Keep: The Eye",
  "tempest keep: the eye": "Tempest Keep: The Eye"
};

export function findRaidLoot(data: LootData | null, raidName?: string): RaidLoot | null {
  if (!data?.raids) return null;
  const normalized = String(raidName || "").trim().toLowerCase();
  const canonical = (LOOT_NAME_ALIASES[normalized] || raidName || "").toLowerCase();
  return data.raids.find((r) => r.name.toLowerCase() === canonical) || null;
}

// Compound raids (one Firestore raid spanning two dungeons) → merge loot tables,
// tagging each boss with its sourceLoot so per-dungeon limits can be enforced.
const COMPOUND_RAID_PARTS: Record<string, string[]> = {
  "Gruul's + Mag's": ["Gruul's Lair", "Magtheridon's Lair"]
};

export function resolveRaidLoot(data: LootData | null, raidName?: string): RaidLoot | null {
  const direct = findRaidLoot(data, raidName);
  if (direct) return direct;
  if (!data?.raids || !raidName) return null;
  const parts = COMPOUND_RAID_PARTS[raidName] || [];
  if (!parts.length) return null;
  const mergedBosses: LootBoss[] = [];
  const sources: string[] = [];
  for (const name of parts) {
    const match = data.raids.find((r) => r.name === name);
    if (match) {
      mergedBosses.push(...match.bosses.map((b) => ({ ...b, sourceLoot: match.name })));
      sources.push(match.name);
    }
  }
  if (!mergedBosses.length) return null;
  return { name: raidName, bosses: mergedBosses, sources };
}

// Free-text match across name/boss/slot/type/quality + tier-token and iLvl aliases.
export function itemMatchesSearch(item: LootItem, bossName: string, term: string): boolean {
  const fields = [item.name, bossName, item.slot, getItemType(item), item.quality, item.subclass, item.class];
  for (const f of fields) if (f && f.toLowerCase().includes(term)) return true;
  if (item.slot === "Tier Token") {
    if ("tier".includes(term) || "token".includes(term) || "set piece".includes(term)) return true;
    const name = (item.name || "").toLowerCase();
    if (term === "t4" && name.includes("fallen")) return true;
    if (term === "t5" && name.includes("vanquished")) return true;
    if (term === "t6" && name.includes("forgotten")) return true;
  }
  if (item.itemLevel && String(item.itemLevel).includes(term)) return true;
  return false;
}

// ── Item eligibility + typing ───────────────────────────────────────────────
const GENERIC_SLOTS = new Set(["Back", "Finger", "Neck", "Trinket", "Held In Off-hand"]);
const CLASS_ARMOR: Record<string, string[]> = {
  Warrior: ["Plate", "Mail", "Leather", "Cloth"],
  Paladin: ["Plate", "Mail", "Leather", "Cloth"],
  Hunter: ["Mail", "Leather", "Cloth"],
  Shaman: ["Mail", "Leather", "Cloth"],
  Druid: ["Leather", "Cloth"],
  Rogue: ["Leather", "Cloth"],
  Priest: ["Cloth"],
  Mage: ["Cloth"],
  Warlock: ["Cloth"]
};
const CLASS_WEAPONS: Record<string, string[]> = {
  Warrior: ["Axe", "Sword", "Mace", "Dagger", "Fist Weapon", "Polearm", "Staff", "Bow", "Gun", "Crossbow", "Thrown"],
  Paladin: ["Axe", "Sword", "Mace", "Polearm"],
  Hunter: ["Axe", "Sword", "Dagger", "Fist Weapon", "Polearm", "Staff", "Bow", "Gun", "Crossbow"],
  Shaman: ["Axe", "Mace", "Dagger", "Fist Weapon", "Staff"],
  Druid: ["Mace", "Dagger", "Fist Weapon", "Polearm", "Staff"],
  Rogue: ["Axe", "Sword", "Mace", "Dagger", "Fist Weapon", "Bow", "Gun", "Crossbow", "Thrown"],
  Priest: ["Mace", "Dagger", "Staff", "Wand"],
  Mage: ["Sword", "Dagger", "Staff", "Wand"],
  Warlock: ["Sword", "Dagger", "Staff", "Wand"]
};
const SHIELD_CLASSES = new Set(["Warrior", "Paladin", "Shaman"]);
const RELIC_CLASS: Record<string, string> = { Idol: "Druid", Libram: "Paladin", Totem: "Shaman" };
const TIER_TOKEN_CLASSES: Record<string, Set<string>> = {
  Hero: new Set(["Hunter", "Mage", "Warlock"]),
  Champion: new Set(["Paladin", "Rogue", "Shaman"]),
  Defender: new Set(["Warrior", "Priest", "Druid"]),
  Conqueror: new Set(["Paladin", "Priest", "Warlock"]),
  Protector: new Set(["Warrior", "Hunter", "Shaman"]),
  Vanquisher: new Set(["Rogue", "Mage", "Druid"])
};

export function getTierTokenGroup(itemName?: string): string | null {
  if (!itemName) return null;
  const m = itemName.match(/of the (?:Fallen|Vanquished|Forgotten) (\w+)$/);
  return m ? m[1] : null;
}

export function canClassUseItem(wowClass: string, item: LootItem): boolean {
  if (!wowClass) return true;
  if (GENERIC_SLOTS.has(item.slot || "")) return true;
  if (item.slot === "Tier Token") {
    const group = getTierTokenGroup(item.name);
    if (group && TIER_TOKEN_CLASSES[group]) return TIER_TOKEN_CLASSES[group].has(wowClass);
    return true;
  }
  if (item.class === "Armor") {
    if (item.subclass === "Shield") return SHIELD_CLASSES.has(wowClass);
    if (item.subclass && RELIC_CLASS[item.subclass]) return RELIC_CLASS[item.subclass] === wowClass;
    return (CLASS_ARMOR[wowClass] || []).includes(item.subclass || "");
  }
  if (item.class === "Weapon") {
    return (CLASS_WEAPONS[wowClass] || []).includes(item.subclass || "");
  }
  return true;
}

export function getItemType(item: LootItem): string {
  if (item.slot === "Tier Token") return "Tier Token";
  if (item.slot === "Recipe") return item.subclass || "Recipe";
  if (item.slot === "Bag") return "Bag";
  if (item.subclass === "Mount") return "Mount";
  if (item.class === "Weapon") return item.subclass || "Weapon";
  if (item.class === "Armor") {
    if (item.subclass === "Miscellaneous") return "Misc";
    return item.subclass || "Armor";
  }
  return item.class || "—";
}

export function getItemSortScore(item: LootItem, wowClass: string): number {
  if (!wowClass) return 0;
  const canUse = canClassUseItem(wowClass, item);
  if (canUse) {
    if (item.class === "Weapon") return 10;
    if (item.class === "Armor" && item.subclass === "Shield") return 20;
    if (item.class === "Armor" && item.subclass && RELIC_CLASS[item.subclass]) return 20;
    if (item.class === "Armor") {
      const idx = (CLASS_ARMOR[wowClass] || []).indexOf(item.subclass || "");
      if (idx >= 0) return 30 + idx;
      return 39;
    }
    if (GENERIC_SLOTS.has(item.slot || "")) return 25;
    if (item.slot === "Tier Token") return 15;
    if (item.slot === "Recipe" || item.slot === "Bag" || item.subclass === "Mount") return 60;
    return 50;
  }
  if (item.class === "Weapon") return 110;
  if (item.class === "Armor" && item.subclass === "Shield") return 120;
  if (item.class === "Armor" && item.subclass && RELIC_CLASS[item.subclass]) return 120;
  if (item.class === "Armor") {
    const idx = ["Plate", "Mail", "Leather", "Cloth"].indexOf(item.subclass || "");
    return 130 + (idx >= 0 ? idx : 4);
  }
  return 150;
}

export function wowheadUrl(itemId: number): string {
  return `https://www.wowhead.com/tbc/item=${itemId}`;
}

// Reserve items, with legacy item1*/item2* fallback.
export function getReserveItems(reserve?: SoftReserve | null): ReserveItem[] {
  if (!reserve) return [];
  if (Array.isArray(reserve.items) && reserve.items.length > 0) return reserve.items;
  return [];
}
