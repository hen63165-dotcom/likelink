/** Shared video serialization guard. No network, identity or storage implementation here. */
export function isPublicVideo(video) {
  if (!video || typeof video.id !== "string" || !video.id.trim() || video.public !== true) return false;
  if (typeof video.videoUrl !== "string") return false;
  if (video.videoStatus === "available_as_motion_svg") return false;
  if (/\.svg(?:$|[?#])/i.test(video.videoUrl)) return false;
  try {
    const url = new URL(video.videoUrl);
    if (!["https:", "http:"].includes(url.protocol) || !url.hostname || url.username || url.password) return false;
    const path = url.pathname.toLowerCase();
    // First-party media proxy: /api/og?mode=media&path=<kind>/<id>/<file.mp4>
    const proxied = path === "/api/og" && url.searchParams.get("mode") === "media" ? String(url.searchParams.get("path") || "").toLowerCase() : "";
    const isVideoFile = /\.(mp4|webm|mov|m4v|ogv)$/.test(path) || /^(reels|ugc)\/[a-z0-9_-]+\/[a-z0-9_-]+\.(mp4|webm)$/.test(proxied);
    const isKnownVideoHost = /(^|\.)youtube\.com$|(^|\.)youtu\.be$|(^|\.)vimeo\.com$/.test(url.hostname);
    return isVideoFile || isKnownVideoHost;
  } catch {
    return false;
  }
}

export function publicVideos(value) {
  return Array.isArray(value) ? value.filter(isPublicVideo) : [];
}

/** Final write boundary: never publish local blob/data URLs or private drafts. */
export async function writePublicVideos(storage, key, videos) {
  const publishable = publicVideos(videos);
  // An empty/private-only snapshot is not permission to erase a shared feed.
  if (!publishable.length) return { written: false, count: 0 };
  await storage.set(key, publishable, true);
  return { written: true, count: publishable.length };
}
