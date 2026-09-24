// Diagnostic-only production probe for the autopilot module.
// It intentionally lazy-loads the module so import-time failures become JSON
// instead of Vercel's generic FUNCTION_INVOCATION_FAILED.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  try {
    const mod = await import("./autopilot.mjs");
    res.status(200).json({
      ok: true,
      moduleLoaded: true,
      exports: Object.keys(mod).sort(),
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      moduleLoaded: false,
      error: String(e?.message || e).slice(0, 500),
      name: String(e?.name || "Error"),
      stack: String(e?.stack || "").slice(0, 1800),
    });
  }
}
