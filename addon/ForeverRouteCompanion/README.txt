Forever Route Companion 1.0

The in-game execution and telemetry layer for Forever Route Planner.

Install:
1. Unzip ForeverRouteCompanion into World of Warcraft/_classic_era_/Interface/AddOns/.
2. Restart or reload the game. Enable "Load out of date AddOns" if the Forever client reports a newer interface build.
3. Run /wfrp to open the dashboard.

What it tracks:
- Character level, XP, rested XP, talents, gear, professions, bags, durability, money, hearth, position, and known flight paths.
- Known dungeon entry/exit, elapsed time, total/combat/quest XP, bosses, loot, completed quests, deaths, and party snapshot.
- Route readiness for dungeon quests and lightweight party readiness from other WFRP users.
- Up to 50 recent runs in SavedVariables. Nothing is uploaded automatically.

Commands:
/wfrp                        Opens the Forever Intelligence dashboard.
/wfrp export                 Opens a copyable character and run telemetry string.
/wfrp import <planner text>  Saves a route exported by the web planner.
/wfrp next                   Shows the next saved dungeon stop.
/wfrp start [dungeon-id]     Manually starts a run recorder.
/wfrp stop                   Stops and saves the current run.
/wfrp share                  Shares readiness with current party addon users.
/wfrp reset runs             Clears local run history.

Sync:
- Export WFRP2 telemetry from the addon's Sync view and import it at:
  https://wow-forever-route-planner.pages.dev/my-gear/
- Export a planned route from the website and import it in game.

Privacy:
The addon reads local character APIs and stores data only in SavedVariables. Party state uses the in-game addon channel. Nothing is uploaded unless you explicitly copy an export into the website.
