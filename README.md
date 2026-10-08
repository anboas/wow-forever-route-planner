# Forever Route Planner

Public, responsive WoW Forever dungeon companion for planning quest-driven leveling routes.

## Features

- Complete current 34-dungeon catalog with 1,600+ indexed loot entries.
- Current WoW Forever dungeon-quest XP, pickup levels, faction gates, class gates, and prerequisite routes where source data exists. Quest rewards come from the live WOWF.IO dataset after Forever's October 1 XP balance pass; only level thresholds use the Classic 1–60 curve.
- Sequential route simulation with sourced Forever quest rewards and player-observed clear XP.
- Three explainable route strategies: fastest leveling, maximum quest completion, and balanced XP/travel/loot planning. The planner compares candidates before changing the route.
- Compact collapsed route stops, a sticky mobile command dock, and per-quest Auto, Already have, Complete, or Skip state.
- Explicit world XP, observed XP-per-clear, repeat-run, rested-XP, travel-time, and hearth inputs so the planner never presents inferred Forever combat values as source facts.
- Actual-result repair: enter the level and XP reached after a stop to mark its ready quests complete and rebuild the remaining route automatically.
- Full WOWF.IO corpus ingestion: 413 indexed English pages, 271 normalized quest-chain records with resolved pickup/turn-in coordinates, 35 class/spec leveling guides, and 26 zone/instance records.
- Class/spec guide matches and sourced world coordinates feed optimizer scoring and travel estimates while retaining visible provenance and review state.
- Downloadable `ForeverRouteCompanion` 1.1 intelligence suite with a compact live HUD, event timeline, post-run review, and dashboards for the current run, character, history, party, and sync.
- Automatic local dungeon telemetry for total/combat/quest XP, time, bosses, loot, quests, deaths, rested state, and party composition, plus personal XP/hour and dungeon baselines on the website.
- Private login-based character workspaces with owner-managed accounts, player and read-only roles, separate character state, automatic legacy-browser migration, and a sanitized shared-party presence dashboard.
- Permanent private run URLs under `/runs/<id>/` with XP sources, boss progress, event timeline, loot, party composition, review state, breadcrumbs, and native browser history.
- Armory-ready character identity fields are reserved in the account model so WoW Forever profiles can be linked without migrating user-owned state when an official source becomes available.
- Two-way exchange: import character level/XP, faction, class/spec, active/completed dungeon quests, gear, hearth, flight paths, professions, readiness, party, and run history; export the planned route and wishlist back to the game.
- Searchable dungeon, quest, and uncapped loot libraries with explicit detailed/partial beta coverage states.
- Class, specialization, role, usable/recommended, source, slot, rarity, level, and wishlist filters with transparent rules-based fit icons.
- Dungeon-to-boss loot browsing with a specific-boss filter, explicit Boss, Quest reward, Mob, Trash, and Unknown source labels, and remembered collapsible groups.
- WoW-style item and quest cards positioned by the pointer, keyboard focus support, persistent quest trays, hoverable reward items, and direct WoW Forever item/quest links.
- Faction-aware quest and reward archives that omit opposing-faction records entirely.
- Wishlist, equipped-slot comparisons, party-interest profiles, normalized drop chances, and estimated runs for 50%, 75%, and 90% acquisition confidence.
- Every top-level workspace and all 34 dungeons have directly loadable static HTML URLs with page metadata, breadcrumbs, native browser history, and a generated sitemap. Navigation performs normal document loads rather than client-side view swapping.
- Per-dungeon pages expose every associated quest, drop, boss/source record, prerequisite checklist, source-ordered encounter index, high-quality 1002×668 Blizzard client floor art for every supported classic floor, and combined official-client/route-schematic views for the four published Forever dungeons.
- The map is the primary responsive canvas on dungeon pages and includes wheel/button zoom, drag-to-pan, reset, fullscreen, floor switching, sourced pins, and a full-resolution asset link.
- Named route presets, shareable planner/filter URLs, source freshness labels, deep source links, and prefilled data-report links.
- Compact responsive workspace with persistent planner, filters, gear, wishlist, party, preset, and collapsed-group state in local storage.

The starter route is Horde level 13: Ragefire Chasm → Ruins of Lordaeron → Shadowfang Keep.

## Data provenance

- [WOWF.IO](https://wowf.io/sitemap.xml): complete published English quest, zone, leveling-guide, dungeon, and beta-client compilation. Every retained context record carries source URL, source update time, retrieval time, and review state.
- [wowtbc.gg](https://wowtbc.gg/warcraftforever/loot-tables/dungeons/): full dungeon and loot catalog cross-check.
- [Warcraft Tavern](https://www.warcrafttavern.com/forever/guides/dungeons/): dungeon ranges, locations, and the quest-centered XP model.
- [WOWF.IO dungeon and quest pages](https://wowf.io/en/dungeons): Forever-native item anchors, quest pages, zone links, and item icon delivery.
- [NaowhForever quest chains](https://github.com/nwh-gaming-ab/NaowhForever): explicit prerequisites, quest giver coordinates, and Forever quest metadata.
- [WoW Forever client build 1.60.1.70170](https://wago.tools/api/builds): Blizzard client floor art and official minimap tiles decoded from CASC into checked-in high-quality WebP assets.
- [wowdev community listfile](https://github.com/wowdev/wow-listfile/releases/tag/202610061349): file-data IDs used to resolve the exact client assets reproducibly.
- [AtlasLootClassic Maps](https://github.com/Hoizame/AtlasLootClassic_Maps): GPL-2.0 fallback only where the Forever client has no native floor art, currently Zul'Farrak.
- [NaowhForever dungeon map pins](https://github.com/nwh-gaming-ab/NaowhForever/blob/main/NaowhForever_DungeonJournal/Data/Maps.lua): factual entrance, floor, boss-order, and normalized pin coordinates for Hall of Thanes, Ruins of Lordaeron, Excavation Site: Wetlands, and City of Dalaran. The app generates its own not-to-scale SVG route schematics and does not copy the addon's all-rights-reserved map artwork.
- [WOWF.IO October 1 beta update](https://wowf.io/en/news/beta-update-oct-1): Forever dungeon-quest XP policy. The update halved only the extra XP above normal quest values, so current WOWF.IO rewards remain Forever values rather than original Classic rewards.
- [Warcraft Wiki](https://warcraft.wiki.gg/wiki/Experience_to_level): Classic XP curve reference.

Run `npm run sync:all` to rebuild every checked-in integration. `sync:design` generates the website CSS variables and addon Lua theme from `design/design-tokens.json`; `sync:context` atomically normalizes the WOWF.IO sitemap corpus; `sync:data` merges dungeon/loot sources with quest chains, class/spec guide recommendations, world positions, and the explicit Forever XP policy; `sync:maps` resolves and rebuilds official client floor art, official Forever overheads, the one licensed fallback, and original coordinate-derived route schematics; `sync:addon` regenerates the addon quest catalog and downloadable ZIP. Validation fails closed before a generated snapshot replaces the prior version. Beta values can change; unverified quest XP remains excluded from route totals.

The scheduled `Refresh source-backed data` GitHub Actions workflow runs the same pipeline daily, validates every non-browser data/planner contract plus the Cloudflare production build, publishes a health summary, and opens a review pull request only when checked source artifacts changed. Production is never mutated directly by the refresh job.

## Companion addon

1. Download `ForeverRouteCompanion.zip` from the live **My Gear** workspace or the site footer.
2. Extract `ForeverRouteCompanion` into `World of Warcraft/_classic_era_/Interface/AddOns/`.
3. Run `/wfrp` for the in-game **Now / Character / Runs / Group / Sync** dashboard. Known dungeon runs start and stop automatically.
4. Use **Sync → Export telemetry** or `/wfrp export`, then paste the WFRP2 string into **My Gear → Companion exchange**.
5. Use **Copy route for addon**, then run `/wfrp import <planner text>` in game. `/wfrp next` reports the next planned dungeon.

The addon retains the latest 50 runs in SavedVariables and uses the in-game addon channel for lightweight party readiness. It uses local game APIs only and never uploads data automatically. Its source is checked in under `addon/ForeverRouteCompanion/`. The addon and website share one generated visual contract for palette, semantic states, control geometry, metric cards, navigation, and HUD proportions so the in-game and web experiences cannot silently drift apart.

## Accounts and characters

Cloudflare production requires authentication. The existing Defense Budget Intelligence owner account is migrated from the shared D1 account store without exposing or resetting its password. Open registration creates normal Player accounts with private character workspaces; registration is same-origin, client-rate-limited, and bounded. The owner can also create administrator, player, and viewer accounts; administrator-issued temporary passwords must be replaced on first sign-in, and viewer writes are rejected at the API boundary. Each user can track up to 20 private characters. Only a compact active-character presence record is shared with other authenticated group members.

The browser derives the password proof with PBKDF2 before sending it, sessions use secure `HttpOnly` and `SameSite=Strict` cookies, writes require same-origin requests, and repeated failed sign-ins are rate-limited. No character or party endpoint is available anonymously.

## Development

```bash
npm install
npm run verify
npm run dev
```

`npm run build` emits separate documents for `/route/`, `/dungeons/`, every `/dungeons/<slug>/`, `/quests/`, `/loot/`, `/gear/`, the authenticated run shell, and `/404.html`. Cloudflare rewrites `/runs/<id>/` to that shell while preserving the permanent run URL. Use `npm run serve` when validating direct route loads; Vite's development server is intended only for component iteration.

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
