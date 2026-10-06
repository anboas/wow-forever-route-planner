import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import snapshot from "./data/wow-forever.json";
import dungeonMaps from "./data/dungeon-maps.json";
import { formatCharacter, progressPercent, XP_TO_NEXT } from "./xp.js";
import { buildOptimizedRoute, matchesFaction, optimizeRouteOrder, questMinimumLevel, simulateRoute } from "./planner.js";
import { bestClasses, classCanUseItem, classFitScore, classIconUrl, CLASS_OPTIONS, compatibleClasses, itemIconUrl, itemSourceUrl } from "./loot.js";

const CLASSES = CLASS_OPTIONS.map(({ id }) => id);
const DEFAULT_ROUTE = ["ragefire-chasm", "ruins-of-lordaeron", "shadowfang-keep"].map((dungeonId, index) => ({
  uid: `starter-${index}`,
  dungeonId,
  bridgeXp: 0,
  bonusXp: 0,
}));

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem("forever-route-planner:v1"));
    if (saved && Array.isArray(saved.route)) return saved;
  } catch {
    // Ignore damaged local state and return the useful starter route.
  }
  return {
    level: 13,
    xp: 0,
    faction: "horde",
    characterClass: "warrior",
    assumePrerequisites: true,
    route: DEFAULT_ROUTE,
  };
}

function uid() {
  return globalThis.crypto?.randomUUID?.() ?? `route-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function number(value) {
  return new Intl.NumberFormat("en-US").format(Math.round(value || 0));
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

function openItemSource(item) {
  window.open(itemSourceUrl(item), "_blank", "noopener,noreferrer");
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
        onClick={() => {
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
      {Number.isFinite(item.dropChance) && <div className="tooltip-drop">Drop chance: {item.dropChance}%</div>}
      <div className="tooltip-class-fit"><span>Suggested fit</span><ClassChips item={item} bestOnly /></div>
      {dungeon && <div className="tooltip-source"><span>Dropped in</span><strong>{dungeon.name}</strong>{item.boss && <small>{item.boss}</small>}</div>}
      {item.uncertain && <div className="tooltip-warning">Partial beta record. Some properties may change.</div>}
      <div className="tooltip-wowhead">Click to open {Number(item.id) < 200000 ? "the item" : "a name search"} on Wowhead ↗</div>
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
        <span><b>Experience:</b> {Number.isFinite(quest.xp) ? `${number(quest.xp)} XP` : "Unverified"}</span>
        {quest.rep && <span><b>Reputation:</b> {quest.rep}</span>}
        {!!quest.chain?.length && <span><b>Prerequisites:</b> {quest.chain.join(", ")}</span>}
      </div>
      {!!rewards.length && <div className="tooltip-rewards"><span>Rewards</span>{rewards.map((reward, index) => <strong className={qualityClass(reward)} key={`${reward.id || reward.name}-${index}`}>{reward.name}</strong>)}</div>}
      {quest.rewardNote && <div className="tooltip-warning">{quest.rewardNote}</div>}
      <div className="tooltip-source"><span>Dungeon</span><strong>{dungeon.name}</strong><small>{quest.dataStatus === "verified" ? "Verified Forever quest record" : "Partial beta coverage"}</small></div>
    </div>
  );
}

function QuestTray({ selection, onClose, itemLookup }) {
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
  return createPortal(
    <div className="tray-layer">
      <button className="tray-backdrop" onClick={onClose} aria-label="Close quest tray" />
      <aside className="quest-tray" aria-label={`Pinned quest: ${quest.name}`}>
        <header><div><div className="section-kicker">Pinned quest</div><h2>{quest.name}</h2></div><button className="tray-close" onClick={onClose} aria-label="Close quest tray">×</button></header>
        <div className="tray-meta"><span>{dungeon.name}</span><span>Level {questMinimumLevel(quest, dungeon)}+</span>{Number.isFinite(quest.xp) && <strong>{number(quest.xp)} XP</strong>}</div>
        {gate && <div className={`tooltip-gate gate-text-${gate.status}`}>{GATE_COPY[gate.status]}</div>}
        {quest.objective && <p className="tray-objective">{quest.objective}</p>}
        {quest.note && <p className="tray-note">{quest.note}</p>}
        <dl className="tray-facts">
          <div><dt>Faction</dt><dd>{humanize(quest.faction || "Both")}</dd></div>
          <div><dt>Starts</dt><dd>{actorList(quest.from)}</dd></div>
          <div><dt>Ends</dt><dd>{actorList(quest.to)}</dd></div>
          {quest.rep && <div><dt>Reputation</dt><dd>{quest.rep}</dd></div>}
        </dl>
        {!!quest.chain?.length && <section className="tray-chain"><h3>Prerequisites</h3>{quest.chain.map((entry, index) => <span key={`${entry.id || entry.name}-${index}`}>{entry.name || entry}</span>)}</section>}
        <section className="tray-rewards">
          <h3>Rewards <span>{rewards.length}</span></h3>
          {rewards.length ? rewards.map((item, index) => (
            <TooltipTrigger key={`${item.id || item.name}-${index}`} className="reward-card" label={`Reward item ${item.name}`} onActivate={() => openItemSource(item)} content={<ItemTooltip item={item} dungeon={dungeon} />}>
              <ItemIcon item={item} />
              <div><strong className={qualityClass(item)}>{item.name}</strong><small>{item.slot || item.type || "Reward item"}</small><ClassChips item={item} bestOnly /></div>
              <span>↗</span>
            </TooltipTrigger>
          )) : <p className="empty-copy">No item rewards are listed in the current source record.</p>}
        </section>
        <footer><a href={dungeon.questSourceUrl} target="_blank" rel="noreferrer">Open source record ↗</a><span>{quest.dataStatus === "verified" ? "Verified Forever details" : "Rewards-only coverage"}</span></footer>
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

function QuestRow({ entry, dungeon, onPin }) {
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
      </TooltipTrigger>
    </li>
  );
}

function RouteStep({ step, index, total, onMove, onRemove, onBridge, onBonus, onPin }) {
  const ready = step.quests.filter((entry) => entry.gate.status === "ready").length;
  const locked = step.quests.filter((entry) => !["ready", "unverified", "xp-unverified", "already-done"].includes(entry.gate.status)).length;
  const belowBand = step.before.level < step.dungeon.level[0];
  return (
    <article className="route-step">
      <div className="route-rail"><Rune index={index + 1} /><span /></div>
      <div className="route-card">
        <header className="route-card-header">
          <div>
            <div className="eyebrow">Stop {index + 1} · Levels {step.dungeon.level.join("–")}</div>
            <h3>{step.dungeon.name}</h3>
            <p>{step.dungeon.location || "Location pending source verification"}</p>
          </div>
          <div className="route-actions" aria-label={`Move or remove ${step.dungeon.name}`}>
            <button onClick={() => onMove(index, -1)} disabled={index === 0} aria-label="Move earlier">↑</button>
            <button onClick={() => onMove(index, 1)} disabled={index === total - 1} aria-label="Move later">↓</button>
            <button className="danger" onClick={() => onRemove(index)} aria-label="Remove stop">×</button>
          </div>
        </header>
        <div className="step-metrics">
          <div><span>Arrive</span><strong>{formatCharacter(step.before)}</strong></div>
          <div><span>External XP</span><strong>{number(step.bridgeXp)}</strong></div>
          <div><span>Quest XP</span><strong>{number(step.questXp)}</strong></div>
          <div><span>Leave</span><strong>{formatCharacter(step.after)}</strong></div>
        </div>
        {belowBand && <div className="callout warning">You arrive below the recommended dungeon band. Eligible quests are still calculated individually.</div>}
        {step.bridgeShortfall > 0 && <div className="callout bridge-callout"><strong>{number(step.bridgeShortfall)} XP needed before this stop</strong><span>Reach level {step.completionLevel} to unlock every verified {step.dungeon.name} quest available to this faction and class.</span></div>}
        <div className="quest-summary">
          <strong>{ready} ready</strong><span>{locked} blocked</span><span>{step.quests.length} faction-valid</span><span>{Math.round(step.completionRate * 100)}% complete</span>
        </div>
        <ul className="quest-list">{step.quests.map((entry) => <QuestRow key={`${entry.quest.id}-${entry.quest.name}`} entry={entry} dungeon={step.dungeon} onPin={onPin} />)}</ul>
        <label className="bonus-input bridge-input">
          <span>Planned XP before dungeon <small>Optimizer fills the exact quest-completeness gap.</small></span>
          <input type="number" min="0" step="100" value={step.bridgeXp} onChange={(event) => onBridge(index, event.target.value)} />
        </label>
        <label className="bonus-input">
          <span>Manual combat / travel XP</span>
          <input type="number" min="0" step="100" value={step.bonusXp} onChange={(event) => onBonus(index, event.target.value)} />
        </label>
      </div>
    </article>
  );
}

function Planner({ state, setState, dungeons, dungeonsById, onPin }) {
  const simulation = useMemo(() => simulateRoute({ dungeonsById, ...state }), [dungeonsById, state]);
  const [addId, setAddId] = useState(dungeons[0].id);
  const [optimization, setOptimization] = useState(null);
  const totalXp = simulation.steps.reduce((sum, step) => sum + step.questXp + step.bonusXp, 0);
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

  function optimizeCurrent() {
    const result = optimizeRouteOrder({ dungeonsById, ...state });
    patch({ route: result.route });
    setOptimization(`Route reordered for full verified-quest completion with ${number(result.totalBridgeXp)} planned external XP.`);
  }

  function buildBest() {
    const result = buildOptimizedRoute({ dungeonsById, ...state, count: 6 });
    patch({ route: result.route });
    setOptimization(`Built a six-stop faction-valid route with ${number(result.totalQuestXp)} verified quest XP and ${number(result.totalBridgeXp)} planned bridge XP.`);
  }

  return (
    <main className="planner-layout">
      <aside className="character-panel panel">
        <div className="section-kicker">Character</div>
        <h2>Starting point</h2>
        <div className="field-grid">
          <label><span>Faction</span><select value={state.faction} onChange={(event) => patch({ faction: event.target.value })}><option value="horde">Horde</option><option value="alliance">Alliance</option></select></label>
          <label><span>Class</span><select value={state.characterClass} onChange={(event) => patch({ characterClass: event.target.value })}>{CLASSES.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
          <label><span>Level</span><input type="number" min="1" max="60" value={state.level} onChange={(event) => patch({ level: event.target.value })} /></label>
          <label><span>Current XP</span><input type="number" min="0" max={XP_TO_NEXT[state.level] || 0} value={state.xp} onChange={(event) => patch({ xp: event.target.value })} /></label>
        </div>
        <ProgressBar character={simulation.start} label="Current progress" />
        <label className="toggle-row">
          <input type="checkbox" checked={state.assumePrerequisites} onChange={(event) => patch({ assumePrerequisites: event.target.checked })} />
          <span><strong>Pre-quests completed</strong><small>Count chained dungeon quests as ready when level and faction match.</small></span>
        </label>
        <div className="curve-note">
          <strong>XP model</strong>
          <p>Verified quest XP on the Classic 1–60 level curve. Add combat XP manually per stop until a reliable Forever run dataset exists.</p>
        </div>
      </aside>

      <section className="route-workspace">
        <header className="workspace-header">
          <div><div className="section-kicker">Dungeon route</div><h2>Quest XP projection</h2><p>Quests are gated at the level you arrive, then applied before the next stop.</p></div>
          <div className="workspace-actions"><button onClick={optimizeCurrent} disabled={!state.route.length}>Optimize route</button><button onClick={buildBest}>Build best route</button><button className="secondary" onClick={() => patch({ route: DEFAULT_ROUTE })}>Reset</button></div>
        </header>

        {optimization && <div className="optimization-note"><strong>Optimizer</strong><span>{optimization}</span><button onClick={() => setOptimization(null)} aria-label="Dismiss optimizer note">×</button></div>}

        <div className="summary-grid">
          <div className="summary-card"><span>Projected finish</span><strong>{formatCharacter(simulation.finish)}</strong></div>
          <div className="summary-card"><span>Route XP</span><strong>{number(totalXp)}</strong></div>
          <div className="summary-card"><span>Planned external XP</span><strong>{number(externalXp)}</strong></div>
          <div className="summary-card"><span>Ready quests</span><strong>{readyQuests}</strong></div>
          <div className="summary-card"><span>Level gain</span><strong>+{Math.max(0, simulation.finish.level - simulation.start.level)}</strong></div>
        </div>
        <ProgressBar character={simulation.finish} label="Projected finish" />

        <div className="route-list">
          {simulation.steps.length ? simulation.steps.map((step, index) => (
            <RouteStep
              key={state.route[index].uid}
              step={step}
              index={index}
              total={simulation.steps.length}
              onMove={move}
              onRemove={(target) => updateRoute((current) => current.filter((_, itemIndex) => itemIndex !== target))}
              onBridge={(target, value) => updateRoute((current) => current.map((entry, itemIndex) => itemIndex === target ? { ...entry, bridgeXp: value } : entry))}
              onBonus={(target, value) => updateRoute((current) => current.map((entry, itemIndex) => itemIndex === target ? { ...entry, bonusXp: value } : entry))}
              onPin={onPin}
            />
          )) : <div className="empty-state"><strong>No dungeon stops yet.</strong><p>Add one below to start projecting.</p></div>}
        </div>

        <div className="route-adder panel">
          <label><span>Add a dungeon</span><select value={addId} onChange={(event) => setAddId(event.target.value)}>{dungeons.map((dungeon) => <option value={dungeon.id} key={dungeon.id}>{dungeon.level[0]}–{dungeon.level[1]} · {dungeon.name}</option>)}</select></label>
          <button onClick={() => updateRoute((current) => [...current, { uid: uid(), dungeonId: addId, bridgeXp: 0, bonusXp: 0 }])}>Add stop</button>
        </div>
      </section>
    </main>
  );
}

function QuestListEntry({ quest, dungeon, onPin }) {
  return (
    <li className="inspectable-entry">
      <TooltipTrigger className="simple-list-trigger" label={`Quest details for ${quest.name}`} onActivate={() => onPin({ quest, dungeon })} content={<QuestTooltip quest={quest} dungeon={dungeon} />}>
        <div><strong className="quest-link">{quest.name}</strong><span>{quest.faction || "Faction unknown"} · {Number.isFinite(quest.minLevel) ? `Lv ${quest.minLevel}+` : "Pickup level pending"}</span></div>
        <b>{Number.isFinite(quest.xp) ? `${number(quest.xp)} XP` : "XP ?"}</b>
      </TooltipTrigger>
    </li>
  );
}

function LootListEntry({ item, dungeon }) {
  return (
    <li className="inspectable-entry">
      <TooltipTrigger className="simple-list-trigger" label={`Item details for ${item.name}`} onActivate={() => openItemSource(item)} content={<ItemTooltip item={item} dungeon={dungeon} />}>
        <div className="mini-loot-name"><ItemIcon item={item} compact /><div><strong className={qualityClass(item)}>{item.name}</strong><span>{item.boss || item.type || "Source pending"}</span></div></div>
        <ClassChips item={item} bestOnly limit={3} />
        <b>{item.itemLevel ? `iLvl ${item.itemLevel}` : item.requiredLevel ? `Req ${item.requiredLevel}` : "—"}</b>
      </TooltipTrigger>
    </li>
  );
}

function DungeonDetail({ dungeon, faction, onPin, onClose }) {
  if (!dungeon) return null;
  const quests = dungeon.quests.filter((quest) => matchesFaction(quest.faction, faction));
  const verified = quests.filter((quest) => quest.dataStatus === "verified").length;
  const map = dungeonMaps[dungeon.id];
  return (
    <section className="detail-panel panel">
      <button className="detail-close" onClick={onClose} aria-label="Close dungeon details">×</button>
      <div className="section-kicker">{dungeon.kind === "new" ? "Forever dungeon" : "Classic dungeon"}</div>
      <h2>{dungeon.name}</h2>
      <p className="detail-lead">Levels {dungeon.level.join("–")} · {dungeon.location || "Location not yet verified in the detailed source"}</p>
      <div className="summary-grid compact">
        <div className="summary-card"><span>Loot</span><strong>{dungeon.loot.length}</strong></div>
        <div className="summary-card"><span>{humanize(faction)} quests</span><strong>{quests.length}</strong></div>
        <div className="summary-card"><span>Verified XP</span><strong>{number(quests.reduce((sum, quest) => sum + (quest.xp || 0), 0))}</strong></div>
        <div className="summary-card"><span>Detailed quests</span><strong>{verified}</strong></div>
      </div>
      <div className="dungeon-map-panel">
        {map ? <img src={assetUrl(map.src)} alt={`${dungeon.name} instance map`} /> : <div className="map-pending"><span>⌁</span><strong>Forever map pending</strong><small>No verified public instance map is available yet.</small></div>}
        <div><span>Instance map</span><strong>{dungeon.name}</strong>{map ? <a href={map.sourceUrl} target="_blank" rel="noreferrer">AtlasLootClassic · {map.license} ↗</a> : <a href={dungeon.lootSourceUrl} target="_blank" rel="noreferrer">Watch source coverage ↗</a>}</div>
      </div>
      <p className="inspect-hint">Hover or focus for the full in-game-style card. Click quests to pin them; click items to open Wowhead.</p>
      <div className="detail-columns">
        <div><h3>{humanize(faction)} quests <span>{quests.length}</span></h3><ul className="simple-list">{quests.map((quest) => <QuestListEntry key={`${quest.id}-${quest.name}`} quest={quest} dungeon={dungeon} onPin={onPin} />)}</ul></div>
        <div><h3>All loot <span>{dungeon.loot.length}</span></h3><ul className="simple-list loot-detail-list">{dungeon.loot.map((item, index) => <LootListEntry key={`${item.id || item.name}-${index}`} item={item} dungeon={dungeon} />)}</ul></div>
      </div>
      <div className="boss-section"><h3>Bosses / sources</h3><ul className="boss-grid">{dungeon.bosses.length ? dungeon.bosses.map((boss) => <li key={boss.name}><div><strong>{boss.name}</strong><span>{boss.level ? `Level ${boss.level}` : "Level pending"}</span></div><b>{boss.lootCount} items</b></li>) : <li><span>No verified boss breakdown yet.</span></li>}</ul></div>
    </section>
  );
}

function Dungeons({ dungeons, faction, onPin, selected, setSelected }) {
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
      <DungeonDetail dungeon={selected} faction={faction} onPin={onPin} onClose={() => setSelected(null)} />
      <div className="dungeon-grid">{filtered.map((dungeon) => { const questCount = dungeon.quests.filter((quest) => matchesFaction(quest.faction, faction)).length; return <button className="dungeon-card" key={dungeon.id} onClick={() => setSelected(dungeon)}><span className="dungeon-level">{dungeon.level[0]}–{dungeon.level[1]}</span>{dungeon.kind === "new" && <span className="new-badge">NEW</span>}<h2>{dungeon.name}</h2><p>{dungeon.location || "Location details pending"}</p><div><span>{questCount} {faction} quests</span><span>{dungeon.loot.length} loot</span><span>{dungeonMaps[dungeon.id] ? "Map" : "Map pending"}</span></div><small>{dungeon.dataCoverage === "detailed" ? "Detailed beta data" : "Loot catalog coverage"}</small></button>; })}</div>
    </main>
  );
}

function Quests({ dungeons, faction, onPin }) {
  const [query, setQuery] = useState("");
  const [dungeonId, setDungeonId] = useState("all");
  const [coverage, setCoverage] = useState("all");
  const allQuests = useMemo(() => dungeons.flatMap((dungeon) => dungeon.quests.map((quest) => ({ quest, dungeon }))), [dungeons]);
  const filtered = allQuests.filter(({ quest, dungeon }) => {
    const haystack = `${quest.name} ${quest.objective || ""} ${quest.note || ""} ${dungeon.name}`.toLowerCase();
    const factionMatch = matchesFaction(quest.faction, faction);
    return haystack.includes(query.toLowerCase())
      && (dungeonId === "all" || dungeon.id === dungeonId)
      && factionMatch
      && (coverage === "all" || quest.dataStatus === coverage);
  });
  return (
    <main className="library-shell">
      <header className="library-header"><div><div className="section-kicker">Quest ledger</div><h1>{humanize(faction)} dungeon quests</h1><p>Opposing-faction quests are hidden everywhere.</p></div><div className="library-filters quest-filters"><input type="search" placeholder="Search quest, objective, or dungeon" value={query} onChange={(event) => setQuery(event.target.value)} /><select value={dungeonId} onChange={(event) => setDungeonId(event.target.value)}><option value="all">All dungeons</option>{dungeons.map((dungeon) => <option key={dungeon.id} value={dungeon.id}>{dungeon.name}</option>)}</select><select value={coverage} onChange={(event) => setCoverage(event.target.value)}><option value="all">All coverage</option><option value="verified">Verified details</option><option value="rewards-only">Rewards-only records</option></select></div></header>
      <div className="result-count">Showing all {number(filtered.length)} matching quests · hover, focus, or tap for full details</div>
      <div className="quest-table" role="table" aria-label="Dungeon quest results">
        <div className="quest-head" role="row"><span>Quest</span><span>Dungeon</span><span>Requirement</span><span>Experience</span></div>
        {filtered.map(({ quest, dungeon }, index) => (
          <TooltipTrigger key={`${dungeon.id}-${quest.id || quest.name}-${index}`} role="row" className="quest-archive-row" label={`Quest details for ${quest.name}`} onActivate={() => onPin({ quest, dungeon })} content={<QuestTooltip quest={quest} dungeon={dungeon} />}>
            <div className="archive-quest-name"><span className="quest-archive-mark" aria-hidden="true">!</span><div><strong>{quest.name}</strong><small>{quest.dataStatus === "verified" ? "Verified Forever record" : "Partial beta record"}</small></div></div>
            <div><strong>{dungeon.name}</strong><small>{quest.faction ? humanize(quest.faction) : "Faction pending"}</small></div>
            <div>Level {questMinimumLevel(quest, dungeon)}+</div>
            <div className="archive-xp">{Number.isFinite(quest.xp) ? `${number(quest.xp)} XP` : "XP unverified"}<small>Pin quest ↗</small></div>
          </TooltipTrigger>
        ))}
      </div>
    </main>
  );
}

function LootRow({ item, dungeon }) {
  return (
    <TooltipTrigger className="loot-row" role="row" label={`Item details for ${item.name}`} onActivate={() => openItemSource(item)} content={<ItemTooltip item={item} dungeon={dungeon} />}>
      <div className="loot-name"><ItemIcon item={item} /><div><strong className={qualityClass(item)}>{item.name}</strong><small>{item.type || "Type pending"}</small></div></div>
      <div><strong>{dungeon.name}</strong><small>{item.boss || "Source not yet discovered"}</small></div>
      <div>{item.slot || "—"}</div>
      <ClassChips item={item} bestOnly limit={4} />
      <div>{item.requiredLevel ? `Req ${item.requiredLevel}` : item.itemLevel ? `iLvl ${item.itemLevel}` : "—"}</div>
      <span className="external-mark">↗</span>
    </TooltipTrigger>
  );
}

function BossGroupedLoot({ entries }) {
  const dungeons = [...new Map(entries.map((entry) => [entry.dungeon.id, entry.dungeon])).values()];
  return (
    <div className="loot-groups">
      {dungeons.map((dungeon) => {
        const dungeonEntries = entries.filter((entry) => entry.dungeon.id === dungeon.id);
        const bosses = [...new Set(dungeonEntries.map(({ item }) => item.boss || "Other / quest rewards"))];
        return (
          <section className="loot-dungeon-group" key={dungeon.id}>
            <header><div><span>Levels {dungeon.level.join("–")}</span><h2>{dungeon.name}</h2></div><strong>{dungeonEntries.length} items</strong></header>
            <div className="boss-loot-grid">
              {bosses.map((boss) => {
                const items = dungeonEntries.filter(({ item }) => (item.boss || "Other / quest rewards") === boss);
                return <section className="boss-loot-group" key={boss}><h3>{boss}<span>{items.length}</span></h3><div className="boss-item-grid">{items.map(({ item }, index) => <TooltipTrigger key={`${item.id || item.name}-${index}`} className="loot-card" label={`Item details for ${item.name}`} onActivate={() => openItemSource(item)} content={<ItemTooltip item={item} dungeon={dungeon} />}><ItemIcon item={item} compact /><div><strong className={qualityClass(item)}>{item.name}</strong><small>{item.slot || item.type || "Item"}</small><ClassChips item={item} bestOnly limit={3} /></div><span>↗</span></TooltipTrigger>)}</div></section>;
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Loot({ dungeons, characterClass }) {
  const [query, setQuery] = useState("");
  const [dungeonId, setDungeonId] = useState("all");
  const [slot, setSlot] = useState("all");
  const [classFilter, setClassFilter] = useState(characterClass || "all");
  const [sort, setSort] = useState("fit");
  const [viewMode, setViewMode] = useState("boss");
  const allLoot = useMemo(() => dungeons.flatMap((dungeon) => dungeon.loot.map((item) => ({ item, dungeon }))), [dungeons]);
  const slots = useMemo(() => [...new Set(allLoot.map(({ item }) => item.slot).filter(Boolean))].sort(), [allLoot]);
  useEffect(() => setClassFilter(characterClass || "all"), [characterClass]);
  const filtered = allLoot.filter(({ item, dungeon }) => {
    const haystack = `${item.name} ${item.slot || ""} ${item.type || ""} ${item.boss || ""} ${dungeon.name}`.toLowerCase();
    return haystack.includes(query.toLowerCase())
      && (dungeonId === "all" || dungeon.id === dungeonId)
      && (slot === "all" || item.slot === slot)
      && (classFilter === "all" || classCanUseItem(item, classFilter));
  }).sort((a, b) => {
    if (sort === "fit" && classFilter !== "all") return classFitScore(b.item, classFilter) - classFitScore(a.item, classFilter) || (b.item.itemLevel || 0) - (a.item.itemLevel || 0);
    if (sort === "level") return (b.item.itemLevel || 0) - (a.item.itemLevel || 0);
    if (sort === "name") return a.item.name.localeCompare(b.item.name);
    return a.dungeon.level[0] - b.dungeon.level[0] || a.dungeon.name.localeCompare(b.dungeon.name);
  });
  return (
    <main className="library-shell">
      <header className="library-header loot-library-header"><div><div className="section-kicker">Loot workbench</div><h1>Dungeon loot</h1><p>{number(allLoot.length)} source-backed drops and rewards. Click any item for Wowhead.</p></div><div className="view-switch" aria-label="Loot view"><button className={viewMode === "boss" ? "active" : ""} onClick={() => setViewMode("boss")}>Dungeon → boss</button><button className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")}>All items</button></div></header>
      <section className="loot-control-deck panel">
        <div className="class-filter-strip"><button className={classFilter === "all" ? "active" : ""} onClick={() => setClassFilter("all")}><span>ALL</span><small>Every class</small></button>{CLASS_OPTIONS.map((entry) => <button key={entry.id} className={classFilter === entry.id ? "active" : ""} onClick={() => setClassFilter(entry.id)} style={{ "--class-color": entry.color }}><img src={classIconUrl(entry.id)} alt="" /><small>{entry.label}</small></button>)}</div>
        <div className="loot-filter-grid"><input type="search" placeholder="Search item, boss, slot, or dungeon" value={query} onChange={(event) => setQuery(event.target.value)} /><select value={dungeonId} onChange={(event) => setDungeonId(event.target.value)}><option value="all">All dungeons</option>{dungeons.map((dungeon) => <option key={dungeon.id} value={dungeon.id}>{dungeon.name}</option>)}</select><select value={slot} onChange={(event) => setSlot(event.target.value)}><option value="all">All slots</option>{slots.map((value) => <option key={value}>{value}</option>)}</select><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="fit">Best class fit</option><option value="dungeon">Dungeon level</option><option value="level">Highest item level</option><option value="name">Item name</option></select></div>
      </section>
      <div className="result-count">Showing all {number(filtered.length)} matching items · {classFilter === "all" ? "choose a class for wearability" : `${humanize(classFilter)}-usable gear`} · green-ring icons are rules-based suggestions</div>
      {viewMode === "boss" ? <BossGroupedLoot entries={filtered} /> : <div className="loot-table" role="table" aria-label="Dungeon loot results"><div className="loot-head" role="row"><span>Item</span><span>Dungeon / source</span><span>Slot</span><span>Best fit</span><span>Level</span><span /></div>{filtered.map(({ item, dungeon }, index) => <LootRow item={item} dungeon={dungeon} key={`${dungeon.id}-${item.id || item.name}-${index}`} />)}</div>}
    </main>
  );
}

export default function App() {
  const [view, setView] = useState("planner");
  const [state, setState] = useState(loadState);
  const [selectedDungeon, setSelectedDungeon] = useState(null);
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

  useEffect(() => {
    localStorage.setItem("forever-route-planner:v1", JSON.stringify(state));
  }, [state]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("planner")}><span className="brand-mark" aria-hidden="true">F</span><span><strong>Forever Route Planner</strong><small>Dungeon leveling companion</small></span></button>
        <nav aria-label="Primary navigation">{[["planner", "Route Planner"], ["dungeons", "Dungeons"], ["quests", "Quests"], ["loot", "Loot"]].map(([id, label]) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>{label}</button>)}</nav>
        <div className="data-stamp"><span className="status-dot" />Beta snapshot · {new Date(snapshot.fetchedAt).toLocaleDateString()}</div>
      </header>

      {view === "planner" && <Planner state={state} setState={setState} dungeons={dungeons} dungeonsById={dungeonsById} onPin={setPinnedQuest} />}
      {view === "dungeons" && <Dungeons dungeons={dungeons} faction={state.faction} onPin={setPinnedQuest} selected={selectedDungeon} setSelected={setSelectedDungeon} />}
      {view === "quests" && <Quests dungeons={dungeons} faction={state.faction} onPin={setPinnedQuest} />}
      {view === "loot" && <Loot dungeons={dungeons} characterClass={state.characterClass} />}

      <QuestTray selection={pinnedQuest} onClose={() => setPinnedQuest(null)} itemLookup={itemLookup} />

      <footer className="site-footer">
        <div><strong>Coverage</strong><span>{dungeons.length} dungeons · {number(dungeons.reduce((sum, dungeon) => sum + dungeon.loot.length, 0))} loot entries · {number(dungeons.reduce((sum, dungeon) => sum + dungeon.quests.length, 0))} quest groups</span></div>
        <div className="source-links">{snapshot.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>{source.name}</a>)}<a href="https://www.wowhead.com/classic" target="_blank" rel="noreferrer">Wowhead Classic</a><a href="https://github.com/Hoizame/AtlasLootClassic_Maps" target="_blank" rel="noreferrer">Atlas maps</a><a href="https://warcraft.wiki.gg/wiki/Experience_to_level" target="_blank" rel="noreferrer">XP curve reference</a></div>
        <p>Unofficial fan-made planning tool. Forever beta data changes quickly; partial values are labeled and excluded from projections. Class-fit icons are transparent rules-based suggestions, not source claims.</p>
      </footer>
    </div>
  );
}
