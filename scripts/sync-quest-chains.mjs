import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_URL = "https://raw.githubusercontent.com/nwh-gaming-ab/NaowhForever/main/NaowhForever_DungeonJournal/Data/QuestChains.lua";
const SOURCE_PAGE = "https://github.com/nwh-gaming-ab/NaowhForever/blob/main/NaowhForever_DungeonJournal/Data/QuestChains.lua";
const outputPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/data/forever-quest-chains.json");

const ZONES = {
  1411: "Durotar", 1412: "Mulgore", 1413: "The Barrens", 1416: "Alterac Mountains",
  1417: "Arathi Highlands", 1418: "Badlands", 1419: "Blasted Lands", 1420: "Tirisfal Glades",
  1421: "Silverpine Forest", 1422: "Western Plaguelands", 1423: "Eastern Plaguelands",
  1424: "Hillsbrad Foothills", 1425: "The Hinterlands", 1426: "Dun Morogh", 1427: "Searing Gorge",
  1428: "Burning Steppes", 1429: "Elwynn Forest", 1430: "Deadwind Pass", 1431: "Duskwood",
  1432: "Loch Modan", 1433: "Redridge Mountains", 1434: "Stranglethorn Vale", 1435: "Swamp of Sorrows",
  1436: "Westfall", 1437: "Wetlands", 1438: "Teldrassil", 1439: "Darkshore", 1440: "Ashenvale",
  1441: "Thousand Needles", 1442: "Stonetalon Mountains", 1443: "Desolace", 1444: "Feralas",
  1445: "Dustwallow Marsh", 1446: "Tanaris", 1447: "Azshara", 1448: "Felwood", 1449: "Un'Goro Crater",
  1450: "Moonglade", 1451: "Silithus", 1452: "Winterspring", 1453: "Stormwind City",
  1454: "Orgrimmar", 1455: "Ironforge", 1456: "Thunder Bluff", 1457: "Darnassus", 1458: "Undercity",
};

function tableBlock(source, name) {
  const marker = `J.${name} = {`;
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Missing ${name}`);
  const start = source.indexOf("{", markerIndex);
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start + 1, index);
    }
  }
  throw new Error(`Unclosed ${name}`);
}

function simpleNumberMap(source, name) {
  return new Map([...tableBlock(source, name).matchAll(/\[(\d+)\]\s*=\s*(\d+)/g)].map((match) => [Number(match[1]), Number(match[2])]));
}

function nameMap(source) {
  return new Map([...tableBlock(source, "QuestChainNames").matchAll(/\[(\d+)\]\s*=\s*"((?:\\.|[^"\\])*)"/g)].map((match) => [Number(match[1]), JSON.parse(`"${match[2]}"`)]));
}

function startMap(source) {
  const block = tableBlock(source, "QuestChainStarts");
  return new Map([...block.matchAll(/\[(\d+)\]\s*=\s*\{\s*(\d+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*"((?:\\.|[^"\\])*)"\s*\}/g)].map((match) => {
    const uiMapId = Number(match[2]);
    return [Number(match[1]), {
      uiMapId,
      zone: ZONES[uiMapId] || `Map ${uiMapId}`,
      x: Number(match[3]),
      y: Number(match[4]),
      giver: JSON.parse(`"${match[5]}"`),
    }];
  }));
}

function parseLuaList(value) {
  let index = 0;
  function skip() { while (/\s|,/.test(value[index] || "")) index += 1; }
  function parse() {
    skip();
    if (value[index] === "{") {
      index += 1;
      const entries = [];
      skip();
      while (index < value.length && value[index] !== "}") {
        entries.push(parse());
        skip();
      }
      if (value[index] !== "}") throw new Error(`Invalid Lua list: ${value}`);
      index += 1;
      return entries;
    }
    const match = value.slice(index).match(/^\d+/);
    if (!match) throw new Error(`Unexpected Lua value at ${value.slice(index)}`);
    index += match[0].length;
    return Number(match[0]);
  }
  return parse();
}

function prerequisiteMap(source) {
  const result = new Map();
  for (const line of tableBlock(source, "QuestPrereqs").split("\n")) {
    const match = line.match(/^\s*\[(\d+)\]\s*=\s*(\{.*\})\s*,?\s*$/);
    if (match) result.set(Number(match[1]), parseLuaList(match[2]));
  }
  return result;
}

function flatten(value) {
  return Array.isArray(value) ? value.flatMap(flatten) : [value];
}

const nestedFixture = parseLuaList("{ { 20, 98386, 98387 }, 19 }");
if (JSON.stringify(nestedFixture) !== JSON.stringify([[20, 98386, 98387], 19])) throw new Error("Nested prerequisite parser regression");

const response = await fetch(SOURCE_URL, { headers: { Accept: "text/plain", "User-Agent": "ForeverRoutePlanner/0.1" } });
if (!response.ok) throw new Error(`${response.status} fetching Forever quest chains`);
const source = await response.text();
const prereqs = prerequisiteMap(source);
const names = nameMap(source);
const levels = simpleNumberMap(source, "QuestMinLevel");
const starts = startMap(source);
if (prereqs.size < 100 || names.size < 300 || starts.size < 300) throw new Error(`Unexpected Forever quest-chain coverage: ${prereqs.size}/${names.size}/${starts.size}`);

const referencedIds = new Set([...prereqs.entries()].flatMap(([questId, steps]) => [questId, ...flatten(steps)]));
const quests = [...referencedIds].sort((a, b) => a - b).map((id) => ({
  id,
  name: names.get(id) || `Quest ${id}`,
  minLevel: levels.get(id),
  start: starts.get(id),
  prerequisiteSteps: prereqs.get(id) || [],
}));
const snapshot = {
  schemaVersion: 1,
  fetchedAt: new Date().toISOString(),
  source: { name: "NaowhForever quest chains", url: SOURCE_PAGE, rawUrl: SOURCE_URL },
  health: { prerequisiteQuests: prereqs.size, referencedQuests: quests.length, namedQuests: quests.filter((quest) => !quest.name.startsWith("Quest ")).length, locatedQuests: quests.filter((quest) => quest.start).length },
  quests,
};
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
process.stdout.write(`Wrote ${quests.length} Forever quest-chain records (${snapshot.health.locatedQuests} located)\n`);
