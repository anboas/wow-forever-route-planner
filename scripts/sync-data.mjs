import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SOURCE_ORIGIN = "https://wowf.io";
const SOURCE_INDEX = `${SOURCE_ORIGIN}/en/dungeons`;
const LOOT_SOURCE_ORIGIN = "https://wowtbc.gg";
const LOOT_INDEX = `${LOOT_SOURCE_ORIGIN}/page-data/warcraftforever/loot-tables/dungeons/page-data.json`;
const outputPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/data/wow-forever.json",
);
const contextPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/data/wowf-context.json");
const context = JSON.parse(await readFile(contextPath, "utf8"));
const questChains = JSON.parse(await readFile(new URL("../src/data/forever-quest-chains.json", import.meta.url), "utf8"));
const contextQuestById = new Map(context.quests.map((quest) => [String(quest.id), quest]));
const chainQuestById = new Map(questChains.quests.map((quest) => [String(quest.id), quest]));

function profileKey(guide) {
  return `${guide.classId}:${guide.spec}`;
}

const recommendedProfilesByQuest = new Map();
for (const guide of context.levelingGuides) for (const quest of guide.dungeonQuests) {
  const keys = [quest.id ? `id:${quest.id}` : null, quest.name ? `name:${nameKey(quest.name)}` : null].filter(Boolean);
  for (const key of keys) recommendedProfilesByQuest.set(key, [...new Set([...(recommendedProfilesByQuest.get(key) || []), profileKey(guide)])]);
}

function flightPayload(html) {
  const chunks = [];
  const pattern = /<script>self\.__next_f\.push\((\[1,"(?:\\.|[^"\\])*"\])\)<\/script>/g;
  for (const match of html.matchAll(pattern)) {
    chunks.push(JSON.parse(match[1])[1]);
  }
  if (!chunks.length) throw new Error("No React Flight payload found");
  return chunks.join("");
}

function extractBalancedJson(source, start) {
  const open = source[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === open) depth += 1;
    else if (character === close) {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unbalanced JSON beginning at ${start}`);
}

function extractArray(payload, key) {
  const marker = `"${key}":[`;
  const markerIndex = payload.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Missing ${key} array`);
  const start = markerIndex + marker.length - 1;
  return JSON.parse(extractBalancedJson(payload, start));
}

function extractDungeon(payload, id) {
  const marker = `{"id":"${id}","cites":`;
  const start = payload.indexOf(marker);
  if (start < 0) throw new Error(`Missing dungeon payload for ${id}`);
  return JSON.parse(extractBalancedJson(payload, start));
}

async function fetchPage(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html",
      "User-Agent": "ForeverRoutePlanner/0.1 (+https://github.com/anboas/wow-forever-planner)",
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.text();
}

function slugFromPath(value) {
  return value.split("/").filter(Boolean).at(-1);
}

function nameKey(value) {
  return value
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, "");
}

function clean(value) {
  if (value === "$undefined" || value === undefined) return undefined;
  if (Array.isArray(value)) return value.map(clean).filter((entry) => entry !== undefined);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entry]) => [key, clean(entry)])
        .filter(([, entry]) => entry !== undefined),
    );
  }
  return value;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function label(value) {
  if (!value) return value;
  return String(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statList(item) {
  if (Array.isArray(item.stats)) return item.stats;
  return Object.entries(item.primary_stats ?? {}).map(([stat, value]) => ({ label: label(stat), value }));
}

function weapon(item) {
  if (item.weapon) return item.weapon;
  const special = item.special_stats ?? {};
  const match = String(special.weapon_damage ?? "").match(/([\d.]+)\s*-\s*([\d.]+)/);
  if (!match && !special.weapon_speed && !special.weapon_dps) return undefined;
  return clean({
    min: match ? Number(match[1]) : undefined,
    max: match ? Number(match[2]) : undefined,
    speed: special.weapon_speed,
    dps: special.weapon_dps,
  });
}

function binding(value) {
  return { bop: "pickup", boe: "equip", bou: "use", boa: "account" }[value] ?? value;
}

function slimItem(item, fallback = {}) {
  return clean({
    id: item.id,
    name: item.name,
    quality: item.quality,
    rarity: item.rarity,
    itemLevel: item.itemLevel ?? item.ilvl,
    slot: label(item.slot),
    type: label(item.type),
    bind: binding(item.bind),
    icon: item.icon,
    armor: item.armor ?? item.special_stats?.armor,
    block: item.block ?? item.special_stats?.block,
    weapon: weapon(item),
    stats: statList(item),
    effects: item.effects ?? item.secondary_stats,
    boss: item.boss ?? item.bossName ?? item.source ?? fallback.boss,
    sourceType: item.source_type ?? fallback.sourceType,
    dropChance: item.dropChance ?? item.drop_chance,
    discovered: item.discovered,
    hidden: item.hidden,
    uncertain: item.uncertain,
    requiredLevel: item.requiredLevel ?? item.other_stats?.min_level,
  });
}

function slimPerson(person) {
  return clean({
    name: person.name,
    kind: person.kind,
    zone: person.zone,
    place: person.place,
    at: person.at,
  });
}

function slimQuestStep(step) {
  return clean({
    name: step.name,
    level: step.level,
    minLevel: step.minLevel,
    faction: step.faction,
    classes: step.classes,
    optional: step.optional,
  });
}

function slimQuest(quest) {
  const contextQuest = contextQuestById.get(String(quest.id));
  const recommendedProfiles = [...new Set([
    ...(recommendedProfilesByQuest.get(`id:${quest.id}`) || []),
    ...(recommendedProfilesByQuest.get(`name:${nameKey(quest.name)}`) || []),
  ])];
  const startPlaces = contextQuest?.stages?.find((stage) => stage.key === "start")?.places;
  const endPlaces = contextQuest?.stages?.find((stage) => stage.key === "end")?.places;
  const chainRecord = chainQuestById.get(String(quest.id));
  return clean({
    id: quest.id,
    name: quest.name,
    level: quest.level,
    minLevel: quest.minLevel,
    faction: quest.faction,
    classes: quest.classes,
    objective: quest.objective,
    note: quest.note,
    from: list(quest.from).length ? list(quest.from).map(slimPerson) : startPlaces,
    to: list(quest.to).length ? list(quest.to).map(slimPerson) : endPlaces,
    chain: list(quest.chain).map(slimQuestStep),
    next: list(quest.next).map(slimQuestStep),
    rewards: list(quest.rewards).map(slimItem),
    rewardChoices: list(quest.rewardChoices).map(slimItem),
    rewardNote: quest.rewardNote,
    xp: quest.xp,
    rep: quest.rep,
    site: quest.site,
    series: quest.series,
    stages: contextQuest?.stages,
    prerequisiteIds: chainRecord?.prerequisiteSteps?.flat(4) || contextQuest?.previousIds,
    prerequisiteSteps: chainRecord?.prerequisiteSteps?.map((step) => (Array.isArray(step) ? step : [step]).map((id) => chainQuestById.get(String(id))).filter(Boolean)),
    sourcePages: contextQuest?.sourcePages,
    sourceUpdatedAt: contextQuest?.sourceUpdatedAt,
    reviewState: contextQuest?.reviewState,
    recommendedProfiles,
    dataStatus: "verified",
  });
}

function questFromContext(quest) {
  const start = quest.stages.find((stage) => stage.key === "start");
  const end = quest.stages.find((stage) => stage.key === "end");
  const chainRecord = chainQuestById.get(String(quest.id));
  return clean({
    id: quest.id,
    name: quest.name,
    level: quest.level,
    minLevel: quest.minLevel,
    faction: quest.faction,
    classes: quest.classes,
    objective: quest.objective,
    from: start?.places,
    to: end?.places,
    stages: quest.stages,
    prerequisiteIds: chainRecord?.prerequisiteSteps?.flat(4) || quest.previousIds,
    prerequisiteSteps: chainRecord?.prerequisiteSteps?.map((step) => (Array.isArray(step) ? step : [step]).map((id) => chainQuestById.get(String(id))).filter(Boolean)),
    rewards: quest.rewards,
    rewardChoices: quest.rewardChoices,
    sourcePages: quest.sourcePages,
    sourceUpdatedAt: quest.sourceUpdatedAt,
    reviewState: quest.reviewState,
    recommendedProfiles: [...new Set([
      ...(recommendedProfilesByQuest.get(`id:${quest.id}`) || []),
      ...(recommendedProfilesByQuest.get(`name:${nameKey(quest.name)}`) || []),
    ])],
    dataStatus: "source-only",
  });
}

async function mapLimit(values, limit, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

const [indexHtml, lootIndexResponse] = await Promise.all([
  fetchPage(SOURCE_INDEX),
  fetch(LOOT_INDEX, { headers: { Accept: "application/json" } }),
]);
if (!lootIndexResponse.ok) throw new Error(`Failed to load ${LOOT_INDEX}`);
const wowfCatalog = extractArray(flightPayload(indexHtml), "dungeons");
const lootCatalog = (await lootIndexResponse.json()).result.pageContext.dungeons;
const wowfByName = new Map(wowfCatalog.map((entry) => [nameKey(entry.name), entry]));

const dungeons = await mapLimit(lootCatalog, 4, async (lootSummary, index) => {
  const slug = slugFromPath(lootSummary.path);
  const pageDataUrl = `${LOOT_SOURCE_ORIGIN}/page-data${lootSummary.path}page-data.json`;
  const pageDataResponse = await fetch(pageDataUrl, { headers: { Accept: "application/json" } });
  if (!pageDataResponse.ok) throw new Error(`Failed to load ${pageDataUrl}`);
  const pageContext = (await pageDataResponse.json()).result.pageContext;
  const baseLoot = pageContext.gearData ?? [];
  const lootGroups = pageContext.loot?.[0] ?? {};
  const wowfSummary = wowfByName.get(nameKey(lootSummary.name));
  let wowfData;
  let questData;

  if (wowfSummary) {
    const baseUrl = `${SOURCE_INDEX}/${wowfSummary.id}`;
    const [lootHtml, questHtml] = await Promise.all([fetchPage(baseUrl), fetchPage(`${baseUrl}/quests`)]);
    wowfData = extractDungeon(flightPayload(lootHtml), wowfSummary.id);
    questData = extractDungeon(flightPayload(questHtml), wowfSummary.id);
  }

  const lootById = new Map(baseLoot.map((item) => [String(item.id), slimItem(item)]));
  for (const item of wowfData?.loot ?? []) lootById.set(String(item.id), slimItem(item));

  const quests = (questData?.quests ?? []).map(slimQuest);
  const detailedNames = new Set(quests.map((quest) => quest.name.toLowerCase()));
  for (const [questIndex, group] of (lootGroups.quests ?? []).entries()) {
    if (detailedNames.has(group.name.toLowerCase())) continue;
    quests.push({
      id: `${slug}-reward-${questIndex + 1}`,
      name: group.name,
      rewards: (group.items ?? [])
        .map((id) => lootById.get(String(id)))
        .filter(Boolean),
      dataStatus: "rewards-only",
    });
  }

  const knownQuestIds = new Set(quests.map((quest) => String(quest.id)));
  const knownQuestNames = new Set(quests.map((quest) => nameKey(quest.name)));
  for (const contextQuest of context.quests) {
    const linked = contextQuest.stages.some((stage) => nameKey(stage.dungeon?.name || "") === nameKey(lootSummary.name));
    if (!linked || knownQuestIds.has(String(contextQuest.id)) || knownQuestNames.has(nameKey(contextQuest.name))) continue;
    quests.push(questFromContext(contextQuest));
    knownQuestIds.add(String(contextQuest.id));
    knownQuestNames.add(nameKey(contextQuest.name));
  }

  const guideRecommendations = context.levelingGuides.flatMap((guide) => guide.dungeonQuests
    .filter((quest) => nameKey(quest.dungeon || "") === nameKey(lootSummary.name))
    .map((quest) => clean({ classId: guide.classId, spec: guide.spec, questId: quest.id, questName: quest.name, sourceUrl: guide.source.url })));
  const world = context.zones.find((zone) => zone.id === (wowfSummary?.id ?? slug) || nameKey(zone.name) === nameKey(lootSummary.name));

  const merged = clean({
    id: wowfSummary?.id ?? slug,
    name: lootSummary.name,
    kind: lootSummary.isNew ? "new" : "classic",
    level: lootSummary.levels,
    band: wowfSummary?.band,
    location: wowfSummary?.location,
    status: wowfSummary?.status,
    entryLevel: wowfSummary?.entryLevel,
    world: world ? clean({ summary: world.summary, faction: world.faction, location: world.location, atlasPoints: world.atlasPoints, worldPoints: world.worldPoints, source: world.source }) : undefined,
    bosses: (wowfData?.bosses ?? lootGroups.bosses ?? []).map((boss) => ({
      name: boss.name,
      level: boss.level,
      lootCount: boss.lootCount ?? boss.items?.length ?? 0,
    })),
    loot: [...lootById.values()],
    quests,
    guideRecommendations,
    questSourceUrl: wowfSummary ? `${SOURCE_INDEX}/${wowfSummary.id}/quests` : pageDataUrl,
    lootSourceUrl: `${LOOT_SOURCE_ORIGIN}${lootSummary.path}`,
    dataCoverage: wowfSummary ? "detailed" : "loot-only",
  });
  const lootCount = Array.isArray(merged.loot) ? merged.loot.length : 0;
  const questCount = Array.isArray(merged.quests) ? merged.quests.length : 0;
  process.stdout.write(`[${index + 1}/${lootCatalog.length}] ${lootSummary.name}: ${lootCount} loot, ${questCount} quests\n`);
  return merged;
});

const snapshot = {
  schemaVersion: 3,
  fetchedAt: new Date().toISOString(),
  context: {
    fetchedAt: context.fetchedAt,
    inventory: context.inventory,
    dataHealth: context.dataHealth,
  },
  sources: [
    {
      name: "WOWF.IO",
      url: SOURCE_INDEX,
      note: "Beta-client and public-announcement dungeon data plus the complete published quest, zone, and leveling-guide corpus.",
    },
    {
      name: "NaowhForever quest chains",
      url: questChains.source.url,
      note: "Forever-specific prerequisite IDs, minimum levels, quest-giver coordinates, and pickup order.",
    },
    {
      name: "Warcraft Tavern",
      url: "https://www.warcrafttavern.com/forever/guides/dungeons/",
      note: "Independent cross-check for dungeon ranges, locations, and Forever's quest-centered dungeon XP model.",
    },
    {
      name: "wowtbc.gg",
      url: "https://wowtbc.gg/warcraftforever/loot-tables/dungeons/",
      note: "Independent cross-check for the complete dungeon lineup and level bands.",
    },
  ],
  dungeons,
};

await writeFile(outputPath, `${JSON.stringify(snapshot)}\n`);
process.stdout.write(`Wrote ${dungeons.length} dungeons to ${outputPath}\n`);
