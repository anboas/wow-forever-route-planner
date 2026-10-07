import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import init, { blpToPng } from "wow-blp-web";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "public/dungeon-maps");
const manifestPath = path.join(root, "src/data/dungeon-maps.json");
const sourceRoot = "https://raw.githubusercontent.com/Hoizame/AtlasLootClassic_Maps/master";
const sourceRepo = "https://github.com/Hoizame/AtlasLootClassic_Maps";
const foreverMapDataUrl = "https://raw.githubusercontent.com/nwh-gaming-ab/NaowhForever/main/NaowhForever_DungeonJournal/Data/Maps.lua";
const foreverMapSourceUrl = "https://github.com/nwh-gaming-ab/NaowhForever/blob/main/NaowhForever_DungeonJournal/Data/Maps.lua";
const maps = {
  "ragefire-chasm": "RagefireChasm.blp",
  "wailing-caverns": "WailingCaverns.blp",
  deadmines: "TheDeadmines.blp",
  "shadowfang-keep": "ShadowfangKeep.blp",
  stockade: "TheStockade.blp",
  "blackfathom-deeps": "BlackfathomDeeps.blp",
  "scarlet-monastery-graveyard": "SMGraveyard.blp",
  gnomeregan: "Gnomeregan.blp",
  "scarlet-monastery-library": "SMLibrary.blp",
  "razorfen-kraul": "RazorfenKraul.blp",
  "scarlet-monastery-armory": "SMArmory.blp",
  "scarlet-monastery-cathedral": "SMCathedral.blp",
  "razorfen-downs": "RazorfenDowns.blp",
  uldaman: "Uldaman.blp",
  "zul-farrak": "ZulFarrak.blp",
  maraudon: "Maraudon.blp",
  "the-temple-of-atal-hakkar": "TheSunkenTemple.blp",
  "blackrock-depths": "BlackrockDepths.blp",
  "blackrock-spire-lower": "BlackrockSpireLower.blp",
  "dire-maul-east": "DireMaulEast.blp",
  "dire-maul-west": "DireMaulWest.blp",
  "dire-maul-north": "DireMaulNorth.blp",
  stratholme: "Stratholme.blp",
  "blackrock-spire-upper": "BlackrockSpireUpper.blp",
  scholomance: "Scholomance.blp",
};

const foreverSchematics = {
  "hall-of-thanes": { key: "HallOfThanes", required: true },
  "ruins-of-lordaeron": { key: "RuinsOfLordaeron", required: true },
  "excavation-site": { key: "ExcavationSite", required: true },
  dalaran: { key: "Dalaran", required: true },
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
  if (!Number.isInteger(floorCount) || floorCount < 1 || floorCount > 8) throw new Error(`Invalid floor count for ${key}`);
  const names = {};
  const namesBlock = block.match(/names\s*=\s*\{([^}]+)\}/s)?.[1] || "";
  for (const match of namesBlock.matchAll(/\[(\d+)\]\s*=\s*"([^"]+)"/g)) names[Number(match[1])] = match[2];
  const entranceMatch = block.match(/entrance\s*=\s*\{\s*(\d+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\}/);
  if (!entranceMatch) throw new Error(`Missing entrance pin for ${key}`);
  const entrance = { floor: Number(entranceMatch[1]), x: Number(entranceMatch[2]), y: Number(entranceMatch[3]) };
  const pins = [...block.matchAll(/\[(-?\d+)\]\s*=\s*\{\s*(\d+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\},\s*--\s*([^\r\n]+)/g)].map((match, index) => ({
    id: Number(match[1]),
    floor: Number(match[2]),
    x: Number(match[3]),
    y: Number(match[4]),
    name: match[5].trim(),
    order: index + 1,
  }));
  if (!pins.length) throw new Error(`Missing boss pins for ${key}`);
  if ([entrance, ...pins].some((pin) => pin.floor < 1 || pin.floor > floorCount || pin.x < 0 || pin.x > 1 || pin.y < 0 || pin.y > 1)) throw new Error(`Out-of-range pin for ${key}`);
  return { floorCount, names, entrance, pins };
}

function xml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function renderSchematic(dungeonId, dungeonName, floorName, floor, entrance, pins) {
  const width = 1100;
  const height = 720;
  const plot = { x: 68, y: 72, w: 964, h: 582 };
  const point = ({ x, y }) => ({ x: plot.x + x * plot.w, y: plot.y + y * plot.h });
  const route = [...(entrance?.floor === floor ? [entrance] : []), ...pins.filter((pin) => pin.floor === floor)];
  const routePoints = route.map(point);
  const path = routePoints.map((entry, index) => `${index ? "L" : "M"} ${entry.x.toFixed(1)} ${entry.y.toFixed(1)}`).join(" ");
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
    const labelX = right ? 25 : -25;
    const anchor = right ? "start" : "end";
    return `<g class="boss" transform="translate(${at.x} ${at.y})"><circle r="19"/><text class="number" text-anchor="middle" y="5">${pin.order}</text><text class="label" x="${labelX}" y="5" text-anchor="${anchor}">${xml(pin.name)}</text></g>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${xml(dungeonName)} ${xml(floorName)} route schematic</title>
  <desc id="desc">A not-to-scale route schematic generated from sourced entrance and boss coordinates.</desc>
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#10151d"/><stop offset="1" stop-color="#06090d"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <style>.grid path{stroke:#26303b;stroke-width:1;opacity:.42}.route{fill:none;stroke:#c99a3d;stroke-width:7;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:13 10;opacity:.78;filter:url(#glow)}.boss circle{fill:#111923;stroke:#f1c96a;stroke-width:4}.boss .number{fill:#fff2c8;font:700 14px system-ui}.boss .label,.entrance text{fill:#f3ead8;font:700 15px system-ui;paint-order:stroke;stroke:#070a0e;stroke-width:5px;stroke-linejoin:round}.entrance circle{fill:#173228;stroke:#55d39a;stroke-width:4}.entrance path{fill:#8ff2c2}.meta{fill:#8593a4;font:600 12px system-ui;letter-spacing:2px}.floor{fill:#f1c96a;font:700 18px system-ui}</style>
  <rect width="${width}" height="${height}" fill="url(#bg)"/><rect x="${plot.x}" y="${plot.y}" width="${plot.w}" height="${plot.h}" rx="18" fill="#0b1017" stroke="#394654" stroke-width="2"/>
  <g class="grid">${grid}</g>${path ? `<path class="route" d="${path}"/>` : ""}${entranceNode}${pinNodes}
  <text class="meta" x="${plot.x}" y="40">ROUTE SCHEMATIC · NOT TO SCALE</text><text class="floor" x="${plot.x + plot.w}" y="40" text-anchor="end">${xml(floorName)}</text>
  <text class="meta" x="${plot.x}" y="690">CONNECTORS SHOW ENCOUNTER SEQUENCE, NOT WALKABLE GEOMETRY</text>
</svg>`;
}

const wasm = await readFile(path.join(root, "node_modules/wow-blp-web/wow_blp_web_bg.wasm"));
await init({ module_or_path: wasm });
await mkdir(outputDir, { recursive: true });

const manifest = {};
for (const [dungeonId, filename] of Object.entries(maps)) {
  const response = await fetch(`${sourceRoot}/${filename}`);
  if (!response.ok) throw new Error(`${response.status} fetching ${filename}`);
  const png = blpToPng(new Uint8Array(await response.arrayBuffer()));
  const outputName = `${dungeonId}.png`;
  await writeFile(path.join(outputDir, outputName), png);
  manifest[dungeonId] = {
    kind: "instance-map",
    src: `dungeon-maps/${outputName}`,
    source: "AtlasLootClassic Maps",
    sourceUrl: `${sourceRepo}/blob/master/${filename}`,
    license: "GPL-2.0",
    quality: "Native 512×512 source texture",
  };
  process.stdout.write(`Mapped ${dungeonId} from ${filename}\n`);
}

const foreverResponse = await fetch(foreverMapDataUrl);
if (!foreverResponse.ok) throw new Error(`${foreverResponse.status} fetching Forever map coordinates`);
const foreverSource = await foreverResponse.text();
const dungeonSnapshot = JSON.parse(await readFile(path.join(root, "src/data/wow-forever.json"), "utf8"));
for (const [dungeonId, config] of Object.entries(foreverSchematics)) {
  const sourceKey = config.key;
  if (!foreverSource.includes(`    ${sourceKey} = {`)) {
    if (config.required) throw new Error(`Missing required Forever map coordinates for ${sourceKey}`);
    process.stdout.write(`No public interior coordinates yet for ${dungeonId}; leaving map pending\n`);
    continue;
  }
  const dungeon = dungeonSnapshot.dungeons.find((entry) => entry.id === dungeonId);
  if (!dungeon) throw new Error(`Missing dungeon ${dungeonId} for schematic generation`);
  const parsed = parseForeverMap(foreverSource, sourceKey);
  const floors = [];
  for (let floor = 1; floor <= parsed.floorCount; floor += 1) {
    const name = parsed.names[floor] || (parsed.floorCount === 1 ? "Dungeon route" : `Floor ${floor}`);
    const outputName = `${dungeonId}-route-${floor}.svg`;
    const pins = parsed.pins.filter((pin) => pin.floor === floor);
    if (!pins.length) throw new Error(`No pins on ${dungeonId} floor ${floor}`);
    await writeFile(path.join(outputDir, outputName), renderSchematic(dungeonId, dungeon.name, name, floor, parsed.entrance, parsed.pins));
    floors.push({ name, src: `dungeon-maps/${outputName}`, pinCount: pins.length });
  }
  manifest[dungeonId] = {
    kind: "route-schematic",
    floors,
    source: "NaowhForever dungeon map pins",
    sourceUrl: foreverMapSourceUrl,
    attribution: "Original Route Planner schematic generated from sourced in-game entrance and boss coordinates; no third-party map artwork copied.",
    quality: "Resolution-independent SVG",
    note: "Pins and encounter sequence are source-backed. Connector lines are schematic and do not claim walkable geometry.",
  };
  process.stdout.write(`Generated ${floors.length} sourced route schematic(s) for ${dungeonId}\n`);
}

const license = await fetch(`${sourceRoot}/LICENSE`);
if (!license.ok) throw new Error(`Failed to fetch AtlasLootClassic Maps license`);
await writeFile(path.join(outputDir, "LICENSE.txt"), await license.text());
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Wrote ${Object.keys(manifest).length} sourced dungeon maps and route schematics\n`);
