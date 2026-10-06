import { useEffect, useMemo, useState } from "react";
import snapshot from "./data/wow-forever.json";
import { formatCharacter, progressPercent, XP_TO_NEXT } from "./xp.js";
import { questMinimumLevel, simulateRoute } from "./planner.js";

const CLASSES = ["warrior", "paladin", "hunter", "rogue", "priest", "shaman", "mage", "warlock", "druid"];
const DEFAULT_ROUTE = ["ragefire-chasm", "ruins-of-lordaeron", "shadowfang-keep"].map((dungeonId, index) => ({
  uid: `starter-${index}`,
  dungeonId,
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

function QuestRow({ entry, dungeon }) {
  const { quest, gate } = entry;
  const chainCount = quest.chain?.length ?? 0;
  return (
    <li className={`quest-row gate-${gate.status}`}>
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
      <div className="quest-xp">{Number.isFinite(quest.xp) ? `${number(quest.xp)} XP` : "XP ?"}</div>
    </li>
  );
}

function RouteStep({ step, index, total, onMove, onRemove, onBonus }) {
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
          <div><span>Quest XP</span><strong>{number(step.questXp)}</strong></div>
          <div><span>Leave</span><strong>{formatCharacter(step.after)}</strong></div>
        </div>
        {belowBand && <div className="callout warning">You arrive below the recommended dungeon band. Eligible quests are still calculated individually.</div>}
        <div className="quest-summary">
          <strong>{ready} ready</strong><span>{locked} blocked</span><span>{step.quests.length} associated</span>
        </div>
        <ul className="quest-list">{step.quests.map((entry) => <QuestRow key={`${entry.quest.id}-${entry.quest.name}`} entry={entry} dungeon={step.dungeon} />)}</ul>
        <label className="bonus-input">
          <span>Manual combat / travel XP</span>
          <input type="number" min="0" step="100" value={step.bonusXp} onChange={(event) => onBonus(index, event.target.value)} />
        </label>
      </div>
    </article>
  );
}

function Planner({ state, setState, dungeons, dungeonsById }) {
  const simulation = useMemo(() => simulateRoute({ dungeonsById, ...state }), [dungeonsById, state]);
  const [addId, setAddId] = useState(dungeons[0].id);
  const totalXp = simulation.steps.reduce((sum, step) => sum + step.totalXp, 0);
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
          <button className="secondary" onClick={() => patch({ route: DEFAULT_ROUTE })}>Reset example</button>
        </header>

        <div className="summary-grid">
          <div className="summary-card"><span>Projected finish</span><strong>{formatCharacter(simulation.finish)}</strong></div>
          <div className="summary-card"><span>Route XP</span><strong>{number(totalXp)}</strong></div>
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
              onBonus={(target, value) => updateRoute((current) => current.map((entry, itemIndex) => itemIndex === target ? { ...entry, bonusXp: value } : entry))}
            />
          )) : <div className="empty-state"><strong>No dungeon stops yet.</strong><p>Add one below to start projecting.</p></div>}
        </div>

        <div className="route-adder panel">
          <label><span>Add a dungeon</span><select value={addId} onChange={(event) => setAddId(event.target.value)}>{dungeons.map((dungeon) => <option value={dungeon.id} key={dungeon.id}>{dungeon.level[0]}–{dungeon.level[1]} · {dungeon.name}</option>)}</select></label>
          <button onClick={() => updateRoute((current) => [...current, { uid: uid(), dungeonId: addId, bonusXp: 0 }])}>Add stop</button>
        </div>
      </section>
    </main>
  );
}

function DungeonDetail({ dungeon, onClose }) {
  if (!dungeon) return null;
  const verified = dungeon.quests.filter((quest) => quest.dataStatus === "verified").length;
  return (
    <section className="detail-panel panel">
      <button className="detail-close" onClick={onClose} aria-label="Close dungeon details">×</button>
      <div className="section-kicker">{dungeon.kind === "new" ? "Forever dungeon" : "Classic dungeon"}</div>
      <h2>{dungeon.name}</h2>
      <p className="detail-lead">Levels {dungeon.level.join("–")} · {dungeon.location || "Location not yet verified in the detailed source"}</p>
      <div className="summary-grid compact">
        <div className="summary-card"><span>Loot</span><strong>{dungeon.loot.length}</strong></div>
        <div className="summary-card"><span>Quests</span><strong>{dungeon.quests.length}</strong></div>
        <div className="summary-card"><span>Verified XP</span><strong>{number(dungeon.quests.reduce((sum, quest) => sum + (quest.xp || 0), 0))}</strong></div>
        <div className="summary-card"><span>Detailed quests</span><strong>{verified}</strong></div>
      </div>
      <div className="detail-columns">
        <div><h3>Associated quests</h3><ul className="simple-list">{dungeon.quests.map((quest) => <li key={`${quest.id}-${quest.name}`}><div><strong>{quest.name}</strong><span>{quest.faction || "Faction unknown"} · {Number.isFinite(quest.minLevel) ? `Lv ${quest.minLevel}+` : "Pickup level pending"}</span></div><b>{Number.isFinite(quest.xp) ? `${number(quest.xp)} XP` : "XP ?"}</b></li>)}</ul></div>
        <div><h3>Bosses / sources</h3><ul className="simple-list">{dungeon.bosses.length ? dungeon.bosses.map((boss) => <li key={boss.name}><div><strong>{boss.name}</strong><span>{boss.level ? `Level ${boss.level}` : "Level pending"}</span></div><b>{boss.lootCount} items</b></li>) : <li><span>No verified boss breakdown yet.</span></li>}</ul></div>
      </div>
    </section>
  );
}

function Dungeons({ dungeons, selected, setSelected }) {
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
      <DungeonDetail dungeon={selected} onClose={() => setSelected(null)} />
      <div className="dungeon-grid">{filtered.map((dungeon) => <button className="dungeon-card" key={dungeon.id} onClick={() => setSelected(dungeon)}><span className="dungeon-level">{dungeon.level[0]}–{dungeon.level[1]}</span>{dungeon.kind === "new" && <span className="new-badge">NEW</span>}<h2>{dungeon.name}</h2><p>{dungeon.location || "Location details pending"}</p><div><span>{dungeon.quests.length} quests</span><span>{dungeon.loot.length} loot</span></div><small>{dungeon.dataCoverage === "detailed" ? "Detailed beta data" : "Loot catalog coverage"}</small></button>)}</div>
    </main>
  );
}

function Loot({ dungeons }) {
  const [query, setQuery] = useState("");
  const [dungeonId, setDungeonId] = useState("all");
  const [slot, setSlot] = useState("all");
  const allLoot = useMemo(() => dungeons.flatMap((dungeon) => dungeon.loot.map((item) => ({ item, dungeon }))), [dungeons]);
  const slots = useMemo(() => [...new Set(allLoot.map(({ item }) => item.slot).filter(Boolean))].sort(), [allLoot]);
  const filtered = allLoot.filter(({ item, dungeon }) => {
    const haystack = `${item.name} ${item.slot || ""} ${item.type || ""} ${item.boss || ""} ${dungeon.name}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (dungeonId === "all" || dungeon.id === dungeonId) && (slot === "all" || item.slot === slot);
  });
  return (
    <main className="library-shell">
      <header className="library-header"><div><div className="section-kicker">Loot archive</div><h1>Dungeon loot</h1><p>{number(allLoot.length)} indexed drops and quest rewards.</p></div><div className="library-filters wide"><input type="search" placeholder="Search item, boss, slot, or dungeon" value={query} onChange={(event) => setQuery(event.target.value)} /><select value={dungeonId} onChange={(event) => setDungeonId(event.target.value)}><option value="all">All dungeons</option>{dungeons.map((dungeon) => <option key={dungeon.id} value={dungeon.id}>{dungeon.name}</option>)}</select><select value={slot} onChange={(event) => setSlot(event.target.value)}><option value="all">All slots</option>{slots.map((value) => <option key={value}>{value}</option>)}</select></div></header>
      <div className="result-count">Showing {Math.min(150, filtered.length)} of {number(filtered.length)} matching items</div>
      <div className="loot-table" role="table" aria-label="Dungeon loot results">
        <div className="loot-head" role="row"><span>Item</span><span>Dungeon / source</span><span>Slot</span><span>Level</span></div>
        {filtered.slice(0, 150).map(({ item, dungeon }, index) => <div className="loot-row" role="row" key={`${dungeon.id}-${item.id || item.name}-${index}`}><div className="loot-name"><span className={`loot-icon ${qualityClass(item)}`}>{item.name.slice(0, 1)}</span><div><strong className={qualityClass(item)}>{item.name}</strong><small>{item.type || "Type pending"}</small></div></div><div><strong>{dungeon.name}</strong><small>{item.boss || "Source not yet discovered"}</small></div><div>{item.slot || "—"}</div><div>{item.requiredLevel ? `Req ${item.requiredLevel}` : item.itemLevel ? `iLvl ${item.itemLevel}` : "—"}</div></div>)}
      </div>
    </main>
  );
}

export default function App() {
  const [view, setView] = useState("planner");
  const [state, setState] = useState(loadState);
  const [selectedDungeon, setSelectedDungeon] = useState(null);
  const dungeons = snapshot.dungeons;
  const dungeonsById = useMemo(() => new Map(dungeons.map((dungeon) => [dungeon.id, dungeon])), [dungeons]);

  useEffect(() => {
    localStorage.setItem("forever-route-planner:v1", JSON.stringify(state));
  }, [state]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("planner")}><span className="brand-mark" aria-hidden="true">F</span><span><strong>Forever Route Planner</strong><small>Dungeon leveling companion</small></span></button>
        <nav aria-label="Primary navigation">{[["planner", "Route Planner"], ["dungeons", "Dungeons"], ["loot", "Loot"]].map(([id, label]) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>{label}</button>)}</nav>
        <div className="data-stamp"><span className="status-dot" />Beta snapshot · {new Date(snapshot.fetchedAt).toLocaleDateString()}</div>
      </header>

      {view === "planner" && <Planner state={state} setState={setState} dungeons={dungeons} dungeonsById={dungeonsById} />}
      {view === "dungeons" && <Dungeons dungeons={dungeons} selected={selectedDungeon} setSelected={setSelectedDungeon} />}
      {view === "loot" && <Loot dungeons={dungeons} />}

      <footer className="site-footer">
        <div><strong>Coverage</strong><span>{dungeons.length} dungeons · {number(dungeons.reduce((sum, dungeon) => sum + dungeon.loot.length, 0))} loot entries · {number(dungeons.reduce((sum, dungeon) => sum + dungeon.quests.length, 0))} quest groups</span></div>
        <div className="source-links">{snapshot.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>{source.name}</a>)}<a href="https://warcraft.wiki.gg/wiki/Experience_to_level" target="_blank" rel="noreferrer">XP curve reference</a></div>
        <p>Unofficial fan-made planning tool. Forever beta data changes quickly; partial or unverified values are labeled and excluded from projections.</p>
      </footer>
    </div>
  );
}
