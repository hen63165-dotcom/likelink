// 📚 Wikipedia attention (src/lib/growth/wikiSignal.js; the owner, 2026-11-21: "surpass every company
// you showed me, one by one"): a kind is matched to an article only when the article really names it,
// attention is Wikimedia's own daily readers (a thin week says nothing about direction), the history
// is by month since 2016, and the board keeps numbers and titles only.
import test from "node:test";
import assert from "node:assert/strict";
import { WIKI, acceptTitle, attentionOf, candidateTitles, entityUrl, hebrewTitleOf, historyOf, summaryOf, summaryUrl, viewsUrl, wikiCard, wikiSummary } from "../src/lib/growth/wikiSignal.js";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";
import { sourceOf } from "../src/lib/growth/runReceipt.js";

test("wiki: the titles tried are the full phrase, then its first and last two words", () => {
  assert.deepEqual(candidateTitles("quiet luxury tote"), ["Quiet luxury tote", "Quiet luxury", "Luxury tote"]);
  assert.deepEqual(candidateTitles("barrel jeans"), ["Barrel jeans"]);
  assert.deepEqual(candidateTitles(""), []);
});

test("wiki: an article counts only when it really names the kind", () => {
  // The full phrase: Wikipedia's own redirect decides.
  assert.equal(acceptTitle("western boots", "Western boots", "Cowboy boot"), true);
  // A part: every distinctive word of the title is the kind's own, at least two of them.
  assert.equal(acceptTitle("quiet luxury tote", "Quiet luxury", "Quiet luxury"), true);
  assert.equal(acceptTitle("old money sweater", "Old money", "Old money"), true);
  assert.equal(acceptTitle("cat eye sunglasses", "Cat eye", "Cat eye glasses"), true);
  // One shared word is a different subject: the animal, the whole toy family, a generic garment.
  assert.equal(acceptTitle("capybara squishy", "Capybara", "Capybara"), false);
  assert.equal(acceptTitle("butter stick squishy", "Stick squishy", "Squishy"), false);
  assert.equal(acceptTitle("barrel leg jeans", "Leg jeans", "Jeans"), false);
  assert.equal(acceptTitle("quiet luxury tote", "Quiet luxury", ""), false);
});

test("wiki: the official URLs, with titles encoded", () => {
  assert.equal(summaryUrl("Quiet luxury"), "https://en.wikipedia.org/api/rest_v1/page/summary/Quiet_luxury?redirect=true");
  assert.equal(entityUrl("Q123"), "https://www.wikidata.org/wiki/Special:EntityData/Q123.json");
  assert.equal(viewsUrl("en.wikipedia", "Mary Jane (shoe)", { from: "2026-09-22", to: "2026-11-20" }),
    "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/Mary_Jane_(shoe)/daily/2026092200/2026112000");
  assert.match(viewsUrl("he.wikipedia", "נעלי מרי ג'יין", { from: "2016-01-01", to: "2026-10-31", granularity: "monthly" }), /\/monthly\/2016010100\/2026100100$/);
  assert.match(WIKI.ua, /likelink2\.vercel\.app/);
});

test("wiki: a summary answer gives the resolved title and its Wikidata id; a disambiguation is no match", () => {
  assert.deepEqual(summaryOf({ type: "standard", title: "Cowboy boot", titles: { normalized: "Cowboy boot" }, wikibase_item: "Q1140347" }), { title: "Cowboy boot", q: "Q1140347" });
  assert.equal(summaryOf({ type: "disambiguation", title: "Barrel" }), null);
  assert.equal(summaryOf(null), null);
  assert.equal(hebrewTitleOf({ entities: { Q1: { sitelinks: { hewiki: { title: "מגף בוקרים" } } } } }, "Q1"), "מגף בוקרים");
  assert.equal(hebrewTitleOf({ entities: { Q1: { sitelinks: {} } } }, "Q1"), null);
});

const daily = (values, end = "2026-11-20") => ({
  items: values.map((v, i) => ({ timestamp: `${new Date(Date.parse(`${end}T00:00:00Z`) - (values.length - 1 - i) * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "")}00`, views: v })),
});

test("wiki: this week against last week; a thin week says nothing about direction", () => {
  const a = attentionOf(daily([...Array(16).fill(10), ...Array(7).fill(20), ...Array(7).fill(30)]));
  assert.deepEqual(a, { last7: 210, prev7: 140, last30: 510, weekPct: 50, to: "2026-11-20" });
  const thin = attentionOf(daily([...Array(7).fill(5), ...Array(7).fill(9)]));
  assert.equal(thin.weekPct, null);
  assert.equal(attentionOf(daily([1, 2, 3])), null);
  // A day with no readers is missing from Wikimedia's answer and counts as 0.
  const gap = attentionOf({ items: [{ timestamp: "2026111300", views: 100 }, { timestamp: "2026112000", views: 100 }, ...daily(Array(5).fill(20), "2026-11-19").items] });
  assert.equal(gap.last7, 200);
});

test("wiki: the history since 2016 — the busiest month and this month a year ago", () => {
  const items = [];
  for (let y = 2016; y <= 2026; y++) for (let m = 1; m <= 12; m++) {
    if (y === 2026 && m > 10) break;
    items.push({ timestamp: `${y}${String(m).padStart(2, "0")}0100`, views: y === 2024 && m === 3 ? 9000 : 1000 + (y - 2016) * 100 });
  }
  const h = historyOf({ items });
  assert.equal(h.since, "2016-01");
  assert.deepEqual(h.peak, { month: "2024-03", views: 9000 });
  assert.deepEqual(h.month, { month: "2026-10", views: 2000 });
  assert.equal(h.yoyPct, 5.3);
  assert.equal(h.months, 130);
});

test("wiki: the card, the day's summary, the board keeps numbers and titles only", () => {
  const a = { last7: 900, prev7: 600, last30: 2600, weekPct: 50, to: "2026-11-20" };
  const card = wikiCard({ en: "Quiet luxury", he: null, a, ah: null, h: { since: "2023-02", peak: { month: "2023-09", views: 120000 }, month: { month: "2026-10", views: 30000 }, yoyPct: -12, months: 45 } });
  assert.equal(card.rising, true);
  assert.deepEqual(wikiSummary([card, null]), { articles: 1, hebrew: 0, rising: 1, since: "2023-02" });
  const doc = {
    at: "2026-11-21T06:00:00.000Z", record: {}, wiki: { articles: 1, hebrew: 0, rising: 1, since: "2023-02", doors: { summary: true } },
    concepts: [{ id: "quiet-luxury-tote", he: "תיק יוקרה שקטה", en: "quiet luxury tote", stage: "STEADY", gap: { state: "QUIET" }, wiki: { ...card, en: "<script>x</script>", a } },
      { id: "old-money-sweater", he: "סוודר אולד מאני", en: "old money sweater", stage: "STEADY", gap: { state: "QUIET" }, wiki: card }],
  };
  const b = sanitizeBoard(doc);
  assert.equal(b.concepts[0].wiki, null);
  assert.equal(b.concepts[1].wiki.en, "Quiet luxury");
  assert.equal(b.concepts[1].wiki.a.weekPct, 50);
  assert.deepEqual(b.wiki, { articles: 1, hebrew: 0, rising: 1, since: "2023-02" });
});

test("wiki: the run receipt counts Wikimedia's hosts as one source", () => {
  assert.equal(sourceOf("https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/x"), "wikipedia");
  assert.equal(sourceOf("https://en.wikipedia.org/api/rest_v1/page/summary/X"), "wikipedia");
  assert.equal(sourceOf("https://www.wikidata.org/wiki/Special:EntityData/Q1.json"), "wikipedia");
  assert.equal(sourceOf("https://en.wikipedia.org/robots.txt"), "rules");
});
