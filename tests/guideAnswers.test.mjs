// Each guide check is also its own answer page (/guide/<id>): the question
// people search is the title, the check is the answer, and the FAQ JSON-LD is
// exactly what the page shows (the owner, 2026-11-05: "bring traffic to the site").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GUIDE, guideCheck, guideCheckPath } from "../src/lib/guide.js";
import { GUIDE_CHECK_PATHS, guideCheckSeo } from "../src/lib/publicSeo.js";
import { parsePath } from "../src/utils/routing.js";
import { sectionPages, pageHead } from "../scripts/prerender-products.mjs";
import { PRODUCTION_ORIGIN } from "../src/constants/domain.js";

test("every check asks the question people search, in both languages", () => {
  for (const c of GUIDE.checks) {
    assert.match(c.q.he, /\?$/, c.id);
    assert.match(c.q.en, /\?$/, c.id);
    assert.equal(guideCheck(c.id), c);
  }
  assert.equal(new Set(GUIDE.checks.map((c) => c.q.he)).size, GUIDE.checks.length, "no two pages share a title");
});

test("an answer page has its own head, and its FAQ JSON-LD is the visible answer", () => {
  for (const c of GUIDE.checks) {
    const seo = guideCheckSeo(c.id);
    assert.equal(seo.path, `/guide/${c.id}`);
    assert.equal(seo.canonical, `${PRODUCTION_ORIGIN}/guide/${c.id}`);
    assert.equal(seo.title, `${c.q.he} | LikeLink2`);
    assert.equal(seo.description, c.body.he);
    const faq = seo.jsonLd.find((x) => x["@type"] === "FAQPage");
    assert.deepEqual(faq.mainEntity, [{ "@type": "Question", name: c.q.he, acceptedAnswer: { "@type": "Answer", text: c.body.he } }]);
  }
  assert.equal(guideCheckSeo("nope"), null);
});

test("the build writes each answer page and lists it in the sitemap", () => {
  const pages = sectionPages().filter((p) => p.path.startsWith("/guide/"));
  assert.deepEqual(pages.map((p) => p.path), GUIDE.checks.map((c) => guideCheckPath(c.id)));
  assert.deepEqual([...GUIDE_CHECK_PATHS], pages.map((p) => p.path));
  const shell = '<html><head><title>x</title><meta name="description" content="d" /><link rel="canonical" href="https://likelink2.vercel.app/" /></head><body></body></html>';
  const html = pageHead(shell, pages[0]);
  assert.match(html, /<link rel="canonical" href="https:\/\/likelink2\.vercel\.app\/guide\/silver" \/>/);
  assert.match(html, /FAQPage/);
  assert.match(readFileSync(new URL("../scripts/prerender-products.mjs", import.meta.url), "utf8"), /\.\.\.GUIDE_CHECK_PATHS/);
});

test("the app routes /guide/<id> and every host rewrites it to the app", () => {
  assert.deepEqual(parsePath("/guide/silver"), { type: "guide", check: "silver" });
  assert.deepEqual(parsePath("/guide"), { type: "guide" });
  const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.ok(vercel.rewrites.some((r) => r.source === "/guide/:check" && r.destination === "/"));
});
