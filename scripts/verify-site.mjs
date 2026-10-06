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

  await page.getByRole("spinbutton", { name: "Level", exact: true }).fill("14");
  await page.getByRole("spinbutton", { name: "Current XP", exact: true }).fill("12000");
  await page.waitForTimeout(50);
  assert.match(await page.locator(".summary-card").first().innerText(), /Level 16/);

  await page.getByRole("button", { name: "Dungeons", exact: true }).click();
  assert.equal(await page.locator(".dungeon-card").count(), 34);
  await page.getByRole("button", { name: "Loot", exact: true }).click();
  assert.ok(await page.locator(".loot-row").count() >= 100);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Route Planner", exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, "mobile overflow");
  assert.equal(await page.locator(".route-step").count(), 3);
  process.stdout.write("Browser verification passed at desktop and mobile widths.\n");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
