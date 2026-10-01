// Luna execution engine — runs compiled intents against real data (kv injected).
//
// GOAL → INTENT → STATE → GAP → CAPABILITIES → ACTION GRAPH → EXECUTION →
// PROOF → RESULT → MEMORY → LEARNING → NEXT ACTION.
//
// Guarantees:
//   • only native INTERNAL capabilities with session permission execute on
//     their own (LAW 06 / 14); everything else is returned with its owner action
//   • every executed step is VERIFIED by re-reading what it wrote (LAW 01)
//   • idempotent: assets rewrite only when the product fingerprint changed;
//     passport snapshots at most once per ~20h unless the score moved
//   • duplicate-safe action log per goal + data + day (LAW 08)
//   • failures are classified, dead-lettered and never hide other work (LAW 09)
//   • asset writes keep the previous version for rollback (LAW 13)
//   • learning uses real score / click deltas only (LAW 12)
//   • fail-closed: a failed kv read blocks that key's write (kvReadGuard)
import {
  buildPassport, buildChannelRegistry, buildProductAssets, buildOpportunityGraph, prioritize,
  LUNA_COMMANDS, OPPORTUNITY_STATUS, SAFETY, heCount,
} from "./engine.js";
import { merchantStatus, stableHash, isPublicProduct, ORIGIN, canonicalProduct, buildProductSeo, auditSeo, agentCommerceReadiness } from "./surfaces.js";
import { buildCampaign, recruitCreators } from "./campaigns.js";
import { compileIntent, buildActionGraph, COMMAND_GOALS } from "./intent.js";
import { CAPABILITIES, classifyFailure } from "./capabilities.js";
import { evidence, TRUTH } from "./truth.js";
import { auditRun } from "./laws.js";

export const KEYS = Object.freeze({
  assets: (id) => `discovery:assets:${id}`,
  passport: (id) => `discovery:passport:${id}`,
  log: (scope) => `discovery:log:${scope}`,
  memory: (scope) => `discovery:memory:${scope}`,
  run: (scope) => `discovery:run:last:${scope}`,
  deadLetter: "discovery:deadletter",
  sweep: "discovery:sweep:last",
  campaigns: (scope) => `discovery:campaigns:${scope}`,
});

const SNAPSHOT_MIN_MS = 20 * 60 * 60 * 1000;
const LOG_CAP = 50;
const MEMORY_CAP = 200;
const CAMPAIGN_CAP = 30;
const DEAD_LETTER_CAP = 100;
const HISTORY_CAP = 30;
const STEP_TIMEOUT_MS = 8000;
const DAY_MS = 86400000;

const arr = (v) => (Array.isArray(v) ? v : []);

async function read(kvGet, key, fallback) {
  const v = await kvGet(key, fallback);
  return v == null ? fallback : v;
}

function withTimeout(promise, ms, label) {
  let t;
  return Promise.race([
    promise.finally(() => clearTimeout(t)),
    new Promise((_, reject) => { t = setTimeout(() => reject(new Error(`timeout:${label}`)), ms); }),
  ]);
}

/** Channel env as BOOLEANS only — secret values never leave process.env. */
export function channelEnv(env = {}) {
  return {
    telegram: Boolean(env.BRAND_TELEGRAM_BOT && env.BRAND_TELEGRAM_CHAT),
    webhook: Boolean(env.BRAND_WEBHOOK_URL),
    email: Boolean(env.RESEND_API_KEY),
  };
}

export async function loadDiscoveryData(kvGet, { productIds = null } = {}) {
  const [products, marketers, clicks, sales, collections, publications, brandPulse] = await Promise.all([
    read(kvGet, "marketplace:products", []),
    read(kvGet, "marketplace:marketers", []),
    read(kvGet, "marketplace:clicks", []),
    read(kvGet, "marketplace:sales", []),
    read(kvGet, "marketplace:collections", []),
    read(kvGet, "publish:log", []),
    read(kvGet, "brand_pulse:posts", []),
  ]);
  const all = arr(products).filter((p) => p && p.id);
  const scope = productIds ? all.filter((p) => productIds.includes(String(p.id))) : all;
  const perProduct = await Promise.all(scope.map(async (p) => {
    const [ugc, assets, passport] = await Promise.all([
      read(kvGet, `ugc:assets:${p.id}`, []),
      read(kvGet, KEYS.assets(p.id), null),
      read(kvGet, KEYS.passport(p.id), null),
    ]);
    return [String(p.id), { ugc: arr(ugc), assets, passport }];
  }));
  return {
    products: all,
    scope,
    marketers: arr(marketers),
    clicks: arr(clicks),
    sales: arr(sales),
    collections: arr(collections),
    publications: arr(publications),
    publicFeedIds: new Set(arr(brandPulse).map((p) => String(p?.id || "")).filter(Boolean)),
    perProduct: new Map(perProduct),
  };
}

export function computePassports(data, { env = {}, origin = ORIGIN, now = Date.now() } = {}) {
  const merchantEligibleCount = data.products.filter((p) => merchantStatus(p, data.marketers, origin).eligible).length;
  const channels = buildChannelRegistry({ env: channelEnv(env), publications: data.publications, merchantEligibleCount });
  const titleCounts = new Map();
  for (const p of data.products) {
    const t = String(p.title || "").trim().toLowerCase();
    if (t) titleCounts.set(t, (titleCounts.get(t) || 0) + 1);
  }
  const passports = data.scope.map((product) => {
    const extra = data.perProduct.get(String(product.id)) || {};
    return buildPassport({
      product,
      marketers: data.marketers,
      clicks: data.clicks,
      sales: data.sales,
      publications: data.publications,
      publicFeedIds: data.publicFeedIds,
      products: data.products,
      ugcAssets: extra.ugc || [],
      collections: data.collections,
      channels,
      duplicateTitle: (titleCounts.get(String(product.title || "").trim().toLowerCase()) || 0) > 1,
      storedAssets: extra.assets || null,
      previous: extra.passport || null,
      origin,
      now,
    });
  });
  return { passports, channels, merchantEligibleCount };
}

/** Persist assets only when the product changed; keep the previous version (LAW 13). */
async function persistAssets({ kvSet, product, data, channels, origin, now, stored }) {
  const assets = buildProductAssets(product, data.marketers, channels, origin, now);
  if (!assets.share) return { status: "blocked", reason: "למוצר חסרה כותרת — אין ממה לבנות חבילת שיתוף" };
  if (stored?.share && stored.pinnedFor === assets.fingerprint) {
    return { status: OPPORTUNITY_STATUS.UP_TO_DATE, reason: "שוחזרה ידנית גרסה קודמת — לונה לא דורסת אותה כל עוד המוצר לא השתנה", assets: stored };
  }
  if (stored && stored.fingerprint === assets.fingerprint && stored.share && Number(stored.format || 1) >= Number(assets.format || 1)) {
    return { status: OPPORTUNITY_STATUS.UP_TO_DATE, reason: "חבילת השיתוף כבר מעודכנת לנתוני המוצר", assets: stored };
  }
  const next = stored
    ? { ...assets, previous: { fingerprint: stored.fingerprint, generatedAt: stored.generatedAt, share: stored.share, drafts: stored.drafts } }
    : { ...assets, previous: null };
  try {
    await kvSet(KEYS.assets(product.id), next);
    return { status: OPPORTUNITY_STATUS.EXECUTED, reason: stored ? "חבילת השיתוף עודכנה לנתוני המוצר החדשים" : "נוצרה חבילת שיתוף עם לינק מעקב", assets: next };
  } catch (e) {
    return { status: "failed", reason: "השמירה נכשלה — לא נשמר דבר", error: String(e?.message || e) };
  }
}

/** Passport snapshot with score history — at most once per ~20h unless changed. */
async function persistSnapshot({ kvSet, passport, previous, now }) {
  const history = arr(previous?.history);
  const unchanged = previous
    && previous.fingerprint === passport.fingerprint
    && previous.score === passport.score.score
    && now - Number(previous.at || 0) < SNAPSHOT_MIN_MS;
  if (unchanged) return { written: false };
  const snapshot = {
    productId: passport.productId,
    at: now,
    fingerprint: passport.fingerprint,
    score: passport.score.score,
    components: passport.score.components.map((c) => ({ id: c.id, earned: c.earned, max: c.max })),
    merchantEligible: passport.merchant.eligible,
    merchantReadiness: passport.merchant.readiness?.score ?? null,
    media: passport.media.state,
    clicks: passport.signals.clicks,
    history: [...history, { at: now, score: passport.score.score, clicks: passport.signals.clicks }].slice(-HISTORY_CAP),
  };
  try {
    await kvSet(KEYS.passport(passport.productId), snapshot);
    return { written: true };
  } catch (e) {
    return { written: false, error: String(e?.message || e) };
  }
}

/** LAW 12 — learning from real deltas only; no deltas → says so. */
function learn(before, after, data) {
  const out = [];
  for (const p of after) {
    const prev = data.perProduct.get(p.productId)?.passport || null;
    const b = before.find((x) => x.productId === p.productId);
    if (b && p.score.score !== b.score.score) {
      out.push({ productId: p.productId, he: `ציון הגילוי של "${p.title}" עלה מ-${b.score.score} ל-${p.score.score} בעקבות הפעולות של הריצה`, source: "score_delta" });
    }
    if (prev && Number.isFinite(prev.clicks) && p.signals.clicks > prev.clicks) {
      const d = p.signals.clicks - prev.clicks;
      out.push({ productId: p.productId, he: `${heCount(d, "קליק אמיתי חדש", "קליקים אמיתיים חדשים")} על "${p.title}" מאז הבדיקה הקודמת`, source: "click_delta" });
    }
  }
  if (!out.length) out.push({ productId: null, he: "אין עדיין נתוני תוצאה חדשים ללמוד מהם — לונה לא מסיקה בלי ראיות", source: "none" });
  return out;
}

async function appendCapped(kvGet, kvSet, key, entries, cap) {
  if (!entries.length) return { written: false };
  try {
    const cur = arr(await read(kvGet, key, []));
    await kvSet(key, [...cur, ...entries].slice(-cap));
    return { written: true };
  } catch (e) {
    return { written: false, error: String(e?.message || e) };
  }
}

/** Execute + verify one native internal step. */
async function executeStep({ capability, product, passport, data, channels, origin, now, kvGet, kvSet }) {
  if (capability === "create_share_asset") {
    const stored = data.perProduct.get(String(product.id))?.assets || null;
    const r = await persistAssets({ kvSet, product, data, channels, origin, now, stored });
    if (r.status === "failed") throw new Error(r.error || "asset_write_failed");
    if (r.status === "blocked") return { status: "blocked", result: r.reason };
    data.perProduct.get(String(product.id)).assets = r.assets;
    // Verification: read back what was written and compare fingerprints.
    const back = await read(kvGet, KEYS.assets(product.id), null);
    const ok = Boolean(back && back.fingerprint === r.assets.fingerprint && back.share);
    return {
      status: ok ? (r.status === OPPORTUNITY_STATUS.EXECUTED ? "executed" : "up_to_date") : "failed",
      result: r.reason,
      proof: ok
        ? evidence({ state: TRUTH.VERIFIED, source: KEYS.assets(product.id), evidence: `נקרא חזרה עם טביעת האצבע ${back.fingerprint}`, verifiedAt: now })
        : evidence({ state: TRUTH.UNVERIFIED, source: KEYS.assets(product.id), evidence: "הקריאה החוזרת לא תאמה את מה שנכתב" }),
    };
  }
  if (capability === "verify_product_seo") {
    const marketer = data.marketers.find((m) => m && m.id === product.marketerId) || null;
    const c = canonicalProduct(product, marketer, origin);
    const audit = auditSeo(c, buildProductSeo(c), { inSitemap: isPublicProduct(product, data.marketers) });
    const failed = audit.checks.filter((x) => !x.ok);
    return {
      status: failed.length ? "blocked" : "up_to_date",
      result: failed.length ? `נשאר לתקן בנתוני המוצר: ${failed.map((x) => x.he).join(", ")}` : "עמוד המוצר מגיש SEO מלא",
      proof: failed.length ? null : evidence({ state: TRUTH.VERIFIED, source: "buildProductSeo (/p/:id)", evidence: `${audit.passed}/${audit.total} בדיקות עברו על ה-SEO המוגש`, verifiedAt: now }),
    };
  }
  if (capability === "agent_commerce_readiness") {
    const marketer = data.marketers.find((m) => m && m.id === product.marketerId) || null;
    const c = canonicalProduct(product, marketer, origin);
    const r = agentCommerceReadiness(c, buildProductSeo(c));
    return {
      status: r.ready ? "up_to_date" : "blocked",
      result: r.ready ? "הנתונים המובנים ב-/p/:id מוכנים למסחר בין סוכנים (הכנה — לא חיבור לפרוטוקול)" : `חסר בנתונים המובנים: ${r.missing.map((x) => x.he).join(", ")}`,
      proof: r.ready ? evidence({ state: TRUTH.VERIFIED, source: "buildProductSeo JSON-LD (/p/:id)", evidence: `${r.passed}/${r.total} בדיקות מוכנות עברו`, verifiedAt: now }) : null,
    };
  }
  if (capability === "request_native_reel") {
    // Queue a render for LikeLink's own reel engine (media-render workflow).
    // Idempotent: one QUEUED request per product. The reel itself is proven
    // later, at ingest (sha256 + anonymous read-back) — not here.
    const key = "media:requests";
    const list = arr(await read(kvGet, key, []));
    const pid = String(product.id);
    const open = list.find((r) => r && r.productId === pid && r.status === "QUEUED");
    if (!open) await kvSet(key, [...list, { productId: pid, style: "", requestedBy: "luna", at: now, status: "QUEUED" }].slice(-200));
    const back = arr(await read(kvGet, key, []));
    const ok = back.some((r) => r && r.productId === pid && r.status === "QUEUED");
    return {
      status: ok ? (open ? "up_to_date" : "executed") : "failed",
      result: ok ? "בקשת Reel בתור — מנוע הרינדור של LikeLink ייצור, יאמת ויפרסם באתר בריצה הבאה" : "הבקשה לא נמצאה בקריאה החוזרת",
      proof: ok
        ? evidence({ state: TRUTH.VERIFIED, source: key, evidence: `בקשת רינדור QUEUED למוצר ${pid} נקראה חזרה (ה-Reel עצמו עדיין לא קיים)`, verifiedAt: now })
        : evidence({ state: TRUTH.UNVERIFIED, source: key, evidence: "הקריאה החוזרת לא מצאה את הבקשה" }),
    };
  }
  throw new Error(`no_executor:${capability}`);
}

/**
 * build_campaign — goal + real product ids → a DRAFT campaign, persisted to
 * a server-only key and VERIFIED by reading it back. Idempotent: the same
 * goal/products/budget/timeline yields the same id and is not rewritten.
 * Never triggers a payment or a send.
 */
export async function createCampaign({ kvGet, kvSet, goal, productIds, scope, entitlement = null, now = Date.now(), origin = ORIGIN, channels = [] }) {
  const products = arr(await read(kvGet, "marketplace:products", []));
  const marketers = arr(await read(kvGet, "marketplace:marketers", []));
  const campaign = buildCampaign({ goal, productIds, products, marketers, ownerIds: scope?.marketerIds || null, entitlement, now, origin });
  if (!campaign.products.length) {
    return { ok: false, error: campaign.unknownProductIds.length ? "product_not_found" : campaign.notOwnedProductIds.length ? "not_owner" : "no_products", campaign };
  }
  campaign.organicChannels = arr(channels).filter((c) => c.connected).map((c) => c.provider);
  campaign.paid = { status: "REQUIRES_APPROVAL", requirement: "קמפיין ממומן מוציא כסף — דורש חשבון מודעות מחובר ואישור בעלים" };
  const scopeKey = scope?.marketerIds?.length === 1 ? scope.marketerIds[0] : "platform";
  const key = KEYS.campaigns(scopeKey);
  const list = arr(await read(kvGet, key, []));
  const existing = list.find((x) => x && x.id === campaign.id);
  if (!existing) await kvSet(key, [...list.filter((x) => x && x.id !== campaign.id), campaign].slice(-CAMPAIGN_CAP));
  const back = arr(await read(kvGet, key, [])).find((x) => x && x.id === campaign.id);
  const ok = Boolean(back && back.fingerprint === campaign.fingerprint);
  return {
    ok,
    status: ok ? (existing ? "up_to_date" : "executed") : "failed",
    campaign: back || campaign,
    proof: ok
      ? evidence({ state: TRUTH.VERIFIED, source: key, evidence: `הטיוטה ${campaign.id} נקראה חזרה עם אותה טביעת אצבע`, verifiedAt: now })
      : evidence({ state: TRUTH.UNVERIFIED, source: key, evidence: "הקריאה החוזרת לא מצאה את הטיוטה" }),
  };
}

export async function listCampaigns({ kvGet, scope }) {
  const scopeKey = scope?.marketerIds?.length === 1 ? scope.marketerIds[0] : "platform";
  return arr(await read(kvGet, KEYS.campaigns(scopeKey), [])).slice().reverse();
}

/** recruit_creator — candidates + Hebrew drafts. Never sends (see campaigns.deliverInvitation). */
export async function recruitForProduct({ kvGet, productId, scope, origin = ORIGIN }) {
  const products = arr(await read(kvGet, "marketplace:products", []));
  const product = products.find((p) => p && String(p.id) === String(productId));
  if (!product) return { ok: false, error: "product_not_found" };
  if (scope?.marketerIds && !scope.marketerIds.includes(String(product.marketerId))) return { ok: false, error: "not_owner" };
  const marketers = arr(await read(kvGet, "marketplace:marketers", []));
  return recruitCreators({ product, marketers, inviterIds: scope?.marketerIds || [], origin });
}

function toItem(n) {
  return { id: n.id, productId: n.productId, productTitle: n.productTitle, kind: n.capability, what: n.capabilityHe, action: n.reason, status: n.status, risk: n.risk, native: n.native, safety: n.status === "approval" || n.status === "owner" ? SAFETY.APPROVAL : n.status === "blocked" ? SAFETY.BLOCKED : SAFETY.SAFE };
}

/**
 * Run a goal for an owner scope.
 * @param scope { marketerIds: string[] | null (null = admin/owner, all products), actor }
 * @param entitlement  canonical entitlement (entitlements.resolveEntitlement)
 */
export async function runIntent({ kvGet, kvSet, goal, productId = null, scope, entitlement = null, env = {}, origin = ORIGIN, now = Date.now(), commandId = null }) {
  const full = await loadDiscoveryData(kvGet, { productIds: [] });
  let owned = full.products;
  if (scope?.marketerIds) owned = owned.filter((p) => scope.marketerIds.includes(String(p.marketerId)));
  if (productId) {
    if (!full.products.some((p) => String(p.id) === String(productId))) return { ok: false, error: "product_not_found" };
    owned = owned.filter((p) => String(p.id) === String(productId));
    if (!owned.length) return { ok: false, error: "not_owner" };
  }
  if (!owned.length) return { ok: false, error: "no_products" };

  const data = await loadDiscoveryData(kvGet, { productIds: owned.map((p) => String(p.id)) });
  const before = computePassports(data, { env, origin, now });
  const intent = compileIntent(goal, { productId, scopeProductIds: owned.map((p) => String(p.id)) });
  const externalConnected = before.channels.some((c) => ["telegram", "webhook"].includes(c.provider) && c.connected);
  const graph = buildActionGraph(intent, before.passports, { externalConnected, entitlement });

  // ── EXECUTE the safe native steps (once per product + capability) ──
  const steps = [];
  const deadLetters = [];
  const seen = new Set();
  const failedCaps = new Map(); // productId → capabilities that failed / were skipped this run
  const runId = stableHash({ goal: intent.goal, productId, at: now, scope: scope?.marketerIds || "all" });
  for (const n of graph.nodes.filter((x) => x.status === "safe")) {
    const key = `${n.productId}:${n.capability}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const cap = CAPABILITIES[n.capability];
    const product = data.scope.find((p) => String(p.id) === n.productId);
    const passport = before.passports.find((p) => p.productId === n.productId);
    const base = { id: key, productId: n.productId, capability: n.capability, kind: n.capability, permission: cap.permission, rollback: cap.rollback, verification: cap.verification };
    // Dependencies: a step runs only when every capability it depends on (same
    // product) is already satisfied or succeeded in this run. Independent
    // steps are never held back by an unrelated failure.
    const unmet = (cap.dependencies || []).filter((d) => {
      if (failedCaps.get(n.productId)?.has(d)) return true;
      const depNode = graph.nodes.find((x) => x.productId === n.productId && x.capability === d);
      return Boolean(depNode && depNode.status !== "done" && depNode.status !== "safe");
    });
    if (unmet.length) {
      const failure = { class: "dependency", retryable: true, selfRepair: "ירוץ בריצה הבאה אחרי שהשלב הקודם יושלם" };
      steps.push({ ...base, status: "skipped", result: `דולג — תלוי בשלב שלא הושלם: ${unmet.map((d) => CAPABILITIES[d]?.he || d).join(", ")}`, failure, next: failure.selfRepair });
      if (!failedCaps.has(n.productId)) failedCaps.set(n.productId, new Set());
      failedCaps.get(n.productId).add(n.capability);
      continue;
    }
    try {
      const r = await withTimeout(executeStep({ capability: n.capability, product, passport, data, channels: before.channels, origin, now, kvGet, kvSet }), STEP_TIMEOUT_MS, n.capability);
      steps.push({ ...base, ...r });
      if (r.status === "failed") {
        if (!failedCaps.has(n.productId)) failedCaps.set(n.productId, new Set());
        failedCaps.get(n.productId).add(n.capability);
      }
    } catch (e) {
      const failure = classifyFailure(e);
      const step = { ...base, status: "failed", result: "הפעולה נכשלה — שום דבר לא סומן כהצלחה", failure, error: String(e?.message || e).slice(0, 160), next: failure.selfRepair || "דורש בדיקה — נרשם לתיקון" };
      steps.push(step);
      deadLetters.push({ runId, at: now, step: key, capability: n.capability, productId: n.productId, failure, error: step.error });
      if (!failedCaps.has(n.productId)) failedCaps.set(n.productId, new Set());
      failedCaps.get(n.productId).add(n.capability);
    }
  }

  // ── Run-scoped capabilities (one per goal, e.g. build_campaign) ──
  let campaignResult = null;
  for (const [capId, cap] of Object.entries(CAPABILITIES)) {
    if (cap.scope !== "run" || typeof cap.trigger !== "function" || !cap.trigger(intent)) continue;
    // Autonomous only when native + internal + session (LAW 06 / 14).
    if (!(cap.native && cap.executor === "internal" && cap.permission === "session")) continue;
    const base = { id: `run:${capId}`, productId: null, capability: capId, kind: capId, permission: cap.permission, rollback: cap.rollback || null, verification: cap.verification };
    try {
      if (capId !== "build_campaign") throw new Error(`no_executor:${capId}`);
      const ids = intent.subject?.ids?.length ? intent.subject.ids : data.scope.map((p) => String(p.id));
      campaignResult = await withTimeout(createCampaign({ kvGet, kvSet, goal: intent.goal, productIds: ids, scope, entitlement, now, origin, channels: before.channels }), STEP_TIMEOUT_MS, capId);
      if (campaignResult.ok) {
        steps.push({ ...base, status: campaignResult.status, result: `טיוטת קמפיין ${campaignResult.campaign.id} (${heCount(campaignResult.campaign.products.length, "מוצר אחד", "מוצרים")})`, proof: campaignResult.proof });
      } else {
        const failure = classifyFailure(new Error(campaignResult.error || "campaign_failed"));
        steps.push({ ...base, status: "failed", result: "בניית הטיוטה נכשלה — שום דבר לא סומן כהצלחה", proof: campaignResult.proof || null, failure, next: failure.selfRepair || "דורש בדיקה" });
      }
    } catch (e) {
      const failure = classifyFailure(e);
      steps.push({ ...base, status: "failed", result: "הפעולה נכשלה — שום דבר לא סומן כהצלחה", failure, error: String(e?.message || e).slice(0, 160), next: failure.selfRepair || "דורש בדיקה — נרשם לתיקון" });
      deadLetters.push({ runId, at: now, step: base.id, capability: capId, productId: null, failure, error: String(e?.message || e).slice(0, 160) });
    }
  }

  const after = computePassports(data, { env, origin, now }).passports;
  const snapshots = await Promise.all(after.map((p) => persistSnapshot({ kvSet, passport: p, previous: data.perProduct.get(p.productId)?.passport || null, now })));
  const learning = learn(before.passports, after, data);
  const { evidenceNote, evidence: evidenceLevel } = prioritize(after, { now });

  // ── NEXT ACTION: the highest-value open node (owner/approval before blocked) ──
  const RANK = { owner: 0, approval: 1, client: 2, entitlement: 3, blocked: 4 };
  const open = graph.nodes.filter((n) => n.status !== "done" && n.status !== "safe").sort((a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9));
  const nextNode = open[0] || null;
  const next = nextNode
    ? { he: `${nextNode.capabilityHe}${nextNode.productTitle ? ` · ${nextNode.productTitle}` : ""} — ${nextNode.reason}`, nodeId: nextNode.id, status: nextNode.status }
    : { he: intent.analyzeOnly ? "הניתוח הושלם — ראי את ההזדמנויות למטה" : "כל המצב הנדרש למטרה הזו מתקיים", nodeId: null };

  // ── RECORD: log (duplicate-safe), memory, run record, dead-letter ──
  const scopeKey = scope?.marketerIds?.length === 1 ? scope.marketerIds[0] : "platform";
  const entryId = stableHash({ goal: intent.goal, productId: productId || null, day: Math.floor(now / DAY_MS), fingerprints: after.map((p) => p.fingerprint).sort() });
  const log = arr(await read(kvGet, KEYS.log(scopeKey), []));
  const duplicate = log.some((e) => e && e.id === entryId);
  let logWrite = { written: false, duplicate };
  if (!duplicate) {
    try {
      await kvSet(KEYS.log(scopeKey), [...log, {
        id: entryId, at: now, goal: intent.goal, command: commandId, productId: productId || null, actor: scope?.actor || null,
        products: after.length, executed: steps.map((x) => ({ productId: x.productId, kind: x.capability, status: x.status })),
        approvals: graph.summary.approval + graph.summary.owner, blocked: graph.summary.blocked,
        avgScore: Math.round(after.reduce((sum, p) => sum + p.score.score, 0) / after.length),
      }].slice(-LOG_CAP));
      logWrite = { written: true, duplicate: false };
    } catch (e) {
      logWrite = { written: false, duplicate: false, error: String(e?.message || e) };
    }
  }
  const memoryEntries = duplicate ? [] : [
    { type: "goal", at: now, runId, text: intent.goal, outcome: intent.desiredOutcome, understood: intent.understood },
    { type: "decision", at: now, runId, text: `${graph.nodes.length} צעדים: ${graph.summary.safe} בטוחים, ${graph.summary.owner + graph.summary.approval} דורשים אדם, ${graph.summary.blocked} חסומים`, evidence: evidenceNote },
    ...steps.filter((x) => x.status !== "failed").map((x) => ({ type: "action", at: now, runId, capability: x.capability, productId: x.productId, text: x.result, proof: x.proof ? { state: x.proof.state, source: x.proof.source, evidence: x.proof.evidence } : null })),
    ...steps.filter((x) => x.status === "failed").map((x) => ({ type: "failure", at: now, runId, capability: x.capability, productId: x.productId, text: x.result, failure: x.failure?.class, next: x.next })),
    ...learning.map((l) => ({ type: "learning", at: now, runId, productId: l.productId, text: l.he, source: l.source })),
    ...open.filter((n) => n.status === "blocked" || n.status === "approval").slice(0, 10).map((n) => ({ type: "constraint", at: now, runId, productId: n.productId, capability: n.capability, text: `${n.capabilityHe}: ${n.reason}` })),
    { type: "next", at: now, runId, text: next.he },
  ];
  const [memoryWrite] = await Promise.all([
    appendCapped(kvGet, kvSet, KEYS.memory(scopeKey), memoryEntries, MEMORY_CAP),
    appendCapped(kvGet, kvSet, KEYS.deadLetter, deadLetters, DEAD_LETTER_CAP),
  ]);
  // A duplicate run (same goal, same data, same day) writes nothing at all.
  if (!duplicate) {
    try {
      await kvSet(KEYS.run(scopeKey), { runId, at: now, goal: intent.goal, steps: steps.map(({ proof, ...s }) => ({ ...s, proofState: proof?.state || null })), summary: graph.summary, next });
    } catch { /* the run record is best-effort; the log + memory above are the audit trail */ }
  }

  const passportsById = Object.fromEntries(after.map((p) => [p.productId, p]));
  const result = {
    ok: true,
    runId,
    command: commandId,
    label: commandId && LUNA_COMMANDS[commandId] ? LUNA_COMMANDS[commandId].he : intent.goal,
    intent,
    graph: { nodes: graph.nodes, edges: graph.edges, summary: graph.summary, native: graph.native, external: graph.external },
    steps,
    executed: steps.map((x) => ({ opportunityId: x.id, productId: x.productId, kind: x.capability, status: x.status, result: x.result, proof: x.proof || null, failure: x.failure || null, next: x.next || null })),
    approvals: graph.nodes.filter((n) => n.status === "approval" || n.status === "owner").map(toItem).slice(0, 20),
    blocked: graph.nodes.filter((n) => n.status === "blocked" || n.status === "entitlement").map(toItem).slice(0, 20),
    suggestions: graph.nodes.filter((n) => n.status === "client").map(toItem).slice(0, 10),
    passports: after,
    assets: Object.fromEntries(after.map((p) => [p.productId, data.perProduct.get(p.productId)?.assets || null])),
    channels: before.channels,
    opportunityGraph: { counts: buildOpportunityGraph(after, before.channels).counts },
    learning,
    next,
    evidence: evidenceLevel,
    evidenceNote,
    entitlement: entitlement ? { plan: entitlement.plan, source: entitlement.source, maxProductsPerRun: entitlement.capabilities?.maxProductsPerRun ?? null } : null,
    log: { entryId, ...logWrite },
    memory: { written: Boolean(memoryWrite?.written), entries: memoryEntries.length },
    deadLetters: deadLetters.length,
    snapshots: { written: snapshots.filter((x) => x.written).length, failed: snapshots.filter((x) => x.error).length },
    campaign: campaignResult?.campaign || null,
  };
  result.laws = auditRun({ ...result, passports: Object.values(passportsById) });
  return result;
}

/** The six named commands are compiled goals, not scripted workflows. */
export async function runCommand({ command, ...rest }) {
  if (!LUNA_COMMANDS[command]) return { ok: false, error: "unknown_command" };
  if (LUNA_COMMANDS[command].requiresProduct && !rest.productId) return { ok: false, error: "product_id_required" };
  return runIntent({ ...rest, goal: COMMAND_GOALS[command], commandId: command });
}

// (build_campaign — campaigns.buildCampaign via createCampaign — replaced the
// earlier in-memory campaign sketch.)

/** LAW 13 — restore the previous share/content version of a product's assets. */
export async function rollbackAssets({ kvGet, kvSet, productId, scope, now = Date.now() }) {
  const products = arr(await read(kvGet, "marketplace:products", []));
  const product = products.find((p) => p && String(p.id) === String(productId));
  if (!product) return { ok: false, error: "product_not_found" };
  if (scope?.marketerIds && !scope.marketerIds.includes(String(product.marketerId))) return { ok: false, error: "not_owner" };
  const cur = await read(kvGet, KEYS.assets(productId), null);
  if (!cur?.previous?.share) return { ok: false, error: "nothing_to_rollback" };
  // pinnedFor: the product data this restore was chosen for — autonomous runs
  // do not overwrite it until the product itself changes.
  const productFp = cur.pinnedFor || cur.fingerprint;
  const restored = { ...cur, share: cur.previous.share, drafts: cur.previous.drafts, fingerprint: cur.previous.fingerprint, generatedAt: cur.previous.generatedAt, restoredAt: now, pinnedFor: cur.previous.fingerprint === productFp ? null : productFp, previous: { fingerprint: cur.fingerprint, generatedAt: cur.generatedAt, share: cur.share, drafts: cur.drafts } };
  try {
    await kvSet(KEYS.assets(productId), restored);
  } catch {
    return { ok: false, error: "rollback_write_failed" };
  }
  const back = await read(kvGet, KEYS.assets(productId), null);
  const ok = Boolean(back && back.fingerprint === restored.fingerprint);
  const scopeKey = scope?.marketerIds?.length === 1 ? scope.marketerIds[0] : "platform";
  await appendCapped(kvGet, kvSet, KEYS.memory(scopeKey), [{ type: "action", at: now, capability: "rollback_assets", productId: String(productId), text: "חבילת השיתוף שוחזרה לגרסה הקודמת", proof: { state: ok ? "VERIFIED" : "UNVERIFIED", source: KEYS.assets(productId) } }], MEMORY_CAP);
  return { ok, restoredFingerprint: restored.fingerprint, proof: ok ? evidence({ state: TRUTH.VERIFIED, source: KEYS.assets(productId), evidence: "נקרא חזרה אחרי השחזור", verifiedAt: now }) : null };
}

/** Structured memory → the five questions Luna must answer with evidence. */
export async function memoryAnswer({ kvGet, scope, depth = 50 }) {
  const scopeKey = scope?.marketerIds?.length === 1 ? scope.marketerIds[0] : "platform";
  const mem = arr(await read(kvGet, KEYS.memory(scopeKey), [])).slice(-depth);
  const lastRun = await read(kvGet, KEYS.run(scopeKey), null);
  const of = (t) => mem.filter((m) => m.type === t);
  return {
    ok: true,
    tried: of("goal").slice(-5).reverse().map((m) => ({ at: m.at, text: m.text, outcome: m.outcome })),
    happened: [...of("action"), ...of("failure")].slice(-10).reverse().map((m) => ({ at: m.at, type: m.type, text: m.text, proof: m.proof?.state || null, failure: m.failure || null })),
    blocked: of("constraint").slice(-8).reverse().map((m) => ({ at: m.at, text: m.text })),
    learned: of("learning").slice(-5).reverse().map((m) => ({ at: m.at, text: m.text, source: m.source })),
    next: lastRun?.next || (of("next").slice(-1)[0] ? { he: of("next").slice(-1)[0].text } : null),
    why: of("decision").slice(-1)[0] ? { text: of("decision").slice(-1)[0].text, evidence: of("decision").slice(-1)[0].evidence } : null,
    entries: mem.length,
  };
}

/** Daily autonomous sweep over every public product (idempotent). */
export async function runSweep({ kvGet, kvSet, env = {}, origin = ORIGIN, now = Date.now() }) {
  const base = await loadDiscoveryData(kvGet, { productIds: [] });
  const publicIds = base.products.filter((p) => isPublicProduct(p, base.marketers)).map((p) => String(p.id));
  const data = await loadDiscoveryData(kvGet, { productIds: publicIds });
  const { channels, merchantEligibleCount } = computePassports(data, { env, origin, now });
  let assetsWritten = 0; let assetsUpToDate = 0; let failures = 0;
  const deadLetters = [];
  for (const product of data.scope) {
    const stored = data.perProduct.get(String(product.id))?.assets || null;
    const r = await persistAssets({ kvSet, product, data, channels, origin, now, stored });
    if (r.status === OPPORTUNITY_STATUS.EXECUTED) assetsWritten += 1;
    else if (r.status === OPPORTUNITY_STATUS.UP_TO_DATE) assetsUpToDate += 1;
    else {
      failures += 1;
      if (r.status === "failed") deadLetters.push({ runId: "sweep", at: now, step: `${product.id}:create_share_asset`, capability: "create_share_asset", productId: String(product.id), failure: classifyFailure(r.error), error: r.error });
    }
    if (r.assets) data.perProduct.get(String(product.id)).assets = r.assets;
  }
  const after = computePassports(data, { env, origin, now }).passports;
  const snaps = await Promise.all(after.map((p) => persistSnapshot({ kvSet, passport: p, previous: data.perProduct.get(p.productId)?.passport || null, now })));
  await appendCapped(kvGet, kvSet, KEYS.deadLetter, deadLetters, DEAD_LETTER_CAP);
  const ranked = prioritize(after, { now });
  const counts = {};
  for (const p of after) for (const o of p.opportunities) counts[`${o.kind}:${o.status}`] = (counts[`${o.kind}:${o.status}`] || 0) + 1;
  const summary = {
    at: now,
    products: after.length,
    assetsWritten,
    assetsUpToDate,
    failures,
    snapshotsWritten: snaps.filter((s) => s.written).length,
    avgScore: after.length ? Math.round(after.reduce((s, p) => s + p.score.score, 0) / after.length) : 0,
    avgMerchantReadiness: after.length ? Math.round(after.reduce((s, p) => s + (p.merchant.readiness?.score || 0), 0) / after.length) : 0,
    merchantEligible: merchantEligibleCount,
    evidence: ranked.evidence,
    opportunityCounts: counts,
    topOpportunities: ranked.ranked.slice(0, 5).map((o) => ({ id: o.id, what: o.what, safety: o.safety, priority: o.priority })),
  };
  try {
    await kvSet(KEYS.sweep, summary);
  } catch (e) {
    summary.summaryWriteError = String(e?.message || e);
  }
  return { ok: failures === 0, ...summary };
}

/** Read-only public passport for an approved, attributed product. */
export async function publicPassport({ kvGet, productId, env = {}, origin = ORIGIN, now = Date.now() }) {
  const base = await loadDiscoveryData(kvGet, { productIds: [] });
  const product = base.products.find((p) => String(p.id) === String(productId));
  if (!product || !isPublicProduct(product, base.marketers)) return { ok: false, error: "product_not_found" };
  const data = await loadDiscoveryData(kvGet, { productIds: [String(product.id)] });
  const { passports, channels } = computePassports(data, { env, origin, now });
  const p = passports[0];
  return {
    ok: true,
    passport: {
      productId: p.productId,
      title: p.title,
      generatedAt: p.generatedAt,
      score: p.score,
      surfaces: p.surfaces,
      seo: p.seo,
      merchant: { eligible: p.merchant.eligible, reasons: p.merchant.reasons, readiness: p.merchant.readiness },
      media: { state: p.media.state, synthetic: p.media.synthetic },
      tracking: { clicks: p.tracking.clicks, attached: Boolean(p.tracking.link) },
      publications: { total: p.signals.publications, verified: p.signals.verifiedPublications, unverified: p.signals.unverifiedPublished },
      opportunities: p.opportunities.map((o) => ({ id: o.id, kind: o.kind, what: o.what, status: o.status, safety: o.safety })),
      previousScore: p.previousScore ?? null,
      // Public-safe commerce route: how the sale happens + the disclosure. No
      // click/conversion counts (those are the owner's).
      commerce: { model: p.commerce.model, merchant: p.commerce.merchant, canonicalPage: p.commerce.canonicalPage, disclosure: p.commerce.disclosure, availability: p.commerce.availability, price: p.commerce.price },
      connections: { sameCreator: p.connections.sameCreator.length, sameCategory: p.connections.sameCategory.length, collections: p.connections.collections.length },
    },
    channels: channels.map((c) => ({ provider: c.provider, label: c.label, state: c.state })),
  };
}

export { SAFETY, OPPORTUNITY_STATUS };
