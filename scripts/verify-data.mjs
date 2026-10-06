import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";

const snapshot = JSON.parse(await readFile(new URL("../src/data/wow-forever.json", import.meta.url), "utf8"));
assert.equal(snapshot.schemaVersion, 3);
assert.ok(snapshot.context.inventory.totalEnglishPages >= 400, "expected full WOWF.IO corpus metadata");
assert.ok(snapshot.context.dataHealth.quests >= 100, "expected normalized quest-chain coverage");
assert.equal(snapshot.dungeons.length, 34, "expected the complete current 34-dungeon catalog");
assert.ok(snapshot.dungeons.reduce((sum, dungeon) => sum + dungeon.loot.length, 0) >= 1600, "expected comprehensive loot coverage");
assert.ok(snapshot.dungeons.reduce((sum, dungeon) => sum + dungeon.quests.length, 0) >= 150, "expected quest and reward-group coverage");
const loot = snapshot.dungeons.flatMap((dungeon) => dungeon.loot);
assert.equal(loot.filter((item) => item.icon).length, loot.length, "every loot record should carry an icon slug");

const maps = JSON.parse(await readFile(new URL("../src/data/dungeon-maps.json", import.meta.url), "utf8"));
assert.ok(Object.keys(maps).length >= 25, "expected the available Classic instance map set");
for (const map of Object.values(maps)) {
  assert.equal(map.license, "GPL-2.0");
  assert.ok(map.sourceUrl.startsWith("https://github.com/Hoizame/AtlasLootClassic_Maps/"));
  await access(new URL(`../public/${map.src}`, import.meta.url));
}

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
