import assert from "node:assert/strict";
import context from "../src/data/wowf-context.json" with { type: "json" };

assert.equal(context.schemaVersion, 1);
assert.ok(context.inventory.totalEnglishPages >= 400, "expected the complete English WOWF.IO sitemap corpus");
assert.ok(context.inventory.questPages >= 90, "expected all published WOWF.IO quest pages");
assert.ok(context.inventory.levelingGuides >= 30, "expected all class/spec leveling guides");
assert.ok(context.inventory.zonePages >= 15, "expected all published zone pages");
assert.ok(context.quests.length >= 100, "expected normalized quest-chain coverage");
assert.equal(context.levelingGuides.length, context.inventory.levelingGuides);
assert.ok(context.zones.length >= context.inventory.zonePages);

for (const quest of context.quests) {
  assert.ok(Number.isInteger(quest.id) && quest.id > 0);
  assert.ok(quest.name);
  assert.ok(["alliance", "horde", "both"].includes(quest.faction));
  assert.ok(["verified-source", "needs-review"].includes(quest.reviewState));
  assert.ok(quest.sourcePages.length >= 1);
  for (const source of quest.sourcePages) {
    const url = new URL(source.url);
    assert.equal(url.protocol, "https:");
    assert.equal(url.hostname, "wowf.io");
    assert.equal(url.username, "");
    assert.equal(url.password, "");
    assert.equal(url.search, "");
    assert.equal(url.hash, "");
  }
}

const dungeonQuest = context.quests.find((quest) => quest.stages.some((stage) => stage.dungeon?.name));
assert.ok(dungeonQuest, "expected dungeon-linked quests from the full quest corpus");
assert.ok(context.levelingGuides.some((guide) => guide.classId === "warrior" && guide.spec === "arms"));
for (const guide of context.levelingGuides) for (const quest of guide.dungeonQuests) if (quest.href) {
  const url = new URL(quest.href);
  assert.equal(url.hostname, "wowf.io");
  assert.match(url.pathname, /^\/en\//, "relative WOWF links retain the English locale prefix");
}
assert.ok(context.zones.some((zone) => zone.id === "riverglades"));

process.stdout.write(`Context verification passed: ${context.quests.length} quests, ${context.levelingGuides.length} guides, ${context.zones.length} zones.\n`);
