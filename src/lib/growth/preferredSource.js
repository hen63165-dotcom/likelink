// Google "preferred sources" (Search Central, updated 2026-09-18): a reader can
// pick a site as a preferred source in Google; its pages then show more in Top
// Stories and carry a "preferred" badge in AI Overviews and AI Mode, in every
// language. Google's deeplink works only once the site appears in its source
// preferences tool, so the owner checks by opening PREFERRED_SOURCE.url (it
// opens the tool on our domain) and the date goes into `listedSince`. Until
// then the site shows no link: a link to an empty search would mislead. A plain
// link, not Google's button script, so no third-party code loads on our pages.
import { PRODUCTION_ORIGIN } from "../../constants/domain.js";

export const PREFERRED_SOURCE = Object.freeze({
  url: `https://www.google.com/preferences/source?q=${new URL(PRODUCTION_ORIGIN).host}`,
  listedSince: null,
});

export function preferredSourceLive(cfg = PREFERRED_SOURCE) {
  return Boolean(cfg.listedSince);
}
