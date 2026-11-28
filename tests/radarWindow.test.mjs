// ⏳ The window clock (src/lib/growth/radarWindow.js; the owner, 2026-11-20: "if there are still gaps,
// rise above everyone"). The tenth worldwide check found saturation scores and rules of thumb, and no
// tool that says how long a product's window stays open. For every find under the radar's own
// saturation line (2,000 listings), a calibrated chance that its listings are past the line in 3, 7
// and 14 days, sealed in advance and graded like a weather forecast.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  WINDOW, addReading, addWindows, calibrateWindow, cardWindow, closeChance, conceptKey, gradeWindows, issueWindows,
  newWindowState, phraseKey, phraseOfKey, readQueue, seriesOf, windowBoard, windowRecord, windowSealText,
} from "../src/lib/growth/radarWindow.js";
import { FRESH } from "../src/lib/growth/freshRisers.js";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";
import { teaserBoard } from "../src/lib/growth/radarGate.js";
import { LEDGER_BOOKS, ledgerText } from "../src/lib/growth/radarLedger.js";

const sha = (t) => createHash("sha256").update(t).digest("hex");
const DAY = 86_400_000;
const day = (base, n) => new Date(Date.parse(`${base}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
// A fixed pseudo-random sequence, so the test never depends on luck.
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };

/** Concept readings like readings.json: one reading a day, listings growing at their own pace with noise. */
function readingsOf({ n = 80, days = 30, end = "2026-11-20", seed = 7 } = {}) {
  const r = rng(seed);
  const out = {};
  for (let i = 0; i < n; i++) {
    const start = i % 2 ? 200 + Math.floor(r() * 1500) : 3000 + Math.floor(r() * 30000);
    const g = (r() - 0.3) * 0.06; // −1.8% … +4.2% a day
    let v = start;
    out[`k-${i}`] = Array.from({ length: days }, (_, d) => { v = Math.max(1, v * Math.exp(g + (r() - 0.5) * 0.02)); return { d: day(end, d - days + 1), listings: Math.round(v), sum: 100 }; });
  }
  return out;
}

test("the line is the radar's own saturation line, and keys are a concept id or a phrase", () => {
  assert.equal(WINDOW.line, FRESH.maxSimilar, "the clock closes where the new products' check calls SATURATED");
  assert.equal(phraseKey("Wide Leg"), "p:wide+leg");
  assert.equal(phraseKey("balls tree"), "p:balls+tree");
  assert.equal(phraseKey("<script> x"), null);
  assert.equal(phraseKey("a b c d"), null);
  assert.equal(phraseOfKey("p:wide+leg"), "wide leg");
  assert.equal(phraseOfKey("c:ear-cuff"), null);
  assert.equal(conceptKey("ear-cuff"), "c:ear-cuff");
  assert.equal(conceptKey("Bad Id"), null);
});

test("a phrase keeps one reading a day, drops old ones, and remembers the day it was shown", () => {
  let h = addReading({}, "p:wide+leg", "2026-11-20", 1483, { shown: true });
  h = addReading(h, "p:wide+leg", "2026-11-20", 1490);
  assert.deepEqual(h["p:wide+leg"].r, [["2026-11-20", 1490]]);
  assert.equal(h["p:wide+leg"].shown, "2026-11-20");
  h = addReading(h, "p:wide+leg", "2027-02-01", 1600);
  assert.deepEqual(h["p:wide+leg"].r, [["2027-02-01", 1600]], "readings older than keepDays are dropped");
  assert.deepEqual(addReading(h, "nope", "2026-11-20", 3), h, "a key that is not a phrase is never stored");
  const s = seriesOf({ readings: { "ear-cuff": [{ d: "2026-11-19", listings: 190 }, { d: "2026-11-20", listings: 196 }, { d: "2026-11-20", listings: null }] }, hist: h });
  assert.deepEqual(s["c:ear-cuff"], [["2026-11-19", 190], ["2026-11-20", 196]]);
  assert.deepEqual(s["p:wide+leg"], [["2027-02-01", 1600]]);
});

test("the clock learns from the listing series and speaks only for its own size band", () => {
  const series = seriesOf({ readings: readingsOf() });
  const today = "2026-11-20";
  const calib = calibrateWindow(series, today);
  for (const h of WINDOW.horizons) assert.equal(calib[h].state, "READY", `${h} days`);
  assert.ok(calib[3].res.bands[0].length >= WINDOW.minGroup, "enough small-phrase errors");
  // Near the line and fast vs far below and flat.
  const fast = Array.from({ length: 10 }, (_, d) => [day(today, d - 9), Math.round(1200 * Math.exp(0.05 * d))]);
  const flat = Array.from({ length: 10 }, (_, d) => [day(today, d - 9), 300]);
  const cf = closeChance(fast, today, calib[14]);
  const cs = closeChance(flat, today, calib[14]);
  assert.ok(cf && cs);
  assert.ok(cf.p > cs.p, `fast near the line ${cf.p}% > flat far below ${cs.p}%`);
  assert.ok(cf.weekPct > 30 && Math.abs(cs.weekPct) < 1);
  assert.ok(cf.p >= 1 && cf.p <= 99 && cs.p >= 1 && cs.p <= 99, "never 0% and never 100%");
  // Past the line, or without a pace (one reading), there is no chance to give.
  assert.equal(closeChance([[day(today, -5), 1900], [today, 2400]], today, calib[3]), null);
  assert.equal(closeChance([[today, 600]], today, calib[3]), null);
  // No small-band errors → the clock stays silent for small phrases (never borrowed from big searches).
  const big = seriesOf({ readings: Object.fromEntries(Object.entries(readingsOf()).filter(([, rs]) => rs[0].listings >= 3000)) });
  const calBig = calibrateWindow(big, today);
  assert.equal(closeChance(fast, today, calBig[3]), null);
  assert.equal(windowBoard(newWindowState(), calBig, [], today).horizons[0].state, "CALIBRATING");
  assert.equal(calBig[3].small, 0, "the small band's progress is counted, ready or not");
  assert.ok(calib[3].small >= WINDOW.minGroup);
  assert.equal(windowBoard(newWindowState(), calib, [], today).horizons[0].small, calib[3].small);
});

test("every chance is graded on its day like a weather forecast, and the record adds up", () => {
  const issued = [
    { i: "p:wide+leg", a: "2026-11-20", h: 3, o: 1483, p: 70 },
    { i: "c:ear-cuff", a: "2026-11-20", h: 3, o: 196, p: 2 },
    { i: "p:quiet+thing", a: "2026-11-20", h: 3, o: 900, p: 20 },
    { i: "p:wide+leg", a: "2026-11-20", h: 7, o: 1483, p: 80 },
  ];
  let state = addWindows(newWindowState(), issued);
  state = addWindows(state, issued);
  assert.equal(state.open.length, 4, "one per key, day and horizon");
  const series = { "p:wide+leg": [["2026-11-20", 1483], ["2026-11-23", 2150]], "c:ear-cuff": [["2026-11-24", 199]] };
  const g = gradeWindows(state, series, "2026-11-24");
  assert.equal(g.graded, 2, "wide leg on its day, ear cuff on the day after");
  assert.equal(g.state.open.length, 2, "quiet thing waits (unread), the 7-day one is not due");
  const rec = windowRecord(g.state).find((x) => x.h === 3);
  assert.equal(rec.n, 2);
  assert.equal(rec.hits, 1);
  assert.equal(rec.brier, Math.round((((0.7 - 1) ** 2 + (0.02 - 0) ** 2) / 2) * 1000) / 1000);
  assert.equal(rec.baseRate, 50);
  assert.ok(rec.skill > 0, "better than always saying the base rate");
  const later = gradeWindows(g.state, series, "2026-12-01");
  assert.equal(later.setAside, 1, "a chance whose phrase was never read again is set aside, never counted");
  assert.equal(windowRecord(later.state).find((x) => x.h === 3).n, 2);
});

test("the day's book is sealed into the root, the board keeps it, and the lock keeps the names", () => {
  const issued = [{ i: "p:wide+leg", a: "2026-11-21", h: 3, o: 1483, p: 23 }, { i: "c:ear-cuff", a: "2026-11-21", h: 3, o: 196, p: 1 }];
  const text = windowSealText(issued);
  assert.equal(text, "c:ear-cuff|2026-11-21|3|196|2000|1%\np:wide+leg|2026-11-21|3|1483|2000|23%");
  assert.equal(windowSealText([{ i: "bad key", a: "2026-11-21", h: 3, o: 1, p: 5 }]), null);
  assert.ok(LEDGER_BOOKS.includes("window"));
  const root = ledgerText(Object.fromEntries(LEDGER_BOOKS.map((k) => [k, sha(k)])));
  assert.match(root, /\nwindow=[0-9a-f]{64}\n/);
  const state = addWindows(newWindowState(), issued);
  const w = { ...windowBoard(state, {}, issued, "2026-11-21"), seal: { d: "2026-11-21", sha256: sha(text), count: 2, text, ots: [] } };
  const board = sanitizeBoard({ v: 2, at: "2026-11-21T06:00:00Z", record: {}, concepts: [], window: w, ledger: { d: "2026-11-21", sha256: sha(root), count: LEDGER_BOOKS.length, text: root, ots: [] } });
  assert.equal(board.window.seal.text, text);
  assert.equal(board.window.open, 2);
  assert.equal(board.ledger.text, root, "the root with window= is kept");
  assert.equal(sanitizeBoard({ v: 2, at: "2026-11-21T06:00:00Z", record: {}, concepts: [], window: { ...w, seal: { ...w.seal, text: "<img src=x>" } } }).window.seal.text, null);
  const teaser = teaserBoard({ ...board, window: { ...board.window, recent: [{ i: "p:wide+leg", a: "2026-11-18", h: 3, o: 1, v: 2, p: 5, hit: 0 }] } });
  assert.equal(teaser.window.seal.text, undefined, "the book names the finds: behind the lock");
  assert.deepEqual(teaser.window.recent, []);
  assert.equal(teaser.window.open, 2, "the record and the count stay public");
});

test("a find's card says what is measured: the pace first, the chance once the clock can speak", () => {
  const today = "2026-11-20";
  const series = { ...seriesOf({ readings: readingsOf() }), "p:new+one": [[today, 640]], "p:old+one": [[day(today, -6), 700], [today, 900]], "p:big+one": [[today, 2600]] };
  const calib = calibrateWindow(series, today);
  assert.deepEqual(cardWindow(series, "p:new+one", today, calib), { state: "MEASURING", o: 640, line: 2000, since: today });
  const ready = cardWindow(series, "p:old+one", today, calib);
  assert.equal(ready.state, "READY");
  assert.equal(ready.h, 14, "the longest ready horizon");
  assert.ok(ready.p >= 1 && ready.p <= 99);
  assert.equal(cardWindow(series, "p:big+one", today, calib).state, "CLOSED");
  assert.equal(cardWindow(series, "p:gone", today, calib), null, "no reading today, no line");
  const clean = sanitizeBoard({ v: 2, at: "2026-11-20T06:00:00Z", record: {}, concepts: [], fresh: { risers: [{ id: "1005013201890326", title: "Wide-leg pants", image: "https://ae-pic-a1.aliexpress-media.com/kf/S1.jpg", buy: "https://s.click.aliexpress.com/e/_oAbCdEf", orders: 156, weekPct: 208, known: { phrase: "wide leg", similar: 1483 }, window: { ...ready, p: 140 } }] } });
  assert.equal(clean.fresh.risers[0].window, null, "a chance outside 1–99% never reaches the page");
});

test("the phrases read again: a chance due first, then the most recently shown; never twice a day", () => {
  const hist = { "p:a+a": { r: [["2026-11-18", 10]], shown: "2026-11-18" }, "p:b+b": { r: [["2026-11-19", 10]], shown: "2026-11-19" }, "p:c+c": { r: [["2026-11-20", 10]], shown: "2026-11-19" }, "p:d+d": { r: [["2026-10-01", 10]], shown: "2026-10-01" } };
  const state = { open: [{ i: "p:a+a", a: "2026-11-17", h: 3 }] };
  assert.deepEqual(readQueue(hist, state, "2026-11-20"), ["p:a+a", "p:b+b"]);
});

test("the run reads, grades, issues and seals the clock; the page shows it in the proof tab and on the cards", () => {
  const run = readFileSync("scripts/catalog/trend-radar.mjs", "utf8");
  assert.match(run, /board\.window\.seal = await sealBook\(/);
  assert.match(run, /window: board\.window\?\.seal\?\.sha256/);
  assert.match(run, /env\.RADAR_WINDOW !== "0"/);
  const page = readFileSync("src/components/discover/radar.jsx", "utf8");
  assert.match(page, /<WindowClock win=\{board\.window\} \/>/);
  // The card line is a row of the one find card (radarCore.js findFacts), on new products and new kinds.
  assert.match(page, /<FindFacts f=\{r\} kind="fresh"/);
  assert.match(page, /<FindFacts f=\{k\} kind="kinds"/);
  assert.match(readFileSync("src/lib/growth/radarCore.js", "utf8"), /add\("window", "שעון החלון"/);
  assert.match(readFileSync("src/lib/growth/radarCore.js", "utf8"), /id: "window", book: "window", tab: "proof", section: "window"/, "#window opens the proof tab (radarCore.js)");
});

test("proof before display (28.11): the window clock says a horizon's chance on a card only once its graded record beats the base rate", () => {
  const today = "2026-11-20";
  const series = { ...seriesOf({ readings: readingsOf() }), "p:old+one": [[day(today, -6), 700], [today, 900]] };
  const calib = calibrateWindow(series, today);
  assert.equal(cardWindow(series, "p:old+one", today, calib).h, 14, "without the record: the old rule");
  const record = [{ h: 3, n: 236, skill: 4.7 }, { h: 7, n: 0, skill: null }, { h: 14, n: 0, skill: null }];
  const proven = cardWindow(series, "p:old+one", today, calib, { record });
  assert.equal(proven.state, "READY");
  assert.equal(proven.h, 3, "only the horizon whose record proves itself");
  assert.deepEqual(proven.rec, { n: 236, skill: 4.7 });
  const waiting = cardWindow(series, "p:old+one", today, calib, { record: [{ h: 3, n: 236, skill: -1 }] });
  assert.equal(waiting.state, "PROVING", "ready to speak, still waiting for its proof");
  const clean = sanitizeBoard({ v: 2, at: "2026-11-20T06:00:00Z", record: {}, concepts: [], fresh: { risers: [{ id: "1005013201890326", title: "Wide-leg pants", image: "https://ae-pic-a1.aliexpress-media.com/kf/S1.jpg", buy: "https://s.click.aliexpress.com/e/_oAbCdEf", orders: 156, weekPct: 208, known: { phrase: "wide leg", similar: 1483 }, window: proven }, { id: "1005013201890327", title: "Wide-leg pants 2", image: "https://ae-pic-a1.aliexpress-media.com/kf/S2.jpg", buy: "https://s.click.aliexpress.com/e/_oAbCdEg", orders: 150, weekPct: 200, known: { phrase: "wide leg", similar: 1483 }, window: waiting }] } });
  assert.deepEqual(clean.fresh.risers[0].window.rec, { n: 236, skill: 4.7 });
  assert.equal(clean.fresh.risers[1].window.state, "PROVING");
});
