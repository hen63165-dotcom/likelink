// /api/store?mode=media-pipeline — the native reel pipeline endpoint.
// Dispatched from api/store.mjs (no new serverless function: 12-function limit).
//
//   GET  op=status   public-safe pipeline status (no secrets, no env names)
//   GET  op=plan     what to render next          (Bearer AUTOPILOT_SECRET / CRON_SECRET)
//   POST op=ingest   store → verify → register → publish → proof   (same auth)
//   POST op=audit    re-verify served reels, measure, learn        (same auth)
//   POST op=instagram one step of the Instagram Reels publisher     (same auth)
//   GET  op=catalog-candidates / POST op=catalog-resolve  real product photos from
//        the store page (runner: scripts/catalog/resolve-products.mjs)  (same auth)
//
// The renderer (scripts/media/render-reels.mjs) runs on GitHub Actions and is
// the only caller of plan/ingest. See src/lib/cloud/reelPublisher.js.
import { isAuthorizedCron } from "./cronAuth.mjs";
import { readBody } from "./readBody.mjs";
import { auditReels, buildPlan, ingestReel, instagramPublishStep, pipelineStatus, registerStudioUpload, requestRender, studioReelState } from "../../src/lib/cloud/reelPublisher.js";
import { isApprovedOrigin } from "./cors.js";
import { applyResolution, catalogCandidates } from "../../src/lib/cloud/catalogResolver.js";

const norm = (v) => String(v || "").trim().toLowerCase();

/** The caller's VERIFIED studio ids (Supabase session → private creator record), or all ids for an admin token. */
async function sessionOwnerIds(req) {
  const raw = String(req.headers?.authorization || req.headers?.Authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!raw) return null;
  const [{ kvGet }, { verifyToken }, { verifyAdminToken }] = await Promise.all([import("../store.mjs"), import("./authVerify.js"), import("./adminAuth.js")]);
  const marketers = (await kvGet("marketplace:marketers")) || [];
  let admin = null;
  try { admin = verifyAdminToken(raw); } catch { admin = null; }
  if (admin) return { ids: marketers.filter((m) => m?.id).map((m) => String(m.id)), actor: "admin" };
  const user = await verifyToken(raw).catch(() => null);
  const email = norm(user?.email);
  if (!email) return null;
  return { ids: marketers.filter((m) => m?.id && norm(m.email) === email).map((m) => String(m.id)), actor: email };
}

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
  // Creator ops (Studio one-click): a verified session, an approved origin.
  if (["studio-register", "request", "studio-state"].includes(op)) {
    const origin = req.headers?.origin || "";
    if (origin && !isApprovedOrigin(origin)) return send(res, 403, { ok: false, error: "origin_not_allowed" });
    const who = await sessionOwnerIds(req);
    if (!who) return send(res, 401, { ok: false, error: "authentication_required" });
    if (!who.ids.length) return send(res, 403, { ok: false, error: "no_studio_for_this_account" });
    try {
      if (op === "studio-state" && req.method === "GET") {
        const { status, ...rest } = await studioReelState({ ownerIds: who.ids });
        return send(res, status || 200, rest);
      }
      const body = (await readBody(req)) || {};
      if (op === "studio-register" && req.method === "POST") {
        const { status, ...rest } = await registerStudioUpload({ sourcePath: body.sourcePath, productId: body.productId, ownerIds: who.ids });
        return send(res, status || 200, rest);
      }
      if (op === "request" && req.method === "POST") {
        const { status, ...rest } = await requestRender({ productId: body.productId, style: body.style, ownerIds: who.ids, requestedBy: who.actor });
        return send(res, status || 200, rest);
      }
      return send(res, 405, { ok: false, error: "method_not_allowed" });
    } catch (e) {
      return send(res, 500, { ok: false, error: String(e?.message || e).slice(0, 200) });
    }
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
    if (op === "catalog-candidates" && req.method === "GET") {
      const { status, ...rest } = await catalogCandidates();
      return send(res, status || 200, rest);
    }
    if (op === "catalog-resolve" && req.method === "POST") {
      const body = await readBody(req);
      const { status, ...rest } = await applyResolution(body && typeof body === "object" ? body : {});
      return send(res, status || 200, rest);
    }
    if (op === "instagram" && req.method === "POST") {
      const r = await instagramPublishStep();
      return send(res, r.ok ? 200 : 502, r);
    }
    if (op === "audit" && req.method === "POST") {
      const r = await auditReels();
      // Right after a render: publish → verify → proof → track → learn
      // (src/lib/publishing/orchestrator.js). Its failure never hides the audit.
      let orchestrator = null;
      if (r.ok) {
        try {
          const [{ kvGet, kvSet }, { runPublishingSweep }] = await Promise.all([import("../store.mjs"), import("../../src/lib/publishing/orchestrator.js")]);
          orchestrator = await runPublishingSweep({ kvGet, kvSet, env: process.env, budgetMs: 25000 });
        } catch (e) {
          orchestrator = { ok: false, error: String(e?.message || e).slice(0, 160) };
        }
      }
      return send(res, r.ok ? 200 : 503, { ...r, orchestrator });
    }
    return send(res, 400, { ok: false, error: "unknown_op" });
  } catch (e) {
    return send(res, 500, { ok: false, error: String(e?.message || e).slice(0, 200) });
  }
}
