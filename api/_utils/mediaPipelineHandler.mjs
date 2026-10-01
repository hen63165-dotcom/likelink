// /api/store?mode=media-pipeline — the native reel pipeline endpoint.
// Dispatched from api/store.mjs (no new serverless function: 12-function limit).
//
//   GET  op=status   public-safe pipeline status (no secrets, no env names)
//   GET  op=plan     what to render next          (Bearer AUTOPILOT_SECRET / CRON_SECRET)
//   POST op=ingest   store → verify → register → publish → proof   (same auth)
//   POST op=audit    re-verify served reels, measure, learn        (same auth)
//
// The renderer (scripts/media/render-reels.mjs) runs on GitHub Actions and is
// the only caller of plan/ingest. See src/lib/cloud/reelPublisher.js.
import { isAuthorizedCron } from "./cronAuth.mjs";
import { readBody } from "./readBody.mjs";
import { auditReels, buildPlan, ingestReel, pipelineStatus } from "../../src/lib/cloud/reelPublisher.js";

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

export default async function mediaPipelineHandler(req, res) {
  const url = new URL(req.url, "https://x");
  const op = url.searchParams.get("op") || "status";
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL)) {
    return send(res, 500, { ok: false, error: "misconfigured: service role key missing" });
  }
  if (op === "status" && req.method === "GET") {
    return send(res, 200, await pipelineStatus());
  }
  if (!isAuthorizedCron(req, [process.env.AUTOPILOT_SECRET])) return send(res, 401, { ok: false, error: "unauthorized" });
  try {
    if (op === "plan" && req.method === "GET") {
      const r = await buildPlan({ limit: Number(url.searchParams.get("limit") || 3) });
      return send(res, r.ok ? 200 : 503, r);
    }
    if (op === "ingest" && req.method === "POST") {
      const body = await readBody(req);
      const r = await ingestReel(body && typeof body === "object" ? body : {});
      const { status, ...rest } = r;
      return send(res, status || (r.ok ? 200 : 500), rest);
    }
    if (op === "audit" && req.method === "POST") {
      const r = await auditReels();
      return send(res, r.ok ? 200 : 503, r);
    }
    return send(res, 400, { ok: false, error: "unknown_op" });
  } catch (e) {
    return send(res, 500, { ok: false, error: String(e?.message || e).slice(0, 200) });
  }
}
