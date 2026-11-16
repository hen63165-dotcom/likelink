// Hot-only posting (the owner, 2026-11-16: "every product sent to Telegram must be a crazy product
// that not everyone has yet, with crazy demand — my channel must be unique"). The radar checks every
// site product daily against its 8 criteria (radarIntel.js criteriaOf: hot now, momentum, rising, not
// saturated in Israel, ≥ 300 orders, ships to Israel, pays commission, quality); only KEEP rows reach
// board.site.keep. The owner's channel posts only those, strongest Alpha first. No KEEP product →
// nothing is posted (silence beats a product everyone already has). Pure; tested.
export function hotOnlyPool(pool = [], board = null) {
  const keep = Array.isArray(board?.site?.keep) ? board.site.keep : null;
  if (!keep) return { pool: [], reason: "radar_board_missing" };
  const rank = new Map(keep.map((r, i) => [String(r.id), { i, alpha: Number(r.alpha) }]));
  const out = (Array.isArray(pool) ? pool : []).filter((p) => rank.has(String(p?.id)));
  out.sort((a, b) => (rank.get(String(b.id)).alpha || 0) - (rank.get(String(a.id)).alpha || 0) || rank.get(String(a.id)).i - rank.get(String(b.id)).i);
  return { pool: out, reason: out.length ? null : "no_hot_product_today" };
}
