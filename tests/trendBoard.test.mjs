// The trend board (src/lib/growth/trendBoard.js, scripts/catalog/trend-finder.mjs):
// AliExpress's own hot-products list per category for the owner to choose from.
//   • an item needs the owner's own tracked link, a real photo and a store price
//     in ILS; sales, rating and review numbers never reach the board,
//   • a category is "searched today" only with a real Google Trends match,
//   • nothing is added to the site except the item ids the owner typed, re-read
//     from the API; an item already on the site or a shared link is refused,
//   • the board lives at /trend-board/, never on the public /trends page.
import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PER_CATEGORY, TREND_CATEGORIES, buildBoard, parseIds, parseItems, toTrendItem, trendHits } from "../src/lib/growth/trendBoard.js";
import { BOARD_DIR, addItems, findTrends, productsOf, trendsPage } from "../scripts/catalog/trend-finder.mjs";
import { parsePath } from "../src/utils/routing.js";

const NOW = Date.parse("2026-10-16T05:00:00Z");
const ENV = { ALIEXPRESS_APP_KEY: "k", ALIEXPRESS_APP_SECRET: "s", ALIEXPRESS_TRACKING_ID: "t" };
const item = (id, extra = {}) => ({
  product_id: id, product_title: `טבעת ${id}`, product_main_image_url: `//ae01.alicdn.com/kf/${id}.jpg`,
  product_small_image_urls: { string: [`https://ae01.alicdn.com/kf/${id}-2.jpg`] },
  target_sale_price: "24.90", target_sale_price_currency: "ILS", target_original_price: "49.80",
  promotion_link: `https://s.click.aliexpress.com/e/_own${id}`, product_detail_url: `https://www.aliexpress.com/item/${id}.html`,
  product_video_url: `https://video.aliexpress-media.com/play/u/${id}.mp4`,
  lastest_volume: 9999, evaluate_rate: "98.5%", commission_rate: "7.0%", first_level_category_name: "Jewelry & Accessories", ...extra,
});
const apiReply = (method, list) => ({ [`${method.replace(/\./g, "_")}_response`]: { resp_result: { resp_code: 200, result: { products: { product: list } } } } });
function fakeApi(byMethod) {
  const calls = [];
  const impl = async (url, init) => {
    const sent = Object.fromEntries(new URLSearchParams(String(init.body)));
    calls.push(sent);
    const list = typeof byMethod[sent.method] === "function" ? byMethod[sent.method](sent) : byMethod[sent.method] || [];
    return { ok: true, status: 200, json: async () => apiReply(sent.method, list) };
  };
  return { impl, calls };
}
function tempSnapshot() {
  const dir = mkdtempSync(join(tmpdir(), "trend-board-"));
  const file = join(dir, "kv.json");
  copyFileSync(new URL("../public/snapshot/kv.json", import.meta.url), file);
  return { file, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test("an item needs the owner's own link, a real photo and a shekel price; no sales/rating numbers", () => {
  const it = toTrendItem(item("1005001111111111"), { category: "rings", now: NOW });
  assert.equal(it.image, "https://ae01.alicdn.com/kf/1005001111111111.jpg", "protocol-relative photo becomes https");
  assert.deepEqual([it.price, it.originalPrice, it.currency], [24.9, 49.8, "ILS"]);
  assert.match(it.video, /\.mp4$/);
  const text = JSON.stringify(it);
  for (const forbidden of ["9999", "98.5", "volume", "evaluate", "rating", "review", "commission"]) assert.ok(!text.includes(forbidden), `${forbidden} must not reach the board`);
  assert.equal(toTrendItem(item("1005001111111111", { promotion_link: "https://www.aliexpress.com/item/1.html" })), null, "no own tracked link");
  assert.equal(toTrendItem(item("1005001111111111", { target_sale_price_currency: "USD" })), null, "not a shekel price");
  assert.equal(toTrendItem(item("1005001111111111", { target_sale_price: "0" })), null);
  assert.equal(toTrendItem(item("1005001111111111", { product_main_image_url: "" })), null);
  assert.equal(toTrendItem(item("abc")), null);
  assert.equal(toTrendItem(item("1005001111111111", { target_original_price: "20" })).originalPrice, null, "a lower list price is not a deal");
});

test("'searched today' only with a real Google Trends match (shared 4-letter stem)", () => {
  const rings = TREND_CATEGORIES.find((c) => c.key === "rings");
  assert.deepEqual(trendHits([{ term: "טבעות אירוסין" }, { term: "מכבי חיפה" }], rings).map((h) => h.term), ["טבעות אירוסין"]);
  assert.deepEqual(trendHits([{ term: "בית משפט" }], rings), []);
  assert.deepEqual(trendHits(null, rings), []);
});

test("the board: AliExpress's order, an item once, at most PER_CATEGORY, trending categories first, on-site marked", () => {
  const many = Array.from({ length: 12 }, (_, i) => item(String(1005002000000000 + i)));
  const board = buildBoard({
    results: { rings: [item("1005001111111111"), ...many], necklaces: [item("1005001111111111"), item("1005003333333333")], earrings: [item("1005004444444444", { promotion_link: "" })] },
    trends: [{ term: "שרשרת זהב" }],
    listed: ["1005003333333333"],
    now: NOW,
  });
  assert.equal(board.source, "aliexpress.affiliate.hotproduct.query");
  assert.equal(board.categories.length, TREND_CATEGORIES.length);
  assert.equal(board.categories[0].key, "necklaces", "a category searched in Israel today comes first");
  assert.equal(board.categories[0].searchedToday[0].term, "שרשרת זהב");
  const rings = board.categories.find((c) => c.key === "rings");
  assert.equal(rings.items.length, PER_CATEGORY);
  assert.equal(rings.items[0].id, "1005001111111111");
  const necklaces = board.categories[0];
  assert.deepEqual(necklaces.items.map((i) => [i.id, i.onSite]), [["1005003333333333", true]], "the ring is not repeated under necklaces");
  assert.equal(board.categories.find((c) => c.key === "earrings").items.length, 0, "an item without the owner's link is left out");
});

test("item ids from the form: digits only, at most 10, duplicates once", () => {
  assert.deepEqual(parseIds("1005001111111111, 1005002222222222;1005001111111111\n"), ["1005001111111111", "1005002222222222"]);
  assert.equal(parseIds(Array.from({ length: 14 }, (_, i) => String(1005000000000000 + i)).join(",")).length, 10);
  assert.throws(() => parseIds("1005001111111111, $(rm -rf /)"), /not an AliExpress item id/);
  assert.deepEqual(parseIds(""), []);
});

test("the add form takes item numbers, store product pages and the owner's own s.click links — nothing else", () => {
  assert.deepEqual(parseItems("1005001111111111 https://www.aliexpress.com/item/1005002222222222.html?spm=x, https://he.aliexpress.com/item/1005002222222222.html https://s.click.aliexpress.com/e/_oFAbc12"), [
    { id: "1005001111111111" }, { id: "1005002222222222" }, { link: "https://s.click.aliexpress.com/e/_oFAbc12" },
  ]);
  assert.deepEqual(parseItems("https://www.aliexpress.us/item/3256804734954745.html"), [{ id: "3256804734954745" }]);
  for (const bad of ["https://evil.example/item/1005001111111111.html", "https://aliexpress.com.evil.example/item/1005001111111111.html", "http://s.click.aliexpress.com/e/_x", "https://s.click.aliexpress.com.evil.example/e/_x", "javascript:alert(1)", "$(rm -rf /)"]) {
    assert.throws(() => parseItems(bad), /not an AliExpress item number or link/, bad);
  }
  assert.equal(parseItems(Array.from({ length: 12 }, (_, i) => String(1005000000000000 + i)).join(" ")).length, 10);
});

test("an own link: resolved with one request, kept exactly as pasted, never the API's link; a missing answer envelope is a provider error", async () => {
  const snap = tempSnapshot();
  try {
    const own = "https://s.click.aliexpress.com/e/_oFOwn123";
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
      if (init.method !== "POST") {
        calls.push({ url, redirect: init.redirect });
        return { headers: { get: (h) => (h === "location" ? "https://www.aliexpress.com/item/1005004444444444.html?aff=x" : null) }, text: async () => "" };
      }
      return { ok: true, status: 200, json: async () => apiReply("aliexpress.affiliate.productdetail.get", [item("1005004444444444")]) };
    };
    const r = await addItems([{ link: own }], { env: ENV, now: NOW, fetchImpl, snapshot: snap.file });
    assert.deepEqual(calls, [{ url: own, redirect: "manual" }], "one request, redirects not followed");
    assert.deepEqual(r.report.map((x) => [x.status, x.link]), [["ADDED", "owner"]]);
    const p = JSON.parse(readFileSync(snap.file, "utf8")).keys["marketplace:products"].at(-1);
    assert.equal(p.affiliateUrl, own, "her own link, not the API's");
    assert.equal(p.importSource, "aliexpress-owner-link");
    // The API's own promotion_link missing or http:// does not matter when she pasted her own link.
    const own2 = "https://s.click.aliexpress.com/e/_oFOwn456";
    const noApiLink = async (url, init = {}) => {
      if (init.method !== "POST") return { headers: { get: () => "https://www.aliexpress.com/item/1005006666666666.html" }, text: async () => "" };
      return { ok: true, status: 200, json: async () => apiReply("aliexpress.affiliate.productdetail.get", [item("1005006666666666", { promotion_link: "http://s.click.aliexpress.com/e/xxxxx" })]) };
    };
    const r2 = await addItems([{ link: own2 }], { env: ENV, now: NOW, fetchImpl: noApiLink, snapshot: snap.file, write: false });
    assert.deepEqual(r2.report.map((x) => x.status), ["ADDED"]);
    const noEnvelope = async (url, init = {}) => ({ ok: true, status: 200, json: async () => ({}) });
    const e = await addItems(["1005005555555555"], { env: ENV, now: NOW, fetchImpl: noEnvelope, snapshot: snap.file, write: false });
    assert.equal(e.outcome, "PROVIDER_ERROR");
    const unresolved = async (url, init = {}) => ({ headers: { get: () => null }, text: async () => "<html>captcha</html>" });
    const u = await addItems([{ link: "https://s.click.aliexpress.com/e/_oFNope" }], { env: ENV, now: NOW, fetchImpl: unresolved, snapshot: snap.file, write: false });
    assert.deepEqual(u.report.map((x) => x.status), ["LINK_NOT_RESOLVED"]);
  } finally {
    snap.done();
  }
});

test("without the owner's credentials nothing is called and nothing is added", async () => {
  const api = fakeApi({});
  const r = await findTrends({ env: {}, now: NOW, trends: [], fetchImpl: api.impl });
  assert.equal(r.outcome, "REQUIRES_CONNECTION");
  assert.ok(r.board.categories.every((c) => c.items.length === 0));
  assert.match(trendsPage(r.board, r), /עוד לא מוגדר/);
  assert.equal((await addItems(["1005001111111111"], { env: {}, fetchImpl: api.impl, write: false })).outcome, "REQUIRES_CONNECTION");
  assert.equal(api.calls.length, 0);
});

test("findTrends asks per category (ship to IL, ILS, own tracking id) and falls back to the plain search when the hot list is thin", async () => {
  const api = fakeApi({
    "aliexpress.affiliate.hotproduct.query": (s) => (s.keywords.includes("ring") ? [item("1005001111111111")] : []),
    "aliexpress.affiliate.product.query": (s) => (s.keywords.includes("ring") ? [item("1005005555555555")] : []),
  });
  const r = await findTrends({ env: ENV, now: NOW, trends: [], fetchImpl: api.impl });
  assert.equal(r.outcome, "OK");
  const first = api.calls[0];
  assert.deepEqual([first.ship_to_country, first.target_currency, first.tracking_id], ["IL", "ILS", "t"]);
  assert.ok(api.calls.some((c) => c.method === "aliexpress.affiliate.product.query"));
  const rings = r.board.categories.find((c) => c.key === "rings");
  assert.deepEqual(rings.items.map((i) => i.id), ["1005001111111111", "1005005555555555"]);
  const html = trendsPage(r.board, r);
  assert.match(html, /noindex/);
  assert.match(html, /Add trend products/);
  const hosts = [...html.matchAll(/href="([^"#][^"]*)"/g)].map((m) => new URL(m[1], "https://hen63165-dotcom.github.io/likelink/trend-board/").hostname);
  assert.ok(hosts.some((h) => h === "www.aliexpress.com"), "each item links its store page");
  assert.ok(hosts.every((h) => h !== "s.click.aliexpress.com"), "never her own tracked link (a self-click)");
});

test("a provider error inside an HTTP 200 is a failed read, never an empty day; an all-empty run keeps yesterday's board", async () => {
  const errorReply = (method) => ({ [`${method.replace(/\./g, "_")}_response`]: { resp_result: { resp_code: 402, resp_msg: "rate limit" } } });
  assert.throws(() => productsOf(errorReply("aliexpress.affiliate.hotproduct.query"), "aliexpress.affiliate.hotproduct.query"), /aliexpress_resp_402/);
  assert.throws(() => productsOf({}, "aliexpress.affiliate.hotproduct.query"), /aliexpress_no_result/);
  const failing = async (url, init) => {
    const method = new URLSearchParams(String(init.body)).get("method");
    return { ok: true, status: 200, json: async () => errorReply(method) };
  };
  const failed = await findTrends({ env: ENV, now: NOW, trends: [], fetchImpl: failing });
  assert.equal(failed.outcome, "FAILED");
  assert.ok(failed.errors.every((e) => /aliexpress_resp_402/.test(e.error)));
  // The hot list errors but the plain search answers: the category is read.
  const hotDown = async (url, init) => {
    const method = new URLSearchParams(String(init.body)).get("method");
    if (method === "aliexpress.affiliate.hotproduct.query") return { ok: true, status: 200, json: async () => errorReply(method) };
    return { ok: true, status: 200, json: async () => apiReply(method, [item("1005009999999999")]) };
  };
  const recovered = await findTrends({ env: ENV, now: NOW, trends: [], fetchImpl: hotDown });
  assert.equal(recovered.outcome, "OK");
  const empty = await findTrends({ env: ENV, now: NOW, trends: [], fetchImpl: fakeApi({}).impl });
  assert.equal(empty.outcome, "EMPTY", "200 with no usable item anywhere");
  assert.match(trendsPage(empty.board, empty), /לא הצלחנו לקרוא מוצרים/);
});

test("a run that outlasts its time budget reports the categories it skipped and is not OK; the page says the read failed", async () => {
  const api = fakeApi({ "aliexpress.affiliate.hotproduct.query": [item("1005001111111111")] });
  const r = await findTrends({ env: ENV, now: NOW, trends: [], fetchImpl: api.impl, budgetMs: 0 });
  assert.equal(r.outcome, "FAILED");
  assert.equal(api.calls.length, 0);
  assert.equal(r.errors.length, TREND_CATEGORIES.length);
  assert.ok(r.errors.every((e) => e.error === "time_budget"));
  const html = trendsPage(r.board, r);
  assert.match(html, /לא הצלחנו לקרוא מוצרים מ-AliExpress/);
  assert.doesNotMatch(html, /לא החזירה מוצרים מתאימים/, "a failed read is never shown as an empty day");
});

test("adding: only the typed items, re-read from the API, as the owner's products; existing items and shared links refused", async () => {
  const snap = tempSnapshot();
  try {
    const before = JSON.parse(readFileSync(snap.file, "utf8"));
    const usedLink = before.keys["marketplace:products"][0].affiliateUrl;
    const api = fakeApi({
      "aliexpress.affiliate.productdetail.get": [
        item("1005001111111111"),
        item("1005006666666666", { promotion_link: usedLink }),
        item("1005007777777777", { target_sale_price_currency: "USD" }),
        // Her pick, but a brand's name on AliExpress is an imitation: the same rule the cloud applies.
        item("1005009999999999", { product_title: "Pandora style bracelet" }),
      ],
    });
    const r = await addItems(["1005001111111111", "1005006666666666", "1005007777777777", "1005008888888888", "1005009999999999"], { env: ENV, now: NOW, fetchImpl: api.impl, snapshot: snap.file });
    assert.equal(r.outcome, "OK");
    assert.deepEqual(r.report.map((x) => x.status), ["ADDED", "LINK_ALREADY_USED", "MISSING_REAL_FIELDS", "NOT_RETURNED", "BRAND_NAME"]);
    assert.equal(api.calls[0].product_ids, "1005001111111111,1005006666666666,1005007777777777,1005008888888888,1005009999999999");
    const after = JSON.parse(readFileSync(snap.file, "utf8"));
    const list = after.keys["marketplace:products"];
    assert.equal(list.length, before.keys["marketplace:products"].length + 1);
    const p = list.at(-1);
    assert.equal(p.id, "ae-1005001111111111");
    assert.equal(p.marketerId, before.keys["marketplace:marketers"][0].id);
    assert.equal(p.status, "approved");
    assert.deepEqual([p.price, p.originalPrice, p.priceSource], [24.9, 49.8, "aliexpress_api"]);
    assert.equal(p.sellerVideo.source, "aliexpress_api", "the seller's own video is kept aside for the edited cut");
    assert.equal(p.videoUrl, undefined, "raw seller footage is never the product's video");
    assert.equal(p.commission, undefined, "the commission rate stays private");
    assert.ok(!JSON.stringify(p).includes("9999"), "no sales numbers");
    const again = await addItems(["1005001111111111"], { env: ENV, now: NOW, fetchImpl: api.impl, snapshot: snap.file });
    assert.deepEqual(again.report.map((x) => x.status), ["ALREADY_ON_SITE"]);
    assert.equal(again.written, false);
  } finally {
    snap.done();
  }
});

test("the board never takes the public /trends page", () => {
  assert.equal(BOARD_DIR, "trend-board");
  assert.notEqual(parsePath(`/${BOARD_DIR}`).type, "trends");
  const wf = readFileSync(new URL("../.github/workflows/trend-add.yml", import.meta.url), "utf8");
  assert.match(wf, /TREND_IDS: \$\{\{ github\.event\.inputs\.ids \}\}/, "the ids reach the script as data");
  assert.doesNotMatch(wf.split("TREND_IDS:")[1].split("\n").slice(1).join("\n"), /\$\{\{ github\.event\.inputs\.ids/, "never pasted into a shell line");
});
