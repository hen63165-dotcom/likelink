// Vercel Serverless Utility — robust request body reader.
//
// WHY: Vercel's Node runtime does NOT reliably expose req.json()/req.text()
// on plain function handlers, so `await req.json()` / `await req.text()` in
// the old code threw and every client POST returned body-less / bad_json —
// breaking product saves, sign-sale, identity linking, autopilot save/run,
// checkout order creation and admin auth.
//
// This reads the request stream manually (works on every Node runtime) and
// prefers a pre-parsed req.body when the runtime provided one. It never
// fails on an empty body (returns null) and returns the raw string when the
// body is not valid JSON.
export async function readBody(req) {
  // 1) Pre-parsed body (Vercel / framework runtimes).
  if (req?.body && typeof req.body === "object") return req.body;
  if (req?.body && typeof req.body === "string" && String(req.body).trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      /* fall through to stream */
    }
  }
  // 2) Stream the raw body (always works in Node).
  const chunks = [];
  try {
    for await (const chunk of req) chunks.push(chunk);
  } catch {
    return null;
  }
  if (!chunks.length) return null;
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}