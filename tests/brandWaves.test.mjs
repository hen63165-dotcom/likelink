// Waves the radar measures but never sells (src/lib/growth/brandWaves.js; the owner, 2026-11-16).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WAVES, addWaveReading, altPick, collectWaves, igSignal, igTag, isHackTool, needOf, waveCard, waveOf, weekChange } from "../src/lib/growth/brandWaves.js";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";
import { ytSearchUrl } from "../src/lib/growth/youtubeSignal.js";

const item = (id, title, orders) => ({ product_id: String(id), product_title: title, lastest_volume: orders });

test("a brand, character or hacking tool is a wave; weapons, vapes and health claims never are", () => {
  assert.deepEqual(waveOf("Flipper Zero multi tool for geeks"), { token: "flipper", reason: "TOOL" });
  assert.deepEqual(waveOf("RFID card copier 125khz"), { token: "rfid card copier", reason: "TOOL" });
  assert.equal(waveOf("Labubu plush keychain doll").reason, "BRAND");
  assert.equal(waveOf("tactical knife outdoor"), null);
  assert.equal(waveOf("vape pen starter"), null);
  assert.equal(waveOf("cute plush keychain"), null);
  assert.equal(isHackTool("wifi deauther watch"), true);
});

test("collectWaves groups hot items by the name and keeps only real waves", () => {
  const lists = {
    tech: [item(1000001, "Flipper Zero gadget", 900), item(1000002, "Flipper mini screen gadget", 400), item(1000003, "Flipper case shell", 50), item(1000009, "phone holder", 9000)],
    kids: [item(1000004, "Labubu plush keychain", 600), item(1000004, "Labubu plush keychain", 600)],
  };
  const waves = collectWaves(lists);
  assert.equal(waves.length, 1); // labubu: one distinct item only
  assert.equal(waves[0].token, "flipper");
  assert.equal(waves[0].items, 3);
  assert.equal(waves[0].orders, 1350);
  assert.equal(waves[0].category, "tech");
});

test("the need behind a wave never carries the name", () => {
  const need = needOf("Labubu Plush Keychain Doll Pendant", "labubu");
  assert.ok(need && !/labubu/i.test(need));
});

test("weekly change needs two readings 2–14 days apart", () => {
  let h = addWaveReading([], ["2026-11-10", 3, 1000, 2000]);
  assert.equal(weekChange(h, 3), null);
  h = addWaveReading(h, ["2026-11-17", 4, 1500, 3000]);
  assert.equal(weekChange(h, 3), 50);
  assert.equal(weekChange(h, 2), 50);
  h = addWaveReading(h, ["2026-11-17", 4, 1500, 3100]); // one reading a day
  assert.equal(h.length, 2);
  const old = addWaveReading([["2026-09-01", 1, 1, 1]], ["2026-11-17", 1, 1, 1]);
  assert.equal(old.length, 1); // older than keepDays leaves
});

test("the legal alternative passes the bar and never carries the name", () => {
  const base = { promotion_link: "https://s.click.aliexpress.com/e/_abc", product_main_image_url: "https://ae01.alicdn.com/kf/x.jpg", evaluate_rate: "97.1%", lastest_volume: 800, target_sale_price: "24.5" };
  const products = [
    { ...base, product_id: "1000001", product_title: "Labubu style plush" },
    { ...base, product_id: "1000002", product_title: "plush keychain", evaluate_rate: "91%" },
    { ...base, product_id: "1000003", product_title: "plush keychain", lastest_volume: 120 },
    { ...base, product_id: "1000004", product_title: "cute plush keychain doll" },
  ];
  assert.equal(altPick(products).id, "1000004");
  assert.equal(altPick([{ ...base, product_id: "1000005", product_title: "rfid card copier" }]), null);
});

test("Instagram: 24 hours of the hashtag from Instagram's own answer, never a guess", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");
  const sig = igSignal({ data: [{ media_type: "VIDEO", like_count: 10, comments_count: 2, timestamp: "2026-11-16T10:00:00+0000" }, { media_type: "IMAGE", like_count: 5, timestamp: "2026-11-14T10:00:00+0000" }] }, { now });
  assert.deepEqual(sig, { posts: 1, videos: 1, likes: 10, comments: 2, capped: false });
  assert.equal(igSignal({ error: { code: 10 } }), null);
  assert.equal(igTag("louis vuitton"), "louisvuitton");
});

test("YouTube: waves count short videos (Shorts) only when asked", () => {
  assert.match(ytSearchUrl("flipper", { key: "k", short: true }), /videoDuration=short/);
  assert.doesNotMatch(ytSearchUrl("flipper", { key: "k" }), /videoDuration/);
});

test("the board keeps a wave's counts and only the alternative's buy button", () => {
  const card = waveCard({ token: "flipper", reason: "TOOL", items: 3, orders: 1350, category: "tech" }, {
    hist: [["2026-11-10", 3, 1000, 2000], ["2026-11-17", 3, 1350, 3000]], firstSeen: "2026-11-10", buzz: ["tiktok"],
    alt: { id: "1000004", title: "pocket gadget", image: "https://ae01.alicdn.com/kf/x.jpg", buy: "https://s.click.aliexpress.com/e/_abc", price: 30 },
  });
  const board = sanitizeBoard({ v: 2, at: "2026-11-17T05:00:00Z", concepts: [], record: {}, waves: { at: "2026-11-17", list: [card, { ...card, token: "x", reason: "WEAPON" }] } });
  assert.equal(board.waves.list.length, 1);
  const w = board.waves.list[0];
  assert.equal(w.listingsWeekPct, 50);
  assert.equal(w.alt.buy, "https://s.click.aliexpress.com/e/_abc");
  assert.match(w.alt.check, /^\/magic\?u=/);
  assert.equal("buy" in w, false); // the copy itself never gets a buy button
});

test("the waves section on the page carries no promise or forecast wording", () => {
  const src = readFileSync(new URL("../src/components/discover/radar.jsx", import.meta.url), "utf8");
  const part = src.slice(src.indexOf("function Waves("), src.indexOf("export function RadarPage"));
  assert.ok(part.length > 100);
  assert.doesNotMatch(part, /בטוח|תחזית|יהיה להיט|מבטיח|היחיד/);
  assert.match(part, /const \{ L \} = useL\(\)/);
  assert.equal(WAVES.show <= 8, true);
});
