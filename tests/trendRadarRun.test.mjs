// The trend radar end to end (scripts/catalog/trend-radar.mjs run()) with every network answer
// faked by a spy: two daily runs a week apart → the board. It checks that discovery adds a trial
// concept, a store error leaves no reading (never a zero), a Google answer that fails is no Israel
// reading, robots.txt is read before Google, no autocomplete text reaches any stored file, no
// request is a write, the window opens for a rising concept nobody searches in Hebrew yet, and the
// board survives the browser's sanitizer with only safe links. Plus the magic button's bridge.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../scripts/catalog/trend-radar.mjs";
import { radarForItem, radarImage, sanitizeBoard } from "../src/lib/growth/radarBoard.js";

const ENV = { ALIEXPRESS_APP_KEY: "k", ALIEXPRESS_APP_SECRET: "s", ALIEXPRESS_TRACKING_ID: "t" };
const at = (d) => Date.parse(`${d}T06:00:00Z`);
const SECRET_SUGGESTION = "מרסק שום של מותג סודי";

function fakeNet({ week }) {
  const requests = [];
  const json = (body, status = 200) => ({ ok: status === 200, status, json: async () => body, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
  const items = (ids, base, extra = {}) => ({ total_record_count: 1000 + week * 300, products: { product: ids.map((id, i) => ({ product_id: String(id), product_title: `butter stick squishy ${i}`, lastest_volume: Math.round(base * (1 - i * 0.1)), target_sale_price: "9.90", target_sale_price_currency: "ILS", evaluate_rate: "98.0%", promotion_link: `https://s.click.aliexpress.com/e/_x${id}`, product_main_image_url: `https://ae-pic-a1.aliexpress-media.com/kf/${id}.jpg`, ...extra })) } });
  const fetchImpl = async (url, opts = {}) => {
    const u = String(url);
    requests.push({ url: u, method: opts.method || "GET" });
    if (u.startsWith("https://api-sg.aliexpress.com")) {
      const p = new URLSearchParams(opts.body);
      const method = p.get("method");
      const kw = p.get("keywords") || "";
      if (method === "aliexpress.affiliate.hotproduct.query") {
        const hot = kw.includes("home") ? [1, 2, 3].map((i) => ({ product_id: String(2000000 + i), product_title: `Cloud Slides Soft Platform ${i}`, lastest_volume: 900 })) : [];
        return json({ aliexpress_affiliate_hotproduct_query_response: { resp_result: { resp_code: 200, result: { products: { product: hot } } } } });
      }
      if (kw === "drawer organizer") return json({ aliexpress_affiliate_product_query_response: { resp_result: { resp_code: 405, resp_msg: "limited" } } });
      if (kw === "butter stick squishy") {
        const base = week ? 1700 : 1000; // +70% in a week while small → EMERGING
        return json({ aliexpress_affiliate_product_query_response: { resp_result: { resp_code: 200, result: items([1000001, 1000002, 1000003, 1000004], base) } } });
      }
      return json({ aliexpress_affiliate_product_query_response: { resp_result: { resp_code: 200, result: items([3000001, 3000002, 3000003], 500, { promotion_link: "javascript:alert(1)" }) } } });
    }
    if (u === "https://suggestqueries.google.com/robots.txt") return json("not found", 404);
    if (u === "https://trends.google.com/robots.txt") return json("User-agent: *\nDisallow: /trends/api\n");
    if (u.startsWith("https://trends.google.com/trending/rss")) return json("<rss><channel><item><title>מכבי תל אביב</title></item></channel></rss>");
    if (u.startsWith("https://suggestqueries.google.com/complete/search")) {
      const q = new URL(u).searchParams.get("q");
      const gl = new URL(u).searchParams.get("gl");
      if (q === "פח לרכב") return json("oops", 500);
      if (q === "butter stick squishy" && gl === "us") return json([q, [q, `${q} toy`, `${q} near me`, `${q} recall`]]);
      if (q === "סקווישי חמאה") return json([q, [q]]); // the echo only: nobody types more in Hebrew
      if (q === "מרסק שום") return json([q, [SECRET_SUGGESTION]]);
      return json([q, []]);
    }
    return json("unexpected", 599);
  };
  return { fetchImpl, requests };
}

test("two daily runs a week apart: discovery, Israel gap, the window and a board that survives the sanitizer", async () => {
  const dir = mkdtempSync(join(tmpdir(), "radar-"));
  const one = fakeNet({ week: 0 });
  const r1 = await run(dir, { env: ENV, fetchImpl: one.fetchImpl, now: at("2026-11-14"), politeMs: 0 });
  assert.equal(r1.sources.aliexpress, "OK");
  assert.equal(r1.sources.suggest, "OK");
  assert.equal(r1.sources.trendsIL, "OK");
  assert.ok(r1.board.concepts.some((c) => c.auto && c.he === "cloud slides"), "discovery added a trial concept");
  const two = fakeNet({ week: 1 });
  const r2 = await run(dir, { env: ENV, fetchImpl: two.fetchImpl, now: at("2026-11-21"), politeMs: 0 });

  for (const net of [one, two]) {
    assert.ok(net.requests.every((r) => r.method === "GET" || r.url.startsWith("https://api-sg.aliexpress.com")), "only reads: GETs, and the store's signed query calls");
    const firstGoogle = net.requests.findIndex((r) => r.url.includes("/complete/search"));
    const robots = net.requests.findIndex((r) => r.url === "https://suggestqueries.google.com/robots.txt");
    assert.ok(robots >= 0 && robots < firstGoogle, "robots.txt is read before any autocomplete request");
  }

  const butter = r2.board.concepts.find((c) => c.id === "butter-squishy");
  assert.equal(butter.stage, "EMERGING");
  assert.equal(butter.gap.state, "GAP", "the US searches it, nobody types more than the echo in Hebrew");
  assert.equal(butter.window, "OPEN");
  assert.equal(r2.board.concepts[0].id, "butter-squishy", "an open window comes first");
  assert.deepEqual(butter.items.slice(0, 2), ["1000001", "1000002"]);

  const drawer = r2.board.concepts.find((c) => c.id === "drawer-organizer");
  assert.equal(drawer.today, null, "a store error is no reading, never a zero");
  const trash = r2.board.concepts.find((c) => c.id === "car-trash-can");
  assert.equal(trash.gap.il, "NONE", "a failed Hebrew answer is skipped; the English one still counts");

  assert.equal(r2.board.concepts.find((c) => c.id === "garlic-chopper").gap.state, "ARRIVING", "one Hebrew extension was counted");
  // Nothing Google suggested is stored anywhere — only counts.
  for (const f of readdirSync(dir)) assert.ok(!readFileSync(join(dir, f), "utf8").includes(SECRET_SUGGESTION), `${f} holds an autocomplete text`);

  // The browser's view of it: only the owner's own s.click links survive.
  const view = sanitizeBoard(JSON.parse(readFileSync(join(dir, "board.json"), "utf8")));
  assert.ok(view.concepts.length >= 62);
  for (const c of view.concepts) if (c.pick) assert.match(c.pick.buy, /^https:\/\/s\.click\.aliexpress\.com\//);
  assert.ok(view.concepts.find((c) => c.id === "butter-squishy").pick, "a clean pick stays");
  assert.equal(view.concepts.find((c) => c.id === "garlic-chopper").pick, null, "a javascript: link never becomes a button");

  // The magic button's bridge.
  assert.equal(radarForItem(view, { itemId: "ae-1000002" }).id, "butter-squishy");
  assert.equal(radarForItem(view, { itemId: "1000002" }).match, "item");
  assert.equal(radarForItem(view, { title: "צמיד טניס זירקון לנשים" })?.id, "tennis-bracelet");
  assert.equal(radarForItem(view, { title: "x" }), null);
});

test("the sanitizer drops hostile boards and fields", () => {
  assert.equal(sanitizeBoard(null), null);
  assert.equal(sanitizeBoard({ concepts: "x" }), null);
  const doc = {
    at: "2026-11-14T06:00:00Z",
    record: { calls: 0, graded: 0, hits: 0, recent: [] },
    concepts: [
      { id: "../etc", he: "x" },
      { id: "ok-one", he: "<img src=x onerror=alert(1)>", stage: "HACK", score: 999, gap: { state: "EVIL" }, window: "WIDE", items: ["1000001", "<b>"], pick: { buy: "https://s.click.aliexpress.com/e/_ok", image: "http://evil.example/x.jpg", check: "javascript:alert(1)", price: -3 } },
    ],
  };
  const v = sanitizeBoard(doc);
  assert.equal(v.concepts.length, 1);
  const c = v.concepts[0];
  assert.deepEqual([c.stage, c.score, c.gap.state, c.window], ["UNVERIFIED", 100, "UNKNOWN", null]);
  assert.deepEqual(c.items, ["1000001"]);
  assert.deepEqual([c.pick.image, c.pick.check, c.pick.price], [null, null, null]);
  assert.equal(radarImage("https://ae-pic-a1.aliexpress-media.com/kf/a.jpg"), "https://ae-pic-a1.aliexpress-media.com/kf/a.jpg");
  assert.equal(radarImage("https://aliexpress-media.com.evil.io/a.jpg"), null);
});
