// Studio clarity + Cline's link manager (PR #107), fixed before shipping.
//
// Pins:
//  - signed-out /studio is one clear entrance page (StudioEntrance), not the
//    dashboard chrome, and it sends the visitor to the real sign-up (AuthGate);
//  - the Studio menu shows five core items; the advanced tools are collapsed
//    behind one toggle, and "הוספת קישור" is the one header action;
//  - a pasted affiliate link is stored exactly as pasted, and an edit really
//    saves a changed link;
//  - product writes use the latest list (no stale overwrite of a just-added
//    product);
//  - the creator's affiliate accounts are private (never on the public row);
//  - image/link previews only render safe addresses;
//  - no stray Arabic letters in the Studio's Hebrew copy (punctuation such as
//    the Arabic comma a topic splitter accepts is fine).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { validateAffiliateUrl } from "../src/lib/affiliateLink.js";
import {
  publicMarketer, privateFieldsOf, splitMarketers, mergePrivateMaps, createPrivateKv,
  PRIVATE_MARKETER_FIELDS, CLEAR_PRIVATE, MARKETERS_KEY, PRIVATE_MARKETERS_KEY,
} from "../src/lib/cloud/marketerPrivacy.js";
import { isPublicSocialUrl, pickSocialLinks } from "../src/lib/publicDiscovery.js";
import { isSafePreviewSrc, safeImageSrc, safeHref } from "../src/lib/safeMedia.js";
import { safePreviewSrc } from "../src/lib/uploadImage.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("signed-out /studio renders the entrance page with the real sign-up", () => {
  const shell = read("src/components/studio/StudioShell.jsx");
  assert.match(shell, /import StudioEntrance from "\.\/StudioEntrance\.jsx"/);
  assert.match(shell, /if \(!loading && !marketer\) \{?[\s\S]{0,2000}<StudioEntrance \/>/);

  const entrance = read("src/components/studio/StudioEntrance.jsx");
  assert.match(entrance, /import AuthGate from "\.\.\/sell\/AuthGate\.jsx"/);
  assert.match(entrance, /id="signup"/);
  // A paused cloud is said plainly, never a silent broken form.
  assert.match(entrance, /CLOUD_PAUSED_HE/);
  // Trying a link saves nothing: no product write from the entrance page.
  assert.doesNotMatch(entrance, /onAddProduct|setJSON|\/api\/store/);
  // No counters or invented numbers on the entrance.
  assert.doesNotMatch(entrance, /(\d[\d,]*\s*(יוצרות|משתמשים|creators|users))|כוכבים|ביקורות/);
});

test("SellView still uses the same sign-up form (moved to AuthGate.jsx)", () => {
  const sell = read("src/components/sell/SellView.jsx");
  assert.match(sell, /import AuthGate from "\.\/AuthGate\.jsx"/);
  const gate = read("src/components/sell/AuthGate.jsx");
  assert.match(gate, /export default function AuthGate\(/);
});

test("Studio menu: five core items, advanced tools collapsed, one add-link action", () => {
  const shell = read("src/components/studio/StudioShell.jsx");
  assert.match(shell, /const ADVANCED_SECTIONS = \["create", "grow", "operate"\]/);
  assert.match(shell, /!ADVANCED_SECTIONS\.includes\(section\.id\) \|\| showAdvanced/);
  // Opening an advanced view directly still shows its section.
  assert.match(shell, /showAdvanced = advancedOpen \|\| inAdvanced/);
  assert.match(shell, /"כלים מתקדמים"/);
  assert.match(shell, /"הוספת קישור"/);
  assert.match(shell, /"קישורים ומוצרים"/);
});

test("onboarding imports every icon it renders", () => {
  const src = read("src/components/studio/StudioOnboarding.jsx");
  assert.match(src, /Image as ImageIcon/);
});

test("Studio copy has no stray Arabic letters", () => {
  const dir = new URL("../src/components/studio/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith(".jsx"));
  const files2 = ["src/components/sell/AuthGate.jsx", "src/components/sell/SellView.jsx"];
  for (const f of files) {
    const text = readFileSync(join(dir.pathname, f), "utf8");
    assert.doesNotMatch(text, /[ء-ي]/, `${f} contains Arabic letters`);
  }
  for (const f of files2) assert.doesNotMatch(read(f), /[ء-ي]/, `${f} contains Arabic letters`);
});

test("a pasted affiliate link is stored exactly as pasted (trimmed only)", () => {
  for (const raw of [
    "https://Shop.com",
    "https://s.click.aliexpress.com/e/_DmXyZ12",
    "https://www.amazon.com/dp/B0TEST?tag=me-20&linkCode=ll1",
    "https://example.co.il/p?q=%D7%A9",
  ]) {
    const v = validateAffiliateUrl(`  ${raw}  `);
    assert.equal(v.ok, true, raw);
    assert.equal(v.url, raw, `${raw} must not be rewritten`);
  }
  assert.equal(validateAffiliateUrl("javascript:alert(1)").ok, false);
  assert.equal(validateAffiliateUrl("/relative").ok, false);
});

test("editing a product really saves the changed affiliate link", () => {
  const src = read("src/components/studio/AddProductLink.jsx");
  const edit = src.slice(src.indexOf("onUpdateProduct("), src.indexOf("onUpdateProduct(") + 600);
  assert.match(edit, /affiliateUrl: v\.url/);
});

test("product writes use the latest list (no stale overwrite)", () => {
  const ctx = read("src/context/MarketplaceContext.jsx");
  assert.match(ctx, /typeof next === "function" \? next\(productsRef\.current\) : next/);
  // The refs follow committed state, never a render that may be thrown away.
  assert.match(ctx, /useLayoutEffect\(\(\) => \{ productsRef\.current = products; \}, \[products\]\)/);
  assert.match(ctx, /useLayoutEffect\(\(\) => \{ marketersRef\.current = marketers; \}, \[marketers\]\)/);
  assert.doesNotMatch(ctx, /^\s*(productsRef|marketersRef)\.current = (products|marketers);$/m);
  // …and the cloud writes go out in that same order (an older list never lands last).
  assert.match(ctx, /productsWrite\.current\.catch\(\(\) => \{\}\)\.then\(\(\) => setJSON\(K\.products, value, true\)\)/);
  // Every caller hands an updater, never a list computed from a stale render.
  assert.doesNotMatch(ctx, /persistProducts\(\s*(products|\[\.\.\.products)/);
  assert.doesNotMatch(ctx, /persistProducts\(products\./);
});

test("affiliate accounts are private creator fields", () => {
  assert.ok(PRIVATE_MARKETER_FIELDS.includes("affiliateAccounts"));
  const m = {
    id: "m1",
    name: "Studio",
    affiliateAccounts: [{ network: "aliexpress", trackingId: "abc" }],
  };
  assert.equal("affiliateAccounts" in publicMarketer(m), false);
  assert.deepEqual(privateFieldsOf(m).affiliateAccounts, m.affiliateAccounts);
  const { publicList, privateById } = splitMarketers([m]);
  assert.equal(JSON.stringify(publicList).includes("trackingId"), false);
  assert.deepEqual(privateById.m1.affiliateAccounts, m.affiliateAccounts);
});

test("previews only render safe addresses", () => {
  for (const ok of [
    "https://cdn.example.com/a.jpg",
    "http://x.test/b.png",
    "blob:https://likelink2.vercel.app/1234",
    "data:image/png;base64,iVBORw0KGgo=",
    "data:image/jpeg;base64,/9j/4AAQ",
  ]) assert.equal(isSafePreviewSrc(ok), true, ok);
  for (const bad of [
    "javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "vbscript:x",
    "",
    "//evil.test/x.png",
  ]) assert.equal(isSafePreviewSrc(bad), false, bad);

  assert.equal(safePreviewSrc("javascript:alert(1)", "/fallback.png"), "/fallback.png");
  assert.equal(safePreviewSrc("https://cdn.example.com/a.jpg", "/f.png"), "https://cdn.example.com/a.jpg");

  // The scheme always comes from safeMedia.js; the rest of the address is kept.
  assert.equal(safeImageSrc("HTTPS://cdn.example.com/A.jpg?x=1"), "https://cdn.example.com/A.jpg?x=1");
  assert.equal(safeImageSrc("data:image/JPEG;base64,/9j/4AAQ"), "data:image/jpeg;base64,/9j/4AAQ");
  assert.equal(safeImageSrc("javascript:alert(1)", "/f.png"), "/f.png");
  assert.equal(safeHref(" https://instagram.com/me "), "https://instagram.com/me");
  assert.equal(safeHref("HTTP://Shop.example/x"), "http://Shop.example/x");
  // Quotes, angle brackets and spaces are percent-encoded: nothing typed can close the attribute.
  assert.equal(safeHref('https://x.test/a"><b'), "https://x.test/a%22%3E%3Cb");
  assert.equal(safeImageSrc("https://x.test/my photo.jpg"), "https://x.test/my%20photo.jpg");
  // An already-encoded address is left as it is.
  assert.equal(safeHref("https://x.test/p?q=%D7%A9&a=1"), "https://x.test/p?q=%D7%A9&a=1");
  assert.equal(safeHref("javascript:alert(1)"), "");
  assert.equal(safeHref("instagram.com/me"), "");

  for (const f of ["AddProductLink.jsx", "StudioOnboarding.jsx", "StorefrontDesign.jsx"]) {
    const src = read(`src/components/studio/${f}`);
    // No raw field rendered straight into an <img src> in these forms.
    assert.doesNotMatch(src, /src=\{(form|fields|preview|p)\.image\}/, f);
    // …and no typed address straight into a link either.
    assert.doesNotMatch(src, /href=\{form\.socials\[k\]\}/, f);
  }
});

test("removing the last affiliate account really removes it (owner-only clear request)", async () => {
  const acct = [{ id: "a1", network: "aliexpress", label: "main", trackingId: "t1" }];
  // An empty list alone keeps the stored value (a client that never loaded it cannot erase it)…
  assert.deepEqual(mergePrivateMaps({ m1: { affiliateAccounts: acct } }, { m1: {} }, ["m1"]).m1.affiliateAccounts, acct);
  // …a clear request removes it, and is never stored.
  const cleared = privateFieldsOf({ id: "m1", affiliateAccounts: [], [CLEAR_PRIVATE]: ["affiliateAccounts", "notAField"] });
  assert.deepEqual(cleared, { [CLEAR_PRIVATE]: ["affiliateAccounts"] });
  const merged = mergePrivateMaps({ m1: { affiliateAccounts: acct, payPalEmail: "p@x.test" } }, { m1: cleared }, ["m1"]);
  assert.deepEqual(merged, { m1: { payPalEmail: "p@x.test" } });
  // A clear request next to a new value keeps the new value.
  const both = privateFieldsOf({ id: "m1", affiliateAccounts: acct, [CLEAR_PRIVATE]: ["affiliateAccounts"] });
  assert.deepEqual(mergePrivateMaps({}, { m1: both }, ["m1"]).m1, { affiliateAccounts: acct });
  // The request never reaches the public row.
  assert.equal(CLEAR_PRIVATE in publicMarketer({ id: "m1", [CLEAR_PRIVATE]: ["affiliateAccounts"] }), false);

  // End to end through the server's kv wrapper.
  const db = {
    [MARKETERS_KEY]: JSON.stringify([{ id: "m1", name: "Studio" }]),
    [PRIVATE_MARKETERS_KEY]: JSON.stringify({ m1: { email: "o@x.test", affiliateAccounts: acct } }),
  };
  const kv = createPrivateKv({
    get: async (k, fb) => (k in db ? JSON.parse(db[k]) : fb),
    set: async (k, v) => { db[k] = JSON.stringify(v); },
  });
  await kv.set(MARKETERS_KEY, [{ id: "m1", name: "Studio", email: "o@x.test", affiliateAccounts: [], [CLEAR_PRIVATE]: ["affiliateAccounts"] }]);
  assert.deepEqual(JSON.parse(db[PRIVATE_MARKETERS_KEY]), { m1: { email: "o@x.test" } });
  assert.equal(db[MARKETERS_KEY].includes(CLEAR_PRIVATE), false);

  // The Studio sends the request only when the list becomes empty, and the context never keeps it.
  const ui = read("src/components/studio/AffiliateAccounts.jsx");
  assert.match(ui, /\[CLEAR_PRIVATE\]: \["affiliateAccounts"\]/);
  const ctx = read("src/context/MarketplaceContext.jsx");
  assert.match(ctx, /const local = value\.map\(withoutClearRequest\);\s*marketersRef\.current = local;\s*setMarketers\(local\);/);
  // Creator updates also start from the latest list and reach the cloud in order.
  assert.match(ctx, /marketersWrite\.current\.catch\(\(\) => \{\}\)\.then\(\(\) => setJSON\(K\.marketers, value, true\)\)/);
  assert.doesNotMatch(ctx, /persistMarketers\(\s*(\[\.\.\.marketers|marketers\.)/);
});

test("the storefront editor accepts only social links the public page shows", () => {
  assert.equal(isPublicSocialUrl("https://instagram.com/me"), true);
  assert.equal(isPublicSocialUrl("https://instagram"), false);
  assert.equal(isPublicSocialUrl("javascript:alert(1)"), false);
  assert.deepEqual(pickSocialLinks({ instagram: "https://instagram" }), []);
  const src = read("src/components/studio/StorefrontDesign.jsx");
  assert.match(src, /isPublicSocialUrl\(v\) \? safeHref\(v\)/);
  assert.match(src, /if \(v && !shownSocial\(v\)\)/);
  // The onboarding wizard uses the same rule.
  assert.match(read("src/components/studio/StudioOnboarding.jsx"), /if \(v && !isPublicSocialUrl\(v\)\)/);
});

test("after a save the add-link form is a new product, never the edited one", () => {
  const src = read("src/components/studio/AddProductLink.jsx");
  assert.match(src, /if \(!compact\) resetToNew\(\);\s*setSaved\(/);
  // An edit that found no product is a failed save, not a success.
  assert.match(src, /result = updated \? \{ id: editingId, status \} : null;/);
});
