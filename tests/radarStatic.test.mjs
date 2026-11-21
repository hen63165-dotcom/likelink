// /radar's first paint (src/lib/growth/radarStatic.js; the owner, 2026-11-19: ChatGPT "checked the
// radar and said it has no differentiation"). AI engines read the HTML without running the app; the
// radar's HTML said only the home page's line. It now carries the radar's own facts — the same ones
// the page shows after it loads — and the one approved sentence, always with "we found" and its date.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RADAR_CLAIM, radarStaticMain, withRadarMain } from "../src/lib/growth/radarStatic.js";

test("the radar's HTML says what it is, how to check it and the dated sentence, without a board", () => {
  const html = radarStaticMain(null);
  assert.match(html, /<h1>רדאר הטרנדים של LikeLink2<\/h1>/);
  assert.match(html, /איך יודעים שזה אמיתי\?/);
  assert.ok(html.includes(RADAR_CLAIM.he) && html.includes(RADAR_CLAIM.en));
  assert.match(RADAR_CLAIM.he, /רדאר טרנדי המוצרים היחיד שמצאנו בעולם/, "product trends, and always 'we found'");
  assert.match(RADAR_CLAIM.en, /only product-trend radar we found/);
  assert.match(html, /לפי בדיקה עולמית מ־20\.11\.2026/);
  assert.match(html, /opentimestamps\.org/);
  assert.match(html, /הקביעה הבאה נחתמת כשכל 4 הסימנים מסכימים/, "a quiet record says what happens next, never a count it does not have");
  assert.doesNotMatch(html, /היחיד בעולם|מבטיח|guarantee/i);
  assert.equal((html.match(/<ol>/g) || []).length, (html.match(/<\/ol>/g) || []).length);
  assert.equal((html.match(/<ul>/g) || []).length, (html.match(/<\/ul>/g) || []).length);
});

test("today's numbers come from the public board only, escaped", () => {
  const sha = "a".repeat(64);
  const html = radarStaticMain({ world: { categories: 564, asked: 120, readToday: 117, withItems: 96, empty: 21, failed: 3, fashionDaily: 48 }, fresh: { tracking: 6000 }, record: { graded: 3, hits: 2 }, ledger: { d: "2026-11-19", sha256: sha },
    receipt: { started: "2026-11-21T14:19:00.000Z", run: { id: "44847192706", url: "https://github.com/hen63165-dotcom/likelink/actions/runs/44847192706" }, sources: { aliexpress: { asked: 900, answered: 850, empty: 40, refused: 6, failed: 4 }, seal: { asked: 20, answered: 20, empty: 0, refused: 0, failed: 0 } } } });
  // Only the counts the run made from real answers (21.11: a store error was counted as "read").
  assert.match(html, /אליאקספרס ענתה על 117 מתוך 120 הקטגוריות שהרדאר שאל \(96 עם מוצרים חדשים\), מתוך 564/);
  assert.match(html, /קבלת הריצה של 21\.11\.2026: הרדאר שלח 900 שאלות, 850 ענו עם נתונים\. היומן הציבורי של הריצה: <a href="https:\/\/github\.com\/hen63165-dotcom\/likelink\/actions\/runs\/44847192706">/);
  assert.doesNotMatch(radarStaticMain({ world: { categories: 564, readToday: 120 } }), /120/, "an old board's count (errors counted as read) is never printed");
  assert.doesNotMatch(html, /564 הקטגוריות בסבב|15 מדינות/, "no fixed claim of what is read");
  assert.match(html, /6,000 מוצרים חדשים במעקב יומי/);
  assert.match(html, /עד היום 3 קביעות קיבלו ציון בפומבי, 2 מהן פגיעות/);
  assert.match(html, /19\.11\.2026 · SHA-256 <span dir="ltr">aaaaaaaaaaaaaaaa…<\/span>/);
  const bad = radarStaticMain({ ledger: { d: "2026-11-19", sha256: "<SCRIPT>x</SCRIPT>" } });
  assert.ok(!bad.includes("SHA-256 <span") && !bad.toLowerCase().includes("<script"), "a malformed seal is never written");
});

test("the shell's first paint swaps its <main>, and the build writes it into /radar only", () => {
  const shell = "<html><body><div id=\"root\"><main><h1>ההמלצות של היוצרים</h1></main></div></body></html>";
  const out = withRadarMain(shell, null);
  assert.doesNotMatch(out, /ההמלצות של היוצרים/);
  assert.match(out, /רדאר הטרנדים של LikeLink2/);
  const build = readFileSync("scripts/prerender-products.mjs", "utf8");
  assert.match(build, /page\.path === "\/radar" \? withRadarMain\(head, radarBoard\) : head/);
  const llms = readFileSync("public/llms.txt", "utf8");
  assert.match(llms, /\/radar/);
  assert.ok(llms.includes(RADAR_CLAIM.en), "AI engines read the same sentence in llms.txt");
});
