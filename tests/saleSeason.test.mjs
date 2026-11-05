// Sale-season answer pages (/11-11, src/lib/saleSeason.js): the week people
// search "11.11 אליאקספרס". The page says only what the guide says, its FAQ
// JSON-LD is exactly the visible checks, and it has its own head, rewrite,
// prerendered file and sitemap entry.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SALE_SEASONS, SALE_PATHS, saleChecks, salePicks, saleSeason } from "../src/lib/saleSeason.js";
import { saleSeo } from "../src/lib/publicSeo.js";
import { guideCheck } from "../src/lib/guide.js";
import { parsePath } from "../src/utils/routing.js";
import { sectionPages, pageHead } from "../scripts/prerender-products.mjs";

test("11-11: the checks are the guide's own, and the FAQ JSON-LD is exactly what the page shows", () => {
  const s = saleSeason("11-11");
  const checks = saleChecks(s);
  assert.equal(checks.length, s.checks.length, "every check id is a guide check");
  for (const c of checks) assert.equal(c.body.he, guideCheck(c.id).body.he);
  const seo = saleSeo("11-11");
  assert.equal(seo.canonical, "https://likelink2.vercel.app/11-11");
  assert.match(seo.title, /^11\.11 באליאקספרס/);
  const faq = seo.jsonLd.find((j) => j["@type"] === "FAQPage");
  assert.deepEqual(faq.mainEntity.map((q) => [q.name, q.acceptedAnswer.text]), checks.map((c) => [c.q.he, c.body.he]));
  // The season's own name (11.11) is the only date the page may carry.
  const all = JSON.stringify([s.title, s.intro, s.kicker]).replaceAll(s.name, "");
  assert.doesNotMatch(all, /₪|%|הנחה|רק היום|נשאר|מהרו|הכי|ביקורות|כוכבים|\d{1,2}\.\d{1,2}/, "no price, discount, urgency or other date");
});

test("11-11: picks show only what the public site lists, in order", () => {
  const s = saleSeason("11-11");
  const byId = new Map([[s.picks[2], { id: s.picks[2] }], [s.picks[0], { id: s.picks[0] }]]);
  assert.deepEqual(salePicks(s, byId).map((p) => p.id), [s.picks[0], s.picks[2]]);
  assert.equal(new Set(s.picks).size, s.picks.length);
});

test("11-11: route, rewrite, prerendered head and sitemap", () => {
  assert.deepEqual(parsePath("/11-11"), { type: "sale", id: "11-11" });
  const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  for (const path of SALE_PATHS) assert.ok(vercel.rewrites.some((r) => r.source === path && r.destination === "/"), `${path} rewrite`);
  const page = sectionPages().find((p) => p.path === "/11-11");
  assert.ok(page, "prerendered");
  const shell = '<html><head><title>x</title><meta name="description" content="" /><link rel="canonical" href="https://likelink2.vercel.app/" /></head></html>';
  const html = pageHead(shell, page);
  assert.match(html, /<link rel="canonical" href="https:\/\/likelink2\.vercel\.app\/11-11" \/>/);
  assert.match(html, /FAQPage/);
  assert.ok(Object.keys(SALE_SEASONS).length >= 1);
});

test("11-11: the app hands the sale route to the public site", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app.match(/const PUBLIC_TYPES = new Set\(\[[^\]]*\]\)/)[0], /"sale"/);
});
