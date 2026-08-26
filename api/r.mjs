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

function redirect(target, status = 302) {
  return new Response(null, {
    status,
    headers: { Location: target, "cache-control": "no-store, max-age=0" },
  });
}

export default async function handler(req) {
  const self = new URL(req.url);
  const target = self.searchParams.get("u") || "";
  void self.searchParams.get("ref"); // creator id — consumed for future analytics/logging
  if (!target) return new Response("Missing destination (u).", { status: 400 });

  let dest;
  try {
    dest = new URL(target);
  } catch {
    return new Response("Invalid destination (u).", { status: 400 });
  }
  if (dest.protocol !== "http:" && dest.protocol !== "https:") {
    return new Response("Invalid destination protocol.", { status: 400 });
  }
  // Prevent redirect loops back to the platform itself.
  if (dest.origin === self.origin && dest.pathname.replace(/\/$/, "") === "/r") {
    return new Response("Redirect loop.", { status: 400 });
  }
  return redirect(dest.toString(), 302);
}
