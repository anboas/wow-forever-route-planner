const PREFIX = "WFRP1";

function encode(value) {
  return encodeURIComponent(String(value ?? "")).replaceAll("%20", "+");
}

function decode(value) {
  return decodeURIComponent(String(value || "").replaceAll("+", "%20"));
}

function list(value) {
  return String(value || "").split(",").map((entry) => entry.trim()).filter(Boolean);
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

export function parseCompanionString(input) {
  const value = String(input || "").trim();
  const [header, ...segments] = value.split("|");
  if (![`${PREFIX}C`, `${PREFIX}P`, "WFRP2C"].includes(header)) throw new Error("Expected a WFRP character, telemetry, or planner string.");
  const fields = {};
  for (const segment of segments) {
    const split = segment.indexOf("=");
    if (split <= 0) continue;
    fields[segment.slice(0, split)] = decode(segment.slice(split + 1));
  }
  if (header === "WFRP2C") {
    let payload;
    try { payload = JSON.parse(fields.payload || "{}"); } catch { throw new Error("The WFRP2 telemetry payload is damaged or incomplete."); }
    if (payload?.schema !== 2 || !payload.character || !Array.isArray(payload.runs)) throw new Error("The WFRP2 telemetry payload has an unsupported schema.");
    const character = payload.character;
    return {
      type: "telemetry",
      schema: 2,
      addonVersion: String(payload.addonVersion || ""),
      dataVersion: String(payload.dataVersion || ""),
      exportedAt: positiveInteger(payload.exportedAt),
      name: String(character.name || ""),
      realm: String(character.realm || ""),
      level: positiveInteger(character.level),
      xp: positiveInteger(character.xp),
      xpMax: positiveInteger(character.xpMax),
      restedXp: positiveInteger(character.restedXp) || 0,
      faction: String(character.faction || "").toLowerCase(),
      characterClass: String(character.class || "").toLowerCase(),
      spec: String(character.spec || "").toLowerCase().replaceAll(" ", "-"),
      talents: Array.isArray(character.talents) ? character.talents : [],
      gear: Array.isArray(character.gear) ? character.gear.map((item) => ({ ...item, itemId: positiveInteger(item.itemId) })).filter((item) => item.slot && item.itemId) : [],
      bindLocation: String(character.bindLocation || ""),
      flightPaths: Array.isArray(character.flightPaths) ? character.flightPaths.map(String) : [],
      professions: Array.isArray(character.professions) ? character.professions : [],
      money: positiveInteger(character.money) || 0,
      freeBagSlots: positiveInteger(character.freeBagSlots) || 0,
      durability: positiveInteger(character.durability) ?? 100,
      hearthReadyAt: positiveInteger(character.hearthReadyAt) || 0,
      zone: String(character.zone || ""),
      subzone: String(character.subzone || ""),
      position: character.position || null,
      activeQuestIds: Array.isArray(payload.quests?.active) ? payload.quests.active.map(String) : [],
      completedQuestIds: Array.isArray(payload.quests?.complete) ? payload.quests.complete.map(String) : [],
      runs: normalizeRuns(payload.runs),
      currentRun: payload.currentRun || null,
      group: Array.isArray(payload.group) ? payload.group : [],
      peers: payload.peers && typeof payload.peers === "object" ? payload.peers : {},
      readiness: payload.readiness || null,
      plan: payload.plan || {},
      raw: payload,
    };
  }
  if (header === `${PREFIX}P`) {
    return {
      type: "plan",
      route: list(fields.route),
      wishlistItemIds: list(fields.wishlist).map(positiveInteger).filter((entry) => entry !== undefined),
      completedQuestIds: list(fields.complete),
      level: positiveInteger(fields.level),
      xp: positiveInteger(fields.xp),
      faction: fields.faction?.toLowerCase(),
      characterClass: fields.class?.toLowerCase(),
      spec: fields.spec?.toLowerCase(),
    };
  }
  const gear = list(fields.gear).map((entry) => {
    const [slot, itemId] = entry.split(":");
    return { slot, itemId: positiveInteger(itemId) };
  }).filter((entry) => entry.slot && entry.itemId);
  const professions = list(fields.professions).map((entry) => {
    const [name, skill, maximum] = entry.split(":");
    return { name, skill: positiveInteger(skill), maximum: positiveInteger(maximum) };
  }).filter((entry) => entry.name);
  return {
    type: "character",
    name: fields.name || "",
    realm: fields.realm || "",
    level: positiveInteger(fields.level),
    xp: positiveInteger(fields.xp),
    xpMax: positiveInteger(fields.xpmax),
    faction: fields.faction?.toLowerCase(),
    characterClass: fields.class?.toLowerCase(),
    spec: fields.spec?.toLowerCase(),
    activeQuestIds: list(fields.active),
    completedQuestIds: list(fields.complete),
    gear,
    bindLocation: fields.bind || "",
    flightPaths: list(fields.flights),
    professions,
  };
}

function normalizeRuns(runs) {
  return runs.slice(-50).map((run, index) => ({
    id: String(run.id || `run-${index}`),
    dungeonId: String(run.dungeonId || "unknown"),
    dungeonName: String(run.dungeonName || run.dungeonId || "Unknown dungeon"),
    startedAt: positiveInteger(run.startedAt) || 0,
    endedAt: positiveInteger(run.endedAt) || 0,
    duration: positiveInteger(run.duration) || 0,
    startLevel: positiveInteger(run.startLevel) || 0,
    startXp: positiveInteger(run.startXp) || 0,
    endLevel: positiveInteger(run.endLevel) || 0,
    endXp: positiveInteger(run.endXp) || 0,
    totalXp: positiveInteger(run.totalXp) || 0,
    combatXp: positiveInteger(run.combatXp) || 0,
    questXp: positiveInteger(run.questXp) || 0,
    unclassifiedXp: positiveInteger(run.unclassifiedXp) || 0,
    deaths: positiveInteger(run.deaths) || 0,
    bosses: Array.isArray(run.bosses) ? run.bosses.map(String) : [],
    loot: Array.isArray(run.loot) ? run.loot.map(positiveInteger).filter(Boolean) : [],
    quests: Array.isArray(run.quests) ? run.quests.map(String) : [],
    group: Array.isArray(run.group) ? run.group : [],
    reason: String(run.reason || ""),
  })).filter((run) => run.dungeonId !== "unknown" || run.duration > 0 || run.totalXp > 0);
}

export function summarizeTelemetry(runs = []) {
  const total = runs.reduce((summary, run) => {
    summary.duration += run.duration || 0;
    summary.totalXp += run.totalXp || 0;
    summary.combatXp += run.combatXp || 0;
    summary.questXp += run.questXp || 0;
    summary.unclassifiedXp += run.unclassifiedXp || 0;
    summary.deaths += run.deaths || 0;
    summary.bosses += run.bosses?.length || 0;
    summary.loot += run.loot?.length || 0;
    const dungeon = summary.byDungeon[run.dungeonId] ||= { dungeonId: run.dungeonId, dungeonName: run.dungeonName, runs: 0, duration: 0, totalXp: 0, combatXp: 0, questXp: 0, deaths: 0 };
    dungeon.runs += 1; dungeon.duration += run.duration || 0; dungeon.totalXp += run.totalXp || 0; dungeon.combatXp += run.combatXp || 0; dungeon.questXp += run.questXp || 0; dungeon.deaths += run.deaths || 0;
    return summary;
  }, { runs: runs.length, duration: 0, totalXp: 0, combatXp: 0, questXp: 0, unclassifiedXp: 0, deaths: 0, bosses: 0, loot: 0, byDungeon: {} });
  total.xpPerHour = total.duration > 0 ? Math.round(total.totalXp / total.duration * 3600) : 0;
  total.averageRunMinutes = total.runs > 0 ? total.duration / total.runs / 60 : 0;
  total.dungeons = Object.values(total.byDungeon).map((dungeon) => ({ ...dungeon, xpPerHour: dungeon.duration > 0 ? Math.round(dungeon.totalXp / dungeon.duration * 3600) : 0, averageMinutes: dungeon.runs > 0 ? dungeon.duration / dungeon.runs / 60 : 0 })).sort((a, b) => b.runs - a.runs || b.totalXp - a.totalXp);
  return total;
}

export function serializePlannerString(state) {
  const fields = {
    route: state.route.map((entry) => entry.dungeonId).join(","),
    wishlist: state.wishlist.map((entry) => entry.id).filter(Boolean).join(","),
    complete: Object.entries(state.questStates || {}).filter(([, questState]) => questState === "complete").map(([id]) => id).join(","),
    level: state.level,
    xp: state.xp,
    faction: state.faction,
    class: state.characterClass,
    spec: state.spec,
  };
  return `${PREFIX}P|${Object.entries(fields).map(([key, value]) => `${key}=${encode(value)}`).join("|")}`;
}
