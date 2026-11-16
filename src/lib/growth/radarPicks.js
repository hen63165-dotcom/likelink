// "מי זיהתה ראשונה" — who spotted it first (the owner, 2026-11-15: "כן לטבלה"). A signed-in user with
// radar access picks a concept from the radar's own list; the pick is stored server-side with the day
// and the concept's AliExpress order count that day (the same numbers the board shows), and graded
// after 14 days exactly like the radar's own calls (HIT at ≥ +15%). The leaderboard shows only those
// who chose to appear, by nickname, never an e-mail or id. Pure; tested.
export const RADAR_PICKS_KEY = "radar:picks";
export const RADAR_PICKS_SEAL_KEY = "radar:picks:seal";
// The scouts (the owner, 2026-11-16: "1+2"): a verified scout has ≥ 3 graded hits at ≥ 60% —
// earned only from picks sealed in advance and graded like the radar's own calls.
export const SCOUT = Object.freeze({ verifiedHits: 3, verifiedPct: 60 });
export const PICKS = Object.freeze({ maxOpen: 3, gradeDays: 14, hitPct: 15, keep: 2000 });
const DAY = 86_400_000;
const NICK = /^[\p{L}\p{N} ._-]{2,20}$/u;

export const cleanNick = (s) => {
  const n = String(s || "").replace(/\s+/g, " ").trim();
  return NICK.test(n) ? n : null;
};

/** Validates and adds a pick (pure): returns { picks } or { error }. */
export function addPick(picks = [], { userId, concept, nick, show = false, base, now = Date.now() } = {}) {
  const list = Array.isArray(picks) ? picks : [];
  if (!userId) return { error: "unauthenticated" };
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(String(concept || ""))) return { error: "invalid_concept" };
  if (!(Number(base) > 0)) return { error: "concept_not_measured" };
  const name = show ? cleanNick(nick) : null;
  if (show && !name) return { error: "invalid_nickname" };
  const open = list.filter((p) => p.userId === userId && !p.result);
  if (open.some((p) => p.concept === concept)) return { error: "already_picked" };
  if (open.length >= PICKS.maxOpen) return { error: "too_many_open" };
  const at = new Date(now).toISOString().slice(0, 10);
  const pick = { id: `${userId.slice(0, 8)}-${concept}-${at}`, userId, concept, nick: name, show: Boolean(show && name), at, base: Number(base), due: new Date(Date.parse(at) + PICKS.gradeDays * DAY).toISOString().slice(0, 10), sealedAt: new Date(now).toISOString() };
  return { pick, picks: [...list, pick].slice(-PICKS.keep) };
}

/** Grades every due pick against today's order counts (pure; a graded pick never changes). */
export function gradePicks(picks = [], ordersByConcept = {}, today) {
  return (Array.isArray(picks) ? picks : []).map((p) => {
    if (p.result || !today || today < p.due) return p;
    const now = Number(ordersByConcept[p.concept]);
    if (!Number.isFinite(now) || !(p.base > 0)) return p;
    const growth = Math.round((now / p.base - 1) * 1000) / 10;
    return { ...p, result: growth >= PICKS.hitPct ? "HIT" : "MISS", growth, gradedAt: today };
  });
}

/** The public table: only those who chose to appear, by nickname; hits, then the earliest hit. */
export function leaderboard(picks = [], { top = 20 } = {}) {
  const by = new Map();
  for (const p of Array.isArray(picks) ? picks : []) {
    if (!p.show || !p.nick) continue;
    const r = by.get(p.userId) || { nick: p.nick, bot: p.userId === RADAR_PLAYER.userId, hits: 0, graded: 0, open: 0, firstHit: null };
    r.nick = p.nick;
    if (p.result) { r.graded++; if (p.result === "HIT") { r.hits++; if (!r.firstHit || p.at < r.firstHit) r.firstHit = p.at; } } else r.open++;
    by.set(p.userId, r);
  }
  return [...by.values()]
    .sort((a, b) => b.hits - a.hits || String(a.firstHit || "9").localeCompare(String(b.firstHit || "9")) || b.graded - a.graded)
    .slice(0, top)
    .map((r, i) => {
      const accuracy = r.graded ? Math.round((r.hits / r.graded) * 100) : null;
      return { rank: i + 1, ...r, accuracy, verified: r.hits >= SCOUT.verifiedHits && accuracy >= SCOUT.verifiedPct };
    });
}

/**
 * The text every pick is sealed with (its SHA-256 goes to OpenTimestamps on the radar's daily put):
 * one line per pick — day, concept, the order count it is graded against, and the public nickname
 * (or "anon" when she did not choose to appear). Never a user id or an e-mail. Sorted, so anyone
 * holding the same picks recomputes the same text.
 */
export function picksSealText(picks = []) {
  return (Array.isArray(picks) ? picks : [])
    .filter((p) => p && p.at && p.concept)
    .map((p) => `${p.at}|${p.concept}|${Number(p.base) || 0}|${p.show && p.nick ? String(p.nick).replace(/[|\n]/g, " ") : "anon"}`)
    .sort()
    .join("\n");
}

/** One user's own picks, without anyone else's data. */
export const myPicks = (picks = [], userId) => (Array.isArray(picks) ? picks : []).filter((p) => p.userId === userId).map(({ userId: _u, ...p }) => p);

// "הרדאר נגד ישראל" (the owner, 2026-11-16: "the radar must be what everyone talks about, one of a kind";
// a worldwide check the same day found AI-vs-human forecasting only on general questions, Metaculus
// FutureEval, and no product-trend duel sealed in advance): the radar plays on the same table. Every
// day it seals one pick of its own from the day's board, by the same rules as everyone (one open pick
// per concept, graded after 14 days, HIT at ≥ +15%), and the duel compares its record with everyone
// else's. Its pick is chosen by its own measurements only: a concept the board says is starting to
// rise (EMERGING), then rising (RISING), then steady, strongest Alpha first. Never PEAK or COOLING.
export const RADAR_PLAYER = Object.freeze({ userId: "radar", nick: "הרדאר" });
export const DUEL = Object.freeze({ minGraded: 3 });
const STAGE_RANK = Object.freeze({ EMERGING: 3, RISING: 2, STEADY: 1 });
const ID = /^[a-z0-9][a-z0-9-]{1,40}$/;
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);

/** The radar's candidates for today, best first (its own measurements only). */
export function radarCandidates(board) {
  return (Array.isArray(board?.concepts) ? board.concepts : [])
    .filter((c) => c && ID.test(String(c.id || "")) && Number(c.today?.orders) > 0 && STAGE_RANK[c.stage])
    .sort((a, b) => STAGE_RANK[b.stage] - STAGE_RANK[a.stage]
      || (Number(b.alpha?.score) || -1) - (Number(a.alpha?.score) || -1)
      || (Number(b.early?.count) || 0) - (Number(a.early?.count) || 0)
      || (a.id < b.id ? -1 : 1));
}

/** Adds the radar's sealed pick for the board's day (once a day; never a concept it already has open). */
export function addRadarPick(picks = [], board, { now = Date.now() } = {}) {
  const list = Array.isArray(picks) ? picks : [];
  const at = /^\d{4}-\d{2}-\d{2}/.test(String(board?.at || "")) ? String(board.at).slice(0, 10) : dayOf(now);
  const mine = list.filter((p) => p.userId === RADAR_PLAYER.userId);
  if (mine.some((p) => p.at === at)) return list;
  const open = new Set(mine.filter((p) => !p.result).map((p) => p.concept));
  const c = radarCandidates(board).find((x) => !open.has(x.id));
  if (!c) return list;
  const pick = { id: `radar-${c.id}-${at}`, userId: RADAR_PLAYER.userId, bot: true, concept: c.id, nick: RADAR_PLAYER.nick, show: true, at, base: Number(c.today.orders), stage: c.stage, due: new Date(Date.parse(at) + PICKS.gradeDays * DAY).toISOString().slice(0, 10), sealedAt: new Date(now).toISOString() };
  return [...list, pick].slice(-PICKS.keep);
}

const tally = (rows) => {
  const graded = rows.filter((p) => p.result);
  const hits = graded.filter((p) => p.result === "HIT").length;
  return { hits, graded: graded.length, open: rows.length - graded.length, accuracy: graded.length ? Math.round((hits / graded.length) * 100) : null };
};

/**
 * The duel: the radar's record against everyone else's (every human pick counts, shown on the table
 * or not; counts only, never a name). A leader is named only once both sides have DUEL.minGraded
 * graded picks; before that the page says when the first grades land.
 */
export function duelOf(picks = [], { openPicks = false } = {}) {
  const list = Array.isArray(picks) ? picks : [];
  const radarRows = list.filter((p) => p.userId === RADAR_PLAYER.userId);
  const crowdRows = list.filter((p) => p.userId !== RADAR_PLAYER.userId);
  const radar = tally(radarRows);
  const crowd = { ...tally(crowdRows), players: new Set(crowdRows.map((p) => p.userId)).size };
  const ready = radar.graded >= DUEL.minGraded && crowd.graded >= DUEL.minGraded;
  const leader = !ready ? null : radar.accuracy > crowd.accuracy ? "radar" : crowd.accuracy > radar.accuracy ? "crowd" : "tie";
  const firstDue = radarRows.filter((p) => !p.result).map((p) => p.due).sort()[0] || null;
  const recent = radarRows.slice().sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 14)
    .filter((p) => p.result || openPicks)
    .map((p) => ({ concept: p.concept, at: p.at, due: p.due, result: p.result || null, growth: p.result ? p.growth : null }));
  return { radar, crowd, leader, firstDue, recent };
}

/** Whether a player beat the radar: both have DUEL.minGraded graded picks and her accuracy is higher. */
export function beatsRadar(picks = [], userId) {
  const list = Array.isArray(picks) ? picks : [];
  const me = tally(list.filter((p) => p.userId === userId));
  const radar = tally(list.filter((p) => p.userId === RADAR_PLAYER.userId));
  return Boolean(userId && userId !== RADAR_PLAYER.userId && me.graded >= DUEL.minGraded && radar.graded >= DUEL.minGraded && me.accuracy > radar.accuracy);
}
