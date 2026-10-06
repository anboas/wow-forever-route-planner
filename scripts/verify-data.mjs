import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const snapshot = JSON.parse(await readFile(new URL("../src/data/wow-forever.json", import.meta.url), "utf8"));
assert.equal(snapshot.schemaVersion, 2);
assert.equal(snapshot.dungeons.length, 34, "expected the complete current 34-dungeon catalog");
assert.ok(snapshot.dungeons.reduce((sum, dungeon) => sum + dungeon.loot.length, 0) >= 1600, "expected comprehensive loot coverage");
assert.ok(snapshot.dungeons.reduce((sum, dungeon) => sum + dungeon.quests.length, 0) >= 150, "expected quest and reward-group coverage");

for (const dungeon of snapshot.dungeons) {
  assert.ok(dungeon.id && dungeon.name);
  assert.equal(dungeon.level.length, 2);
  assert.ok(dungeon.level[0] <= dungeon.level[1]);
  assert.ok(Array.isArray(dungeon.loot));
  assert.ok(Array.isArray(dungeon.quests));
  assert.ok(dungeon.lootSourceUrl.startsWith("https://"));
}

const routeNames = ["Ragefire Chasm", "Ruins of Lordaeron", "Shadowfang Keep"];
for (const name of routeNames) {
  const dungeon = snapshot.dungeons.find((entry) => entry.name === name);
  assert.ok(dungeon, `missing ${name}`);
  assert.ok(dungeon.quests.some((quest) => Number.isFinite(quest.xp)), `${name} needs verified quest XP`);
}

process.stdout.write("Data verification passed.\n");
