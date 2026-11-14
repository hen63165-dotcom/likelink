// Per-product performance (the owner's Master Execution Order, item 4), from production records
// only — never an estimate presented as a measurement, never a click presented as a purchase:
//   views        marketplace:clicks type "view": the product page or its reel seen (once per session)
//   exits        marketplace:clicks without a type / "click" / "outbound_click": "לחנות", the exit to the store
//   landings     marketplace:funnel "landing" whose page is /p/<id>: a visit that started on the product
//   plays        marketplace:engagement "play": its video started playing on a visitor's screen
//                (muted autoplay included, as the networks count a view)
//   completes    marketplace:engagement "complete": watched to ≥ 95% at least once
//   shares/saves marketplace:engagement "share" (with the network) / "save"
//   orders       affiliate:earnings (AliExpress order.list): real paid/confirmed orders of its item
//   commission   the store's ESTIMATE per item, labelled as such (settlement is not per item)
// Likes, comments and views ON the networks are not on LikeLink's servers: each is BLOCKED with the
// exact missing connection until a provider reports it. Pure: the caller reads the rows.
const DAY = 86_400_000;
const arr = (v) => (Array.isArray(v) ? v : []);
const US_OFFSET = 2n ** 51n;

/** The AliExpress item a catalog product points at (same rule as the catalog sync), or "". */
export function itemIdOf(p = {}) {
  const fromUrl = String(p.imageSource?.itemUrl || p.sourceUrl || "").match(/\/item\/(\d{10,20})\.html/);
  const fromId = String(p.id || "").match(/^ae-(\d{10,20})$/);
  const raw = String(p.aliexpressId || p.imageSource?.itemId || (fromUrl ? fromUrl[1] : "") || (fromId ? fromId[1] : "") || "");
  if (!/^\d{10,20}$/.test(raw)) return "";
  const n = BigInt(raw);
  return String(n >= US_OFFSET + 1000000000000000n ? n - US_OFFSET : n);
}

export const BLOCKED_METRICS = Object.freeze([
  { id: "ig_views", he: "צפיות ברילס באינסטגרם", missing: ["IG_USER_ID", "IG_ACCESS_TOKEN"], how: "מתחברים ל־Instagram Graph API; op=instagram-insights שומר את המספרים של אינסטגרם לכל רילס שפורסם" },
  { id: "ig_likes", he: "לייקים באינסטגרם", missing: ["IG_USER_ID", "IG_ACCESS_TOKEN"], how: "כמו למעלה" },
  { id: "ig_comments", he: "תגובות באינסטגרם", missing: ["IG_USER_ID", "IG_ACCESS_TOKEN"], how: "כמו למעלה" },
  { id: "tiktok", he: "צפיות, לייקים ותגובות בטיקטוק", missing: ["TIKTOK_ACCESS_TOKEN"], how: "בינתיים רושמים ידנית ב־Actions → TikTok results" },
  { id: "facebook", he: "צפיות, לייקים ותגובות בפייסבוק", missing: ["FB_PAGE_ID", "FB_PAGE_TOKEN"], how: "טוקן עמוד בשרת" },
]);

/** Every listed product's real numbers over `days`, and what cannot be measured yet. */
export function productTelemetry({ clicks = [], engagement = [], funnel = [], earnings = null, products = [], igConfigured = false, now = Date.now(), days = 30 } = {}) {
  const since = now - days * DAY;
  const fresh = (e) => Number(e?.ts) > since && Number(e?.ts) <= now + 5 * 60_000;
  const rows = new Map();
  const row = (id) => {
    if (!rows.has(id)) rows.set(id, { views: 0, exits: 0, landings: 0, plays: 0, completes: 0, shares: 0, saves: 0, shareNets: {} });
    return rows.get(id);
  };
  const seen = new Set();
  const once = (prefix, e) => { const k = `${prefix}|${e?.id || `${e?.productId}|${e?.ts}|${e?.type}`}`; if (seen.has(k)) return false; seen.add(k); return true; };
  const listed = arr(products).filter((p) => p && p.id && p.status === "approved");
  const ids = new Set(listed.map((p) => String(p.id)));

  for (const e of arr(clicks)) {
    if (!fresh(e) || !ids.has(String(e.productId)) || !once("c", e)) continue;
    const r = row(String(e.productId));
    if (e.type === "view") r.views++;
    else if (!e.type || e.type === "click" || e.type === "outbound_click") r.exits++;
  }
  for (const e of arr(engagement)) {
    if (!fresh(e) || !ids.has(String(e.productId)) || !once("g", e)) continue;
    const r = row(String(e.productId));
    if (e.type === "play") r.plays++;
    else if (e.type === "complete") r.completes++;
    else if (e.type === "save") r.saves++;
    else if (e.type === "share") { r.shares++; const n = e.net || "other"; r.shareNets[n] = (r.shareNets[n] || 0) + 1; }
  }
  for (const e of arr(funnel)) {
    if (e?.type !== "landing" || !fresh(e) || !once("f", e)) continue;
    const m = String(e.place || "").match(/^\/(?:likelink\/)?p\/([A-Za-z0-9_-]{1,80})\/?$/);
    if (m && ids.has(m[1])) row(m[1]).landings++;
  }

  const earningsOk = earnings && earnings.state === "OK" && earnings.amounts === "units";
  const items = earningsOk && earnings.items && typeof earnings.items === "object" ? earnings.items : {};
  const out = listed.map((p) => {
    const r = rows.get(String(p.id)) || row(String(p.id));
    const it = items[itemIdOf(p)] || null;
    return {
      id: p.id,
      title: String(p.title || "").slice(0, 60),
      views: r.views,
      landings: r.landings,
      exits: r.exits,
      plays: r.plays,
      completes: r.completes,
      // A share of the plays that were watched to the end; null without plays (never 0% of nothing).
      completionRate: r.plays ? Math.round((Math.min(r.completes, r.plays) / r.plays) * 1000) / 10 : null,
      shares: r.shares,
      shareNets: r.shareNets,
      saves: r.saves,
      orders: earningsOk ? (it?.orders ?? 0) : null,
      estimatedCommission: earningsOk ? (it?.estimatedCommission ?? null) : null,
    };
  });
  const active = (x) => x.views + x.exits + x.landings + x.plays + x.shares + x.saves + (x.orders || 0);
  out.sort((a, b) => active(b) - active(a) || String(a.id).localeCompare(String(b.id)));
  const sum = (k) => out.reduce((s, x) => s + (Number(x[k]) || 0), 0);
  return {
    at: new Date(now).toISOString(),
    windowDays: days,
    products: out,
    totals: { listed: out.length, active: out.filter((x) => active(x) > 0).length, views: sum("views"), landings: sum("landings"), exits: sum("exits"), plays: sum("plays"), completes: sum("completes"), shares: sum("shares"), saves: sum("saves"), orders: earningsOk ? sum("orders") : null },
    orders: earningsOk ? { state: "OK", checkedAt: earnings.checkedAt || null, note: "הזמנות אמיתיות מדוח השותפים של AliExpress; העמלה היא הערכה של החנות עד שהיא מאושרת" } : { state: earnings?.state || "NOT_READ_YET" },
    blocked: BLOCKED_METRICS.filter((m) => !(igConfigured && m.id.startsWith("ig_"))),
  };
}
