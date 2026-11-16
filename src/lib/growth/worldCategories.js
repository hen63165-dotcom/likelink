// Every category in the world (the owner, 2026-11-16: "every product in the world, every subject,
// every category: we never stop, we keep finding"). The shop's own categories cover what LikeLink2
// sells today; the radar must see everything. AliExpress's official category list
// (aliexpress.affiliate.category.get: every top-level and second-level category) is read once a
// week, and every run reads the next slice of it in rotation, so the whole tree is covered every
// few days: each category's new listings of the year join the fresh risers, and its hot list joins
// the waves. Pure: the runner (scripts/catalog/trend-radar.mjs) does the reading.
export const WORLD = Object.freeze({ perRun: 12, refreshDays: 7, budgetMs: 90_000 });
export const CATEGORY_GET = "aliexpress.affiliate.category.get";

/** The categories in the store's answer: [{ id, name, parent }] (parent null for a top level). */
export function categoriesOf(answer) {
  const r = answer?.aliexpress_affiliate_category_get_response?.resp_result;
  if (Number(r?.resp_code) !== 200) return null;
  const raw = r.result?.categories?.category;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const seen = new Set();
  const out = [];
  for (const c of list) {
    const id = String(c?.category_id ?? "");
    const name = String(c?.category_name || "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (!/^\d{1,12}$/.test(id) || !name || seen.has(id)) continue;
    seen.add(id);
    const parent = c?.parent_category_id != null && /^\d{1,12}$/.test(String(c.parent_category_id)) ? String(c.parent_category_id) : null;
    out.push({ id, name, parent });
  }
  return out;
}

/** Whether the stored list is missing or older than refreshDays. */
export const needsRefresh = (state, today, rules = WORLD) => !state?.at || !Array.isArray(state.list) || !state.list.length || (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${state.at}T00:00:00Z`)) / 86_400_000 >= rules.refreshDays;

/** Today's slice in rotation and the next cursor; second-level categories first (they are the specific kinds). */
export function rotation(list = [], cursor = 0, n = WORLD.perRun) {
  const order = [...list].sort((a, b) => (a.parent ? 0 : 1) - (b.parent ? 0 : 1) || (a.id < b.id ? -1 : 1));
  if (!order.length) return { slice: [], next: 0, total: 0, days: 0 };
  const start = ((Number(cursor) || 0) % order.length + order.length) % order.length;
  const slice = Array.from({ length: Math.min(n, order.length) }, (_, i) => order[(start + i) % order.length]);
  return { slice, next: (start + slice.length) % order.length, total: order.length, days: Math.ceil(order.length / Math.max(1, n)) };
}
