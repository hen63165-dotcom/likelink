import { runSiteCampaignCycle } from "./autopilot.mjs";

const ORIGIN = "https://likelink2.vercel.app";

function json(res, body, status = 200) {
  res.status(status);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

function originFromReq(req) {
  try {
    const raw = req?.headers?.host ? `https://${req.headers.host}` : ORIGIN;
    const u = new URL(raw);
    return u.hostname.endsWith(".vercel.app") ? u.origin : ORIGIN;
  } catch {
    return ORIGIN;
  }
}

function isCron(req) {
  const auth = String(req?.headers?.authorization || req?.headers?.Authorization || "");
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && auth === `Bearer ${secret}`);
}

export default async function handler(req, res) {
  const url = new URL(req.url, ORIGIN);
  const mode = url.searchParams.get("mode") || "status";

  if (req.method === "OPTIONS") {
    res.status(204);
    res.end();
    return;
  }

  if (mode === "run") {
    // Vercel Cron is the only unattended execution path.
    if (!isCron(req)) return json(res, { ok: false, error: "cron_only" }, 401);
    const result = await runSiteCampaignCycle(originFromReq(req));
    return json(res, {
      ok: true,
      executedAt: new Date().toISOString(),
      result,
      policy: {
        ownedWeb: "LIVE",
        externalSocial: "AUTHORIZATION_REQUIRED",
        paidTraffic: "NOT_AUTOMATED",
        fakeTraffic: "BLOCKED",
      },
    });
  }

  // Public machine-readable growth status. This is deliberately honest:
  // it exposes what LikeLink can actually publish, not vanity claims.
  return json(res, {
    ok: true,
    service: "LikeLink Autonomous Growth OS",
    site: ORIGIN,
    mode,
    ownedWeb: {
      state: "LIVE",
      campaignUrl: `${ORIGIN}/grow/`,
      shareReady: true,
      indexable: true,
    },
    distribution: {
      ownedWeb: "LIVE",
      nativeShare: "AVAILABLE",
      facebook: "NEEDS_AUTHORIZATION",
      instagram: "NEEDS_AUTHORIZATION",
      tiktok: "NEEDS_AUTHORIZATION",
      youtube: "NEEDS_AUTHORIZATION",
      telegram: "NEEDS_AUTHORIZATION",
      x: "NEEDS_AUTHORIZATION",
    },
    media: {
      realCatalogMedia: "ALLOWED",
      providerGeneratedVideo: "PROVIDER_REQUIRED",
      providerGeneratedVoice: "PROVIDER_REQUIRED",
      fabricatedMedia: "BLOCKED",
    },
    commerce: {
      affiliate: "TRACKED_REDIRECT",
      merchant: "DIRECT_CHECKOUT_ONLY",
    },
    loop: [
      "OBSERVE",
      "SELECT_REAL_OPPORTUNITY",
      "CREATE_SHAREABLE_STORY",
      "PUBLISH_OWNED_WEB",
      "SHARE_WHEN_AUTHORIZED",
      "MEASURE",
      "LEARN",
      "ROTATE",
    ],
    checkedAt: new Date().toISOString(),
  });
}
