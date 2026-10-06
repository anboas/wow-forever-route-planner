import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const browser = await chromium.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox"] });
const baseUrl = process.env.CAPTURE_BASE_URL || "http://127.0.0.1:4173";
await mkdir(new URL("../test-results/", import.meta.url), { recursive: true });
try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  await desktop.goto(baseUrl, { waitUntil: "networkidle" });
  await desktop.screenshot({ path: new URL("../test-results/planner-desktop.png", import.meta.url).pathname, fullPage: true });
  await desktop.getByRole("button", { name: "Loot", exact: true }).click();
  await desktop.getByPlaceholder("Search item, boss, slot, or dungeon").fill("Fang of Magmatus");
  await desktop.locator(".loot-card").first().hover({ position: { x: 60, y: 20 } });
  await desktop.screenshot({ path: new URL("../test-results/loot-tooltip-desktop.png", import.meta.url).pathname, fullPage: false });
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await mobile.goto(baseUrl, { waitUntil: "networkidle" });
  await mobile.screenshot({ path: new URL("../test-results/planner-mobile.png", import.meta.url).pathname, fullPage: true });
  await mobile.getByRole("button", { name: "Quests", exact: true }).click();
  await mobile.locator(".quest-archive-row").first().click();
  await mobile.screenshot({ path: new URL("../test-results/quest-tray-mobile.png", import.meta.url).pathname, fullPage: false });
} finally {
  await browser.close();
}
