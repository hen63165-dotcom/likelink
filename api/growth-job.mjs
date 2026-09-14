/**
 * Vercel Serverless Function — Growth Job Runner 🧠
 * Triggered by Vercel Cron (daily 10:00) or manual POST invocation.
 * Business logic is provider-neutral and self-contained.
 */

import { jsonCors } from "./_utils/cors.js";

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JOB_STATE = { PENDING: "pending", RUNNING: "running", SUCCESS: "success", FAILED: "failed" };
const JOBS = new Map();

function json(res, obj, status = 200, req) {
  jsonCors(res, obj, status, req, { allowMethods: ["POST", "GET", "OPTIONS"], allowHeaders: ["content-type", "authorization"] });
}

async function kvGet(key) {
  if (!SB_URL || !SB_KEY) return null;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=value`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, signal: AbortSignal.timeout(10000) });
    const rows = await res.json();
    if (!rows?.[0]?.value) return null;
    let parsed = JSON.parse(rows[0].value);
    while (typeof parsed === "string" && parsed.length > 0) { try { parsed = JSON.parse(parsed); } catch { break; } }
    return parsed;
  } catch { return null; }
}

async function kvSet(key, value) {
  if (!SB_URL || !SB_KEY) throw new Error("supabase_not_configured");
  const res = await fetch(`${SB_URL}/rest/v1/kv?on_conflict=key`, { method: "POST", headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "content-type": "application/json", Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ key, value }), signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`kv_upsert_failed_${res.status}`);
}

// --- Provider-neutral job scheduler ---
function registerJob(id, config) { JOBS.set(id, { id, ...config }); }

async function executeJob(id) {
  const job = JOBS.get(id);
  if (!job) return { ok: false, error: "job_not_found", id };
  const stateKey = `growth:job:${id}`;
  const now = Date.now();
  try {
    const state = (await kvGet(stateKey)) || {};
    if (state.state === JOB_STATE.RUNNING && now - (state.startedAt || 0) < (job.maxDurationMs || 30000)) {
      return { ok: false, error: "already_running", id };
    }
    if (state.lastRunAt && now - state.lastRunAt < (job.intervalMs || 86400000) && state.state === JOB_STATE.SUCCESS) {
      return { ok: false, error: "too_soon", id, nextRunAt: state.lastRunAt + (job.intervalMs || 86400000) };
    }
  } catch { /* proceed */ }
  try { await kvSet(stateKey, { id, state: JOB_STATE.RUNNING, startedAt: now }); } catch { /* noop */ }
  let result;
  try {
    const timeout = new Promise((_, r) => setTimeout(() => r(new Error("timeout")), job.maxDurationMs || 30000));
    result = { ok: true, ...((await Promise.race([job.fn({ kvGet, kvSet, now }), timeout])) || {}) };
  } catch (e) { result = { ok: false, error: String(e.message || e) }; }
  const final = { id, state: result.ok ? JOB_STATE.SUCCESS : JOB_STATE.FAILED, lastRunAt: now, nextRunAt: now + (job.intervalMs || 86400000), durationMs: now - now, result: result.ok ? "success" : result.error };
  try { await kvSet(stateKey, final); } catch { /* noop */ }
  return { ...result, durationMs: 0 };
}

async function runDueJobs() {
  const results = [];
  for (const [id, job] of JOBS) {
    try {
      const state = (await kvGet(`growth:job:${id}`)) || {};
      const isDue = !state.lastRunAt || Date.now() - state.lastRunAt >= (job.intervalMs || 86400000);
      const notRunning = state.state !== JOB_STATE.RUNNING;
      if (isDue && notRunning) results.push({ id, ...(await executeJob(id)) });
    } catch (e) { results.push({ id, ok: false, error: String(e.message || e) }); }
  }
  return results;
}

// --- Content opportunity discovery (deterministic, real data only) ---
function discoverOpportunities({ products = [], sales = [], clicks = [] } = {}) {
  const ops = [];
  for (const p of products) {
    if (!p?.id || !p.title) continue;
    const s = { clicks: clicks.filter((c) => c?.productId === p.id).length, sales: sales.filter((x) => x?.productId === p.id).length };
    ops.push({ type: "product_discovery", productId: p.id, title: p.title, category: p.category, price: p.price, image: p.image, score: s.sales * 100 + s.clicks * 10 + (p.image ? 5 : 0), reason: s.sales > 0 ? "real_sales" : s.clicks > 0 ? "real_clicks" : "catalog_entry" });
  }
  const cats = {};
  for (const p of products) { if (p.category) cats[p.category] = (cats[p.category] || 0) + 1; }
  for (const [cat, count] of Object.entries(cats)) { if (count >= 2) ops.push({ type: "category_page", category: cat, productCount: count, score: count * 20 }); }
  const top = products.find((p) => p?.status === "approved" && p?.image) || products[0];
  if (top) ops.push({ type: "luna_story", productId: top.id, title: top.title, category: top.category, score: 30 });
  ops.push({ type: "educational", title: "איך לפתוח סטודיו ב-Likelink", score: 10 });
  return ops.sort((a, b) => b.score - a.score);
}

function createContentAsset(opp, { products = [], origin = "https://likelink2.vercel.app" } = {}) {
  const id = `content_${now}_${Math.random().toString(36).slice(2, 8)}`;
  const base = { contentId: id, type: opp.type, title: opp.title || (opp.type === "category_page" ? opp.category : "Likelink"), createdAt: now, status: "published" };
  if (opp.type === "product_discovery") {
    const p = products.find((x) => x.id === opp.productId);
    if (!p) return null;
    return { ...base, product: { id: p.id, title: p.title, price: p.price, image: p.image, category: p.category }, destination: { url: `/p/${p.id}` } };
  }
  if (opp.type === "category_page") {
    const cp = products.filter((x) => x.category === opp.category).slice(0, 6);
    return { ...base, category: opp.category, productCount: cp.length, destination: { url: `/feed?cat=${opp.category}` } };
  }
  if (opp.type === "luna_story") {
    const p = products.find((x) => x.id === opp.productId);
    if (!p) return null;
    return { ...base, character: "לונה", product: { id: p.id, title: p.title, price: p.price }, destination: { url: `/p/${p.id}?utm_source=luna` } };
  }
  return { ...base, destination: { url: "/sell" } };
}

// --- Growth jobs (self-promotion: FREE core platform, not paywalled) ---
registerJob("discover-content", { fn: async ({ kvGet, kvSet, now: _n }) => {
  const ops = discoverOpportunities({ products: (await kvGet("marketplace:products")) || [], sales: (await kvGet("marketplace:sales")) || [], clicks: (await kvGet("marketplace:clicks")) || [] });
  await kvSet("growth:opportunities", ops.slice(0, 20));
  return { ok: true, found: ops.length };
}});

registerJob("create-content", { fn: async ({ kvGet, kvSet, now }) => {
  const ops = (await kvGet("growth:opportunities")) || [];
  const products = (await kvGet("marketplace:products")) || [];
  const assets = ops.slice(0, 5).map((o) => createContentAsset(o, { products, now })).filter(Boolean);
  const existing = (await kvGet("growth:content")) || [];
  await kvSet("growth:content", [...assets, ...existing].slice(0, 100));
  return { ok: true, created: assets.length };
}});

registerJob("update-sitemap", { fn: async ({ kvGet, kvSet, now }) => {
  const assets = (await kvGet("growth:content")) || [];
  const entries = assets.filter((a) => a.destination?.url).map((a) => ({ loc: `https://likelink2.vercel.app${a.destination.url}`, lastmod: new Date(a.createdAt).toISOString().split("T")[0], changefreq: "weekly", priority: "0.6" }));
  await kvSet("growth:sitemap", { entries: entries.slice(0, 50), updatedAt: now });
  return { ok: true, sitemapEntries: entries.length };
}});

registerJob("internal-linking", { fn: async ({ kvGet, kvSet, now }) => {
  const assets = (await kvGet("growth:content")) || [];
  const byCat = {};
  for (const a of assets) { const c = a.product?.category || a.category; if (c) { byCat[c] = byCat[c] || []; byCat[c].push(a); } }
  const links = [];
  for (const items of Object.values(byCat)) { for (let i = 0; i < Math.min(items.length - 1, 5); i++) links.push({ from: items[i].contentId, to: items[i + 1].contentId }); }
  await kvSet("growth:internalLinks", links);
  return { ok: true, links: links.length };
}});

// --- Handler: GET = status, POST = run due jobs ---
export default async function handler(req, res) {
  if (req.method === "OPTIONS") { json(res, { ok: true }, 200, req); return; }
  if (!SB_URL || !SB_KEY) { json(res, { ok: false, error: "supabase_not_configured" }, 500, req); return; }
  if (req.method === "GET") {
    const content = (await kvGet("growth:content")) || [];
    const opportunities = (await kvGet("growth:opportunities")) || [];
    return json(res, { ok: true, contentCount: content.length, opportunitiesCount: opportunities.length, jobs: Array.from(JOBS.keys()) }, 200, req);
  }
  if (req.method !== "POST") { json(res, { ok: false, error: "method_not_allowed" }, 405, req); return; }
  const results = await runDueJobs();
  console.log("[GROWTH] Cycle complete:", results.length, "jobs");
  json(res, { ok: true, results }, 200, req);
}
