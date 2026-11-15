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
import { RADAR_BOARD_KEY, boardAccess, teaserBoard } from "../../src/lib/growth/radarGate.js";
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
    const token = header(req, "authorization").replace(/^Bearer\s+/i, "");
    if (token) {
      const user = await verify(token).catch(() => null);
      if (user?.id) sub = currentRadarSub(ownRadarSubs((await kvGet("radar:subscriptions", [])) || [], String(user.id), paypalEnvName()), now());
    }
    const access = boardAccess({ settings, sub, now: now() });
    if (access.full) return json({ ok: true, access: access.reason, board });
    return json({ ok: false, error: access.reason, teaser: teaserBoard(board) }, 402);
  };
}

export default createRadarBoardHandler();
