// The owner's five numbers, from production records only (the owner,
// 2026-11-03: "measure exposure, visits, clicks, purchases, commission — real
// data only; never a click as a purchase, never an estimate as income").
// Pure: the caller reads the server-only rows and hands them in.
//   visits      marketplace:funnel "landing": one per browser session (trackLanding)
//   sources     the landing's utm source, else the referrer host, else "direct"
//   views       marketplace:clicks type "view": a product page seen
//   outbound    marketplace:clicks without a type / "click" / "outbound_click":
//               the "לחנות" button, the exit to the store
//   purchases   affiliate:earnings (AliExpress order.list): paid / confirmed apart
//   commission  the store's estimate apart from what was settled
//   exposure    impressions are not on LikeLink's servers: Search Console and
//               each network report them; named as such, never invented.

const DAY = 86_400_000;
const isView = (c) => c?.type === "view";
const isOutbound = (c) => !c?.type || c.type === "click" || c.type === "outbound_click";

function top(map, n = 5) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, n).map(([key, count]) => ({ key, count }));
}

export function growthMetrics({ funnel = [], clicks = [], earnings = null, products = [], now = Date.now() } = {}) {
  const within = (days) => (e) => Number(e?.ts) > now - days * DAY && Number(e?.ts) <= now + 5 * 60_000;
  const landings = (Array.isArray(funnel) ? funnel : []).filter((e) => e?.type === "landing");
  const events = Array.isArray(clicks) ? clicks : [];
  const titles = new Map((Array.isArray(products) ? products : []).map((p) => [p?.id, String(p?.title || "").slice(0, 60)]));

  const visits = { d1: landings.filter(within(1)).length, d7: landings.filter(within(7)).length, d30: landings.filter(within(30)).length };
  const sources = new Map();
  for (const l of landings.filter(within(30))) sources.set(l.src || "direct", (sources.get(l.src || "direct") || 0) + 1);

  const recent = events.filter(within(30));
  const views = recent.filter(isView);
  const outbound = recent.filter(isOutbound);
  const count = (list) => {
    const m = new Map();
    for (const e of list) m.set(e.productId, (m.get(e.productId) || 0) + 1);
    return top(m).map((x) => ({ productId: x.key, title: titles.get(x.key) || null, count: x.count }));
  };
  const outboundBySource = new Map();
  for (const e of outbound) outboundBySource.set(e.src || "direct", (outboundBySource.get(e.src || "direct") || 0) + 1);

  const ok = earnings && earnings.state === "OK";
  // Amounts stored before the cents fix were 100× too large: no amount from them.
  const amountsKnown = ok && earnings.amounts === "units";
  const purchases = ok ? { paid: earnings.paid?.orders ?? 0, confirmed: earnings.confirmed?.orders ?? 0, checkedAt: earnings.checkedAt } : { state: earnings?.state || "NOT_READ_YET" };
  const commission = ok && !amountsKnown ? { state: "RECHECK_PENDING" } : ok ? {
    currency: earnings.paid?.currency || earnings.confirmed?.currency || null,
    estimatedOnPaid: earnings.paid?.estimatedCommission ?? null,
    estimatedOnConfirmed: earnings.confirmed?.estimatedCommission ?? null,
    settled: earnings.confirmed?.settledCommission ?? null,
  } : { state: earnings?.state || "NOT_READ_YET" };

  return {
    at: new Date(now).toISOString(),
    exposure: { search: "SEARCH_CONSOLE (the owner's account)", networks: "each network's own insights" },
    visits,
    sources: top(sources),
    views: { d30: views.length, top: count(views) },
    outbound: { d30: outbound.length, top: count(outbound), bySource: top(outboundBySource) },
    // A share of sessions that went on to the store; null without visits (never 0% of nothing).
    outboundRate: visits.d30 ? Math.round((outbound.length / visits.d30) * 1000) / 10 : null,
    purchases,
    commission,
    next: nextActions({ visits, outbound: outbound.length, sources: top(sources), purchases }),
  };
}

/** What to do now, from the numbers above only. */
export function nextActions({ visits, outbound, sources, purchases }) {
  const out = [];
  if (!visits.d7) out.push("אין כניסות השבוע: לפרסם את הפוסט היומי ולשתף אותו לקבוצות ולסטטוס, כי בלי חשיפה אין כניסות.");
  else if (sources.length) out.push(`המקור שמביא הכי הרבה כניסות: ${sources[0].key}. כדאי להגביר אותו.`);
  if (visits.d7 && !outbound) out.push("יש כניסות בלי יציאות לחנות: לבדוק שהמוצר בראש העמוד ושהכפתור 'לחנות' בולט.");
  if (outbound && purchases && !purchases.state && !purchases.paid && !purchases.confirmed) out.push("יש יציאות לחנות ועוד אין הזמנות: AliExpress מדווחת על הזמנה רק אחרי תשלום, ולפעמים זה לוקח יום־יומיים.");
  return out;
}
