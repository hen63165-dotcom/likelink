/**
 * Live Drop System ⚡ — Flash sales with REAL countdown timers.
 * =============================================================
 * Creates massive FOMO like the biggest influencers:
 *   • "Drop" — limited product release at specific time
 *   • Countdown timer — live, ticking down
 *   • Stock meter — "87% sold out"
 *   • Social proof — "23 people viewing right now"
 *   • Last chance alerts — "Only 5 minutes left!"
 */

// Active drops — products on flash sale
const DROPS = [
  {
    id: "drop_1",
    productId: "p1",
    originalPrice: 189,
    dropPrice: 99,
    stock: 12,
    sold: 88,
    endsAt: Date.now() + 2 * 60 * 60 * 1000, // 2 hours from now
    viewers: 34,
  },
  {
    id: "drop_2",
    productId: "p3",
    originalPrice: 45,
    dropPrice: 29,
    stock: 5,
    sold: 95,
    endsAt: Date.now() + 45 * 60 * 1000, // 45 minutes
    viewers: 67,
  },
  {
    id: "drop_3",
    productId: "p15",
    originalPrice: 179,
    dropPrice: 119,
    stock: 23,
    sold: 77,
    endsAt: Date.now() + 4 * 60 * 60 * 1000, // 4 hours
    viewers: 12,
  },
];

/**
 * Get active drops with live countdown.
 */
export function getActiveDrops(now = Date.now()) {
  return DROPS.map((drop) => {
    const timeLeft = Math.max(0, drop.endsAt - now);
    const totalStock = drop.stock + drop.sold;
    const soldPercent = Math.round((drop.sold / totalStock) * 100);
    const isEndingSoon = timeLeft < 30 * 60 * 1000; // Under 30 minutes
    const isAlmostSoldOut = drop.stock <= 5;

    return {
      ...drop,
      timeLeft,
      timeLeftFormatted: formatTimeLeft(timeLeft),
      soldPercent,
      isEndingSoon,
      isAlmostSoldOut,
      urgency: getUrgencyLevel(timeLeft, drop.stock),
      alert: generateDropAlert(timeLeft, drop.stock, soldPercent),
      viewers: drop.viewers + Math.floor(Math.random() * 5), // Simulate live viewers
    };
  }).filter((d) => d.timeLeft > 0);
}

/**
 * Generate a drop alert — what Luna says about this drop.
 */
function generateDropAlert(timeLeft, stock, soldPercent) {
  if (timeLeft < 10 * 60 * 1000) {
    return "רגע אחרון! זה נגמר עוד דקות";
  }
  if (stock <= 3) {
    return `רק ${stock} נותרו! תמהרו`;
  }
  if (soldPercent >= 90) {
    return `${soldPercent}% נמכר — עוד מעט נגמר`;
  }
  return `${100 - soldPercent}% נותרו — תפסימו עד שזה נגמר`;
}

function getUrgencyLevel(timeLeft, stock) {
  if (timeLeft < 15 * 60 * 1000 || stock <= 3) return "critical";
  if (timeLeft < 30 * 60 * 1000 || stock <= 10) return "high";
  return "medium";
}

function formatTimeLeft(ms) {
  if (ms <= 0) return "נגמר";
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}