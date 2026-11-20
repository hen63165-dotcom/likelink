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
// Pure and import-free, so the runner, the server, the page, the Wix page and the tests share it.

export const INSTRUMENTS = Object.freeze([
  { id: "early", book: "early", tab: "today", section: "verdict", he: "קביעות לפני כולם", en: "Before-everyone calls", whatHe: "כשכל 4 הסימנים מסכימים: העולם, הביקוש, המוכרים וישראל", whatEn: "When all four signals agree: the world, demand, sellers and Israel" },
  { id: "stages", book: "stages", tab: "today", section: "verdict", he: "קביעות עלייה", en: "Rising calls", whatHe: "סוג שהביקוש שלו מתחיל לעלות", whatEn: "A kind whose demand starts to rise" },
  { id: "luck", book: "luck", tab: "proof", section: "luck", he: "הרדאר מול המזל", en: "The radar vs luck", whatHe: "סוג אקראי כל יום, נבדק באותו כלל", whatEn: "A random kind each day, graded by the same rule" },
  { id: "fresh", book: "fresh", tab: "today", section: "fresh", he: "מוצרים חדשים", en: "New products", whatHe: "מוצר קטן שההזמנות שלו רצות, לפני שכולם מוכרים", whatEn: "A small product whose orders run, before everyone sells it" },
  { id: "kinds", book: "kinds", tab: "today", section: "kinds", he: "סוגים חדשים", en: "New kinds", whatHe: "סוג חדש שהבינה המלאכותית מצאה לפי משמעות", whatEn: "A new kind the AI found by meaning" },
  { id: "brain", book: "brain", tab: "proof", section: "brain", he: "המוח", en: "The brain", whatHe: "מה הרדאר למד מכל קביעה שנבדקה", whatEn: "What the radar learned from every graded call" },
  { id: "promise", book: "promise", tab: "proof", section: "promise", he: "הטווח המוכח והסיכוי המכויל", en: "The proven range and calibrated chance", whatHe: "טווח הזמנות וסיכוי לעלייה, לכל מוצר שנמדד", whatEn: "An orders range and a chance to grow, for every product measured" },
  { id: "window", book: "window", tab: "proof", section: "window", he: "שעון החלון", en: "The window clock", whatHe: "הסיכוי שמוצר יגיע ל־2,000 מודעות, כלומר שכולם כבר מוכרים", whatEn: "The chance a product reaches 2,000 listings: everyone sells it" },
  { id: "globe", book: "globe", tab: "tools", section: "globe", he: "המדינה הבאה", en: "The next country", whatHe: "באיזו מדינה טרנד יגיע בהמשך", whatEn: "Which country a trend reaches next" },
  { id: "prices", book: "prices", tab: "proof", section: "ledger", he: "מחירי החנות", en: "Store prices", whatHe: "המחיר של כל מוצר שנקרא, פעם ביום", whatEn: "The price of every item read, once a day" },
]);

/** The sealed books in the root's fixed order (radarLedger.js LEDGER_BOOKS is this list). */
export const BOOKS = Object.freeze(INSTRUMENTS.filter((i) => i.book).map((i) => i.book));

/** Every section id on /radar → its tab (deep links like /radar#window open the right tab). */
export const SECTION_TABS = Object.freeze({
  today: "today", verdict: "today", picks: "today", duel: "today", fresh: "today", kinds: "today", "radar-results": "today",
  proof: "proof", record: "proof", ledger: "proof", anchors: "proof", challenge: "proof",
  tools: "tools", styles: "tools", waves: "tools", crowd: "tools", how: "tools",
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
  const graded = rows.filter((r) => r.result && (r.result.kind === "hits" || r.result.kind === "learned") && r.id !== "brain" && r.id !== "luck");
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
  } else {
    if (num(f.medianWeekPct) !== null) add("pace", "קצב ההזמנות", "Orders pace", `${iso(`${signed(f.medianWeekPct)}%`)} בשבוע (החציון של ${f.measured ?? f.members} מודעות)`, `${signed(f.medianWeekPct)}% a week (median of ${f.measured ?? f.members} listings)`, "up");
    if (num(f.orders) !== null) add("orders", "הזמנות ב־30 יום", "Orders in 30 days", `${he(f.orders)} יחד, ב־${f.members} מודעות חדשות`, `${en(f.orders)} together, in ${f.members} new listings`);
  }
  const similar = num(f.known?.similar);
  if (similar !== null) add("sellers", "מודעות דומות", "Similar listings", `${he(similar)} באליאקספרס · שקט בגוגל בארה״ב`, `${en(similar)} on AliExpress · quiet on Google in the US`);
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
