const AUTH_ROOT = "/api/auth";
const PBKDF2_ITERATIONS = 310_000;

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), options.timeoutMs || 15_000);
  try {
    const endpoint = path.startsWith("/characters") || path.startsWith("/party") ? `/api${path}` : `${AUTH_ROOT}${path}`;
    const response = await fetch(endpoint, {
      credentials: "same-origin",
      headers: { "content-type": "application/json", ...(options.headers || {}) },
      ...options,
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const error = new Error("Account service is not available on this host.");
      error.unavailable = true;
      throw error;
    }
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Account request failed.");
    return body;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("The account service did not respond. Try again.");
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createSalt() {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(24)));
}

async function derivePasswordProof(password, salt) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt: new TextEncoder().encode(salt),
    iterations: PBKDF2_ITERATIONS,
  }, material, 256);
  return bytesToHex(new Uint8Array(bits));
}

export const authApi = {
  status: () => request("/status", { method: "GET", headers: {} }),
  async setup({ email, displayName, password }) {
    const passwordSalt = createSalt();
    const passwordProof = await derivePasswordProof(password, passwordSalt);
    return request("/setup", { method: "POST", body: JSON.stringify({ email, displayName, passwordSalt, passwordProof }) });
  },
  async login({ email, password }) {
    const config = await request("/login-config", { method: "POST", body: JSON.stringify({ email }) });
    const passwordProof = await derivePasswordProof(password, config.passwordSalt);
    return request("/login", { method: "POST", body: JSON.stringify({ email, passwordProof }) });
  },
  logout: () => request("/logout", { method: "POST", body: "{}" }),
  listUsers: () => request("/users", { method: "GET", headers: {} }),
  async createUser({ email, displayName, role, password }) {
    const passwordSalt = createSalt();
    const passwordProof = await derivePasswordProof(password, passwordSalt);
    return request("/users", { method: "POST", body: JSON.stringify({ email, displayName, role, passwordSalt, passwordProof }) });
  },
  updateUser: (id, values) => request(`/users/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(values) }),
  async resetUserPassword(id, password) {
    const passwordSalt = createSalt();
    const passwordProof = await derivePasswordProof(password, passwordSalt);
    return request(`/users/${encodeURIComponent(id)}/password`, { method: "POST", body: JSON.stringify({ passwordSalt, passwordProof }) });
  },
  async changePassword({ email, currentPassword, newPassword }) {
    const config = await request("/login-config", { method: "POST", body: JSON.stringify({ email }) });
    const currentPasswordProof = await derivePasswordProof(currentPassword, config.passwordSalt);
    const newPasswordSalt = createSalt();
    const newPasswordProof = await derivePasswordProof(newPassword, newPasswordSalt);
    return request("/password", { method: "POST", body: JSON.stringify({ currentPasswordProof, newPasswordSalt, newPasswordProof }) });
  },
  listCharacters: () => request("/characters", { method: "GET", headers: {} }),
  createCharacter: (values) => request("/characters", { method: "POST", body: JSON.stringify(values) }),
  updateCharacter: (id, values) => request(`/characters/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(values) }),
  deleteCharacter: (id) => request(`/characters/${encodeURIComponent(id)}`, { method: "DELETE", body: "{}" }),
  saveCharacterState: (id, state, revision) => request(`/characters/${encodeURIComponent(id)}/state`, { method: "PUT", body: JSON.stringify({ state, revision }) }),
  listParty: () => request("/party", { method: "GET", headers: {} }),
};
