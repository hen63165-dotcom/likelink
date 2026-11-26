// 🚢 The factories' shipments (the owner, 22.11: "the new shops and the biggest factories, where everything
// starts for every product in the world — not only AliExpress; find another way, with no connection").
// Every product that crosses into the European Union is declared at customs under one of ~9,500 eight-digit
// Combined Nomenclature lines, and Eurostat publishes, for every line and every partner country, what was
// imported each month: its value in euros and its weight. That is what the factories of China, Korea,
// Japan, Vietnam, Taiwan, India and Turkey really shipped, for every kind of product in the world, from the
// customs' own records. Eurostat's dissemination API is open: no key, no account (robots.txt of
// ec.europa.eu closes other paths, never /eurostat/api/; read first). Published about six weeks after each
// month, so it is the factories' side of a trend, never a forecast: the board says the month it covers.
// Pure: the runner downloads.

export const TRADE = Object.freeze({
  host: "https://ec.europa.eu",
  path: "/eurostat/api/comext/dissemination/statistics/1.0/data/DS-045409",
  partners: ["CN", "KR", "JP", "VN", "TW", "IN", "TR"],
  months: 3, // the last three months against the same three a year earlier (seasons cancel out)
  minValue: 2_000_000, // € in the three months: a real line, not a single container
  minPrev: 200_000, // € a year earlier: under it the line is new or renamed (CN codes change every January)
  jumpPct: 100, // the value at least doubled…
  weightPct: 50, // …and the weight grew too, so it is more goods, not only higher prices
  top: 10,
  labelMax: 160,
});

// The lines of things people buy (a shop's goods), by chapter or heading: cosmetics, plastic household
// goods, bags, clothing and textiles, shoes, hats, umbrellas, tableware, glassware, jewellery, kitchenware,
// small appliances, phones and earphones, cameras, lamps, e-bikes and strollers, sunglasses, massagers,
// watches, instruments, furniture, toys and sports, brushes, pens, flasks. Turbojets, scrap and chemicals
// jump too (22.11: the first China read put turbojets and silver scrap on top), so they are left out.
export const CONSUMER = Object.freeze({
  chapters: ["33", "42", "61", "62", "63", "64", "65", "66", "67", "91", "92", "94", "95", "96"],
  headings: ["3924", "3926", "4202", "4819", "4820", "4911", "6911", "6912", "6913", "7013", "7113", "7117", "7323", "7615",
    "8211", "8214", "8215", "8301", "8306", "8414", "8424", "8467", "8509", "8510", "8516", "8517", "8518", "8519", "8521",
    "8525", "8528", "8539", "8543", "8711", "8712", "8714", "8715", "9004", "9006", "9019"],
});

/** A shop's goods (CONSUMER), never industry. */
export function isConsumerLine(code) {
  const c = String(code || "");
  return /^\d{8}$/.test(c) && (CONSUMER.chapters.includes(c.slice(0, 2)) || CONSUMER.headings.includes(c.slice(0, 4)));
}

export const PARTNER_NAMES = Object.freeze({
  CN: { he: "סין", en: "China" }, KR: { he: "קוריאה", en: "Korea" }, JP: { he: "יפן", en: "Japan" },
  VN: { he: "וייטנאם", en: "Vietnam" }, TW: { he: "טייוואן", en: "Taiwan" }, IN: { he: "הודו", en: "India" },
  TR: { he: "טורקיה", en: "Turkey" },
});

const MONTH = /^(\d{4})-(\d{2})$/;

/** A month `n` months before `ym` ("2026-09", 12 → "2025-09"). */
export function monthBack(ym, n) {
  const m = MONTH.exec(String(ym || ""));
  if (!m) return null;
  const t = Number(m[1]) * 12 + (Number(m[2]) - 1) - n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** The two windows: the last `months` months and the same months a year earlier. */
export function windowsOf(latest, { rules = TRADE } = {}) {
  const now = Array.from({ length: rules.months }, (_, i) => monthBack(latest, i)).filter(Boolean);
  return { now, before: now.map((p) => monthBack(p, 12)) };
}

/** The small request that tells which month is the newest and when the data was updated. */
export function probeUrl(latestGuess, { rules = TRADE } = {}) {
  const since = monthBack(latestGuess, 5);
  return `${rules.host}${rules.path}?format=JSON&lang=en&reporter=EU&partner=CN&product=95&flow=1&indicators=VALUE_IN_EUROS&freq=M&sinceTimePeriod=${since}`;
}

/** Every product line from one partner for the two windows: value and weight. */
export function tradeUrl(partner, latest, { rules = TRADE } = {}) {
  const { now, before } = windowsOf(latest, { rules });
  const time = [...now, ...before].map((p) => `&time=${p}`).join("");
  return `${rules.host}${rules.path}?format=JSON&lang=en&reporter=EU&partner=${encodeURIComponent(partner)}&flow=1&indicators=VALUE_IN_EUROS&indicators=QUANTITY_IN_100KG&freq=M${time}`;
}

/** JSON-stat 2.0 → { updated, periods, lines: Map code → { label, v: {period: €}, kg: {period: 100 kg} } }; CN8 lines only. */
export function parseComext(json) {
  if (!json || typeof json !== "object" || !Array.isArray(json.id) || !Array.isArray(json.size)) return null;
  const dim = (k) => json.dimension?.[k]?.category || {};
  const pos = Object.fromEntries(json.id.map((k, i) => [k, i]));
  if (pos.product === undefined || pos.time === undefined || pos.indicators === undefined) return null;
  const stride = json.size.map((_, i) => json.size.slice(i + 1).reduce((a, b) => a * b, 1));
  const inv = (k) => Object.fromEntries(Object.entries(dim(k).index || {}).map(([c, i]) => [i, c]));
  const prod = inv("product"); const time = inv("time"); const ind = inv("indicators");
  const lines = new Map();
  for (const [key, raw] of Object.entries(json.value || {})) {
    const v = Number(raw);
    if (!Number.isFinite(v)) continue;
    let rest = Number(key);
    const at = {};
    for (let i = 0; i < json.id.length; i++) { at[json.id[i]] = Math.floor(rest / stride[i]); rest %= stride[i]; }
    const code = prod[at.product];
    if (!/^\d{8}$/.test(String(code || ""))) continue; // CN8 only: never an aggregate, never a confidential "XX" line
    const period = time[at.time]; const which = ind[at.indicators];
    if (!MONTH.test(String(period || ""))) continue;
    const line = lines.get(code) || { label: String(dim("product").label?.[code] || "").slice(0, TRADE.labelMax), v: {}, kg: {} };
    if (which === "VALUE_IN_EUROS") line.v[period] = v;
    else if (which === "QUANTITY_IN_100KG") line.kg[period] = v;
    lines.set(code, line);
  }
  return { updated: typeof json.updated === "string" ? json.updated : null, periods: Object.keys(dim("time").index || {}), lines };
}

/** The newest month that carries a value (from the probe). */
export function latestPeriod(json) {
  const idx = json?.dimension?.time?.category?.index || {};
  const withData = new Set(Object.keys(json?.value || {}).map(Number));
  const tSize = Object.keys(idx).length;
  return Object.entries(idx).filter(([, i]) => [...withData].some((k) => k % tSize === i)).map(([p]) => p).sort().pop() || null;
}

const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

/** Every line's three months against the same three a year earlier; the lines that jumped first. */
export function tradeJumps(parsed, latest, { rules = TRADE } = {}) {
  if (!parsed || !(parsed.lines instanceof Map)) return null;
  const { now, before } = windowsOf(latest, { rules });
  const sum = (o, ps) => ps.reduce((s, p) => s + (Number(o?.[p]) || 0), 0);
  const rows = [];
  let measured = 0, renamed = 0, priceOnly = 0;
  for (const [code, l] of parsed.lines) {
    if (!isConsumerLine(code)) continue;
    const value = sum(l.v, now); const prev = sum(l.v, before);
    if (value < rules.minValue) continue;
    measured++;
    if (prev < rules.minPrev) { renamed++; continue; } // new or renamed code: never shown as a jump
    const kgNow = sum(l.kg, now); const kgPrev = sum(l.kg, before);
    const valuePct = pct(value, prev); const kgPct = kgPrev > 0 ? pct(kgNow, kgPrev) : null;
    if (valuePct === null || valuePct < rules.jumpPct) continue;
    if (kgPct !== null && kgPct < rules.weightPct) { priceOnly++; continue; } // dearer, not more
    rows.push({ code, label: l.label, value: Math.round(value), prev: Math.round(prev), valuePct, kgPct });
  }
  rows.sort((a, b) => b.valuePct - a.valuePct || b.value - a.value);
  return { latest, months: now, before, measured, renamed, priceOnly, jumping: rows.length, top: rows.slice(0, rules.top) };
}

/** The browser's copy (sanitizeBoard). */
export function cleanTrade(t) {
  if (!t || typeof t !== "object" || !MONTH.test(String(t.latest || ""))) return null;
  const n = (x, max = 1e13) => (Number.isFinite(Number(x)) && Math.abs(Number(x)) <= max ? Math.round(Number(x)) : null);
  const partners = (Array.isArray(t.partners) ? t.partners : []).filter((p) => PARTNER_NAMES[p?.id]).slice(0, 10).map((p) => ({
    id: p.id,
    measured: n(p.measured) ?? 0,
    jumping: n(p.jumping) ?? 0,
    top: (Array.isArray(p.top) ? p.top : []).filter((r) => /^\d{8}$/.test(String(r?.code || "")) && n(r.valuePct) !== null).slice(0, TRADE.top).map((r) => ({
      code: String(r.code), label: String(r.label || "").replace(/[<>]/g, "").slice(0, TRADE.labelMax),
      value: n(r.value), prev: n(r.prev), valuePct: n(r.valuePct, 1e6), kgPct: n(r.kgPct, 1e6),
    })),
  }));
  return { latest: t.latest, updated: typeof t.updated === "string" ? t.updated.slice(0, 25) : null, months: (t.months || []).filter((m) => MONTH.test(m)).slice(0, 6), partners };
}
