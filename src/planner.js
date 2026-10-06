import { addExperience, clampCharacter, XP_TO_NEXT } from "./xp.js";

export function matchesFaction(questFaction, faction) {
  return !questFaction || questFaction === "both" || questFaction === faction;
}

export function matchesClass(classes, characterClass) {
  if (!Array.isArray(classes) || classes.length === 0) return true;
  return classes.some((value) => value.toLowerCase() === characterClass.toLowerCase());
}

export function questMinimumLevel(quest, dungeon) {
  return Number.isFinite(quest.minLevel) ? quest.minLevel : dungeon.level[0];
}

export function xpToReachLevel(character, targetLevel) {
  const current = clampCharacter(character.level, character.xp);
  const target = Math.max(current.level, Math.min(60, Number(targetLevel) || current.level));
  if (current.level >= target) return 0;
  let total = XP_TO_NEXT[current.level] - current.xp;
  for (let level = current.level + 1; level < target; level += 1) total += XP_TO_NEXT[level] || 0;
  return total;
}

export function visibleDungeonQuests(dungeon, faction, characterClass) {
  return dungeon.quests.filter((quest) => matchesFaction(quest.faction, faction) && matchesClass(quest.classes, characterClass));
}

export function dungeonCompletionLevel(dungeon, faction, characterClass) {
  const verified = visibleDungeonQuests(dungeon, faction, characterClass).filter((quest) => quest.dataStatus === "verified");
  return verified.reduce((level, quest) => Math.max(level, questMinimumLevel(quest, dungeon)), dungeon.level[0]);
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
    const preBridge = { ...character };
    const completionLevel = dungeonCompletionLevel(dungeon, faction, characterClass);
    const requiredBridgeXp = xpToReachLevel(preBridge, completionLevel);
    const bridgeXp = Math.max(0, Number(routeEntry.bridgeXp) || 0);
    character = addExperience(character, bridgeXp);
    const before = { ...character };
    const quests = visibleDungeonQuests(dungeon, faction, characterClass).map((quest) => ({
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
    const completable = quests.filter((entry) => entry.quest.dataStatus === "verified").length;
    const ready = quests.filter((entry) => entry.gate.status === "ready").length;
    steps.push({
      dungeon,
      preBridge,
      before,
      after: { ...character },
      quests,
      questXp,
      bridgeXp,
      bonusXp,
      requiredBridgeXp,
      bridgeShortfall: Math.max(0, requiredBridgeXp - bridgeXp),
      completionLevel,
      completionRate: completable ? ready / completable : 1,
      totalXp: bridgeXp + questXp + bonusXp,
    });
  }

  return { start: clampCharacter(level, xp), finish: character, steps };
}

function completeRoute({ dungeonsById, route, level, xp, faction, characterClass, assumePrerequisites, lootGoals = {} }) {
  let character = clampCharacter(level, xp);
  const completedIds = new Set();
  let totalBridgeXp = 0;
  let totalQuestXp = 0;
  let wishlistHits = 0;
  const planned = [];

  for (const routeEntry of route) {
    const dungeon = dungeonsById.get(routeEntry.dungeonId);
    if (!dungeon) continue;
    const bridgeXp = xpToReachLevel(character, dungeonCompletionLevel(dungeon, faction, characterClass));
    character = addExperience(character, bridgeXp);
    const quests = visibleDungeonQuests(dungeon, faction, characterClass).map((quest) => ({
      quest,
      gate: evaluateQuest(quest, dungeon, character, { faction, characterClass, assumePrerequisites }, completedIds),
    }));
    const questXp = quests.reduce((sum, entry) => sum + entry.gate.xp, 0);
    for (const entry of quests) if (entry.gate.status === "ready") completedIds.add(String(entry.quest.id));
    character = addExperience(character, questXp + Math.max(0, Number(routeEntry.bonusXp) || 0));
    totalBridgeXp += bridgeXp;
    totalQuestXp += questXp;
    wishlistHits += Number(lootGoals[dungeon.id]) || 0;
    planned.push({ ...routeEntry, bridgeXp });
  }
  return { route: planned, totalBridgeXp, totalQuestXp, wishlistHits, finish: character };
}

function permutations(values) {
  if (values.length <= 1) return [values];
  const results = [];
  values.forEach((value, index) => {
    const rest = [...values.slice(0, index), ...values.slice(index + 1)];
    for (const suffix of permutations(rest)) results.push([value, ...suffix]);
  });
  return results;
}

function betterPlan(candidate, current) {
  if (!current) return true;
  if (candidate.totalBridgeXp !== current.totalBridgeXp) return candidate.totalBridgeXp < current.totalBridgeXp;
  if (candidate.wishlistHits !== current.wishlistHits) return candidate.wishlistHits > current.wishlistHits;
  if (candidate.totalQuestXp !== current.totalQuestXp) return candidate.totalQuestXp > current.totalQuestXp;
  if (candidate.finish.level !== current.finish.level) return candidate.finish.level > current.finish.level;
  return candidate.finish.xp > current.finish.xp;
}

export function optimizeRouteOrder(options) {
  const route = options.route || [];
  if (route.length < 2) return completeRoute(options);
  if (route.length > 8) return buildOptimizedRoute({ ...options, count: route.length, candidates: route.map((entry) => entry.dungeonId) });
  let best;
  for (const order of permutations(route)) {
    const candidate = completeRoute({ ...options, route: order });
    if (betterPlan(candidate, best)) best = candidate;
  }
  return best;
}

export function buildOptimizedRoute({ dungeonsById, level, xp, faction, characterClass, assumePrerequisites, count = 6, candidates, lootGoals = {} }) {
  let character = clampCharacter(level, xp);
  const completedIds = new Set();
  const available = (candidates ? candidates.map((id) => dungeonsById.get(id)) : [...dungeonsById.values()])
    .filter(Boolean)
    .filter((dungeon) => visibleDungeonQuests(dungeon, faction, characterClass).some((quest) => quest.dataStatus === "verified"));
  const route = [];
  let totalBridgeXp = 0;
  let totalQuestXp = 0;
  let wishlistHits = 0;

  while (available.length && route.length < count) {
    const ranked = available.map((dungeon) => {
      const bridgeXp = xpToReachLevel(character, dungeonCompletionLevel(dungeon, faction, characterClass));
      const bridged = addExperience(character, bridgeXp);
      const quests = visibleDungeonQuests(dungeon, faction, characterClass).map((quest) => ({
        quest,
        gate: evaluateQuest(quest, dungeon, bridged, { faction, characterClass, assumePrerequisites }, completedIds),
      }));
      const questXp = quests.reduce((sum, entry) => sum + entry.gate.xp, 0);
      const ready = quests.filter((entry) => entry.gate.status === "ready").length;
      const distance = Math.abs(dungeon.level[0] - character.level);
      const lootHits = Number(lootGoals[dungeon.id]) || 0;
      const score = questXp + ready * 700 + lootHits * 2500 - bridgeXp * .18 - distance * 180;
      return { dungeon, bridgeXp, bridged, quests, questXp, lootHits, score };
    }).sort((a, b) => b.score - a.score || a.bridgeXp - b.bridgeXp);
    const choice = ranked[0];
    const index = available.indexOf(choice.dungeon);
    available.splice(index, 1);
    for (const entry of choice.quests) if (entry.gate.status === "ready") completedIds.add(String(entry.quest.id));
    character = addExperience(choice.bridged, choice.questXp);
    totalBridgeXp += choice.bridgeXp;
    totalQuestXp += choice.questXp;
    wishlistHits += choice.lootHits;
    route.push({ uid: `optimized-${route.length}-${choice.dungeon.id}`, dungeonId: choice.dungeon.id, bridgeXp: choice.bridgeXp, bonusXp: 0 });
  }

  return { route, totalBridgeXp, totalQuestXp, wishlistHits, finish: character };
}
