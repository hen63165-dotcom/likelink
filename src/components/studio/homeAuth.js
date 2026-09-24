// A product counts as "live" when it is approved/active/published.
export const isAuthorized = (p) =>
  p?.status === "approved" || p?.status === "active" || p?.status === "published";