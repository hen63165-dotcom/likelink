// Regression: the "paste an affiliate link" logic must validate strictly,
// classify honestly, never rewrite a link, and never claim an integration
// capability that the server did not confirm.
import test from "node:test";
import assert from "node:assert/strict";

import {
  LINK_ROUTE,
  AFFILIATE_DISCLOSURE,
  validateAffiliateUrl,
  classifyAffiliateUrl,
  linkErrorText,
  networkOf,
  fetchAffiliateIntegration,
  networkGuide,
} from "../src/lib/affiliateLink.js";

test("routes: exactly the three documented paste routes", () => {
  assert.deepEqual(Object.values(LINK_ROUTE).sort(), ["affiliate", "import", "product"]);
});

test("validateAffiliateUrl accepts absolute http(s) and keeps the address", () => {
  const https = validateAffiliateUrl("https://www.aliexpress.com/item/100500.html?aff_trace_key=abc");
  assert.equal(https.ok, true);
  assert.equal(https.host, "aliexpress.com");
  assert.equal(https.network?.id, "aliexpress");
  // Only www is normalised away for the host display; the stored url keeps the path/query.
  assert.match(https.url, /aff_trace_key=abc/);

  const http = validateAffiliateUrl("http://example.com/product/1");
  assert.equal(http.ok, true);
  assert.equal(http.error, null);
});

test("validateAffiliateUrl rejects empty, relative, non-http and broken values", () => {
  assert.equal(validateAffiliateUrl("").error, "empty");
  assert.equal(validateAffiliateUrl("   ").error, "empty");
  assert.equal(validateAffiliateUrl("/product/1").error, "parse");
  assert.equal(validateAffiliateUrl("javascript:alert(1)").error, "protocol");
  assert.equal(validateAffiliateUrl("data:text/html,x").error, "protocol");
  assert.equal(validateAffiliateUrl("not a url").error, "parse");
  assert.equal(validateAffiliateUrl("https://localhost").error, "host");
});

test("classifyAffiliateUrl separates an affiliate link from a plain product link", () => {
  const aff = classifyAffiliateUrl("https://www.aliexpress.com/item/1.html?aff_trace_key=xyz");
  assert.equal(aff.kind, "affiliate");
  assert.ok(aff.matchedParams.includes("aff_trace_key"));

  const amzn = classifyAffiliateUrl("https://www.amazon.co.il/dp/B00TEST?tag=mytag-21");
  assert.equal(amzn.kind, "affiliate");
  assert.ok(amzn.matchedParams.includes("tag"));

  const short = classifyAffiliateUrl("https://s.click.aliexpress.com/e/_AbCdEf");
  assert.equal(short.kind, "affiliate");
  assert.equal(short.shortLink, true);

  const plain = classifyAffiliateUrl("https://www.aliexpress.com/item/100500.html");
  assert.equal(plain.kind, "product");
  assert.deepEqual(plain.matchedParams, []);

  assert.equal(classifyAffiliateUrl("nonsense").kind, null);
});

test("networkOf recognises known stores and stays silent otherwise", () => {
  assert.equal(networkOf("https://www.amazon.com/x")?.id, "amazon");
  assert.equal(networkOf("shop.example.co.il"), null);
  assert.equal(networkOf("s.click.aliexpress.com")?.id, "aliexpress");
  assert.equal(networkOf("https://s.click.aliexpress.com/e/_x")?.id, "aliexpress");
  assert.equal(networkOf("Www.Amazon.de")?.id, "amazon");
});

test("error copy exists in both languages for every code", () => {
  for (const code of ["empty", "parse", "protocol", "host", "unknown-code"]) {
    assert.equal(typeof linkErrorText(code, "he"), "string");
    assert.equal(typeof linkErrorText(code, "en"), "string");
  }
  assert.match(AFFILIATE_DISCLOSURE.he, /#פרסומת/);
  assert.match(AFFILIATE_DISCLOSURE.en, /#ad/);
});

test("fetchAffiliateIntegration reports the server's own answer only", async () => {
  const ok = await fetchAffiliateIntegration({
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, provider: "aliexpress_affiliate_api", configured: true }) }),
  });
  assert.equal(ok.state, "configured");

  const missing = await fetchAffiliateIntegration({
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, provider: "aliexpress_affiliate_api", configured: false }) }),
  });
  assert.equal(missing.state, "not_configured");

  const offline = await fetchAffiliateIntegration({ fetchImpl: async () => { throw new Error("offline"); } });
  assert.equal(offline.state, "unknown");
  assert.equal(offline.error, "unreachable");

  const bad = await fetchAffiliateIntegration({ fetchImpl: async () => ({ ok: false, json: async () => ({}) }) });
  assert.equal(bad.state, "unknown");

  const none = await fetchAffiliateIntegration({ fetchImpl: undefined });
  assert.equal(none.state, "unknown");
});

test("networkGuide never promises an automatic link — it explains the creator's own steps", () => {
  const he = networkGuide({ id: "aliexpress", label: "AliExpress" }, "he");
  assert.equal(he.length, 3);
  assert.match(he[0], /AliExpress/);
  assert.match(he.join(" "), /הדביקי/);
  const generic = networkGuide(null, "he");
  assert.match(generic[0], /תוכנית שותפים/);
  const en = networkGuide(null, "en");
  assert.equal(en.length, 3);
});

// ── Universal Affiliate Link Manager: catalog, status, channels, UTM ────────

import {
  AFFILIATE_NETWORKS, NETWORKS_BY_ID, PROMO_CHANNELS, LINK_STATUS,
  affiliateNetworkOf, linkStatusOf, linkStatusLabel, linkStatusTone,
  appendUtm, normalizeUrlForCompare, findDuplicateByUrl,
  parseLinksCsv, CSV_MAX_ROWS,
} from "../src/lib/affiliateLink.js";

test("network catalog covers every required network plus other/manual", () => {
  const ids = AFFILIATE_NETWORKS.map((n) => n.id);
  for (const id of [
    "aliexpress", "amazon", "awin", "impact", "cj", "rakuten",
    "partnerize", "shareasale", "brand", "other", "manual",
  ]) {
    assert.ok(ids.includes(id), `missing network: ${id}`);
  }
  // Every entry is a label only — id/label/kind, nothing executable.
  for (const n of AFFILIATE_NETWORKS) {
    assert.deepEqual(Object.keys(n).sort(), ["id", "kind", "label"]);
    assert.ok(["network", "store", "brand", "manual"].includes(n.kind));
    assert.equal(NETWORKS_BY_ID[n.id], n);
  }
});

test("promotional channels are traffic sources and never networks", () => {
  const ids = PROMO_CHANNELS.map((c) => c.id);
  for (const ch of ["instagram", "tiktok", "youtube", "facebook", "pinterest", "website", "other"]) {
    assert.ok(ids.includes(ch), `missing channel: ${ch}`);
  }
  assert.ok(!ids.includes("awin"));
});

test("affiliateNetworkOf recognises tracking hosts and store hosts", () => {
  assert.equal(affiliateNetworkOf("https://www.awin1.com/gadclick.php?w=123")?.id, "awin");
  assert.equal(affiliateNetworkOf("https://imp.i123456.com/c/123456/789?u=")?.id, "impact");
  assert.equal(affiliateNetworkOf("https://www.anrdoezrs.net/links/123/code/x")?.id, "cj");
  assert.equal(affiliateNetworkOf("https://prf.hn/click/camref:123/desturl")?.id, "partnerize");
  assert.equal(affiliateNetworkOf("https://shareasale.com/sale.cfm?tracker=1")?.id, "shareasale");
  assert.equal(affiliateNetworkOf("https://s.click.aliexpress.com/e/_AbCd")?.id, "aliexpress");
  assert.equal(affiliateNetworkOf("https://amzn.to/3x")?.id, "amazon");
  assert.equal(affiliateNetworkOf("https://www.aliexpress.com/item/1.html")?.id, "aliexpress");
  assert.equal(affiliateNetworkOf("https://shop.example.co.il/1"), null);
  assert.equal(affiliateNetworkOf("not a url"), null);
});

test("linkStatusOf is honest: never assumes affiliate, never invents validation", () => {
  const aff = linkStatusOf("https://www.aliexpress.com/item/1.html?aff_trace_key=x");
  assert.equal(aff.status, LINK_STATUS.VALIDATED);
  assert.ok(aff.matchedParams.includes("aff_trace_key"));

  // Plain product URL claimed as affiliate → tracking unverified, NOT validated.
  const claimed = linkStatusOf("https://www.aliexpress.com/item/1.html", { claimed: true });
  assert.equal(claimed.status, LINK_STATUS.TRACKING_UNVERIFIED);

  // Same URL without a claim → ordinary product link.
  const plain = linkStatusOf("https://www.aliexpress.com/item/1.html");
  assert.equal(plain.status, LINK_STATUS.PRODUCT_LINK);

  const bad = linkStatusOf("javascript:alert(1)", { claimed: true });
  assert.equal(bad.status, LINK_STATUS.INVALID);
  assert.equal(bad.error, "protocol");

  // Label/tone exist in both languages for every status.
  for (const s of Object.values(LINK_STATUS)) {
    assert.equal(typeof linkStatusLabel(s, "he"), "string");
    assert.equal(typeof linkStatusLabel(s, "en"), "string");
    assert.ok(["success", "warning", "muted", "danger"].includes(linkStatusTone(s)));
  }
});

test("appendUtm adds tracking without ever stripping affiliate parameters", () => {
  const base = "https://www.aliexpress.com/item/1.html?aff_trace_key=keepme";
  const withUtm = appendUtm(base, { source: "instagram", medium: "story", campaign: "black_friday" });
  const u = new URL(withUtm);
  assert.equal(u.searchParams.get("aff_trace_key"), "keepme");
  assert.equal(u.searchParams.get("utm_source"), "instagram");
  assert.equal(u.searchParams.get("utm_medium"), "story");
  assert.equal(u.searchParams.get("utm_campaign"), "black_friday");

  // Empty UTM → the original address comes back untouched.
  assert.equal(appendUtm(base, {}), base);
  assert.equal(appendUtm("nonsense", { source: "x" }), null);
});

test("duplicate detection compares identities, not variants", () => {
  const products = [
    { id: "a", sourceUrl: "https://www.aliexpress.com/item/1.html?aff_trace_key=x", affiliateUrl: "https://www.aliexpress.com/item/1.html?aff_trace_key=x" },
    { id: "b", sourceUrl: "https://shop.example.co.il/p/2", affiliateUrl: "" },
  ];
  // Same address, different casing/trailing slash → duplicate.
  assert.equal(findDuplicateByUrl(products, "https://WWW.aliexpress.com/item/1.html/?aff_trace_key=x")?.id, "a");
  // Different parameters = a legitimate variant, not a duplicate.
  assert.equal(findDuplicateByUrl(products, "https://www.aliexpress.com/item/1.html?aff_trace_key=other"), null);
  assert.equal(findDuplicateByUrl(products, "https://shop.example.co.il/p/2/")?.id, "b");
  // excludeId skips the product being edited.
  assert.equal(findDuplicateByUrl(products, "https://shop.example.co.il/p/2", "b"), null);
  assert.equal(findDuplicateByUrl(products, "nonsense"), null);
  assert.equal(findDuplicateByUrl(null, "https://x.co/1"), null);
  assert.equal(normalizeUrlForCompare("HTTPS://Example.com/A/#frag"), "https://example.com/A");
  assert.equal(normalizeUrlForCompare("nope"), "");
});

test("parseLinksCsv reads headered and headerless files and flags bad rows", () => {
  const headed = parseLinksCsv(
    "title,url,network\nRing,https://www.aliexpress.com/item/1.html?aff_trace_key=x,aliexpress\nBroken,not-a-url,other\n"
  );
  assert.equal(headed.hasHeader, true);
  assert.equal(headed.rows.length, 2);
  assert.equal(headed.rows[0].title, "Ring");
  assert.equal(headed.rows[0].network, "aliexpress");
  assert.equal(headed.rows[0].error, null);
  assert.equal(headed.rows[1].line, 3);
  assert.equal(headed.rows[1].error, "parse");

  const headerless = parseLinksCsv("Brace,https://www.amazon.co.il/dp/B00X?tag=t-21\n");
  assert.equal(headerless.hasHeader, false);
  assert.equal(headerless.rows[0].title, "Brace");
  assert.equal(headerless.rows[0].url, "https://www.amazon.co.il/dp/B00X?tag=t-21");

  // Quoted commas survive; separators include tab and semicolon.
  const quoted = parseLinksCsv('name;link\n"Gold ring, thin";https://example.com/a\n');
  assert.equal(quoted.rows[0].title, "Gold ring, thin");

  // Row cap.
  const big = parseLinksCsv(Array.from({ length: CSV_MAX_ROWS + 10 }, (_, i) => `https://example.com/${i}`).join("\n"));
  assert.equal(big.rows.length, CSV_MAX_ROWS);
  assert.equal(big.truncated, true);

  assert.deepEqual(parseLinksCsv("").rows, []);
});
