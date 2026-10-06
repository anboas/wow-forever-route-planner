import assert from "node:assert/strict";
import snapshot from "../src/data/wow-forever.json" with { type: "json" };
import { addExperience } from "../src/xp.js";
import { buildOptimizedRoute, buildOptimizerCandidates, estimateTravelMinutes, optimizeRouteOrder, simulateRoute } from "../src/planner.js";

assert.deepEqual(addExperience({ level: 13, xp: 0 }, 5680), { level: 13, xp: 5680, overflow: 0 });
assert.deepEqual(addExperience({ level: 13, xp: 10700 }, 600), { level: 14, xp: 300, overflow: 0 });

const dungeonsById = new Map(snapshot.dungeons.map((dungeon) => [dungeon.id, dungeon]));
const route = ["ragefire-chasm", "ruins-of-lordaeron", "shadowfang-keep"].map((dungeonId) => ({ dungeonId, bonusXp: 0 }));
const simulation = simulateRoute({
  dungeonsById,
  route,
  level: 13,
  xp: 0,
  faction: "horde",
  characterClass: "warrior",
  assumePrerequisites: true,
});

assert.equal(simulation.steps.length, 3);
assert.equal(simulation.steps[0].questXp, 5680);
assert.equal(simulation.steps[1].questXp, 0, "Lordaeron should be level-gated after an RFC-only start at level 13");
assert.ok(simulation.steps[1].bridgeShortfall > 0, "planner should quantify the XP needed before Lordaeron");
assert.equal(simulation.steps.flatMap((step) => step.quests).some(({ quest }) => quest.faction === "alliance"), false, "Horde route must hide Alliance quests");
assert.equal(simulation.finish.level, 13);
assert.equal(simulation.finish.xp, 5680);
assert.ok(simulation.totalTravelMinutes > 0, "route simulation includes an editable travel estimate");

const modeledRun = simulateRoute({
  dungeonsById,
  route: [{ dungeonId: "ragefire-chasm", bonusXp: 0, combatXpPerRun: 1000, runs: 2, restedPercent: 50 }],
  level: 13,
  xp: 0,
  faction: "horde",
  characterClass: "warrior",
  assumePrerequisites: true,
});
assert.equal(modeledRun.steps[0].combatXp, 3000, "combat XP uses observed XP per clear, repeats, and rested bonus");
assert.equal(modeledRun.steps[0].totalXp, 8680);

const firstQuestId = String(simulation.steps[0].quests[0].quest.id);
const questStateRun = simulateRoute({
  dungeonsById,
  route: [{ dungeonId: "ragefire-chasm" }],
  level: 13,
  xp: 0,
  faction: "horde",
  characterClass: "warrior",
  assumePrerequisites: true,
  questStates: { [firstQuestId]: "skip" },
});
assert.equal(questStateRun.steps[0].quests[0].gate.status, "skipped", "per-quest skip state overrides automatic readiness");
assert.ok(questStateRun.steps[0].questXp < simulation.steps[0].questXp);
assert.equal(estimateTravelMinutes(null, dungeonsById.get("ragefire-chasm")), 0);

const advanced = simulateRoute({
  dungeonsById,
  route,
  level: 14,
  xp: 12000,
  faction: "horde",
  characterClass: "warrior",
  assumePrerequisites: true,
});
assert.ok(advanced.finish.level >= 16, "a near-level-15 character should chain into verified SFK quest eligibility");
assert.ok(advanced.steps[1].questXp > 10000);

const optimized = optimizeRouteOrder({
  dungeonsById,
  route,
  level: 13,
  xp: 0,
  faction: "horde",
  characterClass: "warrior",
  assumePrerequisites: true,
});
assert.equal(optimized.route.length, 3);
assert.ok(optimized.totalBridgeXp >= 0);
assert.ok(optimized.route.every((entry) => Number.isFinite(entry.bridgeXp)));

const built = buildOptimizedRoute({
  dungeonsById,
  level: 13,
  xp: 0,
  faction: "horde",
  characterClass: "warrior",
  assumePrerequisites: true,
  count: 6,
});
assert.equal(built.route.length, 6);
assert.ok(built.totalQuestXp > 0);

const candidates = buildOptimizerCandidates({
  dungeonsById,
  route,
  level: 13,
  xp: 0,
  faction: "horde",
  characterClass: "warrior",
  assumePrerequisites: true,
});
assert.deepEqual(candidates.map(({ id }) => id), ["fastest", "completion", "balanced"]);
assert.ok(candidates.every(({ result }) => result.route.length === 3));
assert.ok(candidates.every(({ result }) => Number.isFinite(result.totalTravelMinutes)));
assert.ok(candidates.every(({ result }) => Number.isFinite(result.guideHits)), "optimizer reports class/spec guide matches");

process.stdout.write("Planner verification passed.\n");
