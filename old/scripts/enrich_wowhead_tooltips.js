/**
 * Enrich tbc-raid-loot.json with accurate tooltip HTML scraped from Wowhead.
 *
 * Fetches the TBC Classic tooltip for every item from Wowhead's tooltip API
 * and stores the cleaned HTML as `wowheadTooltip` alongside the existing data.
 *
 * Run:  node scripts/enrich_wowhead_tooltips.js
 *
 * Rate limited to ~7 req/s to be polite. 681 items ≈ 100 seconds.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_PATH = path.join(__dirname, '..', 'data', 'tbc-raid-loot.json');
const DELAY_MS = 150; // milliseconds between requests

/**
 * Fetch tooltip JSON from Wowhead's TBC Classic tooltip API.
 * Returns { name, quality, icon, tooltip (HTML string) }
 */
function fetchTooltip(itemId) {
  return new Promise((resolve, reject) => {
    const url = `https://nether.wowhead.com/tooltip/item/${itemId}?dataEnv=5&locale=0`;
    https.get(url, { headers: { 'User-Agent': 'HopeRaidTracker/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (!parsed.tooltip) reject(new Error('No tooltip in response'));
          else resolve(parsed);
        } catch (e) {
          reject(new Error(`JSON parse error for item ${itemId}: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Clean the raw Wowhead tooltip HTML for local storage:
 * - Strip HTML comments (Wowhead markers)
 * - Remove "Sell Price" div
 * - Convert spell <a> links to plain text (we have our own Wowhead link)
 */
function cleanTooltipHtml(html) {
  let clean = html;
  // Remove HTML comments
  clean = clean.replace(/<!--.*?-->/gs, '');
  // Remove sell price div
  clean = clean.replace(/<div class="whtt-sellprice">.*?<\/div>/gs, '');
  // Strip <a> tags but keep inner text
  clean = clean.replace(/<a[^>]*>(.*?)<\/a>/gs, '$1');
  // Collapse excess whitespace between tags
  clean = clean.replace(/>\s+</g, '><');
  return clean.trim();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

  // Collect all items (references — mutations update data in place)
  const allItems = [];
  for (const raid of data.raids) {
    for (const boss of raid.bosses) {
      for (const item of boss.items) {
        allItems.push(item);
      }
    }
  }

  console.log(`Fetching Wowhead tooltips for ${allItems.length} items...`);
  console.log(`Estimated time: ~${Math.ceil(allItems.length * DELAY_MS / 1000)}s\n`);

  let success = 0;
  let failed = 0;
  const failures = [];

  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];
    try {
      const resp = await fetchTooltip(item.itemId);
      item.wowheadTooltip = cleanTooltipHtml(resp.tooltip);
      success++;
    } catch (e) {
      console.warn(`  ⚠ Item ${item.itemId} (${item.name}): ${e.message}`);
      failures.push({ itemId: item.itemId, name: item.name, error: e.message });
      failed++;
    }

    // Progress every 50 items and at the end
    if ((i + 1) % 50 === 0 || i === allItems.length - 1) {
      process.stdout.write(`\r  ${i + 1}/${allItems.length} fetched (${success} ok, ${failed} failed)`);
    }

    if (i < allItems.length - 1) await sleep(DELAY_MS);
  }

  console.log('\n');

  // Strip old tooltip array from items that now have wowheadTooltip
  let stripped = 0;
  for (const item of allItems) {
    if (item.wowheadTooltip && item.tooltip) {
      delete item.tooltip;
      stripped++;
    }
  }
  if (stripped) console.log(`Stripped old tooltip array from ${stripped} items (kept for ${allItems.length - stripped} fallback).`);

  // Write back
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  console.log(`Done! ${success} items enriched, ${failed} failures.`);
  console.log(`Updated: ${DATA_PATH}`);

  if (failures.length) {
    console.log('\nFailed items:');
    for (const f of failures) {
      console.log(`  - ${f.itemId} ${f.name}: ${f.error}`);
    }
  }
}

main().catch(console.error);
