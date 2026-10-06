import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { parseCompanionString, serializePlannerString } from "../src/companion.js";

const plan = serializePlannerString({
  route: [{ dungeonId: "ragefire-chasm" }, { dungeonId: "shadowfang-keep" }],
  wishlist: [{ id: 123 }, { id: 456 }],
  questStates: { 1: "complete", 2: "skip" },
  level: 14,
  xp: 321,
  faction: "horde",
  characterClass: "warrior",
  spec: "arms",
});
const parsedPlan = parseCompanionString(plan);
assert.equal(parsedPlan.type, "plan");
assert.deepEqual(parsedPlan.route, ["ragefire-chasm", "shadowfang-keep"]);
assert.deepEqual(parsedPlan.wishlistItemIds, [123, 456]);
assert.deepEqual(parsedPlan.completedQuestIds, ["1"]);

const character = parseCompanionString("WFRP1C|name=Test+Hero|realm=Forever|level=18|xp=420|xpmax=12000|faction=Horde|class=WARRIOR|spec=Arms|active=1,2|complete=3,4|gear=Head:123,Chest:456|bind=Orgrimmar|flights=Crossroads,Thunder+Bluff|professions=Mining:75:150");
assert.equal(character.name, "Test Hero");
assert.equal(character.characterClass, "warrior");
assert.deepEqual(character.activeQuestIds, ["1", "2"]);
assert.deepEqual(character.gear, [{ slot: "Head", itemId: 123 }, { slot: "Chest", itemId: 456 }]);
assert.deepEqual(character.professions, [{ name: "Mining", skill: 75, maximum: 150 }]);
assert.throws(() => parseCompanionString("bad payload"), /Expected a WFRP1/);

await access(new URL("../addon/ForeverRouteCompanion/ForeverRouteCompanion.toc", import.meta.url));
await access(new URL("../addon/ForeverRouteCompanion/ForeverRouteCompanion.lua", import.meta.url));
await access(new URL("../public/addons/ForeverRouteCompanion.zip", import.meta.url));
const data = await readFile(new URL("../addon/ForeverRouteCompanion/Data.lua", import.meta.url), "utf8");
assert.ok((data.match(/\[\d+\]=true/g) || []).length >= 100, "expected the generated dungeon quest ID catalog");

process.stdout.write("Companion exchange verification passed.\n");
