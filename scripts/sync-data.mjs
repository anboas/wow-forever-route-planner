import { writeFile } from "node:fs/promises";
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

function slimItem(item, fallback = {}) {
  return clean({
    id: item.id,
    name: item.name,
    quality: item.quality,
    rarity: item.rarity,
    itemLevel: item.itemLevel ?? item.ilvl,
    requiredLevel: item.requiredLevel,
    slot: item.slot,
    type: item.type,
    bind: item.bind,
    armor: item.armor,
    block: item.block,
    weapon: item.weapon,
    stats: list(item.stats),
    effects: item.effects ?? item.secondary_stats,
    boss: item.boss ?? item.bossName ?? item.source ?? fallback.boss,
    sourceType: item.source_type ?? fallback.sourceType,
    dropChance: item.drop_chance,
    discovered: item.discovered,
    hidden: item.hidden,
    uncertain: item.uncertain,
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
  return clean({
    id: quest.id,
    name: quest.name,
    level: quest.level,
    minLevel: quest.minLevel,
    faction: quest.faction,
    classes: quest.classes,
    objective: quest.objective,
    note: quest.note,
    from: list(quest.from).map(slimPerson),
    to: list(quest.to).map(slimPerson),
    chain: list(quest.chain).map(slimQuestStep),
    next: list(quest.next).map(slimQuestStep),
    rewards: list(quest.rewards).map(slimItem),
    rewardChoices: list(quest.rewardChoices).map(slimItem),
    rewardNote: quest.rewardNote,
    xp: quest.xp,
    rep: quest.rep,
    site: quest.site,
    series: quest.series,
    dataStatus: "verified",
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

  const merged = clean({
    id: wowfSummary?.id ?? slug,
    name: lootSummary.name,
    kind: lootSummary.isNew ? "new" : "classic",
    level: lootSummary.levels,
    band: wowfSummary?.band,
    location: wowfSummary?.location,
    status: wowfSummary?.status,
    entryLevel: wowfSummary?.entryLevel,
    bosses: (wowfData?.bosses ?? lootGroups.bosses ?? []).map((boss) => ({
      name: boss.name,
      level: boss.level,
      lootCount: boss.lootCount ?? boss.items?.length ?? 0,
    })),
    loot: [...lootById.values()],
    quests,
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
  schemaVersion: 2,
  fetchedAt: new Date().toISOString(),
  sources: [
    {
      name: "WOWF.IO",
      url: SOURCE_INDEX,
      note: "Beta-client and public-announcement dungeon, verified quest, and detailed loot compilation.",
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
