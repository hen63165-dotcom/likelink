// Media truth — one definition of "what media really exists" for a product.
//
// The discovery engine, the Studio and the share assets all read media through
// this module, so an image can never be presented as a video, an SVG motion
// sketch as an MP4, a synthetic (AI) visual as human UGC, or a queued job as a
// finished asset. Provider-independent: a future video provider only has to
// write a playable URL + status onto the asset record; nothing here changes.
//
// States (strongest real evidence wins):
//   REAL_VIDEO           a playable video file (http(s) .mp4/.webm/.mov or a
//                        provider asset with status "completed")
//   RENDER_JOB_ACTIVE    a real render job id with a queued/running status
//   SYNTHETIC_ANIMATION  an animation that is not a filmed video (SVG motion)
//   STATIC_IMAGE         a real product/asset image, no motion
//   MISSING_MEDIA        nothing usable

export const MEDIA_TRUTH = Object.freeze({
  REAL_VIDEO: "REAL_VIDEO",
  RENDER_JOB_ACTIVE: "RENDER_JOB_ACTIVE",
  SYNTHETIC_ANIMATION: "SYNTHETIC_ANIMATION",
  STATIC_IMAGE: "STATIC_IMAGE",
  MISSING_MEDIA: "MISSING_MEDIA",
});

export const MEDIA_TRUTH_LABEL = Object.freeze({
  [MEDIA_TRUTH.REAL_VIDEO]: { he: "סרטון אמיתי", en: "Real video" },
  [MEDIA_TRUTH.RENDER_JOB_ACTIVE]: { he: "סרטון בתהליך יצירה", en: "Video being created" },
  [MEDIA_TRUTH.SYNTHETIC_ANIMATION]: { he: "אנימציה ממוחשבת (לא צילום)", en: "Computer animation (not filmed)" },
  [MEDIA_TRUTH.STATIC_IMAGE]: { he: "תמונת מוצר", en: "Product image" },
  [MEDIA_TRUTH.MISSING_MEDIA]: { he: "אין מדיה", en: "No media" },
});

const RANK = {
  [MEDIA_TRUTH.REAL_VIDEO]: 4,
  [MEDIA_TRUTH.RENDER_JOB_ACTIVE]: 3,
  [MEDIA_TRUTH.SYNTHETIC_ANIMATION]: 2,
  [MEDIA_TRUTH.STATIC_IMAGE]: 1,
  [MEDIA_TRUTH.MISSING_MEDIA]: 0,
};

const ACTIVE_JOB = new Set(["queued", "pending", "running", "processing", "in_progress"]);
const VIDEO_FILE = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;

export function isHttpUrl(value) {
  return /^https?:\/\/\S+$/i.test(String(value || "").trim());
}

/** Classify one media record (product field or UGC/video asset). */
export function classifyMediaRecord(record = {}) {
  const videoUrl = String(record.videoUrl || record.video || "").trim();
  const status = String(record.videoStatus || record.status || "").toLowerCase();
  const isSvg = /^data:image\/svg/i.test(videoUrl) || /\.svg(\?|#|$)/i.test(videoUrl) || status === "available_as_motion_svg";
  if (videoUrl && !isSvg && (isHttpUrl(videoUrl) || /^blob:/i.test(videoUrl)) && (VIDEO_FILE.test(videoUrl) || status === "completed" || status === "ready")) {
    return { state: MEDIA_TRUTH.REAL_VIDEO, url: videoUrl, synthetic: Boolean(record.synthetic) };
  }
  if (record.videoJobId && ACTIVE_JOB.has(status)) {
    return { state: MEDIA_TRUTH.RENDER_JOB_ACTIVE, url: "", jobId: String(record.videoJobId), synthetic: Boolean(record.synthetic) };
  }
  if (videoUrl && isSvg) {
    return { state: MEDIA_TRUTH.SYNTHETIC_ANIMATION, url: videoUrl, synthetic: true };
  }
  const image = String(record.imageUrl || record.image || "").trim();
  if (isHttpUrl(image)) {
    return { state: MEDIA_TRUTH.STATIC_IMAGE, url: image, synthetic: Boolean(record.synthetic) };
  }
  return { state: MEDIA_TRUTH.MISSING_MEDIA, url: "", synthetic: false };
}

/**
 * Media truth for a product: its own photo/video plus any stored assets
 * (ugc:assets:<id>). Returns the strongest REAL state and a per-kind inventory.
 */
export function productMediaTruth(product = {}, assets = []) {
  const records = [
    { image: product?.image, videoUrl: product?.videoUrl, videoStatus: product?.videoStatus, synthetic: false, source: "product" },
    ...(Array.isArray(assets) ? assets : []).map((a) => ({ ...a, source: a?.source || "asset" })),
  ];
  const classified = records.map((r) => ({ ...classifyMediaRecord(r), source: r.source }));
  const best = classified.reduce((a, b) => (RANK[b.state] > RANK[a.state] ? b : a), { state: MEDIA_TRUTH.MISSING_MEDIA, url: "", synthetic: false });
  const count = (state) => classified.filter((c) => c.state === state).length;
  return {
    state: best.state,
    url: best.url,
    synthetic: best.synthetic,
    inventory: {
      realVideos: count(MEDIA_TRUTH.REAL_VIDEO),
      activeRenderJobs: count(MEDIA_TRUTH.RENDER_JOB_ACTIVE),
      syntheticAnimations: count(MEDIA_TRUTH.SYNTHETIC_ANIMATION),
      images: count(MEDIA_TRUTH.STATIC_IMAGE),
      syntheticImages: classified.filter((c) => c.state === MEDIA_TRUTH.STATIC_IMAGE && c.synthetic).length,
    },
  };
}
