import { lunaHook } from "../ambassador.js";
import { buildCampaign } from "./campaign.js";
import { selectOpportunity } from "./growth.js";
import { generateDailyTrendReport } from "./trendScanner.js";
import { appendVeritas } from "./veritas.js";
import { generateProductStory } from "./storyEngine.js";
import { CONNECTION_STATE } from "./connectionManager.js";

const CLOUD_CYCLE_KEY = "cloud_autopilot:meta";
const SITE_FEED_KEY = "site_campaign:feed";
const MAX_FEED_ENTRIES = 200;

export async function runCloudAutopilotCycle(ctx, opts = {}) {
  const { kvGet, kvSet, origin, env = {} } = ctx;
  const webOnly = Boolean(opts.webOnly);
  const force = Boolean(opts.force);
  const now = Date.now();
  const [productsRow, clicksRow, salesRow, campaignsRow, marketersRow, metaRow, connectionStatesRow] =
    await Promise.all([
      kvGet("marketplace:products", []),
      kvGet("marketplace:clicks", []),
      kvGet("marketplace:sales", []),
      kvGet("marketplace:site_campaigns", []),
      kvGet("marketplace:marketers", []),
      kvGet(CLOUD_CYCLE_KEY),
      kvGet("marketplace:connection_states", []),
    ]);
  const productsList = Array.isArray(productsRow) ? productsRow : Object.values(productsRow || {});
  const clicksList = Array.isArray(clicksRow) ? clicksRow : [];
  const salesList = Array.isArray(salesRow) ? salesRow : [];
  const campaignsList = Array.isArray(campaignsRow) ? campaignsRow : [];
  const marketersList = Array.isArray(marketersRow) ? marketersRow.filter(m => m && m.id) : [];
  const connectionStates = Array.isArray(connectionStatesRow) ? connectionStatesRow : [];
  const connectionByProvider = new Map(connectionStates.filter(c => c && c.provider).map(c => [String(c.provider), c]));
  const meta = metaRow || {};
  const lastRunAt = webOnly ? (meta.webRunAt || 0) : (meta.runAt || 0);
  const cooldownMs = webOnly ? 6 * 3600 * 1000 : 24 * 3600 * 1000;
  if (!force && now - lastRunAt < cooldownMs) {
    return { ok: false, skipped: "cooldown", runAt: new Date(lastRunAt).toISOString(), nextRunAt: new Date(lastRunAt + cooldownMs).toISOString() };
  }
  const SINGLE_OWNER_ID = env.MARKETPLACE_SINGLE_OWNER_ID;
  if (SINGLE_OWNER_ID && marketersList.length === 1 && String(marketersList[0].id) === SINGLE_OWNER_ID) {
    for (const p of productsList) { if (!p.marketerId) p.marketerId = SINGLE_OWNER_ID; }
  }
  const trendReport = generateDailyTrendReport(productsList, new Date(now));
  const channelStates = [{ provider: "owned_web", connected: true, authorized: true, verified: true }, ...marketersList.filter(m => m && m.enabled).flatMap(m => (m.channels || []).map(ch => { const provider = String(ch.type || "unknown"); const state = connectionByProvider.get(provider); const verified = Boolean(state && (state.state === CONNECTION_STATE.CONNECTED || state.state === CONNECTION_STATE.READY) && state.lastVerified); return { provider, connected: verified, authorized: verified, verified }; }))];
  const decision = selectOpportunity({ approved: productsList, sales: salesList, clicks: clicksList, campaigns: campaignsList, channelStates, marketers: marketersList, now });
  const selected = decision.selected || null;
  let campaign = null; let campaignId = null;
  if (selected) {
    campaignId = `cloud_${Math.floor(now / 86400000)}`;
    try { campaign = buildCampaign(selected, { storeUrl: `${origin}/p/${selected.id}`, angleStats: {}, anglePreference: null, marketers: marketersList, now }); } catch {}
  }
  let storyScenes = null;
  if (selected && campaign) { try { storyScenes = generateProductStory(selected); } catch {} }
  const lunaText = selected ? lunaHook(selected.id) : null;
  const hookText = campaign?.chosenHook?.text || lunaText || "";
  const priceStr = (selected && Number(selected.price) > 0) ? ` · ${selected.price} ₪` : "";
  const trackedUrl = campaign?.trackedUrl || (selected ? `${origin}/p/${selected.id}?utm_source=likelink_cloud&utm_medium=autopilot&utm_campaign=cloud_growth` : "");
  const urgency = trendReport.context?.urgency || "גילוי מוצרים לפי הקשר זמן — ללא טענת דחיפות";
  const feedText = selected
    ? `${hookText}\n\n${selected.title}${priceStr}\n${trackedUrl}\n\n${urgency}\n\n💜 פותחים סטודיו חינם · ${origin}/?utm_source=likelink_cloud&utm_medium=autopilot`
    : `${(trendReport.context?.story || "🤖 הענן של לייקלין עובד לטובתך — מוצרים חמים כבר דולפים לפרסום.")}\n\n💜 פותחים סטודיו חינם · ${origin}/?utm_source=likelink_cloud&utm_medium=autopilot`;
  let feedWritten = false;
  try {
    const existing = (await kvGet(SITE_FEED_KEY)) || [];
    const feedList = Array.isArray(existing) ? existing.slice(0, MAX_FEED_ENTRIES) : [];
    const entry = {
      ts: now, cycleKind: webOnly ? "web_selfheal" : "daily",
      spotlightId: selected?.id || null, campaignId: campaignId || null,
      title: selected?.title || null, price: selected?.price || null,
      category: selected?.category || null, image: selected?.image || null,
      hookText: hookText || null, text: feedText,
      link: trackedUrl || `${origin}/?utm_source=likelink_cloud&utm_medium=autopilot`,
      hotCategory: trendReport.hotCategory || null, urgency: trendReport.urgency || null,
      selectionMode: decision.mode || null,
      selectionScore: decision.score != null ? decision.score : null,
      selectionReasons: decision.reasons || [],
      topTrends: trendReport.topPicks.slice(0, 5).map(t => ({
        productId: t.product.id, title: t.product.title,
        score: t.trendScore, reasons: t.reasons,
      })),
      storyScenes: storyScenes || null,
      timestamp: new Date(now).toISOString(),
    };
    feedList.unshift(entry);
    await kvSet(SITE_FEED_KEY, feedList);
    feedWritten = true;
  } catch {}
  let veritasSeq = null; let veritasHash = null;
  try {
    const ledgerRow = await kvGet("marketplace:veritas", []);
    const ledger = Array.isArray(ledgerRow) ? ledgerRow : [];
    const entry = {
      type: "cloud_autopilot_cycle", ts: new Date(now).toISOString(),
      cycleKind: webOnly ? "web_selfheal" : "daily",
      selectionMode: decision.mode || null,
      productId: selected?.id || null, productTitle: selected?.title || null,
      productPrice: selected?.price != null ? Number(selected.price) : null,
      score: decision.score != null ? decision.score : null,
      reasons: decision.reasons || [], feedWritten,
      topCategory: trendReport.hotCategory || null,
      hotCategories: trendReport.context ? trendReport.context.hotCategories : null,
      timeOfDay: trendReport.context ? trendReport.context.timeOfDay : null,
      campaignId: campaignId || null,
      topTrendIds: trendReport.topPicks.slice(0, 5).map(t => t.product.id),
    };
    const nextLedger = appendVeritas(ledger, entry);
    await kvSet("marketplace:veritas", nextLedger);
    veritasSeq = nextLedger.length;
    veritasHash = nextLedger[nextLedger.length - 1]?.hash || null;
  } catch {}
  const result = {
    ok: true, runAt: new Date(now).toISOString(),
    cycleKind: webOnly ? "web_selfheal" : "daily", feedWritten,
    selection: selected ? {
      id: selected.id, title: selected.title,
      price: selected.price, category: selected.category,
      image: selected.image, marketerId: selected.marketerId,
    } : null,
    decision: {
      mode: decision.mode, score: decision.score,
      reasons: decision.reasons,
      candidates: decision.candidates || [],
      rejected: decision.rejected || [],
    },
    trendContext: trendReport.context || null,
    trendReport: {
      hotCategory: trendReport.hotCategory,
      urgency: trendReport.urgency,
      topPicks: trendReport.topPicks.slice(0, 5).map(t => ({
        productId: t.product.id, title: t.product.title,
        score: t.trendScore,
        reasons: t.reasons.slice(0, 3),
      })),
    },
    campaign: campaign ? {
      campaignId: campaign.campaignId,
      angle: campaign.angle?.label || campaign.angle?.id,
      chosenHook: campaign.chosenHook?.text,
      story: campaign.story, script: campaign.script,
      cta: campaign.cta, trackedUrl: campaign.trackedUrl,
      variants: campaign.variants,
    } : null,
    storyScenes,
    veritas: veritasSeq != null ? { seq: veritasSeq, hash: veritasHash } : null,
  };
  try {
    await kvSet(CLOUD_CYCLE_KEY, {
      ...meta, runAt: now,
      webRunAt: webOnly ? now : meta.webRunAt,
      lastSelectedId: selected?.id || meta.lastSelectedId,
      lastRunAt: now,
    });
  } catch {}
  return result;
}

export async function getCloudCycleStatus(ctx) {
  const { kvGet, origin } = ctx;
  const meta = (await kvGet(CLOUD_CYCLE_KEY)) || {};
  const feed = (await kvGet(SITE_FEED_KEY)) || [];
  const feedList = Array.isArray(feed) ? feed : [];
  const latest = feedList[0] || null;
  const topTrends = latest?.topTrends || [];
  const allTrendIds = latest
    ? [latest.spotlightId].concat(topTrends.map(t => t.productId)).filter(Boolean)
    : [];
  return {
    ok: true,
    lastRunAt: meta.runAt || null,
    lastRunIso: meta.runAt ? new Date(meta.runAt).toISOString() : null,
    lastSelected: meta.lastSelectedId
      ? { id: meta.lastSelectedId, ts: meta.lastRunAt || null }
      : null,
    feed: {
      latest,
      topTrends,
      allTrendIds,
      entryCount: feedList.length,
      latestEntryAt: latest ? new Date(latest.ts).toISOString() : null,
    },
    origin,
  };
}


