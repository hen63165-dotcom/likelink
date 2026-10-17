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
  seller_photo: Object.freeze({ he: "תמונת המוכר", en: "The seller's photo" }),
});

/**
 * productId → the frame: seconds into the clean cut, ffmpeg crop (w:h:x:y of
 * 1080×1920). A frame is used only when the listed item is its subject: the
 * image must match the product. (p-live-02's clip is a model wearing a
 * necklace; its bracelet is too small in the frame for a clean crop.)
 */
export const LOOKS = Object.freeze({
  // The opening flat lay (the bracelets laid out on a plain background), sharpened
  // lightly: the owner found the earlier frame (gloves, crumpled cloth) not
  // professional (2026-10-15). The store gallery could not be read (CAPTCHA).
  "p-live-03": Object.freeze({ at: 0.2, crop: "1000:1250:50:300", sharpen: true, source: "seller_video" }),
  "p-live-04": Object.freeze({ at: 2.5, crop: "1080:1350:0:285", source: "seller_video" }),
  "p-live-05": Object.freeze({ at: 2.5, crop: "1080:1350:0:330", source: "seller_video" }),
});

/**
 * Store photos checked by eye: the product itself, no banner, spec text or
 * watermark (2026-10-11). The home page shows only products with a clean
 * image, from LOOKS or from this list; every product stays on /products.
 */
export const CLEAN_STORE_PHOTOS = Object.freeze(["p-live-01"]);

const KF = "https://ae-pic-a1.aliexpress-media.com/kf/";
/**
 * The store gallery photos checked by eye on the contact sheet
 * (scripts/audit/gallery-sheet.mjs, 2026-10-17): the listed item itself, with
 * no banner, spec text, logo or watermark. `worn` = on a person (the seller's
 * model, never named and never presented as a creator or a buyer), `held` = in
 * a hand, `flat` = laid out. A photo is used only while it is still in that
 * product's own gallery (`images`, read from the store's affiliate API).
 * p-live-03 has none: every gallery photo carries sizes or spec text.
 */
export const STORE_GALLERY_PICKS = Object.freeze({
  "p-live-01": Object.freeze([
    { url: `${KF}S1ce2cdd4d7a846be947e1e00a03ecbacQ.png`, kind: "worn" },
    { url: `${KF}Sb09326a7d96b40acbec26c46524e1347w.png`, kind: "worn" },
    { url: `${KF}S13c6f7c7d04c497384e5c77d517c376cF.png`, kind: "held" },
    { url: `${KF}S1366b1a919514f11ba50c105395ac9f2L.png`, kind: "flat" },
  ]),
  "p-live-02": Object.freeze([
    { url: `${KF}Sb611d344737246f2a78105b012bb1b43Y.jpg`, kind: "worn" },
    { url: `${KF}Sca91dcdea5424130acda72ee08a3efcbr.jpg`, kind: "worn" },
    { url: `${KF}S70e72abce8d74e6681f200517669d426h.jpg`, kind: "flat" },
  ]),
  "p-live-04": Object.freeze([
    { url: `${KF}Sc3150d9b93a6452b8608ae1131051a4dV.png`, kind: "worn" },
    { url: `${KF}Se958008fe499421da5e85de91026eb063.png`, kind: "flat" },
    { url: `${KF}S3129c9709d9042ebb86330098110477dL.png`, kind: "flat" },
  ]),
  "p-live-05": Object.freeze([
    { url: `${KF}Sbb4689a801fe4d8390a9ef16d482e0891.jpg`, kind: "worn" },
    { url: `${KF}Sa4800bae5e614986a5701ccd3e482ca4h.jpg`, kind: "held" },
    { url: `${KF}S9777e80bf14445e784a76c2dc1f145d0S.jpg`, kind: "held" },
    { url: `${KF}Sa2c73636d9d543cf8f84ee70da04afee7.jpg`, kind: "flat" },
  ]),
});
const PICK_ORDER = Object.freeze({ worn: 0, held: 1, flat: 2 });

/**
 * A product's checked gallery photos that are still in its own gallery, worn
 * first. `images` is the raw record's gallery (or the public graph's
 * media.images); nothing is used without it.
 */
export function galleryPicks(product) {
  const own = new Set([...(Array.isArray(product?.images) ? product.images : []), ...(Array.isArray(product?.media?.images) ? product.media.images : [])]);
  return (STORE_GALLERY_PICKS[product?.id] || []).filter((p) => own.has(p.url)).sort((a, b) => PICK_ORDER[a.kind] - PICK_ORDER[b.kind]);
}

export function lookFile(productId) {
  return `${productId}.jpg`;
}

/** The clean image of a product, or null when it has none (use the store photo). */
export function lookOf(productId, base = BASE) {
  const l = LOOKS[productId];
  return l ? { src: `${base}/looks/${lookFile(productId)}`, source: l.source } : null;
}

/**
 * The image the home page and the cards show for a product: the item worn by
 * the seller's model (like LTK's photos of a look), else its clean video
 * frame, else a checked store photo, or null.
 */
export function cleanImage(product, base = BASE) {
  const picks = galleryPicks(product);
  if (picks[0]?.kind === "worn") return { src: picks[0].url, source: "seller_photo" };
  const look = lookOf(product?.id, base);
  if (look) return look;
  if (CLEAN_STORE_PHOTOS.includes(product?.id) && product?.media?.image) return { src: product.media.image, source: "" };
  return picks[0] ? { src: picks[0].url, source: "seller_photo" } : null;
}

export function lookLabel(source, lang = "he") {
  const l = LOOK_SOURCE_LABEL[source];
  return l ? (lang === "he" ? l.he : l.en) : "";
}
