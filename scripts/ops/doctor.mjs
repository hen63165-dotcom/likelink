#!/usr/bin/env node
// LikeLink2 ops doctor: one low-cost pass over production that says what is
// wrong and whose move it is. The skill .claude/skills/likelink-ops/SKILL.md
// explains how to act on each kind.
//
//   npm run ops:doctor                 human-readable report, exit 0
//   npm run ops:doctor -- --json       the same as JSON
//   npm run ops:doctor -- --strict     exit 1 when an APP_DEFECT is found
//   ORIGIN=<url> npm run ops:doctor    another host (a Netlify preview, a local preview)
//   VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (public values) enable the cloud checks.
//
// Kinds: OK · APP_DEFECT (code or data in this repo can fix it) · PROVIDER_LIMIT
// (Supabase/Vercel refuse: quota, billing, outage) · MISSING_CREDENTIAL (a secret
// or permission the owner must add) · EXTERNAL_ACTION (a step outside the code,
// e.g. repointing the route) · NOT_TESTED.
//
// Every request is a GET. Media use Range bytes=0-1023, never whole files
// (Supabase egress is the tightest quota; CLAUDE.md). Nothing is written and
// no key value is ever printed.
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { LOOKS, lookFile } from "../../src/lib/looks.js";
import { SELLER_SKIP } from "../../src/lib/reelsFeed.js";
import { resolveCloud } from "../../src/constants/cloud.js";

export const KIND = Object.freeze({ OK: "OK", APP_DEFECT: "APP_DEFECT", PROVIDER_LIMIT: "PROVIDER_LIMIT", MISSING_CREDENTIAL: "MISSING_CREDENTIAL", EXTERNAL_ACTION: "EXTERNAL_ACTION", NOT_TESTED: "NOT_TESTED" });
export const ROUTES = Object.freeze(["/", "/products", "/reels", "/search?q=test", "/studio", "/size", "/guide", "/deals"]);
const STALE_SNAPSHOT_DAYS = 14;
const AFFILIATE_HOST = /^https:\/\/(s\.click\.aliexpress\.com|([a-z0-9-]+\.)*aliexpress\.(com|us|ru)|a\.aliexpress\.com)\//i;

const r = (kind, area, name, detail = "", action = "") => ({ kind, area, name, detail: String(detail).slice(0, 200), action });

/** A Supabase (or site API) answer → kind. 402 is the provider refusing (quota/billing), never our code. */
export function classifyCloud(status, body = "", what = "cloud") {
  const violation = (String(body).match(/exceed_[a-z_]+/) || [])[0] || "";
  if (status === 200 || status === 204) return r(KIND.OK, "cloud", what, `http_${status}`);
  if (status === 401 || status === 403) return r(KIND.OK, "cloud", what, `http_${status} (reachable; access rules apply)`);
  if (status === 402) return r(KIND.PROVIDER_LIMIT, "cloud", what, `http_402 ${violation || "restricted"}`, "Supabase restricted the project: wait for the billing-cycle reset or raise the plan/spend cap (dashboard → Usage); the code serves the shipped catalog copy meanwhile");
  if (status === 429) return r(KIND.PROVIDER_LIMIT, "cloud", what, "http_429 rate limited", "back off; the site's breaker already does");
  if (status >= 500 || status === 0) return r(KIND.PROVIDER_LIMIT, "cloud", what, status ? `http_${status}` : "unreachable", "provider outage or network: re-run later");
  return r(KIND.APP_DEFECT, "cloud", what, `http_${status}`, "unexpected answer: check the request path/headers in the code");
}

/** The shipped catalog copy: freshness, purchase links, prices. Pure. */
export function checkSnapshot(doc, now = Date.now()) {
  const out = [];
  const keys = doc?.keys || {};
  const rows = (k) => { const v = keys[k]; try { return typeof v === "string" ? JSON.parse(v) : Array.isArray(v) ? v : []; } catch { return []; } };
  const products = rows("marketplace:products");
  const age = (now - Date.parse(doc?.takenAt || "")) / 86_400_000;
  out.push(Number.isFinite(age) && age <= STALE_SNAPSHOT_DAYS
    ? r(KIND.OK, "data", "catalog copy fresh", `${Math.floor(age)} days old, ${products.length} products`)
    : r(KIND.EXTERNAL_ACTION, "data", "catalog copy fresh", Number.isFinite(age) ? `${Math.floor(age)} days old` : "no takenAt", "refresh public/snapshot/kv.json (Actions → Catalog sync, or SQL while the API is down)"));
  if (!products.length) out.push(r(KIND.APP_DEFECT, "data", "catalog copy has products", "0 products", "the public site would be empty while the cloud is down"));
  const links = products.map((p) => String(p.affiliateUrl || ""));
  const bad = products.filter((p, i) => !AFFILIATE_HOST.test(links[i])).map((p) => p.id);
  const shared = products.filter((p, i) => links[i] && links.indexOf(links[i]) !== i).map((p) => p.id);
  out.push(bad.length || shared.length
    ? r(KIND.APP_DEFECT, "commerce", "every product has its own store link", `${bad.length ? `not a store link: ${bad.join(",")} ` : ""}${shared.length ? `shared: ${shared.join(",")}` : ""}`, "fix the product's affiliateUrl in the catalog")
    : r(KIND.OK, "commerce", "every product has its own store link", `${products.length} links`));
  const priced = products.filter((p) => p.priceSource === "aliexpress_api").length;
  const unverified = products.filter((p) => Number(p.price) > 0 && p.priceSource !== "aliexpress_api").map((p) => p.id);
  if (unverified.length) out.push(r(KIND.APP_DEFECT, "commerce", "no unverified price is shown as a price", unverified.join(","), "move hand-entered prices to catalogPrice"));
  out.push(priced
    ? r(KIND.OK, "commerce", "store prices", `${priced}/${products.length} from the AliExpress API`)
    : r(KIND.MISSING_CREDENTIAL, "commerce", "store prices", `0/${products.length} from the AliExpress API (pages say "המחיר המעודכן בחנות")`, "add repo secrets ALIEXPRESS_APP_KEY, ALIEXPRESS_APP_SECRET, ALIEXPRESS_TRACKING_ID, then Actions → Catalog sync"));
  return out;
}

/** The reels feed document: no clip that shows another item. Pure. */
export function checkFeedDoc(doc) {
  const reels = Array.isArray(doc?.reels) ? doc.reels : [];
  const wrong = reels.filter((e) => e?.look === "seller" && SELLER_SKIP[e.productId]).map((e) => e.id);
  return [
    wrong.length
      ? r(KIND.APP_DEFECT, "media", "no seller clip of another item", wrong.join(","), "re-run deploy-frontend (scripts/reels-feed.mjs applies SELLER_SKIP)")
      : r(KIND.OK, "media", "no seller clip of another item", `${reels.length} reels`),
  ];
}

/** Live commit vs main. `git` is (args) => stdout, or null when there is no checkout. */
export function compareRevision(live, mainSha, sameTree) {
  if (!live) return r(KIND.NOT_TESTED, "deploy", "live revision", "no /version.json (the build predates it)", "");
  if (!mainSha) return r(KIND.NOT_TESTED, "deploy", "live revision", `live ${live.slice(0, 7)}; main unknown (no git checkout)`);
  if (live === mainSha || sameTree) return r(KIND.OK, "deploy", "live revision", `live ${live.slice(0, 7)} = main${live === mainSha ? "" : " (same tree)"}`);
  return r(KIND.EXTERNAL_ACTION, "deploy", "live revision", `live ${live.slice(0, 7)}, main ${mainSha.slice(0, 7)}`, "point the Vercel route serve-current-build at the Netlify preview built from main (skill likelink-ops)");
}

function gitRunner() {
  return (args) => { try { return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } };
}

export async function runDoctor({ origin = "https://likelink2.vercel.app", supabaseUrl = "", anonKey = "", fetchImpl = fetch, git = gitRunner(), now = Date.now() } = {}) {
  const base = origin.replace(/\/+$/, "");
  const get = async (url, headers = {}) => {
    try {
      const res = await fetchImpl(url, { headers, redirect: "manual", signal: AbortSignal.timeout(15_000) });
      return { status: res.status, type: res.headers.get("content-type") || "", text: () => res.text(), json: () => res.json() };
    } catch (e) {
      return { status: 0, type: "", error: String(e?.message || e).slice(0, 120), text: async () => "", json: async () => null };
    }
  };
  const out = [];

  // Routes: the shell answers on every public path.
  for (const path of ROUTES) {
    const res = await get(`${base}${path}`);
    const html = res.status === 200 ? await res.text() : "";
    out.push(res.status === 200 && html.includes('id="root"')
      ? r(KIND.OK, "routes", path, "200")
      : r(res.status ? KIND.APP_DEFECT : KIND.PROVIDER_LIMIT, "routes", path, res.status ? `http_${res.status}` : res.error, res.status ? "check _redirects / the SPA rewrites" : "host unreachable"));
  }

  // Revision.
  const ver = await get(`${base}/version.json`);
  const info = ver.status === 200 && ver.type.includes("json") ? await ver.json().catch(() => null) : null;
  const mainSha = git?.(["rev-parse", "origin/main"]) || git?.(["rev-parse", "HEAD"]) || "";
  const live = info?.commit || "";
  const sameTree = Boolean(live && mainSha && git?.(["rev-parse", `${live}^{tree}`]) && git(["rev-parse", `${live}^{tree}`]) === git(["rev-parse", `${mainSha}^{tree}`]));
  out.push(compareRevision(live, mainSha, sameTree));

  // Catalog copy (what the site shows while the cloud is down).
  const snap = await get(`${base}/snapshot/kv.json`);
  const doc = snap.status === 200 ? await snap.json().catch(() => null) : null;
  out.push(...(doc ? checkSnapshot(doc, now) : [r(KIND.APP_DEFECT, "data", "catalog copy served", `http_${snap.status}`, "public/snapshot/kv.json must ship with the build")]));

  // Media: the reels feed and the clean images, each read for its first KB only.
  const feedRes = await get(`${base}/media/reels/index.json`);
  const feed = feedRes.status === 200 && feedRes.type.includes("json") ? await feedRes.json().catch(() => null) : null;
  if (feed) {
    out.push(...checkFeedDoc(feed));
    const broken = [];
    for (const e of (feed.reels || []).slice(0, 20)) {
      for (const [file, want] of [[e.video, "video/"], [e.poster, "image/"]]) {
        if (!file) continue;
        const m = await get(`${base}/media/reels/${file}`, { Range: "bytes=0-1023" });
        if (!(m.status === 206 || m.status === 200) || !m.type.startsWith(want)) broken.push(`${file}:${m.status}`);
      }
    }
    out.push(broken.length ? r(KIND.APP_DEFECT, "media", "every reel and cover plays", broken.join(" "), "re-run deploy-frontend; check the reels/luna-reels releases") : r(KIND.OK, "media", "every reel and cover plays", `${(feed.reels || []).length} reels`));
  } else {
    out.push(r(KIND.APP_DEFECT, "media", "reels feed served", `http_${feedRes.status} ${feedRes.type || ""}`.trim(), "check the /media/reels/* proxy in public/_redirects and the GitHub Pages deploy"));
  }
  const looks = [];
  for (const id of Object.keys(LOOKS)) {
    const m = await get(`${base}/looks/${lookFile(id)}`, { Range: "bytes=0-1023" });
    if (!(m.status === 206 || m.status === 200) || !m.type.startsWith("image/")) looks.push(`${id}:${m.status}`);
  }
  out.push(looks.length ? r(KIND.APP_DEFECT, "media", "clean product images ship with the site", looks.join(" "), "public/looks/*.jpg") : r(KIND.OK, "media", "clean product images ship with the site", `${Object.keys(LOOKS).length} images`));

  // Cloud: the database, sign-in, and the site's own API.
  if (supabaseUrl && anonKey) {
    const h = { apikey: anonKey };
    const db = await get(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/kv?select=key&key=eq.marketplace:products`, h);
    out.push(classifyCloud(db.status, db.status ? await db.text().catch(() => "") : "", "database (kv read)"));
    const auth = await get(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/health`, h);
    const a = classifyCloud(auth.status, auth.status ? await auth.text().catch(() => "") : "", "sign-up / login (auth)");
    if (a.kind === KIND.PROVIDER_LIMIT) a.detail += " · Studio sign-up and login cannot work until this clears";
    out.push(a);
  } else {
    out.push(r(KIND.NOT_TESTED, "cloud", "database and sign-in", "set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY to test"));
  }
  const api = await get(`${base}/api/autopilot?mode=status`, { Origin: base });
  // A 200 with the SPA's HTML is the host's fallback page, not the API answering.
  out.push(api.status === 200 && !api.type.includes("json")
    ? r(KIND.NOT_TESTED, "cloud", "site API (/api)", `http_200 ${api.type || "no type"}: no API on this host`, "")
    : classifyCloud(api.status, api.status ? await api.text().catch(() => "") : "", "site API (/api)"));
  // The owner's AliExpress affiliate account as the live API sees it (a boolean; the
  // Studio's "בדיקת הקישור" reads Hebrew titles and ₪ prices through it).
  const ae = await get(`${base}/api/store?mode=growth-engine&op=affiliate-status`, { Origin: base });
  const aeBody = ae.status === 200 && ae.type.includes("json") ? await ae.json().catch(() => null) : null;
  out.push(!aeBody
    ? r(KIND.NOT_TESTED, "commerce", "AliExpress account on the site API", ae.status ? `http_${ae.status}` : ae.error || "no answer", "")
    : aeBody.configured === true
      ? r(KIND.OK, "commerce", "AliExpress account on the site API", "connected: the Studio's link check reads the store's Hebrew title, photos and ₪ price")
      : r(KIND.MISSING_CREDENTIAL, "commerce", "AliExpress account on the site API", "not connected: the Studio's link check falls back to the store page (no price, foreign-language title)",
        "Supabase project vjitiuirqfysexsxdxqx (org LikeLink2) → Edge Functions → Secrets: ALIEXPRESS_APP_KEY, ALIEXPRESS_APP_SECRET, ALIEXPRESS_TRACKING_ID (exact names; the old project sbzzgfthgaurgcuxiuql is retired)"));
  return out;
}

export function render(results) {
  const order = [KIND.APP_DEFECT, KIND.PROVIDER_LIMIT, KIND.MISSING_CREDENTIAL, KIND.EXTERNAL_ACTION, KIND.NOT_TESTED, KIND.OK];
  const lines = [...results].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)).map((x) => `[${x.kind}] ${x.area} :: ${x.name}${x.detail ? ` — ${x.detail}` : ""}${x.action ? `\n      → ${x.action}` : ""}`);
  const counts = order.map((k) => `${k} ${results.filter((x) => x.kind === k).length}`).join(" · ");
  return `${lines.join("\n")}\n\n${counts}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = new Set(process.argv.slice(2));
  const origin = process.env.ORIGIN || "https://likelink2.vercel.app";
  const cloud = resolveCloud(process.env.VITE_SUPABASE_URL || "", process.env.VITE_SUPABASE_ANON_KEY || "");
  const results = await runDoctor({ origin, supabaseUrl: cloud.url, anonKey: cloud.anonKey });
  const text = render(results);
  console.log(args.has("--json") ? JSON.stringify({ origin, results }, null, 1) : `LikeLink2 ops doctor — ${origin}\n\n${text}`);
  if (args.has("--summary") && process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Ops doctor — ${origin}\n\n\`\`\`\n${text}\n\`\`\`\n`);
  if (args.has("--strict") && results.some((x) => x.kind === KIND.APP_DEFECT)) process.exit(1);
}
