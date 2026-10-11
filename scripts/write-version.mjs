// Writes dist/version.json after every build: the commit this build was made
// from, so anyone (and scripts/ops/doctor.mjs) can tell which revision a host
// serves. Netlify sets COMMIT_REF, GitHub Actions GITHUB_SHA, Vercel
// VERCEL_GIT_COMMIT_SHA; a local build asks git. No secrets, no env values
// beyond these public identifiers.
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function versionInfo(env = {}, now = new Date(), gitSha = "") {
  const raw = env.COMMIT_REF || env.GITHUB_SHA || env.VERCEL_GIT_COMMIT_SHA || gitSha || "";
  const commit = /^[0-9a-f]{7,40}$/i.test(raw) ? raw.toLowerCase() : "";
  const host = env.NETLIFY ? "netlify" : env.VERCEL ? "vercel" : env.GITHUB_ACTIONS ? "github-actions" : "local";
  const branch = String(env.HEAD || env.BRANCH || env.GITHUB_REF_NAME || env.VERCEL_GIT_COMMIT_REF || "").slice(0, 120);
  return { commit, branch, host, builtAt: now.toISOString() };
}

function gitHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (existsSync("dist")) {
    const info = versionInfo(process.env, new Date(), gitHead());
    writeFileSync("dist/version.json", `${JSON.stringify(info, null, 1)}\n`);
    console.log(`write-version: ${info.commit.slice(0, 7) || "unknown"} (${info.host})`);
  }
}
