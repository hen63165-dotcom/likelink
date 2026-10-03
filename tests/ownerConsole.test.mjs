// The owner's controls live in a private console (/owner), apart from the
// creators' Studio: noindex, not linked publicly, rendered only after the
// server confirms the owner, and the Studio no longer embeds owner controls.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("owner console: private route, noindex, server-confirmed owner only", async () => {
  const { parsePath, tabToPath } = await import("../src/utils/routing.js");
  assert.deepEqual(parsePath("/owner"), { type: "app", tab: "owner" });
  assert.equal(tabToPath("owner"), "/owner");
  const vercel = JSON.parse(read("vercel.json"));
  assert.ok(vercel.rewrites.some((r) => r.source === "/owner" && r.destination === "/"));
  assert.match(read("public/robots.txt"), /Disallow: \/owner/);
  const app = read("src/App.jsx");
  assert.match(app, /tab === "admin" \|\| tab === "owner"/, "noindex like /admin");
  const consoleSrc = read("src/components/admin/OwnerConsole.jsx");
  assert.match(consoleSrc, /me\.plan !== "owner"/, "renders only for the server-confirmed owner plan");
  assert.match(consoleSrc, /העמוד לא נמצא/, "a signed-in non-owner sees not-found");
  assert.match(consoleSrc, /signed_out/, "a signed-out visitor is told to sign in");
  // The Studio shows the owner only a link, never the owner controls themselves.
  const checkout = read("src/components/sell/PlanCheckout.jsx");
  assert.doesNotMatch(checkout, /PayPalPlansCard/);
  assert.match(checkout, /href="\/owner"/);
  // The public site never links to the owner console.
  for (const f of ["src/components/discover/PublicShell.jsx", "src/components/discover/pages.jsx", "src/components/discover/kit.jsx"]) {
    assert.doesNotMatch(read(f), /\/owner\b/, f);
  }
  // sub=get resolves the platform owner on the server-verified e-mail.
  assert.match(read("api/store.mjs"), /isPlatformOwner, now: Date\.now\(\) \}\)/);
});
