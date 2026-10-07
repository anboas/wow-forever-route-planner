import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import snapshot from "../src/data/wow-forever.json" with { type: "json" };

const port = 4179;
const baseUrl = `http://127.0.0.1:${port}`;
const candidates = [process.env.CHROMIUM_PATH, "/usr/bin/chromium-browser", "/usr/bin/chromium", "/usr/bin/google-chrome"].filter(Boolean);
const executablePath = candidates.find(existsSync);
assert.ok(executablePath, "No Chromium executable found");

const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port)], {
  stdio: ["ignore", "pipe", "pipe"],
});

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Vite server did not become ready");
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  assert.equal(await page.locator(".route-step").count(), 3);
  assert.match(await page.locator("body").innerText(), /Ragefire Chasm/);
  assert.match(await page.locator("body").innerText(), /Ruins of Lordaeron/);
  assert.match(await page.locator("body").innerText(), /Shadowfang Keep/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, "desktop overflow");
  assert.equal(await page.locator(".route-card-details").count(), 0, "route stops are collapsed by default");
  await page.locator(".route-expand").first().click();
  assert.equal(await page.locator(".route-card-details").count(), 1, "a route stop expands on demand");

  await page.locator(".quest-row-trigger").first().focus();
  await page.locator(".wow-tooltip").waitFor({ state: "visible" });
  assert.match(await page.locator(".wow-tooltip").innerText(), /Experience:/);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".wow-tooltip").count(), 0, "route quest tooltip closes with Escape");
  const firstQuestState = page.locator(".quest-state-select").first();
  await firstQuestState.selectOption("skip");
  assert.match(await page.locator(".quest-row").first().innerText(), /skipped/i);
  await firstQuestState.selectOption("auto");
  await page.getByRole("spinbutton", { name: "XP per clear", exact: true }).fill("1000");
  await page.getByRole("spinbutton", { name: "Clears", exact: true }).fill("2");
  await page.getByRole("combobox", { name: "Rested bonus", exact: true }).selectOption("50");
  assert.match(await page.locator(".route-step").first().innerText(), /3,000/);
  await page.getByRole("spinbutton", { name: "XP per clear", exact: true }).fill("0");
  await page.getByRole("spinbutton", { name: "Clears", exact: true }).fill("1");
  await page.getByRole("combobox", { name: "Rested bonus", exact: true }).selectOption("0");

  await page.getByRole("spinbutton", { name: "Level", exact: true }).fill("14");
  await page.getByRole("spinbutton", { name: "Current XP", exact: true }).fill("12000");
  await page.waitForTimeout(50);
  assert.match(await page.locator(".summary-card").first().innerText(), /Level 16/);

  await page.getByRole("button", { name: "Optimize route", exact: true }).click();
  await page.locator(".optimization-note").waitFor({ state: "visible" });
  assert.equal(await page.locator(".optimizer-candidates > article").count(), 3, "optimizer exposes three strategies");
  assert.match(await page.locator(".optimizer-candidates").innerText(), /Fastest leveling[\s\S]*Maximum completion[\s\S]*Balanced/);
  await page.getByRole("button", { name: "Apply Balanced", exact: true }).click();
  assert.match(await page.locator(".optimization-note").innerText(), /travel minutes/i);
  assert.equal(await page.locator(".route-card-details").count(), 0, "applying an optimizer result restores compact stops");

  await page.getByRole("button", { name: "Dungeons", exact: true }).click();
  assert.equal(await page.locator(".dungeon-card").count(), 34);
  await page.getByRole("button", { name: /Ragefire Chasm/ }).click();
  assert.ok(await page.locator(".detail-panel .inspectable-entry").count() > 0, "dungeon detail exposes quests and loot");
  assert.equal(await page.locator(".dungeon-map-panel img").count(), 1, "Ragefire Chasm exposes a verified instance map");
  assert.equal(await page.locator('.dungeon-map-panel a[title="Open full-resolution map"]').count(), 1, "map can be opened at source resolution");
  assert.match(await page.locator(".dungeon-map-panel .map-quality").innerText(), /512|native/i, "map quality is disclosed");
  assert.equal(await page.getByRole("button", { name: "Add to route", exact: true }).count(), 1);
  assert.equal(await page.getByRole("button", { name: "Plan next", exact: true }).count(), 1);
  assert.ok(await page.locator(".encounter-order a").count() >= 4, "map panel exposes a sourced encounter index");
  await page.getByRole("button", { name: "Close dungeon details", exact: true }).click();
  await page.getByPlaceholder("Search dungeon or zone").fill("Hall of Thanes");
  await page.getByRole("button", { name: /Hall of Thanes/ }).click();
  assert.equal(await page.locator(".dungeon-map-panel.map-schematic img").count(), 1, "Hall of Thanes exposes a coordinate-derived route schematic");
  assert.match(await page.locator(".dungeon-map-panel").innerText(), /Sourced route schematic[\s\S]*no third-party map artwork copied/i);
  assert.match(await page.locator(".dungeon-map-panel img").getAttribute("alt"), /route schematic/i);
  await page.getByRole("button", { name: "Close dungeon details", exact: true }).click();
  await page.getByPlaceholder("Search dungeon or zone").fill("City of Dalaran");
  await page.getByRole("button", { name: /City of Dalaran/ }).click();
  assert.equal(await page.locator(".map-floor-tabs button").count(), 2, "City of Dalaran exposes both sourced floors");
  await page.getByRole("button", { name: "City of Dalaran", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "City of Dalaran", exact: true }).getAttribute("aria-pressed"), "true");

  await page.getByRole("button", { name: "Quests", exact: true }).click();
  const expectedHordeQuests = snapshot.dungeons.flatMap((dungeon) => dungeon.quests).filter((quest) => !quest.faction || quest.faction === "both" || quest.faction === "horde").length;
  assert.ok(await page.locator(".quest-archive-row").count() >= expectedHordeQuests, "Horde view includes dungeon quests and their browsable prerequisites");
  assert.equal((await page.locator(".quest-archive-row > div:nth-child(2) small").allTextContents()).some((value) => value === "Alliance"), false);
  await page.getByRole("combobox").last().selectOption("rewards-only");
  assert.equal(await page.locator(".quest-archive-row").count(), 67);
  await page.getByRole("combobox").last().selectOption("all");
  await page.locator(".quest-archive-row").first().focus();
  await page.locator(".wow-tooltip").waitFor({ state: "visible" });
  assert.match(await page.locator(".wow-tooltip").innerText(), /Dungeon/);
  await page.keyboard.press("Escape");
  await page.getByPlaceholder("Search quest, giver, zone, or dungeon").fill("Hidden Enemies");
  await page.locator(".quest-archive-row").first().click();
  await page.locator(".quest-tray").waitFor({ state: "visible" });
  assert.match(await page.locator(".quest-tray").innerText(), /Before you go[\s\S]*Start with:[\s\S]*Prerequisite quests/i, "quest tray makes the prerequisite pickup route explicit");
  assert.ok(await page.locator(".quest-location-card").count() >= 1, "quest tray includes sourced pickup and turn-in location mapping");
  assert.match(await page.locator(".quest-location-card").first().innerText(), /Pick up(?: & turn in| from)/i, "same-NPC pickup and turn-in locations collapse without losing meaning");
  assert.ok(await page.locator(".quest-map-pin").count() >= 1, "a sourced quest coordinate renders as a map pin");
  assert.equal((await page.locator('.quest-tray a[href*="wowhead.com"]').count()), 0, "quest tray contains no non-Forever quest links");
  assert.match(await page.locator(".quest-tray footer a").first().getAttribute("href"), /^https:\/\/wowf\.io\//, "external quest link targets the Forever source");
  await page.getByRole("button", { name: /Start with:/ }).click();
  assert.match(await page.locator(".quest-tray h2").innerText(), /Hidden Enemies|Quest/, "prerequisite quests browse inside the tool");
  assert.equal(await page.locator(".tray-back").count(), 1, "internal prerequisite navigation keeps a back path");
  await page.keyboard.press("Escape");

  await page.getByPlaceholder("Search quest, giver, zone, or dungeon").fill("The Power to Destroy");
  await page.locator(".quest-archive-row").first().click();
  await page.locator(".quest-tray").waitFor({ state: "visible" });
  assert.match(await page.locator(".quest-tray").innerText(), /Rewards\s+3/);
  assert.equal(await page.locator(".reward-card").count(), 3);
  await page.locator(".reward-card").first().focus();
  await page.locator(".wow-tooltip").waitFor({ state: "visible" });
  assert.match(await page.locator(".wow-tooltip").innerText(), /recommendation/i);
  const tooltipLayering = await page.evaluate(() => Number(getComputedStyle(document.querySelector(".wow-tooltip")).zIndex) > Number(getComputedStyle(document.querySelector(".tray-layer")).zIndex));
  assert.equal(tooltipLayering, true, "reward tooltips render above the pinned quest tray");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".quest-tray").count(), 1, "first Escape closes only the nested reward tooltip");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".quest-tray").count(), 0, "second Escape closes the pinned quest tray");

  await page.getByRole("button", { name: "Dungeons", exact: true }).click();
  assert.equal(await page.locator('.dungeon-loot-column [role="group"][aria-label="Filter loot by class"]').count(), 1, "dungeon loot exposes class filters");
  assert.ok(await page.locator(".dungeon-loot-column .source-quest").count() > 0, "dungeon loot identifies quest rewards");
  assert.ok(await page.locator(".dungeon-loot-column .source-boss").count() > 0, "dungeon loot identifies boss drops");
  const warriorLootCount = await page.locator(".dungeon-loot-column .inspectable-entry").count();
  await page.locator(".dungeon-loot-column").getByRole("button", { name: "Priest", exact: true }).click();
  const priestLootCount = await page.locator(".dungeon-loot-column .inspectable-entry").count();
  assert.notEqual(priestLootCount, warriorLootCount, "dungeon class filter changes the visible loot set");
  await page.locator(".dungeon-loot-column").getByRole("button", { name: "Quest", exact: true }).click();
  assert.ok(await page.locator(".dungeon-loot-column .inspectable-entry").count() > 0, "source toggle exposes quest rewards");
  await page.locator('.dungeon-loot-column [role="group"][aria-label="Filter loot by source"]').getByRole("button", { name: "All", exact: true }).click();
  const dungeonItem = page.locator(".dungeon-loot-column .inspectable-entry").first();
  await dungeonItem.locator('.item-actions button[aria-label^="Add"]').click();
  await dungeonItem.locator('.item-actions button[aria-label^="Equip"]').click();

  await page.getByRole("button", { name: "Loot", exact: true }).click();
  assert.ok(await page.locator(".loot-dungeon-group").count() > 10, "default loot view groups by dungeon");
  assert.ok(await page.locator(".boss-loot-group").count() > 10, "loot is grouped by boss/source");
  await page.getByRole("button", { name: "Priest", exact: true }).click();
  assert.match(await page.locator(".result-count").innerText(), /Priest Discipline/);
  await page.getByRole("button", { name: /Every class/ }).click();
  await page.getByRole("button", { name: "All items", exact: true }).click();
  assert.ok(await page.locator(".loot-row").count() > 1400, "all faction-visible loot remains reachable");
  await page.getByPlaceholder("Search item, boss, slot, or dungeon").fill("Catacomb Cloak");
  assert.equal(await page.locator(".loot-row").count(), 1);
  const itemRow = page.locator(".loot-row").filter({ hasText: "Catacomb Cloak" });
  await itemRow.hover({ position: { x: 80, y: 25 } });
  await page.locator(".wow-tooltip").waitFor({ state: "visible" });
  assert.match(await page.locator(".wow-tooltip").innerText(), /Attack Power/);
  const itemBox = await itemRow.boundingBox();
  const hoverBox = await page.locator(".wow-tooltip").boundingBox();
  assert.ok(itemBox && hoverBox && Math.abs(hoverBox.y - (itemBox.y + 25)) < 220, "item tooltip appears near the hovered row");
  await page.keyboard.press("Escape");
  await page.evaluate(() => { window.__openedItem = null; window.open = (url) => { window.__openedItem = url; return null; }; });
  await itemRow.click();
  assert.match(await page.evaluate(() => window.__openedItem), /^https:\/\/wowf\.io\/en\/dungeons\/.+#item-/);
  assert.equal(await page.locator('a[href*="wowhead.com"]').count(), 0, "application links do not send items or quests to non-Forever versions");

  await page.getByRole("button", { name: /My Gear/ }).click();
  assert.equal(await page.locator(".wishlist-card").count(), 1, "wishlist persists into the profile workspace");
  assert.equal(await page.locator(".loadout-slot").count(), 1, "equipped comparison baseline persists");
  await page.getByRole("button", { name: "Add member", exact: true }).click();
  assert.equal(await page.locator(".party-member").count(), 1, "party roster supports additional members");
  assert.match(await page.locator(".integration-health").innerText(), /271[\s\S]*35[\s\S]*26/, "full-corpus health is visible");
  assert.match(await page.locator(".addon-download").getAttribute("href"), /ForeverRouteCompanion\.zip$/);
  const companionText = page.getByRole("textbox", { name: "Companion exchange text" });
  await companionText.fill("WFRP1C|name=Gate+Runner|realm=Forever|level=18|xp=420|xpmax=12000|faction=Horde|class=WARRIOR|active=1,2|complete=3,4|gear=Head:123|bind=Orgrimmar|flights=Crossroads,Thunder+Bluff|professions=Mining:75:150");
  await page.getByRole("button", { name: "Import character / plan", exact: true }).click();
  assert.match(await page.locator(".companion-panel").innerText(), /Gate Runner · Forever[\s\S]*2 active quests[\s\S]*2 completed dungeon quests/);
  await page.getByRole("button", { name: "Copy route for addon", exact: true }).click();
  assert.match(await companionText.inputValue(), /^WFRP1P\|/);

  await page.getByRole("button", { name: "Loot", exact: true }).click();
  await page.getByPlaceholder("Search item, boss, slot, or dungeon").fill("");
  await page.getByRole("button", { name: /Wishlist only/ }).click();
  assert.equal(await page.locator(".loot-row").count(), 1, "wishlist-only filter uses the persistent gear profile");
  await page.getByRole("button", { name: /Wishlist only/ }).click();

  await page.getByRole("button", { name: "Route", exact: true }).click();
  await page.getByPlaceholder("Weekend dungeon circuit").fill("Horde starter");
  await page.getByRole("button", { name: "Save preset", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Horde starter", exact: true }).count(), 1, "named route preset is saved");
  await page.getByRole("button", { name: "Share", exact: true }).click();
  assert.match(page.url(), /[?&]plan=/, "share action serializes route and loot filters into the URL");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Quests", exact: true }).click();
  await page.getByPlaceholder("Search quest, giver, zone, or dungeon").fill("");
  await page.locator(".quest-archive-row").first().focus();
  await page.locator(".wow-tooltip").waitFor({ state: "visible" });
  const tooltipBox = await page.locator(".wow-tooltip").boundingBox();
  assert.ok(tooltipBox && tooltipBox.x >= 0 && tooltipBox.y >= 0 && tooltipBox.x + tooltipBox.width <= 390 && tooltipBox.y + tooltipBox.height <= 844, "mobile tooltip stays in viewport");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Dungeons", exact: true }).click();
  assert.equal(await page.locator(".dungeon-loot-column .class-filter-strip.compact button").count(), 10, "mobile dungeon detail keeps every class filter reachable");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, "mobile dungeon detail overflow");
  await page.getByRole("button", { name: "Route", exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, "mobile overflow");
  assert.equal(await page.locator(".route-step").count(), 3);
  assert.equal(await page.locator(".mobile-command-dock").isVisible(), true, "mobile route dock remains visible");
  await page.locator(".mobile-command-dock").getByRole("button", { name: /Optimize/ }).click();
  assert.equal(await page.locator(".optimizer-candidates > article").count(), 3, "mobile optimizer keeps all strategies reachable");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, "mobile optimizer overflow");
  await page.getByRole("button", { name: "Apply Balanced", exact: true }).click();
  await page.locator(".route-expand").first().click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, "expanded mobile stop overflow");
  const firstStep = page.locator(".route-step").first();
  await firstStep.getByRole("spinbutton", { name: "Ending level", exact: true }).fill("14");
  await firstStep.getByRole("spinbutton", { name: "Ending XP", exact: true }).fill("1000");
  await firstStep.getByRole("button", { name: "Repair remaining route", exact: true }).click();
  assert.equal(await page.locator(".route-step").count(), 2, "actual result repair removes completed stops and rebuilds the remainder");
  assert.match(await page.locator(".optimization-note").innerText(), /Actual result saved/);
  process.stdout.write("Browser verification passed at desktop and mobile widths.\n");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
