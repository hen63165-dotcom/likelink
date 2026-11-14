// The trend radar's catalog decisions → the server (src/lib/cloud/catalogArchive.js, op
// catalog-archive). Reads <state-dir>/catalog-decisions.json written by trend-radar.mjs.
//   node scripts/catalog/push-archive.mjs <state-dir>
// Applies only on main with RADAR_ARCHIVE=apply (confirm "archive"); anywhere else it is a dry run
// that only reports what the server would do. env: AUTOPILOT_SECRET, ARCHIVE_ENDPOINT (optional).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const ENDPOINT = "https://vjitiuirqfysexsxdxqx.supabase.co/functions/v1/api/store?mode=media-pipeline&op=catalog-archive";
// The owner, 2026-11-14: a product waiting for its second reading is never removed early. A
// "hard" decision (the store's own facts failed: under 300 orders, no shipping to Israel, no
// commission, quality) does not depend on readings and applies at once; a "momentum" decision (no
// acceleration, slowing, saturated) waits for the full second-measurement scan on 17.11. A
// restore (the radar archived it and it qualifies again) is always allowed.
export const ARCHIVE_NOT_BEFORE = "2026-11-17";

/** The decisions a run may apply today. */
export function applicableNow(decisions = [], now = Date.now()) {
  const early = new Date(now).toISOString().slice(0, 10) < ARCHIVE_NOT_BEFORE;
  return (Array.isArray(decisions) ? decisions : []).filter((d) => !early || d?.basis === "hard" || d?.action === "restore");
}

/** Whether this run may apply at all (main with RADAR_ARCHIVE=apply); what it applies: applicableNow. */
export function mayApply(env = {}) {
  return env.RADAR_ARCHIVE === "apply" && env.GITHUB_REF === "refs/heads/main";
}

export async function pushArchive(dir, { env = process.env, fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const all = JSON.parse(readFileSync(join(dir, "catalog-decisions.json"), "utf8"));
  const apply = mayApply(env);
  // A real run sends only what may apply today; a dry run reports everything.
  const decisions = apply ? applicableNow(all, now) : all;
  if (!env.AUTOPILOT_SECRET) return { ok: false, reason: "REQUIRES_CONNECTION: AUTOPILOT_SECRET", asked: decisions.length };
  const res = await fetchImpl(env.ARCHIVE_ENDPOINT || ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.AUTOPILOT_SECRET}`, origin: "https://likelink2.vercel.app" },
    body: JSON.stringify({ decisions, ...(apply ? { confirm: "archive" } : {}) }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok && body.ok !== false, status: res.status, apply, asked: decisions.length, waiting: all.length - decisions.length, ...body };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const r = await pushArchive(process.argv[2] || "radar-state");
  const sum = { ok: r.ok, status: r.status, apply: r.apply, asked: r.asked, waitingFor17_11: r.waiting || 0, dryRun: r.dryRun, applied: (r.applied || []).length, archived: (r.applied || []).filter((a) => a.action === "archive").length, restored: (r.applied || []).filter((a) => a.action === "restore").length, refused: (r.refused || []).length, proof: r.proof, error: r.error || r.reason };
  console.log("catalog archive:", JSON.stringify(sum));
  for (const a of (r.applied || []).slice(0, 80)) console.log(` ${a.action} ${a.id} — ${a.reason}`);
  for (const x of (r.refused || []).slice(0, 20)) console.log(` refused ${x.id}: ${x.error}`);
}
