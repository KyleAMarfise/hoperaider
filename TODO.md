# Hope Raid Tracker — Feature Backlog

## Loot System Selection (Raid Creation)

When creating a raid, admins should be able to choose a loot distribution method.

**Option A — Internal SR (current system)**
Use the website's built-in Soft Reserve system. Best for full guild runs where
the roster is known and stable. No external link needed.

**Option B — External SR Link**
Require the raid creator to paste an external SR link (e.g. softres.it) at raid
creation time. The link is displayed to signed-up members. Useful for pug-heavy
weeks where external players are bothered by internal-only tooling.

**Option C — TBD (future)**
Placeholder for a potential HR (Halcyon Reserve) or hybrid loot system.
Discuss format and rules before implementing.

**Trigger condition for full internal SR adoption:**
- ≥ 90% of the raid team signing up through the website
- Only 1–3 new players needing onboarding per week
- Consistent weekly raid schedule
- Estimated timeline: ~3 months out (Black Temple progression)

---

## SR Quality-of-Life Improvements (Post-Stable Roster)

- **SR Rollover** — carry forward a character's SR list to the next week if the
  same raid is scheduled and the item has not yet dropped
- **Hold SR until item drops** — lock a reserve in place across resets until the
  character receives the item
- **Copy previous raid setup** — duplicate an existing raid (roster, SR settings,
  boss list) as the starting point for next week's raid creation

---

## WoW Addon Integration

Philfestive is building a guild tracking addon (ETA ~2–3 weeks). The website
will need import/export support to connect with it.

### Addon tracks:
- Raid attendance
- Consumable usage during fights
- Preparedness metrics (who showed up ready)

### Website → Addon (Import by addon)
Define a structured export format the addon can pull from the website:
- Raid roster (assigned characters + roles)
- Soft reserves per character
- Raid assignments (bench/accept status)
- Player roles (tank/healer/dps) and specs

### Addon → Website (Export to website)
Define an import format the website can ingest from addon data:
- Raid attendance (who was present)
- Consumable usage per player
- Performance / preparation metrics
- Cross-reference with existing attendance dock system

### Open questions before implementing:
- What file format does the addon export? (CSV, JSON, custom?)
- Should import be a file upload or in-page paste?
- Which website fields map to which addon fields?
- How does addon data interact with the existing attendance dock counter?
