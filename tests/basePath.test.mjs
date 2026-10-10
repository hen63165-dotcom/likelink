// The GitHub Pages copy serves the same build from /likelink/ (VITE_BASE in
// .github/workflows/deploy-frontend.yml). Every link the browser sees must
// stay inside that folder, or a visitor lands on github.io's own 404 page,
// while the app's routes stay base-free ("/p/x") so parsePath never changes.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BASE, normalizeBase, stripBase, withBase } from "../src/lib/basePath.js";
import { SPA_SECTIONS, rebaseDist, rebaseHtml, rebaseManifest } from "../scripts/rebase-static-pages.mjs";
import { parsePath } from "../src/utils/routing.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("base path: the main host has none, the mirror has /likelink", () => {
  assert.equal(BASE, "", "Node (and the main build) run at the root");
  for (const raw of ["/", "", "./", undefined]) assert.equal(normalizeBase(raw), "");
  for (const raw of ["/likelink/", "/likelink", "likelink/"]) assert.equal(normalizeBase(raw), "/likelink");
});

test("withBase / stripBase round-trip app routes", () => {
  const b = "/likelink";
  assert.equal(withBase("/", b), "/likelink/");
  assert.equal(withBase("/p/p-live-02", b), "/likelink/p/p-live-02");
  assert.equal(withBase("/search?q=x", b), "/likelink/search?q=x");
  assert.equal(withBase("/likelink/p/x", b), "/likelink/p/x", "never doubled");
  for (const external of ["https://likelink2.vercel.app/p/x", "//cdn.example/x.js", "#main", "?q=1", "mailto:a@b.c"]) {
    assert.equal(withBase(external, b), external);
  }
  assert.equal(stripBase("/likelink/", b), "/");
  assert.equal(stripBase("/likelink", b), "/");
  assert.equal(stripBase("/likelink/p/x", b), "/p/x");
  assert.equal(stripBase("/likelinkx/p", b), "/likelinkx/p", "only a whole folder name");
  assert.deepEqual(parsePath(stripBase(withBase("/p/p-live-02", b), b)), parsePath("/p/p-live-02"));
  // No base: identity.
  assert.equal(withBase("/p/x"), "/p/x");
  assert.equal(stripBase("/p/x"), "/p/x");
});

test("the router and in-app links go through the base helpers", () => {
  const app = read("src/App.jsx");
  assert.match(app, /parsePath\(stripBase\(window\.location\.pathname\)\)/, "routes are read without the base");
  assert.match(app, /pushState\(\{\}, "", `\$\{withBase\(route\)\}/, "the address bar keeps the base");
  assert.doesNotMatch(app, /onPop = \(\) => setRoute\(\{ \.\.\.parsePath\(window\.location\.pathname\)/);
  const kit = read("src/components/discover/kit.jsx");
  const go = kit.slice(kit.indexOf("export function Go("), kit.indexOf("/* ---", kit.indexOf("export function Go(")));
  assert.match(go, /href=\{withBase\(to\)\}/, "a Go link opens inside the folder in a new tab too");
  assert.match(read("src/components/discover/PublicShell.jsx"), /href=\{withBase\(href\)\}/, "footer pricing/legal links");
  assert.match(read("src/lib/pwa.js"), /SW_URL = withBase\("\/sw\.js"\)/);
});

test("the service worker works from any folder it is served in", () => {
  const sw = read("public/sw.js");
  assert.match(sw, /const ROOT = new URL\("\.\/", self\.location\.href\)\.pathname;/);
  // No root-absolute paths left in the precache list or fallbacks.
  assert.doesNotMatch(sw, /"\/(index\.html|offline\.html|manifest\.json|icons\/|assets\/)/);
});

test("post-build rebase: plain links and the manifest move into the folder, nothing else", () => {
  const html = `<a href="/pricing">x</a><a href='/legal/terms'>y</a><a href="https://likelink2.vercel.app/">z</a><a href="#main">s</a><link href="//fonts.example/x"><img src="/icons/a.webp"><a href="/likelink/legal">already</a>`;
  const out = rebaseHtml(html, "/likelink");
  assert.match(out, /href="\/likelink\/pricing"/);
  assert.match(out, /href='\/likelink\/legal\/terms'/);
  assert.match(out, /src="\/likelink\/icons\/a\.webp"/);
  assert.match(out, /href="https:\/\/likelink2\.vercel\.app\/"/);
  assert.match(out, /href="#main"/);
  assert.match(out, /href="\/\/fonts\.example\/x"/);
  assert.match(out, /href="\/likelink\/legal">already/);
  assert.equal(rebaseHtml(html, ""), html, "the main build is untouched");

  const manifest = JSON.parse(read("public/manifest.json"));
  const moved = rebaseManifest(manifest, "/likelink");
  assert.equal(moved.start_url, "/likelink/");
  assert.equal(moved.scope, "/likelink/");
  assert.ok(moved.icons.every((i) => i.src.startsWith("/likelink/")));
  assert.equal(moved.name, manifest.name);
  assert.deepEqual(rebaseManifest(manifest, ""), manifest);
});

test("npm build runs the rebase after the product pages", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.match(pkg.scripts.postbuild, /prerender-products\.mjs && node scripts\/rebase-static-pages\.mjs/);
});

test("a sub-folder build: sections answer 200 from their own file, /legal opens the list", () => {
  const dist = mkdtempSync(join(tmpdir(), "ll-base-"));
  writeFileSync(join(dist, "index.html"), `<a href="/discover">x</a>`);
  writeFileSync(join(dist, "legal.html"), `<a href="/legal/terms">t</a>`);
  mkdirSync(join(dist, "legal"));
  writeFileSync(join(dist, "legal", "terms.html"), `<a href="/legal">all</a>`);
  writeFileSync(join(dist, "manifest.json"), JSON.stringify({ start_url: "/", icons: [{ src: "/i.webp" }] }));
  mkdirSync(join(dist, "snapshot"));
  writeFileSync(join(dist, "snapshot", "kv.json"), read("public/snapshot/kv.json"));
  rebaseDist(dist, "/likelink");
  assert.equal(readFileSync(join(dist, "u", "alyostyle.html"), "utf8"), `<a href="/likelink/discover">x</a>`, "a listed creator's page answers 200 too");
  for (const route of ["discover", "products", "reels", "search"]) {
    assert.ok(SPA_SECTIONS.includes(route));
    assert.equal(readFileSync(join(dist, `${route}.html`), "utf8"), `<a href="/likelink/discover">x</a>`, `${route}.html is the rebased shell`);
  }
  assert.equal(readFileSync(join(dist, "legal", "index.html"), "utf8"), `<a href="/likelink/legal/terms">t</a>`);
  assert.equal(readFileSync(join(dist, "legal", "terms.html"), "utf8"), `<a href="/likelink/legal">all</a>`);
  assert.equal(JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8")).start_url, "/likelink/");

  const root = mkdtempSync(join(tmpdir(), "ll-root-"));
  writeFileSync(join(root, "index.html"), `<a href="/discover">x</a>`);
  rebaseDist(root, "");
  assert.equal(existsSync(join(root, "discover.html")), false, "the main build gets no extra files");
});
