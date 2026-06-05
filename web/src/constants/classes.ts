// Canonical WoW class colors (TBC). Used for class-colored names across pages.
export const WOW_CLASS_COLORS: Record<string, string> = {
  Druid: "#FF7D0A",
  Hunter: "#ABD473",
  Mage: "#69CCF0",
  Paladin: "#F58CBA",
  Priest: "#FFFFFF",
  Rogue: "#FFF569",
  Shaman: "#0070DE",
  Warlock: "#9482C9",
  Warrior: "#C79C6E"
};

export const WOW_CLASSES = Object.keys(WOW_CLASS_COLORS);

export const ROLE_ICONS: Record<string, string> = {
  Tank: "🛡",
  Healer: "✚",
  DPS: "⚔"
};

export const SPEC_ICONS: Record<string, string> = {
  "Feral (Bear)": "🐻",
  Restoration: "💧",
  Balance: "🌙",
  "Feral (Cat)": "🐈",
  "Beast Mastery": "🐾",
  Marksmanship: "🎯",
  Survival: "🪤",
  Arcane: "✨",
  Fire: "🔥",
  Frost: "❄",
  Protection: "🛡",
  Holy: "✚",
  Retribution: "⚔",
  Discipline: "📿",
  Shadow: "🕯",
  Assassination: "🗡",
  Combat: "⚔",
  Subtlety: "🌑",
  Elemental: "⚡",
  Enhancement: "🔨",
  Affliction: "☠",
  Demonology: "👹",
  Destruction: "💥",
  Arms: "🪓",
  Fury: "💢"
};

export function classColor(wowClass?: string): string {
  return (wowClass && WOW_CLASS_COLORS[wowClass]) || "inherit";
}

// TBC class → role → available specializations (drives the profile form cascades).
export const TBC_SPECS_BY_CLASS_ROLE: Record<string, Record<string, string[]>> = {
  Druid: { Tank: ["Feral (Bear)"], Healer: ["Restoration"], DPS: ["Balance", "Feral (Cat)"] },
  Hunter: { DPS: ["Beast Mastery", "Marksmanship", "Survival"] },
  Mage: { DPS: ["Arcane", "Fire", "Frost"] },
  Paladin: { Tank: ["Protection"], Healer: ["Holy"], DPS: ["Retribution"] },
  Priest: { Healer: ["Discipline", "Holy"], DPS: ["Shadow"] },
  Rogue: { DPS: ["Assassination", "Combat", "Subtlety"] },
  Shaman: { Healer: ["Restoration"], DPS: ["Elemental", "Enhancement"] },
  Warlock: { DPS: ["Affliction", "Demonology", "Destruction"] },
  Warrior: { Tank: ["Protection"], DPS: ["Arms", "Fury"] }
};

export function getRolesForClass(className?: string): string[] {
  return Object.keys(TBC_SPECS_BY_CLASS_ROLE[className || ""] || {});
}

export function getSpecsForSelection(className?: string, roleName?: string): string[] {
  return (TBC_SPECS_BY_CLASS_ROLE[className || ""] || {})[roleName || ""] || [];
}

export const ALL_ROLES = ["Tank", "Healer", "DPS"];
