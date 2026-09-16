// Server-only persistence over the EXISTING Supabase KV. RPC provides atomic CAS.
export function intelligenceStore({ env = process.env, fetchFn = fetch } = {}) {
  async function request(path, options = {}) {
    if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("BLOCKED_BY_STORAGE");
    const response = await fetchFn(`${env.VITE_SUPABASE_URL}/rest/v1/${path}`, {
      ...options, headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message === "VERSION_CONFLICT" ? "VERSION_CONFLICT" : "BLOCKED_BY_STORAGE");
    }
    return response.json();
  }
  return {
    async read(owner) {
      return request("rpc/intelligence_state", { method: "POST", body: JSON.stringify({ p_owner: owner }) });
    },
    async write(owner, expected, state) {
      return request("rpc/intelligence_state", { method: "POST", body: JSON.stringify({ p_owner: owner, p_expected: expected, p_value: state }) });
    },
    async ownerFor(marketerId) {
      const rows = await request(`profiles?marketer_id=eq.${encodeURIComponent(marketerId)}&select=id&limit=2`);
      if (rows.length !== 1) throw new Error("OWNERSHIP_REQUIRED");
      return rows[0].id;
    },
  };
}

export async function changeState(store, owner, update) {
  for (let n = 0; n < 3; n++) {
    const state = await store.read(owner);
    const next = update(structuredClone(state));
    next.version = state.version + 1;
    try { return await store.write(owner, state.version, next); }
    catch (e) { if (e.message !== "VERSION_CONFLICT" || n === 2) throw e; }
  }
}
