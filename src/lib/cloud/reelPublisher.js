// Native reel publisher — server side of the LikeLink media pipeline.
// Server-only (reads env, talks to Supabase with the service role); used by
// api/_utils/mediaPipelineHandler.mjs (/api/store?mode=media-pipeline) and by
// the autonomous "native-reel-audit" job. Pure logic lives in
// src/lib/media/reelPipeline.js.
//
// INGEST (each step has a verifier; nothing is claimed without read-back):
//   1. validate      payload shape, renderer version, probe, sha256
//   2. sniff         bytes are really MP4 + JPEG; sha256 recomputed
//   3. authorize     product is approved + attributed; (product, style) not
//                    already registered (idempotent → 409 with the existing id)
//   4. store         ugc/<productId>/<ts>-<style>.mp4 + poster (service role)
//   5. VERIFY MEDIA  read back with the ANON key — exactly the path the public
//                    media proxy uses — and compare length + sha256.
//                    Failure → delete both objects (rollback) and stop.
//   6. register      ugc:assets:<id>, marketplace:videos, product video fields
//                    (never overwriting a creator's own video); read back
//                    marketplace:videos with the ANON key (what browsers see).
//                    Failure → restore the previous values (rollback).
//   7. PUBLISH       internal: a reel post in brand_pulse:posts, PUBLISHED only
//                    after read-back finds its id. External: Telegram/webhook
//                    when configured — success only with a provider message id;
//                    otherwise REQUIRES_CONNECTION (never a silent success).
//   8. PROOF         publish:log entry + media:proof:<assetId> with every check.

import { createHash } from "node:crypto";
import { noteKvReadFailed, readKvResponse, assertKvWritable } from "./kvReadGuard.js";
import { mediaUrl, MEDIA_BUCKET } from "./mediaStore.js";
import { PRODUCTION_ORIGIN } from "../../constants/domain.js";
import { isPublicCatalogProduct } from "./catalog.js";
import {
  MAX_POSTER_BYTES,
  MAX_REEL_BYTES,
  RENDER_PROVIDER,
  STUDIO_PROVIDER,
  STYLE_ORDER,
  hookQuestion,
  REEL_STYLES,
  ON_FRAME_DISCLOSURE,
  assertSyntheticTruth,
  buildReelRecords,
  planRenders,
  registeredStyles,
  sniffMedia,
  styleLearning,
  validateIngest,
  buildSocialPack,
} from "../media/reelPipeline.js";

const VIDEOS_KEY = "marketplace:videos";
const PRODUCTS_KEY = "marketplace:products";
const MARKETERS_KEY = "marketplace:marketers";
const CLICKS_KEY = "marketplace:clicks";
const POSTS_KEY = "brand_pulse:posts";
const PUBLISH_LOG_KEY = "publish:log";
const LAST_RUN_KEY = "media:pipeline:last";
const LEARNING_KEY = "media:learning";
const REQUESTS_KEY = "media:requests";
const IG_STATE_KEY = "publish:instagram";

export function reelEnv(env = process.env) {
  return {
    url: env.VITE_SUPABASE_URL || env.SUPABASE_URL || "",
    service: env.SUPABASE_SERVICE_ROLE_KEY || "",
    anon: env.VITE_SUPABASE_ANON_KEY || "",
    telegramBot: env.BRAND_TELEGRAM_BOT || "",
    telegramChat: env.BRAND_TELEGRAM_CHAT || "",
    webhook: env.BRAND_WEBHOOK_URL || "",
    igUser: env.IG_USER_ID || "",
    igToken: env.IG_ACCESS_TOKEN || "",
    igGraph: (env.IG_GRAPH_HOST || "https://graph.facebook.com/v21.0").replace(/\/+$/, ""),
    igDailyCap: Math.max(0, Math.min(10, Number(env.IG_DAILY_CAP ?? 3) || 0)),
    origin: env.LIKELINK_BASE_URL || PRODUCTION_ORIGIN,
  };
}

function client({ env = reelEnv(), fetchImpl = globalThis.fetch } = {}) {
  const svc = { apikey: env.service, Authorization: `Bearer ${env.service}` };
  const anon = { apikey: env.anon, Authorization: `Bearer ${env.anon}` };
  const timeout = (ms) => AbortSignal.timeout(ms);

  async function kvRead(key, { asAnon = false } = {}) {
    let res;
    try {
      res = await fetchImpl(`${env.url}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=value`, { headers: asAnon ? anon : svc, signal: timeout(10000) });
    } catch {
      if (!asAnon) noteKvReadFailed(key);
      return { ok: false };
    }
    if (asAnon) {
      // Anonymous read-back: never marks the service key state.
      if (!res.ok) return { ok: false };
      const rows = await res.json().catch(() => null);
      if (!Array.isArray(rows)) return { ok: false };
      try {
        let value = rows[0]?.value ? JSON.parse(rows[0].value) : null;
        while (typeof value === "string" && value) value = JSON.parse(value);
        return { ok: true, value };
      } catch { return { ok: false }; }
    }
    const row = await readKvResponse(key, res);
    if (row.failed) return { ok: false };
    return { ok: true, value: row.found ? row.value : null };
  }

  async function kvWrite(key, value) {
    assertKvWritable(key);
    const res = await fetchImpl(`${env.url}/rest/v1/kv?on_conflict=key`, {
      method: "POST",
      headers: { ...svc, "content-type": "application/json", Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ key, value: JSON.stringify(value) }),
      signal: timeout(10000),
    });
    if (!res.ok) throw new Error(`kv_write_failed_${res.status}`);
  }

  async function upload(path, bytes, contentType) {
    const res = await fetchImpl(`${env.url}/storage/v1/object/${MEDIA_BUCKET}/${path}`, {
      method: "POST",
      headers: { ...svc, "Content-Type": contentType, "x-upsert": "false", "cache-control": "31536000" },
      body: bytes,
      signal: timeout(30000),
    });
    return res.ok ? { ok: true } : { ok: false, error: `storage_upload_failed_${res.status}` };
  }

  async function remove(paths) {
    try {
      await fetchImpl(`${env.url}/storage/v1/object/${MEDIA_BUCKET}`, {
        method: "DELETE",
        headers: { ...svc, "content-type": "application/json" },
        body: JSON.stringify({ prefixes: paths }),
        signal: timeout(10000),
      });
    } catch { /* best effort; the object is unreferenced either way */ }
  }

  async function copy(sourceKey, destinationKey) {
    try {
      const res = await fetchImpl(`${env.url}/storage/v1/object/copy`, {
        method: "POST",
        headers: { ...svc, "content-type": "application/json" },
        body: JSON.stringify({ bucketId: MEDIA_BUCKET, sourceKey, destinationKey }),
        signal: timeout(30000),
      });
      return res.ok ? { ok: true } : { ok: false, error: `storage_copy_failed_${res.status}` };
    } catch (e) {
      return { ok: false, error: String(e?.message || e).slice(0, 120) };
    }
  }

  /** The public read path: storage with the ANON key (RLS decides). */
  async function anonMedia(path, { range } = {}) {
    try {
      const res = await fetchImpl(`${env.url}/storage/v1/object/authenticated/${MEDIA_BUCKET}/${path}`, {
        headers: { ...anon, ...(range ? { Range: range } : {}) },
        signal: timeout(20000),
      });
      if (!res.ok) return { ok: false, status: res.status };
      const bytes = Buffer.from(await res.arrayBuffer());
      return { ok: true, status: res.status, bytes, type: String(res.headers.get("content-type") || "").split(";")[0] };
    } catch (e) {
      return { ok: false, status: 0, error: String(e?.message || e).slice(0, 120) };
    }
  }

  return { kvRead, kvWrite, upload, remove, copy, anonMedia, env, fetchImpl };
}

const sha = (b) => createHash("sha256").update(b).digest("hex");
const rid = () => Math.random().toString(36).slice(2, 8);
const arr = (v) => (Array.isArray(v) ? v : []);

/** DISCOVER → SELECT OPPORTUNITY → CREATE CREATIVE. Fails closed on any failed read. */
export async function buildPlan({ limit = 3, env, fetchImpl, now = Date.now() } = {}) {
  const c = client({ env, fetchImpl });
  const [products, marketers, videos, clicks, requests] = await Promise.all([PRODUCTS_KEY, MARKETERS_KEY, VIDEOS_KEY, CLICKS_KEY, REQUESTS_KEY].map((k) => c.kvRead(k)));
  if (![products, marketers, videos, clicks, requests].every((r) => r.ok)) return { ok: false, error: "kv_read_failed" };
  const max = Math.max(1, Math.min(6, Number(limit) || 3));
  const full = planRenders({ products: arr(products.value), marketers: arr(marketers.value), videos: arr(videos.value), clicks: arr(clicks.value), limit: 200, now });
  // Creator requests first (oldest first), then the autonomous selection.
  const queued = arr(requests.value).filter((r) => r?.status === "QUEUED").sort((a, b) => (a.at || 0) - (b.at || 0));
  const picked = [];
  for (const r of queued) {
    const item = full.plan.find((x) => x.productId === r.productId && (!r.style || x.style === r.style)) || full.plan.find((x) => x.productId === r.productId);
    if (item && !picked.includes(item)) picked.push({ ...item, reason: "creator_request" });
  }
  for (const item of full.plan) if (picked.length < max && !picked.some((x) => x.productId === item.productId)) picked.push(item);
  return { ok: true, plan: picked.slice(0, max), learning: full.learning };
}

async function externalPublish(c, { text, videoUrl, link }) {
  const { telegramBot, telegramChat, webhook } = c.env;
  if (telegramBot && telegramChat) {
    try {
      const res = await c.fetchImpl(`https://api.telegram.org/bot${telegramBot}/sendVideo`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: telegramChat, video: videoUrl, caption: `${text}\n${link}`.slice(0, 1000), supports_streaming: true }),
        signal: AbortSignal.timeout(30000),
      });
      const j = await res.json().catch(() => null);
      const id = j?.ok ? j.result?.message_id : null;
      return id ? { channel: "telegram", status: "PUBLISHED", externalId: String(id), proof: "telegram_message_id" } : { channel: "telegram", status: "FAILED", error: String(j?.description || `http_${res.status}`).slice(0, 160) };
    } catch (e) {
      return { channel: "telegram", status: "FAILED", error: String(e?.message || e).slice(0, 160) };
    }
  }
  if (webhook) {
    try {
      const res = await c.fetchImpl(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "likelink_reel", text, videoUrl, link }), signal: AbortSignal.timeout(15000) });
      const j = await res.json().catch(() => null);
      const id = j?.id || j?.postId || j?.externalId || null;
      // A 200 from a webhook is delivery, not publication — success needs a provider id.
      return id ? { channel: "webhook", status: "PUBLISHED", externalId: String(id), proof: "webhook_returned_id" } : { channel: "webhook", status: res.ok ? "DELIVERED_UNVERIFIED" : "FAILED", error: res.ok ? "no_provider_id" : `http_${res.status}` };
    } catch (e) {
      return { channel: "webhook", status: "FAILED", error: String(e?.message || e).slice(0, 160) };
    }
  }
  return { channel: "external", status: "REQUIRES_CONNECTION", error: "no_external_channel_configured" };
}

/** Full ingest: GENERATE (done by the renderer) → VERIFY MEDIA → REGISTER → PUBLISH → VERIFY → PROOF. */
export async function ingestReel(body, { env, fetchImpl, now = Date.now() } = {}) {
  const c = client({ env, fetchImpl });
  const v = validateIngest(body);
  if (!v.ok) return { ok: false, status: 400, error: v.error };

  let video, poster;
  try {
    video = Buffer.from(String(body.video), "base64");
    poster = Buffer.from(String(body.poster), "base64");
  } catch {
    return { ok: false, status: 400, error: "bad_base64" };
  }
  if (sniffMedia(video) !== "video/mp4") return { ok: false, status: 415, error: "not_mp4" };
  if (sniffMedia(poster) !== "image/jpeg") return { ok: false, status: 415, error: "poster_not_jpeg" };
  if (video.length > MAX_REEL_BYTES || poster.length > MAX_POSTER_BYTES) return { ok: false, status: 413, error: "too_large" };
  const videoSha = sha(video);
  if (videoSha !== body.sha256) return { ok: false, status: 422, error: "sha256_mismatch" };

  const [productsR, marketersR, videosR, postsR, logR] = await Promise.all([PRODUCTS_KEY, MARKETERS_KEY, VIDEOS_KEY, POSTS_KEY, PUBLISH_LOG_KEY].map((k) => c.kvRead(k)));
  if (![productsR, marketersR, videosR, postsR, logR].every((r) => r.ok)) return { ok: false, status: 503, error: "kv_read_failed" };
  const products = arr(productsR.value), marketers = arr(marketersR.value), videos = arr(videosR.value);
  const product = products.find((p) => p?.id === body.productId);
  if (!product || !isPublicCatalogProduct(product, marketers)) return { ok: false, status: 404, error: "product_not_public" };
  const existing = registeredStyles(videos).get(product.id);
  if (existing?.has(body.style)) {
    const prev = videos.find((x) => x?.source === RENDER_PROVIDER && x.style === body.style && x.productTags?.[0]?.productId === product.id);
    return { ok: false, status: 409, error: "already_registered", assetId: prev?.id || null };
  }

  // 4. store
  const stamp = `${now}-${body.style.replace(/_/g, "-")}`;
  const videoPath = `ugc/${product.id}/${stamp}.mp4`;
  const posterPath = `ugc/${product.id}/${stamp}-poster.jpg`;
  const upV = await c.upload(videoPath, video, "video/mp4");
  if (!upV.ok) return { ok: false, status: 502, error: upV.error, step: "store" };
  const upP = await c.upload(posterPath, poster, "image/jpeg");
  if (!upP.ok) { await c.remove([videoPath]); return { ok: false, status: 502, error: upP.error, step: "store" }; }

  // 5. VERIFY MEDIA through the anonymous public read path.
  const backV = await c.anonMedia(videoPath);
  const backP = await c.anonMedia(posterPath);
  const mediaProof = {
    status: backV.ok && backV.bytes.length === video.length && sha(backV.bytes) === videoSha && backP.ok ? "VERIFIED" : "FAILED",
    via: "anon_storage_read",
    httpStatus: backV.status,
    bytes: backV.ok ? backV.bytes.length : 0,
    sha256: videoSha,
    sha256Match: backV.ok ? sha(backV.bytes) === videoSha : false,
    contentType: backV.type || "",
    posterBytes: backP.ok ? backP.bytes.length : 0,
    probe: body.probe,
    verifiedAt: new Date(now).toISOString(),
  };
  if (mediaProof.status !== "VERIFIED") {
    await c.remove([videoPath, posterPath]);
    return { ok: false, status: 502, error: "media_readback_failed", step: "verify_media", proof: { media: mediaProof } };
  }

  const result = await registerAndPublish(c, { product, products, videos, postsR, logR, style: body.style, videoPath, posterPath, videoBytes: video.length, videoSha, probe: body.probe, now, conceptId: body.conceptId, mediaProof, renderer: body.renderer });
  if (result.ok) {
    try {
      const reqR = await c.kvRead(REQUESTS_KEY);
      if (reqR.ok && arr(reqR.value).some((r) => r?.productId === product.id && r.status === "QUEUED")) {
        await c.kvWrite(REQUESTS_KEY, arr(reqR.value).map((r) => (r?.productId === product.id && r.status === "QUEUED" ? { ...r, status: "RENDERED", assetId: result.assetId, doneAt: now } : r)));
      }
    } catch { /* request bookkeeping never undoes a verified publication */ }
  }
  return result;
}

/** REGISTER → VERIFY REGISTRATION → PUBLISH → VERIFY PUBLICATION → PROOF (shared by every source). */
async function registerAndPublish(c, ctx) {
  const { product, products, videos, postsR, logR, style, videoPath, posterPath, videoBytes, videoSha, probe, now, conceptId, mediaProof, provider = RENDER_PROVIDER, renderer } = ctx;
  // 6. register (rollback restores the previous values)
  const origin = c.env.origin;
  const records = buildReelRecords({ product, style, videoUrl: mediaUrl(videoPath, origin), posterUrl: posterPath ? mediaUrl(posterPath, origin) : product.image, bytes: videoBytes, sha256: videoSha, probe, now, provider, renderer: renderer || (provider === RENDER_PROVIDER ? undefined : "studio-browser") });
  if (!assertSyntheticTruth(records.truth)) {
    await c.remove([videoPath, posterPath].filter(Boolean));
    return { ok: false, status: 500, error: "truth_violation", truth: records.truth };
  }
  const publicVideo = { ...records.video, public: true, conceptId: String(conceptId || "").slice(0, 120) };
  const assetsKey = `ugc:assets:${product.id}`;
  const assetsR = await c.kvRead(assetsKey);
  if (!assetsR.ok) { await c.remove([videoPath, posterPath].filter(Boolean)); return { ok: false, status: 503, error: "kv_read_failed" }; }
  const prevAssets = arr(assetsR.value);
  const canTakeProductVideo = !product.videoUrl || /^likelink_/.test(String(product.videoProvider || ""));
  const nextProducts = products.map((p) =>
    p?.id === product.id && canTakeProductVideo
      ? { ...p, videoUrl: publicVideo.videoUrl, videoPoster: publicVideo.poster, videoProvider: provider, videoSynthetic: true, videoStyle: style, videoStatus: "completed", videoAssetId: publicVideo.id }
      : p
  );
  const rollbackRegistration = async () => {
    try { await c.kvWrite(VIDEOS_KEY, videos); } catch { /* reported below */ }
    try { await c.kvWrite(assetsKey, prevAssets); } catch { /* reported below */ }
    if (canTakeProductVideo) { try { await c.kvWrite(PRODUCTS_KEY, products); } catch { /* reported below */ } }
    await c.remove([videoPath, posterPath].filter(Boolean));
  };
  try {
    await c.kvWrite(VIDEOS_KEY, [publicVideo, ...videos].slice(0, 60));
    await c.kvWrite(assetsKey, [records.asset, ...prevAssets].slice(0, 20));
    if (canTakeProductVideo) await c.kvWrite(PRODUCTS_KEY, nextProducts);
  } catch (e) {
    await rollbackRegistration();
    return { ok: false, status: 502, error: String(e?.message || e), step: "register" };
  }
  const publicBack = await c.kvRead(VIDEOS_KEY, { asAnon: true });
  const registrationProof = {
    status: publicBack.ok && arr(publicBack.value).some((x) => x?.id === publicVideo.id) ? "VERIFIED" : "FAILED",
    via: "anon_kv_read:marketplace:videos",
    productVideo: canTakeProductVideo ? "set" : "kept_creator_video",
    pages: [`${origin}/reels?r=${encodeURIComponent(`v-${publicVideo.id}`)}`, `${origin}/p/${encodeURIComponent(product.id)}`],
  };
  if (registrationProof.status !== "VERIFIED") {
    await rollbackRegistration();
    return { ok: false, status: 502, error: "registration_readback_failed", step: "verify_registration", proof: { media: mediaProof, registration: registrationProof } };
  }

  // 7. PUBLISH — internal LikeLink publication, then the external boundary.
  const link = `${origin}/p/${encodeURIComponent(product.id)}?utm_source=likelink_reel&utm_medium=reel&utm_campaign=${encodeURIComponent(publicVideo.id)}`;
  const text = `${hookQuestion(product)}\n${publicVideo.title} · ${REEL_STYLES[style].he}\n${ON_FRAME_DISCLOSURE.he}`;
  const postId = `bp_${now}_${rid()}`;
  const post = { id: postId, ts: now, kind: "reel", productId: product.id, text, link, channels: ["web"], spotlight: null, media: { videoUrl: publicVideo.videoUrl, poster: publicVideo.poster, truth: records.truth, style: style, assetId: publicVideo.id } };
  let webStatus = "FAILED", webError = null;
  try {
    // The site feed is append-only, oldest first (same as the autopilot writer);
    // its cap matches publish:log (60) so a logged publication keeps its post.
    await c.kvWrite(POSTS_KEY, [...arr(postsR.value), post].slice(-60));
    const back = await c.kvRead(POSTS_KEY);
    webStatus = back.ok && arr(back.value).some((p) => p?.id === postId) ? "PUBLISHED" : "FAILED";
    if (webStatus !== "PUBLISHED") webError = "post_not_found_on_readback";
  } catch (e) {
    webError = String(e?.message || e).slice(0, 160);
  }
  const external = await externalPublish(c, { text, videoUrl: publicVideo.videoUrl, link });

  // 8. PROOF
  const iso = new Date(now).toISOString();
  const logEntries = [
    { id: `pub_${now}_${rid()}`, contentId: publicVideo.id, contentType: provider === RENDER_PROVIDER ? "native_reel" : "studio_reel", brandId: "platform", productId: product.id, channel: "web", status: webStatus, publishedAt: iso, externalId: webStatus === "PUBLISHED" ? postId : null, error: webError, attempts: 1, attemptOf: null, text, link },
    { id: `pub_${now + 1}_${rid()}`, contentId: publicVideo.id, contentType: provider === RENDER_PROVIDER ? "native_reel" : "studio_reel", brandId: "platform", productId: product.id, channel: external.channel, status: external.status, publishedAt: iso, externalId: external.externalId || null, error: external.error || null, attempts: 1, attemptOf: null, text, link },
  ];
  const proof = { assetId: publicVideo.id, productId: product.id, style: style, truth: records.truth, media: mediaProof, registration: registrationProof, publication: { web: { status: webStatus, externalId: webStatus === "PUBLISHED" ? postId : null, via: "kv_read:brand_pulse:posts", error: webError }, external } };
  try {
    await c.kvWrite(PUBLISH_LOG_KEY, [...logEntries, ...arr(logR.value)].slice(0, 60));
    await c.kvWrite(`media:proof:${publicVideo.id}`, proof);
    await c.kvWrite(LAST_RUN_KEY, { at: iso, assetId: publicVideo.id, productId: product.id, style: style, web: webStatus, external: external.status });
  } catch { /* proof bookkeeping failure never undoes a verified publication */ }

  return { ok: true, status: 200, truth: records.truth, assetId: publicVideo.id, video: publicVideo, proof, publication: { status: webStatus, externalId: webStatus === "PUBLISHED" ? postId : null }, external };
}

/**
 * VERIFY PUBLICATION → MEASURE → LEARN (autonomous job).
 * Re-checks every native reel through the public read path; a reel whose
 * media no longer serves is unregistered (rollback) instead of left broken.
 */
export async function auditReels({ env, fetchImpl, now = Date.now(), maxChecks = 12 } = {}) {
  const c = client({ env, fetchImpl });
  const [videosR, clicksR, productsR] = await Promise.all([VIDEOS_KEY, CLICKS_KEY, PRODUCTS_KEY].map((k) => c.kvRead(k)));
  if (!videosR.ok || !clicksR.ok || !productsR.ok) return { ok: false, error: "kv_read_failed" };
  const videos = arr(videosR.value);
  const native = videos.filter((v) => v?.source === RENDER_PROVIDER || v?.source === STUDIO_PROVIDER);
  const checks = [];
  for (const v of native.slice(0, maxChecks)) {
    let path = "";
    try { path = new URL(String(v.videoUrl)).searchParams.get("path") || ""; } catch { /* malformed → checked as missing */ }
    if (!/^ugc\/[A-Za-z0-9_-]{1,80}\/[A-Za-z0-9_-]{1,100}\.(mp4|webm)$/.test(path)) { checks.push({ id: v.id, path, ok: false, status: 400 }); continue; }
    const r = await c.anonMedia(path, { range: "bytes=0-1023" });
    checks.push({ id: v.id, path, ok: r.ok, status: r.status });
  }
  const broken = new Set(checks.filter((x) => !x.ok && x.status !== 0).map((x) => x.id));
  if (broken.size) {
    await c.kvWrite(VIDEOS_KEY, videos.filter((v) => !broken.has(v.id)));
    const products = arr(productsR.value);
    await c.kvWrite(PRODUCTS_KEY, products.map((p) => (broken.has(p?.videoAssetId) ? { ...p, videoUrl: null, videoPoster: null, videoProvider: null, videoSynthetic: null, videoStyle: null, videoStatus: null, videoAssetId: null } : p)));
  }
  const learning = styleLearning({ videos: native.filter((v) => !broken.has(v.id)), clicks: arr(clicksR.value) });
  const report = { at: new Date(now).toISOString(), reels: native.length, checked: checks.length, serving: checks.filter((x) => x.ok).length, unregistered: [...broken], learning, note: "learning = product views/clicks recorded after each reel went live (correlation, not reel performance)" };
  await c.kvWrite(LEARNING_KEY, report);
  return { ok: true, ...report };
}

/** Public-safe pipeline status (no env names, no secrets). */
export async function pipelineStatus({ env, fetchImpl } = {}) {
  const c = client({ env, fetchImpl });
  const [videosR, lastR, learnR] = await Promise.all([VIDEOS_KEY, LAST_RUN_KEY, LEARNING_KEY].map((k) => c.kvRead(k)));
  const native = arr(videosR.value).filter((v) => v?.source === RENDER_PROVIDER || v?.source === STUDIO_PROVIDER);
  const byStyle = Object.fromEntries(Object.keys(REEL_STYLES).map((s) => [s, native.filter((v) => v.style === s).length]));
  return {
    ok: true,
    provider: RENDER_PROVIDER,
    reels: native.length,
    byStyle,
    truth: [...new Set(native.map((v) => v.truth))],
    lastRun: lastR.ok ? lastR.value : null,
    audit: learnR.ok && learnR.value ? { at: learnR.value.at, serving: learnR.value.serving, checked: learnR.value.checked } : null,
    externalChannel: c.env.telegramBot && c.env.telegramChat ? "telegram" : c.env.webhook ? "webhook" : "REQUIRES_CONNECTION",
    instagram: c.env.igUser && c.env.igToken ? "connected" : "REQUIRES_CONNECTION",
    latest: native.slice(0, 6).map((v) => ({ id: v.id, productId: v.productTags?.[0]?.productId, style: v.style, truth: v.truth, videoUrl: v.videoUrl, createdAt: v.createdAt })),
  };
}

const STUDIO_SOURCE = /^reels\/([A-Za-z0-9_-]{1,80})\/([A-Za-z0-9_-]{1,100})\.(webm|mp4)$/;

/**
 * ONE CLICK from the Studio: a clip the creator rendered in the browser and
 * uploaded to reels/<own studio id>/ becomes a public, disclosed reel —
 * copied to ugc/<productId>/, verified by anonymous read-back, registered,
 * published, proven. ownerIds = the caller's VERIFIED studio ids.
 */
export async function registerStudioUpload({ sourcePath, productId, ownerIds = [] } = {}, { env, fetchImpl, now = Date.now() } = {}) {
  const c = client({ env, fetchImpl });
  const m = STUDIO_SOURCE.exec(String(sourcePath || ""));
  if (!m) return { ok: false, status: 400, error: "bad_source_path" };
  const owners = new Set((ownerIds || []).map(String));
  if (!owners.has(m[1])) return { ok: false, status: 403, error: "not_your_upload" };
  const [productsR, marketersR, videosR, postsR, logR] = await Promise.all([PRODUCTS_KEY, MARKETERS_KEY, VIDEOS_KEY, POSTS_KEY, PUBLISH_LOG_KEY].map((k) => c.kvRead(k)));
  if (![productsR, marketersR, videosR, postsR, logR].every((r) => r.ok)) return { ok: false, status: 503, error: "kv_read_failed" };
  const products = arr(productsR.value), videos = arr(videosR.value);
  const product = products.find((p) => p?.id === productId);
  if (!product || !isPublicCatalogProduct(product, arr(marketersR.value))) return { ok: false, status: 404, error: "product_not_public" };
  if (!owners.has(String(product.marketerId))) return { ok: false, status: 403, error: "not_your_product" };
  const ext = m[3];
  const videoPath = `ugc/${product.id}/${now}-studio.${ext}`;
  const cp = await c.copy(sourcePath, videoPath);
  if (!cp.ok) return { ok: false, status: 502, error: cp.error, step: "store" };
  const back = await c.anonMedia(videoPath);
  const kind = back.ok ? sniffMedia(back.bytes) : "";
  const mediaProof = {
    status: back.ok && (kind === "video/webm" || kind === "video/mp4") && back.bytes.length > 1000 ? "VERIFIED" : "FAILED",
    via: "anon_storage_read",
    httpStatus: back.status,
    bytes: back.ok ? back.bytes.length : 0,
    sha256: back.ok ? sha(back.bytes) : "",
    sha256Match: back.ok,
    contentType: back.type || kind,
    source: sourcePath,
    verifiedAt: new Date(now).toISOString(),
  };
  if (mediaProof.status !== "VERIFIED") {
    await c.remove([videoPath]);
    return { ok: false, status: 422, error: back.ok ? "not_a_playable_video" : "media_readback_failed", step: "verify_media", proof: { media: mediaProof } };
  }
  return registerAndPublish(c, { product, products, videos, postsR, logR, style: "studio", videoPath, posterPath: null, videoBytes: mediaProof.bytes, videoSha: mediaProof.sha256, probe: {}, now, conceptId: `${product.id}:studio`, mediaProof, provider: STUDIO_PROVIDER });
}

/** ONE CLICK "צור Reel": queue a native render for the runner (served first by the plan). */
export async function requestRender({ productId, style = "", ownerIds = [], requestedBy = "" } = {}, { env, fetchImpl, now = Date.now() } = {}) {
  const c = client({ env, fetchImpl });
  if (style && !STYLE_ORDER.includes(style)) return { ok: false, status: 400, error: "bad_style" };
  const [productsR, marketersR, reqR] = await Promise.all([PRODUCTS_KEY, MARKETERS_KEY, REQUESTS_KEY].map((k) => c.kvRead(k)));
  if (![productsR, marketersR, reqR].every((r) => r.ok)) return { ok: false, status: 503, error: "kv_read_failed" };
  const product = arr(productsR.value).find((p) => p?.id === productId);
  if (!product || !isPublicCatalogProduct(product, arr(marketersR.value))) return { ok: false, status: 404, error: "product_not_public" };
  if (!(ownerIds || []).map(String).includes(String(product.marketerId))) return { ok: false, status: 403, error: "not_your_product" };
  if (!/^https?:\/\//i.test(String(product.image || ""))) return { ok: false, status: 422, error: "product_image_required" };
  const list = arr(reqR.value);
  const existing = list.find((r) => r?.productId === productId && r.status === "QUEUED");
  if (existing) return { ok: true, status: 200, request: existing, duplicate: true };
  const request = { id: `req_${now}_${rid()}`, productId, style: style || "", requestedBy: String(requestedBy).slice(0, 80), at: now, status: "QUEUED" };
  await c.kvWrite(REQUESTS_KEY, [request, ...list].slice(0, 100));
  const back = await c.kvRead(REQUESTS_KEY);
  if (!back.ok || !arr(back.value).some((r) => r?.id === request.id)) return { ok: false, status: 502, error: "request_not_persisted" };
  return { ok: true, status: 200, request };
}

/** The caller's own requests + reels, for the Studio. */
export async function studioReelState({ ownerIds = [] } = {}, { env, fetchImpl } = {}) {
  const c = client({ env, fetchImpl });
  const [productsR, videosR, reqR] = await Promise.all([PRODUCTS_KEY, VIDEOS_KEY, REQUESTS_KEY].map((k) => c.kvRead(k)));
  if (![productsR, videosR, reqR].every((r) => r.ok)) return { ok: false, status: 503, error: "kv_read_failed" };
  const owners = new Set((ownerIds || []).map(String));
  const mine = new Set(arr(productsR.value).filter((p) => owners.has(String(p?.marketerId))).map((p) => p.id));
  return {
    ok: true,
    status: 200,
    requests: arr(reqR.value).filter((r) => mine.has(r?.productId)).slice(0, 50),
    reels: arr(videosR.value).filter((v) => /^likelink_/.test(String(v?.source || "")) && mine.has(v?.productTags?.[0]?.productId)).map((v) => ({ id: v.id, productId: v.productTags[0].productId, style: v.style, truth: v.truth, videoUrl: v.videoUrl, poster: v.poster, createdAt: v.createdAt })),
  };
}

/* ------------------------------------------------------------- instagram */

const DAY_MS = 86_400_000;
const igDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Reels Instagram can take: native v2 renders (AAC track), still public, product still public, not yet posted. */
export function nextInstagramReel({ videos = [], products = [], marketers = [], posted = [] } = {}) {
  const done = new Set(arr(posted).map((p) => p?.reelId));
  const postedProducts = new Set(arr(posted).map((p) => p?.productId));
  const byId = new Map(arr(products).map((p) => [p?.id, p]));
  const ok = arr(videos).filter((v) => v?.source === RENDER_PROVIDER && v.audio === "aac" && v.public !== false && !done.has(v.id) && /^https:\/\//.test(String(v.videoUrl || "")))
    .map((v) => ({ v, product: byId.get(v.productTags?.[0]?.productId) }))
    .filter((x) => x.product && isPublicCatalogProduct(x.product, marketers));
  // Spread across the catalog: products never posted first, then oldest reel first.
  ok.sort((a, b) => Number(postedProducts.has(a.product.id)) - Number(postedProducts.has(b.product.id)) || (Number(a.v.createdAt) || 0) - (Number(b.v.createdAt) || 0));
  return ok[0] || null;
}

/**
 * One step of the Instagram Reels publisher (Graph API, two phases):
 *   phase 1  POST /{ig-user}/media  media_type=REELS  → container id (stored)
 *   phase 2  GET  /{container}?fields=status_code → FINISHED → POST media_publish
 *            → GET /{media}?fields=id,permalink (read-back = proof)
 * PUBLISHED only with the media id Instagram returned AND read back. Without
 * IG_USER_ID + IG_ACCESS_TOKEN nothing is sent: REQUIRES_CONNECTION.
 * A daily cap protects the account; a product is not re-posted before the
 * rest of the catalog had its turn.
 */
export async function instagramPublishStep({ env, fetchImpl, now = Date.now() } = {}) {
  const c = client({ env, fetchImpl });
  const { igUser, igToken, igGraph, igDailyCap } = c.env;
  if (!igUser || !igToken) return { ok: true, status: "REQUIRES_CONNECTION", channel: "instagram" };
  const stateR = await c.kvRead(IG_STATE_KEY);
  if (!stateR.ok) return { ok: false, status: "kv_read_failed" };
  const state = { pending: null, posted: [], failed: [], ...(stateR.value && typeof stateR.value === "object" ? stateR.value : {}) };
  const graph = async (path, { method = "GET", params = {} } = {}) => {
    const q = new URLSearchParams({ ...params, access_token: igToken });
    const url = method === "GET" ? `${igGraph}/${path}?${q}` : `${igGraph}/${path}`;
    const res = await c.fetchImpl(url, method === "GET" ? { signal: AbortSignal.timeout(20000) } : { method, headers: { "content-type": "application/x-www-form-urlencoded" }, body: q.toString(), signal: AbortSignal.timeout(30000) });
    const j = await res.json().catch(() => ({}));
    return { ok: res.ok && !j?.error, j, error: j?.error ? String(j.error.message || j.error.type || "graph_error").slice(0, 160) : res.ok ? null : `http_${res.status}` };
  };

  if (state.pending) {
    const p = state.pending;
    const st = await graph(p.containerId, { params: { fields: "status_code" } });
    const code = st.j?.status_code;
    if (st.ok && code === "IN_PROGRESS") return { ok: true, status: "PROCESSING", reelId: p.reelId };
    if (!st.ok || code === "ERROR" || code === "EXPIRED" || now - p.createdAt > DAY_MS) {
      state.failed = [...arr(state.failed), { ...p, error: st.error || code || "expired", at: now }].slice(-30);
      state.pending = null;
      await c.kvWrite(IG_STATE_KEY, state);
      return { ok: false, status: "FAILED", reelId: p.reelId, error: st.error || code || "expired" };
    }
    if (code !== "FINISHED") return { ok: true, status: "PROCESSING", reelId: p.reelId, code: code || null };
    const pub = await graph(`${igUser}/media_publish`, { method: "POST", params: { creation_id: p.containerId } });
    const mediaId = pub.ok ? String(pub.j?.id || "") : "";
    const back = mediaId ? await graph(mediaId, { params: { fields: "id,permalink,timestamp" } }) : { ok: false };
    const verified = !!mediaId && back.ok && String(back.j?.id) === mediaId;
    const iso = new Date(now).toISOString();
    if (!mediaId) {
      state.failed = [...arr(state.failed), { ...p, error: pub.error || "no_media_id", at: now }].slice(-30);
      state.pending = null;
      await c.kvWrite(IG_STATE_KEY, state);
      return { ok: false, status: "FAILED", reelId: p.reelId, error: pub.error || "no_media_id" };
    }
    const entry = { reelId: p.reelId, productId: p.productId, mediaId, permalink: back.j?.permalink || null, at: now, verified, via: "graph_api" };
    state.posted = [...arr(state.posted), entry].slice(-500);
    state.pending = null;
    await c.kvWrite(IG_STATE_KEY, state);
    const logR = await c.kvRead(PUBLISH_LOG_KEY);
    if (logR.ok) {
      await c.kvWrite(PUBLISH_LOG_KEY, [...arr(logR.value), { id: `pub_${now}_${rid()}`, contentId: p.reelId, contentType: "native_reel", brandId: "platform", productId: p.productId, channel: "instagram", status: verified ? "PUBLISHED" : "PUBLISHED_UNVERIFIED", publishedAt: iso, externalId: mediaId, permalink: entry.permalink, error: null, attempts: 1, attemptOf: null, link: p.link }].slice(-500));
    }
    return { ok: true, status: verified ? "PUBLISHED" : "PUBLISHED_UNVERIFIED", reelId: p.reelId, mediaId, permalink: entry.permalink };
  }

  const today = igDay(now);
  const postedToday = arr(state.posted).filter((x) => igDay(Number(x.at) || 0) === today).length;
  if (postedToday >= igDailyCap) return { ok: true, status: "DAILY_CAP", postedToday, cap: igDailyCap };
  const [videosR, productsR, marketersR] = await Promise.all([VIDEOS_KEY, PRODUCTS_KEY, MARKETERS_KEY].map((k) => c.kvRead(k)));
  if (![videosR, productsR, marketersR].every((r) => r.ok)) return { ok: false, status: "kv_read_failed" };
  const failedIds = new Set(arr(state.failed).map((f) => f?.reelId));
  const next = nextInstagramReel({ videos: arr(videosR.value).filter((v) => !failedIds.has(v?.id)), products: arr(productsR.value), marketers: arr(marketersR.value), posted: state.posted });
  if (!next) return { ok: true, status: "NOTHING_TO_POST" };
  const creator = arr(marketersR.value).find((m) => m?.id === next.product.marketerId);
  const pack = buildSocialPack({ product: next.product, creator, style: next.v.style, origin: c.env.origin });
  const caption = pack.networks.instagram.caption;
  const cont = await graph(`${igUser}/media`, { method: "POST", params: { media_type: "REELS", video_url: next.v.videoUrl, caption, share_to_feed: "true", ...(next.v.poster && /^https:/.test(next.v.poster) ? { cover_url: next.v.poster } : {}) } });
  if (!cont.ok || !cont.j?.id) {
    state.failed = [...arr(state.failed), { reelId: next.v.id, productId: next.product.id, error: cont.error || "no_container_id", at: now }].slice(-30);
    await c.kvWrite(IG_STATE_KEY, state);
    return { ok: false, status: "FAILED", reelId: next.v.id, error: cont.error || "no_container_id" };
  }
  state.pending = { reelId: next.v.id, productId: next.product.id, containerId: String(cont.j.id), createdAt: now, link: pack.networks.instagram.link };
  await c.kvWrite(IG_STATE_KEY, state);
  return { ok: true, status: "CONTAINER_CREATED", reelId: next.v.id, containerId: String(cont.j.id) };
}
