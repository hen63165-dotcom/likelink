// The cloud autopilot's copy and selection: no unverifiable claims in Luna's
// hooks or story frames, and only a promotable product with a real photo is
// spotlighted (catalog integrity).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FORBIDDEN_CLAIMS } from "../src/lib/discovery/distribution.js";

const CLAIMS = /(מבחן אמיתי|בדקתי|כולם מתלהבים|כולן רוצות|הכי חם|תוצאות מידיות|מרותקים|כל מי שנכנס שואל|מושלם|זה עובד|משלוח עד הבית|אריזה? מתנה)/;

for (const f of ["src/lib/ambassador.js", "src/lib/cloud/storyEngine.js"]) {
  test(`${f}: Luna's lines make no unverifiable claims`, () => {
    const lines = [...readFileSync(f, "utf8").matchAll(/"([^"\n]*[֐-׿][^"\n]*)"/g)].map((m) => m[1]);
    assert.ok(lines.length > 20);
    for (const l of lines) {
      assert.doesNotMatch(l, CLAIMS, l);
      assert.doesNotMatch(l, FORBIDDEN_CLAIMS, l);
    }
  });
}

test("cloud autopilot spotlights only a promotable product with a real photo", async () => {
  const { runCloudAutopilotCycle } = await import("../src/lib/cloud/cloudAutopilot.js");
  const M = [{ id: "m1", slug: "m1", name: "M", enabled: true }];
  const base = { status: "approved", marketerId: "m1", category: "Tech", price: 50 };
  const products = [
    { ...base, id: "stock", title: "stock", affiliateUrl: "https://s.click.aliexpress.com/e/_A", image: "https://images.unsplash.com/photo-1" },
    { ...base, id: "s1", title: "s1", affiliateUrl: "https://s.click.aliexpress.com/e/_S", image: "https://ae01.alicdn.com/kf/a.jpg" },
    { ...base, id: "s2", title: "s2", affiliateUrl: "https://s.click.aliexpress.com/e/_S", image: "https://ae01.alicdn.com/kf/b.jpg" },
    { ...base, id: "real", title: "real", affiliateUrl: "https://s.click.aliexpress.com/e/_R", image: "https://ae01.alicdn.com/kf/r.jpg" },
  ];
  const kv = new Map([["marketplace:products", products], ["marketplace:marketers", M]]);
  const ctx = { kvGet: async (k, f) => (kv.has(k) ? kv.get(k) : f ?? null), kvSet: async (k, v) => { kv.set(k, v); }, origin: "https://likelink2.vercel.app", env: {} };
  for (let i = 0; i < 4; i++) {
    await runCloudAutopilotCycle(ctx, { force: true });
    const feed = kv.get("site_campaign:feed") || [];
    assert.equal(feed[0]?.spotlightId, "real", JSON.stringify(feed[0]?.spotlightId));
  }
  // Only non-promotable products → nothing is spotlighted.
  kv.set("marketplace:products", products.filter((p) => p.id !== "real"));
  kv.delete("site_campaign:feed");
  await runCloudAutopilotCycle(ctx, { force: true });
  assert.equal((kv.get("site_campaign:feed") || [])[0]?.spotlightId ?? null, null);
});
