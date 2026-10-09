// The static /r forwarder (public/r.js) and the site's own share sheet.
// /r must keep the server's rule without a server: forward only to a product
// link that is in the catalog, never act as an open redirect. The share
// button must open the site's sheet, not the operating system's dialog (on
// Windows that is Microsoft's share window), and every network link must
// carry its own attribution.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decideRedirect } from "../public/r.js";
import { SHARE_SHEET_ORDER, buildShareLink } from "../src/lib/acquisition.js";

const products = JSON.parse(readFileSync(new URL("../public/snapshot/kv.json", import.meta.url), "utf8")).keys["marketplace:products"];
const origin = "https://likelink2.vercel.app";
const [first] = products;

test("/r forwards a catalog product by pid to its own stored link", () => {
  const d = decideRedirect({ search: `?pid=${first.id}&u=${encodeURIComponent("https://evil.example/x")}`, origin, products });
  assert.deepEqual(d, { action: "go", url: new URL(first.affiliateUrl).href });
});

test("/r forwards the exact stored affiliate link", () => {
  const d = decideRedirect({ search: `?u=${encodeURIComponent(first.affiliateUrl)}&src=telegram`, origin, products });
  assert.equal(d.action, "go");
  assert.equal(d.url, new URL(first.affiliateUrl).href);
});

test("/r is not an open redirect: an unknown destination asks first", () => {
  const d = decideRedirect({ search: `?u=${encodeURIComponent("https://evil.example/login")}`, origin, products });
  assert.equal(d.action, "confirm");
  assert.equal(d.host, "evil.example");
  // Same rule when the catalog copy could not be read at all.
  assert.equal(decideRedirect({ search: `?u=${encodeURIComponent(first.affiliateUrl)}`, origin, products: [] }).action, "confirm");
});

test("/r refuses scripts, loops and empty links", () => {
  for (const u of ["javascript:alert(1)", "data:text/html,x", `${origin}/r?u=x`, "not a url", ""]) {
    assert.equal(decideRedirect({ search: `?u=${encodeURIComponent(u)}`, origin, products }).action, "invalid", u);
  }
  assert.equal(decideRedirect({ search: "", origin, products }).action, "invalid");
});

test("Netlify serves /r from the static page, not the cloud function", () => {
  const redirects = readFileSync(new URL("../public/_redirects", import.meta.url), "utf8");
  assert.match(redirects, /^\/r\s+\/r\.html\s+200\s*$/m);
  assert.doesNotMatch(redirects, /^\/r\s+https:\/\//m);
  const page = readFileSync(new URL("../public/r.html", import.meta.url), "utf8");
  assert.match(page, /noindex/);
  assert.match(page, /<script type="module" src="\/r\.js"><\/script>/);
});

test("share sheet: WhatsApp first, each network gets its own link, Pinterest only with a real image", () => {
  assert.equal(SHARE_SHEET_ORDER[0], "whatsapp");
  const url = `${origin}/p/p-live-02?utm_source=whatsapp`;
  for (const id of SHARE_SHEET_ORDER.filter((t) => t !== "pinterest")) {
    const href = buildShareLink(id, url, "צמיד", "");
    assert.ok(href, id);
    assert.ok(href.includes(encodeURIComponent(url)), `${id} carries the attributed url`);
  }
  assert.equal(buildShareLink("pinterest", url, "צמיד", ""), null);
  assert.equal(buildShareLink("pinterest", url, "צמיד", "javascript:alert(1)"), null);
  assert.match(buildShareLink("pinterest", url, "צמיד", "https://ae01.alicdn.com/kf/a.jpg"), /^https:\/\/www\.pinterest\.com\/pin\/create\/button\/\?url=.*&media=/);
});

test("share button opens the site's sheet; the device dialog is only 'more apps'", () => {
  const kit = readFileSync(new URL("../src/components/discover/kit.jsx", import.meta.url), "utf8");
  const button = kit.slice(kit.indexOf("export function ShareButton("), kit.indexOf("/** Tracked outbound purchase link"));
  assert.doesNotMatch(button, /navigator\.share/, "opening the share button never calls the OS dialog");
  const sheet = kit.slice(kit.indexOf("function ShareSheet("), kit.indexOf("export function ShareButton("));
  assert.match(sheet, /role="dialog"/);
  assert.match(sheet, /aria-modal="true"/);
  assert.match(sheet, /aria-labelledby=\{titleId\}/);
  assert.match(sheet, /e\.key === "Escape"/);
  assert.match(sheet, /async function shareNative\(\)[\s\S]*navigator\.share/, "the device dialog is reached only from its own button");
});
