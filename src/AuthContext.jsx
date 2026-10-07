import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { authApi } from "./auth-api.js";

const AuthContext = createContext(null);
const LEGACY_KEY = "forever-route-planner:v1";

export function useAuth() {
  return useContext(AuthContext);
}

function AccountGate({ mode, busy, error, onSubmit }) {
  const setup = mode === "setup";
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = setup && confirm && password !== confirm;
  return <main className="account-gate"><section className="account-card">
    <div className="account-brand"><span>F</span><div><b>Forever Intelligence</b><small>Character · leveling · gear · group telemetry</small></div></div>
    <p className="section-kicker">Private intelligence workspace</p>
    <h1>{setup ? "Create the owner account" : "Welcome back"}</h1>
    <p>{setup ? "The first account permanently owns this workspace and manages access for your group." : "Sign in to open your characters, routes, gear, and run history."}</p>
    <form onSubmit={(event) => { event.preventDefault(); if (!mismatch) onSubmit({ email, displayName, password }); }}>
      {setup && <label><span>Display name</span><input required minLength="2" autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>}
      <label><span>Email</span><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label><span>Password</span><input required minLength="12" type="password" autoComplete={setup ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      {setup && <label><span>Confirm password</span><input required minLength="12" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label>}
      {mismatch && <p className="account-error">Passwords do not match.</p>}
      {error && <p className="account-error" role="alert">{error}</p>}
      <button type="submit" disabled={busy || mismatch}>{busy ? "Working…" : setup ? "Create owner account" : "Sign in"}</button>
    </form>
    <small className="account-privacy">Passwords are derived in this browser. Plaintext passwords are never transmitted or stored.</small>
  </section></main>;
}

function PasswordGate({ user, busy, error, onSubmit }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  return <main className="account-gate"><section className="account-card">
    <p className="section-kicker">Security checkpoint</p><h1>Choose your permanent password</h1>
    <p>{user.displayName}, your temporary password must be replaced before character data can be opened.</p>
    <form onSubmit={(event) => { event.preventDefault(); if (newPassword === confirm) onSubmit({ currentPassword, newPassword }); }}>
      <label><span>Temporary password</span><input required minLength="12" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
      <label><span>New password</span><input required minLength="12" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
      <label><span>Confirm password</span><input required minLength="12" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label>
      {confirm && newPassword !== confirm && <p className="account-error">Passwords do not match.</p>}{error && <p className="account-error">{error}</p>}
      <button disabled={busy || newPassword !== confirm}>Replace temporary password</button>
    </form>
  </section></main>;
}

export function AuthProvider({ children }) {
  const [status, setStatus] = useState({ loading: true, user: null, claimed: true, local: false });
  const [characters, setCharacters] = useState([]);
  const [partyPresence, setPartyPresence] = useState([]);
  const [provisioningCharacter, setProvisioningCharacter] = useState(false);
  const [activeCharacterId, setActiveCharacterId] = useState(() => localStorage.getItem("forever-intelligence:active-character") || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const migrationAttempted = useRef(false);

  async function refresh() {
    setError("");
    try {
      const next = await authApi.status();
      setStatus({ loading: false, local: false, ...next });
      if (next.user && !next.user.mustChangePassword) {
        const [result, party] = await Promise.all([authApi.listCharacters(), authApi.listParty()]);
        setCharacters(result.characters || []); setPartyPresence(party.party || []);
      } else setCharacters([]);
    } catch (requestError) {
      const localHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
      if (requestError.unavailable && localHost) setStatus({ loading: false, local: true, claimed: true, user: { id: "local", displayName: "Local development", roleId: "super_user", canManageUsers: true, canWrite: true } });
      else { setStatus((current) => ({ ...current, loading: false })); setError(requestError.message); }
    }
  }

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (status.loading || status.local || !status.user || status.user.mustChangePassword || migrationAttempted.current) return;
    migrationAttempted.current = true;
    if (characters.length) {
      if (!characters.some((entry) => entry.id === activeCharacterId)) setActiveCharacterId(characters[0].id);
      return;
    }
    let legacy = null;
    try { legacy = JSON.parse(localStorage.getItem(LEGACY_KEY)); } catch { /* damaged legacy state stays local */ }
    const meta = legacy?.characterMeta || {};
    setProvisioningCharacter(true);
    authApi.createCharacter({
      name: meta.name || "New character",
      realm: meta.realm || "WoW Forever",
      characterClass: legacy?.characterClass || "warrior",
      spec: legacy?.spec || "arms",
      faction: legacy?.faction || "horde",
      level: legacy?.level || 1,
      state: legacy || null,
      source: legacy ? "legacy-browser-migration" : "manual",
    }).then((result) => {
      setCharacters([result.character]); setActiveCharacterId(result.character.id);
      localStorage.setItem("forever-intelligence:migrated", new Date().toISOString());
    }).catch((requestError) => setError(requestError.message)).finally(() => setProvisioningCharacter(false));
  }, [status, characters, activeCharacterId]);

  useEffect(() => { if (activeCharacterId) localStorage.setItem("forever-intelligence:active-character", activeCharacterId); }, [activeCharacterId]);

  async function submitCredentials(values) {
    setBusy(true); setError("");
    try {
      if (status.claimed === false) await authApi.setup(values); else await authApi.login(values);
      await refresh();
    } catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  }

  async function changePassword(values) {
    setBusy(true); setError("");
    try { await authApi.changePassword({ email: status.user.email, ...values }); await refresh(); }
    catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  }

  const value = useMemo(() => ({
    ...status,
    characters,
    partyPresence,
    activeCharacterId,
    activeCharacter: characters.find((entry) => entry.id === activeCharacterId) || characters[0] || null,
    setActiveCharacterId,
    async reloadCharacters(preferredId = "") { const result = await authApi.listCharacters(); setCharacters(result.characters || []); if (preferredId) setActiveCharacterId(preferredId); return result.characters || []; },
    async refreshParty() { const result = await authApi.listParty(); setPartyPresence(result.party || []); return result.party || []; },
    async createCharacter(values) { const result = await authApi.createCharacter(values); setCharacters((current) => [...current, result.character]); setActiveCharacterId(result.character.id); return result.character; },
    async updateCharacter(id, values) { const result = await authApi.updateCharacter(id, values); setCharacters((current) => current.map((entry) => entry.id === id ? result.character : entry)); return result.character; },
    async deleteCharacter(id) { await authApi.deleteCharacter(id); const next = characters.filter((entry) => entry.id !== id); setCharacters(next); setActiveCharacterId(next[0]?.id || ""); },
    async saveCharacterState(state, revision) { if (status.local || !activeCharacterId || !status.user?.canWrite) return null; const result = await authApi.saveCharacterState(activeCharacterId, state, revision); setCharacters((current) => current.map((entry) => entry.id === activeCharacterId ? result.character : entry)); return result.character; },
    async logout() { await authApi.logout(); setCharacters([]); setActiveCharacterId(""); await refresh(); },
    refresh,
  }), [status, characters, activeCharacterId]);

  if (status.loading) return <main className="account-gate"><section className="account-card account-loading"><span className="status-dot" /><h1>Opening Forever Intelligence</h1><p>Loading your secure character workspace…</p></section></main>;
  if (!status.user) return <AccountGate mode={status.claimed === false ? "setup" : "login"} busy={busy} error={error} onSubmit={submitCredentials} />;
  if (status.user.mustChangePassword) return <PasswordGate user={status.user} busy={busy} error={error} onSubmit={changePassword} />;
  if (!status.local && !characters.length && (!migrationAttempted.current || provisioningCharacter)) return <main className="account-gate"><section className="account-card account-loading"><span className="status-dot" /><h1>Preparing your first character</h1><p>Migrating this browser's planner state into your private workspace…</p></section></main>;
  return <AuthContext.Provider value={value}>{<div key={activeCharacterId || "none"}>{children}</div>}</AuthContext.Provider>;
}
