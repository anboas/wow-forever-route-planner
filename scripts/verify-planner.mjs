import assert from "node:assert/strict";
import snapshot from "../src/data/wow-forever.json" with { type: "json" };
import { addExperience } from "../src/xp.js";
import { simulateRoute } from "../src/planner.js";

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
assert.equal(simulation.finish.level, 13);
assert.equal(simulation.finish.xp, 5680);

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

process.stdout.write("Planner verification passed.\n");
