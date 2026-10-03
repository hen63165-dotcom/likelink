// Publishing orchestrator — ONE place that turns a creative into proven,
// tracked publications:
//
//   1 creative (VideoAsset) → 2 truth + permissions → 3 destinations
//   → 4 publish (adapters.js; the reel ingest and the Instagram step call
//     them) → 5 provider / publication id → 6 verify it really exists
//   → 7 proof → 8 tracking → 9 status → 10 Luna memory
//
// Stages of every creative's proof, each with its own evidence:
//   CREATED → GENERATED → STORED → PUBLISHED → VERIFIED → TRACKED
//
// A publication counts only with an id AND evidence: an internal surface by
// an HTTP read of its public URL (or, for client-rendered pages, the same
// public graph the page renders plus the served page); an external one only
// with the provider's id. Nothing here posts a backlog externally — external
// posting happens where it was approved (reel ingest to the brand channel,
// the Instagram step, owner-approved campaigns) and is recorded here.
//
// Isomorphic: no browser globals; IO (kvGet/kvSet/fetch) is injected.
import { videoAsset, UGC_MODE_LABEL, CREATIVE_CLASS_LABEL } from "../media/videoCapability.js";
import { MEDIA_TRUTH, MEDIA_TRUTH_LABEL } from "../discovery/mediaTruth.js";
import { buildPublicGraph } from "../publicDiscovery.js";
import { canonicalProduct, trackingLink } from "../discovery/surfaces.js";
import { INTERNAL_DESTINATIONS, externalDestinations, DESTINATION_STATUS } from "./adapters.js";
import { PRODUCTION_ORIGIN } from "../../constants/domain.js";
import { buildSocialPack } from "../media/reelPipeline.js";
import { creativeUrl } from "../growth/likeloop.js";

export const PROOF_STAGES = Object.freeze(["CREATED", "GENERATED", "STORED", "PUBLISHED", "VERIFIED", "TRACKED"]);

export const PUB_STATUS = Object.freeze({
  VERIFIED: "VERIFIED",                 // id + evidence read back
  PUBLISHED_UNVERIFIED: "PUBLISHED_UNVERIFIED", // id exists, check not passed (yet)
  NOT_LISTED: "NOT_LISTED",             // the surface does not show this creative
  BLOCKED: "BLOCKED",                   // truth / catalog integrity forbids promotion
  NEEDS_CONNECTION: "NEEDS_CONNECTION", // credential missing
  NO_PUBLISHER: "NO_PUBLISHER",         // credentials exist, no publisher implemented
  NOT_IN_PUBLIC_FEED: "NOT_IN_PUBLIC_FEED", // the feed shows its newest 8 — this post is not among them
  READY: "READY",                       // connected, not published for this creative
  FAILED: "FAILED",
});

/**
 * PREPARED — the exact payload an external destination would receive, built
 * and validated against that destination's rules, but NOT sent. It is never a
 * publication: PUBLISHED needs the provider's id, VERIFIED its read-back.
 */
export function prepareExternal(destination, { v, asset, product, creator, origin = PRODUCTION_ORIGIN }) {
  if (!product) return null;
  const channel = destination.startsWith("instagram") ? "instagram" : /telegram/.test(destination) ? "telegram" : destination.replace(/^creator_|_brand$/g, "");
  const pack = buildSocialPack({ product, creator, style: asset.style || "", origin, hook: v?.creative?.hook || "" });
  const net = pack?.networks?.[channel] || pack?.networks?.facebook;
  const creative = v?.creative?.creativeId ? { creativeId: v.creative.creativeId, hookType: v.creative.hookType, productId: product.id } : null;
  const trackingUrl = creative ? creativeUrl(creative, channel, origin) : net?.link || null;
  // The caption carries the creative's own tracked URL (utm_source = this channel + cid),
  // so a click from the post is attributed to this creative.
  const caption = trackingUrl && net?.link ? String(net.caption || "").split(net.link).join(trackingUrl) : String(net?.caption || "");
  const durationMs = Number(asset.durationMs || v?.durationMs || 0);
  const checks = [
    { id: "video_https", ok: /^https:\/\//.test(String(asset.assetUrl || "")) },
    { id: "disclosure_ad", ok: caption.includes("#פרסומת") },
    { id: "disclosure_animation", ok: channel !== "instagram" || caption.includes("אנימציה ממוחשבת") },
    { id: "tracking_url", ok: Boolean(trackingUrl) },
  ];
  if (channel === "instagram") {
    // Instagram Reels via the Graph API: MP4/H.264, AAC audio, 3–90 s, caption ≤ 2200.
    checks.push({ id: "audio_aac", ok: v?.audio === "aac" }, { id: "duration_3_90s", ok: durationMs >= 3000 && durationMs <= 90000 }, { id: "caption_2200", ok: caption.length > 0 && caption.length <= 2200 });
  }
  const valid = checks.every((c) => c.ok);
  return {
    stage: valid ? "PREPARED" : "INVALID",
    channel,
    payload: channel === "instagram"
      ? { media_type: "REELS", video_url: asset.assetUrl, cover_url: asset.posterUrl || null, caption, share_to_feed: true }
      : { video_url: asset.assetUrl, caption, link: trackingUrl },
    trackingUrl,
    creativeId: creative?.creativeId || null,
    checks,
    sent: false,
  };
}

export const PROOF_KEY = (assetId) => `publish:proof:${assetId}`;
export const POSTS_LEDGER_KEY = "publish:posts:ledger";
const REEL_TYPES = new Set(["native_reel", "studio_reel"]);
export const LEDGER_KEY = "publish:ledger";
export const DEAD_LETTER_KEY = "publish:deadletter";
const MEMORY_KEY = "discovery:memory:platform";
const LEDGER_CAP = 60;
const DEAD_CAP = 100;
const MEMORY_CAP = 200;
const REVERIFY_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const CRAWLER_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

const arr = (v) => (Array.isArray(v) ? v : []);
const LIKELINK_SOURCES = /^likelink_/;

/** Which marketplace:videos records are creatives this orchestrator owns. */
export function isCreative(v) {
  const provider = String(v?.videoProvider || v?.source || "");
  return Boolean(v?.id && v?.videoUrl && v.public !== false && LIKELINK_SOURCES.test(provider));
}

function fingerprint(entry) {
  const pubs = entry.publications.map((p) => `${p.destination}:${p.status}:${p.url || ""}`).join("|");
  return `${entry.assetId}|${entry.assetUrl}|${pubs}`;
}

/**
 * The ledger: every creative with its truth, permissions, publications per
 * destination and tracking — computed from stored data only (no network).
 */
export function buildLedger({ videos = [], products = [], marketers = [], clicks = [], posts = [], log = [], instagram = null, env = {}, autopilotStore = {}, origin = PRODUCTION_ORIGIN } = {}) {
  const graph = buildPublicGraph({ products, marketers, videos, clicks });
  const reelByUrl = new Map(graph.reels.map((r) => [r.url, r]));
  const byId = new Map(arr(products).filter((p) => p?.id).map((p) => [String(p.id), p]));
  const external = externalDestinations(env, autopilotStore);
  const igPosted = arr(instagram?.posted);
  const entries = [];
  for (const v of arr(videos).filter(isCreative)) {
    const product = byId.get(String(v.productTags?.[0]?.productId || "")) || null;
    const asset = videoAsset(v, product);
    const creator = arr(marketers).find((m) => m?.id === (product?.marketerId || v.marketerId)) || null;
    const isPublicProduct = Boolean(product && graph.byId.has(String(product.id)));
    // A listed product hidden only because its link is shared is a catalog-integrity block, not a visibility one.
    const sharedLinkHidden = Boolean(product && !isPublicProduct && graph.sharedLinks?.has(String(product.affiliateUrl || "").trim()));
    const reel = reelByUrl.get(asset.assetUrl) || null;

    // 2. truth + permissions
    const truthOk = asset.truth === MEDIA_TRUTH.SYNTHETIC_ANIMATION ? v.synthetic === true : asset.truth === MEDIA_TRUTH.REAL_VIDEO;
    const blockedReason = !truthOk
      ? "truth_violation"
      : sharedLinkHidden
        ? "catalog_integrity"
        : !isPublicProduct
        ? "product_not_public"
        : !reel
          ? "catalog_integrity" // shared affiliate link or stock image (publicDiscovery reelWorthy)
          : null;

    // 3–5. internal destinations (publication id = surface + asset)
    const slug = creator?.slug || creator?.id || "";
    // The site-feed post written at ingest (brand_pulse:posts, public JSON at mode=brand-pulse).
    const feedPost = arr(posts).find((p) => p?.media?.assetId === asset.assetId) || null;
    const listed = {
      site_feed: Boolean(feedPost),
      media: Boolean(asset.assetUrl),
      product_page: isPublicProduct && String(product.videoUrl || "") === asset.assetUrl,
      reels: Boolean(reel),
      home: Boolean(reel),
      creator_page: Boolean(reel && slug && graph.creatorById.has(reel.creatorId)),
    };
    const publications = INTERNAL_DESTINATIONS.map((d) => {
      const url = d.path(asset, origin, slug);
      const isListed = listed[d.id];
      // Promotion surfaces are blocked by catalog integrity; the media file and
      // the product's own page are reported as they are.
      const promotion = !["media", "product_page"].includes(d.id);
      const status = blockedReason && (promotion || !isListed) && d.id !== "media" ? PUB_STATUS.BLOCKED : isListed ? PUB_STATUS.PUBLISHED_UNVERIFIED : PUB_STATUS.NOT_LISTED;
      return {
        destination: d.id, he: d.he, kind: "internal", codePath: d.codePath,
        publicationId: isListed && status !== PUB_STATUS.BLOCKED ? (d.id === "site_feed" ? feedPost.id : `${d.id}:${asset.assetId}`) : null,
        url: isListed && status !== PUB_STATUS.BLOCKED ? url : null,
        status,
        ...(status === PUB_STATUS.BLOCKED ? { reason: blockedReason } : {}),
        ...(d.id === "product_page" && !isListed && isPublicProduct && product.videoAssetId ? { note: `superseded_by:${product.videoAssetId}` } : {}),
      };
    });
    // External: what was actually done (provider ids), then what is possible.
    const tried = arr(log).filter((e) => e?.contentId === asset.assetId && e.channel && e.channel !== "web");
    const ig = igPosted.find((p) => p?.reelId === asset.assetId) || null;
    // Reels go to platform channels; creator channels carry the creator autopilot's posts.
    for (const d of external.filter((x) => x.scope === "platform")) {
      const logged = d.id === "instagram"
        ? (ig ? { status: ig.verified ? PUB_STATUS.VERIFIED : PUB_STATUS.PUBLISHED_UNVERIFIED, externalId: ig.mediaId, url: ig.permalink || null, at: ig.at } : null)
        : (() => {
          const ch = d.id === "telegram_brand" ? "telegram" : d.id === "webhook_brand" ? "webhook" : d.id.replace(/^creator_/, "");
          const e = tried.find((x) => x.channel === ch && x.externalId);
          return e ? { status: PUB_STATUS.PUBLISHED_UNVERIFIED, externalId: e.externalId, url: e.permalink || null, at: e.publishedAt } : null;
        })();
      const prepared = !logged && !blockedReason ? prepareExternal(d.id, { v, asset, product, creator, origin }) : null;
      publications.push({
        destination: d.id, he: d.he, kind: "external", scope: d.scope, codePath: d.codePath,
        ...(prepared ? { prepared } : {}),
        publicationId: logged?.externalId || null,
        providerId: logged?.externalId || null,
        url: logged?.url || null,
        status: logged ? logged.status : blockedReason ? PUB_STATUS.BLOCKED : d.status === DESTINATION_STATUS.CONNECTED ? PUB_STATUS.READY : d.status === DESTINATION_STATUS.NO_PUBLISHER ? PUB_STATUS.NO_PUBLISHER : PUB_STATUS.NEEDS_CONNECTION,
        requiredCredentials: d.requiredCredentials,
        missing: d.missing,
        ...(logged?.at ? { at: logged.at } : {}),
      });
    }

    // 8. tracking: the tracked link + recorded clicks since the creative existed.
    const canonical = product ? canonicalProduct(product, creator, origin) : null;
    const link = canonical ? trackingLink(canonical, `reel_${asset.style || "clip"}`) : "";
    const since = asset.createdAt || 0;
    const productClicks = arr(clicks).filter((c) => c?.productId === asset.productId && Number(c.ts) >= since);
    const reelClicks = productClicks.filter((c) => c.camp === `v-${asset.assetId}` || c.camp === asset.assetId || c.source === `reel_${asset.style}`);

    const entry = {
      assetId: asset.assetId,
      productId: asset.productId,
      productTitle: product?.title || null,
      marketerId: asset.marketerId,
      creatorSlug: slug || null,
      asset,
      truth: { state: asset.truth, label: MEDIA_TRUTH_LABEL[asset.truth] || null, ugcMode: asset.ugcMode, ugcLabel: UGC_MODE_LABEL[asset.ugcMode], creativeClass: asset.creativeClass, classLabel: CREATIVE_CLASS_LABEL[asset.creativeClass], disclosed: asset.disclosed, ok: truthOk },
      blockedReason,
      feedPostId: feedPost?.id || null,
      publications,
      tracking: { link, clicksSinceCreated: productClicks.length, clicksFromCreative: reelClicks.length },
      assetUrl: asset.assetUrl,
    };
    entry.fingerprint = fingerprint(entry);
    entries.push(entry);
  }
  entries.sort((a, b) => (b.asset.createdAt || 0) - (a.asset.createdAt || 0));
  return { entries, external };
}

/**
 * Every NON-reel publication from the shared log (brand pulse, creator
 * autopilot, price drop / new product, distribution campaigns): one row per
 * content id with each channel's outcome. A site-feed post is verified by its
 * id in the public feed; an external one stands on the provider's id.
 */
export function buildPostLedger({ log = [], feedIds = null, limit = 30 } = {}) {
  const groups = new Map();
  for (const e of arr(log)) {
    if (!e?.contentId || REEL_TYPES.has(e.contentType)) continue;
    if (!groups.has(e.contentId)) groups.set(e.contentId, { contentId: e.contentId, contentType: e.contentType, brandId: e.brandId || "platform", productId: e.productId || null, at: e.publishedAt || null, channels: [] });
    const g = groups.get(e.contentId);
    if (g.channels.some((c) => c.channel === e.channel)) continue; // newest attempt per channel
    let status = e.status;
    let evidence = null;
    if (e.channel === "web" && e.externalId) {
      if (feedIds) {
        const inFeed = feedIds.includes(e.externalId);
        status = inFeed ? PUB_STATUS.VERIFIED : PUB_STATUS.NOT_IN_PUBLIC_FEED;
        evidence = { method: "http", source: "mode=brand-pulse", inPublicFeed: inFeed };
      }
    }
    g.channels.push({ channel: e.channel, status, providerId: e.externalId || null, url: e.permalink || null, error: e.error || null, at: e.publishedAt || null, ...(evidence ? { evidence } : {}) });
  }
  return [...groups.values()].slice(0, limit);
}

async function timed(fetchImpl, url, init = {}) {
  try {
    const res = await fetchImpl(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    const body = init.readBody === false ? "" : await res.text().catch(() => "");
    return { ok: true, status: res.status, type: res.headers.get("content-type") || "", range: res.headers.get("content-range") || "", body };
  } catch (e) {
    return { ok: false, status: 0, error: String(e?.message || e).slice(0, 120), body: "" };
  }
}

const htmlEsc = (s) => String(s).replace(/&/g, "&amp;");

/**
 * 6. Verify every listed internal publication over HTTP (public URLs, no
 * auth) and derive the proof stages. `pages` caches SPA shells per sweep.
 */
export async function verifyEntry(entry, { fetchImpl = globalThis.fetch, now = Date.now(), pages = new Map() } = {}) {
  const at = new Date(now).toISOString();
  const pubs = [];
  for (const p of entry.publications) {
    if (p.kind !== "internal" || p.status !== PUB_STATUS.PUBLISHED_UNVERIFIED || !p.url) { pubs.push(p); continue; }
    let r, ok = false, evidence;
    if (p.destination === "media") {
      r = await timed(fetchImpl, p.url, { headers: { Range: "bytes=0-1023" } });
      ok = (r.status === 206 || r.status === 200) && /^video\//.test(r.type);
      evidence = { method: "http", http: r.status, contentType: r.type, contentRange: r.range || null, error: r.error || null };
    } else if (p.destination === "site_feed") {
      if (!pages.has("feed")) pages.set("feed", await timed(fetchImpl, p.url, {}));
      r = pages.get("feed");
      let ids = [];
      try { ids = arr(JSON.parse(r.body).posts).map((x) => x?.id); } catch { /* not JSON → not verified */ }
      ok = r.status === 200 && ids.includes(p.publicationId);
      evidence = { method: "http", http: r.status, inPublicFeed: ok, feedSize: ids.length, error: r.error || null };
      if (!ok && r.status === 200) { pubs.push({ ...p, status: PUB_STATUS.NOT_IN_PUBLIC_FEED, evidence }); continue; }
    } else if (p.destination === "product_page") {
      r = await timed(fetchImpl, p.url, { headers: { "User-Agent": CRAWLER_UA } });
      ok = r.status === 200 && (r.body.includes(entry.assetUrl) || r.body.includes(htmlEsc(entry.assetUrl)));
      evidence = { method: "http", http: r.status, marker: ok ? "asset_url_in_served_page" : "asset_url_missing", error: r.error || null };
    } else {
      // Client-rendered pages: the served page + the same public graph it renders.
      const key = p.url.split("?")[0];
      if (!pages.has(key)) pages.set(key, await timed(fetchImpl, p.url, {}));
      r = pages.get(key);
      ok = r.status === 200 && /id="root"/.test(r.body);
      evidence = { method: "http+public_graph", http: r.status, listedInGraph: true, error: r.error || null };
    }
    pubs.push({ ...p, status: ok ? PUB_STATUS.VERIFIED : PUB_STATUS.PUBLISHED_UNVERIFIED, verifiedAt: ok ? at : null, evidence, ...(ok ? {} : { lastError: evidence.error || evidence.marker || `http_${evidence.http}` }) });
  }
  const internal = pubs.filter((p) => p.kind === "internal");
  const media = internal.find((p) => p.destination === "media");
  const a = entry.asset;
  const stages = {
    CREATED: { ok: Boolean(a.assetId && a.createdAt), at: a.createdAt ? new Date(a.createdAt).toISOString() : null, evidence: { record: "marketplace:videos", id: a.assetId } },
    GENERATED: { ok: Boolean(a.bytes || a.durationMs || a.provider === "likelink_studio_reel"), evidence: { provider: a.provider, renderer: a.renderer, bytes: a.bytes, sha256: a.sha256, durationMs: a.durationMs, creativePrompt: Boolean(a.creativePrompt) } },
    STORED: { ok: media?.status === PUB_STATUS.VERIFIED, evidence: media?.evidence || null, path: (() => { try { return new URL(a.assetUrl).searchParams.get("path"); } catch { return null; } })() },
    PUBLISHED: { ok: internal.some((p) => p.publicationId), publications: internal.filter((p) => p.publicationId).map((p) => p.publicationId), feedPostId: entry.feedPostId },
    VERIFIED: { ok: internal.some((p) => p.destination !== "media" && p.status === PUB_STATUS.VERIFIED), verified: internal.filter((p) => p.status === PUB_STATUS.VERIFIED).map((p) => p.destination) },
    TRACKED: { ok: Boolean(entry.tracking.link), evidence: entry.tracking },
  };
  // One lifecycle summary that never mixes the four states up:
  //   PREPARED  payload built + validated for an external destination, NOT sent
  //   GENERATED the media file exists (bytes, sha256, renderer)
  //   PUBLISHED a publication id exists (internal surface id / provider post id)
  //   VERIFIED  that publication was read back
  const external = pubs.filter((p) => p.kind === "external");
  const lifecycle = {
    PREPARED: { ok: external.some((p) => p.prepared?.stage === "PREPARED"), destinations: external.filter((p) => p.prepared?.stage === "PREPARED").map((p) => p.destination), sent: false },
    GENERATED: { ok: stages.GENERATED.ok && stages.STORED.ok, evidence: { sha256: a.sha256 || null, bytes: a.bytes || null, storedHttp: media?.evidence?.http || null } },
    PUBLISHED: { internal: stages.PUBLISHED.publications, external: external.filter((p) => p.providerId).map((p) => ({ destination: p.destination, providerId: p.providerId, url: p.url })) },
    VERIFIED: { internal: stages.VERIFIED.verified, external: external.filter((p) => p.status === PUB_STATUS.VERIFIED).map((p) => p.destination) },
  };
  lifecycle.externalState = lifecycle.VERIFIED.external.length ? "VERIFIED" : lifecycle.PUBLISHED.external.length ? "PUBLISHED" : lifecycle.PREPARED.ok ? "PREPARED_NOT_SENT" : "NOT_PREPARED";
  // Blocked = must not be PROMOTED (its own product page may still show it,
  // and that listing is reported as it is).
  const state = entry.blockedReason
    ? "BLOCKED"
    : stages.VERIFIED.ok && stages.STORED.ok
      ? "VERIFIED"
      : stages.PUBLISHED.ok ? "UNVERIFIED" : "READY";
  return { ...entry, publications: pubs, stages, lifecycle, state, checkedAt: at };
}

/** Public projection of a proof (no credential names, no private fields). */
export function publicProof(proof) {
  if (!proof) return null;
  return {
    ...proof,
    publications: arr(proof.publications).map(({ requiredCredentials, missing, codePath, ...p }) => ({ ...p, ...(missing ? { connected: !missing.length } : {}) })),
  };
}

/**
 * The sweep: build → verify (newest first, changed or stale only) → proof
 * → ledger → dead-letter → Luna memory. Idempotent: an unchanged, recently
 * verified creative is not re-checked and writes nothing new.
 */
export async function runPublishingSweep({ kvGet, kvSet, env = {}, fetchImpl = globalThis.fetch, now = Date.now(), origin = PRODUCTION_ORIGIN, limit = 8, budgetMs = 45000 } = {}) {
  const started = Date.now();
  const read = async (k, f) => {
    const v = await kvGet(k, f);
    return v == null ? f : v;
  };
  const [products, marketers, videos] = await Promise.all([read("marketplace:products", null), read("marketplace:marketers", null), read("marketplace:videos", null)]);
  // Fail closed: without the catalog nothing can be proven or written.
  if (!Array.isArray(products) || !Array.isArray(marketers) || !Array.isArray(videos)) return { ok: false, error: "kv_read_failed" };
  const [clicks, posts, log, instagram, autopilotStore, prevLedger] = await Promise.all([
    read("marketplace:clicks", []), read("brand_pulse:posts", []), read("publish:log", []), read("publish:instagram", null), read("marketplace:autopilot", {}), read(LEDGER_KEY, []),
  ]);
  const { entries, external } = buildLedger({ videos, products, marketers, clicks, posts, log, instagram, env, autopilotStore, origin });
  const prev = new Map(arr(prevLedger).map((e) => [e.assetId, e]));
  const pages = new Map();
  const checked = [];
  const summary = [];
  const dead = [];
  const memory = [];
  for (const entry of entries) {
    const before = prev.get(entry.assetId);
    const fresh = before && before.fingerprint === entry.fingerprint && before.state === "VERIFIED" && now - Date.parse(before.checkedAt || 0) < REVERIFY_MS;
    if (fresh || checked.length >= limit || Date.now() - started > budgetMs) {
      summary.push(before ? { ...before, fingerprint: before.fingerprint } : { assetId: entry.assetId, productId: entry.productId, marketerId: entry.marketerId, style: entry.asset.style, state: "PENDING_CHECK", fingerprint: entry.fingerprint, checkedAt: null });
      continue;
    }
    const proof = await verifyEntry(entry, { fetchImpl, now, pages });
    checked.push(proof.assetId);
    await kvSet(PROOF_KEY(proof.assetId), proof);
    summary.push({
      assetId: proof.assetId, productId: proof.productId, marketerId: proof.marketerId, productTitle: proof.productTitle, style: proof.asset.style, provider: proof.asset.provider,
      truth: proof.truth.state, ugcMode: proof.truth.ugcMode, creativeClass: proof.truth.creativeClass, state: proof.state, fingerprint: proof.fingerprint, checkedAt: proof.checkedAt,
      verified: proof.stages.VERIFIED.verified, clicksFromCreative: proof.tracking.clicksFromCreative,
      external: proof.publications.filter((p) => p.kind === "external").map((p) => ({ destination: p.destination, status: p.status, providerId: p.providerId || null })),
    });
    for (const p of proof.publications) {
      if (p.kind === "internal" && p.publicationId && p.status === PUB_STATUS.PUBLISHED_UNVERIFIED) dead.push({ assetId: proof.assetId, destination: p.destination, error: p.lastError || "unverified", at: proof.checkedAt });
    }
    if (!before || before.state !== proof.state) {
      memory.push({
        type: proof.state === "VERIFIED" ? "action" : proof.state === "BLOCKED" ? "constraint" : "failure", at: now, capability: "publishing_orchestrator", productId: proof.productId, assetId: proof.assetId,
        text: proof.state === "VERIFIED"
          ? `קריאייטיב ${proof.asset.style} של ${proof.productTitle || proof.productId} מאומת ב-${proof.stages.VERIFIED.verified.length} משטחים ציבוריים (${proof.stages.VERIFIED.verified.join(", ")})`
          : `קריאייטיב ${proof.asset.style} של ${proof.productTitle || proof.productId}: ${proof.state}${proof.blockedReason ? ` (${proof.blockedReason})` : ""}`,
        proof: { state: proof.state, source: PROOF_KEY(proof.assetId) },
      });
    }
  }
  await kvSet(LEDGER_KEY, summary.slice(0, LEDGER_CAP));
  // Non-reel publications (brand pulse, creator autopilot, distribution).
  if (!pages.has("feed")) pages.set("feed", await timed(fetchImpl, `${origin}/api/store?mode=brand-pulse`, {}));
  let feedIds = null;
  try { const f = pages.get("feed"); if (f.status === 200) feedIds = arr(JSON.parse(f.body).posts).map((x) => x?.id); } catch { feedIds = null; }
  const postLedger = buildPostLedger({ log, feedIds });
  await kvSet(POSTS_LEDGER_KEY, { at: new Date(now).toISOString(), feedChecked: Boolean(feedIds), posts: postLedger });
  if (dead.length) {
    const prevDead = arr(await read(DEAD_LETTER_KEY, []));
    const day = new Date(now).toISOString().slice(0, 10);
    const seen = new Set(prevDead.map((d) => `${d.assetId}:${d.destination}:${String(d.at).slice(0, 10)}`));
    const add = dead.filter((d) => !seen.has(`${d.assetId}:${d.destination}:${day}`));
    if (add.length) await kvSet(DEAD_LETTER_KEY, [...prevDead, ...add].slice(-DEAD_CAP));
  }
  if (memory.length) {
    const prevMem = arr(await read(MEMORY_KEY, []));
    await kvSet(MEMORY_KEY, [...prevMem, ...memory].slice(-MEMORY_CAP));
  }
  return {
    ok: true,
    creatives: entries.length,
    checked: checked.length,
    verified: summary.filter((s) => s.state === "VERIFIED").length,
    blocked: summary.filter((s) => s.state === "BLOCKED").length,
    deadLettered: dead.length,
    memoryWritten: memory.length,
    posts: postLedger.length,
    postsWithProviderId: postLedger.filter((p) => p.channels.some((c) => c.providerId)).length,
    external: external.map((d) => ({ id: d.id, status: d.status })),
  };
}
