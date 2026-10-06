import { addExperience, clampCharacter } from "./xp.js";

function matchesFaction(questFaction, faction) {
  return !questFaction || questFaction === "both" || questFaction === faction;
}

function matchesClass(classes, characterClass) {
  if (!Array.isArray(classes) || classes.length === 0) return true;
  return classes.some((value) => value.toLowerCase() === characterClass.toLowerCase());
}

export function questMinimumLevel(quest, dungeon) {
  return Number.isFinite(quest.minLevel) ? quest.minLevel : dungeon.level[0];
}

export function evaluateQuest(quest, dungeon, character, options, completedIds) {
  const minLevel = questMinimumLevel(quest, dungeon);
  if (completedIds.has(String(quest.id))) return { status: "already-done", minLevel, xp: 0 };
  if (quest.dataStatus !== "verified") return { status: "unverified", minLevel, xp: 0 };
  if (!matchesFaction(quest.faction, options.faction)) return { status: "wrong-faction", minLevel, xp: 0 };
  if (!matchesClass(quest.classes, options.characterClass)) return { status: "wrong-class", minLevel, xp: 0 };
  if (character.level < minLevel) return { status: "level-locked", minLevel, xp: 0 };
  if ((quest.chain?.length ?? 0) > 0 && !options.assumePrerequisites) {
    return { status: "needs-prerequisites", minLevel, xp: 0 };
  }
  if (!Number.isFinite(quest.xp)) return { status: "xp-unverified", minLevel, xp: 0 };
  return { status: "ready", minLevel, xp: quest.xp };
}

export function simulateRoute({ dungeonsById, route, level, xp, faction, characterClass, assumePrerequisites }) {
  let character = clampCharacter(level, xp);
  const completedIds = new Set();
  const steps = [];

  for (const routeEntry of route) {
    const dungeon = dungeonsById.get(routeEntry.dungeonId);
    if (!dungeon) continue;
    const before = { ...character };
    const quests = dungeon.quests.map((quest) => ({
      quest,
      gate: evaluateQuest(
        quest,
        dungeon,
        character,
        { faction, characterClass, assumePrerequisites },
        completedIds,
      ),
    }));
    const questXp = quests.reduce((sum, entry) => sum + entry.gate.xp, 0);
    for (const entry of quests) {
      if (entry.gate.status === "ready") completedIds.add(String(entry.quest.id));
    }
    const bonusXp = Math.max(0, Number(routeEntry.bonusXp) || 0);
    character = addExperience(character, questXp + bonusXp);
    steps.push({ dungeon, before, after: { ...character }, quests, questXp, bonusXp, totalXp: questXp + bonusXp });
  }

  return { start: clampCharacter(level, xp), finish: character, steps };
}
