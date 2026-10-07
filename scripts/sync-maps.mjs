import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import init, { blpToPng } from "wow-blp-web";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "public/dungeon-maps");
const manifestPath = path.join(root, "src/data/dungeon-maps.json");
const atlasRoot = "https://raw.githubusercontent.com/Hoizame/AtlasLootClassic_Maps/master";
const atlasRepo = "https://github.com/Hoizame/AtlasLootClassic_Maps";
const foreverMapDataUrl = "https://raw.githubusercontent.com/nwh-gaming-ab/NaowhForever/main/NaowhForever_DungeonJournal/Data/Maps.lua";
const foreverMapSourceUrl = "https://github.com/nwh-gaming-ab/NaowhForever/blob/main/NaowhForever_DungeonJournal/Data/Maps.lua";
const listfileUrl = "https://github.com/wowdev/wow-listfile/releases/download/202610061349/community-listfile-withcapitals.csv";
const listfileSourceUrl = "https://github.com/wowdev/wow-listfile/releases/tag/202610061349";
const clientBuild = "1.60.1.70170";
const clientBuildSourceUrl = "https://wago.tools/api/builds";
const cascRoot = "https://wago.tools/api/casc";

const classicPlans = {
  "ragefire-chasm": { key: "RagefireChasm" },
  "wailing-caverns": { key: "WailingCaverns" },
  deadmines: { key: "Deadmines" },
  "shadowfang-keep": { key: "ShadowfangKeep" },
  stockade: { key: "Stockade" },
  "blackfathom-deeps": { key: "BlackfathomDeeps" },
  "scarlet-monastery-graveyard": { key: "ScarletMonasteryGraveyard" },
  gnomeregan: { key: "Gnomeregan" },
  "scarlet-monastery-library": { key: "ScarletMonasteryLibrary" },
  "razorfen-kraul": { key: "RazorfenKraul" },
  "scarlet-monastery-armory": { key: "ScarletMonasteryArmory" },
  "scarlet-monastery-cathedral": { key: "ScarletMonasteryCathedral" },
  "razorfen-downs": { key: "RazorfenDowns" },
  uldaman: { key: "Uldaman" },
  "zul-farrak": { fallback: "ZulFarrak.blp" },
  maraudon: { key: "Maraudon" },
  "the-temple-of-atal-hakkar": { key: "SunkenTemple" },
  "blackrock-depths": { key: "BlackrockDepths" },
  "blackrock-spire-lower": { key: "LowerBlackrockSpire" },
  "dire-maul-east": { key: "DireMaul", floors: [5, 6] },
  "dire-maul-west": { key: "DireMaul", floors: [2, 3, 4] },
  "dire-maul-north": { key: "DireMaul", floors: [1] },
  stratholme: { key: "Stratholme" },
  "blackrock-spire-upper": { key: "UpperBlackrockSpire", floors: [7] },
  scholomance: { key: "Scholomance" },
};

const foreverSchematics = {
  "hall-of-thanes": { key: "HallOfThanes", required: true, officialArt: "OldIronforge" },
  "ruins-of-lordaeron": { key: "RuinsOfLordaeron", required: true, overheadMapId: "2999" },
  "excavation-site": { key: "ExcavationSite", required: true, overheadMapId: "2998" },
  dalaran: { key: "Dalaran", required: true, overheadMapId: "2959" },
  "the-drowned-city": { key: "DrownedCity" },
  "krol-dok-stronghold": { key: "Kroldok" },
  "alcaz-prison": { key: "AlcazPrison" },
  "blackmaw-hold": { key: "BlackmawHold" },
  "shaper-s-terrace": { key: "ShapersTerrace" },
};

function extractLuaBlock(source, key) {
  const marker = `    ${key} = {`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing ${key} in Forever map source`);
  const brace = source.indexOf("{", start);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(brace, index + 1);
  }
  throw new Error(`Unclosed ${key} block in Forever map source`);
}

function parseForeverMap(source, key) {
  const block = extractLuaBlock(source, key);
  const floorCount = Number(block.match(/floors\s*=\s*(\d+)/)?.[1]);
  if (!Number.isInteger(floorCount) || floorCount < 1 || floorCount > 12) throw new Error(`Invalid floor count for ${key}`);
  const art = block.match(/art\s*=\s*"([^"]+)"/)?.[1];
  const fixedFloor = Number(block.match(/(?:^|[,\s])floor\s*=\s*(\d+)/)?.[1]) || undefined;
  const names = {};
  const namesBlock = block.match(/names\s*=\s*\{([^}]+)\}/s)?.[1] || "";
  for (const match of namesBlock.matchAll(/\[(\d+)\]\s*=\s*"([^"]+)"/g)) names[Number(match[1])] = match[2];
  const orderBlock = block.match(/order\s*=\s*\{([^}]+)\}/s)?.[1] || "";
  const order = [...orderBlock.matchAll(/\d+/g)].map((match) => Number(match[0]));
  const entranceMatch = block.match(/entrance\s*=\s*\{\s*(\d+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\}/);
  const entrance = entranceMatch ? { floor: Number(entranceMatch[1]), x: Number(entranceMatch[2]), y: Number(entranceMatch[3]) } : undefined;
  const pins = [...block.matchAll(/\[(-?\d+)\]\s*=\s*\{\s*(\d+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\},\s*--\s*([^\r\n]+)/g)].map((match, index) => ({
    id: Number(match[1]), floor: Number(match[2]), x: Number(match[3]), y: Number(match[4]), name: match[5].trim(), order: index + 1,
  }));
  if (!pins.length) throw new Error(`Missing boss pins for ${key}`);
  if ([...(entrance ? [entrance] : []), ...pins].some((pin) => pin.floor < 1 || pin.floor > floorCount || pin.x < 0 || pin.x > 1 || pin.y < 0 || pin.y > 1)) throw new Error(`Out-of-range pin for ${key}`);
  return { floorCount, art, fixedFloor, names, order, entrance, pins };
}

function xml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function renderSchematic(dungeonName, floorName, floor, entrance, pins) {
  const width = 1100;
  const height = 720;
  const plot = { x: 68, y: 72, w: 964, h: 582 };
  const point = ({ x, y }) => ({ x: plot.x + x * plot.w, y: plot.y + y * plot.h });
  const route = [...(entrance?.floor === floor ? [entrance] : []), ...pins.filter((pin) => pin.floor === floor)];
  const routePath = route.map(point).map((entry, index) => `${index ? "L" : "M"} ${entry.x.toFixed(1)} ${entry.y.toFixed(1)}`).join(" ");
  const grid = Array.from({ length: 11 }, (_, index) => {
    const x = plot.x + index * plot.w / 10;
    const y = plot.y + index * plot.h / 10;
    return `<path d="M ${x} ${plot.y} V ${plot.y + plot.h}"/><path d="M ${plot.x} ${y} H ${plot.x + plot.w}"/>`;
  }).join("");
  const entranceNode = entrance?.floor === floor ? (() => {
    const at = point(entrance);
    return `<g class="entrance" transform="translate(${at.x} ${at.y})"><circle r="18"/><path d="M -7 5 L 0 -7 L 7 5 Z"/><text x="25" y="5">ENTRANCE</text></g>`;
  })() : "";
  const pinNodes = pins.filter((pin) => pin.floor === floor).map((pin) => {
    const at = point(pin);
    const right = pin.x < 0.66;
    return `<g class="boss" transform="translate(${at.x} ${at.y})"><circle r="19"/><text class="number" text-anchor="middle" y="5">${pin.order}</text><text class="label" x="${right ? 25 : -25}" y="5" text-anchor="${right ? "start" : "end"}">${xml(pin.name)}</text></g>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${xml(dungeonName)} ${xml(floorName)} route schematic</title><desc id="desc">A not-to-scale route schematic generated from sourced entrance and boss coordinates.</desc>
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#10151d"/><stop offset="1" stop-color="#06090d"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <style>.grid path{stroke:#26303b;stroke-width:1;opacity:.42}.route{fill:none;stroke:#c99a3d;stroke-width:7;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:13 10;opacity:.78;filter:url(#glow)}.boss circle{fill:#111923;stroke:#f1c96a;stroke-width:4}.boss .number{fill:#fff2c8;font:700 14px system-ui}.boss .label,.entrance text{fill:#f3ead8;font:700 15px system-ui;paint-order:stroke;stroke:#070a0e;stroke-width:5px;stroke-linejoin:round}.entrance circle{fill:#173228;stroke:#55d39a;stroke-width:4}.entrance path{fill:#8ff2c2}.meta{fill:#8593a4;font:600 12px system-ui;letter-spacing:2px}.floor{fill:#f1c96a;font:700 18px system-ui}</style>
  <rect width="${width}" height="${height}" fill="url(#bg)"/><rect x="${plot.x}" y="${plot.y}" width="${plot.w}" height="${plot.h}" rx="18" fill="#0b1017" stroke="#394654" stroke-width="2"/><g class="grid">${grid}</g>${routePath ? `<path class="route" d="${routePath}"/>` : ""}${entranceNode}${pinNodes}
  <text class="meta" x="${plot.x}" y="40">ROUTE SCHEMATIC · NOT TO SCALE</text><text class="floor" x="${plot.x + plot.w}" y="40" text-anchor="end">${xml(floorName)}</text><text class="meta" x="${plot.x}" y="690">CONNECTORS SHOW ENCOUNTER SEQUENCE, NOT WALKABLE GEOMETRY</text>
</svg>`;
}

async function fetchText(url, label) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} fetching ${label}`);
  return response.text();
}

async function buildFileIndex(requiredWorldPaths, minimapIds) {
  const response = await fetch(listfileUrl);
  if (!response.ok || !response.body) throw new Error(`${response.status} fetching WoW client listfile`);
  const index = new Map();
  const minimaps = new Map([...minimapIds].map((id) => [id, []]));
  const decoder = new TextDecoder();
  let pending = "";
  const consume = (line) => {
    const separator = line.indexOf(";");
    if (separator < 1) return;
    const id = Number(line.slice(0, separator));
    const clientPath = line.slice(separator + 1).trim();
    const normalized = clientPath.toLowerCase();
    if (requiredWorldPaths.has(normalized)) index.set(normalized, id);
    const match = normalized.match(/^world\/minimaps\/(\d+)\/map(\d+)_(\d+)\.blp$/);
    if (match && minimaps.has(match[1])) minimaps.get(match[1]).push({ id, x: Number(match[2]), y: Number(match[3]), path: clientPath });
  };
  for await (const chunk of response.body) {
    pending += decoder.decode(chunk, { stream: true });
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() || "";
    for (const line of lines) consume(line);
  }
  pending += decoder.decode();
  if (pending) consume(pending);
  const missing = [...requiredWorldPaths].filter((entry) => !index.has(entry));
  if (missing.length) throw new Error(`Client listfile is missing ${missing.length} required map tiles; first: ${missing[0]}`);
  for (const [id, tiles] of minimaps) if (!tiles.length) throw new Error(`Client listfile has no minimap tiles for map ${id}`);
  return { index, minimaps };
}

const tileCache = new Map();
async function cascPng(fileDataId) {
  if (!tileCache.has(fileDataId)) tileCache.set(fileDataId, (async () => {
    const response = await fetch(`${cascRoot}/${fileDataId}?version=${clientBuild}`);
    if (!response.ok) throw new Error(`${response.status} fetching client file ${fileDataId}`);
    return Buffer.from(blpToPng(new Uint8Array(await response.arrayBuffer())));
  })());
  return tileCache.get(fileDataId);
}

function worldTilePath(art, floor, tile) {
  if (art === "OldIronforge") return `Interface/WorldMap/${art}/${art}${tile}.blp`;
  return `Interface/WorldMap/${art}/${art}${floor}_${tile}.blp`;
}

async function composeWorldFloor(art, floor, fileIndex, outputName) {
  const tiles = await Promise.all(Array.from({ length: 12 }, (_, index) => {
    const tile = index + 1;
    const clientPath = worldTilePath(art, floor, tile);
    const fileDataId = fileIndex.get(clientPath.toLowerCase());
    if (!fileDataId) throw new Error(`No file ID for ${clientPath}`);
    return cascPng(fileDataId);
  }));
  const composite = tiles.map((input, index) => ({ input, left: (index % 4) * 256, top: Math.floor(index / 4) * 256 }));
  await sharp({ create: { width: 1024, height: 768, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(composite).extract({ left: 0, top: 0, width: 1002, height: 668 }).webp({ quality: 94, smartSubsample: true, effort: 6 }).toFile(path.join(outputDir, outputName));
}

async function composeMinimap(tiles, outputName) {
  const xs = tiles.map((tile) => tile.x);
  const ys = tiles.map((tile) => tile.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = (maxX - minX + 1) * 256;
  const height = (maxY - minY + 1) * 256;
  const composite = await Promise.all(tiles.map(async (tile) => ({ input: await cascPng(tile.id), left: (tile.x - minX) * 256, top: (tile.y - minY) * 256 })));
  await sharp({ create: { width, height, channels: 4, background: { r: 20, g: 23, b: 25, alpha: 1 } } }).composite(composite).trim({ background: "#141719" }).webp({ quality: 94, smartSubsample: true, effort: 6 }).toFile(path.join(outputDir, outputName));
}

const wasm = await readFile(path.join(root, "node_modules/wow-blp-web/wow_blp_web_bg.wasm"));
await init({ module_or_path: wasm });
await mkdir(outputDir, { recursive: true });
const foreverSource = await fetchText(foreverMapDataUrl, "Forever map metadata");
const dungeonSnapshot = JSON.parse(await readFile(path.join(root, "src/data/wow-forever.json"), "utf8"));
const parsedClassic = new Map();
const requiredWorldPaths = new Set();
for (const plan of Object.values(classicPlans)) {
  if (!plan.key) continue;
  const parsed = parsedClassic.get(plan.key) || parseForeverMap(foreverSource, plan.key);
  parsedClassic.set(plan.key, parsed);
  const floors = plan.floors || (parsed.fixedFloor ? [parsed.fixedFloor] : parsed.order.length ? parsed.order : Array.from({ length: parsed.floorCount }, (_, index) => index + 1));
  for (const floor of floors) for (let tile = 1; tile <= 12; tile += 1) requiredWorldPaths.add(worldTilePath(parsed.art, floor, tile).toLowerCase());
}
for (let tile = 1; tile <= 12; tile += 1) requiredWorldPaths.add(worldTilePath("OldIronforge", 1, tile).toLowerCase());
const minimapIds = new Set(Object.values(foreverSchematics).map((entry) => entry.overheadMapId).filter(Boolean));
const { index: fileIndex, minimaps } = await buildFileIndex(requiredWorldPaths, minimapIds);

const manifest = {};
for (const [dungeonId, plan] of Object.entries(classicPlans)) {
  if (plan.fallback) {
    const response = await fetch(`${atlasRoot}/${plan.fallback}`);
    if (!response.ok) throw new Error(`${response.status} fetching ${plan.fallback}`);
    const outputName = `${dungeonId}-atlas-fallback.png`;
    await writeFile(path.join(outputDir, outputName), blpToPng(new Uint8Array(await response.arrayBuffer())));
    manifest[dungeonId] = { kind: "fallback-map", floors: [{ name: "Dungeon overview", src: `dungeon-maps/${outputName}`, kind: "fallback-map", quality: "512×512 community fallback" }], source: "AtlasLootClassic Maps fallback", sourceUrl: `${atlasRepo}/blob/master/${plan.fallback}`, license: "GPL-2.0", quality: "512×512 fallback; the Forever client publishes no native floor art for this dungeon." };
    process.stdout.write(`Mapped ${dungeonId} from Atlas fallback (client art unavailable)\n`);
    continue;
  }
  const parsed = parsedClassic.get(plan.key);
  const floors = plan.floors || (parsed.fixedFloor ? [parsed.fixedFloor] : parsed.order.length ? parsed.order : Array.from({ length: parsed.floorCount }, (_, index) => index + 1));
  const entries = [];
  for (const [position, floor] of floors.entries()) {
    const outputName = `${dungeonId}-client-${floor}.webp`;
    await composeWorldFloor(parsed.art, floor, fileIndex, outputName);
    entries.push({ name: parsed.names[floor] || (floors.length === 1 ? "Official floor map" : `Floor ${position + 1}`), src: `dungeon-maps/${outputName}`, kind: "client-map", quality: "High-quality 1002×668 Blizzard client map art", artFloor: floor, entrance: parsed.entrance?.floor === floor ? parsed.entrance : undefined, pins: parsed.pins.filter((pin) => pin.floor === floor) });
  }
  manifest[dungeonId] = { kind: "client-map", floors: entries, source: `WoW Forever client ${clientBuild}`, sourceUrl: clientBuildSourceUrl, fileIndexSource: listfileSourceUrl, quality: `High-quality 1002×668 Blizzard client map art · ${entries.length} floor${entries.length === 1 ? "" : "s"}`, note: "Floor art and boss-pin coordinates are sourced from the current Forever client and NaowhForever dungeon journal metadata." };
  process.stdout.write(`Generated ${entries.length} official client floor map(s) for ${dungeonId}\n`);
}

for (const [dungeonId, config] of Object.entries(foreverSchematics)) {
  if (!foreverSource.includes(`    ${config.key} = {`)) {
    if (config.required) throw new Error(`Missing required Forever map coordinates for ${config.key}`);
    process.stdout.write(`No public interior coordinates yet for ${dungeonId}; leaving map pending\n`);
    continue;
  }
  const dungeon = dungeonSnapshot.dungeons.find((entry) => entry.id === dungeonId);
  if (!dungeon) throw new Error(`Missing dungeon ${dungeonId} for map generation`);
  const parsed = parseForeverMap(foreverSource, config.key);
  const floors = [];
  if (config.officialArt) {
    const outputName = `${dungeonId}-official-client.webp`;
    await composeWorldFloor(config.officialArt, 1, fileIndex, outputName);
    floors.push({ name: "Official client floor", src: `dungeon-maps/${outputName}`, kind: "client-map", quality: "High-quality 1002×668 Blizzard client map art", entrance: parsed.entrance, pins: parsed.pins });
  }
  for (let floor = 1; floor <= parsed.floorCount; floor += 1) {
    const baseName = parsed.names[floor] || (parsed.floorCount === 1 ? "Boss route" : `Floor ${floor}`);
    const name = parsed.floorCount === 1 ? baseName : `${baseName} route`;
    const outputName = `${dungeonId}-route-${floor}.svg`;
    const pins = parsed.pins.filter((pin) => pin.floor === floor);
    if (!pins.length) throw new Error(`No pins on ${dungeonId} floor ${floor}`);
    await writeFile(path.join(outputDir, outputName), renderSchematic(dungeon.name, name, floor, parsed.entrance, parsed.pins));
    floors.push({ name, src: `dungeon-maps/${outputName}`, kind: "route-schematic", quality: "Resolution-independent sourced route SVG", pinCount: pins.length });
  }
  if (config.overheadMapId) {
    const outputName = `${dungeonId}-client-overhead.webp`;
    await composeMinimap(minimaps.get(config.overheadMapId), outputName);
    floors.push({ name: "Official client overhead", src: `dungeon-maps/${outputName}`, kind: "client-overhead", quality: "High-quality Blizzard client minimap mosaic" });
  }
  const officialViews = floors.filter((entry) => entry.kind !== "route-schematic").length;
  manifest[dungeonId] = { kind: "hybrid-map", floors, source: `WoW Forever client ${clientBuild} + NaowhForever pins`, sourceUrl: foreverMapSourceUrl, clientSourceUrl: clientBuildSourceUrl, fileIndexSource: listfileSourceUrl, attribution: "Original Route Planner schematics generated from sourced in-game entrance and boss coordinates; no third-party map artwork copied.", quality: `${officialViews} official client view${officialViews === 1 ? "" : "s"} plus scalable route navigation`, note: "Route connectors show encounter sequence, not walkable geometry. Client overheads are official terrain context and may not expose interior geometry." };
  process.stdout.write(`Generated ${floors.length} sourced map view(s) for ${dungeonId}\n`);
}

const atlasLicense = await fetch(`${atlasRoot}/LICENSE`);
if (!atlasLicense.ok) throw new Error("Failed to fetch AtlasLootClassic Maps license");
await writeFile(path.join(outputDir, "LICENSE.txt"), await atlasLicense.text());
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Wrote ${Object.keys(manifest).length} sourced dungeon map records\n`);
