// Admin access code is read from the environment so it is never baked into
// the shipped bundle. If it is unset, the admin panel stays locked.
export const ADMIN_CODE = import.meta.env.VITE_ADMIN_CODE || "";

// ─── Platform revenue model ────────────────────────────────────────────────
// Likelink takes a flat % cut of each creator's affiliate commission. The
// seller keeps the rest. This is the industry-standard creator-marketplace
// split (platform ~10–20%, creator ~80–90%).
//
// To adjust the commission later, change the single value below.
export const PLATFORM_FEE_PERCENT_DEFAULT = 15; // 15% platform, 85% creator
export const PLATFORM_FEE_MIN = 0;
export const PLATFORM_FEE_MAX = 40;

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
  theme: "ui:theme",
};
