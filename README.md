# Forever Route Planner

Public, responsive WoW Forever dungeon companion for planning quest-driven leveling routes.

## Features

- Complete current 34-dungeon catalog with 1,600+ indexed loot entries.
- Verified Forever dungeon quest XP, pickup levels, faction gates, class gates, and prerequisite-chain warnings where source data exists.
- Sequential route simulation against the Classic 1–60 XP curve.
- Manual combat/travel XP per stop so the planner never invents unverified per-run XP.
- Searchable dungeon and loot libraries with explicit detailed/partial beta coverage states.
- Persistent planner state in local storage.

The starter route is Horde level 13: Ragefire Chasm → Ruins of Lordaeron → Shadowfang Keep.

## Data provenance

- [WOWF.IO](https://wowf.io/en/dungeons): detailed beta-client quest and loot compilation.
- [wowtbc.gg](https://wowtbc.gg/warcraftforever/loot-tables/dungeons/): full dungeon and loot catalog cross-check.
- [Warcraft Tavern](https://www.warcrafttavern.com/forever/guides/dungeons/): dungeon ranges, locations, and the quest-centered XP model.
- [Warcraft Wiki](https://warcraft.wiki.gg/wiki/Experience_to_level): Classic XP curve reference.

Run `npm run sync:data` to rebuild the checked-in snapshot. Beta values can change; unverified quest XP is excluded from route totals.

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

Production: <https://wow-forever-route-planner.pages.dev/>

This is an unofficial fan-made planning tool and is not affiliated with Blizzard Entertainment.
