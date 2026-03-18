/**
 * Extract TBC raid loot data from wow-classic-items into a static JSON file.
 * Run: node scripts/build_loot_table.js
 * Output: data/tbc-raid-loot.json
 */
const fs = require('fs');
const path = require('path');
const Database = require('wow-classic-items');

const items = new Database.Items();

// TBC Raid zone IDs mapped to phase
const TBC_RAIDS = [
  { zoneId: 3457, name: "Karazhan",              phase: 1, size: 10 },
  { zoneId: 3923, name: "Gruul's Lair",          phase: 1, size: 25 },
  { zoneId: 3836, name: "Magtheridon's Lair",    phase: 1, size: 25 },
  { zoneId: 3607, name: "Serpentshrine Cavern",   phase: 2, size: 25 },
  { zoneId: 3845, name: "Tempest Keep",           phase: 2, size: 25 },
  { zoneId: 3606, name: "Hyjal Summit",           phase: 3, size: 25 },
  { zoneId: 3959, name: "Black Temple",            phase: 3, size: 25 },
  { zoneId: 3805, name: "Zul'Aman",               phase: 4, size: 10 },
  { zoneId: 4075, name: "Sunwell Plateau",         phase: 5, size: 25 },
];

const zoneIdSet = new Set(TBC_RAIDS.map(r => r.zoneId));

// Equippable slot types players would actually soft-reserve
const EQUIP_SLOTS = new Set([
  'Head','Neck','Shoulder','Back','Chest','Wrist','Hands','Waist','Legs','Feet',
  'Finger','Trinket','One-Hand','Two-Hand','Main Hand','Off Hand',
  'Held In Off-hand','Ranged','Thrown','Relic'
]);

// Regex to identify tier token items (T4 Fallen, T5 Vanquished, T6 Forgotten)
const TIER_TOKEN_RE = /^(Belt|Boots|Bracers|Chestguard|Gloves|Helm|Leggings|Pauldrons) of the (Fallen|Vanquished|Forgotten) /;

// Some tier tokens have incomplete source data in the database — fill in the gaps
const TIER_TOKEN_SOURCE_OVERRIDES = {
  // T5 Chest — Kael'thas Sunstrider, Tempest Keep
  30236: { zone: 3845, name: "Kael'thas Sunstrider" },
  30237: { zone: 3845, name: "Kael'thas Sunstrider" },
  30238: { zone: 3845, name: "Kael'thas Sunstrider" },
  // T6 Legs — The Illidari Council, Black Temple
  31098: { zone: 3959, name: "The Illidari Council" },
  31099: { zone: 3959, name: "The Illidari Council" },
  31100: { zone: 3959, name: "The Illidari Council" },
  // T6 Bracers — SWP trash
  34848: { zone: 4075, name: "Trash Drops" },
  34851: { zone: 4075, name: "Trash Drops" },
  34852: { zone: 4075, name: "Trash Drops" },
  // T6 Belt — SWP trash
  34853: { zone: 4075, name: "Trash Drops" },
  34854: { zone: 4075, name: "Trash Drops" },
  34855: { zone: 4075, name: "Trash Drops" },
  // T6 Boots — SWP trash
  34856: { zone: 4075, name: "Trash Drops" },
  34857: { zone: 4075, name: "Trash Drops" },
  34858: { zone: 4075, name: "Trash Drops" },
};

// Items to exclude entirely (no longer available / not real TBC raid loot)
const EXCLUDE_ITEMS = new Set([
  39769, // Arcanite Ripper — Prince Tenris Mirkblood, WotLK pre-patch event only
]);

// Items with wrong or missing boss attribution in wow-classic-items.
// Maps itemId → { zone, name } to override source data before filtering.
const BOSS_SOURCE_OVERRIDES = {
  // ── KARAZHAN — Attumen the Huntsman ──────────────────────────────────
  // Listed as "Zone Drop" in DB, actually drop from Attumen (+ Midnight)
  28453: { zone: 3457, name: "Attumen the Huntsman" }, // Bracers of the White Stag
  28454: { zone: 3457, name: "Attumen the Huntsman" }, // Stalker's War Bands
  28477: { zone: 3457, name: "Attumen the Huntsman" }, // Harbinger Bands
  28502: { zone: 3457, name: "Attumen the Huntsman" }, // Vambraces of Courage
  28503: { zone: 3457, name: "Attumen the Huntsman" }, // Whirlwind Bracers
  28504: { zone: 3457, name: "Attumen the Huntsman" }, // Steelhawk Crossbow
  28505: { zone: 3457, name: "Attumen the Huntsman" }, // Gauntlets of Renewed Hope
  28506: { zone: 3457, name: "Attumen the Huntsman" }, // Gloves of Dexterous Manipulation
  28507: { zone: 3457, name: "Attumen the Huntsman" }, // Handwraps of Flowing Thought
  28508: { zone: 3457, name: "Attumen the Huntsman" }, // Gloves of Saintly Blessings
  28509: { zone: 3457, name: "Attumen the Huntsman" }, // Worgen Claw Necklace

  // ── KARAZHAN — Chess Event (Dust Covered Chest) ─────────────────────
  // These drop from the chest after the Chess Event, not a direct boss kill
  28746: { zone: 3457, name: "Chess Event" }, // Fiend Slayer Boots
  28747: { zone: 3457, name: "Chess Event" }, // Battlescar Boots
  28749: { zone: 3457, name: "Chess Event" }, // King's Defender
  28750: { zone: 3457, name: "Chess Event" }, // Girdle of Treachery
  28751: { zone: 3457, name: "Chess Event" }, // Heart-Flame Leggings
  28752: { zone: 3457, name: "Chess Event" }, // Forestlord Striders
  28753: { zone: 3457, name: "Chess Event" }, // Ring of Recurrence
  28754: { zone: 3457, name: "Chess Event" }, // Triptych Shield of the Ancients
  28755: { zone: 3457, name: "Chess Event" }, // Bladed Shoulderpads of the Merciless
  28756: { zone: 3457, name: "Chess Event" }, // Headdress of the High Potentate

  // ── TEMPEST KEEP — Kael'thas Sunstrider ──────────────────────────────
  // Legendary weapons listed under their own names as separate "bosses"
  30311: { zone: 3845, name: "Kael'thas Sunstrider" }, // Warp Slicer
  30312: { zone: 3845, name: "Kael'thas Sunstrider" }, // Infinity Blade
  30313: { zone: 3845, name: "Kael'thas Sunstrider" }, // Staff of Disintegration
  30314: { zone: 3845, name: "Kael'thas Sunstrider" }, // Phaseshift Bulwark
  30316: { zone: 3845, name: "Kael'thas Sunstrider" }, // Devastation
  30317: { zone: 3845, name: "Kael'thas Sunstrider" }, // Cosmic Infuser
  30318: { zone: 3845, name: "Kael'thas Sunstrider" }, // Netherstrand Longbow
  // Regular loot — "Rare Drop" with no zone in DB
  29987: { zone: 3845, name: "Kael'thas Sunstrider" }, // Gauntlets of the Sun King
  29988: { zone: 3845, name: "Kael'thas Sunstrider" }, // The Nexus Key
  29989: { zone: 3845, name: "Kael'thas Sunstrider" }, // Sunshower Light Cloak
  29990: { zone: 3845, name: "Kael'thas Sunstrider" }, // Crown of the Sun
  29991: { zone: 3845, name: "Kael'thas Sunstrider" }, // Sunhawk Leggings
  29992: { zone: 3845, name: "Kael'thas Sunstrider" }, // Royal Cloak of the Sunstriders
  29993: { zone: 3845, name: "Kael'thas Sunstrider" }, // Twinblade of the Phoenix
  29994: { zone: 3845, name: "Kael'thas Sunstrider" }, // Thalassian Wildercloak
  29995: { zone: 3845, name: "Kael'thas Sunstrider" }, // Leggings of Murderous Intent
  29996: { zone: 3845, name: "Kael'thas Sunstrider" }, // Rod of the Sun King
  29997: { zone: 3845, name: "Kael'thas Sunstrider" }, // Band of the Ranger-General
  29998: { zone: 3845, name: "Kael'thas Sunstrider" }, // Royal Gauntlets of Silvermoon
  // Ashes of Al'ar mount — "Rare Drop" with no zone in DB
  32458: { zone: 3845, name: "Kael'thas Sunstrider" }, // Ashes of Al'ar

  // ── BLACK TEMPLE — Teron Gorefiend ───────────────────────────────────
  // All listed as "Rare Drop" with no zone in DB
  32280: { zone: 3959, name: "Teron Gorefiend" }, // Gauntlets of Enforcement
  32323: { zone: 3959, name: "Teron Gorefiend" }, // Shadowmoon Destroyer's Drape
  32324: { zone: 3959, name: "Teron Gorefiend" }, // Insidious Bands
  32325: { zone: 3959, name: "Teron Gorefiend" }, // Rifle of the Stoic Guardian
  32326: { zone: 3959, name: "Teron Gorefiend" }, // Twisted Blades of Zarak
  32327: { zone: 3959, name: "Teron Gorefiend" }, // Robe of the Shadow Council
  32328: { zone: 3959, name: "Teron Gorefiend" }, // Botanist's Gloves of Growth
  32329: { zone: 3959, name: "Teron Gorefiend" }, // Cowl of Benevolence
  32330: { zone: 3959, name: "Teron Gorefiend" }, // Totem of Ancestral Guidance
  32348: { zone: 3959, name: "Teron Gorefiend" }, // Soul Cleaver
  32510: { zone: 3959, name: "Teron Gorefiend" }, // Softstep Boots of Tracking
  32512: { zone: 3959, name: "Teron Gorefiend" }, // Girdle of Lordaeron's Fallen
  // Misattributed to Gurtogg Bloodboil in DB
  32501: { zone: 3959, name: "Teron Gorefiend" }, // Shadowmoon Insignia

  // ── SUNWELL PLATEAU — Kalecgos ───────────────────────────────────────
  // Listed as "Zone Drop" with no boss name in DB
  34164: { zone: 4075, name: "Kalecgos" }, // Dragonscale-Encrusted Longblade
  34165: { zone: 4075, name: "Kalecgos" }, // Fang of Kalecgos
  34166: { zone: 4075, name: "Kalecgos" }, // Band of Lucent Beams
  34167: { zone: 4075, name: "Kalecgos" }, // Legplates of the Holy Juggernaut
  34168: { zone: 4075, name: "Kalecgos" }, // Starstalker Legguards
  34169: { zone: 4075, name: "Kalecgos" }, // Breeches of Natural Aggression
  34170: { zone: 4075, name: "Kalecgos" }, // Pantaloons of Calming Strife

  // ── SUNWELL PLATEAU — M'uru ──────────────────────────────────────────
  // Listed as "Zone Drop" with no boss name in DB
  34427: { zone: 4075, name: "M'uru" }, // Blackened Naaru Sliver
  34428: { zone: 4075, name: "M'uru" }, // Steely Naaru Sliver
  34429: { zone: 4075, name: "M'uru" }, // Shifting Naaru Sliver
  34430: { zone: 4075, name: "M'uru" }, // Glimmering Naaru Sliver
  35282: { zone: 4075, name: "M'uru" }, // Sin'dorei Band of Dominance
  35283: { zone: 4075, name: "M'uru" }, // Sin'dorei Band of Salvation
  35284: { zone: 4075, name: "M'uru" }, // Sin'dorei Band of Triumph

  // ── SUNWELL PLATEAU — Eredar Twins ───────────────────────────────────
  // Listed as "Zone Drop" with no boss name in DB
  35290: { zone: 4075, name: "Eredar Twins" }, // Sin'dorei Pendant of Conquest
  35291: { zone: 4075, name: "Eredar Twins" }, // Sin'dorei Pendant of Salvation
  35292: { zone: 4075, name: "Eredar Twins" }, // Sin'dorei Pendant of Triumph
};

// Boss names in wow-classic-items that need renaming to the correct encounter name.
// Key: "zoneId:dbBossName" → corrected boss name.
const BOSS_RENAME_MAP = {
  '3457:Echo of Medivh': 'Chess Event',
  '3457:Phantom Attendant': 'Trash Drops',
  '3457:Phantom Valet': 'Trash Drops',
  // Opera Event — one of three encounters is randomly selected each week
  '3457:The Big Bad Wolf': 'Opera Event',
  '3457:The Crone': 'Opera Event',
  '3457:Julianne': 'Opera Event',
  // Rare Spawn — one of three spawns randomly per lockout
  '3457:Hyakiss the Lurker': 'Rare Spawn',
  '3457:Rokad the Ravager': 'Rare Spawn',
  '3457:Shadikith the Glider': 'Rare Spawn',
  '3959:Essence of Anger': 'Reliquary of Souls',
  '3959:High Nethermancer Zerevor': 'The Illidari Council',
  '3959:Ashtongue Channeler': 'Shade of Akama',
};

function isTierToken(item) {
  return item.name && TIER_TOKEN_RE.test(item.name) &&
    item.quality === 'Epic' && item.class === 'Miscellaneous';
}

// Label for the pseudo-boss used for zone/trash drops
const TRASH_BOSS_NAME = 'Trash Drops';

// ── Pre-processing: apply boss source overrides before filtering ────────────
// This fixes items with wrong zone, wrong boss name, or "Rare Drop" with no zone.
for (const item of items) {
  if (EXCLUDE_ITEMS.has(item.itemId)) continue;

  const override = BOSS_SOURCE_OVERRIDES[item.itemId];
  if (override) {
    if (!item.source) item.source = {};
    item.source.zone = override.zone;
    item.source.name = override.name;
    item.source.category = 'Boss Drop';
  }
  if (!item.source) continue;
}

// Filter for reservable items: boss drops from TBC raids, epic+ quality, equippable
const raidItems = items.filter(i => {
  if (!i.source) return false;
  if (EXCLUDE_ITEMS.has(i.itemId)) return false;
  if (i.quality !== 'Epic' && i.quality !== 'Legendary') return false;
  if (!zoneIdSet.has(i.source.zone)) return false;

  // Tier tokens — allow any source category since some have "Rare Drop" / "Zone Drop"
  if (isTierToken(i)) {
    const override = TIER_TOKEN_SOURCE_OVERRIDES[i.itemId];
    if (override) {
      i.source.zone = override.zone;
      i.source.name = override.name;
      i.source.category = 'Boss Drop';
    }
    return !!i.source.name;
  }

  // Boss drops — equippable gear, weapons, bags, mounts, recipes
  if (i.source.category === 'Boss Drop') {
    if (EQUIP_SLOTS.has(i.slot) || i.class === 'Weapon') return true;
    if (i.slot === 'Bag' && i.class === 'Container') return true;
    if (i.subclass === 'Mount') return true;
    if (i.class === 'Recipe') return true;
    return false;
  }

  // Zone drops (trash) — equippable gear, weapons, and recipes
  if (i.source.category === 'Zone Drop') {
    // Assign to "Trash Drops" pseudo-boss
    i.source.name = TRASH_BOSS_NAME;
    if (EQUIP_SLOTS.has(i.slot) || i.class === 'Weapon') return true;
    if (i.class === 'Recipe') return true;
    return false;
  }

  return false;
});

// Build structured output grouped by raid -> boss -> items
const output = {
  generatedAt: new Date().toISOString(),
  raids: []
};

for (const raid of TBC_RAIDS) {
  const raidEntry = {
    zoneId: raid.zoneId,
    name: raid.name,
    phase: raid.phase,
    size: raid.size,
    bosses: []
  };

  const zoneItems = raidItems.filter(i => i.source.zone === raid.zoneId);

  // Group by boss name, applying BOSS_RENAME_MAP for corrected encounter names
  const bossByName = {};
  for (const item of zoneItems) {
    const rawName = item.source.name;
    const renameKey = `${raid.zoneId}:${rawName}`;
    const bossName = BOSS_RENAME_MAP[renameKey] || rawName;
    if (!bossByName[bossName]) {
      bossByName[bossName] = [];
    }
    bossByName[bossName].push({
      itemId: item.itemId,
      name: item.name,
      icon: item.icon,
      quality: item.quality,
      itemLevel: item.itemLevel,
      slot: isTierToken(item) ? 'Tier Token' : (item.class === 'Recipe' ? 'Recipe' : item.slot),
      class: item.class,
      subclass: item.subclass || null,
      dropChance: item.source.dropChance || null,
      tooltip: (item.tooltip || []).filter(t =>
        // Strip "Sell Price:", "Dropped by:", "Drop Chance:" lines — we show those separately
        // Strip feral AP line — derived stat from wow-classic-items, not on actual item tooltip
        t.label && !t.label.startsWith('Sell Price:') && !t.label.startsWith('Dropped by:')
        && !t.label.startsWith('Drop Chance:')
        && !/attack power.+in Cat, Bear/i.test(t.label)
      )
    });
  }

  // Sort items within each boss by slot then name
  for (const [bossName, bossItems] of Object.entries(bossByName)) {
    bossItems.sort((a, b) => a.slot.localeCompare(b.slot) || a.name.localeCompare(b.name));
    raidEntry.bosses.push({
      name: bossName,
      items: bossItems
    });
  }

  // Sort bosses alphabetically
  raidEntry.bosses.sort((a, b) => a.name.localeCompare(b.name));

  output.raids.push(raidEntry);
}

// Write output
const outPath = path.join(__dirname, '..', 'data', 'tbc-raid-loot.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

// Summary
let totalItems = 0;
for (const raid of output.raids) {
  let raidTotal = 0;
  for (const boss of raid.bosses) {
    raidTotal += boss.items.length;
  }
  totalItems += raidTotal;
  console.log(`${raid.name}: ${raidTotal} items across ${raid.bosses.length} bosses`);
}
console.log(`\nTotal: ${totalItems} items written to ${outPath}`);
