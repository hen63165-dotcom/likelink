#!/usr/bin/env node
// Stores today's full radar board server-side (POST /api/store?mode=radar-board&op=put, AUTOPILOT_SECRET),
// where the page reads it behind the trial or an active subscription (src/lib/growth/radarGate.js).
// Usage: node scripts/catalog/push-board.mjs <state dir>. Never fails the run: it reports.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const ENDPOINT = "https://vjitiuirqfysexsxdxqx.supabase.co/functions/v1/api/store?mode=radar-board&op=put";

export async function pushBoard(dir, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const file = join(dir, "board.json");
  if (!existsSync(file)) return { ok: false, reason: "no_board" };
  if (!env.AUTOPILOT_SECRET) return { ok: false, reason: "REQUIRES_CONNECTION: AUTOPILOT_SECRET" };
  const res = await fetchImpl(env.BOARD_ENDPOINT || ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.AUTOPILOT_SECRET}`, origin: "https://likelink2.vercel.app" },
    body: readFileSync(file, "utf8"),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok && body?.ok === true, status: res.status, at: body?.at || null, concepts: body?.concepts ?? null, error: body?.error || null };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = await pushBoard(process.argv[2] || "radar-state").catch((e) => ({ ok: false, reason: String(e?.message || e).slice(0, 120) }));
  console.log(`radar board → cloud: ${out.ok ? "STORED" : "NOT STORED"} ${JSON.stringify(out)}`);
}
