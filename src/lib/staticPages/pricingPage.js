// public/pricing.html — rendered ONLY from src/lib/plans.js and the
// cancellation terms (src/lib/billing/cancellation.js). Regenerate with
// `npm run pages:build`; tests/plansConsistency.test.mjs fails if the file on
// disk, the entitlements or the PayPal plan payloads disagree with this model.
import { getAllPlans, FEATURES, planFeatureRows } from "../plans.js";
import { COOLING_OFF_DAYS, CANCEL_FEE_CAP_ILS, CANCEL_EFFECT_BUSINESS_DAYS } from "../billing/cancellation.js";
import { legalPath } from "../legal/catalog.js";
import { pageShell, esc } from "./layout.js";

const SHOWN = ["free", "starter", "professional", "elite"];

/** The machine-readable model the page is rendered from (embedded in the page). */
export function pricingModel() {
  return {
    currency: "ILS",
    plans: getAllPlans().filter((p) => SHOWN.includes(p.id)).map((p) => ({
      id: p.id,
      name: p.name.he,
      price: p.price,
      priceYearly: p.priceYearly,
      purchasable: Boolean(p.purchasable && !p.comingSoon),
      comingSoon: Boolean(p.comingSoon),
      // A waitlist plan promises nothing, so it lists no features or quotas.
      quotas: p.comingSoon ? null : p.quotas,
      rows: p.comingSoon ? [] : planFeatureRows(p.id).filter((r) => r.status === "live").map((r) => ({ id: r.id, included: r.included, detail: r.detail })),
    })),
    soon: FEATURES.filter((f) => f.status === "soon").map((f) => f.id),
  };
}

function priceBlock(p) {
  if (p.price === 0) return `<p class="price"><span class="amount">₪0</span> <span class="per">לתמיד</span></p>`;
  const saving = p.price * 12 - p.priceYearly;
  return `<p class="price"><span class="amount">₪${p.price}</span> <span class="per">לחודש</span></p>
<p class="yearly">או ₪${p.priceYearly} ל-12 חודשים${saving > 0 ? ` (חיסכון של ₪${saving})` : ""}</p>`;
}

function cta(p) {
  if (p.comingSoon) return `<a class="btn ghost" href="/sell?plan=${esc(p.id)}">הצטרפות לרשימת ההמתנה</a>`;
  if (!p.purchasable) return `<a class="btn ghost" href="/studio">כניסה לסטודיו בחינם</a>`;
  return `<a class="btn" href="/sell?plan=${esc(p.id)}">בחירת ${esc(p.name.he)}</a>`;
}

function planCard(p) {
  if (p.comingSoon) {
    return `<article class="plan soon-plan" aria-labelledby="plan-${p.id}">
<p class="tag">בקרוב</p>
<h3 id="plan-${p.id}">${esc(p.name.he)}</h3>
${priceBlock(p)}
<p class="tagline">המסלול עדיין לא זמין לרכישה ואין בו כרגע התחייבות לתכונות. אפשר להצטרף לרשימת ההמתנה, ללא תשלום, ולקבל עדכון כשייפתח.</p>
${cta(p)}
</article>`;
  }
  const items = planFeatureRows(p.id).filter((r) => r.status === "live" && r.included)
    .map((r) => `<li>${esc(r.he)}${r.detail ? ` — <strong>${esc(r.detail)}</strong>` : ""}</li>`).join("");
  return `<article class="plan${p.id === "professional" ? " featured" : ""}" aria-labelledby="plan-${p.id}">
<h3 id="plan-${p.id}">${esc(p.name.he)}</h3>
<p class="tagline">${esc(p.tagline.he)}</p>
${priceBlock(p)}
<ul class="inc">${items}</ul>
<p class="locked">${esc(p.locked.he)}</p>
${cta(p)}
</article>`;
}

function cell(planId, f) {
  if (f.status === "soon") return `<td class="c-soon">בקרוב</td>`;
  const v = f.plans[planId];
  if (!v) return `<td class="c-no">לא כלול</td>`;
  if (v === true) return `<td class="c-yes">כלול</td>`;
  if (typeof v === "string") return `<td class="c-yes">${esc(v)}</td>`;
  return `<td class="c-yes">${v.monthly != null ? `עד ${v.monthly} בחודש` : `עד ${v.total}`}</td>`;
}

function comparisonTable() {
  const cols = getAllPlans().filter((p) => ["free", "starter", "professional"].includes(p.id));
  const head = cols.map((p) => `<th scope="col">${esc(p.name.he)}</th>`).join("");
  const rows = FEATURES.map((f) => `<tr><th scope="row">${esc(f.he)}</th>${cols.map((p) => cell(p.id, f)).join("")}</tr>`).join("\n");
  return `<div class="table-wrap" role="region" aria-label="השוואת מסלולים" tabindex="0"><table>
<caption>מה כלול בכל מסלול</caption>
<thead><tr><th scope="col">תכונה</th>${head}</tr></thead>
<tbody>
${rows}
</tbody></table></div>`;
}

const EXTRA_CSS = `
.plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px;margin:24px 0}
.plan{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:20px;display:flex;flex-direction:column;gap:6px}
.plan.featured{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.plan h3{margin:0;font-size:20px}
.tagline{color:var(--muted);margin:0}
.price{margin:8px 0 0}
.amount{font-size:30px;font-weight:800}
.per,.yearly{color:var(--muted);font-size:14px;margin:0}
.inc{padding-inline-start:18px;margin:10px 0;font-size:15px}
.inc li{margin:4px 0}
.locked{font-size:14px;color:var(--muted);margin:0 0 10px}
.tag{display:inline-block;align-self:flex-start;background:var(--soon-bg);color:var(--soon);font-weight:700;font-size:13px;padding:2px 10px;border-radius:99px;margin:0}
.soon-plan{border-style:dashed}
.btn{margin-top:auto;display:block;text-align:center;background:var(--accent);color:var(--accent-ink);text-decoration:none;font-weight:700;padding:11px 14px;border-radius:12px}
.btn.ghost{background:transparent;color:var(--accent);border:1px solid var(--accent)}
.table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
table{border-collapse:collapse;width:100%;min-width:560px;font-size:15px}
caption{text-align:start;padding:12px 14px;font-weight:700}
th,td{border-top:1px solid var(--line);padding:10px 14px;text-align:start;vertical-align:top}
thead th{background:var(--bg)}
.c-yes{color:var(--ok);font-weight:600}.c-no{color:var(--muted)}.c-soon{color:var(--soon)}
`;

export function renderPricingPage() {
  const plans = getAllPlans().filter((p) => SHOWN.includes(p.id));
  const soon = FEATURES.filter((f) => f.status === "soon");
  const body = `
<h1>מסלולים ומחירים</h1>
<p class="lead">אפשר להתחיל בחינם ולשדרג או לבטל בכל עת. המחירים בשקלים, והמחיר שמוצג הוא המחיר הסופי לתשלום. המסלול קובע אילו כלים זמינים לך ובאיזו כמות, והוא לא מבטיח מכירות, הכנסה, חשיפה או תנועה.</p>
<section class="plans" aria-label="המסלולים">
${plans.map(planCard).join("\n")}
</section>

<h2>השוואה מלאה</h2>
${comparisonTable()}

<h2>מה עוד לא זמין</h2>
<p>התכונות האלה נמצאות בפיתוח. הן לא כלולות כרגע באף מסלול, ולא גובים עליהן תשלום:</p>
<ul>${soon.map((f) => `<li>${esc(f.he)}</li>`).join("")}</ul>

<h2>איך עובדות המכסות</h2>
<ul>
<li>מכסה חודשית מתאפסת בתחילת כל חודש קלנדרי. מכסה כוללת (למשל מספר המוצרים) נספרת לאורך כל התקופה.</li>
<li>כשמגיעים למכסה, הפעולה לא מתבצעת ומוצגת הודעה. אין חיוב נוסף, ואין חיוב על שימוש מעבר למכסה.</li>
<li>מוצרים קיימים אף פעם לא נמחקים בגלל מכסה. אפשר תמיד לערוך אותם או למחוק אותם.</li>
</ul>

<h2>חיוב, חידוש וביטול</h2>
<ul>
<li><strong>מסלול חודשי:</strong> החיוב מתבצע מראש בכל חודש דרך PayPal, והמנוי מתחדש כל חודש עד שמבטלים אותו.</li>
<li><strong>מסלול שנתי:</strong> החיוב מתבצע פעם אחת, מראש, לתקופה של 12 חודשים. המסלול לא מתחדש אוטומטית, ובסיום התקופה הגישה חוזרת למסלול החינמי.</li>
<li><strong>ביטול:</strong> אפשר לבטל בכל עת מהסטודיו, בכפתור "ביטול מנוי", או מחשבון ה-PayPal. הביטול נכנס לתוקף תוך ${CANCEL_EFFECT_BUSINESS_DAYS} ימי עסקים לכל היותר, ולא יהיו חיובים נוספים אחריו.</li>
<li><strong>ביטול בתוך ${COOLING_OFF_DAYS} יום מהתשלום הראשון:</strong> מקבלים החזר של הסכום ששולם, בניכוי דמי ביטול של 5% מהמחיר או ₪${CANCEL_FEE_CAP_ILS}, לפי הנמוך מביניהם. הגישה למסלול מסתיימת עם הביטול.</li>
<li><strong>ביטול מאוחר יותר:</strong> במסלול חודשי הגישה נשארת עד סוף החודש ששולם. במסלול שנתי הגישה נשארת עד סוף החודש הנוכחי, ומקבלים החזר יחסי על החודשים המלאים שעוד לא התחילו.</li>
<li>ההחזר מבוצע לחשבון ה-PayPal שממנו שולם, תוך 14 ימים מהביטול.</li>
</ul>
<p class="note">הפרטים המלאים נמצאים ב<a href="${legalPath("cancellation")}">מדיניות הביטולים וההחזרים</a> וב<a href="${legalPath("terms")}">תנאי השימוש</a>. השירות מיועד לבני 18 ומעלה.</p>
`;
  return pageShell({
    title: "מסלולים ומחירים · LikeLink",
    description: "מסלולי LikeLink: חינמי, Starter ב-₪29 לחודש ו-Professional ב-₪79 לחודש. מה כלול, המכסות, ואיך מבטלים.",
    path: "/pricing",
    body,
    extraCss: EXTRA_CSS,
    dataJson: pricingModel(),
  });
}
