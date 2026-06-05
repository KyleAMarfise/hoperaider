export interface RaidPreset {
  name: string;
  size: string; // "10" | "25"
  tanks: number;
  healers: number;
  dps: number;
}

export const RAID_PRESETS_BY_PHASE: Record<number, RaidPreset[]> = {
  1: [
    { name: "Karazhan", size: "10", tanks: 2, healers: 3, dps: 5 },
    { name: "Gruul's Lair", size: "25", tanks: 2, healers: 6, dps: 17 },
    { name: "Magtheridon's Lair", size: "25", tanks: 3, healers: 6, dps: 16 },
    { name: "Gruul's + Mag's", size: "25", tanks: 3, healers: 6, dps: 16 }
  ],
  2: [
    { name: "Serpentshrine Cavern", size: "25", tanks: 3, healers: 7, dps: 15 },
    { name: "Tempest Keep: The Eye", size: "25", tanks: 3, healers: 7, dps: 15 }
  ],
  3: [
    { name: "Hyjal Summit", size: "25", tanks: 3, healers: 7, dps: 15 },
    { name: "Black Temple", size: "25", tanks: 3, healers: 7, dps: 15 }
  ],
  4: [{ name: "Zul'Aman", size: "10", tanks: 2, healers: 3, dps: 5 }],
  5: [{ name: "Sunwell Plateau", size: "25", tanks: 3, healers: 7, dps: 15 }]
};

export const BOSS_KILL_ORDER: Record<string, string[]> = {
  Karazhan: [
    "Servant Quarters", "Attumen the Huntsman", "Moroes", "Opera Event",
    "Maiden of Virtue", "The Curator", "Chess Event", "Terestian Illhoof",
    "Shade of Aran", "Netherspite", "Nightbane", "Prince Malchezaar"
  ],
  "Gruul's Lair": ["High King Maulgar", "Gruul the Dragonkiller"],
  "Magtheridon's Lair": ["Magtheridon"],
  "Serpentshrine Cavern": [
    "Hydross the Unstable", "The Lurker Below", "Leotheras the Blind",
    "Fathom-Lord Karathress", "Morogrim Tidewalker", "Lady Vashj"
  ],
  "Tempest Keep: The Eye": ["Al'ar", "Void Reaver", "High Astromancer Solarian", "Kael'thas Sunstrider"],
  "Hyjal Summit": ["Rage Winterchill", "Anetheron", "Kaz'rogal", "Azgalor", "Archimonde"],
  "Black Temple": [
    "High Warlord Naj'entus", "Supremus", "Shade of Akama", "Gurtogg Bloodboil",
    "Teron Gorefiend", "Mother Shahraz", "The Illidari Council", "Illidan Stormrage"
  ],
  "Zul'Aman": ["Nalorakk", "Akil'zon", "Jan'alai", "Halazzi", "Hex Lord Malacrass", "Zul'jin"],
  "Sunwell Plateau": ["Kalecgos", "Brutallus", "Felmyst", "Eredar Twins", "M'uru", "Kil'jaeden"]
};

export const ROLE_SPECS: Record<string, Record<string, string[]>> = {
  Tank: { Druid: ["Feral Tank"], Paladin: ["Protection"], Warrior: ["Protection"] },
  Healer: { Druid: ["Restoration"], Paladin: ["Holy"], Priest: ["Holy", "Discipline"], Shaman: ["Restoration"] },
  DPS: {
    Druid: ["Balance", "Feral DPS"],
    Hunter: ["Beast Mastery", "Marksmanship", "Survival"],
    Mage: ["Arcane", "Fire", "Frost"],
    Paladin: ["Retribution"],
    Priest: ["Shadow"],
    Rogue: ["Combat", "Assassination"],
    Shaman: ["Elemental", "Enhancement"],
    Warlock: ["Affliction", "Demonology", "Destruction"],
    Warrior: ["Arms", "Fury"]
  }
};

const RAID_NAME_MIGRATIONS: Record<string, string> = {
  "The Eye": "Tempest Keep: The Eye",
  "Tempest Keep": "Tempest Keep: The Eye"
};

export function migrateRaidName(name: string): string {
  return RAID_NAME_MIGRATIONS[name] || name;
}
export function getClassesForRole(role: string): string[] {
  return Object.keys(ROLE_SPECS[role] || {});
}
export function getSpecsForRoleClass(role: string, wowClass: string): string[] {
  return (ROLE_SPECS[role] || {})[wowClass] || [];
}

export function getDefaultRoleSlots(raidSizeStr: string): { tank: number; healer: number; dps: number } {
  const size = parseInt(String(raidSizeStr).replace(/\D/g, ""), 10) || 0;
  if (size >= 25) return { tank: 3, healer: 7, dps: size - 10 };
  if (size >= 10) return { tank: 2, healer: 3, dps: size - 5 };
  return { tank: 2, healer: 3, dps: 5 };
}

export interface RoleSpecSlot {
  role: string;
  class: string;
  spec: string;
  count: number;
}

// Per-raid accent colour — used for tile borders on Soft Reserves and raid rows
// on the Signup page so each raid reads as a distinct colour.
export const RAID_ACCENTS: Record<string, string> = {
  Karazhan: "#9b6dd6",
  "Gruul's Lair": "#e08a3c",
  "Magtheridon's Lair": "#c0504d",
  "Gruul's + Mag's": "#d1a754",
  "Serpentshrine Cavern": "#3fb0a8",
  "Tempest Keep: The Eye": "#d36fb0",
  "The Eye": "#d36fb0",
  "Hyjal Summit": "#5ec47a",
  "Black Temple": "#7d5bd0",
  "Zul'Aman": "#c8a04a",
  "Sunwell Plateau": "#e6c84a"
};

export function raidAccent(name?: string): string {
  return (name && RAID_ACCENTS[name]) || "#4a3e2a";
}
