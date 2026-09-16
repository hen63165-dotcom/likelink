/** Shared video serialization guard. No network, identity or storage implementation here. */
export function isPublicVideo(video) {
  if (!video || typeof video.id !== "string" || !video.id.trim() || video.public !== true) return false;
  if (typeof video.videoUrl !== "string") return false;
  try {
    const url = new URL(video.videoUrl);
    return ["https:", "http:"].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password;
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
