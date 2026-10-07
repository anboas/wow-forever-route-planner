import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";

const snapshot = JSON.parse(await readFile(new URL("../src/data/wow-forever.json", import.meta.url), "utf8"));
const questChains = JSON.parse(await readFile(new URL("../src/data/forever-quest-chains.json", import.meta.url), "utf8"));
assert.equal(snapshot.schemaVersion, 3);
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
  assert.ok(["instance-map", "route-schematic"].includes(map.kind), `${dungeonId} needs an explicit map kind`);
  if (map.kind === "instance-map") {
    assert.equal(map.license, "GPL-2.0");
    assert.ok(map.sourceUrl.startsWith("https://github.com/Hoizame/AtlasLootClassic_Maps/"));
    await access(new URL(`../public/${map.src}`, import.meta.url));
    assert.match(map.quality, /512|native/i, `${dungeonId} should disclose native map quality`);
  } else {
    assert.ok(map.sourceUrl.startsWith("https://github.com/nwh-gaming-ab/NaowhForever/"));
    assert.match(map.attribution, /no third-party map artwork copied/i);
    assert.ok(map.floors.length >= 1);
    assert.match(map.quality, /svg|resolution/i, `${dungeonId} should disclose scalable map quality`);
    for (const floor of map.floors) {
      assert.ok(floor.name && floor.pinCount >= 1);
      await access(new URL(`../public/${floor.src}`, import.meta.url));
    }
  }
}
for (const dungeonId of ["hall-of-thanes", "ruins-of-lordaeron", "excavation-site", "dalaran"]) assert.equal(maps[dungeonId].kind, "route-schematic", `expected sourced schematic for ${dungeonId}`);
assert.equal(maps.dalaran.floors.length, 2, "City of Dalaran should expose both sourced floors");
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

process.stdout.write("Data verification passed.\n");
