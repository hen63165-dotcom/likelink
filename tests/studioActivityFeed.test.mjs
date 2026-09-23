// Regression: the Studio activity system must stay wired to real actions.
// The Overview strip renders ActivityStrip only from the real
// useMarketplace activity feed; UGC/Luna panels must not AuthGate visitors.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const SHELL = read("src/components/studio/StudioShell.jsx");
const CTX = read("src/context/MarketplaceContext.jsx");
const LUNA = read("src/components/ambassador/LunaAssistant.jsx");

test("Overview renders the real activity strip from the marketplace feed", () => {
  assert.ok(SHELL.includes("ActivityStrip"), "StudioShell must define ActivityStrip");
  assert.ok(SHELL.includes("<ActivityStrip />"), "Overview must render <ActivityStrip />");
  assert.ok(SHELL.includes("buildActivityFeed"), "strip must merge via buildActivityFeed");
  assert.ok(CTX.includes("activityFeed"), "MarketplaceContext must expose activityFeed");
  assert.ok(CTX.includes("pushActivity"), "MarketplaceContext must expose pushActivity");
});

test("real user actions append to the studio activity log", () => {
  for (const sig of ["favorite.toggle", "creator.follow", "product.view", "product.click", "product.add"]) {
    assert.ok(CTX.includes(sig), `MarketplaceContext must log ${sig}`);
  }
  assert.ok(LUNA.includes("luna.ask"), "LunaAssistant must log luna.ask");
  assert.ok(LUNA.includes("luna.success"), "LunaAssistant must log luna.success");
});

test("UGC and Luna panels stay usable for visitors (no auth dead-end)", () => {
  const ugc = SHELL.match(/function UgcPanel[\s\S]*?^}/m);
  assert.ok(ugc, "UgcPanel must exist");
  assert.ok(!/return <AuthGate/.test(ugc[0]), "UgcPanel must not AuthGate visitors");
  assert.ok(ugc[0].includes("__visitor__") || ugc[0].includes("Community content"), "UgcPanel must show community content to visitors");
  const luna = SHELL.match(/function LunaPanel[\s\S]*?^}/m);
  assert.ok(luna, "LunaPanel must exist");
  assert.ok(!/return <AuthGate/.test(luna[0]), "LunaPanel must not AuthGate visitors");
});
