// 🎁 Invite a friend (the owner, 27.11: "כן תפעיל", to "a friend who joins through your link, and you
// both get 7 more free days" — the share loop that grew Base44, where people who showed what they built
// got free credits). Every signed-in user has one invite code. A friend who joins through it, with a new
// account (opened within `newAccountDays`, e-mail confirmed) and who never joined through a code before,
// gives both of them `bonusDays` more days of the radar's free trial; one inviter counts at most
// `maxFriends` friends. Stored server-side only (`radar:referrals`): account ids and days, never an e-mail
// or a name; the page shows counts only. Pure.

export const REFERRAL = Object.freeze({ key: "radar:referrals", bonusDays: 7, maxFriends: 10, newAccountDays: 14, version: 1 });
export const REF_CODE = /^[a-z0-9]{8}$/;
const DAY = 86_400_000;
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o, 1/l/i: read aloud and typed by hand

/** A new code from random bytes (the caller passes them: crypto.getRandomValues on the server). */
export function codeFromBytes(bytes) {
  const b = Array.from(bytes || []);
  if (b.length < 8) return null;
  return b.slice(0, 8).map((x) => ALPHABET[x % ALPHABET.length]).join("");
}

const clean = (state) => ({ codes: { ...(state?.codes || {}) }, users: { ...(state?.users || {}) } });

/** This user's code, made once (`fresh` is a candidate from codeFromBytes; a clash takes the next one). */
export function ensureCode(state, uid, fresh = []) {
  const s = clean(state);
  const id = String(uid || "");
  if (!id) return { state: s, code: null };
  const mine = s.users[id]?.code;
  if (mine && s.codes[mine] === id) return { state: s, code: mine };
  for (const c of fresh) {
    if (!REF_CODE.test(String(c || "")) || s.codes[c]) continue;
    s.codes[c] = id;
    s.users[id] = { ...(s.users[id] || {}), code: c, friends: s.users[id]?.friends || [] };
    return { state: s, code: c };
  }
  return { state: s, code: null };
}

/**
 * A friend joining through a code. `user` is the verified auth record ({ id, created_at,
 * email_confirmed_at | confirmed_at }). Returns the new state and the inviter's id, or an error.
 */
export function claimReferral(state, { code, user, now = Date.now(), rules = REFERRAL } = {}) {
  const s = clean(state);
  const uid = String(user?.id || "");
  if (!uid) return { state: s, error: "unauthenticated" };
  const c = String(code || "").toLowerCase();
  if (!REF_CODE.test(c)) return { state: s, error: "invalid_code" };
  const inviter = s.codes[c];
  if (!inviter) return { state: s, error: "unknown_code" };
  if (inviter === uid) return { state: s, error: "own_code" };
  if (s.users[uid]?.joinedVia) return { state: s, error: "already_joined" };
  const created = Date.parse(user?.created_at || "");
  if (!Number.isFinite(created) || now - created > rules.newAccountDays * DAY) return { state: s, error: "not_new_account" };
  if (!user?.email_confirmed_at && !user?.confirmed_at) return { state: s, error: "unconfirmed" };
  const friends = s.users[inviter]?.friends || [];
  if (friends.length >= rules.maxFriends) return { state: s, error: "inviter_full" };
  const at = new Date(now).toISOString();
  s.users[inviter] = { ...(s.users[inviter] || {}), friends: [...friends, { at }] };
  s.users[uid] = { ...(s.users[uid] || {}), joinedVia: c, joinedAt: at };
  return { state: s, inviter };
}

/**
 * The bonus on one user's trial record: before her trial starts it waits as `bonusDays` (added to her
 * trial's length when it starts); while it runs it lengthens it; after it ended she gets the days from now.
 */
export function grantBonus(record, { days, bonusDays = REFERRAL.bonusDays, now = Date.now() } = {}) {
  const r = { ...(record || {}) };
  const start = Date.parse(r.startedAt || "");
  if (!Number.isFinite(start)) return { ...r, bonusDays: (Number(r.bonusDays) || 0) + bonusDays };
  const end = Math.max(start + (days + (Number(r.bonusDays) || 0)) * DAY, Date.parse(r.extendedTo || "") || 0);
  if (end > now) return { ...r, bonusDays: (Number(r.bonusDays) || 0) + bonusDays };
  return { ...r, extendedTo: new Date(now + bonusDays * DAY).toISOString() };
}

/** What the page shows her: her code, how many friends joined (a count only), the rules. */
export function referralView(state, uid, { rules = REFERRAL } = {}) {
  const u = clean(state).users[String(uid || "")] || {};
  return { code: u.code || null, friends: Array.isArray(u.friends) ? u.friends.length : 0, maxFriends: rules.maxFriends, bonusDays: rules.bonusDays, joined: Boolean(u.joinedVia) };
}

/** The invite link and the text shared with it: what IS only (sealed calls, graded in public, the days). */
export function inviteText(code, { origin = "https://likelink2.vercel.app", he = true } = {}) {
  if (!REF_CODE.test(String(code || ""))) return null;
  const url = `${origin}/radar?ref=${code}&utm_source=invite&utm_medium=referral`;
  return {
    url,
    text: he
      ? `🔮 הרדאר של LikeLink2 חותם כל קביעה על טרנד מראש, בביטקוין, ונותן לה ציון בפומבי. הצטרפי דרך הקישור שלי ושתינו נקבל עוד ${REFERRAL.bonusDays} ימים בחינם: ${url}`
      : `🔮 LikeLink2's radar seals every trend call in advance in Bitcoin and grades it in public. Join through my link and we both get ${REFERRAL.bonusDays} more free days: ${url}`,
  };
}
