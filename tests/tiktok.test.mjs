// The TikTok engine (src/lib/growth/tiktok.js, scripts/marketing/tiktok-kit.mjs,
// scripts/marketing/tiktok-results.mjs, .github/workflows/tiktok-results.yml):
// posts made only from real products and their real media, the disclosure
// first, Luna labelled as AI, no bait or invented claims; the learning loop
// names nothing below MIN_POSTS and leans on the leader only once two formats
// are measured; the results form takes numbers only and writes only to its
// own branch; the site links to the account only once it exists.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTO_FORMATS, MIN_POSTS, TIKTOK_BIO_MAX, accountKit, bioLink, checksFor, learnTikTok,
  parseResult, postId, selectFormats, tiktokDay, tiktokHashtags, tiktokSafe, tiktokWeek, WEEK_DAYS, SCHEDULE_AT, TIKTOK_FORMATS, israelNoon,
} from "../src/lib/growth/tiktok.js";
import { DROP_AD as DROP_AD_LINE } from "../src/lib/growth/dailyDrop.js";
import { addResult } from "../scripts/marketing/tiktok-results.mjs";
import { inlineLocal, readResults, slideHtml, tiktokPage, weekSection } from "../scripts/marketing/tiktok-kit.mjs";
import { SOCIAL_ACCOUNTS, socialProfiles } from "../src/lib/growth/socialAccounts.js";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const NOW = Date.parse("2026-10-16T06:00:00Z");
const P = (id, extra = {}) => ({ id, title: `צמיד ${id}`, displayTitle: `צמיד ${id}`, description: "צמיד כסף 925 עם אבן מואסניט.", category: "Accessories", ...extra });
const products = [P("p-a"), P("p-b"), P("p-live-02")];
const reels = [
  { productId: "p-a", video: "seller-p-a.mp4", poster: "seller-p-a-cover.jpg", look: "seller", labels: ["צילום המוצר: המוכר"] },
  { productId: "p-b", video: "own-p-b.mp4", look: "real", labels: ["צילום: LikeLink2"] },
  { productId: "p-b", video: "seller-p-b.mp4", look: "seller", labels: [] },
  { productId: "p-live-02", video: "seller-p-live-02.mp4", look: "seller", labels: [] }, // SELLER_SKIP: shows another item
  { productId: "p-a", video: "tip.mp4", look: "talking", title: "איך יודעים מידת טבעת לפני שמזמינים", labels: ["דמות וקול שנוצרו בבינה מלאכותית"], createdAt: 2 },
  { productId: "p-gone", video: "x.mp4", look: "seller" }, // not a listed product
];
const imageOf = (p) => `../looks/${p.id}.jpg`;

test("a day of TikToks: real products, their real media, disclosure first, Luna labelled as AI, every line clean", () => {
  for (let d = 0; d < 10; d++) {
    const day = tiktokDay({ products, reels, now: NOW + d * 86_400_000, imageOf });
    assert.ok(day.posts.length >= 2, `day ${d}: two posts and the bonus`);
    for (const post of day.posts) {
      assert.ok(products.some((p) => p.id === post.product.id), "a listed product");
      assert.ok(post.caption.startsWith("#פרסומת · קישור שותפים\n"), "the disclosure opens the caption");
      for (const line of post.lines.filter((l) => l !== DROP_AD_LINE)) assert.ok(tiktokSafe(line), `${post.id}: ${line}`);
      assert.match(post.product.link, /utm_source=tiktok&utm_medium=social&utm_campaign=tt-/);
      assert.ok(post.hashtags.length >= 3 && post.hashtags.length <= 5 && post.hashtags.includes("#LikeLink2"));
      assert.ok(post.steps.some((s) => s.includes("גילוי תוכן הפוסט")), "TikTok's own disclosure switch, every post");
      if (post.video) {
        assert.notEqual(post.video.file, "seller-p-live-02.mp4", "a seller clip of another item never posts");
        assert.notEqual(post.video.file, "x.mp4");
        if (post.format === "luna_tip") {
          assert.equal(post.aiLabel, true);
          assert.ok(post.steps.some((s) => s.includes("תוכן שנוצר ב-AI")));
          assert.match(post.caption, /לונה היא דמות AI/);
        } else {
          assert.notEqual(post.video.look, "talking", "Luna never stands in for a product video");
        }
        if (post.product.id === "p-b") assert.equal(post.video.look, "real", "a person's own footage first");
      }
      if (post.format === "checklist") {
        assert.equal(post.slides.length, 5);
        assert.ok(post.slides.every((s) => s.image === `../looks/${post.product.id}.jpg`), "the product's own clean image");
      }
    }
  }
});

test("hooks never promise what the video doesn't show, and the bait/claim words stay out", () => {
  for (const bad of ["לייק אם אהבתם", "ניסיתי וזה מושלם", "הכי שווה", "רק היום", "מבצע", "₪99", "ויראלי"]) assert.equal(tiktokSafe(bad), false, bad);
  const day = tiktokDay({ products, reels, now: NOW, imageOf });
  assert.ok(day.posts.every((p) => !/קופסה/.test(p.hook)), "no box the video never opens");
  const lunaDay = Array.from({ length: 6 }, (_, d) => tiktokDay({ products, reels, now: NOW + d * 86_400_000, imageOf })).flatMap((x) => x.posts).find((p) => p.format === "luna_tip");
  assert.equal(lunaDay.hook, "איך יודעים מידת טבעת לפני שמזמינים", "a Luna tip opens with the tip's own topic");
  assert.ok(checksFor(P("x", { description: "" })).every((c) => tiktokSafe(c.title) && tiktokSafe(c.body)), "sale/discount talk stays in the guide only");
  assert.deepEqual(tiktokHashtags(P("y", { category: "Gaming" })).slice(0, 2), ["#גיימינג", "#גיימר"], "every category gets its own tags");
});

test("the engine learns only from logged results: nothing named below MIN_POSTS, a leader only between two measured formats", () => {
  const r = (n, format, views) => ({ id: postId(NOW - n * 86_400_000, 1, format), views });
  assert.equal(learnTikTok([r(1, "reveal", 5000)]).leader, null);
  assert.equal(learnTikTok([r(1, "reveal", 5000)]).formats.find((f) => f.format === "reveal").status, "INSUFFICIENT_EVIDENCE");
  const some = [r(1, "reveal", 900), r(2, "reveal", 1200), r(3, "reveal", 1500), r(4, "would_you", 100), r(5, "would_you", 300), r(6, "would_you", 200)];
  const learning = learnTikTok(some);
  assert.equal(learning.leader, "reveal");
  assert.equal(learning.formats.find((f) => f.format === "reveal").medianViews, 1200);
  assert.equal(learnTikTok([...some, { ...some[0], views: 1 }]).posts, 6, "a post logged twice counts once (latest)");
  assert.equal(learnTikTok([{ id: "tt-x", views: 9 }, { id: "tt-20261016-1-nope", views: 9 }]).posts, 0, "unknown ids are ignored");
  // Exploring first, then the leader keeps a slot every day.
  const fresh = selectFormats(learnTikTok([]), AUTO_FORMATS, { now: NOW });
  assert.equal(fresh.length, 2);
  assert.notDeepEqual(fresh, selectFormats(learnTikTok([]), AUTO_FORMATS, { now: NOW + 86_400_000 }), "the exploration rotates daily");
  for (let d = 0; d < 5; d++) assert.equal(selectFormats(learning, AUTO_FORMATS, { now: NOW + d * 86_400_000 })[0], "reveal");
  assert.ok(!AUTO_FORMATS.includes("green_screen"), "a format the owner films is a bonus, never a daily slot");
  assert.equal(MIN_POSTS, 3);
});

test("the results form takes a known post id and whole numbers only", () => {
  assert.equal(parseResult({ id: "tt-20261016-1-reveal", views: "1,200", likes: "80" }).ok, true);
  assert.equal(parseResult({ id: "tt-20261016-1-reveal", views: "1,200" }).entry.views, 1200);
  for (const bad of [{ id: "x", views: 1 }, { id: "tt-20261016-1-reveal", views: "-3" }, { id: "tt-20261016-1-reveal", views: "12; rm -rf /" }, { id: "tt-20261016-1-reveal", views: "1e9" }]) {
    assert.equal(parseResult(bad, { now: NOW }).ok, false, JSON.stringify(bad));
  }
  // A mistyped date never becomes a result: not a calendar day, in the future, or older than the plans.
  for (const id of ["tt-20261332-1-reveal", "tt-20260230-1-reveal", "tt-20261020-1-reveal", "tt-20250101-1-reveal"]) {
    assert.equal(parseResult({ id, views: "10" }, { now: NOW }).ok, false, id);
  }
  assert.equal(parseResult({ id: "tt-20261017-1-reveal", views: "10" }, { now: NOW }).ok, true, "Israel's date may be a day ahead of UTC");
  const once = addResult([], { id: "tt-20261016-1-reveal", views: "10" }, { now: NOW }).list;
  const twice = addResult(once, { id: "tt-20261016-1-reveal", views: "50" }, { now: NOW }).list;
  assert.equal(twice.length, 1);
  assert.equal(twice[0].views, 50);
});

test("an unreadable results file stops the save instead of starting the list over", () => {
  const dir = mkdtempSync(join(tmpdir(), "tt-results-"));
  const run = (inFile) => spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/marketing/tiktok-results.mjs", import.meta.url)), inFile, join(dir, "out.json")], {
    env: { ...process.env, POST_ID: postId(Date.now(), 1, "reveal"), VIEWS: "10" }, encoding: "utf8",
  });
  writeFileSync(join(dir, "bad.json"), "{ not json");
  const bad = run(join(dir, "bad.json"));
  assert.equal(bad.status, 1);
  assert.equal(existsSync(join(dir, "out.json")), false, "nothing written over the stored results");
  writeFileSync(join(dir, "obj.json"), "{}");
  assert.equal(run(join(dir, "obj.json")).status, 1, "a file that is not a list stops too");
  const fresh = run(join(dir, "missing.json"));
  assert.equal(fresh.status, 0, fresh.stdout + fresh.stderr);
  assert.equal(JSON.parse(readFileSync(join(dir, "out.json"), "utf8")).length, 1, "no file yet = the first result");
});

test("the results workflow passes the form through the environment and writes only to ops/tiktok", () => {
  const wf = read(".github/workflows/tiktok-results.yml");
  for (const run of wf.split(/\n\s+run: \|/).slice(1)) assert.doesNotMatch(run.split(/\n\s{6}- name:/)[0], /\$\{\{\s*inputs\./, "no form field inside a shell line");
  const pushes = wf.match(/git [^\n]*\bpush -q[^\n]*/g) || [];
  assert.ok(pushes.length >= 1 && pushes.every((p) => /push -q origin HEAD:ops\/tiktok(;|$)/.test(p)), "every push goes to ops/tiktok only");
  assert.match(wf, /for attempt in 1 2 3 4 5; do[\s\S]*git fetch -q --depth=1 origin \+ops\/tiktok:refs\/remotes\/origin\/ops\/tiktok[\s\S]*tiktok-results\.mjs[\s\S]*push -q origin HEAD:ops\/tiktok/, "a refused push reads the branch again and re-applies the result");
  assert.doesNotMatch(wf, /git (checkout|show|worktree)[^\n]*FETCH_HEAD/, "checkout's FETCH_HEAD is main's: never branch from it");
  const deploy = read(".github/workflows/deploy-frontend.yml");
  assert.match(deploy, /"TikTok results"\]/, "a logged result rebuilds the page");
  assert.match(deploy, /node scripts\/marketing\/tiktok-kit\.mjs dist/);
});

test("the account kit and the page: the owner opens the account; the bio fits, discloses and links to the video feed", () => {
  const a = accountKit();
  assert.ok(a.bio.length <= TIKTOK_BIO_MAX && a.bio.includes("#פרסומת"));
  assert.equal(a.link, bioLink());
  assert.match(a.link, /^https:\/\/likelink2\.vercel\.app\/reels\?utm_source=tiktok&utm_medium=bio$/);
  const day = tiktokDay({ products, reels, now: NOW, imageOf });
  const html = tiktokPage(day);
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  // The owner opened @likelink herself (2026-10-16): the page names it and links to it instead of the opening steps.
  assert.match(html, /<summary>החשבון: <span dir="ltr">@likelink<\/span><\/summary>/);
  assert.match(html, /href="https:\/\/www\.tiktok\.com\/@likelink"/);
  assert.doesNotMatch(html, /נרשמים עם הטלפון או המייל שלך/, "no sign-up steps for an account that exists");
  assert.doesNotMatch(html, /התפרסם|פורסם בהצלחה|PUBLISHED/, "nothing claims a post went out");
  const slide = slideHtml({ text: "כותרת", image: "data:image/png;base64,AA" }, { index: 0, total: 5, base: "file:///x/" });
  assert.match(slide, /#פרסומת · קישור שותפים/);
  assert.equal(inlineLocal("../../../etc/passwd.jpg", "/tmp/a/dist/tiktok"), "", "never reads outside the build");
  assert.equal(inlineLocal("https://cdn.example/x.jpg", "/tmp/dist/tiktok"), "https://cdn.example/x.jpg");
});

test("the site links to our TikTok only once the account exists, in the footer and Google's sameAs alike", () => {
  assert.deepEqual(socialProfiles({ tiktok: { ...SOCIAL_ACCOUNTS.tiktok, handle: "" } }), [], "no handle → no link to a page that isn't there");
  assert.deepEqual(socialProfiles().map((a) => a.url), ["https://www.tiktok.com/@likelink"], "the account the owner opened (2026-10-16)");
  const withHandle = socialProfiles({ tiktok: { ...SOCIAL_ACCOUNTS.tiktok, handle: "likelink2" } });
  assert.deepEqual(withHandle.map((a) => a.url), ["https://www.tiktok.com/@likelink2"]);
  assert.deepEqual(socialProfiles({ tiktok: { ...SOCIAL_ACCOUNTS.tiktok, handle: "bad handle/../" } }), []);
  const html = read("index.html");
  const sameAs = JSON.parse(html.match(/"sameAs":\s*(\[[^\]]*\])/)[1]);
  assert.deepEqual(sameAs, socialProfiles().map((a) => a.url), "index.html sameAs = the accounts that exist");
  assert.match(read("src/components/discover/PublicShell.jsx"), /\{socialProfiles\(\)\.length \? \(/);
});

test("the week ahead: ready-made posts from tomorrow, each with its own day in its id, at the suggested times, for TikTok Studio", () => {
  const week = tiktokWeek({ products, reels, now: NOW, imageOf });
  assert.equal(week.length, WEEK_DAYS);
  assert.equal(week[0].date, "2026-10-17", "starts tomorrow; today's posts are on the page above");
  const ids = new Set();
  for (const d of week) {
    for (const p of d.posts) {
      assert.ok(!TIKTOK_FORMATS[p.format].owner, "a post the owner films is never scheduled ahead");
      assert.ok(SCHEDULE_AT.includes(p.at));
      assert.equal(p.id.slice(3, 11), d.date.replace(/-/g, ""), "the id carries the day it posts");
      assert.ok(!ids.has(p.id)); ids.add(p.id);
      assert.ok(p.caption.startsWith("#פרסומת · קישור שותפים\n"));
    }
  }
  const html = weekSection(week, { slides: {} });
  assert.match(html, /TikTok Studio/);
  assert.match(html, /עד 10 ימים מראש/);
  assert.match(html, /תוכן ממותג/, "the branded-content switch on every scheduled post");
  assert.equal(weekSection([], { slides: {} }), "");
  assert.match(tiktokPage(tiktokDay({ products, reels, now: NOW, imageOf }), { slides: {}, profile: "" }, week), /id="week"/);
});

test("the week follows the owner's calendar in Israel: right after Israeli midnight, and across the end of daylight saving", () => {
  assert.equal(new Date(israelNoon(Date.parse("2026-07-01T21:30:00Z"))).toISOString(), "2026-07-02T12:00:00.000Z", "00:30 in Israel is already July 2");
  assert.equal(new Date(israelNoon(Date.parse("2026-07-01T20:30:00Z"))).toISOString(), "2026-07-01T12:00:00.000Z");
  assert.equal(new Date(israelNoon(Date.parse("2026-12-01T22:30:00Z"))).toISOString(), "2026-12-02T12:00:00.000Z", "winter: UTC+2");
  const nearMidnight = tiktokWeek({ products, reels, now: Date.parse("2026-07-01T21:30:00Z"), imageOf });
  assert.equal(nearMidnight[0].date, "2026-07-03", "tomorrow in Israel, not tomorrow in UTC");
  const acrossDst = tiktokWeek({ products, reels, now: Date.parse("2026-10-22T22:30:00Z"), imageOf }); // Israel: Fri 23 Oct 01:30; clocks go back on 25 Oct
  assert.deepEqual(acrossDst.map((d) => d.date), ["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]);
  for (const d of acrossDst) for (const p of d.posts) assert.equal(p.id.slice(3, 11), d.date.replace(/-/g, ""));
});

test("a week post whose slides could not be rendered still carries its slides' text and the product picture", () => {
  const week = tiktokWeek({ products, reels, now: NOW, imageOf });
  const checklist = week.flatMap((d) => d.posts).find((p) => p.format === "checklist");
  assert.ok(checklist, "the week has a carousel");
  const html = weekSection([{ date: "2026-10-17", posts: [checklist] }], { slides: {} });
  for (const s of checklist.slides) assert.ok(html.includes(s.text.replace(/&/g, "&amp;").replace(/</g, "&lt;")), s.text);
  assert.match(html, /התמונה של המוצר/);
  const rendered = weekSection([{ date: "2026-10-17", posts: [checklist] }], { slides: { [checklist.id]: ["a.png", "b.png"] } });
  assert.match(rendered, /slides\/a\.png/);
  assert.doesNotMatch(rendered, /התמונה של המוצר/, "rendered slides are the download");
});

test("the results file: none yet is an empty list, a broken one stops the kit, and submissions queue instead of replacing each other", () => {
  assert.deepEqual(readResults(undefined), []);
  assert.deepEqual(readResults("/no/such/file.json"), []);
  const dir = mkdtempSync(join(tmpdir(), "tt-kit-"));
  writeFileSync(join(dir, "bad.json"), "{ nope");
  assert.throws(() => readResults(join(dir, "bad.json")));
  writeFileSync(join(dir, "obj.json"), "{}");
  assert.throws(() => readResults(join(dir, "obj.json")), /not a list/);
  writeFileSync(join(dir, "ok.json"), JSON.stringify([{ id: "tt-20261016-1-reveal", views: 3 }]));
  assert.equal(readResults(join(dir, "ok.json")).length, 1);
  assert.match(read(".github/workflows/tiktok-results.yml"), /concurrency:\n\s+group: tiktok-results\n\s+queue: max\n\s+cancel-in-progress: false/);
});
