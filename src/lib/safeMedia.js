// What a Studio preview may load, and where a Studio link may point. Pure, so
// the rules are tested directly (tests/studioEntrance.test.mjs).

// A web address, this browser's own upload, or an inline image. Anything else
// a person typed (javascript:, a data: page…) is refused.
const PREVIEW_SAFE = /^(https?:\/\/|blob:|data:image\/(?:png|jpe?g|webp|gif|avif);base64,)/i;

/** True when a src is safe to put in <img src>. */
export function isSafePreviewSrc(src) {
  return PREVIEW_SAFE.test(String(src || ""));
}

/** An absolute http(s) address that is safe for <a href>, else "". */
export function safeHref(url) {
  const href = String(url || "").trim();
  return /^https?:\/\//i.test(href) ? href : "";
}
