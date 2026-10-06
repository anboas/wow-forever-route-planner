import assert from "node:assert/strict";
import snapshot from "../src/data/wow-forever.json" with { type: "json" };
import { bestClasses, classCanUseItem, compatibleClasses, itemIconUrl, itemSourceMeta, itemSourceUrl } from "../src/loot.js";

const loot = snapshot.dungeons.flatMap((dungeon) => dungeon.loot);
const mail = loot.find((item) => String(item.type).toLowerCase().includes("mail"));
assert.ok(mail, "expected at least one mail item");
assert.equal(classCanUseItem(mail, "priest"), false, "priests cannot equip mail");
assert.equal(classCanUseItem(mail, "paladin"), true, "paladins can equip mail");
assert.ok(compatibleClasses(mail).includes("warrior"));

const caster = { name: "Test Robe", type: "Cloth", slot: "Chest", stats: [{ label: "Intellect", value: 8 }], effects: ["Increases healing done by spells"] };
assert.ok(bestClasses(caster).includes("priest"), "healing cloth should suggest priest");
assert.match(itemIconUrl(loot.find((item) => item.icon)), /^https:\/\/wow\.zamimg\.com\/images\/wow\/icons\/large\//);
assert.match(itemSourceUrl({ id: 14151, name: "Chanting Blade" }), /wowhead\.com\/classic\/item=14151$/);
assert.match(itemSourceUrl({ id: 270227, name: "Forever Relic" }), /wowhead\.com\/classic\/search\?q=Forever%20Relic$/);

const ragefire = snapshot.dungeons.find((dungeon) => dungeon.name === "Ragefire Chasm");
const bossDrop = ragefire.loot.find((item) => item.boss === "Taragaman the Hungerer");
const questReward = ragefire.loot.find((item) => item.boss === "Hidden Enemies");
assert.equal(itemSourceMeta(bossDrop, ragefire).kind, "boss", "known encounter loot is labeled as a boss drop");
assert.equal(itemSourceMeta(questReward, ragefire).kind, "quest", "quest rewards are distinct from boss drops");

process.stdout.write("Loot compatibility verification passed.\n");
