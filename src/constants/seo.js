// Robots value for every page search engines may index. Beyond index,follow it
// lets Google show a large image, a full snippet and video previews: Google
// Discover only shows the big image card for pages that allow
// max-image-preview:large. index.html carries the same value.
export const INDEX_ROBOTS = "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";

/** True for an indexable robots value (with or without the preview hints). */
export function isIndexable(robots) {
  return /^index,follow(,|$)/.test(String(robots || "").replace(/\s+/g, ""));
}
