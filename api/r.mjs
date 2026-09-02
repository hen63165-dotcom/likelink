// Vercel Serverless Function — /r
//
// Safe forwarder for Likelink affiliate/tracking links.
//   /r?u=<encoded destination URL>&ref=<creator tracking id>
//
// Why this exists: `buildAffiliateUrl` (utils/helpers.js) wraps ANY retailer
// product link into `<origin>/r?u=...&ref=...` so every click carries the
// creator's id and is attributable. This function validates the embedded
// destination and forwards the shopper there, preventing open-redirect abuse.
//
// Click attribution is recorded client-side (recordClick → shared `kv` store)
// before the link is opened, so this endpoint only forwards — it does not
// duplicate the click log.
//
// Ported from netlify/edge-functions/r.js.

function redirect(res, target, status = 302) {
  res.status(status);
  res.setHeader("Location", target);
  res.setHeader("cache-control", "no-store, max-age=0");
  res.end();
}

function json(res, obj, status = 200) {
  res.status(status);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

export default async function handler(req, res) {
  const self = new URL(req.url);
  const target = self.searchParams.get("u") || "";
  void self.searchParams.get("ref");
  if (!target) { res.status(400); res.end("Missing destination (u)."); return; }
  let dest;
  try { dest = new URL(target); } catch { res.status(400); res.end("Invalid destination (u)."); return; }
  if (dest.protocol !== "http:" && dest.protocol !== "https:") { res.status(400); res.end("Invalid destination protocol."); return; }
  if (dest.origin === self.origin && dest.pathname.replace(/\/$/, "") === "/r") { res.status(400); res.end("Redirect loop."); return; }
  redirect(res, dest.toString(), 302);
}
