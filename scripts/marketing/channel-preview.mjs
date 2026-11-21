// 📣 The channels' preview from a real radar run (src/lib/growth/channelEngine.js): what Telegram and
// Instagram would post, from the board this run just measured, with every candidate checked at the
// store (productdetail.get: Hebrew title, ILS price, satisfaction bucket, photos), each photo fetched
// (1 KB) and, when the open lens model loads, compared with the kind it claims to be (MobileCLIP-S0,
// public/lens/labels.json). Then several consecutive posts are simulated against an in-memory history
// (3 hours apart, the owner's autopilot interval), plus two runs racing for the same slot.
// NOTHING is sent: no Telegram, no Instagram, no write to the cloud. Writes <dir>/channel-preview.json
// and channel-preview.md (uploaded by trend-radar.yml next to the board).
//   node scripts/marketing/channel-preview.mjs <state dir>
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { sanitizeBoard } from "../../src/lib/growth/radarBoard.js";
import { ENGINE, claimOf, instagramPackage, planChannels, rankCandidates, candidatesFrom, selectNext, telegramPost, whatsappPost, withClaim } from "../../src/lib/growth/channelEngine.js";
import { aliexpressItemFacts, aliexpressShortLink } from "../../api/_utils/aliexpressAffiliate.mjs";
import { CLOUD } from "../../src/constants/cloud.js";
import { PRODUCTION_ORIGIN } from "../../src/constants/domain.js";
import { LENS, rankKinds } from "../../src/lib/growth/lens.js";

const readJson = (f, d) => { try { return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : d; } catch { return d; } };

async function anonKv(key, { env = process.env, fetchImpl = fetch } = {}) {
  const url = CLOUD?.url || env.VITE_SUPABASE_URL;
  const anon = CLOUD?.anonKey || env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  try {
    const res = await fetchImpl(`${url}/rest/v1/kv?select=value&key=eq.${encodeURIComponent(key)}`, { headers: { apikey: anon, Authorization: `Bearer ${anon}` }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const v = (await res.json())?.[0]?.value;
    return typeof v === "string" ? JSON.parse(v) : v ?? null;
  } catch { return null; }
}

/** A photo answers as an image (1 KB range only: never a whole file). */
async function photoAnswers(src, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(src, { headers: { range: "bytes=0-1023" }, signal: AbortSignal.timeout(12_000) });
    return (res.status === 200 || res.status === 206) && /^image\//.test(res.headers.get("content-type") || "");
  } catch { return false; }
}

/**
 * The lens's answer for a claimed kind: MATCH when the kind is the model's first answer, or in its top
 * three with at least 15% of its belief; CATEGORY_ONLY when the first answer is only a shop category
 * (the photo shows the area, the model has no word for the exact kind); MISMATCH otherwise (21.11's run:
 * a car seat gap filler read "category-car 100%" with its own kind at 0%, which counted as a match).
 */
export function visualVerdict(kinds = [], kindId = "") {
  if (!kindId) return { verdict: "NO_KIND", rank: null };
  const at = kinds.findIndex((k) => k.id === kindId);
  if (at === 0 || (at > 0 && kinds[at].p >= 0.15)) return { verdict: "MATCH", rank: at + 1 };
  if (String(kinds[0]?.id || "").startsWith("category-")) return { verdict: "CATEGORY_ONLY", rank: at >= 0 ? at + 1 : null };
  return { verdict: "MISMATCH", rank: at >= 0 ? at + 1 : null };
}

/** The lens (MobileCLIP-S0) on this runner: does the photo look like the kind the candidate claims? */
async function visionChecker() {
  if (process.env.CHANNEL_VISION === "0") return null;
  try {
    const labels = JSON.parse(readFileSync("public/lens/labels.json", "utf8")).labels || [];
    const { AutoProcessor, CLIPVisionModelWithProjection, RawImage, env } = await import("@huggingface/transformers");
    env.allowLocalModels = false;
    const processor = await AutoProcessor.from_pretrained(LENS.model);
    const vision = await CLIPVisionModelWithProjection.from_pretrained(LENS.model, { dtype: LENS.visionDtype });
    return async (src, kindId) => {
      const image = await RawImage.read(src);
      const { image_embeds } = await vision(await processor(image));
      const r = rankKinds(image_embeds.normalize().tolist()[0], labels, { top: 3 });
      return { ...visualVerdict(r.kinds, kindId), top: r.kinds.map((k) => `${k.id} ${Math.round(k.p * 100)}%`) };
    };
  } catch (e) {
    console.log(`vision: not run (${String(e?.message || e).slice(0, 100)})`);
    return null;
  }
}

export async function preview(dir, { env = process.env, fetchImpl = fetch, now = Date.now(), verifyTop = 10, cycles = 8, gapHours = 3 } = {}) {
  const raw = readJson(join(dir, "board.json"), null);
  // The lens checks every pool listing's photo against its kind, and the verdict goes into the run's
  // board, so the server's engine (which runs no model) rejects a photo of another kind too.
  const look = raw?.pool?.list?.length ? await visionChecker() : null;
  let annotated = 0;
  if (look) {
    for (const r of raw.pool.list.slice(0, 40)) {
      if (!r?.image || !r?.kind) continue;
      try { const v = await look(r.image, r.kind); r.visual = v.verdict; annotated++; } catch { /* unread stays unchecked */ }
    }
    if (annotated) writeFileSync(join(dir, "board.json"), JSON.stringify(raw));
  }
  const board = sanitizeBoard(raw);
  const out = { engine: ENGINE.version, at: new Date(now).toISOString(), boardAt: board?.at || null, sent: "NOTHING (preview only)", sources: {}, checks: [], cycles: [], race: null };
  if (!board) { out.error = "no_board"; return out; }
  const catalog = await anonKv("marketplace:products", { env, fetchImpl });
  out.sources.catalog = Array.isArray(catalog) ? `read ${catalog.length} products (anon, the browser's own read)` : "FAILED";
  const products = (Array.isArray(catalog) ? catalog : []).filter((p) => p.marketerId === (env.MARKETPLACE_SINGLE_OWNER_ID || "msd6go4kff49s5"));
  const cands = candidatesFrom(board, products, { now, siteOrigin: PRODUCTION_ORIGIN });
  out.sources.board = { pool: board.pool?.list?.length ?? 0, siteHot: board.site?.hot?.length ?? 0, fresh: board.fresh?.risers?.length ?? 0, candidates: cands.length };
  // Check the strongest at the store, their photos, and (when it loads) what the photo shows.
  const first = rankCandidates(cands, { now });
  out.sources.vision = look ? `MobileCLIP-S0 (${LENS.model}) on this runner · ${annotated} pool photos checked` : "NOT_RUN";
  const checked = new Map();
  for (const c of first.ranked.slice(0, verifyTop)) {
    const facts = c.itemId ? await aliexpressItemFacts(c.itemId, { env, fetchImpl, now }).catch((e) => ({ error: String(e?.message || e).slice(0, 80) })) : null;
    const photo = c.image ? await photoAnswers(c.image, fetchImpl) : false;
    let visual = null;
    if (c.source === "radar_listing") visual = c.match?.visual ? { verdict: c.match.visual } : null;
    else if (look && c.image && c.trend?.conceptId) { try { visual = await look(c.image, c.trend.conceptId); } catch (e) { visual = { verdict: "ERROR", error: String(e?.message || e).slice(0, 80) }; } }
    const short = c.linkKind === "store" ? await aliexpressShortLink(c.itemId, { env, fetchImpl, now }).catch(() => null) : null;
    checked.set(c.itemId, { facts, photo, visual, short });
    out.checks.push({ itemId: c.itemId, title: String(c.title || "").slice(0, 80), store: facts && !facts.error ? { titleHe: facts.title, price: facts.price, orders: facts.orders, sat: facts.sat, video: facts.video, at: facts.checkedAt } : facts || "no_item_id", photoAnswers: photo, visual, shortLink: short });
  }
  // Re-rank with what the checks found: a failed store check, a dead photo or a photo of another kind is out.
  const verified = cands.map((c) => {
    const k = checked.get(c.itemId);
    if (!k) return c;
    const facts = k.facts && !k.facts.error ? k.facts : null;
    return {
      ...c,
      verified: facts,
      image: facts?.image || c.image,
      quality: { ...c.quality, sat: facts?.sat || c.quality?.sat || null },
      price: facts?.price > 0 ? { value: facts.price, currency: "ILS", checkedAt: facts.checkedAt, source: "aliexpress_api" } : c.price,
      match: { ...c.match, visual: k.visual?.verdict === "MATCH" || k.visual?.verdict === "MISMATCH" ? k.visual.verdict : c.match?.visual || null },
      ...(k.photo ? {} : { image: null }),
      link: k.short || c.link,
    };
  });
  const verifiedIds = new Set([...checked.entries()].filter(([, k]) => k.facts && !k.facts.error && k.photo).map(([id]) => id));
  const pool = verified.filter((c) => verifiedIds.has(c.itemId));
  // Consecutive posts, 3 hours apart (the owner's autopilot interval), against one shared history.
  let history = [];
  for (let i = 0; i < cycles; i++) {
    const t = now + i * gapHours * 3_600_000;
    const { ranked } = rankCandidates(pool, { now: t });
    const sel = selectNext(ranked, history, { channel: "telegram", now: t });
    if (!sel.pick) { out.cycles.push({ run: i + 1, at: new Date(t).toISOString(), post: null, reason: sel.reason, skipped: sel.skipped.slice(0, 8) }); continue; }
    const post = telegramPost(sel.pick);
    const whatsapp = whatsappPost(sel.pick);
    out.cycles.push({ run: i + 1, at: new Date(t).toISOString(), itemId: sel.pick.itemId, productId: sel.pick.productId, trend: sel.pick.trend.key, source: sel.pick.source, heat: sel.pick.heat, buy: sel.pick.buy, confidence: sel.pick.confidence, opportunity: sel.pick.opportunity, alsoListedAs: sel.pick.alsoListedAs, post, whatsapp: { state: whatsapp.state, text: whatsapp.text }, instagram: i === 0 ? instagramPackage(sel.pick) : undefined });
    history = [{ ...claimOf(sel.pick, { now: t }), state: "SENT", providerId: `preview-${i + 1}` }, ...history];
  }
  // Two runs racing for the same slot (the 79-second repeat of 20.11): only the first claim is taken.
  const top = rankCandidates(pool, { now }).ranked[0];
  if (top) {
    const a = withClaim([], claimOf(top, { now, runId: "a" }), { now });
    const b = withClaim(a, claimOf(top, { now: now + 79_000, runId: "b" }), { now: now + 79_000 });
    out.race = { first: a ? "CLAIMED" : "REFUSED", second: b ? "CLAIMED" : "REFUSED (slot taken)" };
  }
  const plan = planChannels(board, products, {}, { now, siteOrigin: PRODUCTION_ORIGIN });
  out.ranking = plan.ranked.slice(0, 20).map((c) => ({ rank: c.rank, source: c.source, itemId: c.itemId, title: String(c.title || "").slice(0, 70), trend: c.trend.key, label: c.match.label, heat: c.heat.score, buy: c.buy.score, confidence: c.confidence, opportunity: c.opportunity, weekPct: c.evidence.weekPct, orders: `${c.evidence.before}→${c.evidence.after} (${c.evidence.from}→${c.evidence.to})`, israel: c.israel?.state || null, sellers: c.sellers?.compared ?? null }));
  out.rejected = plan.rejected.map((r) => ({ itemId: r.itemId, title: r.title, reason: r.reason, trend: r.trend, weekPct: r.weekPct }));
  const posted = out.cycles.filter((c) => c.post);
  out.summary = {
    candidates: cands.length, ranked: plan.ranked.length, rejected: plan.rejected.length, checkedAtStore: out.checks.length, passedStoreAndPhoto: verifiedIds.size,
    posts: posted.length, distinctProducts: new Set(posted.map((c) => c.itemId)).size, distinctTrends: new Set(posted.map((c) => c.trend)).size,
    quietRuns: out.cycles.length - posted.length,
  };
  return out;
}

function markdown(p) {
  const L = [`# תצוגה מקדימה: מה הערוצים היו מפרסמים (${p.at.slice(0, 16)} UTC)`, "", `לוח הרדאר: ${p.boardAt} · לא נשלח כלום.`, ""];
  L.push(`מועמדים: ${p.summary?.candidates} · חזקים: ${p.summary?.ranked} · נפסלו: ${p.summary?.rejected} · נבדקו בחנות: ${p.summary?.checkedAtStore} · עברו חנות ותמונה: ${p.summary?.passedStoreAndPhoto}`, "");
  L.push(`הרצות ברצף: ${p.cycles.length} · פוסטים: ${p.summary?.posts} · מוצרים שונים: ${p.summary?.distinctProducts} · טרנדים שונים: ${p.summary?.distinctTrends}`, "");
  for (const c of p.cycles) {
    L.push(`## הרצה ${c.run} · ${c.at.slice(0, 16)}`);
    if (!c.post) { L.push(`שקט: ${c.reason}`, ""); continue; }
    L.push("```", c.post.text, "```", `תמונה: ${c.post.image}`, "");
  }
  L.push("## נפסלו", ...p.rejected.map((r) => `- ${r.itemId || "-"} ${r.title}: ${r.reason}`));
  return L.join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const dir = process.argv[2] || "radar-state";
  const p = await preview(dir);
  writeFileSync(join(dir, "channel-preview.json"), JSON.stringify(p, null, 1));
  writeFileSync(join(dir, "channel-preview.md"), markdown(p));
  console.log(`channel preview: ${JSON.stringify(p.summary)} · sources ${JSON.stringify(p.sources)} · race ${JSON.stringify(p.race)}`);
  for (const c of p.cycles) console.log(`run ${c.run}: ${c.post ? `${c.itemId} ${c.trend} heat ${c.heat.score} buy ${c.buy.score}` : `quiet (${c.reason})`}`);
}
