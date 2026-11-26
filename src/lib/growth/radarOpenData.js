// 📦 The radar's open files and its schema.org Dataset (radarDataset.js has the card). Light on purpose:
// publicSeo.js imports it for /radar's head, which every host and the build write the same way.

import { PRODUCTION_ORIGIN } from "../../constants/domain.js";

const PAGES = "https://hen63165-dotcom.github.io/likelink";

/** Every open file, where it is served and what it holds (each checked to answer 200 on 26.11). */
export const OPEN_FILES = Object.freeze([
  { id: "board", url: `${PRODUCTION_ORIGIN}/radar/board.json`, format: "application/json", every: "daily", he: "הלוח היומי: הקביעות, הרקורד, הספרים החתומים של היום והוכחות ה־.ots", en: "The daily board: the calls, the record, the day's sealed books and the .ots proofs" },
  { id: "feed", url: `${PRODUCTION_ORIGIN}/radar/feed.xml`, format: "application/atom+xml", every: "daily", he: "כל קביעה חתומה בפיד Atom, עם יום החתימה ויום הציון", en: "Every sealed call in an Atom feed, with its sealed day and grading day" },
  { id: "evidence", url: `${PAGES}/radar/evidence.json`, format: "application/json", every: "daily", he: "הראיות: ספירות ההזמנות היומיות של החנות מאחורי כל קביעה, והציון שלה", en: "The evidence: the store's daily order counts behind every call, and its grade" },
  { id: "backtest", url: `${PAGES}/radar/backtest.json`, format: "application/json", every: "daily", he: "המבחן לאחור: כל מקרה, כדי לחשב מחדש את הרדאר מול הדירוג הפשוט ומול המזל", en: "The backtest: every case, to recompute the radar against the simple ranking and chance" },
  { id: "prices", url: `${PAGES}/radar/prices/index.json`, format: "application/json", every: "daily", he: "ספר המחירים: מחיר החנות היומי של כל מוצר שהרדאר קרא, וחתימת כל יום (לפי מוצר ב־prices/00.json עד 99.json, והטקסט החתום של כל יום ב־prices/days/<יום>.txt)", en: "The price ledger: the store's daily price of every item the radar read, and each day's seal (per item in prices/00.json to 99.json, each day's sealed text in prices/days/<day>.txt)" },
  { id: "dataset", url: `${PRODUCTION_ORIGIN}/radar/dataset.json`, format: "application/json", every: "daily", he: "כרטיס המאגר: מה יש בו ואיפה", en: "The pool's card: what it holds and where" },
  { id: "llms", url: `${PRODUCTION_ORIGIN}/llms.txt`, format: "text/plain", every: "on change", he: "התיאור למנועי בינה מלאכותית", en: "The description for AI engines" },
]);

/** The day the radar's daily root was first sealed (anchors.since) — the static JSON-LD names it. */
export const LEDGER_SINCE = "2026-11-20";

/** schema.org Dataset for /radar's head (Google Dataset Search reads it): only fixed, true facts. */
export function datasetJsonLd(url = `${PRODUCTION_ORIGIN}/radar`) {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "LikeLink2 trend radar: sealed product-trend calls and daily store prices",
    description: "Every morning the LikeLink2 trend radar reads AliExpress's own order counts, listings and prices, Google and YouTube searches in Hebrew and in other countries, and other public sources. Every call it makes, misses included, is written down that day, hashed with SHA-256 under one daily root and timestamped in Bitcoin through OpenTimestamps, then graded in public on its due day. The store's daily price of every item read is kept and sealed the same way. Each run's receipt counts the requests sent and answered.",
    url,
    creator: { "@type": "Organization", name: "LikeLink2", url: PRODUCTION_ORIGIN },
    isAccessibleForFree: true,
    temporalCoverage: `${LEDGER_SINCE}/..`,
    keywords: ["product trends", "ecommerce", "AliExpress", "forecast verification", "OpenTimestamps", "Bitcoin timestamp", "price history", "Israel"],
    inLanguage: ["he", "en"],
    distribution: OPEN_FILES.filter((f) => f.id !== "llms").map((f) => ({ "@type": "DataDownload", encodingFormat: f.format, contentUrl: f.url, name: f.en })),
  };
}
