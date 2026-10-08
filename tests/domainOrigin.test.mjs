// Regression test: the public production origin is ONE value, everywhere.
//
// Before this test existed, the deployed site served `https://likelink.com/`
// as canonical / og:url / og:image / twitter:image / JSON-LD while the real
// deployment was `https://likelink2.vercel.app` — a domain the project does
// not own. This test fails the build if any emitted production address
// regresses to a legacy host.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  PRODUCTION_ORIGIN,
  LEGACY_HOSTS,
  isLegacyOrigin,
  hostOf,
  publicOrigin,
} from "../src/constants/domain.js";
import {
  originFromRequest,
  publicUrl,
  requestOrigin,
  PRODUCTION_ORIGIN as SERVER_PRODUCTION_ORIGIN,
  LEGACY_HOSTS as SERVER_LEGACY_HOSTS,
} from "../api/_utils/origin.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

test("client and server sources of truth agree on the production origin", () => {
  assert.equal(PRODUCTION_ORIGIN, "https://likelink2.vercel.app");
  assert.equal(SERVER_PRODUCTION_ORIGIN, PRODUCTION_ORIGIN);
  assert.deepEqual(SERVER_LEGACY_HOSTS, LEGACY_HOSTS);
});

test("legacy hosts are recognised and never treated as ours", () => {
  for (const legacy of ["https://likelink.com", "https://www.likelink.com", "likelink.com", "www.likelink.com", "https://likelink.app"]) {
    assert.equal(isLegacyOrigin(legacy), true, `${legacy} must be legacy`);
  }
  assert.equal(isLegacyOrigin("https://likelink2.vercel.app"), false);
  assert.equal(isLegacyOrigin(""), false);
  assert.equal(hostOf("https://www.likelink.com/x?y=1"), "www.likelink.com");
});

test("publicOrigin() resolves to the production origin outside a browser and refuses legacy hosts", () => {
  // Node has no window → the canonical production origin, never a legacy host.
  assert.equal(publicOrigin(), PRODUCTION_ORIGIN);
  assert.equal(publicOrigin("https://likelink.com"), PRODUCTION_ORIGIN);
  assert.equal(publicOrigin("https://preview-abc.vercel.app"), "https://preview-abc.vercel.app");
});

// ─── Deployed artifacts ─────────────────────────────────────────────────────
// These are the exact files a crawler reads. A legacy host reaching any of
// them re-creates the original bug: Google is told the canonical page lives on
// a domain this project does not own.

const EMITTED_ARTIFACTS = ["index.html", "public/robots.txt", "google-feed.xml"];
const LEGACY_NEEDLES = ["likelink.com", "www.likelink.com", "likelink.app", "www.likelink.app"];

test("every emitted artifact points at the canonical origin and never a legacy host", () => {
  for (const rel of EMITTED_ARTIFACTS) {
    const content = read(rel);
    for (const needle of LEGACY_NEEDLES) {
      assert.equal(content.includes(needle), false, `${rel} must not reference ${needle}`);
    }
  }
});

test("index.html canonical, og:url, og:image, twitter:image and JSON-LD all use the canonical origin", () => {
  const html = read("index.html");
  for (const marker of [
    'rel="canonical"',
    'property="og:url"',
    'property="og:image"',
    'name="twitter:image"',
  ]) {
    const tag = html.split("\n").find((line) => line.includes(marker));
    assert.ok(tag, `index.html is missing ${marker}`);
    assert.ok(
      tag.includes(PRODUCTION_ORIGIN),
      `${marker} must use ${PRODUCTION_ORIGIN}, got: ${tag.trim()}`,
    );
  }
  // JSON-LD @id / url / logo / search target.
  for (const line of html.split("\n")) {
    if (!/(@id|"url"|urlTemplate|ImageObject)/.test(line)) continue;
    if (!/likelink/i.test(line)) continue;
    assert.ok(line.includes(PRODUCTION_ORIGIN), `JSON-LD must use the canonical origin: ${line.trim()}`);
  }
});

test("robots.txt advertises the canonical sitemap URL", () => {
  const robots = read("public/robots.txt");
  const sitemapLine = robots.split("\n").find((line) => /^sitemap:/i.test(line.trim()));
  assert.ok(sitemapLine, "robots.txt must declare a Sitemap line");
  assert.ok(sitemapLine.includes(`${PRODUCTION_ORIGIN}/sitemap.xml`), `unexpected sitemap line: ${sitemapLine.trim()}`);
});

// ─── Source guard ───────────────────────────────────────────────────────────
// Only the two source-of-truth modules (and this test) may name a legacy host,
// because their whole job is to detect and refuse it. Anywhere else it is a bug.

const SOURCE_ALLOWLIST = new Set([
  "src/constants/domain.js",
  "api/_utils/origin.mjs",
  "tests/domainOrigin.test.mjs",
]);
const SOURCE_EXT = /\.(js|jsx|mjs|cjs|ts|tsx)$/;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".vercel", "coverage", "tests"]);

function walkSource(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walkSource(full, out); continue; }
    if (SOURCE_EXT.test(entry.name)) out.push(full);
  }
  return out;
}

test("no module outside the source of truth hardcodes a legacy origin", () => {
  const offenders = [];
  for (const dir of ["src", "api"]) {
    for (const file of walkSource(path.join(ROOT, dir))) {
      const rel = path.relative(ROOT, file).replace(/\\/g, "/");
      if (SOURCE_ALLOWLIST.has(rel)) continue;
      const content = readFileSync(file, "utf8");
      // Comments may explain the legacy host; only real string literals matter.
      // Block-comment continuation lines ("* …") and "//" lines are skipped
      // wholesale — they can never be an emitted value.
      for (const [i, line] of content.split(/\r?\n/).entries()) {
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
        const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
        if (!/["'`]/.test(code)) continue;
        if (code.includes("likelink.com") || code.includes("likelink.app") || code.includes("likelink.vercel.app")) {
          offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 140)}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], `hardcoded legacy origin found:\n${offenders.join("\n")}`);
});
