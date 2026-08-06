// Admin access code is read from the environment so it is never baked into
// the shipped bundle. If it is unset, the admin panel stays locked.
export const ADMIN_CODE = import.meta.env.VITE_ADMIN_CODE || "";

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
