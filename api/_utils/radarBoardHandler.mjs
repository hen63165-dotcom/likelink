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
import { currentRadarSub, ownRadarSubs } from "../../src/lib/growth/radarSubs.js";

const header = (req, k) => String((req.headers?.get ? req.headers.get(k) : req.headers?.[k]) || "");

export function createRadarBoardHandler({ kv = null, verify = verifyToken, now = () => Date.now() } = {}) {
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
      const back = await kvGet(RADAR_BOARD_KEY, null);
      const ok = back?.at === board.at && Array.isArray(back?.concepts) && back.concepts.length === board.concepts.length;
      return json({ ok, at: board.at, concepts: board.concepts.length }, ok ? 200 : 502);
    }

    const origin = header(req, "origin");
    if (origin && !isApprovedOrigin(origin)) return json({ ok: false, error: "origin_not_allowed" }, 403);
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
