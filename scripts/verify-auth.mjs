import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";

const port = 8792;
const base = `http://127.0.0.1:${port}`;
const persistence = await mkdtemp(join(tmpdir(), "wfrp-auth-"));
const child = spawn("npx", ["wrangler", "pages", "dev", "dist", "--port", String(port), "--persist-to", persistence], { detached: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NO_COLOR: "1" } });
let output = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });

async function ready() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { const response = await fetch(`${base}/api/auth/status`); if (response.ok) return; } catch { /* keep waiting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Pages auth runtime did not start.\n${output.slice(-2000)}`);
}

function browserPath() {
  return process.env.CHROMIUM_PATH || ["/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((candidate) => {
    try { return require("node:fs").existsSync(candidate); } catch { return false; }
  });
}

let browser;
try {
  await ready();
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium-browser", args: ["--no-sandbox"] }).catch(async () => chromium.launch({ headless: true, args: ["--no-sandbox"] }));
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
  const suffix = Date.now();
  const ownerEmail = `owner-${suffix}@example.test`;
  const ownerPassword = `Owner-${suffix}-Secure!`;
  const registeredEmail = `registered-${suffix}@example.test`;
  const registeredPassword = `Registered-${suffix}-Secure!`;
  const playerEmail = `player-${suffix}@example.test`;
  const temporaryPassword = `Temporary-${suffix}!`;
  const permanentPassword = `Permanent-${suffix}!`;

  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Display name").fill("Owner");
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password", { exact: true }).fill(ownerPassword);
  await page.getByLabel("Confirm password").fill(ownerPassword);
  await page.getByRole("button", { name: "Create owner account" }).click();
  try { await page.locator(".character-switcher").waitFor({ timeout: 12_000 }); }
  catch (error) { throw new Error(`Owner setup did not reach the character workspace. Screen: ${await page.locator("body").innerText()}\n${error.message}`); }

  await page.locator(".character-switcher").click();
  let registerDialog = page.getByRole("dialog", { name: "Account & characters" });
  await registerDialog.getByRole("button", { name: "Account", exact: true }).click();
  await registerDialog.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "New to Forever Intelligence? Create an account" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const registrationWidth = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  if (registrationWidth.scroll > registrationWidth.client + 1) throw new Error(`Open registration overflows on mobile: ${JSON.stringify(registrationWidth)}`);
  await page.getByLabel("Display name").fill("Open Registration Player");
  await page.getByLabel("Email").fill(registeredEmail);
  await page.getByLabel("Password", { exact: true }).fill(registeredPassword);
  await page.getByLabel("Confirm password").fill(registeredPassword);
  await page.getByRole("button", { name: "Create player account" }).click();
  await page.locator(".character-switcher").waitFor({ timeout: 12_000 });
  const registrationStatus = await page.evaluate(() => fetch("/api/auth/status").then((response) => response.json()));
  if (registrationStatus.user?.roleId !== "analyst" || !registrationStatus.user?.canWrite || registrationStatus.user?.canManageUsers) throw new Error(`Open registration did not create a normal Player: ${JSON.stringify(registrationStatus.user)}`);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator(".character-switcher").click();
  registerDialog = page.getByRole("dialog", { name: "Account & characters" });
  if (await registerDialog.getByRole("button", { name: "People" }).count()) throw new Error("Self-registered player can see account administration.");
  await registerDialog.getByRole("button", { name: "Account", exact: true }).click();
  await registerDialog.getByRole("button", { name: "Sign out" }).click();

  await page.getByRole("button", { name: "New to Forever Intelligence? Create an account" }).click();
  await page.getByLabel("Display name").fill("Duplicate Registration");
  await page.getByLabel("Email").fill(registeredEmail);
  await page.getByLabel("Password", { exact: true }).fill(registeredPassword);
  await page.getByLabel("Confirm password").fill(registeredPassword);
  await page.getByRole("button", { name: "Create player account" }).click();
  await page.getByText("An account with that email already exists.").waitFor();
  await page.getByRole("button", { name: "Already have an account? Sign in" }).click();
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password").fill(ownerPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".character-switcher").waitFor();

  await page.locator(".character-switcher").click();
  const accountDialog = page.getByRole("dialog", { name: "Account & characters" });
  await accountDialog.waitFor();
  await accountDialog.getByLabel("Name", { exact: true }).fill("Auth Test Mage");
  await accountDialog.getByLabel("Class").selectOption("mage");
  await accountDialog.getByRole("button", { name: "Add character" }).click();
  await page.locator(".character-switcher", { hasText: "Auth Test Mage" }).waitFor();
  await page.locator(".character-switcher").click();
  await page.getByRole("button", { name: "People" }).click();
  const form = page.locator(".account-create-form");
  await form.getByLabel("Name", { exact: true }).fill("Party Player");
  await form.getByLabel("Email").fill(playerEmail);
  await form.getByLabel("Role").selectOption("analyst");
  await form.getByLabel("Temporary password").fill(temporaryPassword);
  await form.getByRole("button", { name: "Create account" }).click();
  await page.getByText(/temporary password must be replaced/i).waitFor();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByRole("button", { name: "Sign out" }).click();

  await page.getByLabel("Email").fill(playerEmail);
  await page.getByLabel("Password").fill(temporaryPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("heading", { name: "Choose your permanent password" }).waitFor();
  await page.getByLabel("Temporary password").fill(temporaryPassword);
  await page.getByLabel("New password").fill(permanentPassword);
  await page.getByLabel("Confirm password").fill(permanentPassword);
  await page.getByRole("button", { name: "Replace temporary password" }).click();
  await page.locator(".character-switcher").waitFor();
  await page.locator(".character-switcher").click();
  if (await page.getByRole("button", { name: "People" }).count()) throw new Error("Managed player can see account administration.");
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByRole("button", { name: "Sign out" }).click();

  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password").fill(ownerPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".character-switcher").waitFor();

  const partyProof = await page.evaluate(async () => {
    const charactersResponse = await fetch("/api/characters");
    const charactersBody = await charactersResponse.json();
    const character = charactersBody.characters.find((entry) => entry.name === "Auth Test Mage") || charactersBody.characters[0];
    const nextState = {
      ...(character.state || {}),
      characterMeta: { ...(character.state?.characterMeta || {}), name: character.name, realm: character.realm },
      characterClass: character.characterClass,
      spec: character.spec,
      faction: character.faction,
      level: 19,
      xp: 725,
      route: [{ dungeonId: "ragefire-chasm" }],
      wishlist: [{ id: 14145 }],
      telemetry: { ...(character.state?.telemetry || {}), runs: [{ dungeonId: "ragefire-chasm", dungeonName: "Ragefire Chasm", endedAt: 1791374400, totalXp: 6000, status: "complete" }] },
    };
    const saveResponse = await fetch(`/api/characters/${character.id}/state`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ state: nextState, revision: character.revision }) });
    const partyResponse = await fetch("/api/party");
    return { saveStatus: saveResponse.status, partyStatus: partyResponse.status, party: (await partyResponse.json()).party || [] };
  });
  if (partyProof.saveStatus !== 200 || partyProof.partyStatus !== 200) throw new Error(`Shared party API failed: ${JSON.stringify(partyProof)}`);
  if (!partyProof.party.some((member) => member.name === "Auth Test Mage" && member.nextDungeonId === "ragefire-chasm" && member.wishlistCount === 1)) throw new Error(`Shared party presence did not reflect the active character: ${JSON.stringify(partyProof.party)}`);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/gear/`, { waitUntil: "domcontentloaded" });
  try { await page.locator(".shared-party-grid article", { hasText: "Auth Test Mage" }).waitFor({ timeout: 12_000 }); }
  catch (error) { throw new Error(`Shared party dashboard did not hydrate. Screen: ${await page.locator("body").innerText()}\nPage errors: ${pageErrors.join(" | ")}\n${error.message}`); }
  const mobileWidth = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  if (mobileWidth.scroll > mobileWidth.client + 1) throw new Error(`Authenticated mobile workspace overflows: ${JSON.stringify(mobileWidth)}`);

  const viewerRole = await page.evaluate(async (targetEmail) => {
    const users = await fetch("/api/auth/users").then((response) => response.json());
    const target = users.users.find((entry) => entry.email === targetEmail);
    const response = await fetch(`/api/auth/users/${target.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: "viewer" }) });
    return { status: response.status, body: await response.json() };
  }, playerEmail);
  if (viewerRole.status !== 200 || viewerRole.body.user.roleId !== "viewer") throw new Error(`Owner could not assign viewer access: ${JSON.stringify(viewerRole)}`);
  await page.evaluate(() => fetch("/api/auth/logout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(playerEmail);
  await page.getByLabel("Password").fill(permanentPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".character-switcher").waitFor();
  const viewerWriteStatus = await page.evaluate(async () => (await fetch("/api/characters", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Forbidden write" }) })).status);
  if (viewerWriteStatus !== 403) throw new Error(`Viewer character write returned ${viewerWriteStatus}, expected 403.`);

  const anonymous = await page.context().request.get(`${base}/api/characters`, { headers: { cookie: "" } });
  if (anonymous.status() !== 401) throw new Error(`Anonymous character API returned ${anonymous.status()}, expected 401.`);

  const anonymousParty = await page.context().request.get(`${base}/api/party`, { headers: { cookie: "" } });
  if (anonymousParty.status() !== 401) throw new Error(`Anonymous party API returned ${anonymousParty.status()}, expected 401.`);

  process.stdout.write("Owner setup, open registration, duplicate rejection, managed-user, forced-password, character ownership, shared-party presence, viewer authorization, mobile containment, and anonymous-boundary verification passed.\n");
} finally {
  if (browser) await browser.close();
  try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
}
