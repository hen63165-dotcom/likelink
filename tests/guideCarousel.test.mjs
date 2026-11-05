// The saved-post carousel (scripts/marketing/guide-carousel.mjs): every slide
// is Luna's guide as the site shows it at /guide, and the caption keeps the
// site's rules (the disclosure for the affiliate examples, no invented claims).
import test from "node:test";
import assert from "node:assert/strict";
import { slides, caption } from "../scripts/marketing/guide-carousel.mjs";
import { GUIDE, GUIDE_PATH } from "../src/lib/guide.js";

test("the carousel is the guide: a cover, one slide per check in the site's words, and the closing slide", () => {
  const list = slides();
  assert.equal(list.length, GUIDE.checks.length + 2);
  assert.equal(list.length, 10, "Instagram's carousel sweet spot: 10 slides");
  assert.equal(list[0].title, GUIDE.title.he);
  GUIDE.checks.forEach((c, i) => {
    assert.equal(list[i + 1].title, c.title.he);
    assert.equal(list[i + 1].body, c.body.he, "the slide says exactly what /guide says");
  });
  const end = list.at(-1);
  assert.ok(end.link.endsWith(GUIDE_PATH) && !/likelink\.(com|to)/.test(end.link));
  assert.match(end.disclosure, /#פרסומת/);
});

test("the caption asks for the save and the send, names the disclosure and promises nothing", () => {
  const text = caption();
  assert.match(text, /שמרי/);
  assert.match(text, /שלחי לחברה/);
  assert.match(text, /#פרסומת/);
  assert.match(text, /בתגובה הראשונה/);
  assert.doesNotMatch(text, /רוצה" בתגובות|הכי נמכר|ביקורות|כוכבים|מובטח|ויראלי|רק היום|נשארו|₪|\$|הכנסה|להרוויח/);
  assert.ok(text.length <= 2200, "Instagram's caption limit");
});

// The 11.11 edition (the owner, 2026-11-05: trendy, curious, "wow, I want
// that"): five checks in the site's words, real product photos with their
// labels, the disclosure on every slide that shows a product, one keyword.
import { saleSlides, saleCaption, SALE_CHECKS, SALE_PICKS, SALE_KEYWORD, pickPhoto } from "../scripts/marketing/guide-carousel.mjs";
import { guideCheck } from "../src/lib/guide.js";
import { readFileSync } from "node:fs";

const snapshotProducts = () => JSON.parse(readFileSync(new URL("../public/snapshot/kv.json", import.meta.url), "utf8")).keys["marketplace:products"];

test("11.11: every check slide is the guide's own text, and every pick is a listed product with its own photo label", () => {
  const list = saleSlides();
  const checks = list.filter((s) => s.kind === "check");
  assert.equal(checks.length, SALE_CHECKS.length);
  SALE_CHECKS.forEach((id, i) => {
    const c = guideCheck(id);
    assert.ok(c, `${id} is a guide check`);
    assert.equal(checks[i].title, c.title.he);
    assert.equal(checks[i].body, c.body.he);
  });
  const products = new Map(snapshotProducts().map((p) => [p.id, p]));
  for (const pick of SALE_PICKS) {
    const product = products.get(pick.id);
    assert.ok(product, `${pick.id} is in the catalog copy`);
    const title = String(product.displayTitle || product.title);
    for (const word of pick.name.split(/\s+/)) assert.ok(title.includes(word), `"${word}" is in the product's own name: ${title}`);
    const photo = pickPhoto(pick.id);
    assert.ok(photo && photo.label, `${pick.id} has a seller photo with its label`);
    assert.match(photo.label, /המוכר/, "the photo says it is the seller's");
  }
  for (const s of list.filter((x) => x.picks)) assert.match(s.ad, /^#פרסומת · קישור שותפים$/, "a slide with products carries the disclosure");
  assert.match(list.find((s) => s.kind === "picks").note, /לפי המוכר/, "the material is the seller's claim");
});

test("11.11: the caption opens with the disclosure, asks for one keyword and promises nothing", () => {
  const text = saleCaption();
  assert.ok(text.startsWith("#פרסומת · קישור שותפים"));
  assert.equal(text.split(`"${SALE_KEYWORD}"`).length - 1, 1, "one comment keyword, once");
  assert.match(text, /שמרי/);
  assert.match(text, /שלחי לחברה/);
  const own = text.split("\n").filter((line) => !/^\d\. /.test(line)).join("\n");
  assert.doesNotMatch(own, /הכי|נמכר|ביקורות|כוכבים|מובטח|ויראלי|רק היום|נשאר|אחרונ|מהרו|לזמן מוגבל|₪|\$|%|הנחה|הכנסה|להרוויח/);
  assert.ok(text.length <= 2200);
});

// The picks edition: seven listed products, each in its own seller photo.
import { PICKS, picksSlides, picksCaption } from "../scripts/marketing/guide-carousel.mjs";

// The products' names on the site (the live catalog, read 2026-11-05).
const SITE_TITLES = {
  "ae-1005012013972716": "עגילים · נירוסטה · חישוק",
  "ae-1005008660374263": "טבעת · זרקון",
  "ae-1005007805729113": "טבעת · וינטג'",
  "ae-1005012221742613": "שרשרת · תליון · חרוז",
  "ae-1005009695987191": "סגסוגת בסגנון סיני עתיק פרחים אלגנטיים מקל שיער ציצית",
  "ae-1005007171107355": "גומיות שיער צבעוניות בסיסיות",
  "ae-1005006782857610": "איפור מברשות להגדיר עין צל בסיס נשים קוסמטיקה מברשת",
};

test("picks: every name is the site's own words for that product, and a material is the seller's claim", () => {
  assert.equal(new Set(PICKS.map((p) => p.id)).size, PICKS.length, "no product twice");
  for (const p of PICKS) {
    const title = SITE_TITLES[p.id];
    assert.ok(title, `${p.id} is a listed product`);
    for (const word of p.name.split(/\s+/).filter((w) => w !== "·")) assert.ok(title.includes(word), `"${word}" is in ${title}`);
  }
  const list = picksSlides(PICKS, "");
  const picks = list.filter((s) => s.kind === "pick");
  assert.equal(picks.length, PICKS.length);
  for (const s of picks) {
    assert.equal(s.ad, "#פרסומת · קישור שותפים");
    if (/זרקון|נירוסטה|כסף|925|זהב|מואסניט|קריסטל/.test(s.name)) assert.match(s.note, /לפי המוכר/);
  }
  assert.ok(list.length <= 10, "Instagram's carousel limit");
});

test("picks: the caption opens with the disclosure, one keyword, nothing invented", () => {
  const text = picksCaption();
  assert.ok(text.startsWith("#פרסומת · קישור שותפים"));
  assert.equal(text.split('"רוצה"').length - 1, 1);
  assert.match(text, /לפי תיאור המוכר/);
  assert.doesNotMatch(text, /הכי|נמכר|להיט|ביקורות|כוכבים|מובטח|ויראלי|רק היום|נשאר|אחרונ|מהרו|לזמן מוגבל|₪|\$|%|הנחה|הזמנות/);
});

// The "what is LikeLink2" edition: both audiences, only what the site does today.
import { aboutSlides, aboutCaption, ABOUT_KEYWORD } from "../scripts/marketing/guide-carousel.mjs";
import { recruitSafe } from "../src/lib/growth/recruit.js";

test("about: every line passes the recruitment and claim rules, one keyword, it says whose project it is", () => {
  const list = aboutSlides("");
  const lines = list.flatMap((s) => [s.title, s.sub, s.foot, ...(s.lines || []), ...(s.items || [])]).filter(Boolean);
  for (const line of lines) assert.ok(recruitSafe(line), `claim rules: ${line}`);
  const text = aboutCaption();
  for (const line of text.split("\n").filter((l) => !l.startsWith("#"))) assert.ok(recruitSafe(line) || /#פרסומת/.test(line), `caption: ${line}`);
  assert.equal(text.split(`"${ABOUT_KEYWORD}"`).length - 1, 1);
  assert.match(text, /המיזם שלי/);
  assert.match(text, /#פרסומת/);
  assert.doesNotMatch(text, /₪|%|ביקורות|כוכבים|משתמשים|יוצרות כבר/);
  assert.ok(list.length <= 10);
});

// The Hanukkah edition: the season page's checks, then gifts for kids and for her.
import { HANUKKAH_PICKS, HANUKKAH_CHECKS, hanukkahSlides, hanukkahCaption } from "../scripts/marketing/guide-carousel.mjs";
import { saleSeason } from "../src/lib/saleSeason.js";

// The products' names on the site (the live catalog, read 2026-11-05).
const HANUKKAH_TITLES = {
  "ae-1005011587273406": "כדורי לחץ בצורת דבש וגבינה",
  "ae-1005012013972716": "עגילים · נירוסטה · חישוק",
  "ae-1005012814888164": "1A – צעצוע רך ונעים למגע בצורת טופו",
  "p-live-03": "צמיד טניס מואסניט Smyoue מצופה פלטינה",
  "ae-1005009832709994": "סט אביזרי שיער כהה לנשים",
  "ae-1005009384325747": "כדור לחיץ להפגת מתחים",
  "ae-1005013266250549": "גומיות שיער צבעוניות מניילון לנשים וילדות",
};

test("hanukkah: the season page's checks, names in the site's words, a toy carries its age check", () => {
  assert.deepEqual([...HANUKKAH_CHECKS], [...saleSeason("hanukkah-gifts").checks], "the same checks as /hanukkah-gifts");
  assert.equal(new Set(HANUKKAH_PICKS.map((p) => p.id)).size, HANUKKAH_PICKS.length);
  for (const p of HANUKKAH_PICKS) {
    const title = HANUKKAH_TITLES[p.id];
    assert.ok(title, `${p.id} is a listed product`);
    for (const word of p.name.split(/\s+/).filter((w) => w !== "·")) assert.ok(title.includes(word), `"${word}" is in ${title}`);
  }
  const list = hanukkahSlides(HANUKKAH_PICKS, "");
  assert.ok(list.length <= 10, "Instagram's sweet spot");
  for (const s of list.filter((x) => x.kind === "pick")) {
    assert.equal(s.ad, "#פרסומת · קישור שותפים");
    const pick = HANUKKAH_PICKS.find((p) => p.name === s.name);
    if (pick.toy) assert.match(s.note, /גיל/);
    else if (/מואסניט|נירוסטה|זרקון/.test(s.name)) assert.match(s.note, /לפי המוכר/);
  }
  assert.ok(list.at(-1).link.endsWith("/hanukkah-gifts"));
});

test("hanukkah: the caption opens with the disclosure, one keyword, no promise it arrives in time", () => {
  const text = hanukkahCaption();
  assert.ok(text.startsWith("#פרסומת · קישור שותפים"));
  assert.equal(text.split('"רוצה"').length - 1, 1);
  assert.match(text, /גיל ההתאמה/);
  assert.doesNotMatch(text, /יגיע בזמן|מובטח|הכי|נמכר|להיט|ביקורות|כוכבים|ויראלי|רק היום|נשאר|אחרונ|מהרו|₪|\$|%|הנחה/);
});
