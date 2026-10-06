import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const generatedJson = ["src/data/wowf-context.json", "src/data/wow-forever.json"];

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => key !== "fetchedAt" && key !== "retrievedAt")
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stable(entry)]));
  }
  return value;
}

async function fromHead(file) {
  try {
    const { stdout } = await execFileAsync("git", ["show", `HEAD:${file}`], { maxBuffer: 30 * 1024 * 1024 });
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

let meaningful = false;
for (const file of generatedJson) {
  const current = JSON.parse(await readFile(new URL(`../${file}`, import.meta.url), "utf8"));
  const previous = await fromHead(file);
  if (!previous || JSON.stringify(stable(current)) !== JSON.stringify(stable(previous))) meaningful = true;
}

const { stdout: changedFiles } = await execFileAsync("git", ["diff", "--name-only", "--", "src/data/dungeon-maps.json", "public/dungeon-maps"]);
if (changedFiles.trim()) meaningful = true;

process.stdout.write(`meaningful=${meaningful}\n`);
