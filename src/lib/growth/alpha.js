// The LikeLink Alpha engine — one evidence object per product that the trend radar, the site's own
// catalog check and the magic button all read (the owner's MASTER EXECUTION DIRECTIVE, 2026-11-14:
// "Alpha Score from three independent evidence dimensions, configurable and versioned weights,
// missing components never invented, confidence kept apart from the score").
//
//   A. Global momentum (35%)  — AliExpress's own 30-day orders per item, read daily: the
//      acceleration shield (`accelerationOf`) — velocity, acceleration, consistency.
//   B. Israeli market gap (30%) — israelGap.js: Hebrew Google + YouTube searches, Trends Israel,
//      with its own confidence.
//   C. Private LikeLink signal (35%) — the site's own recorded events (views, exits to the store),
//      shrunk toward the site's average so a handful of events cannot make a high score; below
//      `minEvents` the component is MISSING (reason stated), never guessed.
//
// Alpha = Σ wᵢ·s′ᵢ / Σ wᵢ over the AVAILABLE components (renormalized), 0–100, where s′ = 0.5 +
// (s − 0.5)·cᵢ pulls an uncertain component toward neutral; no global momentum → no score. Confidence = Σ wᵢ·cᵢ
// over all three (a missing component contributes 0), so missing evidence lowers confidence, not
// the score. "Verified opportunity" needs confidence ≥ `verifiedConfidence` AND two components.
// Pure: no I/O. Every number it uses carries its source and date in `evidence`.

export const ALPHA = Object.freeze({
  version: "alpha-1.0",
  weights: Object.freeze({ global: 0.35, israel: 0.3, private: 0.35 }),
  minEvents: 20, // first-party events (30 days) before the private component counts
  shrinkViews: 30, // Beta prior strength for the exit rate
  verifiedConfidence: 0.55, // e.g. strong momentum (0.9) + an Israel gap held two days (HIGH): 0.315 + 0.27
  // Acceleration shield
  minReadings: 3,
  minSpanDays: 4,
  accelPts: 3, // %/week change between the earlier and the recent half that counts as (de)celerating
  risingWeek: 5,
  emergingWeek: 10,
  emergingOrders: 3000,
  decliningWeek: -5,
  consistency: 0.6,
});

export const ACCEL = Object.freeze({
  EMERGING: { he: "מתחיל לצמוח", hint: "עדיין קטן, וההזמנות עולות מהר ובעקביות" },
  ACCELERATING: { he: "מאיץ", hint: "ההזמנות עולות, ובימים האחרונים מהר יותר" },
  STABLE: { he: "יציב", hint: "בלי שינוי משמעותי" },
  DECELERATING: { he: "מאט", hint: "עדיין עולה, אבל לאט יותר" },
  DECLINING: { he: "יורד", hint: "ההזמנות יורדות" },
  INSUFFICIENT: { he: "אין מספיק היסטוריה", hint: "צריך 3 מדידות על פני 4 ימים לפחות" },
});

export const LIFECYCLE = Object.freeze({
  EMERGING: { he: "מתהווה" },
  ACCELERATING: { he: "מאיץ בעולם" },
  EXPANDING: { he: "מתפשט (כבר מתחיל בארץ)" },
  SATURATED: { he: "רווי" },
  DECLINING: { he: "בירידה" },
  UNKNOWN: { he: "עוד לא ידוע" },
});

const DAY = 86_400_000;
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / DAY;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const r1 = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : null);
const r2 = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : null);
const dm = (d) => `${Number(String(d).slice(8, 10))}.${Number(String(d).slice(5, 7))}`;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * The acceleration shield for one item: from its daily [date, 30-day orders] readings, the weekly
 * growth over the earlier half and the recent half of the window, their difference (acceleration),
 * and how many day-to-day steps went up (consistency). Never from fewer than `minReadings` readings
 * spanning `minSpanDays`.
 */
export function accelerationOf(series = [], { rules = ALPHA } = {}) {
  const rs = (Array.isArray(series) ? series : []).filter((r) => Array.isArray(r) && Number.isFinite(r[1]) && r[1] > 0).slice(-15);
  const out = { cls: "INSUFFICIENT", readings: rs.length, from: rs[0]?.[0] || null, to: rs.at(-1)?.[0] || null, orders: rs.at(-1)?.[1] ?? null };
  if (rs.length < rules.minReadings || days(rs[0][0], rs.at(-1)[0]) < rules.minSpanDays) return out;
  const steps = [];
  for (let i = 1; i < rs.length; i++) {
    const dt = days(rs[i - 1][0], rs[i][0]);
    if (dt > 0) steps.push({ dt, g: Math.pow(rs[i][1] / rs[i - 1][1], 1 / dt) - 1 });
  }
  const weekly = (list) => { const t = list.reduce((s, x) => s + x.dt, 0); const lg = list.reduce((s, x) => s + Math.log(1 + x.g) * x.dt, 0); return t > 0 ? (Math.exp((lg / t) * 7) - 1) * 100 : null; };
  const half = Math.max(1, Math.floor(steps.length / 2));
  const earlier = weekly(steps.slice(0, half));
  const recent = weekly(steps.slice(-half));
  const overall = weekly(steps);
  const moving = steps.filter((s) => Math.abs(s.g) > 1e-9);
  const consistency = moving.length ? moving.filter((s) => s.g > 0).length / moving.length : 0;
  const accel = recent - earlier;
  let cls = "STABLE";
  if (overall <= rules.decliningWeek || (recent <= rules.decliningWeek && consistency < 0.5)) cls = "DECLINING";
  else if (recent >= rules.emergingWeek && out.orders < rules.emergingOrders && consistency >= rules.consistency) cls = "EMERGING";
  else if (recent >= rules.risingWeek && accel >= rules.accelPts && consistency >= rules.consistency) cls = "ACCELERATING";
  else if (earlier >= rules.risingWeek && accel <= -rules.accelPts) cls = "DECELERATING";
  else if (overall >= rules.emergingWeek && consistency >= rules.consistency) cls = "ACCELERATING";
  return { ...out, cls, weekPct: r1(overall), earlierWeek: r1(earlier), recentWeek: r1(recent), accelPts: r1(accel), consistency: r2(consistency), ordersFirst: rs[0][1] };
}

/** The opportunity's place in its life, from the shield and the Israel gap. */
export function lifecycleOf(acc, gap) {
  const c = acc?.cls;
  const g = gap?.state;
  if (c === "DECLINING") return "DECLINING";
  if (!c || c === "INSUFFICIENT") return g === "ARRIVED" ? "SATURATED" : "UNKNOWN";
  if ((c === "STABLE" || c === "DECELERATING") && g === "ARRIVED") return "SATURATED";
  if ((c === "ACCELERATING" || c === "EMERGING") && (g === "ARRIVED" || g === "ARRIVING")) return "EXPANDING";
  if (c === "EMERGING") return "EMERGING";
  if (c === "ACCELERATING") return "ACCELERATING";
  if (c === "DECELERATING") return "SATURATED";
  return g === "ARRIVED" ? "SATURATED" : "UNKNOWN";
}

/**
 * The private LikeLink signal from the site's own events for a set of products/concept (30 days):
 * views and exits to the store, deduplicated by event id. The exit rate is shrunk toward the site's
 * own average (Beta prior), so 1 exit from 1 view is not 100%. Below `minEvents` → missing.
 */
export function privateSignal(events = [], { productIds = [], camp = "", now = Date.now(), siteRate = null, rules = ALPHA } = {}) {
  const ids = new Set(productIds.filter(Boolean));
  const since = now - 30 * DAY;
  const seen = new Set();
  let views = 0, exits = 0;
  for (const e of Array.isArray(events) ? events : []) {
    if (!e || Number(e.ts) < since || Number(e.ts) > now + DAY) continue;
    const key = String(e.id || `${e.productId}|${e.ts}|${e.type || "exit"}`);
    if (seen.has(key)) continue;
    const mine = ids.has(String(e.productId || "")) || (camp && e.med === "radar" && e.camp === camp);
    if (!mine) continue;
    seen.add(key);
    if (e.type === "view") views++;
    else if (!e.type) exits++;
  }
  const n = views + exits;
  if (n < rules.minEvents) return { available: false, reason: `רק ${n} אירועים באתר ב־30 יום (צריך ${rules.minEvents})`, views, exits };
  const prior = Number.isFinite(siteRate) && siteRate > 0 ? siteRate : 0.1;
  const a = prior * rules.shrinkViews;
  const shrunk = (exits + a) / (Math.max(views, exits) + rules.shrinkViews);
  return { available: true, views, exits, rate: r2(shrunk), score: clamp(shrunk / (2 * prior)), confidence: clamp(n / (rules.minEvents * 4), 0.3, 0.9) };
}

const GLOBAL_BASE = { EMERGING: 0.85, ACCELERATING: 0.8, STABLE: 0.4, DECELERATING: 0.25, DECLINING: 0.05 };
const ISRAEL_SCORE = { GAP: 1, QUIET: 0.7, UNCERTAIN: 0.6, ARRIVING: 0.5, ARRIVED: 0.15 };
const CONF = { HIGH: 0.9, MEDIUM: 0.6, LOW: 0.3 };

/**
 * The Alpha object. Inputs are evidence already measured elsewhere: `acc` (accelerationOf), `gap`
 * (israelGap.js gapOf / the board's gap), `priv` (privateSignal). Returns the score, each
 * component (score, confidence, evidence, or the reason it is missing), confidence, coverage and
 * the calculation version.
 */
export function alphaOf({ acc = null, gap = null, priv = null, rules = ALPHA } = {}) {
  const comps = {};
  if (acc && acc.cls && acc.cls !== "INSUFFICIENT") {
    const s = clamp(GLOBAL_BASE[acc.cls] + clamp((acc.recentWeek ?? 0) / 100, -0.1, 0.15));
    const c = acc.readings >= 7 ? 0.9 : acc.readings >= 4 ? 0.7 : 0.5;
    comps.global = { score: r2(s), confidence: c, evidence: `${ACCEL[acc.cls].he}: ${acc.weekPct > 0 ? "+" : ""}${acc.weekPct}% בשבוע בהזמנות של 30 יום (${dm(acc.from)}–${dm(acc.to)}, ${acc.readings} מדידות, אליאקספרס)` };
  } else comps.global = { missing: acc ? `אין מספיק היסטוריה (${acc.readings || 0} מדידות)` : "אין פריט נמדד" };
  if (gap && Object.hasOwn(ISRAEL_SCORE, gap.state)) {
    comps.israel = { score: ISRAEL_SCORE[gap.state], confidence: CONF[gap.confidence] ?? 0.3, evidence: `בישראל: ${gap.he || gap.state}${gap.confidenceHe ? ` (${gap.confidenceHe})` : ""} — גוגל ויוטיוב בעברית` };
  } else comps.israel = { missing: "פער ישראל לא נמדד לסוג הזה" };
  if (priv && priv.available) comps.private = { score: r2(priv.score), confidence: priv.confidence, evidence: `באתר: ${priv.views} צפיות, ${priv.exits} יציאות לחנות ב־30 יום` };
  else comps.private = { missing: priv?.reason || "אין נתוני מבקרים" };

  const avail = Object.entries(comps).filter(([, c]) => !c.missing);
  const wSum = avail.reduce((s, [k]) => s + rules.weights[k], 0);
  // Each component is pulled toward the neutral 0.5 by its own confidence (an uncertain "100" is not
  // 100), and without global momentum — the core evidence — there is no score at all: a gap in
  // Israel alone is not an opportunity (the first real run gave such concepts 100, 2026-11-14).
  const shrunk = (c) => 0.5 + (c.score - 0.5) * c.confidence;
  const score = comps.global.missing ? null : wSum > 0 ? Math.round((avail.reduce((s, [k, c]) => s + rules.weights[k] * shrunk(c), 0) / wSum) * 100) : null;
  const confidence = r2(avail.reduce((s, [k, c]) => s + rules.weights[k] * c.confidence, 0));
  const verified = score !== null && avail.length >= 2 && confidence >= rules.verifiedConfidence;
  return {
    version: rules.version,
    weights: rules.weights,
    score,
    confidence,
    confidenceHe: confidence >= 0.6 ? "ודאות גבוהה" : confidence >= 0.35 ? "ודאות בינונית" : "ודאות נמוכה",
    coverage: `${avail.length}/3`,
    verified,
    components: comps,
    missing: Object.entries(comps).filter(([, c]) => c.missing).map(([k, c]) => ({ k, reason: c.missing })),
    ...(score === null && !comps.global.missing ? {} : score === null ? { noScore: "אין ציון בלי מומנטום עולמי נמדד" } : {}),
  };
}

const AUDIENCE = {
  kids: "הורים לילדים בגילאי גן ובית ספר, וסבים שקונים מתנה",
  kitchen: "מי שמבשלת בבית כל יום ואוהבת כלים שחוסכים זמן",
  home: "מי שמסדרת בית או דירה קטנה ומחפשת סדר בלי שיפוץ",
  hair: "נשים ונערות שמחפשות תסרוקת מהירה ליומיום",
  makeup: "מי שמתאפרת בבית ומחפשת כלי מדויק במחיר נמוך",
  bracelets: "נשים שאוהבות תכשיט עדין ליומיום או למתנה",
  rings: "נשים שאוהבות טבעות עדינות ושילובים",
  earrings: "נשים שמחפשות עגיל יומיומי שמשדרג לוק",
  necklaces: "נשים שמחפשות שרשרת עדינה ליומיום או למתנה",
  bags: "מי שמחפשת תיק פרקטי ויפה ליומיום",
  gadgets: "מי שאוהבת גאדג׳טים קטנים שפותרים בעיה יומיומית",
  car: "נהגים שמבלים זמן ברכב ורוצים סדר ונוחות",
  pets: "בעלי חיות מחמד בבית ובדירה",
  fitness: "נשים שמתאמנות בבית או בסטודיו",
  clothing: "נשים שמחפשות פריט עונתי מעודכן",
  watches: "מי שמחפשת שעון יפה במחיר נגיש",
};

/**
 * The plain-Hebrew explanation of one opportunity, written ONLY from the evidence object (no
 * generic copy): why it was selected, why now, the audience (by the kind of item — a rule, labelled
 * as such), the positioning and sales angle, the risks and what is still missing.
 */
export function explain({ alpha, acc, gap, kind = "", price = null, momentumHot = false } = {}) {
  const why = [];
  const now = [];
  const risks = [];
  if (acc && acc.cls !== "INSUFFICIENT") why.push(`${ACCEL[acc.cls].he} באליאקספרס: ${acc.weekPct > 0 ? "+" : ""}${acc.weekPct}% בשבוע (${dm(acc.from)}–${dm(acc.to)}).`);
  if (momentumHot) why.push("הפריט עצמו מאיץ השבוע.");
  if (gap?.state === "GAP") { why.push("בישראל עוד לא מחפשים את זה בעברית (גוגל ויוטיוב)."); now.push("עולה בעולם ועוד לא כאן: מי שמגיעה ראשונה מגיעה לפני כולם."); }
  if (gap?.state === "ARRIVING") now.push("בישראל מתחילים לחפש את זה: החלון נסגר בקרוב.");
  if (acc?.cls === "ACCELERATING" || acc?.cls === "EMERGING") now.push(`הקצב עלה מ־${acc.earlierWeek}% ל־${acc.recentWeek}% בשבוע בין חצי המדידות הראשון לשני.`);
  if (gap?.state === "ARRIVED") risks.push("כבר מחפשים את זה בישראל: תחרות של מוכרים ותוכן.");
  if (gap?.state === "UNCERTAIN") risks.push("פער ישראל נמדד במקור אחד בלבד.");
  if (acc?.cls === "DECELERATING") risks.push("הקצב מאט.");
  if (acc?.cls === "DECLINING") risks.push("ההזמנות יורדות.");
  if (acc && acc.consistency !== undefined && acc.consistency < 0.6 && acc.cls !== "INSUFFICIENT") risks.push(`עלייה לא עקבית (${Math.round(acc.consistency * 100)}% מהימים עלו).`);
  if (alpha && !alpha.verified) risks.push("עוד לא הזדמנות מאומתת: חסרות ראיות (ראו למטה).");
  const angle = gap?.state === "GAP" ? "״לפני שזה מגיע לארץ״: להראות את המוצר בשימוש אמיתי ולהסביר מה הוא פותר"
    : gap?.state === "ARRIVED" ? "זווית משלך: השוואה, טיפ שימוש או התאמה אישית — לא עוד ״תראו מה הגיע״"
      : "להראות את המוצר בשימוש ביום־יום, עם הקישור בתגובה";
  return {
    why,
    now,
    audience: AUDIENCE[kind] ? { text: AUDIENCE[kind], basis: "לפי סוג המוצר (כלל קבוע, לא נתון מדוד)" } : null,
    positioning: Number(price) > 0 ? `מ־₪${price} באליאקספרס, עם משלוח לישראל` : null,
    angle,
    risks,
    missing: alpha ? alpha.missing.map((m) => m.reason) : [],
  };
}

export const VERDICTS = Object.freeze({
  KEEP: { he: "נשאר בחנות", hint: "עומד בכל התנאים: מאיץ, מתהווה או חם עכשיו" },
  ARCHIVE_PROPOSED: { he: "לארכיון", hint: "לא עומד בתנאי: יורד, רווי, בלי תאוצה, או נכשל בבדיקת איכות" },
  HOLD: { he: "ממתין למדידה", hint: "אין עדיין מספיק נתונים כדי לקבוע — לא מעבירים לארכיון בגלל חוסר מידע" },
});

/**
 * The 8 criteria of the hot-only policy (the owner's Master Execution Order, item 1), each true,
 * false or null (not measured — never a fail on its own):
 *   1 hot now · 2 gaining momentum · 3 rising, not falling · 4 not saturated in Israel ·
 *   5 real demand (≥ 300 orders in 30 days) · 6 ships to Israel · 7 pays a commission ·
 *   8 quality (own affiliate link, a store photo, a store-checked price, ≥ 95% satisfaction).
 * `facts` come from the store's own product answer (booleans only; the rate is never kept).
 */
export function criteriaOf(product = {}, { acc = null, gap = null, hot = null, facts = null } = {}) {
  const c = acc?.cls;
  const measured = c && c !== "INSUFFICIENT";
  const link = /^https:\/\/s\.click\.aliexpress\.com\//.test(String(product.affiliateUrl || ""));
  const quality = !link || !product.image ? false : facts?.satisfied === false ? false : product.priceSource === "aliexpress_api" && facts?.satisfied === true ? true : null;
  return [
    { id: "hot", he: "חם עכשיו (ההזמנות של הפריט מאיצות השבוע)", ok: hot === "HOT" ? true : hot && hot !== "UNVERIFIED" ? false : null },
    { id: "momentum", he: "צובר תאוצה", ok: measured ? c === "ACCELERATING" || c === "EMERGING" : null },
    { id: "direction", he: "עולה ולא יורד", ok: measured ? c !== "DECLINING" && c !== "DECELERATING" : null },
    { id: "israel", he: "לא רווי בישראל", ok: gap?.state === "ARRIVED" ? (c === "ACCELERATING" || c === "EMERGING" ? null : false) : gap && ["GAP", "QUIET", "ARRIVING"].includes(gap.state) ? true : null },
    { id: "demand", he: "ביקוש אמיתי (300 הזמנות ומעלה ב־30 יום)", ok: Number.isFinite(facts?.orders) ? facts.orders >= 300 || c === "EMERGING" : null },
    { id: "ships", he: "אפשר להזמין לישראל", ok: facts ? facts.ships === true : null },
    { id: "commission", he: "יש עמלת שותפים", ok: typeof facts?.commission === "boolean" ? facts.commission : null },
    { id: "quality", he: "איכות ואמינות (קישור שותפים, תמונה, מחיר מהחנות, 95% שביעות רצון)", ok: quality },
  ];
}

/**
 * One site product against the hot-only policy (the owner, 2026-11-14: "not ordinary products to
 * fill the shop; not products that lost momentum or are saturated; not only because they sell a
 * lot now"). KEEP needs momentum AND no failed hard criterion; any failed criterion archives;
 * missing evidence holds (never archives).
 */
export function catalogVerdict(product = {}, { acc = null, gap = null, hot = null, facts = null } = {}) {
  const criteria = criteriaOf(product, { acc, gap, hot, facts });
  const failed = criteria.filter((x) => x.ok === false);
  const hard = failed.filter((x) => ["ships", "commission", "quality", "demand"].includes(x.id));
  if (hard.length) return { verdict: "ARCHIVE_PROPOSED", reasons: hard.map((x) => `נכשל: ${x.he}`), criteria };
  const c = acc?.cls;
  if (hot === "HOT" || c === "ACCELERATING" || c === "EMERGING") {
    if (c === "DECLINING") return { verdict: "ARCHIVE_PROPOSED", reasons: ["ההזמנות יורדות"], criteria };
    return { verdict: "KEEP", reasons: [c === "EMERGING" || c === "ACCELERATING" ? ACCEL[c].he : "חם עכשיו"], criteria };
  }
  if (!c || c === "INSUFFICIENT") return { verdict: "HOLD", reasons: [ACCEL.INSUFFICIENT.hint], criteria };
  if (c === "DECLINING") return { verdict: "ARCHIVE_PROPOSED", reasons: ["ההזמנות יורדות"], criteria };
  if (gap?.state === "ARRIVED") return { verdict: "ARCHIVE_PROPOSED", reasons: [`${ACCEL[c].he}, וכבר מחפשים את זה בישראל (רווי)`], criteria };
  return { verdict: "ARCHIVE_PROPOSED", reasons: [`${ACCEL[c].he}: נמכר, אבל בלי תאוצה`], criteria };
}

const STORE_IMG = /^https:\/\/([a-z0-9-]+\.)*(aliexpress-media\.com|alicdn\.com)\/\S+$/i;
const CHANNELS = Object.freeze([
  { id: "instagram_reel", he: "רילס באינסטגרם", slot: "12:45", source: "instagram", medium: "reel" },
  { id: "tiktok", he: "טיקטוק", slot: "20:30", source: "tiktok", medium: "video" },
  { id: "facebook_page", he: "עמוד פייסבוק", slot: "19:00", source: "facebook", medium: "reel" },
]);
export const AUTOPOST = Object.freeze({
  instagram_reel: "BLOCKED: אין IG_USER_ID ו־IG_ACCESS_TOKEN בשרת (פונקציית Edge), ופרסום רק אחרי אישור שלך",
  tiktok: "BLOCKED: לטיקטוק אין ממשק פרסום פתוח לחשבון שלך; מעלים ידנית",
  facebook_page: "BLOCKED: אין טוקן עמוד בשרת; Upload-Post הגיע למכסה החודשית",
});

/**
 * One product's promotion kit (Master Execution Order, item 3) — a DRAFT for approval, nothing is
 * posted. Locked to the product's verified store photos: every storyboard shot names the exact
 * photo, and the kit HALTS (with the reason) when there are fewer than 2 store photos or no
 * store-checked price, instead of inventing a look. Hooks come from the truth-checked hook engine
 * (likeloop.js buildHookSet, passed in). The comment word is ״קישור״ (the comment bot answers it).
 */
export function kitOf(product = {}, { hooks = [], origin = "", why = [], now = Date.now() } = {}) {
  if (!product.id) return null;
  const photos = (Array.isArray(product.images) ? product.images : []).filter((u) => STORE_IMG.test(String(u))).slice(0, 4);
  const flags = [];
  if (photos.length < 2) flags.push(`רק ${photos.length} תמונות מאומתות מהחנות (צריך 2 לפחות)`);
  if (!(Number(product.price) > 0) || product.priceSource !== "aliexpress_api") flags.push("אין מחיר מאומת מהחנות");
  const usable = (Array.isArray(hooks) ? hooks : []).filter((h) => h && typeof h.text === "string" && h.text.length <= 70 && h.text.split(/\s+/).length <= 8);
  if (!usable.length) flags.push("אין Hook שעבר את בדיקת האמת");
  const base = `${String(origin).replace(/\/+$/, "")}/p/${encodeURIComponent(product.id)}`;
  // One exact tracked address per channel and variant (the site's own landing tracker reads the utm).
  const tracked = (v, source = "instagram", medium = "reel") => `${base}?utm_source=${source}&utm_medium=${medium}&utm_campaign=radar_${encodeURIComponent(product.id)}&utm_content=${v}`;
  const title = String(product.title || "").slice(0, 60);
  if (flags.length) return { productId: product.id, status: "HALTED", flags, link: tracked("a") };
  const variants = usable.slice(0, 3).map((h, k) => {
    const v = "abc"[k];
    return {
      variant: v,
      hookType: h.type,
      hook3s: h.text,
      title: `${h.text} | ${title}`.slice(0, 90),
      script: [
        h.text,
        `${title}. ככה זה נראה מקרוב, בדיוק כמו בתמונות של המוכר.`,
        why[0] ? why[0] : "בודקים בעמוד המוצר את המידה והצבע לפני שמזמינים.",
        "רוצים את הקישור? כתבו ״קישור״ בתגובות ונשלח לכם.",
      ],
      caption: `#פרסומת · קישור שותפים\n${h.text}\n${title}\nכתבו ״קישור״ בתגובות ונשלח לכם את הקישור.`,
      link: tracked(v),
    };
  });
  return {
    productId: product.id,
    status: "DRAFT_FOR_APPROVAL",
    createdAt: new Date(now).toISOString(),
    cta: "כתבו ״קישור״ ונשלח לכם",
    storyboard: [
      { t: "0–3s", shot: "Hook על התמונה הראשונה, קרוב", photo: photos[0] },
      { t: "3–7s", shot: "פרט מקרוב מהתמונה השנייה", photo: photos[1] },
      { t: "7–11s", shot: photos[2] ? "המוצר בשימוש / מזווית נוספת" : "חזרה לתמונה הראשונה, תקריב איטי", photo: photos[2] || photos[0] },
      { t: "11–14s", shot: "שם המוצר + הקריאה לתגובה", photo: photos[3] || photos[1] },
    ],
    lock: "מציגים רק את מה שבתמונות המוכר: אותו דגם, צבע ומבנה. לא מוסיפים תכונה שלא כתובה בחנות.",
    video: product.videoUrl ? "יש סרטון באתר" : product.sellerVideo ? "יש סרטון מוכר לעריכה" : "סרטון מתמונות החנות בלבד",
    variants,
    link: variants[0].link,
    queue: CHANNELS.map((ch) => ({ channel: ch.id, he: ch.he, slot: ch.slot, status: "READY_FOR_APPROVAL", link: tracked("a", ch.source, ch.medium), autopost: AUTOPOST[ch.id] })),
  };
}
