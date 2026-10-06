import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import init, { blpToPng } from "wow-blp-web";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "public/dungeon-maps");
const manifestPath = path.join(root, "src/data/dungeon-maps.json");
const sourceRoot = "https://raw.githubusercontent.com/Hoizame/AtlasLootClassic_Maps/master";
const sourceRepo = "https://github.com/Hoizame/AtlasLootClassic_Maps";
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
    src: `dungeon-maps/${outputName}`,
    source: "AtlasLootClassic Maps",
    sourceUrl: `${sourceRepo}/blob/master/${filename}`,
    license: "GPL-2.0",
  };
  process.stdout.write(`Mapped ${dungeonId} from ${filename}\n`);
}

const license = await fetch(`${sourceRoot}/LICENSE`);
if (!license.ok) throw new Error(`Failed to fetch AtlasLootClassic Maps license`);
await writeFile(path.join(outputDir, "LICENSE.txt"), await license.text());
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Wrote ${Object.keys(manifest).length} sourced dungeon maps\n`);
