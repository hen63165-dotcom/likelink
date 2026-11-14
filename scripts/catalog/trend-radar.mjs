// The trend radar's daily reading (src/lib/growth/trendRadar.js). For every concept on the watch
// list (scripts/catalog/radar-concepts.json) it asks AliExpress, through the owner's affiliate
// account, for the matching listings sorted by recent orders, keeps the reading (listings, the top
// items' orders and prices), the first item that passes the site's rules (to buy), updates the
// public self-grading calls, and writes the board the /radar page reads.
//
//   node scripts/catalog/trend-radar.mjs <state-dir>
//   <state-dir>/readings.json and calls.json are the history (the "radar" release keeps them);
//   <state-dir>/board.json is the public board.
// Read-only on the store and the site. A concept the store does not answer keeps its history and
// gets no reading today (never a zero). env: ALIEXPRESS_APP_KEY / APP_SECRET / TRACKING_ID.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { aeCall, aeEnv, aeStatus } from "../../api/_utils/aliexpressAffiliate.mjs";
import { RADAR, addReading, buildBoard, pickFrom, readingFrom, signals, stageOf, updateCalls, validConcept } from "../../src/lib/growth/trendRadar.js";

const SEARCH = "aliexpress.affiliate.product.query";
const readJson = (file, fallback) => {
  try { return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback; } catch { return fallback; }
};

/** One concept's answer from the store, or why there is none. */
export async function readConcept(c, { env = process.env, fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const e = aeEnv(env);
  const biz = { keywords: c.en, tracking_id: e.ALIEXPRESS_TRACKING_ID, target_currency: "ILS", target_language: "HE", ship_to_country: "IL", page_size: "50", sort: "LAST_VOLUME_DESC" };
  const res = await aeCall(SEARCH, biz, { env: e, fetchImpl, now });
  const r = res?.aliexpress_affiliate_product_query_response?.resp_result;
  if (Number(r?.resp_code) !== 200) return { ok: false, reason: `resp ${r?.resp_code ?? "none"} ${String(r?.resp_msg || "").slice(0, 60)}` };
  return { ok: true, result: r.result || {} };
}

export async function run(dir, { env = process.env, fetchImpl = globalThis.fetch, now = Date.now(), budgetMs = 240_000 } = {}) {
  mkdirSync(dir, { recursive: true });
  const { concepts: all = [] } = readJson("scripts/catalog/radar-concepts.json", {});
  const concepts = all.filter(validConcept);
  const readings = readJson(join(dir, "readings.json"), {});
  const prevBoard = readJson(join(dir, "board.json"), {});
  const picks = Object.fromEntries((prevBoard.concepts || []).filter((c) => c.pick).map((c) => [c.id, c.pick]));
  let calls = readJson(join(dir, "calls.json"), []);
  const log = [];
  if (!aeStatus(env).configured) {
    log.push("AliExpress affiliate account not connected here (REQUIRES_CONNECTION): no reading today");
  } else {
    const started = Date.now();
    for (const c of concepts) {
      if (Date.now() - started > budgetMs) { log.push(`${c.id}: budget over, not read today`); continue; }
      try {
        const got = await readConcept(c, { env, fetchImpl, now });
        if (!got.ok) { log.push(`${c.id}: ${got.reason}`); continue; }
        const reading = readingFrom(got.result, { now });
        if (!reading.top.length) { log.push(`${c.id}: no item with orders`); continue; }
        readings[c.id] = addReading(readings[c.id], reading);
        const pick = pickFrom(got.result, { now });
        if (pick) picks[c.id] = pick; else delete picks[c.id];
        const s = signals(readings[c.id]);
        const stage = stageOf(s);
        calls = updateCalls(calls, c.id, stage, readings[c.id], { now });
        log.push(`${c.id}: ${reading.listings ?? "?"} listings · top orders ${reading.sum} · ${stage}${s.ok ? ` (${s.demandWeek}%/wk over ${s.span}d, breadth ${s.breadth})` : ""}${pick ? "" : " · no pick passes the rules"}`);
      } catch (err) {
        log.push(`${c.id}: ${String(err?.message || err).slice(0, 100)}`);
      }
    }
  }
  const board = buildBoard({ concepts, readings, picks, calls, now });
  writeFileSync(join(dir, "readings.json"), JSON.stringify(readings));
  writeFileSync(join(dir, "calls.json"), JSON.stringify(calls, null, 1));
  writeFileSync(join(dir, "board.json"), JSON.stringify(board));
  const counts = board.concepts.reduce((m, c) => ((m[c.stage] = (m[c.stage] || 0) + 1), m), {});
  return { board, log, counts };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const dir = process.argv[2] || "radar-state";
  const { log, counts, board } = await run(dir);
  console.log(log.join("\n"));
  console.log("stages:", JSON.stringify(counts), "· record:", JSON.stringify(board.record));
  console.log("rules:", JSON.stringify(RADAR.pickRules));
}
