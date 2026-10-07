import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";

const snapshot = JSON.parse(await readFile(new URL("../src/data/wow-forever.json", import.meta.url), "utf8"));
const questChains = JSON.parse(await readFile(new URL("../src/data/forever-quest-chains.json", import.meta.url), "utf8"));
assert.equal(snapshot.schemaVersion, 4);
assert.equal(snapshot.xpPolicy.questRewardModel, "wow-forever-current", "quest XP must use current Forever values");
assert.equal(snapshot.xpPolicy.levelCurveModel, "classic-1-60", "level thresholds remain the Classic 1–60 curve");
assert.equal(snapshot.xpPolicy.combatXpModel, "player-observed", "unsourced clear XP must not be invented");
assert.match(snapshot.xpPolicy.sourceUrl, /^https:\/\/wowf\.io\/en\/news\//, "XP policy needs a Forever source");
assert.ok(snapshot.context.inventory.totalEnglishPages >= 400, "expected full WOWF.IO corpus metadata");
assert.ok(snapshot.context.dataHealth.quests >= 100, "expected normalized quest-chain coverage");
assert.equal(snapshot.dungeons.length, 34, "expected the complete current 34-dungeon catalog");
assert.ok(questChains.quests.length >= 440, "expected the full Forever quest-chain index");
assert.ok(questChains.health.prerequisiteQuests >= 130, "expected explicit prerequisite relationships");
assert.ok(questChains.health.locatedQuests >= 330, "expected located quest givers");
assert.ok(snapshot.dungeons.flatMap((dungeon) => dungeon.quests).filter((quest) => quest.prerequisiteSteps?.length).length >= 25, "expected prerequisite routes merged into dungeon quests");
assert.ok(snapshot.dungeons.reduce((sum, dungeon) => sum + dungeon.loot.length, 0) >= 1600, "expected comprehensive loot coverage");
assert.ok(snapshot.dungeons.reduce((sum, dungeon) => sum + dungeon.quests.length, 0) >= 150, "expected quest and reward-group coverage");
const loot = snapshot.dungeons.flatMap((dungeon) => dungeon.loot);
assert.equal(loot.filter((item) => item.icon).length, loot.length, "every loot record should carry an icon slug");

const maps = JSON.parse(await readFile(new URL("../src/data/dungeon-maps.json", import.meta.url), "utf8"));
assert.ok(Object.keys(maps).length >= 29, "expected Classic maps plus sourced Forever route schematics");
for (const [dungeonId, map] of Object.entries(maps)) {
  assert.ok(["client-map", "hybrid-map", "fallback-map"].includes(map.kind), `${dungeonId} needs an explicit map kind`);
  assert.ok(map.floors.length >= 1, `${dungeonId} needs at least one map view`);
  if (map.kind === "fallback-map") {
    assert.equal(map.license, "GPL-2.0");
    assert.ok(map.sourceUrl.startsWith("https://github.com/Hoizame/AtlasLootClassic_Maps/"));
    assert.match(map.quality, /fallback/i, `${dungeonId} should disclose fallback quality`);
  } else if (map.kind === "client-map") {
    assert.match(map.source, /WoW Forever client/);
    assert.equal(map.sourceUrl, "https://wago.tools/api/builds", `${dungeonId} should link the live Forever client build index`);
    assert.match(map.quality, /1002×668/);
    assert.ok(map.floors.every((floor) => floor.kind === "client-map" && Array.isArray(floor.pins)));
  } else if (map.kind === "hybrid-map") {
    assert.ok(map.sourceUrl.startsWith("https://github.com/nwh-gaming-ab/NaowhForever/"));
    assert.equal(map.clientSourceUrl, "https://wago.tools/api/builds", `${dungeonId} should link the live Forever client build index`);
    assert.match(map.attribution, /no third-party map artwork copied/i);
    assert.ok(map.floors.some((floor) => floor.kind === "route-schematic"));
    assert.ok(map.floors.some((floor) => ["client-map", "client-overhead"].includes(floor.kind)));
  }
  for (const floor of map.floors) {
    assert.ok(floor.name && floor.src && floor.quality);
    await access(new URL(`../public/${floor.src}`, import.meta.url));
  }
}
assert.ok(Object.values(maps).flatMap((map) => map.floors).filter((floor) => floor.kind === "client-map").length >= 50, "expected multi-floor official client map coverage");
for (const dungeonId of ["hall-of-thanes", "ruins-of-lordaeron", "excavation-site", "dalaran"]) assert.equal(maps[dungeonId].kind, "hybrid-map", `expected official client plus route views for ${dungeonId}`);
assert.equal(maps.dalaran.floors.length, 3, "City of Dalaran should expose two route floors plus an official client overhead");
assert.equal(maps["zul-farrak"].kind, "fallback-map", "Zul'Farrak should disclose its Atlas fallback because the client has no native floor art");
for (const dungeonId of ["the-drowned-city", "krol-dok-stronghold", "alcaz-prison", "blackmaw-hold", "shaper-s-terrace"]) assert.equal(maps[dungeonId], undefined, `${dungeonId} should remain pending until interior coordinates are public`);

for (const dungeon of snapshot.dungeons) {
  assert.ok(dungeon.id && dungeon.name);
  assert.equal(dungeon.level.length, 2);
  assert.ok(dungeon.level[0] <= dungeon.level[1]);
  assert.ok(Array.isArray(dungeon.loot));
  assert.ok(Array.isArray(dungeon.quests));
  assert.ok(Array.isArray(dungeon.guideRecommendations));
  assert.ok(dungeon.lootSourceUrl.startsWith("https://"));
}

assert.ok(snapshot.dungeons.some((dungeon) => dungeon.world?.atlasPoints?.length), "expected sourced world-position data for Forever locations");
assert.ok(snapshot.dungeons.some((dungeon) => dungeon.quests.some((quest) => quest.dataStatus === "source-only")), "expected newly linked full-corpus quests");
assert.ok(snapshot.dungeons.some((dungeon) => dungeon.guideRecommendations.length), "expected class/spec leveling-guide recommendations");

const routeNames = ["Ragefire Chasm", "Ruins of Lordaeron", "Shadowfang Keep"];
for (const name of routeNames) {
  const dungeon = snapshot.dungeons.find((entry) => entry.name === name);
  assert.ok(dungeon, `missing ${name}`);
  assert.ok(dungeon.quests.some((quest) => Number.isFinite(quest.xp)), `${name} needs verified quest XP`);
}
const ragefire = snapshot.dungeons.find((entry) => entry.id === "ragefire-chasm");
assert.deepEqual(Object.fromEntries(ragefire.quests.filter((quest) => Number.isFinite(quest.xp)).map((quest) => [String(quest.id), quest.xp])), {
  5723: 1050,
  5728: 1150,
  5722: 880,
  5761: 1150,
  5725: 1450,
}, "Ragefire quest rewards should match the current post-balance Forever values, not original Classic rewards");
assert.equal(ragefire.quests.reduce((sum, quest) => sum + (quest.xp || 0), 0), 5680, "Ragefire current Forever quest XP total should remain 5,680");

process.stdout.write("Data verification passed.\n");
