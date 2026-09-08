// LikeLink — Cloud Home Concierge ☁️🏠
// =====================================
// A thin, pure-client composition layer that turns the EXISTING cloud machinery
// (Growth Brain / discover / native share / tracking) into a simple "what do I
// do right now" home experience:
//   1. `fetchCloudHome()`      — "today's pick" straight from the live server
//                                discovery ranking (read-only, existing endpoint).
//   2. `buildStudioBoost()`    — for a seller: pick the studio's strongest
//                                real product and prepare a fully tracked share
//                                (native OS share only — NO auto-publish).
//   3. `autoLanguage()`        — Hebrew-first default, honors stored user choice.
//
// No credentials. No writes. No network beyond the existing public discover
// endpoint. Fails soft: every call resolves, never throws, never fakes.

export async function fetchCloudHome({ query = "", fetchFn = null } = {}) {
  try {
    const doFetch =
      fetchFn || (typeof window !== "undefined" ? window.fetch.bind(window) : null);
    if (!doFetch) return { ok: false, reason: "no_fetch" };
    const res = await doFetch("/api/store?mode=discover", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
      signal: typeof AbortSignal !== "undefined" ? AbortSignal.timeout(15000) : undefined,
    });
    const data = await res.json();
    if (!res.ok || !data || data.ok !== true) return { ok: false, reason: "server" };
    return {
      ok: true,
      hasPick: Boolean(data.hasResult && data.top),
      pick: data.top || null,
      alternatives: Array.isArray(data.alternatives) ? data.alternatives : [],
      intent: data.intent || {},
      decisionId: data.decisionId || null,
    };
  } catch (e) {
    return { ok: false, reason: String(e && e.message ? e.message : "error") };
  }
}

/** Oldest friends of the studio about clicks/sales; prefers approved+image+price. */
function studioRank(p) {
  let s = 0;
  if (p && p.status === "approved") s += 10;
  if (p && p.image) s += 4;
  if (p && Number(p.price) > 0) s += 3;
  if (p && Number(p.clicks)) s += Math.min(10, Math.log10(p.clicks + 1) * 3);
  return s;
}

/**
 * For a seller's own studio: pick the strongest real product and return a
 * ready-to-share tracked URL + a natural Hebrew hook. Exposes NO distribution —
 * the caller must still go through the user's explicit share action.
 */
export function buildStudioBoost(marketer, products) {
  if (!marketer || !Array.isArray(products)) return { ok: false, reason: "missing_data" };
  const mine = products.filter((p) => p && p.marketerId === marketer.id && p.status === "approved");
  if (!mine.length) return { ok: false, reason: "no_products" };
  const pick = [...mine].sort((a, b) => studioRank(b) - studioRank(a))[0];
  let tracked = null;
  try {
    const base = `${typeof window !== "undefined" ? window.location.origin : ""}/p/${encodeURIComponent(pick.id)}`;
    tracked = `${base}?utm_source=studio_boost&utm_medium=share&utm_campaign=studio_${encodeURIComponent(marketer.slug || marketer.id)}`;
  } catch { /* leave null — clipboard fallback handled by caller */ }
  return {
    ok: true,
    product: { id: pick.id, title: pick.title, price: pick.price, image: pick.image || null },
    trackedUrl: tracked,
    hook: `הסטודיו של ${marketer.name || "המוכרת"} — ${pick.title}. כנסו לפרטים.`,
  };
}

/** Hebrew-first, but honoring an already-stored user preference. */
export function autoLanguage(stored = null, navigatorLang = null) {
  if (stored === "he" || stored === "en") return stored;
  const nav = String(navigatorLang || (typeof navigator !== "undefined" ? navigator.language : "") || "");
  if (nav.toLowerCase().startsWith("he")) return "he";
  return "he"; // Hebrew-first by design; user can switch in the app's existing toggle.
}