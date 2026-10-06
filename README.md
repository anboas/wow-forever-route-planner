# Forever Route Planner

Public, responsive WoW Forever dungeon companion for planning quest-driven leveling routes.

## Features

- Complete current 34-dungeon catalog with 1,600+ indexed loot entries.
- Verified Forever dungeon quest XP, pickup levels, faction gates, class gates, and prerequisite-chain warnings where source data exists.
- Sequential route simulation against the Classic 1–60 XP curve.
- Three explainable route strategies: fastest leveling, maximum quest completion, and balanced XP/travel/loot planning. The planner compares candidates before changing the route.
- Compact collapsed route stops, a sticky mobile command dock, and per-quest Auto, Already have, Complete, or Skip state.
- Explicit world XP, observed XP-per-clear, repeat-run, rested-XP, travel-time, and hearth inputs so the planner never presents inferred Forever combat values as source facts.
- Actual-result repair: enter the level and XP reached after a stop to mark its ready quests complete and rebuild the remaining route automatically.
- Searchable dungeon, quest, and uncapped loot libraries with explicit detailed/partial beta coverage states.
- Class, specialization, role, usable/recommended, source, slot, rarity, level, and wishlist filters with transparent rules-based fit icons.
- Dungeon-to-boss loot browsing with explicit Boss, Quest reward, Mob, Trash, and Unknown source labels and remembered collapsible groups.
- WoW/Wowhead-inspired item and quest cards positioned by the pointer, keyboard focus support, persistent quest trays, hoverable reward items, and direct Wowhead item/search links.
- Faction-aware quest and reward archives that omit opposing-faction records entirely.
- Wishlist, equipped-slot comparisons, party-interest profiles, normalized drop chances, and estimated runs for 50%, 75%, and 90% acquisition confidence.
- Per-dungeon drill-downs expose every associated quest, drop, boss/source record, prerequisite checklist, source-ordered encounter index, and 25 source-licensed Classic instance maps.
- Named route presets, shareable planner/filter URLs, source freshness labels, deep source links, and prefilled data-report links.
- Compact responsive workspace with persistent planner, filters, gear, wishlist, party, preset, and collapsed-group state in local storage.

The starter route is Horde level 13: Ragefire Chasm → Ruins of Lordaeron → Shadowfang Keep.

## Data provenance

- [WOWF.IO](https://wowf.io/en/dungeons): detailed beta-client quest and loot compilation.
- [wowtbc.gg](https://wowtbc.gg/warcraftforever/loot-tables/dungeons/): full dungeon and loot catalog cross-check.
- [Warcraft Tavern](https://www.warcrafttavern.com/forever/guides/dungeons/): dungeon ranges, locations, and the quest-centered XP model.
- [Wowhead Classic](https://www.wowhead.com/classic): stable public item deep links/search targets and Blizzard-style icon delivery.
- [AtlasLootClassic Maps](https://github.com/Hoizame/AtlasLootClassic_Maps): GPL-2.0 Classic instance maps converted from BLP to checked-in PNG assets.
- [Warcraft Wiki](https://warcraft.wiki.gg/wiki/Experience_to_level): Classic XP curve reference.

Run `npm run sync:all` to rebuild the checked-in data snapshot and map assets. `sync:data` preserves item IDs, icons, stats, source bosses, and quest metadata from the upstream sources; `sync:maps` deterministically rebuilds the licensed PNG map set. Beta values can change; unverified quest XP is excluded from route totals.

## Development

```bash
npm install
npm run verify
npm run dev
```

## Container

```bash
npm run container:up
npm run container:verify
npm run container:down
```

The hardened read-only container listens on `http://127.0.0.1:8091` by default.

## Deployment

```bash
npm run pages:deploy
npm run verify:prod-smoke
```

Current public release: <https://wow-forever-route-planner.pages.dev/>

GitHub Pages mirror: <https://anboas.github.io/wow-forever-route-planner/>

This is an unofficial fan-made planning tool and is not affiliated with Blizzard Entertainment.
