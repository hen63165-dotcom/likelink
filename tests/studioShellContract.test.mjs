// Regression test: the dark premium LikeLink2 Studio is the DEFAULT root surface.
//
// Before this contract existed, `/` parsed to { type: "landing" }, App did not
// handle "landing" at all, and the root fell through to the cream/beige
// marketplace shell (AppShell + TopBar + FeedView). The dark Studio existed but
// was only reachable at /studio, so production still looked like the old
// marketplace. These tests fail the build if any of that regresses:
//   • the router stops resolving studio deep links
//   • App stops routing the landing/root surface to StudioShell
//   • the Studio loses views, RTL handling, or its dark stylesheet
//   • fabricated metrics creep back into the Studio surface
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { parsePath, tabToPath } from "../src/utils/routing.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const APP = read("src/App.jsx");
const SHELL = read("src/components/studio/StudioShell.jsx");
const STUDIO_CSS = read("src/studio.css");
const MAIN = read("src/main.jsx");
const INDEX_CSS = read("src/index.css");

// The full Studio information architecture requested for the command center.
const REQUIRED_VIEWS = [
  "overview",
  "luna",
  "products",
  "product-intelligence",
  "self-marketing",
  "ugc",
  "video",
  "creator-lab",
  "content",
  "campaigns",
  "trends",
  "publishing",
  "performance",
  "trust",
  "autopilot",
  "recommendations",
  "settings",
];

test("router resolves the Studio deep links the shell depends on", () => {
  assert.deepEqual(parsePath("/"), { type: "landing" });
  assert.deepEqual(parsePath("/studio"), { type: "app", tab: "sell", view: undefined });
  assert.deepEqual(parsePath("/studio/luna"), { type: "app", tab: "sell", view: "luna" });
  assert.deepEqual(parsePath("/studio/product-intelligence"), {
    type: "app",
    tab: "sell",
    view: "product-intelligence",
  });
  // "sell" is the legacy alias used by older callers (FeedView hero CTA).
  assert.deepEqual(parsePath("/sell"), { type: "app", tab: "sell", view: undefined });
  assert.deepEqual(parsePath("/feed"), { type: "app", tab: "feed" });
  assert.deepEqual(parsePath("/admin"), { type: "app", tab: "admin" });
  assert.deepEqual(parsePath("/u/creator-slug"), { type: "creator", slug: "creator-slug" });
  assert.deepEqual(parsePath("/p/product-1"), { type: "product", id: "product-1" });
  assert.equal(tabToPath("sell"), "/studio");
});

test("App routes the root/landing surface to the dark Studio, not the marketplace shell", () => {
  const landingBranch = APP.match(/if \(route\.type === "landing"[\s\S]*?\n  \}/);
  assert.ok(landingBranch, "App must special-case the landing route");
  assert.ok(
    landingBranch[0].includes("StudioShell"),
    "landing route must render StudioShell (the cream marketplace shell is not the default)"
  );
  assert.ok(
    /setTheme\("dark", false\)/.test(APP),
    "App must force the dark theme for the Studio surface"
  );
  assert.ok(
    /if \(tab === "sell"\)[\s\S]*?<StudioShell/.test(APP),
    "the sell tab must still mount StudioShell"
  );
});

test("Studio declares the full command-center navigation", () => {
  for (const view of REQUIRED_VIEWS) {
    assert.ok(SHELL.includes(`"${view}"`), `StudioShell must declare the "${view}" view`);
  }
  for (const section of ["core", "create", "grow", "operate"]) {
    assert.ok(SHELL.includes(`id: "${section}"`), `StudioShell must declare the "${section}" section`);
  }
  for (const he of ["לונה", "מוצרים", "קמפיינים", "טרנדים", "פרסום", "ביצועים", "אמון", "המלצות", "הגדרות"]) {
    assert.ok(SHELL.includes(he), `StudioShell must expose the Hebrew label ${he}`);
  }
});

test("Studio is RTL-correct and ships its dark stylesheet", () => {
  assert.ok(
    /dir=\{lang === "he" \? "rtl" : "ltr"\}/.test(SHELL),
    "StudioShell root must switch dir between rtl (he) and ltr (en)"
  );
  assert.ok(MAIN.includes("studio.css"), "main.jsx must import the Studio stylesheet");
  // Every Studio stylesheet class must actually be used by the shell — no dead CSS.
  const usedClasses = [
    "ll-studio",
    "ll-card",
    "ll-grad-text",
    "ll-nav-item",
    "ll-glow",
    "ll-tap",
    "ll-header",
    "ll-page-title",
    "ll-page-subtitle",
    "ll-stat-card",
    "ll-stat-icon",
    "ll-stat-value",
    "ll-stat-label",
  ];
  for (const cls of usedClasses) {
    assert.ok(STUDIO_CSS.includes(`.${cls}`), `studio.css must define .${cls}`);
    assert.ok(SHELL.includes(cls), `StudioShell must use .${cls}`);
  }
});

test("dark palette is deep navy with blue/violet AI accents", () => {
  const darkBlock = INDEX_CSS.match(/\[data-theme="dark"\]\s*\{[\s\S]*?\n\}/);
  assert.ok(darkBlock, 'index.css must define a [data-theme="dark"] palette');
  const block = darkBlock[0];
  assert.ok(/--bg:\s*#0b0d1a/.test(block), "dark --bg must be deep navy (#0b0d1a)");
  assert.ok(/--bg-elevated:\s*#111327/.test(block), "dark --bg-elevated must be navy (#111327)");
  assert.ok(/--accent:\s*#7aa3ff/.test(block), "dark --accent must be electric blue (#7aa3ff)");
  assert.ok(/--accent-2:\s*#b38dff/.test(block), "dark --accent-2 must be violet (#b38dff)");
});

test("Studio never fabricates metrics, creators or publications", () => {
  const fabricated = [
    /\b\d+(\.\d+)?\s?M\s+(views|reach|impressions)\b/i,
    /\b\d+(\.\d+)?\s?K\s+(views|followers|clicks)\b/i,
    /\+\d+(\.\d+)?%\s*(growth|reach|engagement)/i,
    /\b2\.4M\b/,
    /\b186K\b/,
    /\b12\.7K\b/,
  ];
  for (const pattern of fabricated) {
    assert.ok(!pattern.test(SHELL), `StudioShell must not contain fabricated metric ${pattern}`);
  }
  assert.ok(SHELL.includes("useMarketplace"), "StudioShell must read real data from MarketplaceContext");
  for (const token of ["trustGateReport", "verifyProduct", "TRUST_STATE"]) {
    assert.ok(SHELL.includes(token), `StudioShell must use the real Trust engine (${token})`);
  }
});

test("every Studio panel is wired to a real existing implementation", () => {
  const realModules = [
    "LunaAssistant",
    "SellView",
    "StudioHub",
    "SellerEngagement",
    "AutoVideoStudio",
    "AvatarStudio",
    "MarketingHub",
    "CampaignBuilder",
    "GrowthOS",
    "AnalyticsDashboard",
    "AutoPilot",
  ];
  for (const mod of realModules) {
    assert.ok(SHELL.includes(mod), `StudioShell must reuse the real ${mod} implementation`);
  }
  assert.ok(!/from\s+["'][^"']*mocks?\//.test(SHELL), "StudioShell must not import from a mock layer");
  assert.ok(!/\bMOCK_|\bFAKE_|\bDUMMY_/.test(SHELL), "StudioShell must not define mock/fake/dummy data");
});

