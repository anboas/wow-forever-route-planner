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
  if (header !== `${PREFIX}C` && header !== `${PREFIX}P`) throw new Error("Expected a WFRP1 character or planner string.");
  const fields = {};
  for (const segment of segments) {
    const split = segment.indexOf("=");
    if (split <= 0) continue;
    fields[segment.slice(0, split)] = decode(segment.slice(split + 1));
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
