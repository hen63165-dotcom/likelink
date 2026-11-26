// 🏁 Who named it first (rivalSignal.js): the trend companies' public RSS feeds only (robots.txt first),
// each post kept as its date, link and word pairs; every sealed call checked against all of it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RIVALS, RIVALS_UNFED, cleanRivals, firstRivalMention, mergeRival, pairsOf, parseFeed, rivalRace, rivalsBoard } from "../src/lib/growth/rivalSignal.js";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";
import { teaserBoard } from "../src/lib/growth/radarGate.js";
import { SECTION_TABS } from "../src/lib/growth/radarCore.js";

const RSS = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Blog</title>
<item><title><![CDATA[10 Trending Products: Butter Stick Squishies &amp; More]]></title><link>https://blog.example.com/trending-1</link><pubDate>Tue, 01 Dec 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>The <b>butter stick squishy</b> is everywhere.</p>]]></description></item>
<item><title>Cloud slides are back</title><link>https://blog.example.com/cloud</link><pubDate>Mon, 16 Nov 2026 08:00:00 +0000</pubDate><content:encoded><![CDATA[<p>Why cloud slides sell.</p>]]></content:encoded></item>
<item><title>No date here</title><link>https://blog.example.com/x</link></item>
</channel></rss>`;

test("a feed's posts: the date, the link and the word pairs, never the text", () => {
  const posts = parseFeed(RSS);
  assert.equal(posts.length, 2, "a post without a date is left out");
  assert.equal(posts[0].d, "2026-12-01");
  assert.equal(posts[0].u, "https://blog.example.com/trending-1");
  assert.ok(posts[0].p.includes("butter stick"));
  assert.ok(posts[0].p.includes("stick squishy"), "squishies and squishy are the same word");
  assert.deepEqual(Object.keys(posts[0]).sort(), ["d", "p", "u"], "no title or body is kept");
  assert.deepEqual(pairsOf("Cloud Slides"), ["cloud slide"]);
  assert.deepEqual(parseFeed('<rss><item><title>Fish &amp;lt;b&amp;gt; tank</title><link>https://x.example/a</link><pubDate>Tue, 01 Dec 2026 10:00:00 GMT</pubDate></item></rss>')[0].p, ["fish tank"], "an escaped tag stays text, decoded once (CodeQL, 26.11)");
});

test("each call against what the rivals published: first, quiet, after, or sealed before the feeds were read", () => {
  let s = mergeRival({}, "fastmoss", parseFeed(RSS), "2026-11-20");
  assert.equal(s.since.fastmoss, "2026-11-20");
  assert.equal(firstRivalMention("butter stick squishy", s).d, "2026-12-01");
  assert.equal(firstRivalMention("butter squishy", s), null, "every word pair of the phrase, in one post");
  assert.deepEqual(rivalRace("2026-11-25", "butter stick squishy", s), { state: "AHEAD", rival: "fastmoss", d: "2026-12-01", u: "https://blog.example.com/trending-1", days: 6 });
  assert.equal(rivalRace("2026-11-25", "cloud slides", s).state, "RIVAL_FIRST", "the post of 16.11 came before");
  assert.equal(rivalRace("2026-11-25", "jelly ring", s).state, "QUIET");
  assert.equal(rivalRace("2026-11-18", "jelly ring", s).state, "BEFORE_TRACKING", "sealed before the feeds were read: never counted");
  assert.equal(rivalRace("2026-11-25", "jelly ring", {}).state, "UNREAD");
  s = mergeRival(s, "fastmoss", parseFeed(RSS), "2026-11-26");
  assert.equal(s.since.fastmoss, "2026-11-20", "the first day read is kept");
  assert.equal(Object.keys(s.posts).length, 2, "a post read twice is kept once");
});

test("the board counts; behind the lock it names no call", () => {
  const s = mergeRival({}, "fastmoss", parseFeed(RSS), "2026-11-20");
  const doc = rivalsBoard([{ book: "fresh", phrase: "butter stick squishy", called: "2026-11-25" }, { book: "kinds", phrase: "cloud slides", called: "2026-11-25" }, { book: "fresh", phrase: "jelly ring", called: "2026-11-21" }, { book: "stages", phrase: "old thing", called: "2026-11-10" }], s, "2026-12-02", { doors: { fastmoss: "OK", trendalytics: "ROBOTS_DISALLOW" } });
  assert.deepEqual(doc.all, { calls: 4, compared: 3, ahead: 1, quiet: 1, rivalFirst: 1, beforeTracking: 1, medianAheadDays: 6 });
  assert.equal(doc.named.length, 2);
  const board = sanitizeBoard({ at: "2026-12-02T05:00:00Z", concepts: [], record: {}, rivals: doc });
  assert.equal(board.rivals.rivals.find((r) => r.id === "fastmoss").posts, 2);
  assert.equal(board.rivals.rivals.find((r) => r.id === "trendalytics").door, "ROBOTS_DISALLOW");
  assert.deepEqual(board.rivals.named.map((x) => `${x.phrase}:${x.state}`).sort(), ["butter stick squishy:AHEAD", "cloud slides:RIVAL_FIRST"], "misses named too: a rival first is printed like a lead");
  assert.deepEqual(board.rivals.unfed, [...RIVALS_UNFED]);
  assert.deepEqual(teaserBoard(board).rivals.named, [], "behind the lock: the counts only");
  assert.equal(teaserBoard(board).rivals.all.ahead, 1);
  assert.equal(cleanRivals({ d: "2026-12-02", named: [{ rival: "evil", phrase: "x y", u: "javascript:alert(1)" }] }).named.length, 0);
});

test("only feeds offered for reading, robots.txt first; the page shows it in the proof tab", () => {
  assert.deepEqual(RIVALS.map((r) => r.id), ["trendalytics", "fastmoss", "junglescout"]);
  assert.ok(RIVALS.every((r) => r.host.startsWith("https://")));
  assert.equal(SECTION_TABS.rivals, "proof");
  const run = readFileSync("scripts/catalog/trend-radar.mjs", "utf8");
  assert.match(run, /env\.RADAR_RIVALS !== "0"/);
  assert.match(run, /getRobots\(`\$\{r\.host\}\/robots\.txt`/);
  const page = readFileSync("src/components/discover/radar.jsx", "utf8");
  assert.match(page, /<RivalRace rivals=\{board\.rivals\} \/>/);
  assert.match(page, /id="rivals"/);
});
