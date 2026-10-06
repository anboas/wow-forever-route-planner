import assert from "node:assert/strict";
import snapshot from "../src/data/wow-forever.json" with { type: "json" };
import { compareItems, defaultSpec, dropChancePercent, lootVisibleForFaction, recommendedForProfile, runsForConfidence, specFitScore } from "../src/gear.js";
import { buildOptimizedRoute } from "../src/planner.js";

const ragefire = snapshot.dungeons.find((dungeon) => dungeon.id === "ragefire-chasm");
const felblade = ragefire.loot.find((item) => item.name === "Cursed Felblade");
const chanceItem = snapshot.dungeons.flatMap((dungeon) => dungeon.loot).find((item) => Number(item.dropChance) > 0 && Number(item.dropChance) < 1);
assert.ok(chanceItem, "fixture includes a fractional source drop chance");
assert.equal(dropChancePercent(chanceItem), Number(chanceItem.dropChance) * 100, "fractional source chances become user-facing percentages");
assert.equal(dropChancePercent(felblade), null, "missing drop chances remain unavailable");
assert.ok(runsForConfidence(chanceItem, .5) < runsForConfidence(chanceItem, .9), "higher confidence needs more expected runs");
assert.equal(defaultSpec("priest"), "discipline");
assert.ok(specFitScore(felblade, "warrior", "arms") >= 0);
assert.equal(recommendedForProfile(felblade, "priest", "holy"), false, "unusable gear is never recommended");
assert.ok(Number.isFinite(compareItems(felblade, null, "warrior", "arms").delta));

const allianceQuestItem = snapshot.dungeons.flatMap((dungeon) => dungeon.loot.map((item) => ({ item, dungeon }))).find(({ item }) => String(item.sourceType).toLowerCase() === "quest (alliance)");
assert.ok(allianceQuestItem, "fixture includes an Alliance-only quest reward");
assert.equal(lootVisibleForFaction(allianceQuestItem.item, allianceQuestItem.dungeon, "horde"), false, "Horde loot views hide Alliance quest rewards");

const dungeonsById = new Map(snapshot.dungeons.map((dungeon) => [dungeon.id, dungeon]));
const wishlistPlan = buildOptimizedRoute({
  dungeonsById,
  level: 13,
  xp: 0,
  faction: "horde",
  characterClass: "warrior",
  assumePrerequisites: true,
  count: 1,
  lootGoals: { "shadowfang-keep": 100 },
});
assert.equal(wishlistPlan.route[0].dungeonId, "shadowfang-keep", "wishlist weight influences generated routes");
assert.equal(wishlistPlan.wishlistHits, 100);

process.stdout.write("Gear, faction, drop-run, comparison, and wishlist-route verification passed.\n");
