// 🎁 Invite a friend (the owner, 27.11: "כן תפעיל" to "a friend who joins through your link, and you
// both get 7 more free days"). The rules: one code per user, a friend must be a new, confirmed account
// that never joined through a code, no self-invite, at most 10 friends per inviter; the days wait for a
// trial that has not started, lengthen one that runs, and start from now for one that ended. The server
// keeps account ids and days only; the page sees counts.
import test from "node:test";
import assert from "node:assert/strict";
import { REFERRAL, REF_CODE, claimReferral, codeFromBytes, ensureCode, grantBonus, inviteText, referralView } from "../src/lib/growth/radarReferral.js";
import { userTrialOf } from "../src/lib/growth/radarGate.js";

const NOW = Date.parse("2026-12-02T10:00:00Z");
const DAY = 86_400_000;
const user = (id, { daysOld = 1, confirmed = true } = {}) => ({ id, created_at: new Date(NOW - daysOld * DAY).toISOString(), email_confirmed_at: confirmed ? new Date(NOW - daysOld * DAY).toISOString() : null });

test("one readable code per user, made once", () => {
  const c = codeFromBytes([1, 2, 3, 4, 5, 6, 7, 8]);
  assert.match(c, REF_CODE);
  assert.doesNotMatch(c, /[01ilo]/);
  const a = ensureCode({}, "u1", [c]);
  assert.equal(a.code, c);
  const again = ensureCode(a.state, "u1", ["zzzzzzzz"]);
  assert.equal(again.code, c, "the same code every time");
  const clash = ensureCode(a.state, "u2", [c, "abcdefgh"]);
  assert.equal(clash.code, "abcdefgh", "a code already taken is skipped");
});

test("a friend's claim: new and confirmed, never her own code, once, at most 10 per inviter", () => {
  let s = ensureCode({}, "inviter", ["abcdefgh"]).state;
  assert.equal(claimReferral(s, { code: "abcdefgh", user: user("inviter"), now: NOW }).error, "own_code");
  assert.equal(claimReferral(s, { code: "bad", user: user("f1"), now: NOW }).error, "invalid_code");
  assert.equal(claimReferral(s, { code: "zzzzzzzz", user: user("f1"), now: NOW }).error, "unknown_code");
  assert.equal(claimReferral(s, { code: "abcdefgh", user: user("old", { daysOld: 40 }), now: NOW }).error, "not_new_account");
  assert.equal(claimReferral(s, { code: "abcdefgh", user: user("nc", { confirmed: false }), now: NOW }).error, "unconfirmed");
  const ok = claimReferral(s, { code: "abcdefgh", user: user("f1"), now: NOW });
  assert.equal(ok.inviter, "inviter");
  s = ok.state;
  assert.equal(claimReferral(s, { code: "abcdefgh", user: user("f1"), now: NOW }).error, "already_joined");
  for (let i = 2; i <= REFERRAL.maxFriends; i++) s = claimReferral(s, { code: "abcdefgh", user: user(`f${i}`), now: NOW }).state;
  assert.equal(referralView(s, "inviter").friends, REFERRAL.maxFriends);
  assert.equal(claimReferral(s, { code: "abcdefgh", user: user("f99"), now: NOW }).error, "inviter_full");
  const view = referralView(s, "inviter");
  assert.deepEqual(Object.keys(view).sort(), ["bonusDays", "code", "friends", "joined", "maxFriends"], "counts only");
  assert.equal(JSON.stringify(s).includes("@"), false, "no e-mail is ever stored");
});

test("the days: waiting before the trial starts, longer while it runs, from now after it ended", () => {
  const days = 7;
  const waiting = grantBonus(undefined, { days, now: NOW });
  assert.equal(waiting.bonusDays, 7);
  assert.equal(userTrialOf(waiting, { days, now: NOW }), null, "no start yet: nothing runs");
  const started = { ...waiting, startedAt: new Date(NOW).toISOString() };
  assert.equal(userTrialOf(started, { days, now: NOW }).daysLeft, 14, "her trial starts with the friend's days in it");
  const running = grantBonus({ startedAt: new Date(NOW - 3 * DAY).toISOString() }, { days, now: NOW });
  assert.equal(userTrialOf(running, { days, now: NOW }).daysLeft, 11, "4 days left + 7");
  const ended = grantBonus({ startedAt: new Date(NOW - 30 * DAY).toISOString() }, { days, now: NOW });
  const t = userTrialOf(ended, { days, now: NOW });
  assert.equal(t.active, true);
  assert.equal(t.daysLeft, 7, "7 real days from now, never days in the past");
});

test("the invite text says what IS: sealed in advance, graded in public, the days", () => {
  const t = inviteText("abcdefgh");
  assert.match(t.url, /^https:\/\/likelink2\.vercel\.app\/radar\?ref=abcdefgh&utm_source=invite/);
  assert.match(t.text, /מראש/);
  assert.match(t.text, /בפומבי/);
  assert.match(t.text, /7 ימים/);
  for (const bad of [/מובטח|הבטחה|בטוח|להיט בטוח|היחיד/]) assert.doesNotMatch(t.text, bad);
  assert.equal(inviteText("x"), null);
});

test("the server: her code on GET, a friend's claim gives both of them the days, read back", async () => {
  const { createRadarBoardHandler } = await import("../api/_utils/radarBoardHandler.mjs");
  const fakeRes = () => { const r = { code: 0, body: null, headers: {} }; return Object.assign(r, { status(c) { r.code = c; return r; }, setHeader(k, v) { r.headers[k] = v; }, json(b) { r.body = b; } }); };
  const data = { "marketplace:settings": { radarAccess: { trial: true, trialDays: 14, startedAt: "2026-11-15T00:00:00Z" } }, "radar:trials": { inviter: { startedAt: new Date(NOW - 20 * DAY).toISOString() } } };
  const kv = { kvGet: async (k, fb) => (k in data ? JSON.parse(JSON.stringify(data[k])) : fb), kvSet: async (k, v) => { data[k] = JSON.parse(JSON.stringify(v)); } };
  const users = { "t-inviter": user("inviter", { daysOld: 30 }), "t-friend": user("friend") };
  const h = createRadarBoardHandler({ kv, verify: async (t) => users[t] || null, now: () => NOW });
  const hdr = (t) => ({ origin: "https://likelink2.vercel.app", authorization: `Bearer ${t}` });
  const anon = fakeRes();
  await h({ method: "GET", url: "/api/store?mode=radar-board&op=referral", headers: { origin: "https://likelink2.vercel.app" } }, anon);
  assert.equal(anon.code, 401);
  const mine = fakeRes();
  await h({ method: "GET", url: "/api/store?mode=radar-board&op=referral", headers: hdr("t-inviter") }, mine);
  assert.equal(mine.code, 200);
  const code = mine.body.referral.code;
  assert.match(code, REF_CODE);
  const claim = fakeRes();
  await h({ method: "POST", url: "/api/store?mode=radar-board&op=referral-claim", headers: hdr("t-friend"), body: { code } }, claim);
  assert.equal(claim.code, 200);
  assert.equal(claim.body.bonusDays, 7);
  assert.equal(data["radar:trials"].friend.bonusDays, 7, "the friend's days wait for her trial");
  assert.equal(userTrialOf(data["radar:trials"].inviter, { days: 7, now: NOW }).daysLeft, 7, "the inviter's ended trial reopens for 7 days");
  const twice = fakeRes();
  await h({ method: "POST", url: "/api/store?mode=radar-board&op=referral-claim", headers: hdr("t-friend"), body: { code } }, twice);
  assert.equal(twice.code, 409);
  assert.equal(twice.body.error, "already_joined");
  const view = fakeRes();
  await h({ method: "GET", url: "/api/store?mode=radar-board&op=referral", headers: hdr("t-inviter") }, view);
  assert.equal(view.body.referral.friends, 1);
  assert.equal(view.body.referral.code, code, "the same code");
});
