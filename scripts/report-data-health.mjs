import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const contextBytes = await readFile(new URL("../src/data/wowf-context.json", import.meta.url));
const snapshotBytes = await readFile(new URL("../src/data/wow-forever.json", import.meta.url));
const context = JSON.parse(contextBytes);
const snapshot = JSON.parse(snapshotBytes);
const questGroups = snapshot.dungeons.reduce((sum, dungeon) => sum + dungeon.quests.length, 0);
const loot = snapshot.dungeons.reduce((sum, dungeon) => sum + dungeon.loot.length, 0);
const sourceOnly = snapshot.dungeons.reduce((sum, dungeon) => sum + dungeon.quests.filter((quest) => quest.dataStatus === "source-only").length, 0);
const hash = createHash("sha256").update(contextBytes).update(snapshotBytes).digest("hex").slice(0, 16);

process.stdout.write([
  "## WoW Forever data health",
  "",
  `- Snapshot fingerprint: \`${hash}\``,
  `- WOWF.IO English pages: **${context.inventory.totalEnglishPages}**`,
  `- Normalized quest-chain records: **${context.dataHealth.quests}**`,
  `- Class/spec leveling guides: **${context.dataHealth.levelingGuides}**`,
  `- Zone and instance records: **${context.dataHealth.zones}**`,
  `- Unresolved coordinates: **${context.dataHealth.unresolvedCoordinates}**`,
  `- Planner catalog: **${snapshot.dungeons.length} dungeons · ${loot} loot · ${questGroups} quest groups**`,
  `- Newly linked source-only dungeon quests: **${sourceOnly}**`,
  "",
  "All retained context records preserve source URL, source last-modified time, retrieval time, and review state. Unverified XP remains excluded from projections.",
  "",
].join("\n"));
