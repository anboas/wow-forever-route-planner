import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import snapshot from "./data/wow-forever.json";
import dungeonMaps from "./data/dungeon-maps.json";
import foreverQuestChains from "./data/forever-quest-chains.json";
import { clampCharacter, formatCharacter, progressPercent, XP_TO_NEXT } from "./xp.js";
import { buildOptimizerCandidates, matchesFaction, optimizeRouteOrder, questMinimumLevel, simulateRoute } from "./planner.js";
import { bestClasses, classCanUseItem, classFitScore, classIconUrl, CLASS_OPTIONS, compatibleClasses, itemIconUrl, itemSourceMeta, itemSourceUrl } from "./loot.js";
import { CLASS_SPECS, compareItems, defaultSpec, dropChancePercent, entitySourceUrl, itemKey, itemPowerScore, itemSummary, lootVisibleForFaction, questSourceUrl, recommendedForProfile, reportIssueUrl, runsForConfidence, specFitScore, specProfile } from "./gear.js";
import { parseCompanionString, serializePlannerString, summarizeTelemetry } from "./companion.js";

const CLASSES = CLASS_OPTIONS.map(({ id }) => id);
const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
const PAGE_PATHS = {
  planner: "/route/",
  dungeons: "/dungeons/",
  quests: "/quests/",
  loot: "/loot/",
  profile: "/gear/",
};

function appHref(path = "/") {
  return `${BASE_PATH}${path.startsWith("/") ? path : `/${path}`}` || "/";
}

function currentPage() {
  const pathname = window.location.pathname.replace(BASE_PATH, "") || "/";
  const parts = pathname.split("/").filter(Boolean);
  if (!parts.length || parts[0] === "route") return { id: "planner" };
  if (parts[0] === "dungeons" && parts[1]) return { id: "dungeon", dungeonId: parts[1] };
  if (parts[0] === "dungeons") return { id: "dungeons" };
  if (parts[0] === "quests") return { id: "quests" };
  if (parts[0] === "loot") return { id: "loot" };
  if (parts[0] === "gear") return { id: "profile" };
  return { id: "not-found" };
}
const DEFAULT_ROUTE = ["ragefire-chasm", "ruins-of-lordaeron", "shadowfang-keep"].map((dungeonId, index) => ({
  uid: `starter-${index}`,
  dungeonId,
  bridgeXp: 0,
  bonusXp: 0,
  runs: 1,
  combatXpPerRun: 0,
  restedPercent: 0,
}));

const DEFAULT_STATE = {
  level: 13,
  xp: 0,
  faction: "horde",
  characterClass: "warrior",
  spec: "arms",
  assumePrerequisites: true,
  questStates: {},
  route: DEFAULT_ROUTE,
  wishlist: [],
  equipped: {},
  party: [],
  characterMeta: { name: "", realm: "", bindLocation: "", flightPaths: [], professions: [], importedAt: null },
  telemetry: { addonVersion: "", dataVersion: "", importedAt: null, exportedAt: null, restedXp: 0, money: 0, freeBagSlots: 0, durability: 100, zone: "", subzone: "", runs: [], currentRun: null, group: [], peers: {}, readiness: null },
  savedRoutes: [],
  lootPreferences: { query: "", dungeonId: "all", slot: "all", rarity: "all", classFilter: null, fitMode: "usable", sourceFilter: "all", wishlistOnly: false, sort: "fit", viewMode: "boss" },
};

function decodePlan() {
  try {
    const encoded = new URLSearchParams(window.location.search).get("plan");
    if (!encoded) return null;
    const base64 = encoded.replaceAll("-", "+").replaceAll("_", "/");
    return JSON.parse(decodeURIComponent(escape(atob(base64))));
  } catch {
    return null;
  }
}

function encodePlan(state) {
  const plan = {
    level: state.level,
    xp: state.xp,
    faction: state.faction,
    characterClass: state.characterClass,
    spec: state.spec,
    assumePrerequisites: state.assumePrerequisites,
    questStates: state.questStates,
    route: state.route,
    wishlist: state.wishlist,
    lootPreferences: state.lootPreferences,
  };
  return btoa(unescape(encodeURIComponent(JSON.stringify(plan)))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function loadState() {
  try {
    const shared = decodePlan();
    const saved = shared || JSON.parse(localStorage.getItem("forever-route-planner:v1"));
    if (saved && Array.isArray(saved.route)) {
      const characterClass = saved.characterClass || DEFAULT_STATE.characterClass;
      const route = saved.route.map((entry) => ({ runs: 1, combatXpPerRun: 0, restedPercent: 0, ...entry }));
      return { ...DEFAULT_STATE, ...saved, route, questStates: saved.questStates || {}, characterClass, spec: saved.spec || defaultSpec(characterClass) };
    }
  } catch {
    // Ignore damaged local state and return the useful starter route.
  }
  return DEFAULT_STATE;
}

const GearContext = createContext(null);

function useGear() {
  return useContext(GearContext);
}

function uid() {
  return globalThis.crypto?.randomUUID?.() ?? `route-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function number(value) {
  return new Intl.NumberFormat("en-US").format(Math.round(value || 0));
}

function compactDuration(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  if (value >= 3600) return `${Math.floor(value / 3600)}h ${Math.floor(value % 3600 / 60)}m`;
  return `${Math.floor(value / 60)}m ${Math.round(value % 60)}s`;
}

function coinText(copper) {
  const value = Math.max(0, Number(copper) || 0);
  return `${Math.floor(value / 10000)}g ${Math.floor(value % 10000 / 100)}s`;
}

function qualityClass(item) {
  if (item.rarity) return `quality-${item.rarity}`;
  return `quality-${item.quality ?? 1}`;
}

const QUALITY_NAMES = ["Poor", "Common", "Uncommon", "Rare", "Epic", "Legendary"];
const BIND_COPY = {
  pickup: "Binds when picked up",
  equip: "Binds when equipped",
  use: "Binds when used",
  account: "Binds to account",
};

function qualityName(item) {
  if (typeof item.rarity === "string") return humanize(item.rarity);
  return QUALITY_NAMES[item.quality] || "Common";
}

function humanize(value) {
  return String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizedEffects(effects) {
  if (!effects) return [];
  if (Array.isArray(effects)) return effects.map((effect) => typeof effect === "string" ? effect : effect.text || "").filter(Boolean);
  if (typeof effects === "object") {
    return Object.entries(effects).map(([key, value]) => `${Number(value) >= 0 ? "+" : ""}${value} ${humanize(key)}`);
  }
  return [String(effects)];
}

function actorList(actors) {
  if (!Array.isArray(actors) || !actors.length) return "Not listed";
  return actors.map((actor) => `${actor.name}${actor.zone ? ` (${actor.zone})` : ""}`).join(", ");
}

function openItemSource(item, dungeon) {
  window.open(itemSourceUrl(item, dungeon), "_blank", "noopener,noreferrer");
}

function assetUrl(path) {
  return `${import.meta.env.BASE_URL}${String(path).replace(/^\//, "")}`;
}

function ItemIcon({ item, compact = false }) {
  const src = itemIconUrl(item);
  return (
    <span className={`loot-icon ${compact ? "compact" : ""} ${qualityClass(item)}`}>
      {src ? <img src={src} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} /> : item.name.slice(0, 1)}
    </span>
  );
}

function ClassChips({ item, bestOnly = false, limit = 9 }) {
  const recommended = bestClasses(item);
  const classes = (bestOnly && recommended.length ? recommended : compatibleClasses(item)).slice(0, limit);
  return (
    <span className="class-chips" aria-label={`${bestOnly ? "Suggested for" : "Usable by"}: ${classes.join(", ") || "unknown"}`}>
      {classes.map((characterClass) => <img key={characterClass} src={classIconUrl(characterClass)} alt={characterClass} title={`${humanize(characterClass)}${recommended.includes(characterClass) ? " · suggested" : ""}`} />)}
    </span>
  );
}

function ClassFilterStrip({ value, onChange, compact = false }) {
  return (
    <div className={`class-filter-strip ${compact ? "compact" : ""}`} role="group" aria-label="Filter loot by class">
      <button className={value === "all" ? "active" : ""} aria-pressed={value === "all"} onClick={() => onChange("all")}><span>ALL</span><small>Every class</small></button>
      {CLASS_OPTIONS.map((entry) => (
        <button key={entry.id} className={value === entry.id ? "active" : ""} aria-pressed={value === entry.id} onClick={() => onChange(entry.id)} style={{ "--class-color": entry.color }}>
          <img src={classIconUrl(entry.id)} alt="" />
          <small>{entry.label}</small>
        </button>
      ))}
    </div>
  );
}

function SourceFilter({ value, onChange }) {
  const options = [["all", "All"], ["quest", "Quest"], ["boss", "Boss"], ["drop", "Mob"], ["trash", "Trash"], ["unknown", "Unknown"]];
  return <div className="source-filter" role="group" aria-label="Filter loot by source">{options.map(([id, label]) => <button key={id} className={value === id ? "active" : ""} aria-pressed={value === id} onClick={() => onChange(id)}>{label}</button>)}</div>;
}

function FitMode({ value, onChange }) {
  return <div className="fit-mode" role="group" aria-label="Loot fit mode"><button className={value === "usable" ? "active" : ""} onClick={() => onChange("usable")}>Usable</button><button className={value === "recommended" ? "active" : ""} onClick={() => onChange("recommended")}>Recommended</button><button className={value === "all" ? "active" : ""} onClick={() => onChange("all")}>All</button></div>;
}

function ItemActions({ item, dungeon, compact = false }) {
  const gear = useGear();
  const wished = gear.isWishlisted(item, dungeon);
  const equipped = item.slot && gear.equipped[item.slot]?.key === itemKey(item, dungeon?.id);
  return (
    <span className={`item-actions ${compact ? "compact" : ""}`} data-no-activate onClick={(event) => event.stopPropagation()} onFocus={(event) => event.stopPropagation()}>
      <button className={wished ? "active" : ""} aria-pressed={wished} onClick={() => gear.toggleWishlist(item, dungeon)} aria-label={`${wished ? "Remove" : "Add"} ${item.name} ${wished ? "from" : "to"} wishlist`} title={wished ? "Remove from wishlist" : "Save to wishlist"}><b aria-hidden="true">{wished ? "★" : "☆"}</b><span>{compact ? wished ? "Saved" : "Save" : wished ? "Wishlisted" : "Wishlist"}</span></button>
      {item.slot && <button className={equipped ? "active" : ""} aria-pressed={equipped} onClick={() => gear.equipItem(item, dungeon)} aria-label={`${equipped ? "Unequip" : "Equip"} ${item.name}`} title={equipped ? "Remove from My Gear" : "Set as equipped in My Gear"}><b aria-hidden="true">{equipped ? "✓" : "⇄"}</b><span>{compact ? equipped ? "Equipped" : "Equip" : equipped ? "Equipped" : "My Gear"}</span></button>}
      <a href={reportIssueUrl({ item, dungeon })} target="_blank" rel="noreferrer" aria-label={`Report incorrect data for ${item.name}`} title="Report incorrect data"><b aria-hidden="true">!</b><span>Report</span></a>
    </span>
  );
}

function TooltipTrigger({ children, content, className = "", label, role, onActivate }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const pointerRef = useRef(null);
  const tooltipId = useId();

  function place() {
    const anchor = triggerRef.current?.getBoundingClientRect();
    const tooltip = tooltipRef.current;
    if (!anchor || !tooltip) return;
    const gutter = 10;
    const width = Math.min(380, window.innerWidth - gutter * 2);
    const height = Math.min(tooltip.offsetHeight, window.innerHeight - gutter * 2);
    const pointer = pointerRef.current;
    let left = pointer ? pointer.x + 16 : anchor.right + 12;
    if (left + width > window.innerWidth - gutter) left = pointer ? pointer.x - width - 16 : anchor.left - width - 12;
    if (left < gutter) left = Math.min(Math.max(gutter, anchor.left), window.innerWidth - width - gutter);
    let top = pointer ? pointer.y + 14 : anchor.top + Math.min(10, anchor.height / 2);
    if (top + height > window.innerHeight - gutter) top = window.innerHeight - height - gutter;
    setPosition({ left: Math.max(gutter, left), top: Math.max(gutter, top), width });
  }

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const close = () => {
      setOpen(false);
      setPinned(false);
    };
    const onKeyDown = (event) => event.key === "Escape" && close();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  return (
    <>
      <div
        ref={triggerRef}
        className={`tooltip-trigger ${className}`}
        role={role}
        tabIndex="0"
        aria-label={label}
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={(event) => {
          pointerRef.current = { x: event.clientX, y: event.clientY };
          setOpen(true);
        }}
        onMouseLeave={() => !pinned && setOpen(false)}
        onFocus={() => {
          pointerRef.current = null;
          setOpen(true);
        }}
        onBlur={() => !pinned && setOpen(false)}
        onClick={(event) => {
          if (event.target.closest("[data-no-activate]")) return;
          if (onActivate) {
            onActivate();
            setPinned(false);
            setOpen(false);
            return;
          }
          if (pinned) {
            setPinned(false);
            setOpen(false);
          } else {
            setPinned(true);
            setOpen(true);
          }
        }}
        onKeyDown={(event) => {
          if (onActivate && ["Enter", " "].includes(event.key)) {
            event.preventDefault();
            onActivate();
            setOpen(false);
          }
        }}
      >
        {children}
      </div>
      {open && createPortal(
        <aside ref={tooltipRef} id={tooltipId} role="tooltip" className="wow-tooltip" style={position}>
          {content}
          <span className="tooltip-dismiss">Esc to dismiss</span>
        </aside>,
        document.body,
      )}
    </>
  );
}

function ItemTooltip({ item, dungeon }) {
  const effects = normalizedEffects(item.effects);
  const source = dungeon ? itemSourceMeta(item, dungeon) : null;
  const gear = useGear();
  const equipped = item.slot ? gear.equipped[item.slot] : null;
  const comparison = compareItems(item, equipped, gear.characterClass, gear.spec);
  const chance = dropChancePercent(item);
  const partyFit = gear.party.filter((member) => recommendedForProfile(item, member.characterClass, member.spec));
  return (
    <div className="item-tooltip">
      <div className="tooltip-item-head"><ItemIcon item={item} /><div><div className={`tooltip-title ${qualityClass(item)}`}>{item.name}</div><div className="tooltip-meta">Item Level {item.itemLevel || "Unknown"} · {qualityName(item)}</div></div></div>
      {item.bind && <div>{BIND_COPY[item.bind] || humanize(item.bind)}</div>}
      {(item.slot || item.type) && <div className="tooltip-split"><span>{item.slot || ""}</span><span>{item.type || ""}</span></div>}
      {Number.isFinite(item.armor) && <div>{number(item.armor)} Armor</div>}
      {Number.isFinite(item.block) && <div>{number(item.block)} Block</div>}
      {item.weapon && <><div className="tooltip-split"><span>{item.weapon.min} - {item.weapon.max} Damage</span><span>Speed {item.weapon.speed}</span></div><div>({item.weapon.dps} damage per second)</div></>}
      {Number.isFinite(item.requiredLevel) && item.requiredLevel > 0 && <div>Requires Level {item.requiredLevel}</div>}
      {(item.stats || []).map((stat, index) => <div className="tooltip-stat" key={`${stat.label}-${index}`}>+{stat.value} {stat.label}</div>)}
      {effects.map((effect, index) => <div className="tooltip-effect" key={`${effect}-${index}`}>{effect}</div>)}
      {chance && <div className="tooltip-drop">Drop chance: {chance.toFixed(chance < 10 ? 1 : 0)}% · {runsForConfidence(item, .5)} runs for 50% · {runsForConfidence(item, .75)} for 75% · {runsForConfidence(item, .9)} for 90%</div>}
      <div className="tooltip-class-fit"><span>{specProfile(gear.characterClass, gear.spec).label} recommendation</span><ClassChips item={item} bestOnly /></div>
      {equipped && <div className={`tooltip-compare ${comparison.delta >= 0 ? "positive" : "negative"}`}><strong>{comparison.delta >= 0 ? "+" : ""}{comparison.delta.toFixed(1)} profile score vs {equipped.name}</strong>{comparison.changes.map((change) => <span key={change.label}>{change.value > 0 ? "+" : ""}{change.value} {change.label}</span>)}</div>}
      {!!partyFit.length && <div className="tooltip-party"><span>Party interest</span><strong>{partyFit.map((member) => member.name).join(", ")}</strong></div>}
      {dungeon && <div className="tooltip-source"><span>{source.label}</span><strong>{dungeon.name}</strong><small>{source.name}</small><small>Snapshot {new Date(snapshot.fetchedAt).toLocaleDateString()}</small></div>}
      {item.uncertain && <div className="tooltip-warning">Partial beta record. Some properties may change.</div>}
      <div className="tooltip-source-link">Click to open this item in the WoW Forever dungeon source ↗</div>
    </div>
  );
}

function QuestTooltip({ quest, dungeon, gate }) {
  const rewards = [...(quest.rewards || []), ...(quest.rewardChoices || [])];
  const minimum = questMinimumLevel(quest, dungeon);
  return (
    <div className="quest-tooltip">
      <div className="tooltip-title quest-quality">{quest.name}</div>
      <div className="tooltip-meta">Level {quest.level || dungeon.level[0]} Quest · Requires Level {minimum}</div>
      {gate && <div className={`tooltip-gate gate-text-${gate.status}`}>{GATE_COPY[gate.status]}</div>}
      <div className="tooltip-split"><span>{humanize(quest.faction || "Faction unknown")}</span><span>{quest.site === "inside" ? "Inside dungeon" : quest.site === "outside" ? "Outside dungeon" : "Location pending"}</span></div>
      {quest.objective && <p className="tooltip-objective">{quest.objective}</p>}
      {quest.note && <p className="tooltip-objective">{quest.note}</p>}
      <div className="tooltip-facts">
        <span><b>Starts:</b> {actorList(quest.from)}</span>
        <span><b>Ends:</b> {actorList(quest.to)}</span>
        <span><b>Forever experience:</b> {Number.isFinite(quest.xp) ? `${number(quest.xp)} XP` : "Unverified"}</span>
        {quest.rep && <span><b>Reputation:</b> {quest.rep}</span>}
        {!!quest.chain?.length && <span><b>Prerequisites:</b> {quest.chain.map((entry) => entry.name || entry).join(", ")}</span>}
        {!!quest.prerequisiteIds?.length && !quest.chain?.length && <span><b>Prerequisite IDs:</b> {quest.prerequisiteIds.join(", ")}</span>}
      </div>
      {!!rewards.length && <div className="tooltip-rewards"><span>Rewards</span>{rewards.map((reward, index) => <strong className={qualityClass(reward)} key={`${reward.id || reward.name}-${index}`}>{reward.name}</strong>)}</div>}
      {quest.rewardNote && <div className="tooltip-warning">{quest.rewardNote}</div>}
      <div className="tooltip-source"><span>Dungeon</span><strong>{dungeon.name}</strong><small>{quest.dataStatus === "verified" ? "Verified Forever quest record" : quest.dataStatus === "source-only" ? "WOWF quest-chain record · XP pending" : "Partial beta coverage"}</small></div>
    </div>
  );
}

function chainQuestRecord(record) {
  if (!record || typeof record !== "object") return null;
  const start = record.start;
  return {
    ...record,
    from: record.from || (start ? [{ name: start.giver, kind: "npc", zone: start.zone, at: { x: start.x, y: start.y }, uiMapId: start.uiMapId }] : []),
    to: record.to || [],
    dataStatus: record.dataStatus || "chain-source",
  };
}

function questPlaceLabel(actor) {
  if (!actor) return "Location pending";
  const place = [actor.zone, actor.place].filter(Boolean).join(" · ");
  const coordinates = actor.at ? `${Number(actor.at.x).toFixed(1)}, ${Number(actor.at.y).toFixed(1)}` : null;
  return [place, coordinates].filter(Boolean).join(" · ") || "Location pending";
}

function QuestLocationMap({ actors, title }) {
  const locations = (actors || []).filter((actor) => actor?.at && Number.isFinite(Number(actor.at.x)) && Number.isFinite(Number(actor.at.y)));
  const primary = locations[0];
  return (
    <section className="quest-location-card">
      <header><div><span>{title}</span><strong>{actors?.[0]?.name || "Location pending"}</strong></div>{primary && <b>{Number(primary.at.x).toFixed(1)}, {Number(primary.at.y).toFixed(1)}</b>}</header>
      {primary ? <>
        <div className="quest-mini-map" aria-label={`${primary.name} in ${primary.zone} at ${Number(primary.at.x).toFixed(1)}, ${Number(primary.at.y).toFixed(1)}`}>
          <div className="quest-map-pin" style={{ left: `${primary.at.x}%`, top: `${primary.at.y}%` }} tabIndex="0"><span aria-hidden="true">◆</span><aside><strong>{primary.name}</strong><small>{questPlaceLabel(primary)}</small></aside></div>
          <div className="quest-map-grid" aria-hidden="true" />
          <span className="quest-map-zone">{primary.zone}</span>
        </div>
        <footer><span>{primary.place || primary.zone} · zone coordinates</span><a href="https://wowf.io/en/zones" target="_blank" rel="noreferrer">Forever world map ↗</a></footer>
      </> : <div className="quest-location-pending"><span>◇</span><p>The source does not publish a coordinate for this pickup yet.</p></div>}
      {locations.length > 1 && <div className="quest-location-alternates">{locations.slice(1).map((actor, index) => <span key={`${actor.name}-${index}`}>{actor.name} · {questPlaceLabel(actor)}</span>)}</div>}
    </section>
  );
}

function QuestTray({ selection, onClose, itemLookup, questLookup, onSelect }) {
  useEffect(() => {
    if (!selection) return undefined;
    const handleKey = (event) => {
      if (event.key === "Escape" && !document.querySelector(".wow-tooltip")) onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selection, onClose]);
  if (!selection) return null;
  const { quest, dungeon, gate } = selection;
  const rewards = [...(quest.rewards || []), ...(quest.rewardChoices || [])].map((item) => {
    const catalogItem = itemLookup.get(`id:${item.id}`) || itemLookup.get(`name:${String(item.name || "").toLowerCase()}`);
    return catalogItem ? { ...catalogItem, ...item } : item;
  });
  const rawSteps = quest.prerequisiteSteps?.length
    ? quest.prerequisiteSteps
    : (quest.chain || []).map((entry) => [entry]);
  const prerequisiteSteps = rawSteps.map((step) => (Array.isArray(step) ? step : [step]).map((entry) => {
    const key = typeof entry === "object" ? entry.id || entry.name : entry;
    const found = questLookup.get(`id:${key}`) || questLookup.get(`name:${String(typeof entry === "object" ? entry.name : entry).toLowerCase()}`);
    return { quest: chainQuestRecord(found?.quest || (typeof entry === "object" ? entry : { id: entry, name: `Quest ${entry}` })), dungeon: found?.dungeon || dungeon };
  }).filter((entry) => entry.quest));
  const firstPrerequisite = prerequisiteSteps[0]?.[0];
  const firstPickup = firstPrerequisite?.quest?.from?.[0];
  const firstPrerequisiteLabel = firstPickup
    ? `${firstPickup.name}${firstPickup.zone ? ` in ${firstPickup.zone}` : ""}`
    : firstPrerequisite?.quest?.name;
  const pickup = quest.from?.[0];
  const turnIn = quest.to?.[0];
  const sameLocation = pickup && turnIn
    && pickup.name === turnIn.name
    && pickup.zone === turnIn.zone
    && Number(pickup.at?.x) === Number(turnIn.at?.x)
    && Number(pickup.at?.y) === Number(turnIn.at?.y);
  return createPortal(
    <div className="tray-layer">
      <button className="tray-backdrop" onClick={onClose} aria-label="Close quest tray" />
      <aside className="quest-tray" aria-label={`Pinned quest: ${quest.name}`}>
        <header><div>{selection.previous && <button className="tray-back" onClick={() => onSelect(selection.previous)}>← Back</button>}<div className="section-kicker">Quest inspector</div><h2>{quest.name}</h2></div><button className="tray-close" onClick={onClose} aria-label="Close quest tray">×</button></header>
        <div className="tray-meta"><span>{dungeon.name}</span><span>Level {questMinimumLevel(quest, dungeon)}+</span>{Number.isFinite(quest.xp) && <strong title="Current WOWF.IO Forever reward">{number(quest.xp)} Forever XP</strong>}</div>
        {gate && <div className={`tooltip-gate gate-text-${gate.status}`}>{GATE_COPY[gate.status]}</div>}
        {quest.objective && <p className="tray-objective">{quest.objective}</p>}
        {quest.note && <p className="tray-note">{quest.note}</p>}
        <div className={`quest-location-grid ${sameLocation ? "single" : ""}`}>{sameLocation ? <QuestLocationMap actors={quest.from} title="Pick up & turn in" /> : <><QuestLocationMap actors={quest.from} title="Pick up from" /><QuestLocationMap actors={quest.to} title="Turn in to" /></>}</div>
        <dl className="tray-facts">
          <div><dt>Faction</dt><dd>{humanize(quest.faction || "Both")}</dd></div>
          <div><dt>Pickup</dt><dd>{questPlaceLabel(quest.from?.[0])}</dd></div>
          {!sameLocation && <div><dt>Turn in</dt><dd>{questPlaceLabel(quest.to?.[0])}</dd></div>}
          {quest.rep && <div><dt>Reputation</dt><dd>{quest.rep}</dd></div>}
        </dl>
        <section className="tray-checklist"><h3>Before you go</h3><span className={gate?.status === "level-locked" ? "blocked" : "ready"}>Reach level {questMinimumLevel(quest, dungeon)}</span><span className={gate?.status === "wrong-faction" ? "blocked" : "ready"}>{humanize(quest.faction || "Any faction")}</span><span className={gate?.status === "needs-prerequisites" ? "blocked" : "ready"}>{prerequisiteSteps.length ? `Complete ${prerequisiteSteps.length} ordered prerequisite step${prerequisiteSteps.length === 1 ? "" : "s"}` : "No pre-quests required"}</span>{firstPrerequisite && <button onClick={() => onSelect({ quest: firstPrerequisite.quest, dungeon: firstPrerequisite.dungeon, previous: selection })}>Start with: {firstPrerequisiteLabel} →</button>}</section>
        {!!prerequisiteSteps.length && <section className="tray-chain"><header><div><span>Pickup route</span><h3>Prerequisite quests</h3></div><b>{prerequisiteSteps.length} step{prerequisiteSteps.length === 1 ? "" : "s"}</b></header>{prerequisiteSteps.map((alternatives, index) => <article className="prerequisite-step" key={`prerequisite-${index}`}><em>{index + 1}</em><div>{alternatives.map(({ quest: prerequisite, dungeon: prerequisiteDungeon }, alternativeIndex) => <div className="prerequisite-choice" key={`${prerequisite.id || prerequisite.name}-${alternativeIndex}`}><span><strong>{prerequisite.name}</strong><small>{prerequisite.from?.[0] ? `${prerequisite.from[0].name} · ${questPlaceLabel(prerequisite.from[0])}` : "Pickup location not published"}{alternatives.length > 1 ? " · alternative" : ""}</small></span><button onClick={() => onSelect({ quest: prerequisite, dungeon: prerequisiteDungeon, previous: selection })}>Open</button><a href={questSourceUrl(prerequisite, prerequisiteDungeon)} target="_blank" rel="noreferrer">Forever ↗</a></div>)}</div></article>)}</section>}
        <section className="tray-rewards">
          <h3>Rewards <span>{rewards.length}</span></h3>
          {rewards.length ? rewards.map((item, index) => (
            <TooltipTrigger key={`${item.id || item.name}-${index}`} className="reward-card" label={`Reward item ${item.name}`} onActivate={() => openItemSource(item, dungeon)} content={<ItemTooltip item={item} dungeon={dungeon} />}>
              <ItemIcon item={item} />
              <div><strong className={qualityClass(item)}>{item.name}</strong><small>{item.slot || item.type || "Reward item"}</small><ClassChips item={item} bestOnly /></div>
              <ItemActions item={item} dungeon={dungeon} compact />
            </TooltipTrigger>
          )) : <p className="empty-copy">No item rewards are listed in the current source record.</p>}
        </section>
        <footer><span><a href={questSourceUrl(quest, dungeon)} target="_blank" rel="noreferrer">Open Forever quest source ↗</a> · <a href={reportIssueUrl({ quest, dungeon })} target="_blank" rel="noreferrer">Report data ↗</a></span><span>{quest.dataStatus === "verified" ? "Verified Forever details" : quest.dataStatus === "chain-source" ? "Forever prerequisite record" : quest.dataStatus === "source-only" ? "Sourced chain details · XP pending" : "Rewards-only coverage"}</span></footer>
      </aside>
    </div>,
    document.body,
  );
}

const GATE_COPY = {
  ready: "Ready",
  "level-locked": "Level locked",
  "wrong-faction": "Other faction",
  "wrong-class": "Other class",
  "needs-prerequisites": "Needs pre-quests",
  "xp-unverified": "XP unverified",
  unverified: "Partial data",
  "already-done": "Already counted",
  skipped: "Skipped",
};

function Rune({ index }) {
  return <span className="rune" aria-hidden="true">{index}</span>;
}

function ProgressBar({ character, label }) {
  const percent = progressPercent(character);
  return (
    <div className="xp-track-wrap">
      <div className="xp-track-label"><span>{label}</span><strong>{formatCharacter(character)}</strong></div>
      <div className="xp-track" aria-label={`${Math.round(percent)} percent through level ${character.level}`}>
        <span style={{ width: `${percent}%` }} />
      </div>
      {character.level < 60 && (
        <div className="xp-track-meta"><span>{number(character.xp)} XP</span><span>{number(XP_TO_NEXT[character.level])} to level</span></div>
      )}
    </div>
  );
}

function QuestRow({ entry, dungeon, questState, onQuestState, onPin }) {
  const { quest, gate } = entry;
  const chainCount = quest.chain?.length ?? 0;
  return (
    <li className={`quest-row gate-${gate.status}`}>
      <TooltipTrigger className="quest-row-trigger" label={`Quest details for ${quest.name}`} onActivate={() => onPin({ quest, dungeon, gate })} content={<QuestTooltip quest={quest} dungeon={dungeon} gate={gate} />}>
        <div className="quest-mark" aria-hidden="true">!</div>
        <div className="quest-main">
          <div className="quest-title-line">
            <strong>{quest.name}</strong>
            <span className={`gate-badge gate-badge-${gate.status}`}>{GATE_COPY[gate.status]}</span>
          </div>
          <p>
            Lv {questMinimumLevel(quest, dungeon)}+
            {!Number.isFinite(quest.minLevel) && " assumed"}
            {quest.faction && quest.faction !== "both" ? ` · ${quest.faction}` : ""}
            {chainCount ? ` · ${chainCount} pre-quest${chainCount === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        <div className="quest-xp">{Number.isFinite(quest.xp) ? `${number(quest.xp)} XP` : "XP ?"}<small>Pin ↗</small></div>
        <select data-no-activate className="quest-state-select" aria-label={`State for ${quest.name}`} value={questState || "auto"} onClick={(event) => event.stopPropagation()} onChange={(event) => onQuestState(quest.id, event.target.value)}>
          <option value="auto">Auto</option>
          <option value="have">Already have</option>
          <option value="complete">Complete</option>
          <option value="skip">Skip</option>
        </select>
      </TooltipTrigger>
    </li>
  );
}

function RouteStep({ step, index, total, lootGoalCount, expanded, questStates, onToggle, onMove, onRemove, onField, onQuestState, onRepair, onPin }) {
  const ready = step.quests.filter((entry) => entry.gate.status === "ready").length;
  const locked = step.quests.filter((entry) => !["ready", "unverified", "xp-unverified", "already-done", "skipped"].includes(entry.gate.status)).length;
  const belowBand = step.before.level < step.dungeon.level[0];
  const [actualLevel, setActualLevel] = useState(step.after.level);
  const [actualXp, setActualXp] = useState(step.after.xp);
  useEffect(() => {
    setActualLevel(step.after.level);
    setActualXp(step.after.xp);
  }, [step.after.level, step.after.xp]);
  return (
    <article className={`route-step ${expanded ? "expanded" : "collapsed"}`}>
      <div className="route-rail"><Rune index={index + 1} /><span /></div>
      <div className="route-card">
        <header className="route-card-header">
          <div>
            <div className="eyebrow">Stop {index + 1} · Levels {step.dungeon.level.join("–")}</div>
            <h3>{step.dungeon.name}</h3>
            <p>{step.dungeon.location || "Location pending source verification"}</p>
          </div>
          <div className="route-actions" aria-label={`Move or remove ${step.dungeon.name}`}>
            <button className="route-expand" onClick={onToggle} aria-expanded={expanded} aria-label={`${expanded ? "Collapse" : "Expand"} ${step.dungeon.name}`}>{expanded ? "−" : "+"}</button>
            <button onClick={() => onMove(index, -1)} disabled={index === 0} aria-label="Move earlier">↑</button>
            <button onClick={() => onMove(index, 1)} disabled={index === total - 1} aria-label="Move later">↓</button>
            <button className="danger" onClick={() => onRemove(index)} aria-label="Remove stop">×</button>
          </div>
        </header>
        <div className="step-metrics">
          <div><span>Arrive</span><strong>{formatCharacter(step.before)}</strong></div>
          <div><span>External XP</span><strong>{number(step.bridgeXp)}</strong></div>
          <div><span>Quest XP</span><strong>{number(step.questXp)}</strong></div>
          <div><span>Dungeon XP</span><strong>{number(step.combatXp)}</strong></div>
          <div><span>Leave</span><strong>{formatCharacter(step.after)}</strong></div>
        </div>
        <div className="quest-summary">
          <strong>{ready} ready</strong><span>{locked} blocked</span><span>{step.runs} run{step.runs === 1 ? "" : "s"}</span><span>{step.travelMinutes} min travel{step.travelIsEstimate ? " est." : ""}</span>{lootGoalCount > 0 && <span className="wishlist-hit">★ {lootGoalCount} loot goal{lootGoalCount === 1 ? "" : "s"}</span>}
        </div>
        {expanded && <div className="route-card-details">
          {belowBand && <div className="callout warning">You arrive below the recommended dungeon band. Eligible quests are still calculated individually.</div>}
          {step.bridgeShortfall > 0 && <div className="callout bridge-callout"><strong>{number(step.bridgeShortfall)} XP needed before this stop</strong><span>Reach level {step.completionLevel} to unlock every verified {step.dungeon.name} quest available to this faction and class.</span></div>}
          <ul className="quest-list">{step.quests.map((entry) => <QuestRow key={`${entry.quest.id}-${entry.quest.name}`} entry={entry} dungeon={step.dungeon} questState={questStates[String(entry.quest.id)]} onQuestState={onQuestState} onPin={onPin} />)}</ul>
          <div className="run-model-grid">
            <label><span>World XP before</span><input type="number" min="0" step="100" value={step.bridgeXp} onChange={(event) => onField(index, "bridgeXp", event.target.value)} /></label>
            <label><span>XP per clear</span><input type="number" min="0" step="100" value={step.combatXpPerRun} onChange={(event) => onField(index, "combatXpPerRun", event.target.value)} /></label>
            <label><span>Clears</span><input type="number" min="1" max="20" value={step.runs} onChange={(event) => onField(index, "runs", event.target.value)} /></label>
            <label><span>Rested bonus</span><select value={step.restedPercent} onChange={(event) => onField(index, "restedPercent", event.target.value)}><option value="0">None</option><option value="50">50%</option><option value="100">100%</option></select></label>
            <label><span>Travel minutes</span><input type="number" min="0" step="1" value={step.travelMinutes} onChange={(event) => onField(index, "travelMinutes", event.target.value)} /></label>
            <label className="hearth-toggle"><input type="checkbox" checked={step.useHearth} onChange={(event) => onField(index, "useHearth", event.target.checked)} /><span>Use hearth estimate</span></label>
          </div>
          <p className="model-note">Combat XP is your observed XP per full clear × clears, with an optional rested bonus. Travel is an editable planning estimate.</p>
          <div className="actual-result">
            <div><strong>Update from actual result</strong><span>Replace this projection and rebuild every remaining stop.</span></div>
            <label><span>Ending level</span><input type="number" min="1" max="60" value={actualLevel} onChange={(event) => setActualLevel(event.target.value)} /></label>
            <label><span>Ending XP</span><input type="number" min="0" value={actualXp} onChange={(event) => setActualXp(event.target.value)} /></label>
            <button onClick={() => onRepair(index, actualLevel, actualXp)}>Repair remaining route</button>
          </div>
        </div>}
      </div>
    </article>
  );
}

function Planner({ state, setState, dungeons, dungeonsById, onPin, onNavigate }) {
  const simulation = useMemo(() => simulateRoute({ dungeonsById, ...state }), [dungeonsById, state]);
  const [addId, setAddId] = useState(dungeons[0].id);
  const [optimization, setOptimization] = useState(null);
  const [optimizerCandidates, setOptimizerCandidates] = useState(null);
  const [expandedSteps, setExpandedSteps] = useState(() => new Set());
  const [presetName, setPresetName] = useState("");
  const lootGoals = useMemo(() => state.wishlist.reduce((counts, item) => ({ ...counts, [item.dungeonId]: (counts[item.dungeonId] || 0) + 1 }), {}), [state.wishlist]);
  const totalXp = simulation.steps.reduce((sum, step) => sum + step.questXp + step.combatXp + step.bonusXp, 0);
  const externalXp = simulation.steps.reduce((sum, step) => sum + step.bridgeXp + step.bonusXp, 0);
  const readyQuests = simulation.steps.reduce((sum, step) => sum + step.quests.filter((entry) => entry.gate.status === "ready").length, 0);

  function patch(values) {
    setState((current) => ({ ...current, ...values }));
  }

  function updateRoute(updater) {
    setState((current) => ({ ...current, route: updater(current.route) }));
  }

  function move(index, delta) {
    updateRoute((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return next;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function compareRoutes(mode = "current") {
    const candidates = buildOptimizerCandidates({ dungeonsById, ...state, lootGoals, count: 6 }, mode);
    setOptimizerCandidates(candidates);
    setOptimization(mode === "new" ? "Three new route strategies are ready. Compare the tradeoffs before applying one." : "Three reorder strategies are ready. Your route is unchanged until you choose one.");
  }

  function applyCandidate(candidate) {
    const result = candidate.result;
    patch({ route: result.route });
    setExpandedSteps(new Set());
    setOptimizerCandidates(null);
    setOptimization(`${candidate.label} applied: ${number(result.totalQuestXp)} quest XP, ${number(result.totalBridgeXp)} world XP between stops, ${result.totalTravelMinutes} travel minutes, ${result.readyQuests} ready quests, and ${result.guideHits} class-guide matches.`);
  }

  function updateQuestState(questId, value) {
    setState((current) => {
      const questStates = { ...current.questStates };
      if (value === "auto") delete questStates[String(questId)];
      else questStates[String(questId)] = value;
      return { ...current, questStates };
    });
  }

  function repairRemaining(index, level, xp) {
    const actual = clampCharacter(level, xp);
    const remaining = state.route.slice(index + 1);
    const completedQuestStates = { ...state.questStates };
    for (const step of simulation.steps.slice(0, index + 1)) {
      for (const entry of step.quests) if (entry.gate.status === "ready") completedQuestStates[String(entry.quest.id)] = "complete";
    }
    const result = optimizeRouteOrder({ dungeonsById, ...state, level: actual.level, xp: actual.xp, questStates: completedQuestStates, route: remaining, lootGoals, strategy: "balanced" });
    patch({ level: actual.level, xp: actual.xp, questStates: completedQuestStates, route: result.route });
    setExpandedSteps(new Set());
    setOptimizerCandidates(null);
    setOptimization(`Actual result saved at stop ${index + 1}. ${remaining.length} remaining stop${remaining.length === 1 ? " was" : "s were"} repaired from level ${actual.level}.`);
  }

  function savePreset() {
    const name = presetName.trim() || `Level ${state.level} route ${state.savedRoutes.length + 1}`;
    const preset = { id: uid(), name, level: state.level, xp: state.xp, faction: state.faction, characterClass: state.characterClass, spec: state.spec, assumePrerequisites: state.assumePrerequisites, questStates: state.questStates, route: state.route };
    patch({ savedRoutes: [...state.savedRoutes, preset] });
    setPresetName("");
    setOptimization(`Saved route preset “${name}”.`);
  }

  function loadPreset(preset) {
    patch({ level: preset.level, xp: preset.xp, faction: preset.faction, characterClass: preset.characterClass, spec: preset.spec, assumePrerequisites: preset.assumePrerequisites, questStates: preset.questStates || {}, route: preset.route });
    setOptimization(`Loaded route preset “${preset.name}”.`);
  }

  async function shareRoute() {
    const url = new URL(window.location.href);
    url.searchParams.set("plan", encodePlan(state));
    window.history.replaceState(null, "", url);
    try { await navigator.clipboard.writeText(url.toString()); } catch { /* URL remains shareable in the address bar. */ }
    setOptimization("Shareable route URL is ready and copied when clipboard access is available.");
  }

  return (
    <main className="planner-layout">
      <aside className="character-panel panel">
        <div className="section-kicker">Character</div>
        <h2>Starting point</h2>
        <div className="field-grid">
          <label><span>Faction</span><select value={state.faction} onChange={(event) => patch({ faction: event.target.value })}><option value="horde">Horde</option><option value="alliance">Alliance</option></select></label>
          <label><span>Class</span><select value={state.characterClass} onChange={(event) => patch({ characterClass: event.target.value, spec: defaultSpec(event.target.value) })}>{CLASSES.map((value) => <option value={value} key={value}>{humanize(value)}</option>)}</select></label>
          <label><span>Specialization</span><select value={state.spec} onChange={(event) => patch({ spec: event.target.value })}>{(CLASS_SPECS[state.characterClass] || []).map((entry) => <option value={entry.id} key={entry.id}>{entry.label} · {entry.role}</option>)}</select></label>
          <label><span>Level</span><input type="number" min="1" max="60" value={state.level} onChange={(event) => patch({ level: event.target.value })} /></label>
          <label><span>Current XP</span><input type="number" min="0" max={XP_TO_NEXT[state.level] || 0} value={state.xp} onChange={(event) => patch({ xp: event.target.value })} /></label>
        </div>
        <ProgressBar character={simulation.start} label="Current progress" />
        <label className="toggle-row">
          <input type="checkbox" checked={state.assumePrerequisites} onChange={(event) => patch({ assumePrerequisites: event.target.checked })} />
          <span><strong>Default pre-quests ready</strong><small>Individual quest states in each stop override this default.</small></span>
        </label>
        <div className="curve-note">
          <strong>XP model</strong>
          <p><strong>Forever quest rewards</strong> from the current WOWF.IO dataset, including Forever's post–October 1 dungeon bonus. Level thresholds use the Classic 1–60 curve. Enter observed mob/boss XP per clear until Forever publishes authoritative clear totals.</p>
          <a href={snapshot.xpPolicy.sourceUrl} target="_blank" rel="noreferrer">Forever XP balance source ↗</a>
        </div>
      </aside>

      <section className="route-workspace">
        <header className="workspace-header">
          <div><div className="section-kicker">Dungeon route</div><h2>Quest XP projection</h2><p>Quests are gated at the level you arrive, then applied before the next stop.</p></div>
          <div className="workspace-actions"><button onClick={() => compareRoutes("current")} disabled={!state.route.length}>Optimize route</button><button onClick={() => compareRoutes("new")}>Build best route</button><button className="secondary" onClick={shareRoute}>Share</button><button className="secondary" onClick={() => patch({ route: DEFAULT_ROUTE, questStates: {} })}>Reset</button></div>
        </header>

        <div className="preset-bar"><label><span>Named route preset</span><input value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="Weekend dungeon circuit" /></label><button onClick={savePreset}>Save preset</button><div className="preset-list">{state.savedRoutes.map((preset) => <button className="secondary" key={preset.id} onClick={() => loadPreset(preset)}>{preset.name}</button>)}</div></div>

        {optimization && <div className="optimization-note"><strong>Optimizer</strong><span>{optimization}</span><button onClick={() => setOptimization(null)} aria-label="Dismiss optimizer note">×</button></div>}

        {optimizerCandidates && <section className="optimizer-candidates" aria-label="Route optimizer candidates">
          {optimizerCandidates.map((candidate) => <article key={candidate.id}>
            <div className="optimizer-title"><span>{candidate.id === "fastest" ? "⚡" : candidate.id === "completion" ? "✓" : "◎"}</span><div><h3>{candidate.label}</h3><p>{candidate.description}</p></div></div>
            <div className="optimizer-path">{candidate.result.route.map((entry) => dungeonsById.get(entry.dungeonId)?.name || entry.dungeonId).join(" → ")}</div>
            <div className="optimizer-metrics"><span><strong>{number(candidate.result.totalBridgeXp)}</strong> world XP</span><span><strong>{candidate.result.readyQuests}</strong> ready quests</span><span><strong>{candidate.result.totalTravelMinutes}m</strong> travel</span><span><strong>{number(candidate.result.totalQuestXp)}</strong> quest XP</span><span><strong>{candidate.result.guideHits}</strong> guide matches</span><span><strong>{candidate.result.wishlistHits}</strong> wishlist hits</span></div>
            <p className="optimizer-why">{candidate.id === "fastest" ? "Why: penalizes travel and pre-dungeon grinding most heavily." : candidate.id === "completion" ? "Why: rewards every ready verified quest before considering travel cost." : "Why: weighs XP, readiness, travel, and wishlist goals together."}</p>
            <button onClick={() => applyCandidate(candidate)}>Apply {candidate.label}</button>
          </article>)}
        </section>}

        <div className="summary-grid">
          <div className="summary-card"><span>Projected finish</span><strong>{formatCharacter(simulation.finish)}</strong></div>
          <div className="summary-card"><span>Route XP</span><strong>{number(totalXp)}</strong></div>
          <div className="summary-card"><span>Planned external XP</span><strong>{number(externalXp)}</strong></div>
          <div className="summary-card"><span>Ready quests</span><strong>{readyQuests}</strong></div>
          <div className="summary-card"><span>Level gain</span><strong>+{Math.max(0, simulation.finish.level - simulation.start.level)}</strong></div>
          <div className="summary-card"><span>Travel estimate</span><strong>{simulation.totalTravelMinutes} min</strong></div>
        </div>
        <ProgressBar character={simulation.finish} label="Projected finish" />

        <div className="route-list">
          {simulation.steps.length ? simulation.steps.map((step, index) => (
            <RouteStep
              key={state.route[index].uid}
              step={step}
              index={index}
              total={simulation.steps.length}
              lootGoalCount={lootGoals[step.dungeon.id] || 0}
              expanded={expandedSteps.has(state.route[index].uid)}
              questStates={state.questStates}
              onToggle={() => setExpandedSteps((current) => { const next = new Set(current); const id = state.route[index].uid; if (next.has(id)) next.delete(id); else next.add(id); return next; })}
              onMove={move}
              onRemove={(target) => updateRoute((current) => current.filter((_, itemIndex) => itemIndex !== target))}
              onField={(target, field, value) => updateRoute((current) => current.map((entry, itemIndex) => itemIndex === target ? { ...entry, [field]: value } : entry))}
              onQuestState={updateQuestState}
              onRepair={repairRemaining}
              onPin={onPin}
            />
          )) : <div className="empty-state"><strong>No dungeon stops yet.</strong><p>Add one below to start projecting.</p></div>}
        </div>

        <div className="route-adder panel">
          <label><span>Add a dungeon</span><select value={addId} onChange={(event) => setAddId(event.target.value)}>{dungeons.map((dungeon) => <option value={dungeon.id} key={dungeon.id}>{dungeon.level[0]}–{dungeon.level[1]} · {dungeon.name}</option>)}</select></label>
          <button onClick={() => updateRoute((current) => [...current, { uid: uid(), dungeonId: addId, bridgeXp: 0, bonusXp: 0, runs: 1, combatXpPerRun: 0, restedPercent: 0 }])}>Add stop</button>
        </div>
      </section>
      <nav className="mobile-command-dock" aria-label="Route quick actions">
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><span>⌂</span>Route</button>
        <button onClick={() => compareRoutes("current")} disabled={!state.route.length}><span>⚡</span>Optimize</button>
        <button onClick={() => document.querySelector(".route-step")?.scrollIntoView({ behavior: "smooth", block: "start" })}><span>→</span>Next stop</button>
        <button onClick={() => onNavigate("profile")}><span>★</span>My Gear</button>
      </nav>
    </main>
  );
}

function QuestListEntry({ quest, dungeon, onPin }) {
  const prerequisiteCount = quest.prerequisiteSteps?.length || quest.chain?.length || 0;
  return (
    <li className="inspectable-entry">
      <TooltipTrigger className="simple-list-trigger" label={`Quest details for ${quest.name}`} onActivate={() => onPin({ quest, dungeon })} content={<QuestTooltip quest={quest} dungeon={dungeon} />}>
        <div><strong className="quest-link">{quest.name}</strong><span>{quest.faction || "Faction unknown"} · {Number.isFinite(quest.minLevel) ? `Lv ${quest.minLevel}+` : "Pickup level pending"}{prerequisiteCount ? ` · ${prerequisiteCount} pre-quest${prerequisiteCount === 1 ? "" : "s"}` : ""}</span>{quest.from?.[0] && <small className="quest-pickup-line">Pickup: {quest.from[0].name} · {questPlaceLabel(quest.from[0])}</small>}</div>
        <b>{Number.isFinite(quest.xp) ? `${number(quest.xp)} XP` : "XP ?"}</b>
      </TooltipTrigger>
    </li>
  );
}

function LootListEntry({ item, dungeon }) {
  const source = itemSourceMeta(item, dungeon);
  const sourceQuest = dungeon.quests.find((quest) => String(quest.id) === String(source.questId) || quest.name === source.name);
  const sourceHref = source.kind === "quest" ? questSourceUrl(sourceQuest || { id: source.questId, name: source.name }, dungeon) : entitySourceUrl(source, dungeon);
  return (
    <li className="inspectable-entry">
      <TooltipTrigger className="simple-list-trigger" label={`Item details for ${item.name}`} onActivate={() => openItemSource(item, dungeon)} content={<ItemTooltip item={item} dungeon={dungeon} />}>
        <div className="mini-loot-name"><ItemIcon item={item} compact /><div><strong className={qualityClass(item)}>{item.name}</strong><span className="loot-source-line"><em className={`source-badge source-${source.kind}`}>{source.label}</em><a data-no-activate href={sourceHref} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>{source.name} ↗</a></span></div></div>
        <div className="dungeon-loot-facts" aria-label={`${item.name} item facts`}>
          <span><small>iLvl</small>{item.itemLevel || "—"}</span>
          <span><small>Req</small>{item.requiredLevel || "—"}</span>
          <span><small>Slot</small>{item.slot || "—"}</span>
          <span><small>Type</small>{item.type || "—"}</span>
        </div>
        <ClassChips item={item} bestOnly limit={3} />
        <ItemActions item={item} dungeon={dungeon} compact />
      </TooltipTrigger>
    </li>
  );
}

function DungeonMapPanel({ dungeon, map }) {
  const [floorIndex, setFloorIndex] = useState(0);
  const panelRef = useRef(null);
  const layerRef = useRef(null);
  const zoomLabelRef = useRef(null);
  const transformRef = useRef({ scale: 1, x: 0, y: 0 });
  const dragRef = useRef(null);
  useEffect(() => {
    setFloorIndex(0);
    resetMap();
  }, [dungeon.id]);
  useEffect(() => resetMap(), [floorIndex]);
  const sourceFloors = map?.floors || (map ? [{ name: "Instance map", src: map.src }] : []);
  const usefulFloors = sourceFloors.filter((entry) => entry.kind !== "client-overhead");
  const floors = usefulFloors.length ? usefulFloors : sourceFloors;
  const floor = floors[Math.min(floorIndex, Math.max(0, floors.length - 1))];
  const floorKind = floor?.kind || map?.kind;
  const isSchematic = floorKind === "route-schematic";
  const mapLabel = isSchematic ? "Sourced route schematic" : floorKind === "client-overhead" ? "Official client overhead" : floorKind === "fallback-map" ? "Fallback overview" : "Official client floor map";
  function applyTransform() {
    if (!layerRef.current) return;
    const { scale, x, y } = transformRef.current;
    layerRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    if (zoomLabelRef.current) zoomLabelRef.current.textContent = `${Math.round(scale * 100)}%`;
  }
  function zoomBy(amount) {
    const current = transformRef.current;
    const scale = Math.min(4, Math.max(1, current.scale + amount));
    transformRef.current = scale === 1 ? { scale: 1, x: 0, y: 0 } : { ...current, scale };
    applyTransform();
  }
  function resetMap() {
    transformRef.current = { scale: 1, x: 0, y: 0 };
    applyTransform();
  }
  function startPan(event) {
    if (transformRef.current.scale <= 1) return;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: transformRef.current.x, y: transformRef.current.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.classList.add("is-panning");
  }
  function movePan(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    transformRef.current = { ...transformRef.current, x: drag.x + event.clientX - drag.startX, y: drag.y + event.clientY - drag.startY };
    applyTransform();
  }
  function endPan(event) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.classList.remove("is-panning");
  }
  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await panelRef.current?.requestFullscreen?.();
  }
  return (
    <div ref={panelRef} className={`dungeon-map-panel ${isSchematic ? "map-schematic" : ""}`}>
      <div className="dungeon-map-stage">
        {map ? <div
          className={`map-viewport ${floorKind === "client-map" ? "client-floor-link" : ""}`}
          onWheel={(event) => { event.preventDefault(); zoomBy(event.deltaY < 0 ? .25 : -.25); }}
          onDoubleClick={() => zoomBy(.5)}
          onPointerDown={startPan}
          onPointerMove={movePan}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          aria-label={`${dungeon.name} interactive map. Use the controls, mouse wheel, or drag while zoomed.`}
        ><div ref={layerRef} className="map-transform-layer"><img src={assetUrl(floor.src)} alt={`${dungeon.name} ${floor.name} ${mapLabel.toLowerCase()}`} draggable="false" />{floorKind === "client-map" && <span className="client-map-pins" aria-label={`${floor.name} boss pins`}>{floor.entrance && <i className="client-map-pin entrance-pin" style={{ left: `${floor.entrance.x * 100}%`, top: `${floor.entrance.y * 100}%` }} title="Entrance">▲</i>}{(floor.pins || []).map((pin) => <i className="client-map-pin" style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }} title={`${pin.order}. ${pin.name}`} key={`${pin.id}-${pin.order}`}><b>{pin.order}</b><em>{pin.name}</em></i>)}</span>}</div></div> : <div className="map-pending"><span>⌁</span><strong>Forever map pending</strong><small>No verified public interior coordinates are available yet.</small></div>}
        {map && <div className="map-controls" role="group" aria-label="Map controls"><button onClick={() => zoomBy(-.25)} aria-label="Zoom map out">−</button><output ref={zoomLabelRef} aria-live="polite">100%</output><button onClick={() => zoomBy(.25)} aria-label="Zoom map in">+</button><button onClick={resetMap}>Reset</button><button onClick={toggleFullscreen} aria-label="View map fullscreen">Fullscreen</button></div>}
        {floors.length > 1 && <div className="map-floor-tabs" aria-label={`${dungeon.name} map floors`}>{floors.map((entry, index) => <button key={entry.name} aria-pressed={index === floorIndex} onClick={() => setFloorIndex(index)}>{entry.name}</button>)}</div>}
      </div>
      <footer className="map-caption" title={floor?.quality || map?.quality || "Verified map source"}><div><span>{mapLabel}</span><strong>{floor?.name || dungeon.name}</strong></div><nav aria-label="Map sources">{map ? <><a href={assetUrl(floor.src)} target="_blank" rel="noreferrer">Open full map ↗</a><a href={map.sourceUrl} target="_blank" rel="noreferrer">Source ↗</a></> : <a href={dungeon.questSourceUrl} target="_blank" rel="noreferrer">Watch coverage ↗</a>}</nav></footer>
    </div>
  );
}

function DungeonDetail({ dungeon, faction, characterClass, characterSpec, onPin, onClose, onAddRoute, onPlanNext }) {
  const [classFilter, setClassFilter] = useState(characterClass || "all");
  const [fitMode, setFitMode] = useState("usable");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [bossFilter, setBossFilter] = useState("all");
  const [slotFilter, setSlotFilter] = useState("all");
  const [rarityFilter, setRarityFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  useEffect(() => setClassFilter(characterClass || "all"), [characterClass]);
  useEffect(() => setBossFilter("all"), [dungeon?.id]);
  if (!dungeon) return null;
  const quests = dungeon.quests.filter((quest) => matchesFaction(quest.faction, faction));
  const factionLoot = dungeon.loot.filter((item) => lootVisibleForFaction(item, dungeon, faction));
  const slots = [...new Set(factionLoot.map((item) => item.slot).filter(Boolean))].sort();
  const bossOptions = [...new Set(factionLoot.map((item) => itemSourceMeta(item, dungeon)).filter((source) => source.kind === "boss").map((source) => source.name))].sort();
  const selectedSpec = classFilter === characterClass ? characterSpec : defaultSpec(classFilter);
  const loot = factionLoot.filter((item) => {
    const source = itemSourceMeta(item, dungeon);
    const fitMatch = classFilter === "all" || fitMode === "all" || (fitMode === "recommended" ? recommendedForProfile(item, classFilter, selectedSpec) : classCanUseItem(item, classFilter));
    const rarity = String(item.rarity || item.quality || "common").toLowerCase();
    return fitMatch
      && (sourceFilter === "all" || source.kind === sourceFilter)
      && (bossFilter === "all" || source.kind === "boss" && source.name === bossFilter)
      && (slotFilter === "all" || item.slot === slotFilter)
      && (rarityFilter === "all" || rarity === rarityFilter)
      && (levelFilter === "all" || Number(item.requiredLevel || item.itemLevel || 0) <= Number(levelFilter));
  }).sort((a, b) => (classFilter === "all" ? 0 : specFitScore(b, classFilter, selectedSpec) - specFitScore(a, classFilter, selectedSpec)) || (b.itemLevel || 0) - (a.itemLevel || 0));
  const verified = quests.filter((quest) => quest.dataStatus === "verified").length;
  const map = dungeonMaps[dungeon.id];
  const sourceCounts = factionLoot.reduce((counts, item) => {
    const kind = itemSourceMeta(item, dungeon).kind;
    return { ...counts, [kind]: (counts[kind] || 0) + 1 };
  }, {});
  const bossCounts = bossOptions.map((boss) => ({ boss, count: factionLoot.filter((item) => { const source = itemSourceMeta(item, dungeon); return source.kind === "boss" && source.name === boss; }).length }));
  function selectLootGroup(source, boss = "all") {
    setSourceFilter(source);
    setBossFilter(boss);
  }
  return (
    <section className="detail-panel panel dense-detail">
      {onClose && <button className="detail-close" onClick={onClose} aria-label="Close dungeon details">×</button>}
      <header className="dungeon-command-bar">
        <div className="dense-detail-title"><div className="section-kicker">{dungeon.kind === "new" ? "Forever dungeon" : "Classic dungeon"}</div><h2>{dungeon.name}</h2><p>Levels {dungeon.level.join("–")} · {dungeon.location || "Location not yet verified"}</p></div>
        <div className="dense-summary-bar" aria-label={`${dungeon.name} summary`}>
          <span><small>Loot</small><strong>{factionLoot.length}</strong></span>
          <span><small>{humanize(faction)} quests</small><strong>{quests.length}</strong></span>
          <span><small>Forever quest XP</small><strong>{number(quests.reduce((sum, quest) => sum + (quest.xp || 0), 0))}</strong></span>
          <span><small>Boss / quest loot</small><strong>{sourceCounts.boss || 0} / {sourceCounts.quest || 0}</strong></span>
          <span><small>Map coverage</small><strong>{map ? `${(map.floors || []).filter((entry) => entry.kind !== "client-overhead").length || 1} floor${((map.floors || []).filter((entry) => entry.kind !== "client-overhead").length || 1) === 1 ? "" : "s"}` : "Pending"}</strong></span>
        </div>
        <div className="detail-actions"><button onClick={() => onAddRoute(dungeon.id)}>Add to route</button><button onClick={() => onPlanNext(dungeon.id)}>Plan next</button><a href={reportIssueUrl({ dungeon })} target="_blank" rel="noreferrer">Report</a></div>
      </header>
      <div className="dense-overview-grid">
        <section className="dense-map"><DungeonMapPanel dungeon={dungeon} map={map} /></section>
        <aside className="dense-side-stack">
          <section className="dense-quests"><header><div><span className="section-kicker">Quest ledger</span><h3>{humanize(faction)} quests</h3></div><strong>{verified} detailed · {quests.length} visible</strong></header><p>Open for pickup map, prerequisites, rewards, and Forever source.</p><ul className="simple-list dungeon-quest-list">{quests.map((quest) => <QuestListEntry key={`${quest.id}-${quest.name}`} quest={quest} dungeon={dungeon} onPin={onPin} />)}</ul></section>
          <section className="encounter-summary" aria-label={`${dungeon.name} encounter index`}><header><span className="section-kicker">Encounter index</span><h3>{bossCounts.length} bosses</h3></header><ol>{bossCounts.map(({ boss, count }, index) => <li key={boss}><em>{String(index + 1).padStart(2, "0")}</em><a href={entitySourceUrl({ name: boss }, dungeon)} target="_blank" rel="noreferrer">{boss} ↗</a><b>{count} item{count === 1 ? "" : "s"}</b></li>)}</ol><footer><span>Quest rewards <b>{sourceCounts.quest || 0}</b></span><span>Other drops <b>{(sourceCounts.drop || 0) + (sourceCounts.trash || 0)}</b></span></footer></section>
        </aside>
      </div>
      <section className="dungeon-loot-workbench">
        <div className="dungeon-loot-column">
          <header className="dungeon-loot-heading"><div><span className="section-kicker">Dungeon loot</span><h3>{bossFilter !== "all" ? bossFilter : sourceFilter === "quest" ? "Quest rewards" : "All items"}</h3></div><strong>{loot.length} of {factionLoot.length} items</strong></header>
          <nav className="boss-filter-strip" aria-label="Filter dungeon loot by boss"><span>Boss</span><button aria-pressed={bossFilter === "all"} onClick={() => selectLootGroup("all")}>All <b>{factionLoot.filter((item) => itemSourceMeta(item, dungeon).kind === "boss").length}</b></button>{bossCounts.map(({ boss, count }, index) => <button key={boss} data-boss={boss} aria-pressed={bossFilter === boss} onClick={() => selectLootGroup("all", boss)}><em>{String(index + 1).padStart(2, "0")}</em>{boss}<b>{count}</b></button>)}</nav>
          <div className="dungeon-loot-controls">
            <div className="detail-filter-label"><strong>Loot controls</strong><span>{classFilter === "all" ? "Every class" : `${humanize(classFilter)} · ${specProfile(classFilter, selectedSpec).label}`}</span></div>
            <ClassFilterStrip value={classFilter} onChange={setClassFilter} compact />
            <div className="detail-fit-row"><FitMode value={fitMode} onChange={setFitMode} /><SourceFilter value={sourceFilter} onChange={setSourceFilter} /></div>
            <div className="detail-quick-filters"><select aria-label="Filter dungeon loot by slot" value={slotFilter} onChange={(event) => setSlotFilter(event.target.value)}><option value="all">All slots</option>{slots.map((slot) => <option key={slot}>{slot}</option>)}</select><select aria-label="Filter dungeon loot by rarity" value={rarityFilter} onChange={(event) => setRarityFilter(event.target.value)}><option value="all">All rarities</option><option value="uncommon">Uncommon</option><option value="rare">Rare</option><option value="epic">Epic</option></select><select aria-label="Filter dungeon loot by level" value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)}><option value="all">Any level</option>{[20,30,40,50,60].map((level) => <option value={level} key={level}>Up to level {level}</option>)}</select></div>
            <div className="source-legend" aria-label="Loot source legend"><span><em className="source-badge source-quest">Quest {sourceCounts.quest || 0}</em></span><span><em className="source-badge source-boss">Boss {sourceCounts.boss || 0}</em></span><span><em className="source-badge source-drop">Boss / mob {sourceCounts.drop || 0}</em></span><span><em className="source-badge source-trash">Trash {sourceCounts.trash || 0}</em></span></div>
          </div>
          <div className="dungeon-loot-table-head" aria-hidden="true"><span>Item</span><span>Item details</span><span>Best for</span><span>Actions</span></div>
          <ul className="simple-list loot-detail-list">{loot.map((item, index) => <LootListEntry key={`${item.id || item.name}-${index}`} item={item} dungeon={dungeon} />)}</ul>
          {!loot.length && <p className="loot-empty-state">No items match these loot filters.</p>}
        </div>
      </section>
    </section>
  );
}

function Dungeons({ dungeons, faction }) {
  const [query, setQuery] = useState("");
  const [band, setBand] = useState("all");
  const filtered = dungeons.filter((dungeon) => {
    const textMatch = dungeon.name.toLowerCase().includes(query.toLowerCase()) || (dungeon.location || "").toLowerCase().includes(query.toLowerCase());
    const bandMatch = band === "all" || dungeon.level[0] < Number(band) + 10 && dungeon.level[1] >= Number(band);
    return textMatch && bandMatch;
  });
  return (
    <main className="library-shell">
      <header className="library-header"><div><div className="section-kicker">Dungeon atlas</div><h1>All Forever dungeons</h1><p>{dungeons.length} instances with quest and loot coverage.</p></div><div className="library-filters"><input type="search" placeholder="Search dungeon or zone" value={query} onChange={(event) => setQuery(event.target.value)} /><select value={band} onChange={(event) => setBand(event.target.value)}><option value="all">All levels</option>{[10, 20, 30, 40, 50].map((value) => <option key={value} value={value}>Levels {value}–{value + 9}</option>)}</select></div></header>
      <div className="dungeon-grid">{filtered.map((dungeon) => { const questCount = dungeon.quests.filter((quest) => matchesFaction(quest.faction, faction)).length; const visibleLoot = dungeon.loot.filter((item) => lootVisibleForFaction(item, dungeon, faction)); const counts = visibleLoot.reduce((result, item) => { const kind = itemSourceMeta(item, dungeon).kind; return { ...result, [kind]: (result[kind] || 0) + 1 }; }, {}); const map = dungeonMaps[dungeon.id]; return <a className="dungeon-card" href={appHref(`/dungeons/${dungeon.id}/`)} key={dungeon.id}><span className="dungeon-level">{dungeon.level[0]}–{dungeon.level[1]}</span>{dungeon.kind === "new" && <span className="new-badge">NEW</span>}<h2>{dungeon.name}</h2><p>{dungeon.location || "Location details pending"}</p><div><span>{questCount} quests</span><span>{counts.boss || 0} boss</span><span>{counts.quest || 0} quest rewards</span><span>{map?.kind === "route-schematic" ? "Route map" : map ? "Map" : "Map pending"}</span></div><small>{dungeon.dataCoverage === "detailed" ? "Detailed beta data" : "Loot catalog coverage"}</small></a>; })}</div>
    </main>
  );
}

function DungeonPage({ dungeon, ...props }) {
  return <main className="library-shell dungeon-page-shell"><DungeonDetail dungeon={dungeon} {...props} /></main>;
}

function Breadcrumbs({ page, dungeon }) {
  const items = [{ label: "Home", href: appHref("/") }];
  if (page.id === "dungeon") items.push({ label: "Dungeons", href: appHref("/dungeons/") }, { label: dungeon?.name || "Not found" });
  else if (page.id === "planner") items.push({ label: "Route" });
  else items.push({ label: PAGE_PATHS[page.id] ? humanize(page.id === "profile" ? "My Gear" : page.id) : "Not found" });
  return <nav className="breadcrumbs" aria-label="Breadcrumb">{items.map((item) => item.href ? <a href={item.href} key={item.label}>{item.label}</a> : <span aria-current="page" key={item.label}>{item.label}</span>)}</nav>;
}

function Quests({ dungeons, faction, onPin }) {
  const [query, setQuery] = useState("");
  const [dungeonId, setDungeonId] = useState("all");
  const [coverage, setCoverage] = useState("all");
  const [questKind, setQuestKind] = useState("all");
  const allQuests = useMemo(() => {
    const primary = dungeons.flatMap((dungeon) => dungeon.quests.map((quest) => ({ quest, dungeon, kind: "dungeon" })));
    const prerequisites = [];
    const seen = new Set();
    for (const { quest: parentQuest, dungeon } of primary) for (const step of parentQuest.prerequisiteSteps || []) for (const record of step || []) {
      const key = `${dungeon.id}:${record.id || record.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      prerequisites.push({ quest: chainQuestRecord(record), dungeon, parentQuest, kind: "prerequisite" });
    }
    return [...primary, ...prerequisites];
  }, [dungeons]);
  const filtered = allQuests.filter(({ quest, dungeon, parentQuest, kind }) => {
    const haystack = `${quest.name} ${quest.objective || ""} ${quest.note || ""} ${quest.from?.map((actor) => `${actor.name} ${actor.zone || ""}`).join(" ") || ""} ${parentQuest?.name || ""} ${dungeon.name}`.toLowerCase();
    const factionMatch = matchesFaction(quest.faction, faction);
    return haystack.includes(query.toLowerCase())
      && (dungeonId === "all" || dungeon.id === dungeonId)
      && factionMatch
      && (questKind === "all" || kind === questKind)
      && (coverage === "all" || quest.dataStatus === coverage);
  });
  return (
    <main className="library-shell">
      <header className="library-header"><div><div className="section-kicker">Quest ledger</div><h1>{humanize(faction)} dungeon quests</h1><p>Dungeon quests and their prerequisite pickup routes. Opposing-faction quests stay hidden.</p></div><div className="library-filters quest-filters"><input type="search" placeholder="Search quest, giver, zone, or dungeon" value={query} onChange={(event) => setQuery(event.target.value)} /><select value={dungeonId} onChange={(event) => setDungeonId(event.target.value)}><option value="all">All dungeons</option>{dungeons.map((dungeon) => <option key={dungeon.id} value={dungeon.id}>{dungeon.name}</option>)}</select><select value={questKind} onChange={(event) => setQuestKind(event.target.value)}><option value="all">Dungeon + prerequisite quests</option><option value="dungeon">Dungeon quests</option><option value="prerequisite">Prerequisite quests</option></select><select value={coverage} onChange={(event) => setCoverage(event.target.value)}><option value="all">All coverage</option><option value="verified">Verified details</option><option value="chain-source">Forever prerequisite records</option><option value="rewards-only">Rewards-only records</option></select></div></header>
      <div className="result-count">Showing all {number(filtered.length)} matching quests · hover, focus, or tap for full details</div>
      <div className="quest-table" role="table" aria-label="Dungeon quest results">
        <div className="quest-head" role="row"><span>Quest</span><span>Dungeon</span><span>Requirement</span><span>Experience</span></div>
        {filtered.map(({ quest, dungeon, parentQuest, kind }, index) => (
          <TooltipTrigger key={`${dungeon.id}-${quest.id || quest.name}-${index}`} role="row" className="quest-archive-row" label={`Quest details for ${quest.name}`} onActivate={() => onPin({ quest, dungeon })} content={<QuestTooltip quest={quest} dungeon={dungeon} />}>
            <div className="archive-quest-name"><span className="quest-archive-mark" aria-hidden="true">!</span><div><strong>{quest.name}</strong><small>{kind === "prerequisite" ? `Prerequisite for ${parentQuest.name}` : quest.dataStatus === "verified" ? "Verified Forever record" : "Partial beta record"}</small></div></div>
            <div><strong>{kind === "prerequisite" ? quest.from?.[0]?.name || "Pickup pending" : dungeon.name}</strong><small>{kind === "prerequisite" ? questPlaceLabel(quest.from?.[0]) : quest.faction ? humanize(quest.faction) : "Faction pending"}</small></div>
            <div>Level {questMinimumLevel(quest, dungeon)}+</div>
            <div className="archive-xp">{Number.isFinite(quest.xp) ? `${number(quest.xp)} XP` : "XP unverified"}<small>Pin quest ↗</small></div>
          </TooltipTrigger>
        ))}
      </div>
    </main>
  );
}

function LootRow({ item, dungeon }) {
  const source = itemSourceMeta(item, dungeon);
  return (
    <TooltipTrigger className="loot-row" role="row" label={`Item details for ${item.name}`} onActivate={() => openItemSource(item, dungeon)} content={<ItemTooltip item={item} dungeon={dungeon} />}>
      <div className="loot-name"><ItemIcon item={item} /><div><strong className={qualityClass(item)}>{item.name}</strong><small>{item.type || "Type pending"}</small></div></div>
      <div><strong>{dungeon.name}</strong><small><em className={`source-badge source-${source.kind}`}>{source.label}</em> {source.name}</small></div>
      <div>{item.slot || "—"}</div>
      <ClassChips item={item} bestOnly limit={4} />
      <div>{item.requiredLevel ? `Req ${item.requiredLevel}` : item.itemLevel ? `iLvl ${item.itemLevel}` : "—"}</div>
      <ItemActions item={item} dungeon={dungeon} compact />
    </TooltipTrigger>
  );
}

function BossGroupedLoot({ entries }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem("forever-route-planner:collapsed-loot")) || {}; } catch { return {}; }
  });
  function toggle(key) {
    setCollapsed((current) => {
      const next = { ...current, [key]: !current[key] };
      localStorage.setItem("forever-route-planner:collapsed-loot", JSON.stringify(next));
      return next;
    });
  }
  const dungeons = [...new Map(entries.map((entry) => [entry.dungeon.id, entry.dungeon])).values()];
  return (
    <div className="loot-groups">
      {dungeons.map((dungeon) => {
        const dungeonEntries = entries.filter((entry) => entry.dungeon.id === dungeon.id);
        const bosses = [...new Set(dungeonEntries.map(({ item }) => itemSourceMeta(item, dungeon).name))];
        return (
          <section className="loot-dungeon-group" key={dungeon.id}>
            <header><div><span>Levels {dungeon.level.join("–")}</span><h2>{dungeon.name}</h2></div><button className="collapse-button" onClick={() => toggle(`dungeon:${dungeon.id}`)}>{collapsed[`dungeon:${dungeon.id}`] ? `Show ${dungeonEntries.length}` : `Hide ${dungeonEntries.length}`}</button></header>
            {!collapsed[`dungeon:${dungeon.id}`] && <div className="boss-loot-grid">
              {bosses.map((boss) => {
                const items = dungeonEntries.filter(({ item }) => itemSourceMeta(item, dungeon).name === boss);
                const source = itemSourceMeta(items[0].item, dungeon);
                const groupKey = `${dungeon.id}:${source.kind}:${boss}`;
                const sourceQuest = dungeon.quests.find((quest) => String(quest.id) === String(source.questId) || quest.name === source.name);
                return <section className="boss-loot-group" key={boss}><h3><span className="source-heading"><em className={`source-badge source-${source.kind}`}>{source.label}</em><a href={source.kind === "quest" ? questSourceUrl(sourceQuest || { id: source.questId, name: source.name }, dungeon) : entitySourceUrl(source, dungeon)} target="_blank" rel="noreferrer">{boss} ↗</a></span><button className="group-toggle" onClick={() => toggle(groupKey)}>{collapsed[groupKey] ? `Show ${items.length}` : `Hide ${items.length}`}</button></h3>{!collapsed[groupKey] && <div className="boss-item-grid">{items.map(({ item }, index) => <TooltipTrigger key={`${item.id || item.name}-${index}`} className="loot-card" label={`Item details for ${item.name}`} onActivate={() => openItemSource(item, dungeon)} content={<ItemTooltip item={item} dungeon={dungeon} />}><ItemIcon item={item} compact /><div><strong className={qualityClass(item)}>{item.name}</strong><small>{item.slot || item.type || "Item"}</small><ClassChips item={item} bestOnly limit={3} /></div><ItemActions item={item} dungeon={dungeon} compact /></TooltipTrigger>)}</div>}</section>;
              })}
            </div>}
          </section>
        );
      })}
    </div>
  );
}

function Loot({ dungeons, characterClass, characterSpec, faction }) {
  const gear = useGear();
  const { query, dungeonId, slot, rarity, fitMode, sourceFilter, wishlistOnly, sort, viewMode } = gear.lootPreferences;
  const classFilter = gear.lootPreferences.classFilter || characterClass || "all";
  const setPreference = (key, value) => gear.updateLootPreferences({ [key]: value });
  const allLoot = useMemo(() => dungeons.flatMap((dungeon) => dungeon.loot.map((item) => ({ item, dungeon }))), [dungeons]);
  const slots = useMemo(() => [...new Set(allLoot.map(({ item }) => item.slot).filter(Boolean))].sort(), [allLoot]);
  const filtered = allLoot.filter(({ item, dungeon }) => {
    const source = itemSourceMeta(item, dungeon);
    const selectedSpec = classFilter === characterClass ? characterSpec : defaultSpec(classFilter);
    const haystack = `${item.name} ${item.slot || ""} ${item.type || ""} ${item.boss || ""} ${dungeon.name}`.toLowerCase();
    return haystack.includes(query.toLowerCase())
      && (dungeonId === "all" || dungeon.id === dungeonId)
      && (slot === "all" || item.slot === slot)
      && (rarity === "all" || String(item.rarity || item.quality).toLowerCase() === rarity)
      && lootVisibleForFaction(item, dungeon, faction)
      && (sourceFilter === "all" || source.kind === sourceFilter)
      && (!wishlistOnly || gear.isWishlisted(item, dungeon))
      && (classFilter === "all" || fitMode === "all" || (fitMode === "recommended" ? recommendedForProfile(item, classFilter, selectedSpec) : classCanUseItem(item, classFilter)));
  }).sort((a, b) => {
    const selectedSpec = classFilter === characterClass ? characterSpec : defaultSpec(classFilter);
    if (sort === "fit" && classFilter !== "all") return specFitScore(b.item, classFilter, selectedSpec) - specFitScore(a.item, classFilter, selectedSpec) || (b.item.itemLevel || 0) - (a.item.itemLevel || 0);
    if (sort === "level") return (b.item.itemLevel || 0) - (a.item.itemLevel || 0);
    if (sort === "name") return a.item.name.localeCompare(b.item.name);
    return a.dungeon.level[0] - b.dungeon.level[0] || a.dungeon.name.localeCompare(b.dungeon.name);
  });
  return (
    <main className="library-shell">
      <header className="library-header loot-library-header"><div><div className="section-kicker">Loot workbench</div><h1>Dungeon loot</h1><p>{number(allLoot.length)} source-backed drops and rewards. Click any item for its WoW Forever source.</p></div><div className="view-switch" aria-label="Loot view"><button className={viewMode === "boss" ? "active" : ""} onClick={() => setPreference("viewMode", "boss")}>Dungeon → boss</button><button className={viewMode === "list" ? "active" : ""} onClick={() => setPreference("viewMode", "list")}>All items</button></div></header>
      <section className="loot-control-deck panel">
        <ClassFilterStrip value={classFilter} onChange={(value) => setPreference("classFilter", value)} />
        <div className="loot-mode-row"><FitMode value={fitMode} onChange={(value) => setPreference("fitMode", value)} /><SourceFilter value={sourceFilter} onChange={(value) => setPreference("sourceFilter", value)} /><button className={`wishlist-filter ${wishlistOnly ? "active" : ""}`} onClick={() => setPreference("wishlistOnly", !wishlistOnly)}>★ Wishlist only</button></div>
        <div className="loot-filter-grid"><input type="search" placeholder="Search item, boss, slot, or dungeon" value={query} onChange={(event) => setPreference("query", event.target.value)} /><select value={dungeonId} onChange={(event) => setPreference("dungeonId", event.target.value)}><option value="all">All dungeons</option>{dungeons.map((dungeon) => <option key={dungeon.id} value={dungeon.id}>{dungeon.name}</option>)}</select><select value={slot} onChange={(event) => setPreference("slot", event.target.value)}><option value="all">All slots</option>{slots.map((value) => <option key={value}>{value}</option>)}</select><select value={rarity} onChange={(event) => setPreference("rarity", event.target.value)}><option value="all">All rarities</option><option value="uncommon">Uncommon</option><option value="rare">Rare</option><option value="epic">Epic</option></select><select value={sort} onChange={(event) => setPreference("sort", event.target.value)}><option value="fit">Best spec fit</option><option value="dungeon">Dungeon level</option><option value="level">Highest item level</option><option value="name">Item name</option></select></div>
      </section>
      <div className="result-count">Showing {number(filtered.length)} matching items · {classFilter === "all" ? "every class" : `${humanize(classFilter)} ${specProfile(classFilter, classFilter === characterClass ? characterSpec : defaultSpec(classFilter)).label}`} · opposing-faction quest rewards hidden · rules-based fit</div>
      {viewMode === "boss" ? <BossGroupedLoot entries={filtered} /> : <div className="loot-table" role="table" aria-label="Dungeon loot results"><div className="loot-head" role="row"><span>Item</span><span>Dungeon / source</span><span>Slot</span><span>Best fit</span><span>Level</span><span /></div>{filtered.map(({ item, dungeon }, index) => <LootRow item={item} dungeon={dungeon} key={`${dungeon.id}-${item.id || item.name}-${index}`} />)}</div>}
    </main>
  );
}

function Profile({ dungeons }) {
  const gear = useGear();
  const dungeonsById = useMemo(() => new Map(dungeons.map((dungeon) => [dungeon.id, dungeon])), [dungeons]);
  const equippedItems = Object.values(gear.equipped);
  const [companionText, setCompanionText] = useState("");
  const [companionNotice, setCompanionNotice] = useState("");
  const telemetry = gear.telemetry || DEFAULT_STATE.telemetry;
  const telemetrySummary = useMemo(() => summarizeTelemetry(telemetry.runs || []), [telemetry.runs]);

  function importCompanion() {
    try {
      const result = gear.importCompanion(companionText);
      setCompanionNotice(result);
    } catch (error) {
      setCompanionNotice(error.message);
    }
  }

  async function exportPlanner() {
    const value = gear.exportPlanner();
    setCompanionText(value);
    try { await navigator.clipboard.writeText(value); } catch { /* The text remains selected in the workspace. */ }
    setCompanionNotice("Planner route copied when clipboard access is available. Import it in game with /wfrp import <text>.");
  }

  return (
    <main className="library-shell profile-shell">
      <header className="library-header"><div><div className="section-kicker">Forever intelligence suite</div><h1>Character, runs, gear & party</h1><p>The addon records what actually happened. The website turns it into leveling and gear decisions.</p></div><div className="profile-header-stack"><a className="addon-download addon-download-primary" href={assetUrl("addons/ForeverRouteCompanion.zip")} download>Download addon v1.0</a><div className="profile-metrics"><span><strong>{telemetrySummary.runs}</strong> runs</span><span><strong>{gear.wishlist.length}</strong> wishlist</span><span><strong>{Math.max(gear.party.length + 1, telemetry.group?.length || 0)}</strong> party</span></div></div></header>
      <section className="intelligence-dashboard panel">
        <header><div><span>Imported intelligence</span><h2>{gear.characterMeta.name ? `${gear.characterMeta.name} · ${gear.characterMeta.realm}` : "No WFRP 1.0 telemetry imported"}</h2></div><small>{telemetry.importedAt ? `Imported ${new Date(telemetry.importedAt).toLocaleString()}` : "Install the addon, run /wfrp export, and import below."}</small></header>
        <div className="intelligence-metrics">
          <span><b>{telemetrySummary.runs}</b> recorded runs</span><span><b>{number(telemetrySummary.totalXp)}</b> dungeon XP</span><span><b>{number(telemetrySummary.xpPerHour)}</b> XP / hour</span><span><b>{compactDuration(telemetrySummary.duration)}</b> run time</span><span><b>{telemetrySummary.bosses}</b> bosses</span><span><b>{telemetrySummary.deaths}</b> deaths</span>
        </div>
        <div className="intelligence-grid">
          <section className="character-live-card">
            <h3>Live character snapshot</h3>
            <div><span>Level / XP<strong>{gear.characterMeta.name ? `Level ${gear.level} · ${number(gear.xp)} XP` : "Awaiting import"}</strong></span><span>Class / spec<strong>{gear.characterClass ? `${humanize(gear.characterClass)} · ${specProfile(gear.characterClass, gear.spec).label}` : "Unknown"}</strong></span><span>Location<strong>{[telemetry.zone, telemetry.subzone].filter(Boolean).join(" · ") || "Unknown"}</strong></span><span>Preparation<strong>{telemetry.freeBagSlots} bag slots · {telemetry.durability}% durability · {number(telemetry.restedXp)} rested</strong></span><span>Currency<strong>{coinText(telemetry.money)}</strong></span></div>
          </section>
          <section className="xp-breakdown-card">
            <h3>Observed XP breakdown</h3>
            <div className="xp-breakdown-bar" aria-label={`${number(telemetrySummary.combatXp)} combat XP, ${number(telemetrySummary.questXp)} quest XP, ${number(telemetrySummary.unclassifiedXp)} unclassified XP`}><i style={{ width: `${telemetrySummary.totalXp ? telemetrySummary.combatXp / telemetrySummary.totalXp * 100 : 0}%` }} /><i style={{ width: `${telemetrySummary.totalXp ? telemetrySummary.questXp / telemetrySummary.totalXp * 100 : 0}%` }} /><i style={{ width: `${telemetrySummary.totalXp ? telemetrySummary.unclassifiedXp / telemetrySummary.totalXp * 100 : 0}%` }} /></div>
            <div className="xp-breakdown-legend"><span>Combat <b>{number(telemetrySummary.combatXp)}</b></span><span>Quest <b>{number(telemetrySummary.questXp)}</b></span><span>Other <b>{number(telemetrySummary.unclassifiedXp)}</b></span></div>
            <small>Personal observations override generic combat-XP estimates when enough samples exist.</small>
          </section>
        </div>
        <div className="run-dashboard-grid">
          <section className="run-history-card"><h3>Recent runs</h3>{telemetry.runs?.length ? <div className="run-history-table">{telemetry.runs.slice(-8).reverse().map((run) => <div key={run.id}><strong>{run.dungeonName}</strong><span>{compactDuration(run.duration)}</span><span>{number(run.totalXp)} XP</span><span>{run.bosses.length} bosses</span><span className={run.deaths ? "danger" : "success"}>{run.deaths} deaths</span></div>)}</div> : <p>No runs imported yet. The addon starts recording automatically when you enter a known Forever dungeon.</p>}</section>
          <section className="dungeon-baseline-card"><h3>Personal dungeon baselines</h3>{telemetrySummary.dungeons.length ? <div>{telemetrySummary.dungeons.slice(0, 7).map((dungeon) => <span key={dungeon.dungeonId}><strong>{dungeon.dungeonName}</strong><small>{dungeon.runs} run{dungeon.runs === 1 ? "" : "s"} · {Math.round(dungeon.averageMinutes)}m avg · {number(dungeon.xpPerHour)} XP/h</small></span>)}</div> : <p>Dungeon averages appear after the first telemetry import.</p>}</section>
        </div>
        {telemetry.group?.length > 0 && <section className="telemetry-party"><h3>Last party snapshot</h3><div>{telemetry.group.map((member, index) => <span key={`${member.name}-${index}`}><b>{member.name}</b><small>{humanize(String(member.class || "unknown").toLowerCase())} · level {member.level}{member.leader ? " · leader" : ""}</small></span>)}</div></section>}
      </section>
      <div className="profile-grid">
        <section className="profile-panel panel"><header><div><span>Current loadout</span><h2>{humanize(gear.characterClass)} · {specProfile(gear.characterClass, gear.spec).label}</h2></div><small>Equip items from any loot row</small></header><div className="loadout-grid">{equippedItems.length ? equippedItems.map((item) => <div className="loadout-slot" key={item.slot}><span>{item.slot}</span><div><ItemIcon item={item} compact /><strong className={qualityClass(item)}>{item.name}</strong></div><button onClick={() => gear.clearEquipped(item.slot)} aria-label={`Clear equipped ${item.slot}`}>×</button></div>) : <p className="empty-copy">No gear equipped yet. Use ⇄ on an item to establish comparison baselines.</p>}</div></section>
        <section className="profile-panel panel"><header><div><span>Party roster</span><h2>Who wants each drop?</h2></div><button onClick={gear.addPartyMember} disabled={gear.party.length >= 4}>Add member</button></header><div className="party-editor">{gear.party.map((member) => <div className="party-member" key={member.id}><input aria-label="Party member name" value={member.name} onChange={(event) => gear.updatePartyMember(member.id, { name: event.target.value })} /><select aria-label={`${member.name} class`} value={member.characterClass} onChange={(event) => gear.updatePartyMember(member.id, { characterClass: event.target.value, spec: defaultSpec(event.target.value) })}>{CLASSES.map((entry) => <option key={entry}>{humanize(entry)}</option>)}</select><select aria-label={`${member.name} specialization`} value={member.spec} onChange={(event) => gear.updatePartyMember(member.id, { spec: event.target.value })}>{(CLASS_SPECS[member.characterClass] || []).map((entry) => <option value={entry.id} key={entry.id}>{entry.label} · {entry.role}</option>)}</select><button onClick={() => gear.removePartyMember(member.id)} aria-label={`Remove ${member.name}`}>×</button></div>)}{!gear.party.length && <p className="empty-copy">Add up to four party members. Item tooltips will show who has a strong rules-based fit.</p>}</div></section>
      </div>
      <section className="wishlist-panel panel"><header><div><span>Loot goals</span><h2>Wishlist</h2></div><strong>{gear.wishlist.length} tracked</strong></header>{gear.wishlist.length ? <div className="wishlist-grid">{gear.wishlist.map((item) => { const dungeon = dungeonsById.get(item.dungeonId); const equipped = item.slot ? gear.equipped[item.slot] : null; const comparison = compareItems(item, equipped, gear.characterClass, gear.spec); const partyFit = gear.party.filter((member) => recommendedForProfile(item, member.characterClass, member.spec)); return <div className="wishlist-card" key={item.key}><div><ItemIcon item={item} /><span><strong className={qualityClass(item)}>{item.name}</strong><small>{item.dungeonName || "Dungeon pending"} · {item.slot || item.type || "Item"}</small></span></div><div className="wishlist-card-meta"><span>{equipped ? `${comparison.delta >= 0 ? "+" : ""}${comparison.delta.toFixed(1)} vs equipped` : "No equipped comparison"}</span><span>{partyFit.length ? `Party: ${partyFit.map((member) => member.name).join(", ")}` : "No party conflict"}</span></div><ItemActions item={item} dungeon={dungeon} /></div>; })}</div> : <p className="profile-empty">Star items in dungeon details, grouped loot, quest rewards, or the full archive.</p>}</section>
      <section className="companion-panel panel">
        <header><div><span>Companion exchange</span><h2>Install, record, import, adapt.</h2></div><a className="addon-download" href={assetUrl("addons/ForeverRouteCompanion.zip")} download>Download WFRP 1.0</a></header>
        <div className="companion-grid">
          <div className="companion-copy"><strong>{gear.characterMeta.name ? `${gear.characterMeta.name} · ${gear.characterMeta.realm}` : "No character imported"}</strong><p>Install the addon, open it with <code>/wfrp</code>, then use <strong>Sync → Export telemetry</strong>. Paste the WFRP2 text here to update character state, equipped gear, quests, party, and run dashboards. Export the planned route back to the game when ready.</p><ol><li>Download and extract into <code>Interface/AddOns</code>.</li><li>Play normally; known dungeon runs record automatically.</li><li>Run <code>/wfrp export</code> and import below.</li></ol>{gear.characterMeta.importedAt && <small>Last imported {new Date(gear.characterMeta.importedAt).toLocaleString()} · Addon {telemetry.addonVersion || "legacy"} · Hearth: {gear.characterMeta.bindLocation || "unknown"} · {gear.characterMeta.flightPaths.length} flight paths</small>}</div>
          <textarea aria-label="Companion exchange text" value={companionText} onChange={(event) => setCompanionText(event.target.value)} placeholder="Paste WFRP2C telemetry here, or export a WFRP1P route for the addon." spellCheck="false" />
        </div>
        <div className="companion-actions"><button onClick={importCompanion} disabled={!companionText.trim()}>Import character / plan</button><button className="secondary" onClick={exportPlanner}>Copy route for addon</button><a href="https://github.com/anboas/wow-forever-route-planner/tree/main/addon/ForeverRouteCompanion" target="_blank" rel="noreferrer">Source & install guide ↗</a>{companionNotice && <span role="status">{companionNotice}</span>}</div>
      </section>
      <section className="integration-health panel"><header><div><span>Live source coverage</span><h2>WOWF.IO full corpus</h2></div><strong>{snapshot.context.inventory.totalEnglishPages} indexed pages</strong></header><div><span><b>{snapshot.context.dataHealth.quests}</b> normalized quests</span><span><b>{snapshot.context.dataHealth.levelingGuides}</b> class/spec guides</span><span><b>{snapshot.context.dataHealth.zones}</b> zones and instances</span><span><b>{snapshot.context.dataHealth.unresolvedCoordinates}</b> unresolved coordinates</span></div><p>Every retained record carries its source URL, source update time, retrieval time, and review state. Refresh with <code>npm run sync:all</code>; validation fails closed before replacing the checked snapshot.</p></section>
      <section className="provenance-panel"><div><span className="status-dot" /><strong>Snapshot {new Date(snapshot.fetchedAt).toLocaleString()}</strong><small>{snapshot.dungeons.length} dungeons · {number(snapshot.dungeons.reduce((sum, dungeon) => sum + dungeon.loot.length, 0))} loot records</small></div><div>{snapshot.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>{source.name} ↗</a>)}</div><a href={reportIssueUrl({ dungeon: null })} target="_blank" rel="noreferrer">Report incorrect data ↗</a></section>
    </main>
  );
}

export default function App() {
  const page = useMemo(currentPage, []);
  const [state, setState] = useState(loadState);
  const [pinnedQuest, setPinnedQuest] = useState(null);
  const dungeons = snapshot.dungeons;
  const dungeonsById = useMemo(() => new Map(dungeons.map((dungeon) => [dungeon.id, dungeon])), [dungeons]);
  const itemLookup = useMemo(() => {
    const lookup = new Map();
    for (const dungeon of dungeons) for (const item of dungeon.loot) {
      if (item.id) lookup.set(`id:${item.id}`, item);
      lookup.set(`name:${item.name.toLowerCase()}`, item);
    }
    return lookup;
  }, [dungeons]);
  const itemRecordLookup = useMemo(() => {
    const lookup = new Map();
    for (const dungeon of dungeons) for (const item of dungeon.loot) if (item.id && !lookup.has(String(item.id))) lookup.set(String(item.id), { item, dungeon });
    return lookup;
  }, [dungeons]);
  const questLookup = useMemo(() => {
    const lookup = new Map();
    const add = (quest, dungeon) => {
      if (!quest) return;
      if (quest.id !== undefined) lookup.set(`id:${quest.id}`, { quest, dungeon });
      if (quest.name) lookup.set(`name:${quest.name.toLowerCase()}`, { quest, dungeon });
    };
    for (const record of foreverQuestChains.quests || []) add(chainQuestRecord(record), null);
    for (const dungeon of dungeons) for (const quest of dungeon.quests) {
      add(quest, dungeon);
      for (const step of quest.prerequisiteSteps || []) for (const record of step || []) add(chainQuestRecord(record), dungeon);
    }
    return lookup;
  }, [dungeons]);

  useEffect(() => {
    localStorage.setItem("forever-route-planner:v1", JSON.stringify(state));
  }, [state]);

  function toggleWishlist(item, dungeon) {
    setState((current) => {
      const key = itemKey(item, dungeon?.id);
      const exists = current.wishlist.some((entry) => entry.key === key);
      return { ...current, wishlist: exists ? current.wishlist.filter((entry) => entry.key !== key) : [...current.wishlist, itemSummary(item, dungeon)] };
    });
  }

  function equipItem(item, dungeon) {
    if (!item.slot) return;
    setState((current) => {
      const equipped = { ...current.equipped };
      const summary = itemSummary(item, dungeon);
      if (equipped[item.slot]?.key === summary.key) delete equipped[item.slot];
      else equipped[item.slot] = summary;
      return { ...current, equipped };
    });
  }

  function addDungeonToRoute(dungeonId, openPlanner = false) {
    setState((current) => ({ ...current, route: [...current.route, { uid: uid(), dungeonId, bridgeXp: 0, bonusXp: 0, runs: 1, combatXpPerRun: 0, restedPercent: 0 }] }));
    if (openPlanner) window.location.assign(appHref(PAGE_PATHS.planner));
  }

  function importCompanion(value) {
    const payload = parseCompanionString(value);
    let result = "";
    setState((current) => {
      const questStates = { ...current.questStates };
      for (const id of payload.completedQuestIds || []) questStates[String(id)] = "complete";
      for (const id of payload.activeQuestIds || []) if (!questStates[String(id)]) questStates[String(id)] = "have";
      if (payload.type === "plan") {
        const route = payload.route.filter((id) => dungeonsById.has(id)).map((dungeonId, index) => ({ uid: `imported-${Date.now()}-${index}`, dungeonId, bridgeXp: 0, bonusXp: 0, runs: 1, combatXpPerRun: 0, restedPercent: 0 }));
        const wishlist = [...current.wishlist];
        for (const id of payload.wishlistItemIds) {
          const record = itemRecordLookup.get(String(id));
          if (record && !wishlist.some((entry) => entry.key === itemKey(record.item, record.dungeon.id))) wishlist.push(itemSummary(record.item, record.dungeon));
        }
        result = `Imported ${route.length} route stops, ${payload.completedQuestIds.length} completed quests, and ${payload.wishlistItemIds.length} wishlist IDs.`;
        return {
          ...current,
          level: payload.level || current.level,
          xp: payload.xp ?? current.xp,
          faction: ["horde", "alliance"].includes(payload.faction) ? payload.faction : current.faction,
          characterClass: CLASSES.includes(payload.characterClass) ? payload.characterClass : current.characterClass,
          spec: payload.spec || current.spec,
          route: route.length ? route : current.route,
          wishlist,
          questStates,
        };
      }
      const equipped = { ...current.equipped };
      let matchedGear = 0;
      for (const entry of payload.gear) {
        const record = itemRecordLookup.get(String(entry.itemId));
        if (record) {
          const summary = itemSummary(record.item, record.dungeon);
          equipped[summary.slot || entry.slot] = summary;
          matchedGear += 1;
        } else {
          equipped[entry.slot] = { id: entry.itemId, name: `Item ${entry.itemId}`, slot: entry.slot, key: `addon:${entry.itemId}`, source: "companion-addon" };
        }
      }
      const characterClass = CLASSES.includes(payload.characterClass) ? payload.characterClass : current.characterClass;
      result = payload.type === "telemetry"
        ? `Imported ${payload.name || "character"}: ${payload.runs.length} runs, ${payload.group.length} party members, ${payload.activeQuestIds.length} active quests, and ${matchedGear}/${payload.gear.length} recognized gear items.`
        : `Imported ${payload.name || "character"}: ${payload.activeQuestIds.length} active quests, ${payload.completedQuestIds.length} completed dungeon quests, and ${matchedGear}/${payload.gear.length} recognized gear items.`;
      return {
        ...current,
        level: payload.level || current.level,
        xp: payload.xp ?? current.xp,
        faction: ["horde", "alliance"].includes(payload.faction) ? payload.faction : current.faction,
        characterClass,
        spec: (CLASS_SPECS[characterClass] || []).some((entry) => entry.id === payload.spec) ? payload.spec : current.characterClass === characterClass ? current.spec : defaultSpec(characterClass),
        questStates,
        equipped,
        characterMeta: {
          name: payload.name,
          realm: payload.realm,
          bindLocation: payload.bindLocation,
          flightPaths: payload.flightPaths,
          professions: payload.professions,
          importedAt: new Date().toISOString(),
        },
        telemetry: payload.type === "telemetry" ? {
          addonVersion: payload.addonVersion,
          dataVersion: payload.dataVersion,
          importedAt: new Date().toISOString(),
          exportedAt: payload.exportedAt,
          restedXp: payload.restedXp,
          money: payload.money,
          freeBagSlots: payload.freeBagSlots,
          durability: payload.durability,
          hearthReadyAt: payload.hearthReadyAt,
          zone: payload.zone,
          subzone: payload.subzone,
          runs: payload.runs,
          currentRun: payload.currentRun,
          group: payload.group,
          peers: payload.peers,
          readiness: payload.readiness,
        } : current.telemetry,
      };
    });
    return result;
  }

  const gear = {
    level: state.level,
    xp: state.xp,
    characterClass: state.characterClass,
    spec: state.spec,
    wishlist: state.wishlist,
    equipped: state.equipped,
    party: state.party,
    characterMeta: state.characterMeta,
    telemetry: state.telemetry,
    lootPreferences: state.lootPreferences,
    updateLootPreferences: (values) => setState((current) => ({ ...current, lootPreferences: { ...current.lootPreferences, ...values } })),
    isWishlisted: (item, dungeon) => state.wishlist.some((entry) => entry.key === itemKey(item, dungeon?.id)),
    toggleWishlist,
    equipItem,
    clearEquipped: (slot) => setState((current) => { const equipped = { ...current.equipped }; delete equipped[slot]; return { ...current, equipped }; }),
    addPartyMember: () => setState((current) => current.party.length >= 4 ? current : ({ ...current, party: [...current.party, { id: uid(), name: `Member ${current.party.length + 2}`, characterClass: "warrior", spec: "arms" }] })),
    updatePartyMember: (id, values) => setState((current) => ({ ...current, party: current.party.map((member) => member.id === id ? { ...member, ...values } : member) })),
    removePartyMember: (id) => setState((current) => ({ ...current, party: current.party.filter((member) => member.id !== id) })),
    importCompanion,
    exportPlanner: () => serializePlannerString(state),
  };

  return (
    <GearContext.Provider value={gear}><div className="app-shell">
      <header className="topbar">
        <a className="brand" href={appHref("/")}><span className="brand-mark" aria-hidden="true">F</span><span><strong>Forever Route Planner</strong><small>Dungeon leveling companion</small></span></a>
        <nav aria-label="Primary navigation">{[["planner", "Route"], ["dungeons", "Dungeons"], ["quests", "Quests"], ["loot", "Loot"], ["profile", "My Gear"]].map(([id, label]) => <a key={id} className={(page.id === id || id === "dungeons" && page.id === "dungeon") ? "active" : ""} href={appHref(PAGE_PATHS[id])}>{label}{id === "profile" && state.wishlist.length > 0 && <span className="nav-count">{state.wishlist.length}</span>}</a>)}</nav>
        <div className="data-stamp"><span className="status-dot" />Beta snapshot · {new Date(snapshot.fetchedAt).toLocaleDateString()}</div>
      </header>

      <Breadcrumbs page={page} dungeon={page.id === "dungeon" ? dungeonsById.get(page.dungeonId) : null} />
      {page.id === "planner" && <Planner state={state} setState={setState} dungeons={dungeons} dungeonsById={dungeonsById} onPin={setPinnedQuest} onNavigate={(id) => window.location.assign(appHref(PAGE_PATHS[id]))} />}
      {page.id === "dungeons" && <Dungeons dungeons={dungeons} faction={state.faction} />}
      {page.id === "dungeon" && dungeonsById.has(page.dungeonId) && <DungeonPage dungeon={dungeonsById.get(page.dungeonId)} faction={state.faction} characterClass={state.characterClass} characterSpec={state.spec} onPin={setPinnedQuest} onAddRoute={(id) => addDungeonToRoute(id, false)} onPlanNext={(id) => addDungeonToRoute(id, true)} />}
      {page.id === "quests" && <Quests dungeons={dungeons} faction={state.faction} onPin={setPinnedQuest} />}
      {page.id === "loot" && <Loot dungeons={dungeons} characterClass={state.characterClass} characterSpec={state.spec} faction={state.faction} />}
      {page.id === "profile" && <Profile dungeons={dungeons} />}
      {(page.id === "not-found" || page.id === "dungeon" && !dungeonsById.has(page.dungeonId)) && <main className="not-found"><span>404</span><h1>Page not found</h1><p>This route or dungeon does not exist.</p><a href={appHref("/dungeons/")}>Browse dungeons</a></main>}

      <QuestTray selection={pinnedQuest} onClose={() => setPinnedQuest(null)} itemLookup={itemLookup} questLookup={questLookup} onSelect={setPinnedQuest} />

      <footer className="site-footer">
        <div><strong>Coverage</strong><span>{dungeons.length} dungeons · {number(dungeons.reduce((sum, dungeon) => sum + dungeon.loot.length, 0))} loot entries · {number(dungeons.reduce((sum, dungeon) => sum + dungeon.quests.length, 0))} quest groups</span></div>
        <div className="source-links"><a href={assetUrl("addons/ForeverRouteCompanion.zip")} download>Download WFRP addon</a>{snapshot.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>{source.name}</a>)}<a href="https://wowf.io/en/zones" target="_blank" rel="noreferrer">Forever world map</a><a href="https://wago.tools/api/builds" target="_blank" rel="noreferrer">Forever client maps</a><a href={snapshot.xpPolicy.sourceUrl} target="_blank" rel="noreferrer">Forever XP policy</a><a href="https://warcraft.wiki.gg/wiki/Experience_to_level" target="_blank" rel="noreferrer">Level curve reference</a></div>
        <p>Unofficial fan-made planning tool. Forever beta data changes quickly; partial values are labeled and excluded from projections. Class-fit icons are transparent rules-based suggestions, not source claims.</p>
      </footer>
    </div></GearContext.Provider>
  );
}
