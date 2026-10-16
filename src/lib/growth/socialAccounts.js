// LikeLink2's own social accounts. The site links to an account only once it
// really exists: the owner opens it (TikTok asks for her phone or e-mail), and
// then its handle goes here. Until then nothing links to a page that isn't
// there. The same list feeds the footer and the Organization JSON-LD
// `sameAs` in index.html (tests/tiktok.test.mjs keeps the two equal).
export const SOCIAL_ACCOUNTS = Object.freeze({
  tiktok: Object.freeze({ handle: "", label: { he: "טיקטוק", en: "TikTok" }, url: (h) => `https://www.tiktok.com/@${h}` }),
});

const HANDLE = /^[A-Za-z0-9._]{2,24}$/;

/** The accounts that exist: [{ network, handle, url, label }]. */
export function socialProfiles(accounts = SOCIAL_ACCOUNTS) {
  return Object.entries(accounts)
    .filter(([, a]) => HANDLE.test(String(a?.handle || "")))
    .map(([network, a]) => ({ network, handle: a.handle, url: a.url(a.handle), label: a.label }));
}
