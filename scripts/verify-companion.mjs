import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import luaparse from "luaparse";
import { parseCompanionString, serializePlannerString, summarizeTelemetry } from "../src/companion.js";

const plan = serializePlannerString({
  route: [{ dungeonId: "ragefire-chasm" }, { dungeonId: "shadowfang-keep" }],
  wishlist: [{ id: 123 }, { id: 456 }],
  questStates: { 1: "complete", 2: "skip" },
  level: 14,
  xp: 321,
  faction: "horde",
  characterClass: "warrior",
  spec: "arms",
});
const parsedPlan = parseCompanionString(plan);
assert.equal(parsedPlan.type, "plan");
assert.deepEqual(parsedPlan.route, ["ragefire-chasm", "shadowfang-keep"]);
assert.deepEqual(parsedPlan.wishlistItemIds, [123, 456]);
assert.deepEqual(parsedPlan.completedQuestIds, ["1"]);

const character = parseCompanionString("WFRP1C|name=Test+Hero|realm=Forever|level=18|xp=420|xpmax=12000|faction=Horde|class=WARRIOR|spec=Arms|active=1,2|complete=3,4|gear=Head:123,Chest:456|bind=Orgrimmar|flights=Crossroads,Thunder+Bluff|professions=Mining:75:150");
assert.equal(character.name, "Test Hero");
assert.equal(character.characterClass, "warrior");
assert.deepEqual(character.activeQuestIds, ["1", "2"]);
assert.deepEqual(character.gear, [{ slot: "Head", itemId: 123 }, { slot: "Chest", itemId: 456 }]);
assert.deepEqual(character.professions, [{ name: "Mining", skill: 75, maximum: 150 }]);

const telemetryPayload = {
  schema: 2,
  addonVersion: "1.1.0",
  dataVersion: "forever-test",
  exportedAt: 1791374400,
  character: {
    name: "Gate Runner", realm: "Forever", level: 18, xp: 420, xpMax: 12000, restedXp: 300,
    faction: "Horde", class: "WARRIOR", spec: "Arms", talents: [{ name: "Arms", points: 9 }],
    gear: [{ slot: "Head", itemId: 123, name: "Test Helm" }], professions: [{ name: "Mining", skill: 75, maximum: 150 }],
    bindLocation: "Orgrimmar", flightPaths: ["Crossroads"], money: 12345, freeBagSlots: 11, durability: 88,
    zone: "Orgrimmar", subzone: "Valley of Strength",
  },
  quests: { active: [1, 2], complete: [3, 4] },
  runs: [{
    id: "run-1", dungeonId: "ragefire-chasm", dungeonName: "Ragefire Chasm", duration: 900,
    totalXp: 6000, combatXp: 3000, questXp: 2500, unclassifiedXp: 500, deaths: 1,
    bosses: ["Taragaman the Hungerer"], bossEngaged: ["Taragaman the Hungerer"], expectedBosses: 4,
    loot: [14145], quests: [5723], wishlistDrops: 1, status: "partial", reviewState: "saved", xpPerHour: 24000,
    events: [{ at: 1791374500, kind: "boss", label: "Taragaman the Hungerer", value: 1 }], group: [{ name: "Gate Runner" }],
  }],
  group: [{ name: "Gate Runner", class: "WARRIOR", level: 18, leader: true }],
  peers: {}, plan: { route: "ragefire-chasm" }, readiness: { active: [5723], complete: [], missing: [5728] },
};
const telemetryString = `WFRP2C|payload=${encodeURIComponent(JSON.stringify(telemetryPayload)).replaceAll("%20", "+")}`;
const telemetry = parseCompanionString(telemetryString);
assert.equal(telemetry.type, "telemetry");
assert.equal(telemetry.name, "Gate Runner");
assert.equal(telemetry.runs.length, 1);
assert.deepEqual(telemetry.runs[0].bosses, ["Taragaman the Hungerer"]);
assert.equal(telemetry.runs[0].expectedBosses, 4);
assert.equal(telemetry.runs[0].wishlistDrops, 1);
assert.equal(telemetry.runs[0].events[0].kind, "boss");
assert.equal(summarizeTelemetry(telemetry.runs).xpPerHour, 24000);
assert.throws(() => parseCompanionString("bad payload"), /Expected a WFRP character/);

await access(new URL("../addon/ForeverRouteCompanion/ForeverRouteCompanion.toc", import.meta.url));
await access(new URL("../addon/ForeverRouteCompanion/ForeverRouteCompanion.lua", import.meta.url));
await access(new URL("../addon/ForeverRouteCompanion/Theme.lua", import.meta.url));
await access(new URL("../addon/ForeverRouteCompanion/UI.lua", import.meta.url));
await access(new URL("../public/addons/ForeverRouteCompanion.zip", import.meta.url));
const data = await readFile(new URL("../addon/ForeverRouteCompanion/Data.lua", import.meta.url), "utf8");
assert.ok((data.match(/\[\d+\]=true/g) || []).length >= 100, "expected the generated dungeon quest ID catalog");
assert.match(data, /WFRP_DUNGEON_BOSSES=/, "generated addon data includes boss catalogs");
assert.match(data, /WFRP_ITEMS=/, "generated addon data includes item intelligence");
const addon = await readFile(new URL("../addon/ForeverRouteCompanion/ForeverRouteCompanion.lua", import.meta.url), "utf8");
assert.doesNotThrow(() => luaparse.parse(addon, { luaVersion: "5.1" }), "addon core is valid Lua 5.1");
assert.match(addon, /WFRP2C\|payload=/, "addon exports versioned telemetry");
assert.match(addon, /CHAT_MSG_COMBAT_XP_GAIN/, "addon records combat XP");
assert.match(addon, /COMBAT_LOG_EVENT_UNFILTERED/, "addon records boss kills");
assert.match(addon, /reviewState = "pending"/, "addon holds completed runs for post-run review");
assert.match(addon, /wishlistDrops/, "addon records wishlist drops");
const designTokens = JSON.parse(await readFile(new URL("../design/design-tokens.json", import.meta.url), "utf8"));
const designCss = await readFile(new URL("../src/design-tokens.css", import.meta.url), "utf8");
const theme = await readFile(new URL("../addon/ForeverRouteCompanion/Theme.lua", import.meta.url), "utf8");
assert.doesNotThrow(() => luaparse.parse(theme, { luaVersion: "5.1" }), "addon theme is valid Lua 5.1");
const cssTokenNames = {
  canvas: "canvas", frame: "frame", surface: "surface", elevated: "surface-2", raised: "surface-3",
  line: "line", lineSoft: "line-soft", text: "ink", muted: "muted", gold: "gold", goldBright: "gold-2",
  goldDark: "gold-dark", blue: "arcane", green: "success", successSurface: "success-surface",
  successLine: "success-line", red: "danger", warning: "warning",
};
for (const [name, hex] of Object.entries(designTokens.colors)) {
  const cssName = cssTokenNames[name];
  assert.match(designCss, new RegExp(`--${cssName}: ${hex}`, "i"), `website exposes shared ${name} token`);
}
assert.match(theme, /WFRP_THEME\s*=\s*{/, "addon consumes the shared theme palette");
const toc = await readFile(new URL("../addon/ForeverRouteCompanion/ForeverRouteCompanion.toc", import.meta.url), "utf8");
assert.match(toc, /## Version: 1\.1\.0/, "addon package advertises Run Intelligence v1.1");
assert.ok(toc.indexOf("Theme.lua") > toc.indexOf("ForeverRouteCompanion.lua") && toc.indexOf("Theme.lua") < toc.indexOf("UI.lua"), "addon loads shared theme before the UI");
const ui = await readFile(new URL("../addon/ForeverRouteCompanion/UI.lua", import.meta.url), "utf8");
assert.doesNotThrow(() => luaparse.parse(ui, { luaVersion: "5.1" }), "addon UI is valid Lua 5.1");
for (const tab of ["NOW", "CHARACTER", "RUNS", "GROUP", "SYNC"]) assert.match(ui, new RegExp(`"${tab}"`), `addon UI includes ${tab} view`);

process.stdout.write("Companion exchange verification passed.\n");
