// 📡 The radar's one core (the owner, 2026-11-20: "everything always unified into one radar, everything
// inside, one radar code, and a page anyone understands at a glance, trustworthy and verified").
//
// The radar grew instrument by instrument (stages, early calls, new products, new kinds, the brain,
// the proven range, the calibrated chance, the window clock, luck, the next-country clock, the store
// prices). Each one lives in its own small pure file, but the radar is ONE thing, so this file is the
// single place that says what the radar is made of:
//   1. INSTRUMENTS: every instrument once, with its name, what it says in one line, its book in the
//      daily sealed root, the board key it reads and the page section that shows it. The ledger's
//      book order (radarLedger.js LEDGER_BOOKS), the page's tabs and the ledger's labels come from here.
//   2. recordView(board): one record over every book, the same columns for all of them: how many it
//      gave, how many were checked, the result as it is, the next check.
//   3. findFacts(find): one card for every find (a new product or a new kind): the same rows, in the
//      same order, each one a measurement with its source, and the seal line.
// Pure (it imports only the world gap's wording), so the runner, the server, the page, the Wix page
// and the tests share it.

import { worldGapLine } from "./worldGap.js";

export const INSTRUMENTS = Object.freeze([
  { id: "early", book: "early", tab: "today", section: "verdict", he: "קביעות לפני כולם", en: "Before-everyone calls", whatHe: "כשכל 4 הסימנים מסכימים: העולם, הביקוש, המוכרים וישראל", whatEn: "When all four signals agree: the world, demand, sellers and Israel" },
  { id: "stages", book: "stages", tab: "today", section: "verdict", he: "קביעות עלייה", en: "Rising calls", whatHe: "סוג שהביקוש שלו מתחיל לעלות", whatEn: "A kind whose demand starts to rise" },
  { id: "luck", book: "luck", tab: "proof", section: "luck", he: "הרדאר מול המזל", en: "The radar vs luck", whatHe: "סוג אקראי כל יום, נבדק באותו כלל", whatEn: "A random kind each day, graded by the same rule" },
  { id: "baseline", book: "baseline", tab: "proof", section: "baseline", he: "הרדאר מול הדירוג הפשוט", en: "The radar vs the simple ranking", whatHe: "כל יום: 3 המוצרים שצומחים הכי מהר, בלי הבדיקות של הרדאר, ו־3 בהגרלה, נבדקים באותו כלל", whatEn: "Each day: the 3 fastest-growing listings, without the radar's checks, and 3 drawn by chance, graded by the same rule" },
  { id: "versus", book: "versus", tab: "proof", section: "backtest", he: "הדו־קרב החתום", en: "The sealed head-to-head", whatHe: "כל בוקר: הבחירות של הרדאר מול הדירוג הפשוט ומול בחירה אקראית, נחתמות מראש ונבדקות אחרי 3 ו־7 ימים", whatEn: "Every morning: the radar's picks against the simple ranking and a random pick, sealed in advance and graded after 3 and 7 days" },
  { id: "fresh", book: "fresh", tab: "today", section: "fresh", he: "מוצרים חדשים", en: "New products", whatHe: "מוצר קטן שההזמנות שלו רצות, לפני שכולם מוכרים", whatEn: "A small product whose orders run, before everyone sells it" },
  { id: "kinds", book: "kinds", tab: "today", section: "kinds", he: "סוגים חדשים", en: "New kinds", whatHe: "סוג חדש שהבינה המלאכותית מצאה לפי משמעות", whatEn: "A new kind the AI found by meaning" },
  { id: "prelaunch", book: "prelaunch", tab: "today", section: "prelaunch", he: "לפני המכירה הראשונה", en: "Before the first sale", whatHe: "מוצר שהרבה חנויות שונות מתחילות להעלות השבוע, לפני שקונים אותו; אחרי 21 יום בודקים אם המכירות הגיעו", whatEn: "A product many different stores start listing this week, before people buy it; after 21 days, did the sales come" },
  { id: "noise", book: "noise", tab: "today", section: "noise", he: "לפני הרעש", en: "Before the noise", whatHe: "מוצר ששתי דלתות שונות, לפני יוטיוב וטיקטוק, קוראות לו באותו שבוע, כשבגוגל, ביוטיוב ואצל המוכרים עוד שקט; אחרי 30 יום בודקים אם הרעש הגיע ובכמה ימים הרדאר הקדים", whatEn: "A product two different doors upstream of YouTube and TikTok name in the same week while Google, YouTube and the sellers are still quiet; after 30 days, did the noise come, and how many days ahead was the radar" },
  { id: "supply", book: "supply", tab: "today", section: "supply", he: "מקום לייצר", en: "Room to make it", whatHe: "סוג שהביקוש שלו רץ מהר מהמוכרים; אחרי 14 יום בודקים אם מוכרים חדשים נכנסו בעקבות הרדאר", whatEn: "A kind whose demand outruns the sellers; after 14 days, did new sellers follow the radar" },
  { id: "brain", book: "brain", tab: "proof", section: "brain", he: "המוח", en: "The brain", whatHe: "מה הרדאר למד מכל קביעה שנבדקה", whatEn: "What the radar learned from every graded call" },
  { id: "promise", book: "promise", tab: "proof", section: "promise", he: "הטווח המוכח והסיכוי המכויל", en: "The proven range and calibrated chance", whatHe: "טווח הזמנות וסיכוי לעלייה, לכל מוצר שנמדד", whatEn: "An orders range and a chance to grow, for every product measured" },
  { id: "window", book: "window", tab: "proof", section: "window", he: "שעון החלון", en: "The window clock", whatHe: "הסיכוי שמוצר יגיע ל־2,000 מודעות, כלומר שכולם כבר מוכרים", whatEn: "The chance a product reaches 2,000 listings: everyone sells it" },
  { id: "globe", book: "globe", tab: "tools", section: "globe", he: "המדינה הבאה", en: "The next country", whatHe: "באיזו מדינה טרנד יגיע בהמשך", whatEn: "Which country a trend reaches next" },
  { id: "prices", book: "prices", tab: "proof", section: "ledger", he: "מחירי החנות", en: "Store prices", whatHe: "המחיר של כל מוצר שנקרא, פעם ביום", whatEn: "The price of every item read, once a day" },
  // 🧾 The run receipt (runReceipt.js): what the radar really asked this run and what came back. It
  // makes no call of its own, so it has no row in the record; its text is sealed like every book.
  { id: "run", book: "run", tab: "proof", section: "sources", he: "קבלת הריצה", en: "The run receipt", whatHe: "כמה שאלות הרדאר שלח, לאן, ומה ענו לו", whatEn: "How many questions the radar sent, where, and what came back" },
]);

/** The sealed books in the root's fixed order (radarLedger.js LEDGER_BOOKS is this list). */
export const BOOKS = Object.freeze(INSTRUMENTS.filter((i) => i.book).map((i) => i.book));

/** Every section id on /radar → its tab (deep links like /radar#window open the right tab). */
export const SECTION_TABS = Object.freeze({
  today: "today", verdict: "today", picks: "today", duel: "today", fresh: "today", watch: "today", export: "today", kinds: "today", "radar-results": "today",
  proof: "proof", verify: "proof", backtest: "proof", rivals: "proof", gate: "proof", record: "proof", sources: "proof", capabilities: "proof", ledger: "proof", anchors: "proof", challenge: "proof", data: "proof",
  tools: "tools", styles: "tools", waves: "tools", crowd: "tools", how: "tools", path: "today",
  plans: "plans", "radar-tiers": "plans",
  ...Object.fromEntries(INSTRUMENTS.map((i) => [i.section, i.tab]).filter(([s]) => !["verdict", "fresh", "kinds", "ledger"].includes(s))),
});

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pct = (hits, n) => (n ? Math.round((hits / n) * 1000) / 10 : null);
const dm = (d) => (/^\d{4}-\d{2}-\d{2}/.test(String(d || "")) ? `${d.slice(8, 10)}.${d.slice(5, 7)}` : "");
const signed = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}`;
const he = (n) => Number(n).toLocaleString("he-IL");
// A signed number or a range inside Hebrew text: isolated left-to-right (U+2066…U+2069, invisible),
// so "+208%" and "151–176" never come out as "208%+" or "176–151".
const iso = (t) => `\u2066${t}\u2069`;
const en = (n) => Number(n).toLocaleString("en-US");

/**
 * The radar's strongest record already graded in public: the proven range at the 90% level, on the
 * horizon with the most grades (≥ 30), as it stands on the board. Each range was sealed in Bitcoin
 * the day it was issued and graded on its own day; nothing here is computed beyond held / graded.
 */
export function provenRecord(board = {}) {
  const cov = Array.isArray(board?.promise?.coverage) ? board.promise.coverage : [];
  const best = cov
    .filter((c) => c?.level === 90 && Number.isInteger(c?.h) && Number(c?.n) >= 30 && Number.isFinite(Number(c?.held)) && Number(c.held) <= Number(c.n))
    .sort((a, b) => Number(b.n) - Number(a.n) || a.h - b.h)[0];
  if (!best) return null;
  const n = Number(best.n);
  const held = Number(best.held);
  return { h: best.h, level: 90, n, held, rate: Math.round((held / n) * 1000) / 10 };
}

/** A calls book's row: given, checked, hits, the next check. */
function callsRow(r = {}) {
  const graded = num(r.graded) ?? 0;
  const hits = num(r.hits) ?? 0;
  return { given: num(r.calls) ?? graded + (num(r.pending) ?? 0), graded, result: graded ? { kind: "hits", hits, of: graded, rate: pct(hits, graded) } : null, next: r.nextDue || null };
}

/**
 * One record over every book, the same columns for all: `given` (how many the radar said), `graded`
 * (how many were checked), `result` (hits / held / Brier, as it is, null before the first check),
 * `next` (the next check). Nothing is computed that the board did not measure.
 */
export function recordView(board = {}) {
  const b = board || {};
  const rows = [];
  for (const ins of INSTRUMENTS) {
    let row = null;
    if (ins.id === "early") {
      const open = (b.early?.ledger || []).filter((e) => !e.result).map((e) => e.due).filter(Boolean).sort();
      row = { ...callsRow(b.early?.record), next: open[0] || null };
    } else if (ins.id === "stages") row = callsRow(b.record);
    else if (ins.id === "fresh") row = callsRow(b.fresh?.record);
    else if (ins.id === "kinds") row = callsRow(b.kinds?.record);
    else if (ins.id === "prelaunch" && b.prelaunch) row = callsRow(b.prelaunch.record);
    else if (ins.id === "noise" && b.noise) {
      const r = b.noise.record?.call || {};
      row = { ...callsRow(r), result: num(r.graded) ? { kind: "hits", hits: num(r.hits) ?? 0, of: r.graded, rate: pct(num(r.hits) ?? 0, r.graded), edge: num(b.noise.record?.edge) } : null };
    }
    else if (ins.id === "supply") {
      const r = b.supply?.record;
      if (r) row = { given: num(r.calls) ?? 0, graded: num(r.graded) ?? 0, result: r.graded ? { kind: "hits", hits: num(r.followed) ?? 0, of: r.graded, rate: pct(num(r.followed) ?? 0, r.graded), edge: num(r.edge) } : null, next: r.nextDue || null };
    }
    else if (ins.id === "baseline") {
      const v = b.baseline?.versus;
      if (v) {
        const graded = (num(v.naive?.graded) ?? 0) + (num(v.random?.graded) ?? 0);
        const hits = (num(v.naive?.hits) ?? 0) + (num(v.random?.hits) ?? 0);
        row = { given: (num(v.naive?.calls) ?? 0) + (num(v.random?.calls) ?? 0), graded, result: graded ? { kind: "hits", hits, of: graded, rate: pct(hits, graded), edge: num(v.edgeNaive) } : null, next: b.baseline?.nextDue || null };
      }
    }
    else if (ins.id === "versus" && b.versus) {
      const hs = b.versus.horizons || [];
      const graded = hs.reduce((s, x) => s + (num(x.pick?.of) ?? 0), 0);
      const hits = hs.reduce((s, x) => s + (num(x.pick?.hits) ?? 0), 0);
      const rankOf = hs.reduce((s, x) => s + (num(x.rank?.of) ?? 0), 0);
      const rankHits = hs.reduce((s, x) => s + (num(x.rank?.hits) ?? 0), 0);
      const next = hs.map((x) => x.nextDue).filter(Boolean).sort()[0] || null;
      row = { given: num(b.versus.sheets) ?? 0, graded, result: graded ? { kind: "hits", hits, of: graded, rate: pct(hits, graded), edge: rankOf ? Math.round((pct(hits, graded) - pct(rankHits, rankOf)) * 10) / 10 : null } : null, next };
    }
    else if (ins.id === "luck") {
      const v = b.luck?.versus || {};
      const graded = num(v.luck?.graded) ?? 0;
      row = { given: num(b.luck?.draws) ?? graded, graded, result: graded ? { kind: "hits", hits: num(v.luck?.hits) ?? 0, of: graded, rate: pct(num(v.luck?.hits) ?? 0, graded), edge: num(v.edge) } : null, next: b.luck?.nextDue || null };
    } else if (ins.id === "brain") {
      const books = b.brain?.books || {};
      const graded = (num(books.fresh?.graded) ?? 0) + (num(books.kinds?.graded) ?? 0);
      const hits = (num(books.fresh?.hits) ?? 0) + (num(books.kinds?.hits) ?? 0);
      // The brain says nothing of its own: it learns from the calls that were checked.
      row = { given: null, graded, result: graded ? { kind: "learned", hits, of: graded, rate: pct(hits, graded), ready: b.brain?.ready === true } : null, next: books.fresh?.nextDue || books.kinds?.nextDue || null };
    } else if (ins.id === "promise") {
      const p = b.promise;
      if (p) {
        const c90 = (p.coverage || []).filter((c) => c.level === 90 && c.n > 0);
        const n = c90.reduce((s, c) => s + c.n, 0);
        const held = c90.reduce((s, c) => s + c.held, 0);
        const ch = (p.chance || []).filter((c) => c.n > 0);
        row = { given: (num(p.open) ?? 0) + n, graded: n, result: n ? { kind: "held", held, of: n, rate: pct(held, n), level: 90, brier: ch.length ? Math.round((ch.reduce((s, c) => s + c.brier * c.n, 0) / ch.reduce((s, c) => s + c.n, 0)) * 1000) / 1000 : null } : null, next: p.nextDue || null };
      }
    } else if (ins.id === "window") {
      const w = b.window;
      if (w) {
        const rec = (w.record || []).filter((c) => c.n > 0);
        const n = rec.reduce((s, c) => s + c.n, 0);
        row = { given: (num(w.open) ?? 0) + n, graded: n, result: n ? { kind: "brier", brier: Math.round((rec.reduce((s, c) => s + c.brier * c.n, 0) / n) * 1000) / 1000, of: n, closed: rec.reduce((s, c) => s + c.hits, 0) } : null, next: w.nextDue || null };
      }
    } else if (ins.id === "globe") {
      const c = b.globe?.calls;
      if (c) row = { given: (c.open?.length || 0) + (num(c.graded) ?? 0), graded: num(c.graded) ?? 0, result: c.graded ? { kind: "hits", hits: num(c.hits) ?? 0, of: c.graded, rate: pct(num(c.hits) ?? 0, c.graded) } : null, next: (c.open || []).map((x) => x.due).filter(Boolean).sort()[0] || null };
    } else if (ins.id === "prices") {
      row = { given: null, graded: null, result: null, next: null, daily: true };
    }
    if (!row) continue;
    rows.push({ id: ins.id, he: ins.he, en: ins.en, whatHe: ins.whatHe, whatEn: ins.whatEn, section: ins.section, sealed: (b.ledger?.text || "").split("\n").some((l) => l.startsWith(`${ins.book}=`)), ...row });
  }
  // The trend calls' hits only: the brain learns, luck, the simple ranking and the daily duel are yardsticks, supply grades sellers following, noise grades the noise arriving.
  const graded = rows.filter((r) => r.result && (r.result.kind === "hits" || r.result.kind === "learned") && r.id !== "brain" && r.id !== "luck" && r.id !== "baseline" && r.id !== "versus" && r.id !== "supply" && r.id !== "noise");
  return {
    rows,
    day: b.ledger?.d || String(b.at || "").slice(0, 10) || null,
    root: b.ledger?.sha256 || null,
    books: (b.ledger?.text || "").split("\n").filter(Boolean).length,
    block: (b.anchors?.list || [])[0] || null,
    total: { given: rows.reduce((s, r) => s + (r.given || 0), 0), graded: rows.reduce((s, r) => s + (r.graded || 0), 0), callHits: graded.reduce((s, r) => s + r.result.hits, 0), callsGraded: graded.reduce((s, r) => s + r.result.of, 0) },
  };
}

/** How a row's result reads, in each language. Before the first check: when it comes. */
export function resultText(row) {
  const r = row?.result;
  if (row?.daily) return { he: "נחתמים כל יום", en: "Sealed every day" };
  if (!r) return row?.next ? { he: `הבדיקה הראשונה ב־${dm(row.next)}`, en: `First check on ${dm(row.next)}` } : { he: "נבדק כשתהיה קביעה", en: "Checked once there is a call" };
  if (r.kind === "hits") return { he: `פגעו ${r.hits} מתוך ${r.of} (${r.rate}%)`, en: `${r.hits} of ${r.of} hit (${r.rate}%)` };
  if (r.kind === "learned") return { he: `למד מ־${r.of} קביעות שנבדקו`, en: `Learned from ${r.of} graded calls` };
  if (r.kind === "held") return { he: `${r.held} מתוך ${r.of} טווחים החזיקו (${r.rate}%)${r.brier !== null ? ` · Brier ${r.brier}` : ""}`, en: `${r.held} of ${r.of} ranges held (${r.rate}%)${r.brier !== null ? ` · Brier ${r.brier}` : ""}` };
  if (r.kind === "brier") return { he: `${r.of} סיכויים נבדקו · Brier ${r.brier}`, en: `${r.of} chances graded · Brier ${r.brier}` };
  return { he: "", en: "" };
}

/**
 * One card for every find (a new product or a new kind): the same rows in the same order, each one
 * what was measured and where. `tone` is "up" (growing), "seal" (checked / sealed) or null; nothing
 * is shown that the board did not carry.
 */
export function findFacts(f = {}, { kind = "fresh", day = null } = {}) {
  const rows = [];
  const add = (key, labelHe, labelEn, valueHe, valueEn, tone = null) => rows.push({ key, labelHe, labelEn, he: valueHe, en: valueEn, tone });
  if (kind === "fresh") {
    if (num(f.weekPct) !== null) add("pace", "קצב ההזמנות", "Orders pace", `${iso(`${signed(f.weekPct)}%`)} בשבוע`, `${signed(f.weekPct)}% a week`, "up");
    if (num(f.orders) !== null && num(f.ordersBefore) !== null) add("orders", "הזמנות ב־30 יום", "Orders in 30 days", `${he(f.ordersBefore)} ב־${dm(f.from)} ← ${he(f.orders)} ב־${dm(f.to)}`, `${en(f.ordersBefore)} on ${dm(f.from)} → ${en(f.orders)} on ${dm(f.to)}`);
    // New, as the radar itself saw it (freshRisers.listingAge): its first reading of the listing.
    if (f.age?.state === "NEW" && dm(f.age.firstDay) && num(f.age.firstOrders) !== null) add("age", "חדש", "New", `הרדאר ראה אותו מתחילתו: ${he(f.age.firstOrders)} הזמנות ב־30 יום בקריאה הראשונה, ${dm(f.age.firstDay)}`, `The radar saw it from the start: ${en(f.age.firstOrders)} orders in 30 days at its first reading, ${dm(f.age.firstDay)}`, "seal");
  } else {
    if (num(f.medianWeekPct) !== null) add("pace", "קצב ההזמנות", "Orders pace", `${iso(`${signed(f.medianWeekPct)}%`)} בשבוע (החציון של ${f.measured ?? f.members} מודעות)`, `${signed(f.medianWeekPct)}% a week (median of ${f.measured ?? f.members} listings)`, "up");
    if (num(f.orders) !== null) add("orders", "הזמנות ב־30 יום", "Orders in 30 days", `${he(f.orders)} יחד, ב־${f.members} מודעות חדשות`, `${en(f.orders)} together, in ${f.members} new listings`);
  }
  const similar = num(f.known?.similar);
  // 🌍 The world gap (worldGap.js): the same phrase in Google's suggestions from every country measured.
  // With it, the world row speaks for Google (the US among the countries), so the listings row does not.
  const wg = f.known?.world;
  const wgHe = worldGapLine(wg, "he");
  if (similar !== null) add("sellers", "מודעות דומות", "Similar listings", wgHe ? `${he(similar)} באליאקספרס` : `${he(similar)} באליאקספרס · שקט בגוגל בארה״ב`, wgHe ? `${en(similar)} on AliExpress` : `${en(similar)} on AliExpress · quiet on Google in the US`);
  if (wgHe) add("world", "מול העולם", "Against the world", wgHe, worldGapLine(wg, "en"), wg.before ? "up" : null);
  const yt = f.known?.yt;
  if (yt) add("youtube", "יוטיוב השבוע", "YouTube this week", yt.level === "EARLY" ? `${he(yt.videos)} סרטונים חדשים: היוצרים הראשונים` : "שקט מוחלט", yt.level === "EARLY" ? `${en(yt.videos)} new videos: the first creators` : "Silent");
  const p = f.promise;
  if (p && (p.r90 || p.r80)) {
    const r = p.r90 || p.r80;
    add("range", `טווח ל־${p.h} ימים`, `Range in ${p.h} days`, `${iso(`${he(r[0])}–${he(r[1])}`)} הזמנות (כיסוי ${p.r90 ? 90 : 80}%)`, `${en(r[0])}–${en(r[1])} orders (${p.r90 ? 90 : 80}% coverage)`);
    if (p.chance) add("chance", `סיכוי ל־${iso(`+${p.chance.line}%`)}`, `Chance of +${p.chance.line}%`, `${p.chance.p}% בתוך ${p.h} ימים (מכויל)`, `${p.chance.p}% within ${p.h} days (calibrated)`);
  }
  const w = f.window;
  if (w?.state === "READY") add("window", "שעון החלון", "Window clock", `${w.p}% שבעוד ${w.h} ימים יהיו מעל ${he(w.line)} מודעות`, `${w.p}% chance of over ${en(w.line)} listings in ${w.h} days`);
  else if (w?.state === "MEASURING") add("window", "שעון החלון", "Window clock", `נמדד מ־${dm(w.since)}, הסיכוי אחרי 3 ימי מדידה`, `Measured since ${dm(w.since)}; the chance after 3 days of readings`);
  if (f.learned) add("brain", "דומים בעבר", "Similar before", `${f.learned.hits} מתוך ${f.learned.n} פגעו`, `${f.learned.hits} of ${f.learned.n} hit`);
  if ([80, 90, 95, 99].includes(f.sure)) add("sure", "הקול המוכח", "Proven voice", `לפחות ${f.sure}% לפי הרקורד החי`, `At least ${f.sure}% on the live record`, "seal");
  // The seal: the day the radar first showed it (the call) and its grading day, from the call itself.
  if (dm(f.called) && dm(f.due)) add("seal", "נחתם", "Sealed", `ב־${dm(f.called)} · הציון בפומבי ב־${dm(f.due)}`, `On ${dm(f.called)} · graded in public on ${dm(f.due)}`, "seal");
  else add("seal", "נחתם", "Sealed", `בספר החתימות${day ? ` של ${dm(day)}` : ""} · הציון אחרי 14 יום`, `In the sealed book${day ? ` of ${dm(day)}` : ""} · graded after 14 days`, "seal");
  return rows;
}

/**
 * 🚪 The exit signal (the owner, 20.11: "go around Modalyst and everyone"; the check that day found
 * saturation scores and blog advice on when to stop, and no tool that tracks each find after it
 * showed it and says when to stop): every find the radar showed is read again every day for its 14
 * days, and its own numbers decide one state. EXIT when its orders cool (≤ −5% a week), its listings
 * passed the saturation line, or the window clock gives ≥ 50% that they pass it within days;
 * RUNNING while its orders still grow ≥ 10% a week; SLOWING in between; MEASURING until it has a
 * pace. Measured only, never a forecast of sales.
 */
export const EXIT = Object.freeze({ runningWeekPct: 10, closeChance: 50 });
export const EXIT_LABELS = Object.freeze({
  RUNNING: { he: "עדיין רץ", en: "Still running" },
  SLOWING: { he: "מאט: כדאי לשקול לעצור פרסום", en: "Slowing: consider pausing ads" },
  EXIT: { he: "זמן לצאת", en: "Time to exit" },
  MEASURING: { he: "נמדד", en: "Measuring" },
});
export const EXIT_WHY = Object.freeze({
  cooling: { he: "ההזמנות יורדות", en: "orders are cooling" },
  window: { he: "כבר מעל 2,000 מודעות דומות", en: "already over 2,000 similar listings" },
  closing: { he: "שעון החלון: רוב הסיכוי שהמודעות יעברו את הקו", en: "window clock: listings likely pass the line" },
});
export function exitSignal({ momentum = null, window = null } = {}, { rules = EXIT } = {}) {
  if (window?.state === "CLOSED") return { state: "EXIT", why: "window" };
  if (momentum?.state === "COOLING") return { state: "EXIT", why: "cooling" };
  if (window?.state === "READY" && Number.isFinite(window.p) && window.p >= rules.closeChance) return { state: "EXIT", why: "closing" };
  const w = momentum?.weekPct;
  if (!momentum || momentum.state === "UNVERIFIED" || !Number.isFinite(w)) return { state: "MEASURING", why: null };
  return { state: w >= rules.runningWeekPct ? "RUNNING" : "SLOWING", why: null };
}

/**
 * 📡 What the radar read today (the owner's plan, 21.11: "first make sure the existing brain really
 * works: every data source, which are waiting for a connection"): every source the run asked, as the
 * run itself reported it, with the official door it goes through. Nothing here is a claim about data
 * the radar did not read; the doors still closed are named with what opens them.
 */
export const SOURCES = Object.freeze([
  { key: "aliexpress", he: "אליאקספרס: מוצרים, הזמנות, מחירים", en: "AliExpress: items, orders, prices", door: "API השותפים הרשמי" },
  { key: "world", he: "כל הקטגוריות של אליאקספרס", en: "Every AliExpress category", door: "API השותפים הרשמי" },
  { key: "fresh", he: "מוצרים חדשים של השנה", en: "This year's new listings", door: "API השותפים הרשמי" },
  { key: "discovery", he: "רשימות המוצרים החמים", en: "Hot product lists", door: "API השותפים הרשמי" },
  { key: "kinds", he: "קיבוץ לפי משמעות (בינה מלאכותית)", en: "Grouping by meaning (AI)", door: "מודל פתוח על השרת שלנו" },
  { key: "looks", he: "קיבוץ לפי מראה בתמונות החנות (בינה מלאכותית)", en: "Grouping by look in the store photos (AI)", door: "מודל פתוח על השרת שלנו" },
  { key: "suggest", he: "הצעות החיפוש של גוגל", en: "Google search suggestions", door: "שירות ציבורי, לפי robots.txt" },
  { key: "youtube", he: "הצעות החיפוש של יוטיוב", en: "YouTube search suggestions", door: "שירות ציבורי, לפי robots.txt" },
  { key: "worldSearch", he: "חיפוש בגוגל במדינות אחרות", en: "Google search in other countries", door: "שירות ציבורי, לפי robots.txt" },
  { key: "trendsIL", he: "גוגל טרנדים בישראל", en: "Google Trends Israel", door: "RSS ציבורי" },
  { key: "trendsWorld", he: "גוגל טרנדים בעולם", en: "Google Trends worldwide", door: "RSS ציבורי" },
  { key: "siteVisitors", he: "המבקרים של LikeLink2", en: "LikeLink2's own visitors", door: "הנתונים שלנו" },
  { key: "crowd", he: "מה בודקים בכפתור הקסם", en: "What people check with the magic button", door: "הנתונים שלנו" },
  { key: "waves", he: "גלים של מותגים ודמויות", en: "Brand and character waves", door: "API השותפים הרשמי" },
  { key: "promise", he: "הטווח המוכח והסיכוי המכויל", en: "Proven range and calibrated chance", door: "החישוב של הרדאר" },
  { key: "window", he: "שעון החלון", en: "Window clock", door: "החישוב של הרדאר" },
  { key: "youtubeApi", he: "יוטיוב: סרטונים חדשים השבוע", en: "YouTube: new videos this week", door: "YouTube Data API (מפתח חינמי)" },
  { key: "hauls", he: "יוטיוב: סרטוני הקניות של הבלוגרים הראשונים", en: "YouTube: the first creators' haul videos", door: "YouTube Data API (מפתח חינמי)" },
  { key: "shops", he: "חנויות חדשות שנפתחות בעולם, לפי שמות האתרים", en: "New shops opening worldwide, by their domain names", door: "רשימה ציבורית חינמית של דומיינים חדשים" },
  { key: "trade", he: "מה המפעלים שולחים: נתוני המכס של אירופה, לכל סוג מוצר", en: "What the factories ship: EU customs records, every product line", door: "Eurostat, נתונים פתוחים רשמיים (בלי מפתח)" },
  { key: "news", he: "מי אמר ראשון: הרדאר או החדשות בעולם", en: "Who said it first: the radar or the world's news", door: "GDELT, מאגר חדשות פתוח (בלי מפתח)" },
  { key: "pinterest", he: "פינטרסט: טרנדים שעולים", en: "Pinterest: growing trends", door: "Pinterest API (טוקן של אפליקציה)" },
  { key: "instagram", he: "אינסטגרם: האשטגים", en: "Instagram: hashtags", door: "Instagram Graph API (החשבון המחובר)" },
  { key: "wikipedia", he: "ויקיפדיה: כמה קוראים על כל סוג, מאז 2016", en: "Wikipedia: readers of every kind, since 2016", door: "Wikimedia Pageviews API (רשמי, חינמי, לפי robots.txt)" },
  { key: "bluesky", he: "בלוסקיי: כמה מדברים על כל סוג השבוע", en: "Bluesky: how many posts name each kind this week", door: "חיפוש ציבורי ברשת פתוחה, לפי robots.txt" },
  { key: "metaAds", he: "ספריית הפרסומות של מטא: מודעות חדשות השבוע", en: "Meta Ad Library: new ads this week", door: "Ad Library API (טוקן של בעלת האתר)" },
  { key: "asia", he: "קוריאה ויפן בשפה שלהן: מה מקלידים שם בגוגל וביוטיוב", en: "Korea and Japan in their own language: what people type in Google and YouTube", door: "Google suggestions (לפי robots.txt) + NLLB-200, מודל תרגום פתוח על שרת הריצה" },
  // Their own robots.txt closes them; the radar respects it and reads the same countries through open doors.
  { key: "engine_baidu", he: "באידו (סין)", en: "Baidu (China)", door: "שירות ציבורי, לפי robots.txt", insteadHe: "במקום זה: מה המפעלים בסין שולחים לפי המכס של אירופה, וסרטוני הקניות מטאובאו ודואין ביוטיוב", insteadEn: "Instead: what China's factories ship, in EU customs, and the Taobao and Douyin finds on YouTube" },
  { key: "engine_naver", he: "נאבר (קוריאה)", en: "Naver (Korea)", door: "שירות ציבורי, לפי robots.txt", insteadHe: "במקום זה: החיפושים בגוגל וביוטיוב מקוריאה, גם בקוריאנית, וסרטוני הקניות מקוריאה ומאוליב יאנג ביוטיוב", insteadEn: "Instead: Google's and YouTube's searches from Korea, in Korean too, and the Korea and Olive Young finds on YouTube" },
]);
// The doors the radar reads next, each only through official access (never scraping).
export const NEXT_DOORS = Object.freeze([
  { key: "tiktok", he: "טיקטוק ו־TikTok Shop", en: "TikTok and TikTok Shop", door: "TikTok Shop Partner API / Research API, באישור של טיקטוק" },
  { key: "amazon", he: "אמזון", en: "Amazon", door: "Product Advertising API, או ספק נתונים מורשה בתשלום (באישורך)" },
  { key: "reddit", he: "רדיט", en: "Reddit", door: "Reddit Data API, לשימוש מסחרי באישור של רדיט" },
  { key: "shopify", he: "חנויות Shopify", en: "Shopify stores", door: "אפליקציה רשמית בחנויות שמתקינות אותה" },
]);
// The states say what happened in the run the receipt names (its date heads the panel).
export const SOURCE_STATES = Object.freeze({
  OK: { he: "ענה", en: "Answered", tone: "run" },
  REQUIRES_CONNECTION: { he: "מחכה לחיבור", en: "Waiting for a connection", tone: "slow" },
  FAILED: { he: "נשאל, בלי תשובה", en: "Asked, no answer", tone: "exit" },
  CLOSED: { he: "סגור לפי כללי האתר", en: "Closed by the site's rules", tone: "slow" },
  SKIPPED: { he: "דילג בריצה הזו", en: "Skipped this run", tone: "slow" },
  EMPTY: { he: "ענה ריק", en: "Answered empty", tone: "slow" },
  UNUSABLE: { he: "הנתונים נפסלו בבדיקה", en: "Data failed the checks", tone: "exit" },
});
// The run's own words for a state → the page's state (every error, block and missing connection by name).
const STATE_OF = (v) => (v === "OK" ? "OK" : v === "REQUIRES_CONNECTION" ? "REQUIRES_CONNECTION" : /ROBOTS/.test(String(v)) ? "CLOSED"
  : v === "FAILED" || v === "FAILING" || /^HTTP_\d+$/.test(String(v)) ? "FAILED" : v === "EMPTY" ? "EMPTY" : v === "UNUSABLE" ? "UNUSABLE" : "SKIPPED");
// The world categories' state from their own four counts (as runReceipt.js worldState; import-free here).
const WORLD_STATE = (v) => {
  if (!v || typeof v !== "object") return "FAILED";
  if (!Number.isFinite(v.asked)) return v.readToday > 0 ? "OK" : "FAILED";
  if (!v.asked) return "SKIPPED";
  if (!v.readToday) return "FAILED";
  if (!v.withItems) return "EMPTY";
  if (Number.isFinite(v.verified) && !v.verified) return "UNUSABLE";
  return "OK";
};
// The rows whose own host the receipt counts (the AliExpress areas share one host, so only the
// AliExpress row carries its counts; "world" carries its own category counts).
const OWN_HOST = new Set(["aliexpress", "suggest", "youtube", "worldSearch", "trendsIL", "trendsWorld", "youtubeApi", "pinterest", "instagram", "engine_baidu", "engine_naver"]);
/**
 * The run's own `sources` object → one public state per known source (unknown keys dropped), with
 * the receipt's counted answers on each row that has its own host (`counts`, null without a receipt).
 */
export function sourcesView(sources = {}, receipt = null) {
  const s = sources && typeof sources === "object" ? sources : {};
  return SOURCES.filter((x) => Object.hasOwn(s, x.key)).map((x) => {
    const v = s[x.key];
    const state = x.key === "world" ? WORLD_STATE(v) : STATE_OF(v);
    const c = OWN_HOST.has(x.key) ? receipt?.sources?.[x.key] : null;
    // The four stages apart: asked → a valid answer (scanned) → with data → kept after the radar's checks.
    const counts = x.key === "world" && v && typeof v === "object" && Number.isFinite(v.asked)
      ? { unit: "categories", asked: v.asked, scanned: v.readToday ?? 0, withData: v.withItems ?? 0, kept: Number.isFinite(v.verified) ? v.verified : null, failed: v.failed ?? 0, refused: 0, codes: null }
      : c ? { unit: "requests", asked: c.asked, scanned: (c.answered || 0) + (c.empty || 0), withData: c.answered, kept: Number.isInteger(c.kept) ? c.kept : null, refused: c.refused, failed: c.failed, codes: c.codes || null, countries: c.countries || null } : null;
    // Three groups, never mixed (the owner, 26.11, after an outside check read every listed source as
    // one the radar scans): what the run read, the doors her connection opens, and the doors closed
    // by the site's own rules, with the open door used instead.
    const group = state === "REQUIRES_CONNECTION" ? "connect" : state === "CLOSED" ? "closed" : "read";
    return { key: x.key, he: x.he, en: x.en, door: x.door, state, counts, group, ...(x.insteadHe ? { insteadHe: x.insteadHe, insteadEn: x.insteadEn } : {}) };
  });
}

/** The new-product record per category (each call carries the category it had): graded, hits. */
export function byCategory(calls = []) {
  const out = {};
  for (const c of Array.isArray(calls) ? calls : []) {
    const cat = String(c?.f?.category || c?.category || "").trim();
    if (!cat) continue;
    const t = (out[cat] ||= { category: cat, calls: 0, graded: 0, hits: 0 });
    t.calls++;
    if (c.result === "HIT" || c.result === "MISS") { t.graded++; if (c.result === "HIT") t.hits++; }
  }
  return Object.values(out).sort((a, b) => b.graded - a.graded || b.calls - a.calls || (a.category < b.category ? -1 : 1));
}

/**
 * 🗺️ The capability map (the owner's mission, 21.11, phase 2: "build a map: 1. works and verified in
 * production, 2. in the code but not connected, 3. connected but returns no reliable data, 4. partial
 * or unstable, 5. missing"). Computed from the latest run's board only, never declared: a source from
 * its state checked against the run receipt and its share of errors; an instrument from whether its
 * book is in today's sealed root and whether any of its calls has been graded; the missing ones are
 * the doors still closed. Pure: the page computes it from the sanitized board.
 */
export const CAPABILITY_CLASSES = Object.freeze({
  LIVE: { n: 1, he: "עובד ומאומת בייצור", en: "Working and verified in production" },
  NOT_CONNECTED: { n: 2, he: "קיים בקוד, מחכה לחיבור", en: "In the code, waiting for a connection" },
  UNRELIABLE: { n: 3, he: "מחובר, בלי נתונים אמינים", en: "Connected, no reliable data" },
  PARTIAL: { n: 4, he: "חלקי, או עם שגיאות", en: "Partial or unstable" },
  MISSING: { n: 5, he: "חסר ודורש פיתוח", en: "Missing, needs building" },
});
export const CAPABILITY = Object.freeze({ errorShare: 0.1 });

export function capabilityMap(board = {}, { rules = CAPABILITY } = {}) {
  const b = board || {};
  const rows = [];
  const receipt = b.receipt || null;
  for (const s of sourcesView(b.sourcesToday || {}, receipt)) {
    let cls;
    let why = null;
    if (s.state === "REQUIRES_CONNECTION" || s.state === "SKIPPED") cls = "NOT_CONNECTED";
    else if (s.state === "FAILED" || s.state === "EMPTY" || s.state === "UNUSABLE" || s.state === "CLOSED") { cls = "UNRELIABLE"; why = s.state; }
    else {
      const c = s.counts;
      const errors = c ? (c.refused || 0) + (c.failed || 0) : 0;
      const share = c?.asked ? errors / c.asked : 0;
      if (share >= rules.errorShare) { cls = "PARTIAL"; why = { errors, of: c.asked }; } else cls = "LIVE";
    }
    rows.push({ kind: "source", key: s.key, he: s.he, en: s.en, cls, why });
  }
  const view = recordView(b);
  const sealedRun = (b.ledger?.text || "").split("\n").some((l) => l.startsWith("run="));
  for (const r of view.rows) {
    if (r.daily) { rows.push({ kind: "instrument", key: r.id, he: r.he, en: r.en, cls: r.sealed ? "LIVE" : "PARTIAL", why: r.sealed ? null : "unsealed" }); continue; }
    const graded = r.result && (r.result.of || r.result.held !== undefined);
    const cls = !r.sealed && !graded ? "PARTIAL" : graded ? "LIVE" : "PARTIAL";
    rows.push({ kind: "instrument", key: r.id, he: r.he, en: r.en, cls, why: graded ? null : r.next ? { firstCheck: r.next } : "awaiting" });
  }
  if (receipt) rows.push({ kind: "instrument", key: "run", he: "קבלת הריצה", en: "The run receipt", cls: sealedRun ? "LIVE" : "PARTIAL", why: sealedRun ? null : "unsealed" });
  for (const d of NEXT_DOORS) rows.push({ kind: "door", key: d.key, he: d.he, en: d.en, cls: "MISSING", why: d.door });
  const counts = Object.fromEntries(Object.keys(CAPABILITY_CLASSES).map((k) => [k, rows.filter((r) => r.cls === k).length]));
  return { at: b.at || null, run: receipt?.run || null, rows, counts };
}
