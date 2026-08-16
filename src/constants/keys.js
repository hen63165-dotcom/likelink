// Admin access code is read from the environment so it is never baked into
// the shipped bundle. If it is unset, the admin panel stays locked.
export const ADMIN_CODE = import.meta.env.VITE_ADMIN_CODE || "";

// ─── Platform URL ──────────────────────────────────────────────────────────
export const PLATFORM_URL = window.location.origin;

// ─── Platform revenue model ────────────────────────────────────────────────
// Likelink takes a flat % cut of each creator's affiliate commission. The
// seller keeps the rest. This is the industry-standard creator-marketplace
// split (platform ~10–20%, creator ~80–90%).
//
// To adjust the commission later, change the single value below.
export const PLATFORM_FEE_PERCENT_DEFAULT = 15; // 15% platform, 85% creator
export const PLATFORM_FEE_MIN = 0;
export const PLATFORM_FEE_MAX = 40;

// ─── Payout model (LTK-style: the platform is the affiliate; creators get paid) ──
export const MIN_PAYOUT_THRESHOLD = 100; // ₪ minimum pending balance to be eligible
export const PAYOUT_INTERVAL_DAYS = 14; // biweekly payout schedule
export const PAYOUT_METHOD = "paypal"; // manual PayPal for now (not automated)

// ─── Boost feature (direct revenue WITHOUT a payment gateway) ───────────
// Sellers pay from their own pending balance, so nobody needs a card.
export const BOOST_PRICE = 25;            // ₪ — deducted from the seller's balance
export const BOOST_DURATION_HOURS = 24;   // product stays pinned at the top of the feed

export const K = {
  marketers: "marketplace:marketers",
  products: "marketplace:products",
  clicks: "marketplace:clicks",
  sales: "marketplace:sales",
  settings: "marketplace:settings",
  session: "session:marketerId",
  favorites: "ui:favorites",
  introSeen: "ui:sellIntroSeen",
  collections: "marketplace:collections",
  following: "ui:following",
  notifications: "marketplace:notifications",
  payouts: "marketplace:payouts",
  charges: "marketplace:charges",
  theme: "ui:theme",
};
