#!/usr/bin/env node
// Runs a LikeLink skills workflow (src/lib/skills) over the real catalog copy
// and the reels feed, and writes the record the /status page shows.
//
//   node scripts/skills/run.mjs                      catalog-health → dist/ops/skills.json (when dist/ exists)
//   node scripts/skills/run.mjs --summary            + the GitHub job summary
//   node scripts/skills/run.mjs --out <file> --feed <url|file|none> --snapshot <file>
//
// Run by postbuild (every build, on Netlify/CI/GitHub Pages) and by Actions →
// "Ops doctor". Reads only public data; writes only the record. A stage that
// already finished with the same input in the previous record (--previous,
// default: the --out file) is reused, not run again.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { CATALOG_GRANTS, CATALOG_HEALTH, ensureCatalogSkills } from "../../src/lib/skills/catalog.js";
import { listSkills, runWorkflow } from "../../src/lib/skills/runtime.js";
import { REELS_FEED_HOME } from "../../src/lib/reelsFeed.js";
import { versionInfo } from "../write-version.mjs";

const WORKFLOWS = { "catalog-health": CATALOG_HEALTH };

function arg(name, fallback = "") {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
}

const rows = (doc, key) => {
  const v = doc?.keys?.[key];
  try { return typeof v === "string" ? JSON.parse(v) : Array.isArray(v) ? v : []; } catch { return []; }
};

/** The feed's reel entries, or null when it cannot be read (the media stage then says so). */
export async function readFeed(where, fetchImpl = fetch) {
  if (!where || where === "none") return null;
  try {
    if (!/^https?:/.test(where)) return JSON.parse(readFileSync(where, "utf8")).reels || null;
    const res = await fetchImpl(where, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const doc = await res.json();
    return Array.isArray(doc?.reels) ? doc.reels : null;
  } catch {
    return null;
  }
}

export async function runCatalogHealth({ snapshot, reels, previous = null, now = Date.now() }) {
  ensureCatalogSkills();
  const input = { products: rows(snapshot, "marketplace:products"), marketers: rows(snapshot, "marketplace:marketers"), reels };
  const record = await runWorkflow({ name: "catalog-health", steps: WORKFLOWS["catalog-health"], input, previous, ctx: { grants: [...CATALOG_GRANTS], now: () => now } });
  return { generatedAt: new Date(now).toISOString(), snapshotTakenAt: snapshot?.takenAt || null, build: versionInfo(process.env, new Date(now)), skills: listSkills(), ...record };
}

function summarize(doc) {
  const lines = doc.stages.map((s) => `- ${s.skill}: ${s.status}${s.resumed ? " (reused)" : ""} · ${s.processed ?? 0} processed · ${s.errorCount ?? 0} issues${s.blockedBy ? ` · needs: ${s.blockedBy}` : ""}${s.reason ? ` · ${s.reason}` : ""}`);
  return `catalog-health: ${doc.status}\n${lines.join("\n")}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const name = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "catalog-health";
  if (!WORKFLOWS[name]) {
    console.error(`skills: unknown workflow ${name}`);
    process.exit(2);
  }
  const out = arg("--out", existsSync("dist") ? "dist/ops/skills.json" : "");
  const snapshotPath = arg("--snapshot", existsSync("dist/snapshot/kv.json") ? "dist/snapshot/kv.json" : "public/snapshot/kv.json");
  const prevPath = arg("--previous", out);
  let previous = null;
  try { previous = prevPath && existsSync(prevPath) ? JSON.parse(readFileSync(prevPath, "utf8")) : null; } catch { previous = null; }
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  const reels = await readFeed(arg("--feed", REELS_FEED_HOME));
  const doc = await runCatalogHealth({ snapshot, reels, previous });
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(doc, null, 1)}\n`);
  }
  const text = summarize(doc);
  console.log(process.argv.includes("--json") ? JSON.stringify(doc, null, 1) : `skills: ${text.replace(/\n/g, "\n  ")}${out ? `\n  → ${out}` : ""}`);
  if (process.argv.includes("--summary") && process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Skills — catalog-health\n\n${text}\n`);
  // Report only: a WARN/FAILED stage is information for the owner, never a broken build.
}
