// /api/store?mode=radar-board (src/lib/growth/radarGate.js).
//   GET               the full board while the trial is open, or to a signed-in user with an active
//                     radar subscription (Authorization: Bearer <session>); otherwise 402 with the teaser.
//   POST op=put       the radar run stores today's board (cron auth: AUTOPILOT_SECRET / CRON_SECRET);
//                     only what sanitizeBoard keeps is stored, and it is read back.
import { jsonCors, isApprovedOrigin } from "./cors.js";
import { isAuthorizedCron } from "./cronAuth.mjs";
import { verifyToken } from "./authVerify.js";
import { readBody } from "./readBody.mjs";
import { paypalEnvName } from "./paypal.js";
import { sanitizeBoard } from "../../src/lib/growth/radarBoard.js";
import { RADAR_BOARD_KEY, RADAR_TRIALS_KEY, boardAccess, teaserBoard, userTrialDays, userTrialOf } from "../../src/lib/growth/radarGate.js";
import { accessOf } from "../../src/lib/growth/radarPlans.js";
import { RADAR_PICKS_KEY, RADAR_PICKS_SEAL_KEY, RECEIPT_ID, addPick, addRadarPick, beatsRadar, duelOf, gradePicks, leaderboard, myPicks, picksSealText, receiptView } from "../../src/lib/growth/radarPicks.js";
import { OTS_CALENDARS, hexBytes, otsProof, toBase64 } from "../../src/lib/growth/radarSeal.js";

const sha256Hex = async (text) => [...new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Seals the picks in Bitcoin (OpenTimestamps) when they changed; returns the stored seal. */
async function sealPicks(picks, { kvGet, kvSet, fetchImpl, today }) {
  const text = picksSealText(picks);
  if (!text) return null;
  const sha256 = await sha256Hex(text);
  const prev = await kvGet(RADAR_PICKS_SEAL_KEY, null);
  if (prev?.sha256 === sha256) return prev;
  const ots = [];
  for (const cal of OTS_CALENDARS) {
    try {
      const res = await fetchImpl(`${cal}/digest`, { method: "POST", headers: { Accept: "application/vnd.opentimestamps.v1", "Content-Type": "application/x-www-form-urlencoded" }, body: hexBytes(sha256), signal: AbortSignal.timeout(15_000) });
      const proof = res.ok ? otsProof(sha256, new Uint8Array(await res.arrayBuffer())) : null;
      if (proof) ots.push({ cal: new URL(cal).host, b64: toBase64(proof) });
    } catch { /* a calendar that did not answer adds no proof */ }
  }
  const seal = { d: today, sha256, count: text.split("\n").length, text: text.length <= 60_000 ? text : null, ots };
  await kvSet(RADAR_PICKS_SEAL_KEY, seal);
  return seal;
}
import { currentRadarSub, ownRadarSubs } from "../../src/lib/growth/radarSubs.js";
import { crowdKinds, crowdOf } from "../../src/lib/growth/crowdSensor.js";

const header = (req, k) => String((req.headers?.get ? req.headers.get(k) : req.headers?.[k]) || "");

// A pick's public receipt id: 16 hex of SHA-256 over its stored id (the stored id never leaves the server).
const ridOf = async (p) => (await sha256Hex(`receipt|${p.id}`)).slice(0, 16);

export function createRadarBoardHandler({ kv = null, verify = verifyToken, now = () => Date.now(), fetchImpl = (...a) => globalThis.fetch(...a) } = {}) {
  const store = async () => kv || (await import("../store.mjs"));
  return async function radarBoardHandler(req, res) {
    const json = (obj, status = 200) => jsonCors(res, obj, status, req);
    if (req.method === "OPTIONS") return json({ ok: true });
    const url = new URL(req.url, "https://x");
    const { kvGet, kvSet } = await store();

    if (req.method === "POST" && url.searchParams.get("op") === "put") {
      if (!isAuthorizedCron(req, [process.env.AUTOPILOT_SECRET].filter(Boolean))) return json({ ok: false, error: "unauthorized" }, 401);
      const board = sanitizeBoard(await readBody(req));
      if (!board) return json({ ok: false, error: "invalid_board" }, 400);
      await kvSet(RADAR_BOARD_KEY, board);
      // "Who spotted it first": due picks are graded against today's order counts (radarPicks.js).
      const picks = (await kvGet(RADAR_PICKS_KEY, [])) || [];
      const orders = Object.fromEntries(board.concepts.map((c) => [c.id, c.today?.orders]));
      const graded = gradePicks(picks, orders, String(board.at).slice(0, 10));
      // "הרדאר נגד ישראל": the radar seals its own pick of the day on the same table, same rules.
      const next = addRadarPick(graded, board, { now: now() });
      if (next.length !== picks.length || next.some((p, i) => p !== picks[i])) await kvSet(RADAR_PICKS_KEY, next);
      // The scouts: every pick sealed in Bitcoin (the day it existed can never be moved).
      if (next.length) await sealPicks(next, { kvGet, kvSet, fetchImpl, today: String(board.at).slice(0, 10) }).catch(() => null);
      const back = await kvGet(RADAR_BOARD_KEY, null);
      const ok = back?.at === board.at && Array.isArray(back?.concepts) && back.concepts.length === board.concepts.length;
      return json({ ok, at: board.at, concepts: board.concepts.length }, ok ? 200 : 502);
    }

    // The crowd sensor (crowdSensor.js): items checked in the magic button in different browser
    // sessions this week, counts only. For the radar run (cron auth).
    if (req.method === "GET" && url.searchParams.get("op") === "crowd") {
      if (!isAuthorizedCron(req, [process.env.AUTOPILOT_SECRET].filter(Boolean))) return json({ ok: false, error: "unauthorized" }, 401);
      const funnel = (await kvGet("marketplace:funnel", [])) || [];
      return json({ ok: true, crowd: crowdOf(funnel, { now: now() }), kinds: crowdKinds(funnel, { now: now() }) });
    }
    const origin = header(req, "origin");
    if (origin && !isApprovedOrigin(origin)) return json({ ok: false, error: "origin_not_allowed" }, 403);
    const op = url.searchParams.get("op") || "";
    if (req.method === "GET" && op === "leaderboard") {
      const seal = await kvGet(RADAR_PICKS_SEAL_KEY, null);
      const all = (await kvGet(RADAR_PICKS_KEY, [])) || [];
      // The radar's open picks are named only while the board itself is open (the launch trial).
      const openPicks = !accessOf((await kvGet("marketplace:settings", {})) || {}, { now: now() }).locked;
      const duel = duelOf(all, { openPicks });
      duel.recent = await Promise.all(duel.recent.map(async ({ id, ...r }) => ({ ...r, rid: await ridOf({ id }) })));
      return json({ ok: true, table: leaderboard(all), duel, seal: seal && /^[0-9a-f]{64}$/.test(String(seal.sha256 || "")) ? { d: seal.d, sha256: seal.sha256, count: seal.count, text: seal.text || null, ots: Array.isArray(seal.ots) ? seal.ots.slice(0, 2) : [] } : null });
    }
    if (req.method === "POST" && op === "pick") {
      const token = header(req, "authorization").replace(/^Bearer\s+/i, "");
      const user = token ? await verify(token).catch(() => null) : null;
      if (!user?.id) return json({ ok: false, error: "unauthenticated" }, 401);
      const uid = String(user.id);
      const t = now();
      const settings = (await kvGet("marketplace:settings", {})) || {};
      const sub = currentRadarSub(ownRadarSubs((await kvGet("radar:subscriptions", [])) || [], uid, paypalEnvName()), t);
      const trial = userTrialOf(((await kvGet(RADAR_TRIALS_KEY, {})) || {})[uid], { days: userTrialDays(settings), now: t });
      if (!boardAccess({ settings, sub, trial, signedIn: true, now: t }).full) return json({ ok: false, error: "subscription_required" }, 402);
      const body = (await readBody(req)) || {};
      const board = await kvGet(RADAR_BOARD_KEY, null);
      const concept = (board?.concepts || []).find((c) => c.id === body.concept);
      const picks = (await kvGet(RADAR_PICKS_KEY, [])) || [];
      const out = addPick(picks, { userId: uid, concept: concept?.id || String(body.concept || ""), nick: body.nick, show: body.show === true, base: concept?.today?.orders, now: t });
      if (out.error) return json({ ok: false, error: out.error }, 400);
      await kvSet(RADAR_PICKS_KEY, out.picks);
      const back = (await kvGet(RADAR_PICKS_KEY, [])) || [];
      const ok = back.some((p) => p.id === out.pick.id);
      return json({ ok, pick: ok ? { ...myPicks([out.pick], uid)[0], rid: await ridOf(out.pick) } : null }, ok ? 200 : 502);
    }
    if (req.method === "GET" && op === "mine") {
      const token = header(req, "authorization").replace(/^Bearer\s+/i, "");
      const user = token ? await verify(token).catch(() => null) : null;
      if (!user?.id) return json({ ok: false, error: "unauthenticated" }, 401);
      const all = (await kvGet(RADAR_PICKS_KEY, [])) || [];
      const own = await Promise.all(myPicks(all, String(user.id)).map(async (p) => ({ ...p, rid: await ridOf(p) })));
      return json({ ok: true, picks: own, beat: beatsRadar(all, String(user.id)) });
    }
    // The sealed receipt (radarPicks.js receiptView): public, by its receipt id only.
    if (req.method === "GET" && op === "receipt") {
      const rid = String(url.searchParams.get("r") || "");
      if (!RECEIPT_ID.test(rid)) return json({ ok: false, error: "invalid_receipt" }, 400);
      const all = (await kvGet(RADAR_PICKS_KEY, [])) || [];
      let hit = null;
      for (const p of all) { if ((await ridOf(p)) === rid) { hit = p; break; } }
      if (!hit) return json({ ok: false, error: "receipt_not_found" }, 404);
      const board = await kvGet(RADAR_BOARD_KEY, null);
      const seal = await kvGet(RADAR_PICKS_SEAL_KEY, null);
      const locked = accessOf((await kvGet("marketplace:settings", {})) || {}, { now: now() }).locked;
      const revealConcept = !(hit.userId === "radar" && !hit.result && locked);
      const he = (board?.concepts || []).find((c) => c.id === hit.concept)?.he || null;
      return json({ ok: true, receipt: { rid, ...receiptView(hit, { he, sealText: seal?.text || "", revealConcept }), sealDay: seal?.d || null } });
    }
    if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
    const board = await kvGet(RADAR_BOARD_KEY, null);
    if (!board) return json({ ok: false, error: "board_not_ready" }, 503);
    const settings = (await kvGet("marketplace:settings", {})) || {};
    let sub = null;
    let trial = null;
    let signedIn = false;
    const t = now();
    const token = header(req, "authorization").replace(/^Bearer\s+/i, "");
    if (token) {
      const user = await verify(token).catch(() => null);
      if (user?.id) {
        signedIn = true;
        const uid = String(user.id);
        sub = currentRadarSub(ownRadarSubs((await kvGet("radar:subscriptions", [])) || [], uid, paypalEnvName()), t);
        // Her own trial starts the first time she opens the radar signed in once the launch trial is over.
        if (accessOf(settings, { now: t }).locked) {
          const trials = (await kvGet(RADAR_TRIALS_KEY, {})) || {};
          if (!trials[uid] && !sub) {
            await kvSet(RADAR_TRIALS_KEY, { ...trials, [uid]: { startedAt: new Date(t).toISOString() } });
            const back = (await kvGet(RADAR_TRIALS_KEY, {})) || {};
            trials[uid] = back[uid] || null;
          }
          trial = userTrialOf(trials[uid], { days: userTrialDays(settings), now: t });
        }
      }
    }
    const access = boardAccess({ settings, sub, trial, signedIn, now: t });
    if (access.full) return json({ ok: true, access: access.reason, trialEndsAt: access.trialEndsAt || null, daysLeft: access.daysLeft ?? null, board });
    return json({ ok: false, error: access.reason, trialDays: userTrialDays(settings), teaser: teaserBoard(board) }, 402);
  };
}

export default createRadarBoardHandler();
