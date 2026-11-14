// The one intelligence object per opportunity that the radar page, the site's catalog check and
// the magic button all read (alpha.js): it joins the radar's board (stages, Israel gap, picks) with
// the item histories (acceleration shield), the site's own events (private signal) and the site's
// own products (catalog verdicts, content briefs). Pure: the collector passes everything in.
import { ACCEL, LIFECYCLE, VERDICTS, accelerationOf, alphaOf, catalogVerdict, explain, kitOf, lifecycleOf, privateSignal } from "./alpha.js";
import { pickMatches } from "./trendRadar.js";
import { itemMomentum } from "./radarOpportunity.js";

const DAY = 86_400_000;

/** The site's own average exit rate (30 days, deduplicated): the prior every product is shrunk toward. */
export function siteExitRate(events = [], { now = Date.now() } = {}) {
  const seen = new Set();
  let views = 0, exits = 0;
  for (const e of Array.isArray(events) ? events : []) {
    if (!e || Number(e.ts) < now - 30 * DAY) continue;
    const key = String(e.id || `${e.productId}|${e.ts}|${e.type || "exit"}`);
    if (seen.has(key)) continue;
    seen.add(key);
    if (e.type === "view") views++; else if (!e.type) exits++;
  }
  return views >= 10 ? exits / views : null;
}

/** Which radar concept a site product belongs to: its item is one of the concept's top items, else its title names it. */
export function conceptOf(product, rows = [], concepts = []) {
  const byItem = rows.find((r) => Array.isArray(r.items) && r.items.includes(product.itemId));
  if (byItem) return byItem;
  const c = concepts.find((k) => !k.auto && pickMatches(product.title, k) === true);
  return c ? rows.find((r) => r.id === c.id) || null : null;
}

const lean = (acc) => (acc ? { cls: acc.cls, he: ACCEL[acc.cls].he, weekPct: acc.weekPct ?? null, earlierWeek: acc.earlierWeek ?? null, recentWeek: acc.recentWeek ?? null, consistency: acc.consistency ?? null, readings: acc.readings, from: acc.from, to: acc.to } : null);

/**
 * Adds the intelligence to every concept row and checks every site product. Returns the enriched
 * board, the catalog audit (every product's verdict with its evidence) and the content briefs
 * (drafts for approval) for the products the policy keeps and the concepts with an open window.
 */
export function enrich(board, { concepts = [], readings = {}, items = {}, facts = {}, siteProducts = [], events = [], hooksFor = () => [], origin = "", now = Date.now() } = {}) {
  const siteRate = siteExitRate(events, { now });
  const rows = (board.concepts || []).map((row) => {
    const series = row.pick?.itemId && (items[row.pick.itemId] || []).length >= 3 ? items[row.pick.itemId] : (readings[row.id] || []).map((r) => [r.d, r.sum]);
    const acc = accelerationOf(series);
    const mapped = siteProducts.filter((p) => conceptOf(p, [row], concepts));
    const priv = privateSignal(events, { productIds: mapped.map((p) => p.id), camp: row.id, now, siteRate });
    const alpha = alphaOf({ acc, gap: row.gap, priv });
    const lifecycle = lifecycleOf(acc, row.gap);
    return {
      ...row,
      accel: { ...lean(acc), basis: row.pick?.itemId && (items[row.pick.itemId] || []).length >= 3 ? "pick" : "concept" },
      lifecycle, lifecycleHe: LIFECYCLE[lifecycle].he,
      alpha,
      explain: explain({ alpha, acc, gap: row.gap, kind: row.kind, price: row.pick?.price, momentumHot: row.pick?.momentum?.state === "HOT" }),
    };
  });

  const audit = [];
  const briefs = [];
  for (const p of siteProducts) {
    const acc = accelerationOf(items[p.itemId] || []);
    const concept = conceptOf(p, rows, concepts);
    const gap = concept?.gap || null;
    const hot = itemMomentum(items[p.itemId] || []).state;
    const priv = privateSignal(events, { productIds: [p.id], now, siteRate });
    const alpha = alphaOf({ acc, gap, priv });
    const v = catalogVerdict(p, { acc, gap, hot, facts: facts[p.itemId] || null });
    const ex = explain({ alpha, acc, gap, kind: p.kind, price: p.price, momentumHot: hot === "HOT" });
    audit.push({ id: p.id, title: String(p.title || "").slice(0, 60), kind: p.kind || "", itemId: p.itemId, status: p.status || "approved", archivedBy: p.archivedBy || null, verdict: v.verdict, verdictHe: VERDICTS[v.verdict].he, reasons: v.reasons, criteria: v.criteria, accel: lean(acc), hot, concept: concept?.id || null, israel: gap ? { state: gap.state, he: gap.he, confidenceHe: gap.confidenceHe || null } : null, lifecycle: lifecycleOf(acc, gap), alpha: { score: alpha.score, confidence: alpha.confidence, coverage: alpha.coverage, verified: alpha.verified, missing: alpha.missing }, why: ex.why, risks: ex.risks });
    if (v.verdict === "KEEP") {
      const k = kitOf(p, { hooks: hooksFor(p), origin, why: ex.why, now });
      if (k) briefs.push({ ...k, alpha: alpha.score, confidence: alpha.confidence, audience: ex.audience, angle: ex.angle });
    }
  }
  const order = { KEEP: 0, HOLD: 1, ARCHIVE_PROPOSED: 2 };
  audit.sort((a, b) => order[a.verdict] - order[b.verdict] || (b.alpha.score ?? -1) - (a.alpha.score ?? -1));
  const counts = audit.reduce((m, r) => ((m[r.verdict] = (m[r.verdict] || 0) + 1), m), {});
  const keep = audit.filter((r) => r.verdict === "KEEP");
  return {
    board: {
      ...board,
      alphaVersion: rows[0]?.alpha?.version || null,
      concepts: rows,
      site: board.site ? { ...board.site, keep: keep.slice(0, 24).map((r) => ({ id: r.id, title: r.title, accel: r.accel, lifecycle: r.lifecycle, alpha: r.alpha.score, confidence: r.alpha.confidence, israel: r.israel })), catalog: counts } : board.site,
    },
    audit: { at: new Date(now).toISOString(), policy: "hot-only (8 criteria; the archive is applied by catalogArchive.js on the server, owner's products only, never deleted)", counts, products: audit },
    briefs: { at: new Date(now).toISOString(), status: "PROMOTION KITS: DRAFTS_FOR_APPROVAL (nothing is posted)", ready: briefs.filter((k) => k.status === "DRAFT_FOR_APPROVAL").length, halted: briefs.filter((k) => k.status === "HALTED").length, briefs },
    // What the server is asked to do (catalogArchive.js decides and refuses what it must).
    decisions: audit.filter((r) => (r.verdict === "ARCHIVE_PROPOSED" && r.status === "approved") || (r.verdict === "KEEP" && r.status === "archived" && r.archivedBy === "radar"))
      .map((r) => ({ id: r.id, action: r.verdict === "KEEP" ? "restore" : "archive", reason: r.reasons[0] || "", evidence: { accel: r.accel?.cls || null, weekPct: r.accel?.weekPct ?? null, israel: r.israel?.state || null, at: new Date(now).toISOString().slice(0, 10) } })),
  };
}
