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
const TIER_TOKEN_RE = /^(Chestguard|Gloves|Helm|Leggings|Pauldrons) of the (Fallen|Vanquished|Forgotten) /;

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
};

function isTierToken(item) {
  return item.name && TIER_TOKEN_RE.test(item.name) &&
    item.quality === 'Epic' && item.class === 'Miscellaneous';
}

// Filter for reservable items: boss drops from TBC raids, epic+ quality, equippable
const raidItems = items.filter(i => {
  if (!i.source) return false;
  if (i.quality !== 'Epic' && i.quality !== 'Legendary') return false;

  // Tier tokens — allow any source category since some have "Rare Drop" / "Zone Drop"
  if (isTierToken(i)) {
    const override = TIER_TOKEN_SOURCE_OVERRIDES[i.itemId];
    if (override) {
      i.source.zone = override.zone;
      i.source.name = override.name;
      i.source.category = 'Boss Drop';
    }
    return zoneIdSet.has(i.source.zone) && i.source.name;
  }

  // Standard equippable gear — must be a boss drop from a TBC raid zone
  if (i.source.category !== 'Boss Drop') return false;
  if (!zoneIdSet.has(i.source.zone)) return false;
  if (EQUIP_SLOTS.has(i.slot) || i.class === 'Weapon') return true;

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

  // Group by boss name
  const bossByName = {};
  for (const item of zoneItems) {
    const bossName = item.source.name;
    if (!bossByName[bossName]) {
      bossByName[bossName] = [];
    }
    bossByName[bossName].push({
      itemId: item.itemId,
      name: item.name,
      icon: item.icon,
      quality: item.quality,
      itemLevel: item.itemLevel,
      slot: isTierToken(item) ? 'Tier Token' : item.slot,
      class: item.class,
      subclass: item.subclass || null,
      dropChance: item.source.dropChance || null,
      tooltip: (item.tooltip || []).filter(t =>
        // Strip "Sell Price:" and "Dropped by:" lines — we show those separately
        t.label && !t.label.startsWith('Sell Price:') && !t.label.startsWith('Dropped by:')
        && !t.label.startsWith('Drop Chance:')
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
