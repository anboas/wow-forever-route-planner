import { rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { englishSitemapEntries, extractArray, extractBalancedJson, extractValue, fetchText, flightPayload } from "./lib/wowf-source.mjs";

const ORIGIN = "https://wowf.io";
const SITEMAP_URL = `${ORIGIN}/sitemap.xml`;
const outputPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/data/wowf-context.json");

function clean(value) {
  if (value === "$undefined" || value === undefined) return undefined;
  if (Array.isArray(value)) return value.map(clean).filter((entry) => entry !== undefined);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clean(entry)]).filter(([, entry]) => entry !== undefined));
  }
  return value;
}

function canonicalSourceUrl(value) {
  const localized = String(value).startsWith("/") && !/^\/(?:en|zh|tw|ko)(?:\/|$)/.test(String(value)) ? `/en${value}` : value;
  const url = new URL(localized, ORIGIN);
  if (url.protocol !== "https:" || url.username || url.password || url.hostname !== "wowf.io") throw new Error(`Unsafe source URL: ${value}`);
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

function text(value) {
  if (value === null || value === undefined || value === "$undefined") return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(" ").replace(/\s+([,.;:!?])/g, "$1").replace(/\s+/g, " ").trim();
  if (value.item) return value.item.name || "";
  return value.name || value.label || value.text || "";
}

function source(entry, fetchedAt) {
  return { url: canonicalSourceUrl(entry.url), lastmod: entry.lastmod, retrievedAt: fetchedAt };
}

function item(value) {
  const entry = clean(value?.item || value || {});
  if (!entry.id && !entry.name) return undefined;
  return clean({
    id: entry.id,
    name: entry.name,
    icon: entry.icon,
    quality: entry.quality,
    itemLevel: entry.itemLevel,
    requiredLevel: entry.requiredLevel,
    slot: entry.slot,
    type: entry.type,
    bind: entry.bind,
    stats: entry.stats,
    effects: entry.effects,
  });
}

function placeKey(place) {
  return [place.name, place.zone, place.place].map((value) => String(value || "").toLowerCase()).join("|");
}

function directCoordinate(place) {
  const at = place?.at;
  return at && typeof at === "object" && Number.isFinite(at.x) && Number.isFinite(at.y) ? { x: at.x, y: at.y } : undefined;
}

function mergeUnique(left = [], right = []) {
  return [...new Set([...left, ...right].filter((value) => value !== undefined && value !== null))];
}

async function mapLimit(values, limit, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

function classSpec(payload, route) {
  const marker = payload.match(/\{"classId":"([a-z-]+)","spec":"([^"$]+)"\}/);
  if (marker) return { classId: marker[1], spec: marker[2] };
  const parts = route.split("/");
  return { classId: parts[1], spec: parts[2] || "overview" };
}

function slimGuideStep(step) {
  return clean({
    from: step.from,
    to: step.to,
    title: step.title,
    tips: (step.tips || []).map((tip) => text(tip.text || tip)).filter(Boolean),
  });
}

function slimGuideQuest(quest) {
  const questId = String(quest.href || "").match(/quest-(\d+)/)?.[1];
  return clean({
    id: questId ? Number(questId) : undefined,
    name: quest.name,
    level: quest.level,
    minLevel: quest.minLevel,
    dungeon: quest.where,
    party: quest.party,
    href: quest.href ? canonicalSourceUrl(quest.href) : undefined,
    rewardItemIds: (quest.items || []).map((entry) => item(entry)?.id).filter(Boolean),
  });
}

const fetchedAt = new Date().toISOString();
const sitemapXml = await fetchText(SITEMAP_URL, { Accept: "application/xml,text/xml" });
const entries = englishSitemapEntries(sitemapXml);
const questEntries = entries.filter((entry) => entry.category === "quests");
const guideEntries = entries.filter((entry) => entry.category === "leveling" && entry.route !== "leveling");
const zoneEntries = entries.filter((entry) => entry.category === "zones" && entry.route !== "zones");

if (questEntries.length < 90) throw new Error(`Expected at least 90 WOWF quest pages, found ${questEntries.length}`);
if (guideEntries.length < 30) throw new Error(`Expected at least 30 WOWF leveling guides, found ${guideEntries.length}`);
if (zoneEntries.length < 15) throw new Error(`Expected at least 15 WOWF zone pages, found ${zoneEntries.length}`);

const questPages = await mapLimit(questEntries, 5, async (entry, index) => {
  const payload = flightPayload(await fetchText(entry.url));
  const chain = clean(extractValue(payload, "chain"));
  if (!chain?.sides || typeof chain.sides !== "object") throw new Error(`Missing quest chain data for ${entry.url}`);
  process.stdout.write(`[quests ${index + 1}/${questEntries.length}] ${chain.title || entry.slug}\n`);
  return { entry, chain };
});

const coordinateIndex = new Map();
for (const { chain } of questPages) for (const quests of Object.values(chain.sides)) for (const quest of quests || []) {
  for (const stage of quest.stages || []) for (const place of stage.places || []) {
    const at = directCoordinate(place);
    if (at) coordinateIndex.set(placeKey(place), at);
  }
}

const questMap = new Map();
let unresolvedCoordinates = 0;
for (const { entry, chain } of questPages) {
  for (const [side, sideQuests] of Object.entries(chain.sides)) {
    for (const [index, rawQuest] of (sideQuests || []).entries()) {
      const quest = clean(rawQuest);
      const id = Number(quest.id);
      if (!Number.isInteger(id) || !quest.name) continue;
      const stages = (quest.stages || []).map((stage) => clean({
        key: stage.key,
        text: text(stage.text),
        dungeon: stage.dungeon ? { name: stage.dungeon.name, href: stage.dungeon.href ? canonicalSourceUrl(stage.dungeon.href) : undefined } : undefined,
        places: (stage.places || []).map((rawPlace) => {
          const place = clean(rawPlace);
          const at = directCoordinate(place) || coordinateIndex.get(placeKey(place));
          if (!at && (place.name || place.zone)) unresolvedCoordinates += 1;
          return clean({ name: place.name, title: place.title, side: place.side, zone: place.zone, place: place.place, at, cityMap: place.city });
        }),
      }));
      const pageSource = source(entry, fetchedAt);
      const next = {
        id,
        name: quest.name,
        level: quest.level,
        minLevel: quest.minLevel,
        type: quest.type,
        objective: quest.objective,
        faction: side === "all" ? "both" : side,
        classes: chain.classId ? [chain.classId] : [],
        chain: { slug: chain.slug, title: chain.title },
        previousIds: index > 0 ? [Number(sideQuests[index - 1].id)] : [],
        stages,
        rewardChoices: (quest.choose || []).map(item).filter(Boolean),
        rewards: (quest.also || []).map(item).filter(Boolean),
        sourcePages: [pageSource],
        sourceUpdatedAt: entry.lastmod,
        reviewState: stages.some((stage) => stage.places.some((place) => !place.at && (place.name || place.zone))) ? "needs-review" : "verified-source",
      };
      const current = questMap.get(id);
      if (!current) questMap.set(id, next);
      else {
        current.faction = current.faction === next.faction ? current.faction : "both";
        current.classes = mergeUnique(current.classes, next.classes);
        current.previousIds = mergeUnique(current.previousIds, next.previousIds);
        current.sourcePages = [...new Map([...current.sourcePages, ...next.sourcePages].map((entry) => [entry.url, entry])).values()];
        if ((!current.stages?.length || current.reviewState === "needs-review") && next.reviewState === "verified-source") current.stages = next.stages;
        if (!current.objective && next.objective) current.objective = next.objective;
        current.rewardChoices = [...new Map([...current.rewardChoices, ...next.rewardChoices].map((entry) => [String(entry.id || entry.name), entry])).values()];
        current.rewards = [...new Map([...current.rewards, ...next.rewards].map((entry) => [String(entry.id || entry.name), entry])).values()];
        current.sourceUpdatedAt = [current.sourceUpdatedAt, next.sourceUpdatedAt].filter(Boolean).sort().at(-1);
        if (next.reviewState === "needs-review") current.reviewState = "needs-review";
      }
    }
  }
}

const levelingGuides = await mapLimit(guideEntries, 4, async (entry, index) => {
  const payload = flightPayload(await fetchText(entry.url));
  const identity = classSpec(payload, entry.route);
  const steps = (extractArray(payload, "steps", { required: false }) || []).map(slimGuideStep);
  const quests = (extractArray(payload, "quests", { required: false }) || []).map(slimGuideQuest);
  process.stdout.write(`[guides ${index + 1}/${guideEntries.length}] ${identity.classId}/${identity.spec}\n`);
  return {
    ...identity,
    steps,
    dungeonQuests: quests,
    source: source(entry, fetchedAt),
    reviewState: steps.length || identity.spec === "overview" ? "verified-source" : "needs-review",
  };
});

const zoneIndexEntry = entries.find((entry) => entry.route === "zones") || { url: `${ORIGIN}/en/zones`, lastmod: null };
const zonePayload = flightPayload(await fetchText(zoneIndexEntry.url));
const zoneItems = extractArray(zonePayload, "items");
const zoneEntryMap = new Map(zoneEntries.map((entry) => [entry.slug, entry]));
const zones = zoneItems.map((rawZone) => {
  const zone = clean(rawZone);
  const entry = zoneEntryMap.get(zone.id) || { url: `${ORIGIN}/en/zones/${zone.id}`, lastmod: null };
  return clean({
    id: zone.id,
    kind: zone.kind,
    name: zone.name,
    levelBand: zone.meta,
    faction: zone.facts?.find((fact) => fact.label === "Faction")?.value,
    location: zone.facts?.find((fact) => fact.label === "Location")?.value,
    summary: zone.summary,
    worldPoints: zone.points,
    atlasPoints: zone.atlas,
    image: zone.image,
    zoneMap: zone.zoneMap,
    reported: zone.reported,
    source: source(entry, fetchedAt),
    reviewState: "verified-source",
  });
});

const quests = [...questMap.values()].sort((a, b) => a.minLevel - b.minLevel || a.id - b.id);
const snapshot = {
  schemaVersion: 1,
  fetchedAt,
  source: { name: "WOWF.IO", url: SITEMAP_URL, retrievedAt: fetchedAt },
  inventory: {
    totalEnglishPages: entries.length,
    questPages: questEntries.length,
    levelingGuides: guideEntries.length,
    zonePages: zoneEntries.length,
  },
  dataHealth: {
    quests: quests.length,
    questsNeedingReview: quests.filter((quest) => quest.reviewState === "needs-review").length,
    unresolvedCoordinates,
    levelingGuides: levelingGuides.length,
    zones: zones.length,
  },
  quests,
  levelingGuides,
  zones,
};

if (quests.length < 100) throw new Error(`Expected at least 100 normalized quests, found ${quests.length}`);
if (levelingGuides.length !== guideEntries.length) throw new Error("Leveling guide coverage mismatch");
if (zones.length < zoneEntries.length) throw new Error("Zone catalog coverage mismatch");

const temporaryPath = `${outputPath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(snapshot)}\n`);
await rename(temporaryPath, outputPath);
process.stdout.write(`Wrote ${quests.length} quests, ${levelingGuides.length} guides, and ${zones.length} zones to ${outputPath}\n`);
