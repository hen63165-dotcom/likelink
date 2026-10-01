// Bot guard for public routes (api/og.mjs: /r clicks, /p/:id and /u/:slug).
//
// - Known scraping tools (by User-Agent) are refused (403) — they are not
//   search engines, link-preview bots or browsers, and the acceptable-use
//   policy forbids automated collection.
// - Every client is rate-limited per IP in a sliding window (429 with
//   Retry-After). The limiter is in-memory, so it is per serverless instance:
//   a real brake on bursts, not a global quota.
// - Search engines and link-preview bots are never blocked by the UA rule.
// A refused /r request records no click, so scrapers cannot inflate stats.

// Only unambiguous scraping libraries/tools. Headless browsers are NOT listed:
// Lighthouse / PageSpeed and link checkers use them legitimately (rate limit only).
const SCRAPER_UA = /\b(scrapy|python-requests|python-urllib|aiohttp|httpx|go-http-client|libwww-perl|lwp::|httrack|wget|java\/\d|apache-httpclient|node-fetch|axios\/|guzzlehttp|mechanize|phantomjs|colly|zgrab|masscan|nikto|sqlmap)\b/i;
const CRAWLER_UA = /googlebot|bingbot|applebot|duckduckbot|yandex|baiduspider|facebookexternalhit|facebot|twitterbot|whatsapp|telegrambot|slackbot|linkedinbot|discordbot|pinterest|redditbot|skypeuripreview|iframely|gptbot|oai-searchbot|chatgpt-user|claudebot|perplexitybot|amazonbot|meta-externalagent/i;

export function classifyAgent(userAgent) {
  const ua = String(userAgent || "");
  if (!ua.trim()) return "unknown";
  if (CRAWLER_UA.test(ua)) return "crawler";
  if (SCRAPER_UA.test(ua)) return "scraper";
  return "browser";
}

export function clientIp(req) {
  const h = req?.headers || {};
  const get = (n) => (typeof h.get === "function" ? h.get(n) : h[n]) || "";
  return String(get("x-forwarded-for")).split(",")[0].trim() || String(get("x-real-ip")) || "unknown";
}

export function createRateLimiter({ windowMs = 60_000, max = 120, maxKeys = 5000, now = () => Date.now() } = {}) {
  const hits = new Map();
  return function allow(key) {
    const t = now();
    const recent = (hits.get(key) || []).filter((x) => t - x < windowMs);
    if (recent.length >= max) { hits.set(key, recent); return { allowed: false, retryAfter: Math.ceil((windowMs - (t - recent[0])) / 1000) }; }
    recent.push(t);
    hits.delete(key); hits.set(key, recent);
    if (hits.size > maxKeys) hits.delete(hits.keys().next().value); // oldest key first
    return { allowed: true };
  };
}

// Limits per route kind (per IP, per minute). Unknown/empty UAs get less.
const LIMITS = { r: 60, page: 120 };
const limiters = Object.fromEntries(Object.entries(LIMITS).map(([k, max]) => [k, createRateLimiter({ max })]));
const unknownLimiter = createRateLimiter({ max: 20 });

/**
 * @returns {null | { status:number, retryAfter?:number, reason:string }} null = allowed
 */
export function guardPublicRequest(req, kind, { getUa = (r) => r?.headers?.["user-agent"] } = {}) {
  const agent = classifyAgent(getUa(req));
  if (agent === "scraper") return { status: 403, reason: "automated_client" };
  const ip = clientIp(req);
  const limiter = agent === "unknown" ? unknownLimiter : limiters[kind] || limiters.page;
  const verdict = limiter(`${kind}|${ip}`);
  if (!verdict.allowed) return { status: 429, retryAfter: verdict.retryAfter, reason: "rate_limited" };
  return null;
}

export function sendGuardRefusal(res, refusal) {
  res.status(refusal.status);
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  if (refusal.retryAfter) res.setHeader("retry-after", String(refusal.retryAfter));
  res.end(refusal.status === 429 ? "Too many requests — please slow down." : "Automated access is not permitted. See /legal/acceptable-use");
}
