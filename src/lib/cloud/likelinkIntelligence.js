/**
 * LikeLink Intelligence Core
 * --------------------------
 * First-party, provider-independent decision and creative engine.
 * No Gemini/OpenAI/third-party AI credential is required.
 *
 * This engine is deliberately deterministic, auditable and fail-closed:
 * catalog facts -> signals -> score -> creative plan -> execution state.
 * External model adapters may be added later, but never sit on the critical path.
 */

const STOPWORDS = new Set([
  "the","and","for","with","this","that","from","your","you","are","has","have",
  "של","את","על","עם","זה","זו","הוא","היא","מוצר","חדש","חדש/ה","ו"
]);

function clean(value, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function tokens(value) {
  return clean(value, 1200)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((x) => x.length > 2 && !STOPWORDS.has(x));
}

function overlap(a, b) {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let hits = 0;
  for (const t of A) if (B.has(t)) hits++;
  return hits / Math.max(1, Math.min(A.size, B.size));
}

function hash(input) {
  let h = 2166136261;
  for (const ch of String(input)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function scoreProduct(product = {}, context = {}) {
  const title = clean(product.title, 180);
  const description = clean(product.description, 600);
  const category = clean(product.category, 80);
  const trendText = clean(context.trend || context.topic || "", 300);

  const evidence = {
    productCompleteness: Math.min(1, [title, description, category, product.image].filter(Boolean).length / 4),
    trendRelevance: overlap([title, category, description].join(" "), trendText),
    commercialReadiness: Number(product.merchantEligible === true || product.checkoutUrl ? 1 : 0),
    freshness: Number(context.freshness ?? 0.5),
  };

  const score = Math.round(
    100 * (
      evidence.productCompleteness * 0.30 +
      evidence.trendRelevance * 0.25 +
      evidence.commercialReadiness * 0.25 +
      evidence.freshness * 0.20
    )
  );

  return {
    score: Math.max(0, Math.min(100, score)),
    evidence,
    decision: score >= 70 ? "PRIORITIZE" : score >= 45 ? "TEST" : "HOLD",
  };
}

const ANGLES = [
  ["curiosity", "רגע — למה כולם שמים לב לזה?"],
  ["problem-solution", "אם גם את נתקלת בזה, תראי איך זה עובד."],
  ["reality-check", "בלי הייפ — בואי נבדוק את הדבר החשוב באמת."],
  ["product-story", "יש סיבה שהמוצר הזה תופס את העין."],
];

const STYLES = ["ugc", "cinematic3d", "product_story"];

export function buildCreativePlan(product = {}, context = {}) {
  const scored = scoreProduct(product, context);
  const seed = hash(product.id || product.title || "likelink");
  const angle = ANGLES[seed % ANGLES.length];
  const style = STYLES[(seed >>> 4) % STYLES.length];

  return {
    engine: "likelink-intelligence-core",
    version: "1.0",
    productId: product.id || null,
    decision: scored.decision,
    score: scored.score,
    evidence: scored.evidence,
    angle: angle[0],
    hook: angle[1],
    style,
    facts: {
      title: clean(product.title, 180),
      category: clean(product.category, 80),
      description: clean(product.description, 500),
    },
    guardrails: [
      "verified_catalog_facts_only",
      "no_fake_testimonial",
      "no_fake_social_proof",
      "no_fake_discount",
      "no_real_person_impersonation",
      "no_unverified_publication_claim",
    ],
    execution: "READY_FOR_FIRST_PARTY_RENDERER",
  };
}

export function generateFirstPartyCreatorSvg(product = {}, options = {}) {
  const title = clean(product.title || "LikeLink product", 70);
  const category = clean(product.category || "Discovery", 40);
  const hook = clean(options.hook || "גילינו משהו ששווה לראות", 80);
  const safe = (value) => value
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const seed = hash(product.id || title);
  const hue = seed % 360;
  const initials = title.split(/\s+/).slice(0, 2).map((x) => x[0]).join("").toUpperCase();

  // This is an original vector creator card, generated entirely by LikeLink.
  // It is intentionally not presented as a real human photograph.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="hsl(${hue} 62% 18%)"/>
        <stop offset="100%" stop-color="hsl(${(hue + 55) % 360} 70% 10%)"/>
      </linearGradient>
      <filter id="shadow"><feDropShadow dx="0" dy="24" stdDeviation="28" flood-opacity=".35"/></filter>
    </defs>
    <rect width="1080" height="1920" fill="url(#bg)"/>
    <circle cx="820" cy="350" r="250" fill="hsl(${hue} 80% 62% / .16)"/>
    <circle cx="250" cy="1500" r="360" fill="hsl(${(hue + 55) % 360} 80% 62% / .12)"/>
    <rect x="90" y="150" width="900" height="1620" rx="56" fill="white" fill-opacity=".08" stroke="white" stroke-opacity=".18"/>
    <circle cx="540" cy="570" r="190" fill="white" fill-opacity=".12"/>
    <text x="540" y="620" text-anchor="middle" font-family="Arial,sans-serif" font-size="150" font-weight="700" fill="white">${safe(initials || "LL")}</text>
    <text x="150" y="900" font-family="Arial,sans-serif" font-size="44" font-weight="700" fill="white">${safe(hook)}</text>
    <text x="150" y="1010" font-family="Arial,sans-serif" font-size="38" fill="white" opacity=".82">${safe(title)}</text>
    <text x="150" y="1080" font-family="Arial,sans-serif" font-size="30" fill="white" opacity=".62">${safe(category)} · LikeLink original creative</text>
    <rect x="150" y="1240" width="780" height="300" rx="36" fill="white" fill-opacity=".10"/>
    <text x="190" y="1325" font-family="Arial,sans-serif" font-size="28" fill="white" opacity=".65">ORIGINAL SYNTHETIC CREATIVE</text>
    <text x="190" y="1400" font-family="Arial,sans-serif" font-size="34" font-weight="700" fill="white">No celebrity. No fake testimonial.</text>
    <text x="190" y="1460" font-family="Arial,sans-serif" font-size="30" fill="white" opacity=".78">Built by LikeLink Intelligence Core.</text>
  </svg>`;
}

export function getAiHealth() {
  return {
    ok: true,
    configured: true,
    provider: "likelink_first_party",
    engine: "likelink-intelligence-core",
    version: "1.0",
    externalDependencyRequired: false,
    capabilities: ["ranking", "trend_matching", "creative_planning", "original_svg_creative"],
  };
}

export default { scoreProduct, buildCreativePlan, generateFirstPartyCreatorSvg, getAiHealth };
