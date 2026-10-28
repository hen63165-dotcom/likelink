#!/usr/bin/env node
// Animated character reels from the Studio — runner side (.github/workflows/studio3d.yml).
// The pure rules are in src/lib/growth/animatedReels.js.
//
//   next            the oldest open request in the cloud → GITHUB_OUTPUT product/presenter/request_at/marketer
//   record <status> [reelDir]   READY (with the reel in reelDir) or FAILED → the "studio3d" release + its state
//   feed <dist>     (deploy-frontend.yml) READY reels + media/studio3d/index.json on GitHub Pages
//
// Read-only on the cloud: the products come from its public row (anon key,
// the same read every visitor makes). The reel and the state live in the
// "studio3d" release; nothing is posted and nothing is written to the cloud.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ANIMATED_STATUS as S, animatedPublicIndex, animatedQueue, recordAnimated } from "../../../src/lib/growth/animatedReels.js";
import { cloudProducts } from "../product-video/studio-videos.mjs";

const RELEASE = "studio3d";
const STATE = "studio3d-state.json";
const output = (k, v) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };
const summary = (l) => { console.log(l); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, l + "\n"); };
const readJson = (f, fallback) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return fallback; } };
const gh = (args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function releasedState(dir) {
  mkdirSync(dir, { recursive: true });
  try {
    gh(["release", "download", RELEASE, "-p", STATE, "-D", dir, "--clobber"]);
  } catch { /* no state yet */ }
  return readJson(join(dir, STATE), {});
}

function ensureRelease() {
  try {
    gh(["release", "view", RELEASE]);
  } catch {
    gh(["release", "create", RELEASE, "--prerelease", "--title", "3D studio reels (the Studio)",
      "--notes", "סרטוני אנימציה עם דמות שיוצרות ביקשו בסטודיו. מוצגים רק בסטודיו של היוצרת, לא באתר הציבורי, ולא מתפרסמים מכאן."]);
  }
}

async function next() {
  const products = await cloudProducts();
  const state = releasedState("/tmp/studio3d-queue");
  const [job] = animatedQueue(products, { state });
  if (!job) {
    output("product", "");
    summary("## 3D studio queue\nNo open request.");
    return;
  }
  output("product", job.productId);
  output("presenter", job.presenter);
  output("request_at", job.requestAt);
  output("marketer", job.marketerId);
  summary(`## 3D studio queue\nNext: ${job.productId} with ${job.presenter} (${job.kind}), requested ${job.requestAt}.`);
}

async function record(status, reelDir) {
  const job = {
    productId: process.env.PRODUCT || "",
    presenter: process.env.PRESENTER || "",
    requestAt: process.env.REQUEST_AT || "",
    marketerId: process.env.MARKETER || "",
  };
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(job.productId)) throw new Error("PRODUCT: a product id");
  if (!job.marketerId) {
    // A reel made by hand (run.json or the workflow's inputs) belongs to the product's own studio.
    const product = (await cloudProducts()).find((p) => String(p?.id) === job.productId);
    job.marketerId = String(product?.marketerId || "");
  }
  const dir = "/tmp/studio3d-record";
  const state = releasedState(dir);
  let outcome = { status: S.FAILED, reason: String(process.env.REASON || "the run did not finish").slice(0, 160) };
  if (status === S.READY) {
    const files = existsSync(reelDir || "") ? readdirSync(reelDir) : [];
    const mp4 = files.find((f) => /^[a-z0-9][a-z0-9-]{0,80}\.mp4$/.test(f));
    if (mp4) {
      const id = mp4.replace(/\.mp4$/, "");
      const meta = readJson(join(reelDir, `${id}.json`), {});
      const poster = files.includes(`${id}-preview.jpg`) ? `${id}-preview.jpg` : "";
      ensureRelease();
      gh(["release", "upload", RELEASE, join(reelDir, mp4), ...(poster ? [join(reelDir, poster)] : []), "--clobber"]);
      outcome = { status: S.READY, video: mp4, poster, caption: meta.caption || "", seconds: Number(meta.seconds) };
    } else {
      outcome = { status: S.FAILED, reason: "the reel step made no video" };
    }
  }
  const next = recordAnimated(state, job, outcome);
  writeFileSync(join(dir, STATE), JSON.stringify(next, null, 2));
  ensureRelease();
  gh(["release", "upload", RELEASE, join(dir, STATE), "--clobber"]);
  summary(`3D studio: ${job.productId} → ${outcome.status}${outcome.video ? ` (${outcome.video})` : ""}${outcome.reason ? ` — ${outcome.reason}` : ""}`);
}

/** GitHub Pages: the READY reels (from the release) and the index the Studio reads. */
function feed(dist) {
  const dir = join(dist, "media", "studio3d");
  const index = animatedPublicIndex(releasedState(dir));
  rmSync(join(dir, STATE), { force: true });
  for (const r of index.reels) {
    if (r.status !== S.READY) continue;
    for (const f of [r.video, r.poster].filter(Boolean)) {
      try {
        gh(["release", "download", RELEASE, "-p", f, "-D", dir, "--clobber"]);
      } catch {
        // A missing file is never shown as ready.
        for (const k of ["video", "poster", "caption", "seconds"]) delete r[k];
        r.status = S.FAILED;
        break;
      }
    }
  }
  writeFileSync(join(dir, "index.json"), JSON.stringify(index));
  console.log(`media/studio3d: ${index.reels.filter((r) => r.status === S.READY).length} ready of ${index.reels.length}`);
}

async function main() {
  const [mode, a, b] = process.argv.slice(2);
  if (mode === "next") return next();
  if (mode === "record") return record(a, b);
  if (mode === "feed") return feed(a || "dist");
  throw new Error("usage: queue.mjs next | record READY|FAILED [reelDir] | feed <dist>");
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exitCode = 1; });
