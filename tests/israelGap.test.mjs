// The Israel gap (src/lib/growth/israelGap.js) and the radar's discovery (radarDiscovery.js):
// autocomplete answers are counted as extensions (never the echo, never stored as text), a failed
// answer is never a zero, robots.txt decides whether the source is read, an arrival date is claimed
// only when the radar saw "none" first, and discovery never adds a brand, an unlisted kind or a
// phrase the watch list already covers.
import test from "node:test";
import assert from "node:assert/strict";
import { GAP_STATES, addAwareness, awarenessReading, extensions, gapOf, leadTimes, levelOf, normalize, parseSuggest, robotsAllows, suggestUrl, trendingInIsrael, windowOf } from "../src/lib/growth/israelGap.js";
import { admitDiscovered, autoId, covered, discover, phrasesOf } from "../src/lib/growth/radarDiscovery.js";

const at = (d) => Date.parse(`${d}T06:00:00Z`);

test("normalize: niqqud, apostrophes and spaces never split one phrase in two", () => {
  assert.equal(normalize("  צָמִיד   צ׳ארמס "), "צמיד צ'ארמס");
  assert.equal(normalize("Butter-Stick  SQUISHY!"), "butter stick squishy");
});

test("autocomplete: the suggestions of the real Firefox answer, and how many extend the phrase", () => {
  // The answer a runner got on 2026-11-14 for "סקווישי" (hl=he, gl=il), exactly as returned.
  const body = '["סקווישי",["סקווישי","סקוושי","סקווישי חמאה","סקווישי דמפלינג","סקוושי אושר עד","סקוושים","סקווישי נידו","סקוושי דאמפלינג","סקווישי קרח","סקווישי פופ"],[],{}]';
  const list = parseSuggest(body);
  assert.equal(list.length, 10);
  assert.equal(extensions("סקווישי", list), 5, "the echo and other spellings are not extensions");
  assert.equal(extensions("סקווישי חמאה", list), 0);
  assert.equal(parseSuggest("<html>blocked</html>"), null, "an unusable answer is null, never an empty list");
  assert.equal(extensions("x", null), null);
  assert.match(suggestUrl("סקווישי חמאה", { hl: "he", gl: "il" }), /^https:\/\/suggestqueries\.google\.com\/complete\/search\?client=firefox&hl=he&gl=il&q=/);
});

test("levels: 0 is NONE, 1–2 FAINT, 3+ AWARE, unmeasured is null", () => {
  assert.deepEqual([levelOf(0), levelOf(1), levelOf(2), levelOf(3), levelOf(null)], ["NONE", "FAINT", "FAINT", "AWARE", null]);
});

test("robots.txt decides: a missing file allows, a Disallow for everyone blocks, an error blocks", () => {
  assert.equal(robotsAllows(404, ""), true);
  assert.equal(robotsAllows(200, "User-agent: *\nDisallow: /complete\n"), false);
  assert.equal(robotsAllows(200, "User-agent: *\nDisallow: /complete\nAllow: /complete/search\n"), true, "the longest rule wins");
  assert.equal(robotsAllows(200, "User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /aclk\n"), true);
  assert.equal(robotsAllows(503, ""), false);
  assert.equal(robotsAllows(200, "User-agent: *\nDisallow: /\n", "/trending/rss"), false);
});

test("the gap: Hebrew searches decide; a failed day is no reading, never a NONE", () => {
  const day = (d, x) => awarenessReading(x, { now: at(d) });
  assert.equal(gapOf([]).state, "UNKNOWN");
  assert.equal(gapOf([day("2026-11-14", { he: [0], en: 0, world: 7 })]).state, "GAP");
  assert.equal(gapOf([day("2026-11-14", { he: [0], en: 0, world: 0 })]).state, "QUIET");
  assert.equal(gapOf([day("2026-11-14", { he: [1, 0], en: 0, world: 7 })]).state, "ARRIVING");
  assert.equal(gapOf([day("2026-11-14", { he: [4], world: 9 })]).state, "ARRIVED");
  assert.equal(gapOf([day("2026-11-14", { he: [0], world: 9, trend: true })]).state, "ARRIVED", "a Google Trends Israel hit means it is here");
  assert.equal(gapOf([day("2026-11-14", { he: [0], en: 5, world: 9 })]).state, "ARRIVING", "English searches from Israel never make it ARRIVED alone");
  assert.equal(gapOf([day("2026-11-14", { he: [null], en: null, world: null })]).state, "UNKNOWN");
  const lines = gapOf([day("2026-11-14", { he: [0], world: 7 })]).evidence.map((e) => e.text).join("\n");
  assert.match(lines, /14\.11/);
  assert.doesNotMatch(lines, /\d+ חיפושים/, "never a number of searches");
});

test("the arrival clock: an arrival date only after the radar saw none", () => {
  let h = [];
  h = addAwareness(h, awarenessReading({ he: [0], world: 5 }, { now: at("2026-11-14") }));
  h = addAwareness(h, awarenessReading({ he: [0], world: 6 }, { now: at("2026-11-20") }));
  h = addAwareness(h, awarenessReading({ he: [2], world: 8 }, { now: at("2026-11-30") }));
  const g = gapOf(h);
  assert.equal(g.state, "ARRIVING");
  assert.equal(g.arrivedOn, "2026-11-30");
  const already = gapOf([awarenessReading({ he: [5] }, { now: at("2026-11-14") })]);
  assert.equal(already.arrivedOn, null, "already searched when measuring began: no arrival date is claimed");
  const one = addAwareness(addAwareness([], awarenessReading({ he: [1] }, { now: at("2026-11-14") })), awarenessReading({ he: [3] }, { now: at("2026-11-14") }));
  assert.equal(one.length, 1, "one reading a day");
  const lt = leadTimes([{ concept: "a", at: "2026-11-10" }, { concept: "b", at: "2026-11-01" }], { a: { arrivedOn: "2026-11-30" }, b: { arrivedOn: null } });
  assert.deepEqual([lt.observed, lt.typicalDays], [1, null], "a typical lead time needs three observed arrivals");
  const lt3 = leadTimes([1, 2, 3].map((i) => ({ concept: `c${i}`, at: "2026-11-01" })), { c1: { arrivedOn: "2026-11-11" }, c2: { arrivedOn: "2026-11-21" }, c3: { arrivedOn: "2026-11-15" } });
  assert.equal(lt3.typicalDays, 14);
});

test("the window: open only for a rising concept that has not arrived", () => {
  assert.equal(windowOf("EMERGING", { state: "GAP" }), "OPEN");
  assert.equal(windowOf("RISING", { state: "ARRIVING" }), "CLOSING");
  assert.equal(windowOf("RISING", { state: "ARRIVED" }), "CLOSED");
  assert.equal(windowOf("STEADY", { state: "GAP" }), null);
  assert.equal(windowOf("UNVERIFIED", { state: "GAP" }), null, "no window before a direction is measured");
  assert.ok(GAP_STATES.GAP.he && GAP_STATES.ARRIVED.he);
});

test("Google Trends Israel: a concept trends only when its Hebrew phrase is in a trending search", () => {
  const concepts = [{ id: "a", he: "צמיד טניס", hq: ["צמיד טניס"] }, { id: "b", he: "סקווישי חמאה", hq: ["סקווישי חמאה"] }];
  const hit = trendingInIsrael(concepts, [{ term: "צמיד טניס זהב" }, { term: "מכבי תל אביב" }]);
  assert.deepEqual([...hit], ["a"]);
  assert.equal(trendingInIsrael(concepts, []).size, 0);
});

test("discovery: a phrase several different hot items share, never a brand, unlisted kind or a covered one", () => {
  const item = (id, title, v = 500) => ({ product_id: String(1000000 + id), product_title: title, lastest_volume: v });
  const lists = {
    home: [item(1, "Cloud Slides Women Summer Soft"), item(2, "Thick Cloud Slides Non Slip"), item(3, "Cloud Slides Pillow Platform"), item(4, "Drawer Organizer Box")],
    bags: [item(5, "Labubu Keychain Bag Charm"), item(6, "Labubu Keychain Plush"), item(7, "Labubu Keychain Doll")],
  };
  const concepts = [{ id: "drawer-organizer", en: "drawer organizer" }];
  const got = discover(lists, concepts);
  assert.equal(got[0].en, "cloud slides");
  assert.equal(got[0].items, 3);
  assert.ok(!got.some((c) => /labubu/.test(c.en)), "a brand never joins");
  assert.ok(!got.some((c) => c.en === "drawer organizer"), "a covered phrase never joins");
  assert.ok(covered("drawer organizers", concepts));
  assert.ok(!phrasesOf("New 2026 Fashion Women Gold").size, "filler words make no phrase");
});

test("trial concepts: three a day at most, dropped after the trial unless rising", () => {
  const cands = ["cloud slides", "pearl claw", "mini fan", "neck fan"].map((en) => ({ en, items: 4, orders: 900, category: "home", kind: "home" }));
  let cur = admitDiscovered([], cands, { now: at("2026-11-01") });
  assert.equal(cur.length, 3);
  assert.ok(cur.every((c) => c.auto && c.found === "2026-11-01" && c.id === autoId(c.en)));
  cur = admitDiscovered(cur, cands, { now: at("2026-11-02") });
  assert.equal(cur.length, 4, "the fourth joins the next day, the first three are not added twice");
  cur = admitDiscovered(cur, [], { now: at("2026-11-15"), stages: { [autoId("cloud slides")]: "RISING" } });
  assert.deepEqual(cur.map((c) => c.en), ["cloud slides", "neck fan"], "past the trial: only the rising one (and the younger one) stay");
});
