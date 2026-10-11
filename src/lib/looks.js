// Clean product imagery for the storefront (public/looks/*.jpg).
//
// The store photos often carry banners, spec text ("Sterling Silver 925
// Серебро 925 пробы") or a watermark. These are single frames from the
// seller's own product video (LikeLink2's premium cut in the `reels`
// release), cropped 4:5 so the burned-in labels fall outside the frame. They
// ship with the site, so they never depend on another host. The page names
// the source next to each one (LOOK_SOURCE_LABEL); a seller video is never
// called real footage or UGC. scripts/media/look-frames.mjs cuts them again
// from the release with the time and crop below.
import { BASE } from "./basePath.js";

export const LOOK_SOURCE_LABEL = Object.freeze({
  seller_video: Object.freeze({ he: "מתוך סרטון המוכר", en: "From the seller's video" }),
});

/** productId → the frame: seconds into the clean cut, ffmpeg crop (w:h:x:y of 1080×1920). */
export const LOOKS = Object.freeze({
  "p-live-02": Object.freeze({ at: 5.8, crop: "816:1020:132:880", source: "seller_video" }),
  "p-live-03": Object.freeze({ at: 3.5, crop: "1080:1350:0:285", source: "seller_video" }),
  "p-live-04": Object.freeze({ at: 2.5, crop: "1080:1350:0:285", source: "seller_video" }),
  "p-live-05": Object.freeze({ at: 2.5, crop: "1080:1350:0:330", source: "seller_video" }),
});

/** The opening image of the home page: the seller's model wearing the bracelet. */
export const HERO_LOOK = Object.freeze({ productId: "p-live-02", file: "hero-p-live-02.jpg", at: 4.5, crop: "1080:1350:0:300", source: "seller_video" });

export function lookFile(productId) {
  return `${productId}.jpg`;
}

/** The clean image of a product, or null when it has none (use the store photo). */
export function lookOf(productId, base = BASE) {
  const l = LOOKS[productId];
  return l ? { src: `${base}/looks/${lookFile(productId)}`, source: l.source } : null;
}

export function heroLook(base = BASE) {
  return { ...HERO_LOOK, src: `${base}/looks/${HERO_LOOK.file}` };
}

export function lookLabel(source, lang = "he") {
  const l = LOOK_SOURCE_LABEL[source];
  return l ? (lang === "he" ? l.he : l.en) : "";
}
