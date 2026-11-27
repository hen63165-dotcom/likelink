// 🎥 The first creators (src/lib/growth/haulSignal.js; the owner, 22.11: "exactly the way the squishy was
// found, for every product"): haul videos → product phrases → channels this week against last week →
// sold on AliExpress → a trial concept. Never a brand, an unlisted kind, a holiday or a known kind.
import test from "node:test";
import assert from "node:assert/strict";
import { HAULS, haulOnStore, haulRisers, haulSearchUrl, haulVideos, mergeHauls, videoPhrases } from "../src/lib/growth/haulSignal.js";

test("hauls: the official search, the haul's own words dropped, channels counted once", () => {
  const u = new URL(haulSearchUrl("temu haul", { key: "k", now: Date.parse("2026-11-22T06:00:00Z") }));
  assert.equal(u.origin + u.pathname, "https://www.googleapis.com/youtube/v3/search");
  assert.equal(u.searchParams.get("order"), "date");
  assert.equal(u.searchParams.get("publishedAfter"), "2026-11-20T06:00:00Z");
  assert.equal(haulVideos({ error: {} }), null);
  const vids = haulVideos({ items: [
    { id: { videoId: "abc123" }, snippet: { channelId: "UC1", title: "TEMU HAUL: taba squishy and cloud slides", description: "links below" } },
    { id: { videoId: "abc124" }, snippet: { channelId: "UC1", title: "taba squishy again", description: "" } },
    { id: { videoId: "abc125" }, snippet: { title: "no channel" } },
  ] });
  assert.equal(vids.length, 2);
  assert.ok(videoPhrases(vids[0].text).includes("taba squishy"));
  assert.ok(!videoPhrases(vids[0].text).some((p) => p.includes("temu") || p.includes("haul")));
  const s = mergeHauls({}, vids, "2026-11-22");
  assert.deepEqual(s["taba squishy"], { "2026-11-22": ["UC1"] }, "one channel, counted once");
});

test("hauls: a phrase more channels started to show joins; a known kind, a brand or a holiday never", () => {
  const v = (ch, text) => ({ id: `v${ch}`, channel: ch, text });
  let s = mergeHauls({}, [v("UCa", "mochi stretch toy")], "2026-11-10");
  s = mergeHauls(s, [v("UCb", "mochi stretch"), v("UCc", "mochi stretch"), v("UCd", "mochi stretch"), v("UCe", "christmas tree"), v("UCf", "christmas tree"), v("UCg", "christmas tree"), v("UCh", "nike shoes"), v("UCi", "nike shoes"), v("UCj", "nike shoes"), v("UCk", "lip oil"), v("UCl", "lip oil"), v("UCm", "lip oil")], "2026-11-21");
  const r = haulRisers(s, "2026-11-22", { concepts: [{ id: "lip-oil", en: "lip oil" }] });
  assert.deepEqual(r.map((x) => x.phrase), ["mochi stretch"]);
  assert.deepEqual([r[0].channels, r[0].before], [3, 1]);
  // Days older than keepDays leave the state.
  assert.equal(mergeHauls(s, [], "2026-12-20")["mochi stretch"], undefined);
  assert.deepEqual(haulOnStore("mochi stretch", [{ title: "Mochi Stretch Toy", orders: 200 }, { title: "mochi stretch ball", orders: 90 }, { title: "Mochi stretchy squeeze", orders: 40 }, { title: "other", orders: 999 }]), { ok: true, items: 3, orders: 330 });
  assert.equal(haulOnStore("mochi stretch", [{ title: "mochi stretch", orders: 10 }]).ok, false);
  assert.equal(HAULS.minChannels, 3);
});

test("hauls: Asia's finds first — where the squishy came from — and the place names never become a product", () => {
  assert.ok(HAULS.queries.includes("daiso haul") && HAULS.queries.includes("douyin finds"));
  assert.ok(HAULS.queries.length * 100 <= 1500, "within a small share of the free daily quota");
  assert.deepEqual(videoPhrases("KOREA DAISO HAUL: mochi stretch toy"), ["mochi stretch"], "\"toy\" is filler, the place and the store never a product");
});

test("hauls: YouTube Shorts too — where TikTok's creators post the same clips", () => {
  const u = new URL(haulSearchUrl("tiktok made me buy it", { key: "k", short: true }));
  assert.equal(u.searchParams.get("videoDuration"), "short");
  assert.equal(new URL(haulSearchUrl("temu haul", { key: "k" })).searchParams.get("videoDuration"), null);
  assert.ok((HAULS.queries.length + HAULS.shortQueries.length) * 100 <= 1600, "1,600 of the free 10,000 daily units at most");
});

test("a video's links, hashtags, codes and pitch words are never product phrases (26.11's run)", () => {
  assert.deepEqual(videoPhrases("My TEMU haul! https://www.temu.com/abc download app search bar friday deals #temufinds #temuhaul code ALC607836"), []);
  assert.deepEqual(videoPhrases("butter squishy asmr satisfying"), ["butter squishy"]);
});
