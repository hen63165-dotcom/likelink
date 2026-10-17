/**
 * Which Supabase project is LikeLink2's cloud — one place.
 *
 * The project URL and its anon key are PUBLIC (they ship in every browser
 * bundle; the RLS policies and the server gate are what protect the data).
 * Builds still read VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, but the
 * hosts' settings (Netlify, GitHub Actions) are the owner's to change: when
 * they still name a retired project, the site follows CLOUD instead of
 * calling a cloud that is gone or restricted.
 *
 * 2026-10-16: sbzzgfthgaurgcuxiuql (org "hen63165-dotcom's Org") was
 * restricted for the free plan's egress quota (402 on every API call); the
 * owner chose to move to a fresh free project in its own organization
 * (.claude/skills/cloud-guard/SKILL.md).
 *
 * 2026-10-16: vjitiuirqfysexsxdxqx (org "LikeLink2", eu-west-1) is the cloud.
 * Its database got the baseline + every migration, then the old project's
 * rows were copied server to server (kv 345 rows, same md5 on both sides;
 * 3 users with their identities). Storage files were not copied: the old
 * project's Storage answers 402.
 */

/** Projects the site must never call again (refs). */
export const RETIRED_CLOUD_REFS = Object.freeze(["sbzzgfthgaurgcuxiuql"]);

/** The current project (public URL + its public anon key). */
export const CLOUD = Object.freeze({
  ref: "vjitiuirqfysexsxdxqx",
  url: "https://vjitiuirqfysexsxdxqx.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqaXRpdWlycWZ5c2V4c3hkeHF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxODA4NDgsImV4cCI6MjEwNzc1Njg0OH0.zjxyDbAQggiFAUwlldvcDFoL8Sae5hyhqXITZLclD4Y",
});

const refOf = (url) => /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/.exec(String(url || "").trim())?.[1] || "";

/** True when `url` is a Supabase project the site has retired. */
export function isRetiredCloud(url) {
  const ref = refOf(url);
  return Boolean(ref) && RETIRED_CLOUD_REFS.includes(ref);
}

/**
 * The cloud to use, from what the build/runtime env says. A retired project
 * gives way to CLOUD (its URL and its own anon key together); anything else —
 * nothing set (local dev, tests), a test fixture, the Edge Function's own
 * project — is kept as it is.
 */
export function resolveCloud(url = "", anonKey = "", cloud = CLOUD) {
  if (cloud.url && cloud.anonKey && isRetiredCloud(url)) return { url: cloud.url, anonKey: cloud.anonKey, source: "retired_env_replaced" };
  return { url: String(url || ""), anonKey: String(anonKey || ""), source: url ? "env" : "none" };
}
