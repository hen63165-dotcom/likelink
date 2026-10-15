// What a Studio preview may load, and where a Studio link may point. Pure, so
// the rules are tested directly (tests/studioEntrance.test.mjs).
//
// Each accepted address is returned as a fixed scheme written here plus the
// rest of what was typed, so the scheme of anything that reaches an <img src>
// or <a href> always comes from this file, never from the input.

const RASTER = /^data:image\/(png|jpe?g|webp|gif|avif);base64,/i;

/** A web address, this browser's own upload, or an inline raster image; else "". */
function previewSrcOf(value) {
  const src = String(value || "").trim();
  if (/^https:\/\//i.test(src)) return "https://" + src.slice(8);
  if (/^http:\/\//i.test(src)) return "http://" + src.slice(7);
  if (/^blob:/i.test(src)) return "blob:" + src.slice(5);
  const m = RASTER.exec(src);
  if (m) return "data:image/" + m[1].toLowerCase() + ";base64," + src.slice(m[0].length);
  return "";
}

/** True when a src is safe to put in <img src> (javascript:, a data: page… are refused). */
export function isSafePreviewSrc(src) {
  return previewSrcOf(src) !== "";
}

/** The src to put in <img src>, or the fallback when the value is not safe. */
export function safeImageSrc(src, fallback = "") {
  return previewSrcOf(src) || fallback;
}

/** An absolute http(s) address that is safe for <a href>, else "". */
export function safeHref(url) {
  const href = String(url || "").trim();
  if (/^https:\/\//i.test(href)) return "https://" + href.slice(8);
  if (/^http:\/\//i.test(href)) return "http://" + href.slice(7);
  return "";
}
