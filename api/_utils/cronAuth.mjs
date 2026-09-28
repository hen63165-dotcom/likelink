// Cron / machine-to-machine authorization.
//
// Vercel Cron calls a path with `Authorization: Bearer $CRON_SECRET` when the
// CRON_SECRET env var is set. The `x-vercel-cron` header is NOT proof of
// anything — any client can send it — and a `?secret=` query string leaks into
// logs, so neither is accepted.
//
// A request is authorized when its Bearer token equals CRON_SECRET or one of
// the function-specific secrets passed in (e.g. AUTOPILOT_SECRET, used by the
// GitHub cloud-dispatcher). Empty/unset secrets never match.

import crypto from "crypto";

function safeEqual(a, b) {
  const ab = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function bearerToken(req) {
  const h = req?.headers;
  const raw = (typeof h?.get === "function" ? h.get("authorization") : h?.authorization || h?.Authorization) || "";
  return String(raw).replace(/^Bearer\s+/i, "").trim();
}

/** @param {string[]} extraSecrets function-specific secrets (values, may be empty) */
export function isAuthorizedCron(req, extraSecrets = []) {
  const token = bearerToken(req);
  if (!token) return false;
  const secrets = [process.env.CRON_SECRET, ...extraSecrets]
    .map((s) => String(s || "").trim())
    .filter(Boolean);
  return secrets.some((secret) => safeEqual(token, secret));
}
