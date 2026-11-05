// Every name a component destructures from useMarketplace() must exist in the
// context value. `recordProductView` was missing for weeks: the product page
// and reels silently recorded no views, so trends and learning had no data.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ctx = readFileSync("src/context/MarketplaceContext.jsx", "utf8");
const start = ctx.indexOf("const value = useMemo(");
const end = ctx.indexOf("\n    }),\n    [", start);
const valueBlock = ctx.slice(start, end);
// Top-level keys of the value object: "  name," or "  name:" lines at 6 spaces.
const keys = new Set([...valueBlock.matchAll(/^ {6}([A-Za-z_$][\w$]*)\s*[,:(]/gm)].map((m) => m[1]));

const dirs = ["src/components/discover", "src/components/studio"];
for (const dir of dirs) {
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".jsx"))) {
    const src = readFileSync(path.join(dir, f), "utf8");
    for (const m of src.matchAll(/const \{([^}]+)\} = useMarketplace\(\)/g)) {
      const names = m[1].split(",").map((x) => x.trim().split(":")[0].split("=")[0].trim()).filter(Boolean);
      test(`${dir}/${f}: useMarketplace() provides ${names.join(", ")}`, () => {
        for (const n of names) assert.ok(keys.has(n), `${n} is not in the MarketplaceContext value`);
      });
    }
  }
}

test("the value object was found and has the tracking functions", () => {
  assert.ok(keys.size > 20, `parsed ${keys.size} keys`);
  assert.ok(keys.has("recordClick") && keys.has("recordProductView"));
});

test("automated browsers never record views or clicks (no fake traffic from checks)", () => {
  assert.match(ctx, /navigator\.webdriver === true/);
  const click = ctx.slice(ctx.indexOf("const recordClick = useCallback("), ctx.indexOf("const recordProductView = useCallback("));
  const view = ctx.slice(ctx.indexOf("const recordProductView = useCallback("), ctx.indexOf("const recordProductView = useCallback(") + 900);
  assert.ok(click.indexOf("if (isAutomated()) return;") > -1 && click.indexOf("if (isAutomated()) return;") < click.indexOf("persistClicks"));
  assert.ok(view.indexOf("if (isAutomated()) return;") > -1 && view.indexOf("if (isAutomated()) return;") < view.indexOf("persistClicks"));
});

test("a tap on the store button is still sent when the store opens in the same view (Instagram/TikTok)", () => {
  // From 2026-10-04 to 2026-11-05 no exit to the store was recorded, while most
  // visits came from Instagram, whose in-app browser opens the store in this
  // same view and cancels a write that is still on its way.
  const persist = ctx.slice(ctx.indexOf("const persistClicks = useCallback("), ctx.indexOf("const persistSales = useCallback("));
  assert.match(persist, /keepalive: true/);
  const storage = readFileSync("src/lib/storage.js", "utf8");
  assert.match(storage, /opts\.keepalive && body\.length < 60_000 \? \{ keepalive: true \}/, "keepalive only under the browsers' 64 KB cap");
  const kit = readFileSync("src/components/discover/kit.jsx", "utf8");
  const shop = kit.slice(kit.indexOf("export function ShopButton("), kit.indexOf("export function ShopButton(") + 1800);
  assert.match(shop, /if \(!inAppBrowser\(\)\) return;\s*\/\/[^\n]*\n[^\n]*\n\s*e\.preventDefault\(\);/);
  assert.match(shop, /setTimeout\(r, 400\)/, "the shopper waits at most 400 ms");
});
