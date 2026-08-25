/* ============================================================
   LIKELINK — Seller Engagement Engine (2026)
   ------------------------------------------------------------
   Creates healthy, quiet psychological competition between
   sellers and continuous publishing hunger via:
     1) Leaderboard      — live rankings by earnings / clicks
     2) Streaks          — daily publishing streak counter
     3) Badges           — achievement badges (Top Seller,
                           Rising Star, Consistent Creator …)
     4) Rival nudge      — gentle "2 places behind the leader"
                           comparison (no negativity, no names)
     5) Weekly digest    — auto-generated performance summary
   Everything is pure, guarded, localStorage-friendly pure
   functions — no side effects, no network, no failures.
   ============================================================ */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/* ---------- 1) Leaderboard ---------- */

/**
 * Builds a rank-ordered leaderboard of sellers.
 * @param {Array} sales     - marketplace:sales records
 * @param {Array} products  - marketplace:products records
 * @param {Array} marketers - marketplace:marketers records
 * @returns {Array} sorted [{ marketerId, name, earnings, clicks, salesCount }]
 */
export function buildLeaderboard(sales = [], products = [], marketers = []) {
  const earningsBySeller = {};
  const salesCountBySeller = {};
  (Array.isArray(sales) ? sales : []).forEach((s) => {
    if (!s || !s.marketerId) return;
    earningsBySeller[s.marketerId] = (earningsBySeller[s.marketerId] || 0) + (s.marketerNet || 0);
    salesCountBySeller[s.marketerId] = (salesCountBySeller[s.marketerId] || 0) + 1;
  });

  const clicksBySeller = {};
  (Array.isArray(products) ? products : []).forEach((p) => {
    if (!p || !p.marketerId) return;
    clicksBySeller[p.marketerId] = (clicksBySeller[p.marketerId] || 0) + (p.clicks || 0);
  });

  const idToMarketer = {};
  (Array.isArray(marketers) ? marketers : []).forEach((m) => {
    if (m && m.id) idToMarketer[m.id] = m;
  });

  const allIds = new Set([
    ...Object.keys(earningsBySeller),
    ...Object.keys(clicksBySeller),
  ]);

  const board = Array.from(allIds)
    .map((id) => {
      const mk = idToMarketer[id];
      return {
        marketerId: id,
        name: (mk && mk.name) || "Seller",
        earnings: Math.round((earningsBySeller[id] || 0) * 100) / 100,
        salesCount: salesCountBySeller[id] || 0,
        clicks: clicksBySeller[id] || 0,
      };
    })
    .sort((a, b) => b.earnings - a.earnings || b.clicks - a.clicks);

  let rank = 0;
  let prevKey = null;
  board.forEach((row, i) => {
    const key = `${row.earnings}-${row.clicks}`;
    if (key !== prevKey) rank = i + 1;
    row.rank = rank;
    prevKey = key;
  });

  return board;
}

/* ---------- 2) Streaks ---------- */

/**
 * Computes the current publishing streak (consecutive days with
 * at least one sale or product action). Returns { days, lastActiveDay }.
 * @param {Array} sales - seller's sales records
 */
export function computeStreak(sales = []) {
  const activeDays = new Set();
  (Array.isArray(sales) ? sales : []).forEach((s) => {
    if (!s || !s.ts) return;
    const day = new Date(s.ts).toISOString().slice(0, 10);
    activeDays.add(day);
  });

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);

  if (!activeDays.has(today) && !activeDays.has(yesterday)) {
    return { days: 0, lastActiveDay: yesterday };
  }

  let days = 0;
  const cursor = new Date();
  if (!activeDays.has(today)) cursor.setTime(cursor.getTime() - DAY_MS);
  while (activeDays.has(cursor.toISOString().slice(0, 10))) {
    days += 1;
    cursor.setTime(cursor.getTime() - DAY_MS);
  }
  return { days, lastActiveDay: activeDays.has(today) ? today : yesterday };
}

/* ---------- 3) Badges ---------- */

/**
 * Awards achievement badges based on seller stats.
 * @param {Object} stats - { earnings, salesCount, clicks, streak, productCount }
 * @returns {Array<string>} badge keys
 */
export function awardBadges(stats = {}) {
  const badges = [];
  const e = stats.earnings || 0;
  const sales = stats.salesCount || 0;
  const clicks = stats.clicks || 0;
  const streak = stats.streak || 0;
  const products = stats.productCount || 0;

  if (e >= 1000) badges.push("top_seller");
  else if (e >= 250) badges.push("rising_star");
  if (streak >= 7) badges.push("consistent_creator");
  if (streak >= 30) badges.push("dedicated_icon");
  if (clicks >= 100) badges.push("traffic_magnet");
  if (sales >= 10) badges.push("proven_seller");
  if (products >= 5) badges.push("curator");
  if (sales === 0 && products > 0) badges.push("new_comer");
  return badges;
}

/* ---------- 4) Rival nudge (quiet, positive) ---------- */

/**
 * Returns a gentle competitive nudge for a seller based on their
 * position vs the leader. Never names rivals — only position.
 * @param {Array} board - leaderboard from buildLeaderboard
 * @param {string} sellerId
 */
export function rivalNudge(board = [], sellerId) {
  const me = board.find((r) => r.marketerId === sellerId);
  if (!me) return null;
  if (me.rank === 1) return { type: "leading", text: "You are the #1 creator this week. Protect your throne!" };
  if (me.rank === 2) return { type: "close", text: "You are just 1 step from the top. One more sale could flip it." };
  const ahead = me.rank - 1;
  const places = ahead === 1 ? "1 creator" : `${ahead} creators`;
  return {
    type: "chasing",
    text: `You're ${me.rank} places from the leaderboard lead. Every listing is a step up.`,
    places,
  };
}

/* ---------- 5) Weekly digest (auto-generated) ---------- */

/**
 * Builds a text summary of a seller's week for auto-notifications.
 * @param {Array} sales - seller's sales (weekly filtered)
 * @param {Array} products - seller's products
 */
export function buildWeeklyDigest(sales = [], products = []) {
  const weekStart = Date.now() - WEEK_MS;
  const weekly = (Array.isArray(sales) ? sales : []).filter((s) => s.ts >= weekStart);
  const totalEarned = weekly.reduce((s, x) => s + (x.marketerNet || 0), 0);
  const totalSales = weekly.length;
  const clicks = (Array.isArray(products) ? products : []).reduce((s, p) => s + (p.clicks || 0), 0);

  const lines = [];
  lines.push(`📊 Weekly Report — ${totalSales} sales, ${clicks} clicks`);
  lines.push(`💰 Net earnings: $${totalEarned.toFixed(2)}`);
  if (totalSales >= 5) lines.push("🔥 Hot streak! Keep publishing daily to stay on top.");
  else if (totalSales >= 1) lines.push("🌱 Good momentum. Consistency beats bursts.");
  else lines.push("📌 No sales yet this week — publish 2 new listings to get discovered.");
  return lines.join("\n");
}

/* ---------- 6) Storage-safe helpers ---------- */

export function saveDailyPing(storageKey = "ui:sellerStreakPing") {
  try {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(storageKey, JSON.stringify({ day: today, ts: Date.now() }));
    return true;
  } catch { return false; }
}

export function getLastPing(storageKey = "ui:sellerStreakPing") {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}