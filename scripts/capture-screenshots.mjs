import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const browser = await chromium.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox"] });
await mkdir(new URL("../test-results/", import.meta.url), { recursive: true });
try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  await desktop.goto("http://127.0.0.1:4179", { waitUntil: "networkidle" });
  await desktop.screenshot({ path: new URL("../test-results/planner-desktop.png", import.meta.url).pathname, fullPage: true });
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await mobile.goto("http://127.0.0.1:4179", { waitUntil: "networkidle" });
  await mobile.screenshot({ path: new URL("../test-results/planner-mobile.png", import.meta.url).pathname, fullPage: true });
} finally {
  await browser.close();
}
