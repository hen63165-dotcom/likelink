// 🔮 The weekly challenge (the owner, 2026-11-16: "כן לאתגר"; Base44's founder grew by building in
// public on LinkedIn and X, so the challenge lives where he posted). Every week the radar offers four
// products it measures and asks: which one will grow the most in orders in the next 14 days? People
// vote in the owner's own LinkedIn/X poll; the radar's own choice is sealed BEFORE the post (commit:
// only the SHA-256 of a text with a random salt is public, so nobody can read the choice off four
// options) and revealed at grading with the salt, so anyone can recompute the hash. Graded by the same
// numbers as every radar call (the top items' 30-day orders, now vs the sealed base), never edited.
// The radar is the yardstick, never the enemy (the owner, 2026-11-16: no "נגד"). Posts say what IS:
// no promise of a hit, no prize. Pure; the radar run (scripts/catalog/trend-radar.mjs) reads and seals.

export const CHALLENGE = Object.freeze({
  options: 4,
  days: 14, // graded after this many days, like every radar call
  everyDays: 7, // a new challenge a week after the last one
  labelMax: 30, // LinkedIn's poll option limit
  questionMax: 140, // LinkedIn's poll question limit
  stages: Object.freeze(["EMERGING", "RISING", "STEADY"]),
  graceDays: 3, // a missing reading on the due day waits up to this long
});

const STAGE_RANK = { EMERGING: 0, RISING: 1, STEADY: 2 };
const DAY = 86_400_000;
const addDays = (d, n) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
export const dm = (d) => (typeof d === "string" && d.length >= 10 ? `${Number(d.slice(8, 10))}.${Number(d.slice(5, 7))}` : "");

/** A poll label of at most `max` characters, cut at a word (pure). */
export function shortLabel(text = "", max = CHALLENGE.labelMax) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1).replace(/\s+\S*$/, "");
  return (cut || t.slice(0, max)).trim();
}

/**
 * The four options and the radar's own choice (pure; tested). Rows: { id, he, kind, stage, score,
 * base, image?, auto? }. Only watch-list kinds with a Hebrew name, a measured base (orders > 0) and a
 * stage in EMERGING/RISING/STEADY; one per kind; the radar picks its strongest by its own measurements
 * (stage first, then score). The options are shown in Hebrew alphabetical order, so the choice never
 * shows in the order. Null when fewer than four qualify (the next run tries again).
 */
export function pickOptions(rows = [], { rules = CHALLENGE } = {}) {
  const ok = (Array.isArray(rows) ? rows : []).filter((r) => r && !r.auto && /[֐-׿]/.test(String(r.he || "")) && Number(r.base) > 0 && rules.stages.includes(r.stage));
  ok.sort((a, b) => STAGE_RANK[a.stage] - STAGE_RANK[b.stage] || (Number(b.score) || 0) - (Number(a.score) || 0) || (a.id < b.id ? -1 : 1));
  const kinds = new Set();
  const chosen = [];
  for (const r of ok) {
    if (kinds.has(r.kind || r.id)) continue;
    kinds.add(r.kind || r.id);
    chosen.push(r);
    if (chosen.length === rules.options) break;
  }
  if (chosen.length < rules.options) return null;
  const radar = chosen[0].id;
  const options = chosen.map((r) => ({ concept: r.id, label: shortLabel(r.he, rules.labelMax), base: Number(r.base), image: typeof r.image === "string" ? r.image : null }))
    .sort((a, b) => a.label.localeCompare(b.label, "he"));
  return { options, radar };
}

/** The sealed text (pure): the id, the day, the options, the radar's choice and the salt. */
export function challengeSealText(ch) {
  return `${ch.id}|${ch.at}|${ch.options.map((o) => o.concept).join(",")}|radar=${ch.radar}|salt=${ch.salt}`;
}

/** A new challenge when none is open and the last one is a week old (pure). */
export function shouldOpen(list = [], today, { rules = CHALLENGE } = {}) {
  const all = Array.isArray(list) ? list : [];
  if (all.some((c) => !c.result)) return false;
  const last = all.map((c) => c.at).sort().at(-1);
  return !last || Date.parse(today) - Date.parse(last) >= rules.everyDays * DAY;
}

export function openChallenge(picked, today, salt, { rules = CHALLENGE } = {}) {
  return { id: `ch-${today}`, at: today, due: addDays(today, rules.days), options: picked.options, radar: picked.radar, salt: String(salt) };
}

/**
 * Grades an open challenge on or after its due day from the latest order sums (pure; tested): each
 * option's growth since its sealed base, the winner (the highest growth), and whether the radar's
 * choice won. A missing reading waits up to `graceDays`; then the options with a reading decide.
 */
export function gradeChallenge(ch, latest = {}, today, { rules = CHALLENGE } = {}) {
  if (!ch || ch.result || today < ch.due) return ch;
  const growth = ch.options.map((o) => {
    const now = Number(latest[o.concept]);
    return { concept: o.concept, growth: Number.isFinite(now) && o.base > 0 ? Math.round((now / o.base - 1) * 1000) / 10 : null };
  });
  const missing = growth.some((g) => g.growth === null);
  if (missing && Date.parse(today) - Date.parse(ch.due) < rules.graceDays * DAY) return ch;
  const measured = growth.filter((g) => g.growth !== null);
  if (!measured.length) return { ...ch, result: "VOID", gradedAt: today, growth };
  const top = Math.max(...measured.map((g) => g.growth));
  const winners = measured.filter((g) => g.growth === top).map((g) => g.concept);
  return { ...ch, result: winners.includes(ch.radar) ? "HIT" : "MISS", gradedAt: today, growth, winners };
}

/** Each option's change so far (the live scoreboard), from the latest order sums (pure). */
export function progressOf(ch, latest = {}) {
  return ch.options.map((o) => {
    const now = Number(latest[o.concept]);
    return { concept: o.concept, pct: Number.isFinite(now) && o.base > 0 ? Math.round((now / o.base - 1) * 1000) / 10 : null };
  });
}

/** What the board carries (pure): the open challenge without the choice or the salt; graded ones revealed. */
export function challengeBoard(list = [], latest = {}, today, seals = {}) {
  const all = Array.isArray(list) ? list : [];
  const open = all.find((c) => !c.result) || null;
  const graded = all.filter((c) => c.result && c.result !== "VOID").sort((a, b) => (a.at < b.at ? 1 : -1));
  const label = (c, id) => c.options.find((o) => o.concept === id)?.label || id;
  return {
    open: open ? {
      id: open.id, at: open.at, due: open.due,
      dayN: Math.max(0, Math.round((Date.parse(today) - Date.parse(open.at)) / DAY)),
      options: open.options.map((o) => ({ concept: o.concept, label: o.label, image: o.image || null })),
      progress: progressOf(open, latest),
      seal: seals[open.id] || null,
    } : null,
    recent: graded.slice(0, 6).map((c) => ({
      id: c.id, at: c.at, due: c.due, gradedAt: c.gradedAt, result: c.result,
      radar: c.radar, radarLabel: label(c, c.radar), winners: c.winners || [], winnerLabels: (c.winners || []).map((w) => label(c, w)),
      options: c.options.map((o) => ({ concept: o.concept, label: o.label, growth: (c.growth || []).find((g) => g.concept === o.concept)?.growth ?? null })),
      text: challengeSealText(c), seal: seals[c.id] || null,
    })),
    record: { graded: graded.length, radarHits: graded.filter((c) => c.result === "HIT").length },
  };
}

const pct = (v) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${v}%`);
// "פרס" only as a word: "אליאקספרס" contains it.
const FORBIDDEN = /מבטיח|בטוח ש|100% (?:בטוח|הצלחה|guaranteed)|היחיד בעולם|(?:^|\s)פרס|כסף בחזרה|guarantee|the only one/i;

/** The posts the owner publishes herself (pure; tested): the poll and its text, and the results. */
export function challengePosts(board, { origin = "https://likelink2.vercel.app" } = {}) {
  const out = { open: null, result: null };
  const o = board?.open;
  const link = `${origin}/radar?utm_source=linkedin&utm_medium=challenge#challenge`;
  if (o) {
    const fp = o.seal?.sha256 ? o.seal.sha256.slice(0, 16) : null;
    const question = `איזה מוצר יזנק הכי הרבה בהזמנות עד ${dm(o.due)}?`.slice(0, CHALLENGE.questionMax);
    out.open = {
      question,
      options: o.options.map((x) => x.label),
      duration: "שבועיים",
      he: [
        "🔮 האתגר השבועי של רדאר הטרנדים",
        "",
        `איזה מ־${o.options.length} המוצרים האלה יזנק הכי הרבה בהזמנות באליאקספרס עד ${dm(o.due)}?`,
        "",
        fp ? `הרדאר כבר בחר, והבחירה שלו חתומה מראש בביטקוין (טביעת אצבע ${fp}…).` : "הרדאר כבר בחר, והבחירה שלו חתומה מראש.",
        `ב־${dm(o.due)} נפתח את החתימה ונראה מה אמר החוש השישי שלכם, ומה אמר הרדאר.`,
        "הציון לפי ההזמנות האמיתיות, בפומבי.",
        "",
        "הצביעו בסקר 👇 וכתבו בתגובות למה בחרתם.",
        "",
        `הלוח החי: ${link}`,
        "",
        "#בונהבפומבי #טרנדים #AI #רדאר_הטרנדים",
      ].join("\n"),
      en: [
        "🔮 This week's trend radar challenge",
        "",
        `Which of these ${o.options.length} products will grow the most in AliExpress orders by ${o.due}?`,
        ...o.options.map((x, i) => `${i + 1}. ${x.label}`),
        "",
        fp ? `The radar already chose, sealed in Bitcoin in advance (fingerprint ${fp}…).` : "The radar already chose, sealed in advance.",
        `On ${o.due} the seal opens and the real orders decide, in public.`,
        "What does your sixth sense say? Vote below 👇",
        "",
        `${origin}/radar?utm_source=x&utm_medium=challenge#challenge`,
        "#buildinpublic #trends #AI",
      ].join("\n"),
    };
  }
  const r = board?.recent?.[0];
  if (r) {
    const win = r.winnerLabels.join(" / ");
    const best = Math.max(...r.options.map((x) => (x.growth === null ? -Infinity : x.growth)));
    out.result = {
      id: r.id,
      he: [
        `🔮 תוצאות האתגר של ${dm(r.at)}`,
        "",
        `המנצח לפי ההזמנות באליאקספרס: ${win} (${pct(best)} בשבועיים).`,
        ...r.options.map((x) => `• ${x.label}: ${pct(x.growth)}`),
        "",
        `הבחירה החתומה של הרדאר: ${r.radarLabel}. ${r.result === "HIT" ? "🎯 פגע." : "👏 הפעם המנצח היה מוצר אחר."}`,
        `הטקסט שנחתם: ${r.text}`,
        "אפשר לחשב את ה־SHA-256 שלו ולבדוק את החתימה ב־opentimestamps.org.",
        "",
        "מי מכם בחר נכון בסקר? 👇 האתגר הבא כבר עלה.",
        "",
        `${origin}/radar?utm_source=linkedin&utm_medium=challenge_result#challenge`,
        "#בונהבפומבי #טרנדים #AI",
      ].join("\n"),
    };
  }
  for (const k of ["open", "result"]) if (out[k] && FORBIDDEN.test(`${out[k].he || ""}${out[k].en || ""}`)) out[k] = null;
  return out;
}
