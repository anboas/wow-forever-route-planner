import { classCanUseItem, classFitScore, itemSourceMeta } from "./loot.js";

export const CLASS_SPECS = Object.freeze({
  warrior: [{ id: "arms", label: "Arms", role: "Melee" }, { id: "fury", label: "Fury", role: "Melee" }, { id: "protection", label: "Protection", role: "Tank" }],
  paladin: [{ id: "holy", label: "Holy", role: "Healer" }, { id: "protection", label: "Protection", role: "Tank" }, { id: "retribution", label: "Retribution", role: "Melee" }],
  hunter: [{ id: "beast-mastery", label: "Beast Mastery", role: "Ranged" }, { id: "marksmanship", label: "Marksmanship", role: "Ranged" }, { id: "survival", label: "Survival", role: "Melee" }],
  rogue: [{ id: "assassination", label: "Assassination", role: "Melee" }, { id: "combat", label: "Combat", role: "Melee" }, { id: "subtlety", label: "Subtlety", role: "Melee" }],
  priest: [{ id: "discipline", label: "Discipline", role: "Healer" }, { id: "holy", label: "Holy", role: "Healer" }, { id: "shadow", label: "Shadow", role: "Caster" }],
  shaman: [{ id: "elemental", label: "Elemental", role: "Caster" }, { id: "enhancement", label: "Enhancement", role: "Melee" }, { id: "restoration", label: "Restoration", role: "Healer" }],
  mage: [{ id: "arcane", label: "Arcane", role: "Caster" }, { id: "fire", label: "Fire", role: "Caster" }, { id: "frost", label: "Frost", role: "Caster" }],
  warlock: [{ id: "affliction", label: "Affliction", role: "Caster" }, { id: "demonology", label: "Demonology", role: "Caster" }, { id: "destruction", label: "Destruction", role: "Caster" }],
  druid: [{ id: "balance", label: "Balance", role: "Caster" }, { id: "feral", label: "Feral", role: "Melee" }, { id: "restoration", label: "Restoration", role: "Healer" }],
});

const ROLE_WEIGHTS = {
  Tank: { stamina: 4, defense: 5, armor: 2, block: 4, strength: 2, dodge: 4, parry: 4 },
  Healer: { healing: 6, intellect: 4, spirit: 4, mana: 3, spell: 2 },
  Caster: { spell: 5, intellect: 4, mana: 2, critical: 3, hit: 3, spirit: 1 },
  Melee: { attack: 5, strength: 4, agility: 4, critical: 3, hit: 3 },
  Ranged: { ranged: 6, agility: 5, attack: 3, critical: 3, hit: 3, intellect: 1 },
};

export function defaultSpec(characterClass) {
  return CLASS_SPECS[characterClass]?.[0]?.id || "general";
}

export function specProfile(characterClass, spec) {
  return CLASS_SPECS[characterClass]?.find((entry) => entry.id === spec) || CLASS_SPECS[characterClass]?.[0] || { id: "general", label: "General", role: "General" };
}

function itemText(item) {
  const stats = (item.stats || []).map((stat) => `${stat.label} ${stat.value}`).join(" ");
  const effects = Array.isArray(item.effects)
    ? item.effects.map((effect) => typeof effect === "string" ? effect : effect.text || "").join(" ")
    : Object.entries(item.effects || {}).map(([key, value]) => `${key} ${value}`).join(" ");
  return `${stats} ${effects} ${item.type || ""} ${item.slot || ""}`.toLowerCase();
}

export function specFitScore(item, characterClass, spec) {
  if (!classCanUseItem(item, characterClass)) return -1;
  const profile = specProfile(characterClass, spec);
  const weights = ROLE_WEIGHTS[profile.role] || {};
  const text = itemText(item);
  let score = classFitScore(item, characterClass);
  for (const [term, weight] of Object.entries(weights)) if (text.includes(term)) score += weight;
  if (profile.id === "shadow" && text.includes("shadow")) score += 5;
  if (profile.id === "fire" && text.includes("fire")) score += 5;
  if (profile.id === "frost" && text.includes("frost")) score += 5;
  if (profile.id === "holy" && (text.includes("healing") || text.includes("holy"))) score += 4;
  if (profile.id === "protection" && (text.includes("shield") || text.includes("block"))) score += 5;
  return score;
}

export function itemPowerScore(item, characterClass, spec) {
  if (!item) return 0;
  return Math.max(0, specFitScore(item, characterClass, spec)) + (Number(item.itemLevel) || 0) * .18 + (Number(item.armor) || 0) * .015;
}

export function recommendedForProfile(item, characterClass, spec) {
  return classCanUseItem(item, characterClass) && specFitScore(item, characterClass, spec) > 0;
}

export function itemKey(item, dungeonId = "") {
  return item?.id ? `id:${item.id}` : `name:${String(item?.name || "").toLowerCase()}@${dungeonId}`;
}

export function itemSummary(item, dungeon) {
  return { ...item, key: itemKey(item, dungeon?.id), dungeonId: dungeon?.id, dungeonName: dungeon?.name };
}

export function compareItems(candidate, equipped, characterClass, spec) {
  const delta = itemPowerScore(candidate, characterClass, spec) - itemPowerScore(equipped, characterClass, spec);
  const currentStats = new Map((equipped?.stats || []).map((stat) => [String(stat.label).toLowerCase(), Number(stat.value) || 0]));
  const changes = (candidate?.stats || [])
    .map((stat) => ({ label: stat.label, value: (Number(stat.value) || 0) - (currentStats.get(String(stat.label).toLowerCase()) || 0) }))
    .filter(({ value }) => value !== 0)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 4);
  return { delta, changes };
}

export function dropChancePercent(item) {
  const raw = Number(item?.dropChance);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return raw <= 1 ? raw * 100 : raw;
}

export function runsForConfidence(item, confidence) {
  const percent = dropChancePercent(item);
  if (!percent || percent >= 100) return percent ? 1 : null;
  return Math.max(1, Math.ceil(Math.log(1 - confidence) / Math.log(1 - percent / 100)));
}

export function lootVisibleForFaction(item, dungeon, faction) {
  const source = itemSourceMeta(item, dungeon);
  return source.kind !== "quest" || !source.faction || source.faction.toLowerCase() === String(faction).toLowerCase();
}

export function questSourceUrl(quest) {
  const id = Number(quest?.id);
  return Number.isInteger(id) && id > 0 && id < 200000
    ? `https://www.wowhead.com/classic/quest=${id}`
    : `https://www.wowhead.com/classic/search?q=${encodeURIComponent(quest?.name || "")}`;
}

export function entitySourceUrl(source) {
  return `https://www.wowhead.com/classic/search?q=${encodeURIComponent(source?.name || "")}`;
}

export function reportIssueUrl({ item, quest, dungeon }) {
  const subject = item ? `Item: ${item.name}` : quest ? `Quest: ${quest.name}` : `Dungeon: ${dungeon?.name || "Unknown"}`;
  const title = encodeURIComponent(`Data correction: ${subject}`);
  const body = encodeURIComponent(`Please describe the incorrect data and include a reliable source.\n\nRecord: ${subject}\nDungeon: ${dungeon?.name || "Unknown"}`);
  return `https://github.com/anboas/wow-forever-route-planner/issues/new?title=${title}&body=${body}`;
}
