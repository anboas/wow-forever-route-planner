import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const dist = join(root, "dist");
const template = await readFile(join(dist, "index.html"), "utf8");
const snapshot = JSON.parse(await readFile(join(root, "src/data/wow-forever.json"), "utf8"));

const pages = [
  { path: "route", title: "Dungeon Route Planner", description: "Plan WoW Forever dungeon routes against Forever quest XP and your character progress." },
  { path: "dungeons", title: "WoW Forever Dungeons", description: "Browse every WoW Forever dungeon with maps, quests, encounters, and loot." },
  { path: "quests", title: "WoW Forever Dungeon Quests", description: "Browse WoW Forever dungeon quests, prerequisites, pickup locations, rewards, and XP." },
  { path: "loot", title: "WoW Forever Dungeon Loot", description: "Filter WoW Forever dungeon loot by boss, class, slot, source, rarity, and level." },
  { path: "gear", title: "My Gear and Wishlist", description: "Manage your WoW Forever gear, wishlist, party, and companion addon exchange." },
  ...snapshot.dungeons.map((dungeon) => ({
    path: `dungeons/${dungeon.id}`,
    title: `${dungeon.name} | WoW Forever Dungeon`,
    description: `${dungeon.name} map, quests, boss loot, class filters, and Forever XP for levels ${dungeon.level.join("-")}.`,
  })),
];

function documentFor(page) {
  return template
    .replace(/<title>[^<]*<\/title>/, `<title>${page.title} | Forever Route Planner</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${page.description}" />`)
    .replace("<div id=\"root\"></div>", `<div id="root" data-page="${page.path}"></div>`);
}

for (const page of pages) {
  const directory = join(dist, page.path);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "index.html"), documentFor(page));
}

await writeFile(join(dist, "404.html"), documentFor({ title: "Page not found", description: "This Forever Route Planner page does not exist.", path: "not-found" }));
await writeFile(join(dist, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${["", ...pages.map((page) => page.path)].map((path) => `  <url><loc>https://wow-forever-route-planner.pages.dev/${path}${path ? "/" : ""}</loc></url>`).join("\n")}\n</urlset>\n`);

process.stdout.write(`Generated ${pages.length + 2} static HTML documents.\n`);
