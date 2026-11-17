// Pinterest's own trends (the owner, 2026-11-17: "Pinterest + YouTube"). Pinterest is where the
// looks people want show up first, so its official API v5 (GET /v5/trends/keywords/{region}/top/
// {trend_type}, a Pinterest app's own token, scope user_accounts:read) is read once a day for the
// fashion and beauty interests: the keywords growing fastest. They join the same path as Google's
// trending searches abroad: a term becomes a trial concept only when AliExpress really sells it
// (productTrend), and it is measured, sealed and graded like every concept. Without the owner's
// token nothing is asked (REQUIRES_CONNECTION). Pinterest gives this endpoint to approved apps; a
// refusal is recorded as it came (HTTP_<status>), never as an empty day. Pure: the runner asks.
import { hasBrandName, isNotListedKind } from "./deals.js";

export const PINTEREST = Object.freeze({
  region: "US",
  type: "growing",
  interests: Object.freeze(["womens_fashion", "mens_fashion", "beauty"]),
  limit: 50,
  maxTerms: 30,
});

/** The official endpoint for one day's growing keywords (no token in the address). */
export function pinterestTrendsUrl({ region, type, interests, limit } = PINTEREST) {
  const q = new URLSearchParams({ interests: interests.join(","), limit: String(limit) });
  return `https://api.pinterest.com/v5/trends/keywords/${encodeURIComponent(region)}/top/${encodeURIComponent(type)}?${q}`;
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * The answer's keywords as store search terms: Latin words only (AliExpress is searched in
 * English), 4–60 characters, never a brand or an unlisted kind, fastest week-on-week growth first.
 */
export function pinterestTerms(answer = {}, { rules = PINTEREST } = {}) {
  const list = Array.isArray(answer?.trends) ? answer.trends : [];
  const seen = new Set();
  const out = [];
  for (const t of list) {
    const term = String(t?.keyword || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (!/^[a-z0-9 '&-]{4,60}$/.test(term) || seen.has(term)) continue;
    if (hasBrandName(term) || isNotListedKind(term)) continue;
    seen.add(term);
    out.push({ term, wow: num(t.pct_growth_wow), mom: num(t.pct_growth_mom), yoy: num(t.pct_growth_yoy) });
  }
  return out.sort((a, b) => (b.wow ?? -Infinity) - (a.wow ?? -Infinity)).slice(0, rules.maxTerms);
}
