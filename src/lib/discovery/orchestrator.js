// Discovery orchestrator — runs the engine against real data (kv injected).
//
// Used by the API (/api/store?mode=discovery) and by the autonomous daily
// sweep job. Guarantees:
//   • idempotent: assets are rewritten only when the product's fingerprint
//     changed; passport snapshots at most once per ~20h unless the score moved
//   • duplicate-safe: the same command on the same unchanged data the same day
//     is recorded once in the action log
//   • fail-closed: a failed kv read blocks the write of that key (kvReadGuard
//     in the injected kvSet); a failed write is reported, never hidden
//   • truthful: only SAFE internal actions execute; approvals / blocked items
//     are returned with the exact owner requirement, never performed
import {
  buildPassport, buildChannelRegistry, planCommand, buildProductAssets, buildOpportunityGraph,
  prioritize, LUNA_COMMANDS, OPPORTUNITY_STATUS, SAFETY,
} from "./engine.js";
import { merchantStatus, stableHash, isPublicProduct, ORIGIN } from "./surfaces.js";

export const KEYS = Object.freeze({
  assets: (id) => `discovery:assets:${id}`,
  passport: (id) => `discovery:passport:${id}`,
  log: (scope) => `discovery:log:${scope}`,
  sweep: "discovery:sweep:last",
});

const SNAPSHOT_MIN_MS = 20 * 60 * 60 * 1000;
const LOG_CAP = 50;
const HISTORY_CAP = 30;
const DAY_MS = 86400000;

const arr = (v) => (Array.isArray(v) ? v : []);

async function read(kvGet, key, fallback) {
  const v = await kvGet(key, fallback);
  return v == null ? fallback : v;
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
  const [products, marketers, clicks, sales, collections, publications] = await Promise.all([
    read(kvGet, "marketplace:products", []),
    read(kvGet, "marketplace:marketers", []),
    read(kvGet, "marketplace:clicks", []),
    read(kvGet, "marketplace:sales", []),
    read(kvGet, "marketplace:collections", []),
    read(kvGet, "publish:log", []),
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

/** Persist assets only when the product changed (fingerprint). */
async function persistAssets({ kvSet, product, data, channels, origin, now, stored }) {
  const assets = buildProductAssets(product, data.marketers, channels, origin, now);
  if (!assets.share) return { status: "blocked", reason: "למוצר חסרה כותרת — אין ממה לבנות חבילת שיתוף" };
  if (stored && stored.fingerprint === assets.fingerprint && stored.share) {
    return { status: OPPORTUNITY_STATUS.UP_TO_DATE, reason: "חבילת השיתוף כבר מעודכנת לנתוני המוצר", assets: stored };
  }
  try {
    await kvSet(KEYS.assets(product.id), assets);
    return { status: OPPORTUNITY_STATUS.EXECUTED, reason: stored ? "חבילת השיתוף עודכנה לנתוני המוצר החדשים" : "נוצרה חבילת שיתוף עם לינק מעקב", assets };
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

function nextAction(plan) {
  const top = plan.approvals[0] || plan.blocked.find((b) => b.channel !== "telegram" && b.channel !== "webhook") || plan.blocked[0] || plan.suggestions[0];
  if (!top) return { he: "אין פעולה פתוחה — כל משטחי הגילוי הזמינים מוכנים", opportunityId: null };
  return { he: `${top.what} — ${top.action}`, opportunityId: top.id, safety: top.safety };
}

/**
 * Run a Luna command for an owner scope.
 * @param scope { marketerIds: string[] | null (null = admin, all products), actor }
 */
export async function runCommand({ kvGet, kvSet, command, productId = null, scope, env = {}, origin = ORIGIN, now = Date.now() }) {
  const def = LUNA_COMMANDS[command];
  if (!def) return { ok: false, error: "unknown_command" };
  if (def.requiresProduct && !productId) return { ok: false, error: "product_id_required" };

  const full = await loadDiscoveryData(kvGet);
  let owned = full.products;
  if (scope?.marketerIds) owned = owned.filter((p) => scope.marketerIds.includes(String(p.marketerId)));
  if (productId) {
    if (!full.products.some((p) => String(p.id) === String(productId))) return { ok: false, error: "product_not_found" };
    owned = owned.filter((p) => String(p.id) === String(productId));
    if (!owned.length) return { ok: false, error: "not_owner" };
  }
  if (!owned.length) return { ok: false, error: "no_products" };

  const data = await loadDiscoveryData(kvGet, { productIds: owned.map((p) => String(p.id)) });
  const { passports, channels } = computePassports(data, { env, origin, now });
  const plan = planCommand(command, passports, { now });

  // ── SAFE execution (internal, additive, own namespace only) ──
  const executed = [];
  const byProduct = new Map();
  for (const o of plan.execute) {
    if (!byProduct.has(o.productId)) byProduct.set(o.productId, []);
    byProduct.get(o.productId).push(o);
  }
  for (const [pid, opps] of byProduct) {
    const product = data.scope.find((p) => String(p.id) === pid);
    const stored = data.perProduct.get(pid)?.assets || null;
    const needsAssets = opps.some((o) => o.kind === "share_asset" || o.kind === "content_drafts");
    let assetResult = null;
    if (needsAssets) {
      assetResult = await persistAssets({ kvSet, product, data, channels, origin, now, stored });
      data.perProduct.get(pid).assets = assetResult.assets || stored;
    }
    for (const o of opps) {
      if (o.kind === "seo") {
        const failed = passports.find((p) => p.productId === pid)?.seo.audit.checks.filter((c) => !c.ok) || [];
        executed.push({
          opportunityId: o.id, productId: pid, kind: o.kind,
          status: failed.length ? OPPORTUNITY_STATUS.BLOCKED : OPPORTUNITY_STATUS.UP_TO_DATE,
          result: failed.length
            ? `עמוד המוצר נבנה מנתוני המוצר; נשאר לתקן בנתונים: ${failed.map((c) => c.he).join(", ")}`
            : "עמוד המוצר מוגש עם כותרת, תיאור, נתונים מובנים ו-Open Graph תקינים",
        });
      } else {
        executed.push({ opportunityId: o.id, productId: pid, kind: o.kind, status: assetResult.status, result: assetResult.reason, error: assetResult.error });
      }
    }
  }

  // Recompute after execution so the returned passports reflect real state.
  const after = computePassports(data, { env, origin, now }).passports;
  const snapshots = await Promise.all(after.map((p) => persistSnapshot({
    kvSet, passport: p, previous: data.perProduct.get(p.productId)?.passport || null, now,
  })));

  // ── Action log (duplicate-safe per command + data + day) ──
  const scopeKey = scope?.marketerIds?.length === 1 ? scope.marketerIds[0] : "platform";
  const entryId = stableHash({
    command, productId: productId || null, day: Math.floor(now / DAY_MS),
    fingerprints: after.map((p) => p.fingerprint).sort(),
  });
  const log = arr(await read(kvGet, KEYS.log(scopeKey), []));
  const duplicate = log.some((e) => e && e.id === entryId);
  const entry = {
    id: entryId,
    at: now,
    command,
    productId: productId || null,
    actor: scope?.actor || null,
    products: after.length,
    executed: executed.map((x) => ({ productId: x.productId, kind: x.kind, status: x.status })),
    approvals: plan.approvals.length,
    blocked: plan.blocked.length,
    avgScore: Math.round(after.reduce((s, p) => s + p.score.score, 0) / after.length),
  };
  let logWrite = { written: false, duplicate };
  if (!duplicate) {
    try {
      await kvSet(KEYS.log(scopeKey), [...log, entry].slice(-LOG_CAP));
      logWrite = { written: true, duplicate: false };
    } catch (e) {
      logWrite = { written: false, duplicate: false, error: String(e?.message || e) };
    }
  }

  const graph = buildOpportunityGraph(after, channels);
  return {
    ok: true,
    command,
    label: def.he,
    evidence: plan.evidence,
    evidenceNote: plan.evidenceNote,
    executed,
    approvals: plan.approvals.slice(0, 20),
    blocked: plan.blocked.slice(0, 20),
    suggestions: plan.suggestions.slice(0, 10),
    passports: after,
    assets: Object.fromEntries(after.map((p) => [p.productId, data.perProduct.get(p.productId)?.assets || null])),
    channels,
    graph: { counts: graph.counts },
    next: nextAction(plan),
    log: { entryId, ...logWrite },
    snapshots: { written: snapshots.filter((s) => s.written).length, failed: snapshots.filter((s) => s.error).length },
    campaign: plan.campaign ? buildCampaignDraft(after, data, channels) : null,
  };
}

/** A campaign DRAFT: creative + share + channels. Paid spend is never automatic. */
function buildCampaignDraft(passports, data, channels) {
  const top = passports.slice().sort((a, b) => b.score.score - a.score.score)[0];
  if (!top) return null;
  const assets = data.perProduct.get(top.productId)?.assets || null;
  return {
    status: "DRAFT",
    productId: top.productId,
    title: top.title,
    creative: assets?.drafts?.he || null,
    shareUrl: assets?.share?.url || null,
    organicChannels: channels.filter((c) => c.connected).map((c) => c.provider),
    paid: { status: "REQUIRES_APPROVAL", requirement: "קמפיין ממומן מוציא כסף — דורש חשבון מודעות מחובר ואישור בעלים" },
  };
}

/** Daily autonomous sweep over every public product (idempotent). */
export async function runSweep({ kvGet, kvSet, env = {}, origin = ORIGIN, now = Date.now() }) {
  const base = await loadDiscoveryData(kvGet);
  const publicIds = base.products.filter((p) => isPublicProduct(p, base.marketers)).map((p) => String(p.id));
  const data = await loadDiscoveryData(kvGet, { productIds: publicIds });
  const { passports, channels, merchantEligibleCount } = computePassports(data, { env, origin, now });
  let assetsWritten = 0; let assetsUpToDate = 0; let failures = 0;
  for (const product of data.scope) {
    const stored = data.perProduct.get(String(product.id))?.assets || null;
    const r = await persistAssets({ kvSet, product, data, channels, origin, now, stored });
    if (r.status === OPPORTUNITY_STATUS.EXECUTED) assetsWritten += 1;
    else if (r.status === OPPORTUNITY_STATUS.UP_TO_DATE) assetsUpToDate += 1;
    else failures += 1;
    if (r.assets) data.perProduct.get(String(product.id)).assets = r.assets;
  }
  const after = computePassports(data, { env, origin, now }).passports;
  const snaps = await Promise.all(after.map((p) => persistSnapshot({ kvSet, passport: p, previous: data.perProduct.get(p.productId)?.passport || null, now })));
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
  const base = await loadDiscoveryData(kvGet);
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
      merchant: { eligible: p.merchant.eligible, reasons: p.merchant.reasons },
      media: { state: p.media.state, synthetic: p.media.synthetic },
      tracking: { clicks: p.tracking.clicks, attached: Boolean(p.tracking.link) },
      opportunities: p.opportunities.map((o) => ({ id: o.id, kind: o.kind, what: o.what, status: o.status, safety: o.safety })),
      previousScore: p.previousScore ?? null,
    },
    channels: channels.map((c) => ({ provider: c.provider, label: c.label, state: c.state })),
  };
}

export { SAFETY, OPPORTUNITY_STATUS };
