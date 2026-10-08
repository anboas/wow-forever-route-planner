const COOKIE = "wfrp_session";
const ROLES = ["super_user", "administrator", "analyst", "viewer"];
const MAX_BODY = 1_500_000;
const SESSION_SECONDS = 14 * 24 * 60 * 60;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS wfrp_users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('super_user','administrator','analyst','viewer')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
    password_salt TEXT NOT NULL, password_hash TEXT NOT NULL,
    must_change_password INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_login_at TEXT NOT NULL DEFAULT ''
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_wfrp_users_email ON wfrp_users (LOWER(email))",
  `CREATE TABLE IF NOT EXISTS wfrp_sessions (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL, revoked_at TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_wfrp_sessions_user ON wfrp_sessions (user_id, expires_at)",
  `CREATE TABLE IF NOT EXISTS wfrp_login_attempts (
    id TEXT PRIMARY KEY, client_hash TEXT NOT NULL, succeeded INTEGER NOT NULL DEFAULT 0, attempted_at TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_wfrp_login_attempts ON wfrp_login_attempts (client_hash, attempted_at)",
  `CREATE TABLE IF NOT EXISTS wfrp_characters (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, realm TEXT NOT NULL DEFAULT 'WoW Forever',
    character_class TEXT NOT NULL DEFAULT 'warrior', spec TEXT NOT NULL DEFAULT '', faction TEXT NOT NULL DEFAULT 'horde',
    level INTEGER NOT NULL DEFAULT 1, xp INTEGER NOT NULL DEFAULT 0, state_json TEXT NOT NULL DEFAULT '{}', revision INTEGER NOT NULL DEFAULT 1,
    source TEXT NOT NULL DEFAULT 'manual', armory_provider TEXT NOT NULL DEFAULT 'forever', armory_character_id TEXT NOT NULL DEFAULT '',
    armory_url TEXT NOT NULL DEFAULT '', armory_status TEXT NOT NULL DEFAULT 'unlinked', last_synced_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_wfrp_characters_user ON wfrp_characters (user_id, updated_at DESC)",
  `CREATE TABLE IF NOT EXISTS wfrp_party_presence (
    user_id TEXT PRIMARY KEY, character_id TEXT NOT NULL, payload_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL
  )`,
];

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
}

function clean(value, max = 200) { return String(value ?? "").trim().slice(0, max); }
function email(value) { const normalized = clean(value, 254).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : ""; }
function validHex(value, length) { return new RegExp(`^[a-f0-9]{${length}}$`).test(String(value || "")); }
function cookies(request) {
  return Object.fromEntries((request.headers.get("cookie") || "").split(";").map((part) => part.trim().split(/=(.*)/s)).filter(([key]) => key).map(([key, value]) => [key, decodeURIComponent(value || "")]));
}
async function hash(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function randomHex(bytes = 32) { return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
function constantTime(left, right) {
  const a = String(left || ""), b = String(right || ""); if (a.length !== b.length || !a.length) return false;
  let difference = 0; for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index); return difference === 0;
}
function sameOrigin(request) {
  const origin = request.headers.get("origin"); if (!origin) return true;
  return origin === new URL(request.url).origin;
}
async function body(request) {
  const length = Number(request.headers.get("content-length") || 0); if (length > MAX_BODY) throw new Error("Request body is too large.");
  const text = await request.text(); if (text.length > MAX_BODY) throw new Error("Request body is too large.");
  try { return text ? JSON.parse(text) : {}; } catch { throw new Error("Request body must be valid JSON."); }
}
function cookie(token, request, maxAge = SESSION_SECONDS) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}; Priority=High${secure}`;
}
function capabilities(role) {
  return { canManageUsers: ["super_user", "administrator"].includes(role), canWrite: ["super_user", "administrator", "analyst"].includes(role), canView: ROLES.includes(role) };
}
function publicUser(row) {
  if (!row) return null;
  return { id: row.id, email: row.email, displayName: row.display_name, roleId: row.role, role: row.role.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()), status: row.status, mustChangePassword: Boolean(row.must_change_password), isOwner: row.role === "super_user", ...capabilities(row.role), createdAt: row.created_at, lastLoginAt: row.last_login_at || null };
}
function publicCharacter(row) {
  let state = {}; try { state = JSON.parse(row.state_json || "{}"); } catch { /* fail closed to empty state */ }
  return { id: row.id, userId: row.user_id, name: row.name, realm: row.realm, characterClass: row.character_class, spec: row.spec, faction: row.faction, level: row.level, xp: row.xp, state, revision: row.revision, source: row.source, armory: { provider: row.armory_provider, characterId: row.armory_character_id, url: row.armory_url, status: row.armory_status }, lastSyncedAt: row.last_synced_at || null, createdAt: row.created_at, updatedAt: row.updated_at };
}

async function ensureSchema(db) {
  await db.batch(SCHEMA.map((statement) => db.prepare(statement)));
  const legacy = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'dbi_users'").first();
  if (legacy) {
    const now = new Date().toISOString();
    await db.prepare(`INSERT OR IGNORE INTO wfrp_users
      (id,email,display_name,role,status,password_salt,password_hash,must_change_password,created_by,created_at,updated_at,last_login_at)
      SELECT user_id,email,display_name,'super_user','active',password_salt,password_hash,0,user_id,created_at,?,last_login_at
      FROM dbi_users WHERE role = 'super_user' ORDER BY created_at LIMIT 1`).bind(now).run();
  }
}

async function sessionUser(db, request) {
  const token = cookies(request)[COOKIE]; if (!token) return null;
  const now = new Date().toISOString();
  const row = await db.prepare(`SELECT user.*, session.id AS session_id FROM wfrp_sessions session
    JOIN wfrp_users user ON user.id = session.user_id
    WHERE session.token_hash = ? AND session.expires_at > ? AND session.revoked_at = '' AND user.status = 'active' LIMIT 1`)
    .bind(await hash(token), now).first();
  if (row) await db.prepare("UPDATE wfrp_sessions SET last_seen_at = ? WHERE id = ?").bind(now, row.session_id).run();
  return row || null;
}
async function createSession(db, userId, request) {
  const token = randomHex(); const now = new Date(); const expires = new Date(now.getTime() + SESSION_SECONDS * 1000);
  await db.batch([
    db.prepare("DELETE FROM wfrp_sessions WHERE expires_at <= ? OR revoked_at <> ''").bind(now.toISOString()),
    db.prepare("INSERT INTO wfrp_sessions (id,user_id,token_hash,expires_at,revoked_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), userId, await hash(token), expires.toISOString(), "", now.toISOString(), now.toISOString()),
  ]);
  return cookie(token, request);
}
async function requireUser(db, request, write = false) {
  const user = await sessionUser(db, request);
  if (!user) return { error: json({ error: "Sign in required." }, 401) };
  if (user.must_change_password) return { error: json({ error: "Replace the temporary password before continuing." }, 403) };
  if (write && !capabilities(user.role).canWrite) return { error: json({ error: "This account has read-only access." }, 403) };
  return { user };
}
async function clientKey(request, address) { return hash(`${address}|${request.headers.get("cf-connecting-ip") || "local"}|${clean(request.headers.get("user-agent"), 180)}`); }

async function authResponse(request, env, db, parts) {
  const action = parts[0] || "status";
  if (action === "status" && request.method === "GET") {
    const [count, user] = await Promise.all([db.prepare("SELECT COUNT(*) AS count FROM wfrp_users").first(), sessionUser(db, request)]);
    return json({ enabled: true, required: true, claimed: Number(count?.count || 0) > 0, user: publicUser(user) });
  }
  if (!sameOrigin(request)) return json({ error: "Cross-origin account request rejected." }, 403);
  if (action === "setup" && request.method === "POST") {
    const count = await db.prepare("SELECT COUNT(*) AS count FROM wfrp_users").first();
    if (Number(count?.count || 0)) return json({ error: "The owner account already exists." }, 409);
    const values = await body(request); const normalizedEmail = email(values.email); const displayName = clean(values.displayName, 80);
    if (!normalizedEmail || displayName.length < 2 || !validHex(values.passwordSalt, 48) || !validHex(values.passwordProof, 64)) return json({ error: "Valid owner details are required." }, 400);
    const now = new Date().toISOString(); const id = crypto.randomUUID(); const passwordHash = `v1$${await hash(values.passwordProof)}`;
    await db.prepare("INSERT INTO wfrp_users (id,email,display_name,role,status,password_salt,password_hash,must_change_password,created_by,created_at,updated_at,last_login_at) VALUES (?,?,?,'super_user','active',?,?,0,?,?,?,'')")
      .bind(id, normalizedEmail, displayName, values.passwordSalt, passwordHash, id, now, now).run();
    return json({ user: publicUser(await db.prepare("SELECT * FROM wfrp_users WHERE id = ?").bind(id).first()) }, 201, { "set-cookie": await createSession(db, id, request) });
  }
  if (action === "register" && request.method === "POST") {
    const owner = await db.prepare("SELECT id FROM wfrp_users WHERE role = 'super_user' LIMIT 1").first();
    if (!owner) return json({ error: "The owner must finish workspace setup before registration opens." }, 409);
    const values = await body(request); const normalizedEmail = email(values.email); const displayName = clean(values.displayName, 80);
    if (!normalizedEmail || displayName.length < 2 || !validHex(values.passwordSalt, 48) || !validHex(values.passwordProof, 64)) return json({ error: "Valid account details and a password are required." }, 400);
    const key = await clientKey(request, "open-registration"); const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const attempts = await db.prepare("SELECT COUNT(*) AS count FROM wfrp_login_attempts WHERE client_hash = ? AND attempted_at >= ?").bind(key, since).first();
    if (Number(attempts?.count || 0) >= 10) return json({ error: "Too many registration attempts. Try again in one hour." }, 429);
    const total = await db.prepare("SELECT COUNT(*) AS count FROM wfrp_users").first();
    if (Number(total?.count || 0) >= 200) return json({ error: "Registration is temporarily unavailable." }, 503);
    const now = new Date().toISOString(); const id = crypto.randomUUID(); const attemptId = crypto.randomUUID();
    await db.prepare("INSERT INTO wfrp_login_attempts (id,client_hash,succeeded,attempted_at) VALUES (?,?,0,?)").bind(attemptId, key, now).run();
    try {
      await db.prepare("INSERT INTO wfrp_users (id,email,display_name,role,status,password_salt,password_hash,must_change_password,created_by,created_at,updated_at,last_login_at) VALUES (?,?,?,'analyst','active',?,?,0,?,?,?,?)")
        .bind(id, normalizedEmail, displayName, values.passwordSalt, `v1$${await hash(values.passwordProof)}`, id, now, now, now).run();
    } catch { return json({ error: "An account with that email already exists." }, 409); }
    await db.prepare("UPDATE wfrp_login_attempts SET succeeded = 1 WHERE id = ?").bind(attemptId).run();
    return json({ user: publicUser(await db.prepare("SELECT * FROM wfrp_users WHERE id = ?").bind(id).first()) }, 201, { "set-cookie": await createSession(db, id, request) });
  }
  if (action === "login-config" && request.method === "POST") {
    const values = await body(request); const normalizedEmail = email(values.email); const user = normalizedEmail ? await db.prepare("SELECT password_salt,status FROM wfrp_users WHERE LOWER(email) = ?").bind(normalizedEmail).first() : null;
    return json({ passwordSalt: user?.status === "active" ? user.password_salt : (await hash(`wfrp:${normalizedEmail || "unknown"}`)).slice(0, 48), passwordIterations: 310000 });
  }
  if (action === "login" && request.method === "POST") {
    const values = await body(request); const normalizedEmail = email(values.email); const key = await clientKey(request, normalizedEmail);
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString(); const attempts = await db.prepare("SELECT COUNT(*) AS count FROM wfrp_login_attempts WHERE client_hash = ? AND succeeded = 0 AND attempted_at >= ?").bind(key, since).first();
    if (Number(attempts?.count || 0) >= 8) return json({ error: "Too many sign-in attempts. Try again in 15 minutes." }, 429);
    const user = normalizedEmail ? await db.prepare("SELECT * FROM wfrp_users WHERE LOWER(email) = ?").bind(normalizedEmail).first() : null;
    const verified = Boolean(user && user.status === "active" && validHex(values.passwordProof, 64) && String(user.password_hash).startsWith("v1$") && constantTime(await hash(values.passwordProof), String(user.password_hash).slice(3)));
    await db.prepare("INSERT INTO wfrp_login_attempts (id,client_hash,succeeded,attempted_at) VALUES (?,?,?,?)").bind(crypto.randomUUID(), key, verified ? 1 : 0, new Date().toISOString()).run();
    if (!verified) return json({ error: "Email or password is incorrect." }, 401);
    const now = new Date().toISOString(); await db.prepare("UPDATE wfrp_users SET last_login_at = ? WHERE id = ?").bind(now, user.id).run();
    return json({ user: publicUser({ ...user, last_login_at: now }) }, 200, { "set-cookie": await createSession(db, user.id, request) });
  }
  if (action === "logout" && request.method === "POST") {
    const token = cookies(request)[COOKIE]; if (token) await db.prepare("UPDATE wfrp_sessions SET revoked_at = ? WHERE token_hash = ?").bind(new Date().toISOString(), await hash(token)).run();
    return json({ ok: true }, 200, { "set-cookie": cookie("", request, 0) });
  }
  if (action === "password" && request.method === "POST") {
    const current = await sessionUser(db, request); if (!current) return json({ error: "Sign in required." }, 401);
    const values = await body(request); const verified = validHex(values.currentPasswordProof, 64) && constantTime(await hash(values.currentPasswordProof), String(current.password_hash).slice(3));
    if (!verified) return json({ error: "Current password is incorrect." }, 403);
    if (!validHex(values.newPasswordSalt, 48) || !validHex(values.newPasswordProof, 64)) return json({ error: "New password is invalid." }, 400);
    const now = new Date().toISOString(); await db.batch([
      db.prepare("UPDATE wfrp_users SET password_salt = ?,password_hash = ?,must_change_password = 0,updated_at = ? WHERE id = ?").bind(values.newPasswordSalt, `v1$${await hash(values.newPasswordProof)}`, now, current.id),
      db.prepare("UPDATE wfrp_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at = ''").bind(now, current.id),
    ]);
    return json({ user: publicUser({ ...current, must_change_password: 0 }) }, 200, { "set-cookie": await createSession(db, current.id, request) });
  }
  if (action === "users") return usersResponse(request, db, parts.slice(1));
  return json({ error: "Account route not found." }, 404);
}

async function usersResponse(request, db, parts) {
  const current = await sessionUser(db, request); if (!current) return json({ error: "Sign in required." }, 401);
  if (!capabilities(current.role).canManageUsers) return json({ error: "Account administration is required." }, 403);
  const id = clean(parts[0], 80); const passwordRoute = parts[1] === "password";
  if (request.method === "GET" && !id) {
    const result = await db.prepare(`SELECT user.*, (SELECT COUNT(*) FROM wfrp_sessions session WHERE session.user_id = user.id AND session.revoked_at = '' AND session.expires_at > ?) AS active_sessions FROM wfrp_users user ORDER BY CASE role WHEN 'super_user' THEN 0 ELSE 1 END, display_name`).bind(new Date().toISOString()).all();
    return json({ users: (result.results || []).map((user) => ({ ...publicUser(user), activeSessions: Number(user.active_sessions || 0) })) });
  }
  if (request.method === "POST" && !id) {
    const values = await body(request); const normalizedEmail = email(values.email); const displayName = clean(values.displayName, 80); const role = ROLES.includes(values.role) && values.role !== "super_user" ? values.role : "analyst";
    if (!normalizedEmail || displayName.length < 2 || !validHex(values.passwordSalt, 48) || !validHex(values.passwordProof, 64)) return json({ error: "Valid user details and a temporary password are required." }, 400);
    const now = new Date().toISOString(); const userId = crypto.randomUUID();
    try { await db.prepare("INSERT INTO wfrp_users (id,email,display_name,role,status,password_salt,password_hash,must_change_password,created_by,created_at,updated_at,last_login_at) VALUES (?,?,?,?,'active',?,?,1,?,?,?,'')")
      .bind(userId, normalizedEmail, displayName, role, values.passwordSalt, `v1$${await hash(values.passwordProof)}`, current.id, now, now).run(); }
    catch { return json({ error: "An account with that email already exists." }, 409); }
    return json({ user: publicUser(await db.prepare("SELECT * FROM wfrp_users WHERE id = ?").bind(userId).first()) }, 201);
  }
  const target = id ? await db.prepare("SELECT * FROM wfrp_users WHERE id = ?").bind(id).first() : null;
  if (!target) return json({ error: "User not found." }, 404);
  if (target.role === "super_user") return json({ error: "The owner account is immutable." }, 403);
  if (passwordRoute && request.method === "POST") {
    const values = await body(request); if (!validHex(values.passwordSalt, 48) || !validHex(values.passwordProof, 64)) return json({ error: "A valid temporary password is required." }, 400);
    const now = new Date().toISOString(); await db.batch([
      db.prepare("UPDATE wfrp_users SET password_salt = ?,password_hash = ?,must_change_password = 1,updated_at = ? WHERE id = ?").bind(values.passwordSalt, `v1$${await hash(values.passwordProof)}`, now, id),
      db.prepare("UPDATE wfrp_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at = ''").bind(now, id),
    ]); return json({ ok: true });
  }
  if (request.method === "PATCH") {
    const values = await body(request); const role = ROLES.includes(values.role) && values.role !== "super_user" ? values.role : target.role; const status = ["active", "suspended"].includes(values.status) ? values.status : target.status;
    const displayName = clean(values.displayName || target.display_name, 80); const now = new Date().toISOString();
    const statements = [db.prepare("UPDATE wfrp_users SET display_name = ?,role = ?,status = ?,updated_at = ? WHERE id = ?").bind(displayName, role, status, now, id)];
    if (status === "suspended") statements.push(db.prepare("UPDATE wfrp_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at = ''").bind(now, id));
    await db.batch(statements); return json({ user: publicUser(await db.prepare("SELECT * FROM wfrp_users WHERE id = ?").bind(id).first()) });
  }
  return json({ error: "Method not allowed." }, 405);
}

async function charactersResponse(request, db, parts) {
  const write = request.method !== "GET"; const access = await requireUser(db, request, write); if (access.error) return access.error; const user = access.user;
  const id = clean(parts[0], 80); const stateRoute = parts[1] === "state";
  if (request.method === "GET" && !id) {
    const result = await db.prepare("SELECT * FROM wfrp_characters WHERE user_id = ? ORDER BY updated_at DESC").bind(user.id).all();
    return json({ characters: (result.results || []).map(publicCharacter) });
  }
  if (request.method === "POST" && !id) {
    const values = await body(request); const name = clean(values.name, 80); if (!name) return json({ error: "Character name is required." }, 400);
    const count = await db.prepare("SELECT COUNT(*) AS count FROM wfrp_characters WHERE user_id = ?").bind(user.id).first(); if (Number(count?.count || 0) >= 20) return json({ error: "Character limit reached." }, 409);
    const now = new Date().toISOString(); const characterId = crypto.randomUUID(); const state = values.state && typeof values.state === "object" ? values.state : {};
    await db.prepare(`INSERT INTO wfrp_characters (id,user_id,name,realm,character_class,spec,faction,level,xp,state_json,revision,source,armory_provider,armory_character_id,armory_url,armory_status,last_synced_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,1,?,'forever','','','unlinked','',?,?)`).bind(characterId, user.id, name, clean(values.realm, 80) || "WoW Forever", clean(values.characterClass, 40) || "warrior", clean(values.spec, 50), ["horde","alliance"].includes(values.faction) ? values.faction : "horde", Math.max(1, Number(values.level || 1)), Math.max(0, Number(values.xp || 0)), JSON.stringify(state), clean(values.source, 50) || "manual", now, now).run();
    return json({ character: publicCharacter(await db.prepare("SELECT * FROM wfrp_characters WHERE id = ?").bind(characterId).first()) }, 201);
  }
  const character = id ? await db.prepare("SELECT * FROM wfrp_characters WHERE id = ? AND user_id = ?").bind(id, user.id).first() : null; if (!character) return json({ error: "Character not found." }, 404);
  if (stateRoute && request.method === "PUT") {
    const values = await body(request); if (!values.state || typeof values.state !== "object" || Array.isArray(values.state)) return json({ error: "Character state must be an object." }, 400);
    const serialized = JSON.stringify(values.state); if (serialized.length > 1_250_000) return json({ error: "Character state is too large." }, 413);
    if (Number(values.revision || character.revision) !== Number(character.revision)) return json({ error: "Character changed in another session. Reload before saving.", currentRevision: character.revision }, 409);
    const now = new Date().toISOString(); const meta = values.state.characterMeta || {};
    await db.prepare(`UPDATE wfrp_characters SET name = ?,realm = ?,character_class = ?,spec = ?,faction = ?,level = ?,xp = ?,state_json = ?,revision = revision + 1,last_synced_at = ?,updated_at = ? WHERE id = ? AND user_id = ?`)
      .bind(clean(meta.name, 80) || character.name, clean(meta.realm, 80) || character.realm, clean(values.state.characterClass, 40) || character.character_class, clean(values.state.spec, 50) || character.spec, ["horde","alliance"].includes(values.state.faction) ? values.state.faction : character.faction, Math.max(1, Number(values.state.level || character.level)), Math.max(0, Number(values.state.xp || 0)), serialized, now, now, id, user.id).run();
    const telemetry = values.state.telemetry || {}; const route = Array.isArray(values.state.route) ? values.state.route : [];
    const presence = { userId: user.id, displayName: user.display_name, characterId: id, name: clean(meta.name, 80) || character.name, realm: clean(meta.realm, 80) || character.realm, characterClass: clean(values.state.characterClass, 40) || character.character_class, spec: clean(values.state.spec, 50) || character.spec, faction: values.state.faction || character.faction, level: Math.max(1, Number(values.state.level || character.level)), xp: Math.max(0, Number(values.state.xp || 0)), nextDungeonId: route[0]?.dungeonId || "", wishlistCount: Array.isArray(values.state.wishlist) ? values.state.wishlist.length : 0, readiness: telemetry.readiness || null, currentRun: telemetry.currentRun ? { dungeonId: telemetry.currentRun.dungeonId || "", dungeonName: telemetry.currentRun.dungeonName || "", startedAt: telemetry.currentRun.startedAt || 0, bosses: telemetry.currentRun.bosses?.length || 0, deaths: telemetry.currentRun.deaths || 0 } : null, lastRun: telemetry.runs?.length ? { dungeonId: telemetry.runs.at(-1).dungeonId || "", dungeonName: telemetry.runs.at(-1).dungeonName || "", endedAt: telemetry.runs.at(-1).endedAt || 0, totalXp: telemetry.runs.at(-1).totalXp || 0, status: telemetry.runs.at(-1).status || "partial" } : null, updatedAt: now };
    await db.prepare("INSERT INTO wfrp_party_presence (user_id,character_id,payload_json,updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET character_id=excluded.character_id,payload_json=excluded.payload_json,updated_at=excluded.updated_at")
      .bind(user.id, id, JSON.stringify(presence), now).run();
    return json({ character: publicCharacter(await db.prepare("SELECT * FROM wfrp_characters WHERE id = ?").bind(id).first()) });
  }
  if (request.method === "PATCH") {
    const values = await body(request); const now = new Date().toISOString();
    await db.prepare(`UPDATE wfrp_characters SET name = ?,realm = ?,armory_character_id = ?,armory_url = ?,armory_status = ?,updated_at = ? WHERE id = ? AND user_id = ?`)
      .bind(clean(values.name || character.name, 80), clean(values.realm || character.realm, 80), clean(values.armoryCharacterId ?? character.armory_character_id, 160), clean(values.armoryUrl ?? character.armory_url, 500), clean(values.armoryStatus ?? character.armory_status, 30), now, id, user.id).run();
    return json({ character: publicCharacter(await db.prepare("SELECT * FROM wfrp_characters WHERE id = ?").bind(id).first()) });
  }
  if (request.method === "DELETE") {
    const count = await db.prepare("SELECT COUNT(*) AS count FROM wfrp_characters WHERE user_id = ?").bind(user.id).first(); if (Number(count?.count || 0) <= 1) return json({ error: "Keep at least one character in the workspace." }, 409);
    await db.prepare("DELETE FROM wfrp_characters WHERE id = ? AND user_id = ?").bind(id, user.id).run(); return json({ ok: true });
  }
  return json({ error: "Method not allowed." }, 405);
}

async function partyResponse(request, db) {
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
  const access = await requireUser(db, request, false); if (access.error) return access.error;
  const result = await db.prepare(`SELECT presence.payload_json,presence.updated_at FROM wfrp_party_presence presence JOIN wfrp_users user ON user.id = presence.user_id WHERE user.status = 'active' ORDER BY presence.updated_at DESC`).all();
  return json({ party: (result.results || []).map((row) => { try { return JSON.parse(row.payload_json); } catch { return null; } }).filter(Boolean) });
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (!env.WFRP_DB) return json({ error: "Account database is not configured." }, 503);
  try {
    await ensureSchema(env.WFRP_DB);
    const parts = new URL(request.url).pathname.split("/").filter(Boolean);
    if (parts[0] !== "api") return json({ error: "API route not found." }, 404);
    if (parts[1] === "auth") return authResponse(request, env, env.WFRP_DB, parts.slice(2));
    if (parts[1] === "characters") return charactersResponse(request, env.WFRP_DB, parts.slice(2));
    if (parts[1] === "party") return partyResponse(request, env.WFRP_DB);
    return json({ error: "API route not found." }, 404);
  } catch (error) {
    console.error("Forever Intelligence API error", clean(error?.message, 240));
    return json({ error: error?.message === "Request body is too large." ? error.message : "Account service request failed." }, error?.message === "Request body is too large." ? 413 : 500);
  }
}
