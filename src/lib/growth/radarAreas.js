// The shop areas a radar call can be in, by key → Hebrew name (trendBoard.js categories and the fashion
// areas read daily). A sealed envelope shows its area as a hint, never the call itself.
import { TREND_CATEGORIES } from "./trendBoard.js";
import { FASHION_AREAS } from "./freshRisers.js";

export const AREA_HE = Object.freeze(Object.fromEntries([...TREND_CATEGORIES, ...FASHION_AREAS].map((c) => [c.key, c.he])));
