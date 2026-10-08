// LEGAL PACK — the user-facing legal documents and the acceptance records.
//
// Pins: the committed pages are exactly what src/lib/legal/documents.js
// renders; internal lawyer notes never reach a public page; the numbers in
// the cancellation policy are the numbers the server applies; every page
// links the whole pack; a paid checkout needs acceptance of the CURRENT
// version (recorded with version + time); marketing consent is separate and
// removable with a signed one-click link; the waitlist is only for coming-soon
// plans. Placeholders ([OWNER_INPUT: …]) are reported, not hidden.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

test("committed legal pages are exactly what documents.js renders (run `npm run pages:build`)", async () => {
  const { renderLegalPages } = await import("../src/lib/staticPages/legalPages.js");
  for (const [rel, html] of Object.entries(renderLegalPages())) {
    assert.ok(existsSync(path.join(ROOT, "public", rel)), `public/${rel} exists`);
    assert.equal(read(`public/${rel}`), html.replace(/\r\n/g, "\n"), `public/${rel} is stale`);
  }
});

test("all 11 documents exist, are numbered, versioned and dated", async () => {
  const { getLegalDocuments } = await import("../src/lib/legal/documents.js");
  const { LEGAL_VERSION } = await import("../src/lib/legal/catalog.js");
  const docs = getLegalDocuments();
  assert.equal(docs.length, 11);
  for (const d of docs) {
    assert.ok(d.sections?.length >= 1 && d.intro, d.slug);
    const html = read(`public/legal/${d.slug}.html`);
    assert.match(html, new RegExp(`גרסה ${LEGAL_VERSION}`), `${d.slug}: version shown`);
    assert.match(html, /עודכן לאחרונה/, `${d.slug}: last updated shown`);
    assert.match(html, /<span class="num">1\.1<\/span>/, `${d.slug}: numbered clauses`);
    for (const other of docs) assert.ok(html.includes(`href="/legal/${other.slug}"`), `${d.slug} links ${other.slug}`);
  }
});

test("no internal notes on public pages", async () => {
  const NOTE = /for lawyer|lawyer review|attorney|לעורך הדין|לבדיקת עו"ד|TODO|FIXME|OPEN_QUESTIONS/i;
  const { getLegalDocuments } = await import("../src/lib/legal/documents.js");
  assert.doesNotMatch(JSON.stringify(getLegalDocuments()), NOTE, "the document texts carry an internal note");
  const files = ["public/pricing.html", "public/legal.html", ...(await import("../src/lib/legal/catalog.js")).LEGAL_DOCS.map((d) => `public/legal/${d.slug}.html`)];
  for (const f of files) assert.doesNotMatch(read(f), NOTE, `${f} carries an internal note`);
  for (const f of ["legal/OPEN_QUESTIONS.md", "HANDOFF.md"]) assert.ok(!existsSync(path.join(ROOT, f)), `${f}: internal notes must stay out of the public repository`);
});

test("required clauses are present", () => {
  const terms = read("public/legal/terms.html");
  assert.match(terms, /בני 18 ומעלה/);
  assert.match(terms, /דיני מדינת ישראל/);
  assert.match(terms, /סמכות השיפוט/);
  assert.match(terms, /לא מבטיחה מכירות, הכנסה/);
  assert.match(read("public/legal/disclaimer.html"), /לא מבטיחה מכירות, הכנסה/);
  const privacy = read("public/legal/privacy.html");
  assert.match(privacy, /תיקון 13/);
  assert.match(privacy, /30א/);
  assert.match(read("public/legal/accessibility.html"), /5568/);
  assert.match(read("public/legal/affiliate-disclosure.html"), /#פרסומת/);
  assert.match(read("public/legal/acceptable-use.html"), /scraping/);
  assert.match(read("public/legal/ip-takedown.html"), /הודעה על הפרה/);
});

test("the cancellation policy states exactly the terms the server applies", async () => {
  const c = await import("../src/lib/billing/cancellation.js");
  const html = read("public/legal/cancellation.html");
  assert.ok(html.includes(`בתוך ${c.COOLING_OFF_DAYS} יום`));
  assert.ok(html.includes(`₪${c.CANCEL_FEE_CAP_ILS}`));
  assert.ok(html.includes(`${c.CANCEL_EFFECT_BUSINESS_DAYS} ימי עסקים`));
  const { PLANS } = await import("../src/lib/plans.js");
  const refund = (PLANS.STARTER.price - c.cancellationFee(PLANS.STARTER.price)).toFixed(2);
  assert.ok(html.includes(`₪${refund}`), "the worked example matches cancellationFee()");
  assert.match(html, /אינו מתחדש אוטומטית/);
});

test("owner details: no placeholder left, identity only on lawful request by e-mail (owner's privacy)", async () => {
  // The owner asked that her personal name, address and ID never appear on the
  // site: the documents name "the owner of LikeLink" and route identity
  // requests to the contact e-mail. A placeholder must never reach a page.
  const { getLegalDocuments } = await import("../src/lib/legal/documents.js");
  const text = JSON.stringify(getLegalDocuments());
  const placeholders = [...new Set([...text.matchAll(/\[OWNER_INPUT: ([^\]]+)\]/g)].map((m) => m[1]))];
  assert.deepEqual(placeholders, []);
  assert.match(text, /בעלת האתר LikeLink/);
  assert.match(text, /יימסרו לפי דרישה כדין בפנייה בדוא/);
  assert.match(text, /hen63165@gmail\.com/);
});

// ── acceptance API ───────────────────────────────────────────────────────────
function harness(env = {}) {
  const kv = new Map();
  const USERS = { "tok-a": { id: "u-a", email: "a@likelink.test" }, "tok-owner": { id: "u-o", email: "owner@likelink.test" } };
  const deps = {
    kvGet: async (k) => (kv.has(k) ? structuredClone(kv.get(k)) : null),
    kvSet: async (k, v) => { kv.set(k, structuredClone(v)); },
    verifyToken: async (t) => USERS[t] || null,
    verifyAdminToken: () => null,
    env: { OWNER_EMAIL: "owner@likelink.test", STORE_SIGN_SECRET: "sign-secret-test", ...env },
    now: () => Date.parse("2026-10-01T10:00:00Z"),
  };
  return { kv, deps };
}
function mockRes() {
  return { statusCode: 200, headers: {}, body: undefined, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader(k) { return this.headers[k.toLowerCase()]; }, json(o) { this.body = o; }, end() {} };
}
function req({ method = "GET", url, token, body }) {
  return { method, url, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, [Symbol.asyncIterator]: async function* () { if (body) yield Buffer.from(JSON.stringify(body)); } };
}

test("acceptance: only the current version, recorded with time and context; status reports it", async () => {
  const { createLegalHandler } = await import("../api/_utils/legalHandler.mjs");
  const { LEGAL_VERSION } = await import("../src/lib/legal/catalog.js");
  const { kv, deps } = harness();
  const h = createLegalHandler(deps);
  const call = async (o) => { const r = mockRes(); await h(req(o), r); return r; };
  let r = await call({ url: "/api/store?mode=legal&action=status" });
  assert.equal(r.statusCode, 401);
  r = await call({ url: "/api/store?mode=legal&action=status", token: "tok-a" });
  assert.equal(r.body.needsAcceptance, true);
  r = await call({ method: "POST", url: "/api/store?mode=legal&action=accept", token: "tok-a", body: { version: "2020-01-01", context: "checkout" } });
  assert.equal(r.statusCode, 409);
  assert.equal(r.body.error, "legal_version_outdated");
  r = await call({ method: "POST", url: "/api/store?mode=legal&action=accept", token: "tok-a", body: { version: LEGAL_VERSION, context: "checkout", ageConfirmed18: true } });
  assert.equal(r.statusCode, 200);
  const rec = kv.get("legal:acceptances")["u-a"];
  assert.deepEqual([rec.current.version, rec.current.context, rec.current.at, rec.current.ageConfirmed18], [LEGAL_VERSION, "checkout", "2026-10-01T10:00:00.000Z", true]);
  r = await call({ url: "/api/store?mode=legal&action=status", token: "tok-a" });
  assert.equal(r.body.needsAcceptance, false);
});

test("marketing consent is separate, explicit, and removable with a signed one-click link", async () => {
  const { createLegalHandler, unsubscribeSignature } = await import("../api/_utils/legalHandler.mjs");
  const { kv, deps } = harness();
  const h = createLegalHandler(deps);
  const call = async (o) => { const r = mockRes(); await h(req(o), r); return r; };
  let r = await call({ method: "POST", url: "/api/store?mode=legal&action=marketing", token: "tok-a", body: { optIn: "yes" } });
  assert.equal(r.statusCode, 400, "only an explicit boolean");
  r = await call({ method: "POST", url: "/api/store?mode=legal&action=marketing", token: "tok-a", body: { optIn: true } });
  assert.equal(kv.get("legal:marketing_consent")["u-a"].optIn, true);
  r = await call({ url: "/api/store?mode=legal&action=unsubscribe&u=u-a&sig=forged" });
  assert.equal(r.statusCode, 400);
  const sig = unsubscribeSignature("u-a", "sign-secret-test");
  r = await call({ url: `/api/store?mode=legal&action=unsubscribe&u=u-a&sig=${sig}` });
  assert.equal(r.statusCode, 200);
  assert.equal(kv.get("legal:marketing_consent")["u-a"].optIn, false);
  const noSecret = createLegalHandler(harness({ STORE_SIGN_SECRET: "" }).deps);
  const r2 = mockRes(); await noSecret(req({ url: `/api/store?mode=legal&action=unsubscribe&u=u-a&sig=${sig}` }), r2);
  assert.equal(r2.statusCode, 503, "fails closed without the signing secret");
});

test("waitlist: coming-soon plans only, idempotent, owner-only listing", async () => {
  const { createLegalHandler } = await import("../api/_utils/legalHandler.mjs");
  const { kv, deps } = harness();
  const h = createLegalHandler(deps);
  const call = async (o) => { const r = mockRes(); await h(req(o), r); return r; };
  let r = await call({ method: "POST", url: "/api/store?mode=legal&action=waitlist", token: "tok-a", body: { planId: "starter" } });
  assert.equal(r.statusCode, 400);
  await call({ method: "POST", url: "/api/store?mode=legal&action=waitlist", token: "tok-a", body: { planId: "elite" } });
  await call({ method: "POST", url: "/api/store?mode=legal&action=waitlist", token: "tok-a", body: { planId: "elite" } });
  assert.equal(kv.get("plans:waitlist").length, 1);
  r = await call({ url: "/api/store?mode=legal&action=waitlist", token: "tok-a" });
  assert.equal(r.statusCode, 403);
  r = await call({ url: "/api/store?mode=legal&action=waitlist", token: "tok-owner" });
  assert.equal(r.body.count, 1);
});

test("legal records are server-only keys", async () => {
  const { BROWSER_WRITE_POLICIES } = await import("../api/_utils/storeWritePolicy.mjs");
  for (const k of ["legal:acceptances", "legal:marketing_consent", "plans:waitlist", "billing:refund_requests"]) {
    assert.equal(BROWSER_WRITE_POLICIES[k], undefined, k);
  }
  const migrations = read("supabase/migrations/20260928000000_kv_lockdown.sql");
  for (const k of ["legal:", "plans:waitlist", "billing:"]) assert.ok(!migrations.includes(k), `${k} is not publicly readable`);
});
