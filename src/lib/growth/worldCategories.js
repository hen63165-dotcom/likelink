// Every category in the world (the owner, 2026-11-16: "every product in the world, every subject,
// every category: we never stop, we keep finding"). The shop's own categories cover what LikeLink2
// sells today; the radar must see everything. AliExpress's official category list
// (aliexpress.affiliate.category.get: every top-level and second-level category) is read once a
// week, and every run reads the next slice of it in rotation, so the whole tree is covered every
// few days: each category's new listings of the year join the fresh risers, and its hot list joins
// the waves. Pure: the runner (scripts/catalog/trend-radar.mjs) does the reading.
// 17.11 (the owner: "תתחיל ותעשה הכל"): 12 a day meant a category came back only every ~47 days, so
// its items were never read twice within the 3–14 days a riser needs and the world could not
// produce a riser. Now 120 a day: every fashion category every day (the owner: "פריטי אופנה,
// אקססוריז ובגדים, כל מה שקשור באופנה"), the rest in rotation, so every kind is read again within
// a week. A store limit stops the day's reading; tomorrow continues from the cursor.
export const WORLD = Object.freeze({ perRun: 120, fashionMax: 48, refreshDays: 7, budgetMs: 300_000 });

/** Fashion and accessories, by the category's own (English) name or its parent's (pure). */
export const FASHION = /\b(?:women'?s?|men'?s?|clothing|apparel|dress|tops?|bottoms?|jeans|pants|skirts?|coats?|jackets?|sweaters?|knit|shoes?|sneakers?|boots?|sandals?|heels?|flats|slippers|bags?|handbags?|wallets?|backpacks?|jewel(?:le)?ry|necklaces?|earrings?|rings?|bracelets?|watch(?:es)?|eyewear|sunglasses|hats?|caps?|scarf|scarves|belts?|hair|wigs?|underwear|lingerie|socks|swimwear|fashion|accessor(?:y|ies))\b/i;
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

/**
 * Today's categories (pure; tested): every fashion category (by its name or its parent's, up to
 * fashionMax), then the others in rotation from the cursor up to perRun. `next` moves only the
 * rotation's cursor; `days` is how often a non-fashion category comes back.
 */
export function worldSlice(list = [], cursor = 0, { rules = WORLD } = {}) {
  const byId = new Map((Array.isArray(list) ? list : []).map((c) => [c.id, c]));
  const isFashion = (c) => FASHION.test(c.name || "") || (c.parent && FASHION.test(byId.get(c.parent)?.name || ""));
  const fashion = [...byId.values()].filter((c) => c.parent && isFashion(c)).sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, rules.fashionMax);
  const fashionIds = new Set(fashion.map((c) => c.id));
  const rest = [...byId.values()].filter((c) => !fashionIds.has(c.id));
  const rot = rotation(rest, cursor, Math.max(0, rules.perRun - fashion.length));
  return { slice: [...fashion, ...rot.slice], fashion: fashion.length, next: rot.next, total: byId.size, days: rot.days, restList: rest };
}

/** Today's slice in rotation and the next cursor; second-level categories first (they are the specific kinds). */
export function rotation(list = [], cursor = 0, n = WORLD.perRun) {
  const order = [...list].sort((a, b) => (a.parent ? 0 : 1) - (b.parent ? 0 : 1) || (a.id < b.id ? -1 : 1));
  if (!order.length) return { slice: [], next: 0, total: 0, days: 0 };
  const start = ((Number(cursor) || 0) % order.length + order.length) % order.length;
  const slice = Array.from({ length: Math.min(n, order.length) }, (_, i) => order[(start + i) % order.length]);
  return { slice, next: (start + slice.length) % order.length, total: order.length, days: Math.ceil(order.length / Math.max(1, n)) };
}
