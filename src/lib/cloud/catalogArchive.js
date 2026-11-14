// The hot-only storefront (the owner's Master Execution Order, item 1): the trend radar checks every
// site product against 8 criteria every day (src/lib/growth/alpha.js catalogVerdict) and asks the
// server to ARCHIVE the ones that fail and to RESTORE the ones it archived earlier that qualify
// again. The server is the only one that writes, and it refuses what it must:
//   • only products that exist, and only the platform owner's own products (a creator's product
//     is never touched by the radar);
//   • archive only an approved product; restore only a product the RADAR archived (a person's
//     archive stays a person's decision);
//   • nothing is deleted: status "archived" (the storefront lists status "approved" only) plus
//     archivedAt / archivedBy "radar" / archivedReason / the evidence, and every change appended to
//     the product's own archiveHistory (kept, capped); restore puts status "approved" back;
//   • at most MAX_CHANGES per run; without `confirm: "archive"` it is a dry run (nothing written);
//   • compare-and-swap write, read back, then the log (catalog:archive:log, server-only).
import { assertKvWritable, noteKvReadFailed, readKvResponse } from "./kvReadGuard.js";

const PRODUCTS_KEY = "marketplace:products";
const LOG_KEY = "catalog:archive:log";
export const MAX_CHANGES = 80;
const arr = (v) => (Array.isArray(v) ? v : []);
const clip = (s, n) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").slice(0, n);

/** Validate the asked changes against the stored catalog (pure). → { products, applied, refused } */
export function applyArchive(products = [], decisions = [], { ownerId = "", now = Date.now(), max = MAX_CHANGES } = {}) {
  const byId = new Map(arr(products).map((p) => [String(p?.id || ""), p]));
  const accepted = new Map();
  const refused = [];
  for (const d of arr(decisions)) {
    const id = String(d?.id || "");
    const refuse = (error) => refused.push({ id: id.slice(0, 80), error });
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) { refuse("bad_id"); continue; }
    const p = byId.get(id);
    if (!p) { refuse("unknown_product"); continue; }
    if (!ownerId || String(p.marketerId || "") !== ownerId) { refuse("not_owner_product"); continue; }
    if (d.action === "archive") {
      if (p.status !== "approved") { refuse("not_approved"); continue; }
    } else if (d.action === "restore") {
      if (p.status !== "archived" || p.archivedBy !== "radar") { refuse("not_radar_archived"); continue; }
    } else { refuse("bad_action"); continue; }
    if (accepted.size >= max) { refuse("over_run_limit"); continue; }
    accepted.set(id, { action: d.action, reason: clip(d.reason, 160), evidence: d.evidence && typeof d.evidence === "object" ? { accel: clip(d.evidence.accel, 20) || null, weekPct: Number.isFinite(d.evidence.weekPct) ? d.evidence.weekPct : null, israel: clip(d.evidence.israel, 20) || null, at: clip(d.evidence.at, 10) || null } : null });
  }
  const applied = [];
  const at = new Date(now).toISOString();
  const next = arr(products).map((p) => {
    const a = accepted.get(String(p?.id || ""));
    if (!a) return p;
    const history = [...arr(p.archiveHistory), { action: a.action, at, by: "radar", reason: a.reason, evidence: a.evidence }].slice(-20);
    applied.push({ id: p.id, action: a.action, reason: a.reason });
    if (a.action === "archive") return { ...p, status: "archived", archivedAt: at, archivedBy: "radar", archivedReason: a.reason, archiveEvidence: a.evidence, archiveHistory: history, updatedAt: now };
    const { archivedAt: _a, archivedBy: _b, archivedReason: _c, archiveEvidence: _d, ...rest } = p;
    return { ...rest, status: "approved", restoredAt: at, restoredBy: "radar", archiveHistory: history, updatedAt: now };
  });
  return { products: next, applied, refused };
}

function client({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || "";
  const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
  const h = { apikey: key, Authorization: `Bearer ${key}` };
  async function kvRead(k) {
    let res;
    try { res = await fetchImpl(`${url}/rest/v1/kv?key=eq.${encodeURIComponent(k)}&select=value,updated_at`, { headers: h, signal: AbortSignal.timeout(10000) }); }
    catch { noteKvReadFailed(k); return { ok: false }; }
    const copy = res.clone();
    const row = await readKvResponse(k, res);
    if (row.failed) return { ok: false };
    const version = row.found ? (await copy.json().catch(() => []))?.[0]?.updated_at || null : null;
    return { ok: true, value: row.found ? row.value : null, version };
  }
  async function kvWrite(k, value) {
    assertKvWritable(k);
    const res = await fetchImpl(`${url}/rest/v1/kv?on_conflict=key`, { method: "POST", headers: { ...h, "content-type": "application/json", Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ key: k, value: JSON.stringify(value) }), signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`kv_write_failed_${res.status}`);
  }
  async function kvSwap(k, value, version) {
    assertKvWritable(k);
    const res = await fetchImpl(`${url}/rest/v1/kv?key=eq.${encodeURIComponent(k)}&updated_at=eq.${encodeURIComponent(version)}`, { method: "PATCH", headers: { ...h, "content-type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ value: JSON.stringify(value) }), signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`kv_write_failed_${res.status}`);
    const rows = await res.json().catch(() => []);
    return Array.isArray(rows) && rows.length === 1;
  }
  return { kvRead, kvWrite, kvSwap };
}

/** POST op=catalog-archive (machine auth). Dry run unless body.confirm === "archive". */
export async function syncArchive(body = {}, { env = process.env, fetchImpl, now = Date.now(), attempts = 3 } = {}) {
  const ownerId = String(env.MARKETPLACE_SINGLE_OWNER_ID || "msd6go4kff49s5");
  const c = client({ env, fetchImpl });
  const dry = body?.confirm !== "archive";
  let r = null;
  let swapped = false;
  for (let i = 0; i < attempts && !swapped; i++) {
    const p = await c.kvRead(PRODUCTS_KEY);
    if (!p.ok || !p.version) return { ok: false, status: 503, error: "kv_read_failed" };
    r = applyArchive(arr(p.value), arr(body?.decisions), { ownerId, now });
    if (dry || !r.applied.length) return { ok: true, status: 200, dryRun: dry, applied: r.applied, refused: r.refused, proof: { status: dry ? "DRY_RUN" : "NOTHING_TO_CHANGE" } };
    swapped = await c.kvSwap(PRODUCTS_KEY, r.products, p.version);
  }
  if (!swapped) return { ok: false, status: 409, error: "catalog_changed_during_write", applied: [], refused: r?.refused || [] };
  const back = await c.kvRead(PRODUCTS_KEY);
  const stored = new Map(arr(back.ok ? back.value : []).map((x) => [String(x?.id || ""), x]));
  const verified = back.ok && r.applied.every((a) => stored.get(String(a.id))?.status === (a.action === "archive" ? "archived" : "approved"));
  const logR = await c.kvRead(LOG_KEY);
  if (logR.ok) {
    try { await c.kvWrite(LOG_KEY, [{ at: new Date(now).toISOString(), applied: r.applied, refused: r.refused.length, verified }, ...arr(logR.value)].slice(0, 60)); } catch { /* the log never fails the run */ }
  }
  return { ok: verified, status: verified ? 200 : 502, dryRun: false, applied: r.applied, refused: r.refused, proof: { status: verified ? "VERIFIED" : "READBACK_MISMATCH" } };
}
