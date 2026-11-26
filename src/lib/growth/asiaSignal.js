// 🇰🇷🇯🇵 Korea and Japan in their own language (the owner, 22.11: "for Japan and Korea you will find a far
// more genius way; maybe through AI, maybe through the cloud"). Many trends start in Asia (snail mucin in
// Korea, Labubu in China and Thailand, the squishy at Daiso), and people there search and film in Korean
// and Japanese, so the English store words the radar asks the world with say little there. An open
// translation model (NLLB-200, Meta's, free, on the radar's own runner) gives every kind its Korean and
// Japanese words and turns Korean and Japanese video titles into English, so the radar:
//   1. asks Google's and YouTube's public suggestions from Korea and Japan in Korean and Japanese
//      (robots.txt read first, the same door as Israel's) whether people there type the kind already;
//   2. reads the newest videos of Korea's and Japan's "new at Daiso / Olive Young / 100-yen shop" creators
//      (the official YouTube API with the owner's own free key, already in place) and finds the products
//      several channels show this week — the first creators, in their own language.
// No new account, nothing paid. A translation is a model's, so the word asked is printed beside every
// answer; a kind the model could not translate is UNMEASURED there, never quiet. Pure: the runner asks.

export const ASIA = Object.freeze({
  model: "Xenova/nllb-200-distilled-600M",
  src: "eng_Latn",
  regions: Object.freeze({
    KR: Object.freeze({ he: "קוריאה", hl: "ko", gl: "kr", nllb: "kor_Hang", queries: ["다이소 신상", "올리브영 추천템", "알리 추천템"] }),
    JP: Object.freeze({ he: "יפן", hl: "ja", gl: "jp", nllb: "jpn_Jpan", queries: ["ダイソー 新商品", "購入品紹介", "100均 新商品"] }),
  }),
  perRun: 20, // kinds asked in Korean and Japanese each run (moving kinds first)
  titlesPerRegion: 150, // video titles translated per region per run
  days: 2, // the videos published in the last two days
  faint: 1, // ≥ 1 completion = a first sign
  aware: 3, // ≥ 3 = people there type it
  keepDays: 30,
});

/** One Korean or Japanese word as a search engine compares it: NFKC, lower case, no spaces or punctuation. */
export function localKey(s = "") {
  return String(s || "").normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

/** A translation the radar can ask with: in the target script, short, never the English left as it was. */
export function usableTerm(term = "", region = "KR") {
  const t = String(term || "").normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!t || t.length > 40) return null;
  const script = region === "KR" ? /\p{Script=Hangul}/u : /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
  return script.test(t) ? t : null;
}

/** The completions that extend the term (the suggestion that is only the term itself never counts). */
export function localExtensions(term, suggestions) {
  if (!Array.isArray(suggestions)) return null;
  const q = localKey(term);
  if (!q) return null;
  const seen = new Set();
  for (const s of suggestions) {
    const k = localKey(s);
    if (k && k !== q && k.includes(q)) seen.add(k);
  }
  return seen.size;
}

export function levelOf(n, { rules = ASIA } = {}) {
  if (!Number.isFinite(n)) return null;
  return n >= rules.aware ? "AWARE" : n >= rules.faint ? "FAINT" : "NONE";
}

/** One region's reading: Google and YouTube suggestions together (the stronger level wins). */
export function regionReading({ term, google, youtube }, { rules = ASIA } = {}) {
  const g = levelOf(google, { rules }); const y = levelOf(youtube, { rules });
  if (!term || (g === null && y === null)) return { term: term || null, state: "UNMEASURED", google: null, youtube: null };
  const rank = { NONE: 0, FAINT: 1, AWARE: 2 };
  const best = [g, y].filter(Boolean).sort((a, b) => rank[b] - rank[a])[0];
  return { term, state: best === "AWARE" ? "SEARCHED" : best === "FAINT" ? "FIRST_SIGNS" : "QUIET", google, youtube };
}

/** History per kind and region (state: kind → region → day → state), and the day each region first showed a sign. */
export function mergeAsia(state = {}, kind, region, day, reading, { rules = ASIA } = {}) {
  const out = { ...(state && typeof state === "object" ? state : {}) };
  const per = { ...(out[kind] || {}) };
  const days = { ...(per[region] || {}) };
  if (reading?.state && reading.state !== "UNMEASURED") days[day] = reading.state;
  const oldest = new Date(Date.parse(`${day}T00:00:00Z`) - rules.keepDays * 86_400_000).toISOString().slice(0, 10);
  for (const d of Object.keys(days)) if (d < oldest) delete days[d];
  per[region] = days;
  out[kind] = per;
  return out;
}

/** The arrival: the first day a sign showed after a day that showed none (never the first reading itself). */
export function asiaArrival(days = {}) {
  const ds = Object.keys(days || {}).sort();
  for (let i = 1; i < ds.length; i++) if (days[ds[i - 1]] === "QUIET" && days[ds[i]] !== "QUIET") return ds[i];
  return null;
}

/** A card's Korea/Japan line from today's readings and the history. */
export function asiaCard(readings = {}, history = {}, day) {
  const regions = {};
  for (const [r, x] of Object.entries(readings || {})) {
    if (!ASIA.regions[r] || !x) continue;
    regions[r] = { term: x.term || null, state: x.state, google: x.google ?? null, youtube: x.youtube ?? null, arrived: asiaArrival(history?.[r]) };
  }
  return Object.keys(regions).length ? { d: day, regions } : null;
}

/** The YouTube search for one region's creators, in their language and country. */
export function asiaHaulUrl(q, region, { key, now = Date.now(), rules = ASIA } = {}) {
  const r = rules.regions[region];
  const after = new Date(now - rules.days * 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const p = new URLSearchParams({ part: "snippet", type: "video", q, publishedAfter: after, maxResults: "50", order: "date", regionCode: region, relevanceLanguage: r?.hl || "", key: String(key || "") });
  return `https://www.googleapis.com/youtube/v3/search?${p}`;
}

/** The browser's copy of a card line. */
export function cleanAsia(a) {
  if (!a || typeof a !== "object" || !a.regions || typeof a.regions !== "object") return null;
  const day = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(String(d || "")) ? d : null);
  const n = (x) => (Number.isFinite(Number(x)) && Number(x) >= 0 && Number(x) <= 50 ? Math.round(Number(x)) : null);
  const regions = {};
  for (const [r, x] of Object.entries(a.regions)) {
    if (!ASIA.regions[r] || !["SEARCHED", "FIRST_SIGNS", "QUIET", "UNMEASURED"].includes(x?.state)) continue;
    regions[r] = { term: usableTerm(x.term, r), state: x.state, google: n(x.google), youtube: n(x.youtube), arrived: day(x.arrived) };
  }
  return Object.keys(regions).length ? { d: day(a.d), regions } : null;
}
