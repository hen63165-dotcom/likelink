// What a Studio preview may load, and where a Studio link may point. Pure, so
// the rules are tested directly (tests/studioEntrance.test.mjs).
//
// Two rules for anything that reaches an <img src> or <a href>:
//  1. the scheme is one written here (http/https, this browser's own blob:,
//     an inline raster image), never the one typed or carried by a file;
//  2. quotes, angle brackets and whitespace are percent-encoded. A valid
//     address never holds them raw, so nothing typed can close the attribute.

const RASTER = /^data:image\/(png|jpe?g|webp|gif|avif);base64,/i;

/** Percent-encode the characters that never belong raw in an address. */
function encodeUnsafe(url) {
  return url.replace(/["'<>`\s]/g, (c) => encodeURIComponent(c));
}

/** A web address, this browser's own upload, or an inline raster image; else "". */
function previewSrcOf(value) {
  const src = String(value || "").trim();
  if (/^https:\/\//i.test(src)) return encodeUnsafe("https://" + src.slice(8));
  if (/^http:\/\//i.test(src)) return encodeUnsafe("http://" + src.slice(7));
  if (/^blob:/i.test(src)) return encodeUnsafe("blob:" + src.slice(5));
  const m = RASTER.exec(src);
  if (m) return encodeUnsafe("data:image/" + m[1].toLowerCase() + ";base64," + src.slice(m[0].length));
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
  if (/^https:\/\//i.test(href)) return encodeUnsafe("https://" + href.slice(8));
  if (/^http:\/\//i.test(href)) return encodeUnsafe("http://" + href.slice(7));
  return "";
}
