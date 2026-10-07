export const CLASS_OPTIONS = Object.freeze([
  { id: "warrior", label: "Warrior", color: "#c79c6e" },
  { id: "paladin", label: "Paladin", color: "#f58cba" },
  { id: "hunter", label: "Hunter", color: "#abd473" },
  { id: "rogue", label: "Rogue", color: "#fff569" },
  { id: "priest", label: "Priest", color: "#ffffff" },
  { id: "shaman", label: "Shaman", color: "#0070de" },
  { id: "mage", label: "Mage", color: "#69ccf0" },
  { id: "warlock", label: "Warlock", color: "#9482c9" },
  { id: "druid", label: "Druid", color: "#ff7d0a" },
]);

const ALL_CLASSES = CLASS_OPTIONS.map(({ id }) => id);
const ARMOR_CLASSES = {
  cloth: ALL_CLASSES,
  leather: ["warrior", "paladin", "hunter", "rogue", "shaman", "druid"],
  mail: ["warrior", "paladin", "hunter", "shaman"],
  plate: ["warrior", "paladin"],
  shield: ["warrior", "paladin", "shaman"],
};
const WEAPON_CLASSES = {
  axe: ["warrior", "paladin", "hunter", "shaman"],
  bow: ["warrior", "hunter", "rogue"],
  crossbow: ["warrior", "hunter", "rogue"],
  dagger: ["warrior", "hunter", "rogue", "priest", "shaman", "mage", "warlock", "druid"],
  fist: ["warrior", "hunter", "rogue", "shaman", "druid"],
  gun: ["warrior", "hunter", "rogue"],
  mace: ["warrior", "paladin", "rogue", "priest", "shaman", "druid"],
  polearm: ["warrior", "paladin", "hunter", "druid"],
  staff: ["warrior", "hunter", "priest", "shaman", "mage", "warlock", "druid"],
  sword: ["warrior", "paladin", "hunter", "rogue", "mage", "warlock"],
  thrown: ["warrior", "rogue"],
  wand: ["priest", "mage", "warlock"],
};

const STAT_WEIGHTS = {
  warrior: { strength: 4, agility: 2, stamina: 2, attack: 3, defense: 2, armor: 1 },
  paladin: { strength: 3, stamina: 2, intellect: 2, spirit: 1, spell: 2, healing: 2, defense: 1 },
  hunter: { agility: 4, stamina: 1, intellect: 1, attack: 3, ranged: 4 },
  rogue: { agility: 4, strength: 2, stamina: 1, attack: 3, critical: 2 },
  priest: { intellect: 3, spirit: 3, stamina: 1, spell: 3, healing: 4, mana: 2 },
  shaman: { strength: 2, agility: 2, stamina: 1, intellect: 2, spirit: 2, spell: 3, healing: 3, attack: 2 },
  mage: { intellect: 4, spirit: 2, stamina: 1, spell: 4, mana: 2 },
  warlock: { intellect: 3, stamina: 3, spirit: 1, spell: 4, shadow: 4 },
  druid: { agility: 2, strength: 1, stamina: 2, intellect: 3, spirit: 2, spell: 3, healing: 3, attack: 2 },
};

function normalized(value) {
  return String(value || "").toLowerCase().replaceAll("_", " ").replaceAll("-", " ");
}

function sourceKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sameItem(left, right) {
  if (left?.id && right?.id) return String(left.id) === String(right.id);
  const leftName = sourceKey(left?.name);
  const rightName = sourceKey(right?.name);
  return Boolean(leftName && rightName && leftName === rightName);
}

function weaponFamily(type) {
  const value = normalized(type);
  return Object.keys(WEAPON_CLASSES).find((family) => value.includes(family));
}

export function classCanUseItem(item, characterClass) {
  if (!characterClass || characterClass === "all") return true;
  const slot = normalized(item.slot);
  const type = normalized(item.type);
  if (slot.includes("back") || slot.includes("neck") || slot.includes("finger") || slot.includes("trinket")) return true;
  const armor = Object.keys(ARMOR_CLASSES).find((family) => type.includes(family));
  if (armor) return ARMOR_CLASSES[armor].includes(characterClass);
  const weapon = weaponFamily(type);
  if (weapon) return WEAPON_CLASSES[weapon].includes(characterClass);
  return true;
}

export function compatibleClasses(item) {
  return ALL_CLASSES.filter((characterClass) => classCanUseItem(item, characterClass));
}

function itemText(item) {
  const stats = (item.stats || []).map((stat) => `${stat.label} ${stat.value}`).join(" ");
  const effects = Array.isArray(item.effects)
    ? item.effects.map((effect) => typeof effect === "string" ? effect : effect.text || "").join(" ")
    : Object.entries(item.effects || {}).map(([key, value]) => `${key} ${value}`).join(" ");
  return normalized(`${stats} ${effects}`);
}

export function classFitScore(item, characterClass) {
  if (!classCanUseItem(item, characterClass)) return -1;
  const text = itemText(item);
  const weights = STAT_WEIGHTS[characterClass] || {};
  let score = 0;
  for (const [term, weight] of Object.entries(weights)) {
    if (text.includes(term)) score += weight;
  }
  return score;
}

export function bestClasses(item, limit = 4) {
  const scored = compatibleClasses(item)
    .map((characterClass) => ({ characterClass, score: classFitScore(item, characterClass) }))
    .sort((a, b) => b.score - a.score || a.characterClass.localeCompare(b.characterClass));
  if (!scored.length || scored[0].score <= 0) return [];
  const floor = Math.max(1, scored[0].score - 1);
  return scored.filter(({ score }) => score >= floor).slice(0, limit).map(({ characterClass }) => characterClass);
}

export function classIconUrl(characterClass) {
  return `https://wow.zamimg.com/images/wow/icons/large/classicon_${characterClass}.jpg`;
}

export function itemIconUrl(item) {
  return item.icon ? `https://wowf-assets.t3.tigrisfiles.io/icons/items/${String(item.icon).toLowerCase()}.jpg` : null;
}

export function itemSourceUrl(item, dungeon) {
  const dungeonId = dungeon?.id || item?.dungeonId;
  if (dungeonId && Number.isInteger(Number(item?.id)) && Number(item.id) > 0) {
    return `https://wowf.io/en/dungeons/${dungeonId}#item-${item.id}`;
  }
  return "https://wowf.io/en/discoveries/items";
}

export function itemSourceMeta(item, dungeon) {
  const sourceName = String(item.boss || "").trim();
  const sourceParts = sourceName.split("/").map(sourceKey).filter(Boolean);
  const sourceType = sourceKey(item.sourceType);
  const quests = dungeon?.quests || [];
  const bosses = dungeon?.bosses || [];
  const quest = quests.find((entry) => sourceParts.includes(sourceKey(entry.name)))
    || quests.find((entry) => [...(entry.rewards || []), ...(entry.rewardChoices || [])].some((reward) => sameItem(reward, item)));
  const boss = bosses.find((entry) => sourceKey(entry.name) === sourceKey(sourceName));

  if (sourceType.startsWith("quest") || quest) {
    const faction = sourceType.includes("alliance") ? "Alliance" : sourceType.includes("horde") ? "Horde" : quest?.faction || null;
    return { kind: "quest", label: "Quest reward", name: quest?.name || sourceName || "Quest source pending", faction, questId: quest?.id };
  }
  if (boss) return { kind: "boss", label: "Boss", name: boss.name };
  if (/trash|plunder/.test(sourceKey(sourceName))) return { kind: "trash", label: "Trash drop", name: sourceName || "Dungeon trash" };
  if (sourceName) return { kind: "drop", label: "Boss / mob", name: sourceName };
  return { kind: "unknown", label: "Unknown source", name: "Source pending" };
}
