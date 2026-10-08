Forever Route Companion 1.1.4

The in-game execution and telemetry layer for Forever Route Planner.

Install:
1. Unzip ForeverRouteCompanion into World of Warcraft/_classic_era_/Interface/AddOns/.
2. Restart or reload the game. The package targets WoW Forever interface 16001.
3. Run /wfrp to open the dashboard.

What it tracks:
- Character level, XP, rested XP, talents, gear, professions, bags, durability, money, hearth, position, and known flight paths.
- Known dungeon entry/exit, event timeline, elapsed time, total/combat/quest XP, XP/hour, expected boss progress, loot, wishlist drops, completed quests, deaths, and party snapshot.
- Post-run review with complete/partial status, keep, mark partial, or discard actions.
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
  https://wow-forever-route-planner.pages.dev/gear/
- Export a planned route from the website and import it in game.

Privacy:
The addon reads local character APIs and stores data only in SavedVariables. Party state uses the in-game addon channel. Nothing is uploaded unless you explicitly copy an export into the website.
