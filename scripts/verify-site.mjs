import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

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

  await page.locator(".quest-row-trigger").first().focus();
  await page.locator(".wow-tooltip").waitFor({ state: "visible" });
  assert.match(await page.locator(".wow-tooltip").innerText(), /Experience:/);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".wow-tooltip").count(), 0, "route quest tooltip closes with Escape");

  await page.getByRole("spinbutton", { name: "Level", exact: true }).fill("14");
  await page.getByRole("spinbutton", { name: "Current XP", exact: true }).fill("12000");
  await page.waitForTimeout(50);
  assert.match(await page.locator(".summary-card").first().innerText(), /Level 16/);

  await page.getByRole("button", { name: "Optimize route", exact: true }).click();
  await page.locator(".optimization-note").waitFor({ state: "visible" });
  assert.match(await page.locator(".optimization-note").innerText(), /external XP/i);
  assert.equal(await page.locator(".bridge-input").count(), 3);

  await page.getByRole("button", { name: "Dungeons", exact: true }).click();
  assert.equal(await page.locator(".dungeon-card").count(), 34);
  await page.getByRole("button", { name: /Ragefire Chasm/ }).click();
  assert.ok(await page.locator(".detail-panel .inspectable-entry").count() > 0, "dungeon detail exposes quests and loot");
  assert.equal(await page.locator(".dungeon-map-panel img").count(), 1, "Ragefire Chasm exposes a verified instance map");

  await page.getByRole("button", { name: "Quests", exact: true }).click();
  assert.equal(await page.locator(".quest-archive-row").count(), 124, "Horde view hides Alliance-only quests");
  assert.equal((await page.locator(".quest-archive-row > div:nth-child(2) small").allTextContents()).some((value) => value === "Alliance"), false);
  await page.getByRole("combobox").last().selectOption("rewards-only");
  assert.equal(await page.locator(".quest-archive-row").count(), 67);
  await page.getByRole("combobox").last().selectOption("all");
  await page.locator(".quest-archive-row").first().focus();
  await page.locator(".wow-tooltip").waitFor({ state: "visible" });
  assert.match(await page.locator(".wow-tooltip").innerText(), /Dungeon/);
  await page.keyboard.press("Escape");
  await page.getByPlaceholder("Search quest, objective, or dungeon").fill("The Power to Destroy");
  await page.locator(".quest-archive-row").first().click();
  await page.locator(".quest-tray").waitFor({ state: "visible" });
  assert.match(await page.locator(".quest-tray").innerText(), /Rewards\s+3/);
  assert.equal(await page.locator(".reward-card").count(), 3);
  await page.locator(".reward-card").first().focus();
  await page.locator(".wow-tooltip").waitFor({ state: "visible" });
  assert.match(await page.locator(".wow-tooltip").innerText(), /Suggested fit/i);
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

  await page.getByRole("button", { name: "Loot", exact: true }).click();
  assert.ok(await page.locator(".loot-dungeon-group").count() > 10, "default loot view groups by dungeon");
  assert.ok(await page.locator(".boss-loot-group").count() > 10, "loot is grouped by boss/source");
  await page.getByRole("button", { name: "Priest", exact: true }).click();
  assert.match(await page.locator(".result-count").innerText(), /Priest-usable gear/);
  await page.getByRole("button", { name: /Every class/ }).click();
  await page.getByRole("button", { name: "All items", exact: true }).click();
  assert.equal(await page.locator(".loot-row").count(), 1621);
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
  assert.match(await page.evaluate(() => window.__openedItem), /^https:\/\/www\.wowhead\.com\/classic\//);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Quests", exact: true }).click();
  await page.getByPlaceholder("Search quest, objective, or dungeon").fill("");
  await page.locator(".quest-archive-row").first().focus();
  await page.locator(".wow-tooltip").waitFor({ state: "visible" });
  const tooltipBox = await page.locator(".wow-tooltip").boundingBox();
  assert.ok(tooltipBox && tooltipBox.x >= 0 && tooltipBox.y >= 0 && tooltipBox.x + tooltipBox.width <= 390 && tooltipBox.y + tooltipBox.height <= 844, "mobile tooltip stays in viewport");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Dungeons", exact: true }).click();
  assert.equal(await page.locator(".dungeon-loot-column .class-filter-strip.compact button").count(), 10, "mobile dungeon detail keeps every class filter reachable");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, "mobile dungeon detail overflow");
  await page.getByRole("button", { name: "Route Planner", exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, "mobile overflow");
  assert.equal(await page.locator(".route-step").count(), 3);
  process.stdout.write("Browser verification passed at desktop and mobile widths.\n");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
