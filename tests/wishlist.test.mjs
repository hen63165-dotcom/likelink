// A wish list sent to family (/wish?i=a,b,c&n=name, src/lib/wishlist.js):
// nothing is stored on a server, only listed products are shown, the name is
// short plain text, and the page is never a search page.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanIds, cleanName, parseWish, wishUrl, wishMessage, whatsappShare, WISH_MAX } from "../src/lib/wishlist.js";
import { parsePath } from "../src/utils/routing.js";

test("the link carries only safe, unique ids and a short plain name", () => {
  const url = wishUrl({ ids: ["ae-1", "ae-2", "ae-1", "bad id", "<x>"], name: "נועה <script>", source: "whatsapp" });
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, "https://likelink2.vercel.app/wish");
  assert.equal(u.searchParams.get("i"), "ae-1,ae-2");
  assert.equal(u.searchParams.get("n"), "נועה script");
  assert.equal(u.searchParams.get("utm_source"), "whatsapp");
  assert.deepEqual(parseWish(u.search), { ids: ["ae-1", "ae-2"], name: "נועה script" });
  assert.equal(cleanIds(Array.from({ length: 30 }, (_, i) => `p${i}`)).length, WISH_MAX);
  assert.equal(cleanName("https://evil.example/x").includes("/"), false, "no links in a name");
  assert.ok(cleanName("א".repeat(50)).length <= 20);
});

test("the WhatsApp message names the list and carries the link", () => {
  const url = wishUrl({ ids: ["ae-1"], name: "שירה" });
  assert.equal(wishMessage({ name: "שירה", url }), `🎁 הרשימה של שירה לחנוכה\n${url}`);
  assert.match(wishMessage({ url }), /^🎁 רשימת המשאלות שלי לחנוכה/);
  assert.ok(whatsappShare("a b").startsWith("https://wa.me/?text=a%20b"));
});

test("route, rewrite, noindex, and the saved page offers the list", () => {
  assert.deepEqual(parsePath("/wish"), { type: "wish" });
  const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.ok(vercel.rewrites.some((r) => r.source === "/wish" && r.destination === "/"));
  const site = readFileSync(new URL("../src/components/discover/PublicSite.jsx", import.meta.url), "utf8");
  assert.match(site, /case "wish":[\s\S]{0,300}robots: "noindex,follow"/);
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app.match(/const PUBLIC_TYPES = new Set\(\[[^\]]*\]\)/)[0], /"wish"/);
  const pages = readFileSync(new URL("../src/components/discover/pages.jsx", import.meta.url), "utf8");
  assert.match(pages, /saved\.length \? <WishShare ids=\{saved\.map\(\(p\) => p\.id\)\} \/> : null/);
  assert.match(pages, /const items = ids\.map\(\(id\) => graph\.byId\.get\(id\)\)\.filter\(Boolean\)/, "only listed products");
});
