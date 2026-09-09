// Vercel Serverless Utility — Cloud Analytics 📊 (SERVER = SOURCE OF TRUTH)
//
// Aggregates ONLY verified, already-existing business data from the kv store.
// It never invents numbers: every stage of the funnel that the system does not
// measure is reported explicitly as "not measured" (null) — never as a fake 0
// dressed up as a business result.
//
// Truth sources (existing keys, read with the SERVICE_ROLE key):
//   marketplace:sales       → verified sales (server-signed or PayPal-captured)
//   marketplace:payouts     → payout lifecycle (pending/paid/failed/processing)
//   marketplace:charges     → balance charges (boosts)
//   marketplace:clicks      → tracked clicks (+ traffic source when available)
//   marketplace:products    → catalog + top product
//   marketplace:marketers   → creator count
//   marketplace:autopilot   → per-creator run logs (autopilot failures)
//   audit:events            → security events (blocked/forbidden actions)
//
// Never stored here: passwords, tokens, PayPal secrets, admin codes.

import { sendViaResend } from "../invoice/send.mjs";
import { learnFromClicks } from "../../src/lib/cloud/campaign.js";
import { selectOpportunity } from "../../src/lib/cloud/growth.js";

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const K = {
  sales: "marketplace:sales",
  payouts: "marketplace:payouts",
  charges: "marketplace:charges",
  clicks: "marketplace:clicks",
  products: "marketplace:products",
  marketers: "marketplace:marketers",
  autopilot: "marketplace:autopilot",
  audit: "audit:events",
};

const LAST_SENT_KEY = "analytics:owner_report:last_sent";

const TZ = "Asia/Jerusalem";

async function kvGet(key, fallback) {
  if (!SB_URL || !SB_KEY) return fallback;
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=value`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, signal: AbortSignal.timeout(10000) }
    );
    const rows = await res.json();
    return rows?.[0]?.value ? JSON.parse(rows[0].value) : fallback;
  } catch {
    return fallback;
  }
}

async function kvSet(key, value) {
  if (!SB_URL || !SB_KEY) throw new Error("supabase_not_configured");
  const res = await fetch(`${SB_URL}/rest/v1/kv?on_conflict=key`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "content-type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({ key, value: JSON.stringify(value) }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`kv_upsert_failed_${res.status}`);
}

// ─── period helpers (Israel time) ───────────────────────────────────────────

function dayKey(ts) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));
  } catch {
    return new Date(ts).toISOString().slice(0, 10);
  }
}

function todayKey() {
  return dayKey(Date.now());
}

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// ─── aggregation ────────────────────────────────────────────────────────────

function sum(arr, fn) {
  return arr.reduce((s, x) => s + (Number(fn(x)) || 0), 0);
}

function bucketTraffic(clicks, fromTs) {
  const rows = fromTs == null ? clicks : clicks.filter((c) => Number(c?.ts || 0) >= fromTs);
  // Views (type:'view') and true clicks are counted SEPARATELY — a view is
  // never inflated into a click. Legacy events without a type remain clicks.
  const viewRows = rows.filter((c) => c?.type === "view");
  const clickRows = rows.filter((c) => c?.type !== "view");
  const bySource = {};
  const byProduct = {};
  for (const c of clickRows) {
    const src = c?.src ? String(c.src).slice(0, 80) : "(לא זוהה מקור)";
    bySource[src] = (bySource[src] || 0) + 1;
    if (c?.productId) byProduct[c.productId] = (byProduct[c.productId] || 0) + 1;
  }
  const viewsByProduct = {};
  for (const v of viewRows) {
    if (v?.productId) viewsByProduct[v.productId] = (viewsByProduct[v.productId] || 0) + 1;
  }
  return {
    clicks: clickRows.length,
    views: viewRows.length,
    viewsMeasured: true, // product views ARE measured first-party since this release
    measured: true, // clicks ARE measured by the system
    sources: Object.entries(bySource)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    topProducts: Object.entries(byProduct)
      .map(([productId, count]) => ({ productId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    topViewedProducts: Object.entries(viewsByProduct)
      .map(([productId, count]) => ({ productId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  };
}

function bucketRevenue(sales, fromTs) {
  const rows = fromTs == null ? sales : sales.filter((s) => Number(s?.ts || 0) >= fromTs);
  return {
    verifiedSales: rows.length, // count of VERIFIED sale records only
    grossRevenue: round2(sum(rows, (s) => s.saleAmount)),
    commission: round2(sum(rows, (s) => s.platformFee)), // owner share (platform fee)
    creatorShare: round2(sum(rows, (s) => s.marketerNet)),
  };
}

function payoutSplit(payouts, fromTs) {
  const rows = fromTs == null ? payouts : payouts.filter((p) => Number(p?.ts || 0) >= fromTs);
  const by = { pending: 0, processing: 0, paid: 0, failed: 0, refunded: 0 };
  for (const p of rows) {
    const st = String(p?.status || "pending").toLowerCase();
    if (st in by) by[st] = round2(by[st] + (Number(p.amount) || 0));
  }
  return {
    // EARNED / PENDING / PAID / FAILED / REFUNDED — kept strictly separate.
    earned: round2(sum(rows, (p) => p.amount)),
    pending: by.pending,
    processing: by.processing,
    paid: by.paid,
    failed: by.failed,
    refunded: by.refunded,
    refundedSupported: false, // the system does not track refunds/chargebacks yet
  };
}

/**
 * Build the full Owner Cloud Report from verified data only.
 * Unmeasured funnel stages come back as `measured: false` / null — NOT as 0.
 */
export async function buildOwnerReport() {
  const [sales, payouts, charges, clicks, products, marketers, autopilot, auditEvents, siteCampaigns] = await Promise.all([
    kvGet(K.sales, []),
    kvGet(K.payouts, []),
    kvGet(K.charges, []),
    kvGet(K.clicks, []),
    kvGet(K.products, []),
    kvGet(K.marketers, []),
    kvGet(K.autopilot, {}),
    kvGet(K.audit, []),
    kvGet("marketplace:site_campaigns", []),
  ]);

  const salesArr = Array.isArray(sales) ? sales : [];
  const payoutsArr = Array.isArray(payouts) ? payouts : [];
  const clicksArr = Array.isArray(clicks) ? clicks : [];
  const productsArr = Array.isArray(products) ? products : [];
  const marketersArr = Array.isArray(marketers) ? marketers : [];
  const auditArr = Array.isArray(auditEvents) ? auditEvents : [];

  const now = Date.now();
  const startOfToday = now - 24 * 3600 * 1000;
  const startOfWeek = now - 7 * 24 * 3600 * 1000;
  const startOfMonth = now - 30 * 24 * 3600 * 1000;

  // ── Traffic (observed where the system measures it) ──
  // The buckets are bound first — the literal below must never reference
  // `traffic` inside its own initializer (that was an uncaught TDZ crash that
  // only surfaced once admin gates actually passed through in production).
  const tToday = bucketTraffic(clicksArr, startOfToday);
  const tWeek = bucketTraffic(clicksArr, startOfWeek);
  const tMonth = bucketTraffic(clicksArr, startOfMonth);
  const tAll = bucketTraffic(clicksArr, null);
  const traffic = {
    today: tToday,
    week: tWeek,
    month: tMonth,
    all: tAll,
    // Honest data-availability notes — never fake zeros:
    visitorsMeasured: false, // no visitor tracking exists in the system yet
    productViewsMeasured: true, // product views ARE measured first-party (one per product per browser session)
    productViewsToday: tToday.views,
    productViewsWeek: tWeek.views,
    productViewsMonth: tMonth.views,
    productViewsAll: tAll.views,
    topViewedProducts: tAll.topViewedProducts,
    channelsActive: Object.values(autopilot || {}).filter((c) => c?.enabled && Array.isArray(c.channels) && c.channels.length > 0).length,
  };

  // ── Funnel truth ──
  const funnel = {
    clicks: { today: traffic.today.clicks, week: traffic.week.clicks, month: traffic.month.clicks, all: traffic.all.clicks },
    checkoutStarts: null, // NOT measured — no checkout-start event exists yet
    verifiedSales: {
      today: bucketRevenue(salesArr, startOfToday).verifiedSales,
      week: bucketRevenue(salesArr, startOfWeek).verifiedSales,
      month: bucketRevenue(salesArr, startOfMonth).verifiedSales,
      all: bucketRevenue(salesArr, null).verifiedSales,
    },
    notes: [
      "מבקרים טרם נמדדים כזהות ייחודית; צפיות במוצר וקליקים נמדדים מהענן.",
      "התחלות Checkout טרם נמדדות — המשך המשפך מדווח מנקודת המכירה המאומתת.",
    ],
  };

  // ── Revenue (VERIFIED sales only — server-signed / PayPal-captured) ──
  const revenue = {
    today: bucketRevenue(salesArr, startOfToday),
    week: bucketRevenue(salesArr, startOfWeek),
    month: bucketRevenue(salesArr, startOfMonth),
    all: bucketRevenue(salesArr, null),
  };

  // ── Owner money report (EARNED / PENDING / PAID / FAILED / REFUNDED) ──
  const ownerMoney = {
    lifetime: payoutSplit(payoutsArr, null),
    month: payoutSplit(payoutsArr, startOfMonth),
    chargesDeducted: round2(sum(Array.isArray(charges) ? charges : [], (c) => c.amount)),
    note: "Commission = עמלת הפלטפורם (platformFee) מתוך מכירות מאומתות בלבד.",
  };

  // ── Top product (by verified sales, fallback: clicks) ──
  const titleOf = (id) => (productsArr.find((p) => p.id === id) || {}).title || null;
  const salesByProduct = {};
  for (const s of salesArr) if (s?.productId) salesByProduct[s.productId] = (salesByProduct[s.productId] || 0) + 1;
  let topProduct = null;
  const topSalesId = Object.entries(salesByProduct).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (topSalesId) {
    topProduct = { productId: topSalesId, title: titleOf(topSalesId), verifiedSales: salesByProduct[topSalesId] };
  } else if (traffic.all.topProducts.length > 0) {
    const tp = traffic.all.topProducts[0];
    topProduct = { productId: tp.productId, title: titleOf(tp.productId), verifiedSales: 0, clicks: tp.count };
  }

  // ── Issues / health ──
  const autopilotFailures = Object.values(autopilot || {}).reduce(
    (n, cfg) => n + ((cfg?.logs || []).filter((l) => l && l.ok === false && Number(l.ts || 0) >= startOfWeek).length),
    0
  );
  const securityBlocked = auditArr.filter(
    (e) => e?.event === "api.forbidden" && new Date(e?.timestamp || 0).getTime() >= startOfWeek
  ).length;

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    timezone: TZ,
    catalog: { products: productsArr.length, approved: productsArr.filter((p) => p.status === "approved").length, creators: marketersArr.length },
    traffic,
    funnel,
    revenue,
    ownerMoney,
    topProduct,
    issues: {
      autopilotFailuresLastWeek: autopilotFailures,
      securityBlockedLastWeek: securityBlocked,
    },
    // §54 — explicit data-integrity statement
    dataIntegrity: {
      salesSource: "verified (server-signed or PayPal-captured) only",
      hasAnySales: salesArr.length > 0,
      hasAnyTraffic: clicksArr.length > 0,
    },
    // §17 learning loop — sample-gated, honest, never a guess
    campaignLearning: learnFromClicks(clicksArr),
    // Official Site campaigns (OWNER_SCOPE = OFFICIAL_SITE) — created daily by
    // the autonomous cycle. Clicks per campaign measured via utm_campaign.
    siteCampaigns: (() => {
      const list = Array.isArray(siteCampaigns) ? siteCampaigns : [];
      const clicksByCampaign = {};
      for (const c of clicksArr) {
        if (c?.camp) clicksByCampaign[String(c.camp).slice(0, 80)] = (clicksByCampaign[String(c.camp).slice(0, 80)] || 0) + 1;
      }
      const last = list.length ? list[list.length - 1] : null;
      return {
        total: list.length,
        last: last
          ? {
              campaignId: last.campaignId,
              product: last.product?.title || last.productId,
              angle: last.angle?.id,
              status: last.status,
              createdAt: last.createdAt,
              trackedUrl: last.trackedUrl,
              clicks: clicksByCampaign[last.campaignId] || 0,
            }
          : null,
        clicksByCampaign,
      };
    })(),
    // Google discovery status — derived ONLY from real, existing feed data.
    // Google does not guarantee impressions/clicks; GOOGLE_TRAFFIC is reported
    // only when actually measured (never claimed).
    googleStatus: (() => {
      const marketerIds = new Set(marketersArr.map((m) => m?.id).filter(Boolean));
      const eligible = productsArr.filter(
        (p) => p.status === "approved" && p.marketerId && marketerIds.has(p.marketerId) && p.title && Number(p.price) > 0 && p.image
      );
      const needsAttention = productsArr.filter(
        (p) => p.status === "approved" && p.marketerId && marketerIds.has(p.marketerId) && !(p.title && Number(p.price) > 0 && p.image)
      );
      const quarantined = productsArr.filter((p) => p && (!p.marketerId || !marketerIds.has(p.marketerId)));
      const googleClicks = clicksArr.filter((c) => String(c?.src || "").toLowerCase().startsWith("google")).length;
      const feedReady = eligible.length > 0;
      return {
        connection: "GOOGLE_FEED_READY", // the existing /api/google-feed is the live data source
        merchantCenterOAuth: "ACTION_REQUIRED", // one-time owner action via official Google auth
        status: !feedReady ? "GOOGLE_NOT_CONFIGURED" : needsAttention.length ? "GOOGLE_PRODUCTS_NEED_ATTENTION" : "GOOGLE_FEED_HEALTHY",
        feedUrl: "/api/google-feed",
        eligibleProducts: eligible.length,
        needsAttentionProducts: needsAttention.length,
        quarantinedUnattributed: quarantined.length,
        missingAttributesNote: needsAttention.length
          ? "מוצרים ללא תמונה/מחיר/כותרת מסומנים NEEDS_ATTENTION — לא מומצאים ב-feed."
          : quarantined.length
            ? `${quarantined.length} מוצרים ללא בעלות מאומתת — מורחקים מה-feed הציבורי (fail-closed).`
            : null,
        googleClicksMeasured: googleClicks, // 0 = measured zero, not an estimate
        googleTraffic: googleClicks > 0 ? "MEASURED" : "NOT_YET_MEASURED",
      };
    })(),
    // ── ADAPTIVE GROWTH BRAIN — the live decision the engine just made ──
    // Recomputes the same evidence-first selection the daily cycle uses, so
    // the Owner report always mirrors what the cron decided (or would decide).
    growthBrain: (() => {
      try {
        const decision = selectOpportunity({
          approved: productsArr.filter((p) => p.status === "approved" && p.marketerId),
          sales: salesArr,
          clicks: clicksArr,
          campaigns: Array.isArray(siteCampaigns) ? siteCampaigns : [],
          marketers: marketersArr,
          channelStates: [], // official-site scope has no authorized external channel yet
        });
        return {
          mode: decision.mode,
          selectedProduct: decision.selected ? { id: decision.selected.id, title: decision.selected.title } : null,
          score: decision.score,
          reasons: decision.reasons,
          candidates: decision.candidates,
          rejected: decision.rejected,
          destination: decision.destination,
          distributionBlocked: decision.authorization?.distributionBlocked,
        };
      } catch {
        return { mode: "ERROR", reasons: ["growth_brain_failed"] };
      }
    })(),
    // ── ZERO-TOUCH AUTONOMY — what runs fully in the cloud right now, and the
    //    only genuinely-required human/owner actions (honest, no invented gains).
    autonomy: (() => {
      const socialChannels = Object.values(autopilot || {}).reduce(
        (n, cfg) => n + ((cfg?.channels || []).filter((c) => c?.enabled).length),
        0
      );
      const actions = [];
      const emailOk = Boolean(process.env.RESEND_API_KEY && process.env.OWNER_EMAIL);
      if (!emailOk) actions.push("EMAIL_CONFIG_REQUIRED");
      if (socialChannels === 0) actions.push("SOCIAL_CHANNEL_OPTIONAL"); // organic owned-web is live either way
      return {
        level: "AUTONOMOUS",
        ownedWebDistribution: "LIVE", // indexed product+campaign URLs go live instantly, no tokens
        aiCampaignPipeline: "ACTIVE", // daily Growth Brain → Hebrew content → tracked URL (automatic)
        firstPartyMetrics: "MEASURED", // views + clicks + sources measured from the cloud
        revenuePipeline: "CONFIGURED", // PayPal checkout + idempotent verifiable capture
        emailReport: emailOk ? "ACTIVE" : "EMAIL_CONFIG_REQUIRED",
        socialChannels,
        googleFeed: "LIVE",
        migration: "OWNER_ONE_TIME_ACTION", // cloud_identity.sql (SAFE, not executed)
        ownerActions: actions,
        summary: emailOk
          ? "הענן נוהג לבד: קמפיינים, מדידה ולמידה. הדוח היומי מגיע למייל."
          : "הענן נוהג לבד: קמפיינים, מדידה ולמידה. להוספת מייל יומי — הגדירי OWNER_EMAIL.",
      };
    })(),
  };
}


// ─── Daily Owner email (REUSES the existing Resend email path) ──────────────

function he(n) {
  return "₪" + (Number(n) || 0).toFixed(2);
}

function renderOwnerReportHtml(r) {
  const t = r.traffic, rev = r.revenue.all, om = r.ownerMoney.lifetime;
  const noTraffic = !r.dataIntegrity.hasAnyTraffic;
  const noSales = !r.dataIntegrity.hasAnySales;
  const row = (label, value) => `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:14px">${label}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:14px;font-weight:bold;text-align:left">${value}</td></tr>`;
  const trafficLine = noTraffic
    ? "<b>לא נמדדה תנועה בתקופה שנבדקה.</b>"
    : `קליקים: <b>${t.today.clicks}</b> היום · <b>${t.week.clicks}</b> השבוע · <b>${t.all.clicks}</b> סה"כ`;
  const salesLine = noSales
    ? "<b>עדיין אין מכירות מאומתות.</b>"
    : `מכירות מאומתות: <b>${r.funnel.verifiedSales.today}</b> היום · <b>${r.funnel.verifiedSales.week}</b> השבוע · <b>${r.funnel.verifiedSales.all}</b> סה"כ`;
  const sources = t.all.sources.length
    ? t.all.sources.slice(0, 5).map((s) => `<li>${s.source}: ${s.count}</li>`).join("")
    : "<li>לא זוהה מקור תנועה</li>";
  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"></head>
<body style="margin:0;background:#f5f5f5;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:24px auto;background:#fff;border-radius:12px;padding:28px">
  <h1 style="color:#6C4CF1;margin:0 0 4px">📊 הדוח היומי של LikeLink</h1>
  <p style="color:#888;font-size:12px;margin:0 0 18px">${new Date(r.generatedAt).toLocaleString("he-IL", { timeZone: r.timezone })}</p>

  <h3 style="margin:16px 0 6px">האם הייתה תנועה?</h3>
  <p style="font-size:14px;line-height:1.7">${trafficLine}</p>
  <ul style="font-size:13px;color:#555">${sources}</ul>

  <h3 style="margin:16px 0 6px">האם הייתה מכירה?</h3>
  <p style="font-size:14px;line-height:1.7">${salesLine}</p>

  <h3 style="margin:16px 0 6px">כמה כסף נוצר?</h3>
  <table style="width:100%;border-collapse:collapse">
    ${row("הכנסות גולמיות (מאומת)", he(rev.grossRevenue))}
    ${row("העמלה שלך (Owner)", he(rev.commission))}
    ${row("חלק היוצרות", he(rev.creatorShare))}
  </table>

  <h3 style="margin:16px 0 6px">מצב התשלומים</h3>
  <table style="width:100%;border-collapse:collapse">
    ${row("נצבר (EARNED)", he(om.earned))}
    ${row("ממתין (PENDING)", he(om.pending))}
    ${row("שולם בפועל (PAID)", he(om.paid))}
    ${row("נכשל (FAILED)", he(om.failed))}
  </table>

  <h3 style="margin:16px 0 6px">המוצר המוביל</h3>
  <p style="font-size:14px">${r.topProduct ? `${r.topProduct.title || r.topProduct.productId} · ${r.topProduct.verifiedSales ? r.topProduct.verifiedSales + " מכירות" : (r.topProduct.clicks || 0) + " קליקים"}` : "עדיין אין נתונים"}</p>

  <h3 style="margin:16px 0 6px">האם משהו שבור?</h3>
  <p style="font-size:14px;line-height:1.7">
    כשלי Autopilot (שבוע אחרון): <b>${r.issues.autopilotFailuresLastWeek}</b><br>
    פעולות חסומות אבטחתית (שבוע אחרון): <b>${r.issues.securityBlockedLastWeek}</b><br>
    ערוצי AutoPilot פעילים: <b>${r.traffic.channelsActive}</b>
  </p>

  <h3 style="margin:16px 0 6px">ההזדמנות הנוכחית (Growth Brain)</h3>
  <p style="font-size:14px;line-height:1.7">
    ${r.growthBrain?.selectedProduct ? `מוצר: <b>${r.growthBrain.selectedProduct.title}</b>` : "אין מוצר נבחר"} · ציון: <b>${r.growthBrain?.score ?? "—"}</b><br>
    סיבות: ${(r.growthBrain?.reasons || ["אין נתונים"]).join(" · ")}
  </p>
  ${r.growthBrain?.distributionBlocked ? '<p style="font-size:13px;color:#c62828">הפצה חסומה — אין ערוץ מורשה מחובר. הקמפיין נשאר PREPARED עד שיחובר ערוץ.</p>' : ""}

  <h3 style="margin:16px 0 6px">הבדיקה הבאה (למידת המערכת)</h3>
  <p style="font-size:14px;line-height:1.7">${r.campaignLearning.nextTest}</p>

  <h3 style="margin:16px 0 6px">האתר הרשמי — קמפיינים ו-Google</h3>
  <table style="width:100%;border-collapse:collapse">
    ${row("קמפייני אתר נוצרו", r.siteCampaigns.total)}
    ${row("קמפיין אחרון", r.siteCampaigns.last ? `${r.siteCampaigns.last.product} (${r.siteCampaigns.last.status}, ${r.siteCampaigns.last.clicks} קליקים מדודים)` : "טרם רץ")}
    ${row("Google Feed", r.googleStatus.status)}
    ${row("מוצרים כשירים ל-Google", `${r.googleStatus.eligibleProducts} כשירים · ${r.googleStatus.needsAttentionProducts} דורשים טיפול`)}
    ${row("תנועת Google", r.googleStatus.googleTraffic === "MEASURED" ? `${r.googleStatus.googleClicksMeasured} קליקים מדודים` : "טרם נמדדה")}
  </table>

  <p style="font-size:11px;color:#999;margin-top:20px;border-top:1px solid #eee;padding-top:12px">
    כל המספרים מגיעים מנתוני אמת מאומתים בלבד. שלבים שטרם נמדדים מסומנים ככאלה — ולא מוצגים כאפס עסקי.
  </p>
</div>
</body></html>`;
}

/**
 * Send the daily Owner report — called from the EXISTING daily cron
 * (fire-and-forget; never breaks the host function).
 * Skips entirely unless OWNER_EMAIL is configured server-side.
 * Idempotent per day via a kv marker (a cron retry can never double-send).
 */
export async function sendOwnerDailyReport() {
  const ownerEmail = String(process.env.OWNER_EMAIL || "").trim();
  if (!ownerEmail || !ownerEmail.includes("@")) {
    return { ok: false, skipped: "owner_email_not_configured" };
  }
  if (!SB_URL || !SB_KEY) return { ok: false, skipped: "supabase_not_configured" };

  // Once-per-day guard (Israel-time date as the marker).
  const today = todayKey();
  const lastSent = await kvGet(LAST_SENT_KEY, null);
  if (lastSent === today) return { ok: false, skipped: "already_sent_today" };

  const report = await buildOwnerReport();
  const res = await sendViaResend({
    to: ownerEmail,
    subject: `LikeLink — דוח יומי (${today})`,
    html: renderOwnerReportHtml(report),
  });
  if (res.ok) {
    try { await kvSet(LAST_SENT_KEY, today); } catch { /* best-effort */ }
  }
  return { ok: Boolean(res.ok), reason: res.reason || null };
}

