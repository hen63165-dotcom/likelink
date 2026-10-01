// Store write policy — who may change what in the shared kv table.
//
// The browser writes WHOLE arrays through POST /api/store (setJSON in
// MarketplaceContext). Before this policy, any visitor could send any array
// and overwrite every creator's products, the marketer list (incl. the PayPal
// email payouts are sent to), push keys, autopilot configs, …
//
// Now, for every non-admin write:
//   • Only keys listed in BROWSER_WRITE_POLICIES are writable at all
//     (default deny → "server_only_key").
//   • The server MERGES the submitted array into the stored one instead of
//     replacing it. A caller can add/change/delete only records it owns
//     (ownership = the verified Supabase email matches the marketer record).
//   • Anonymous shoppers can still do what the app needs them to: bump a
//     product's click counter by one and append click/view events.
//   • A stale client snapshot can no longer delete other creators' records.
//
// Admin tokens bypass this module (full control, audited by the caller).
// Pure functions — no I/O — so the rules are unit-tested directly.

const toArr = (v) => (Array.isArray(v) ? v : []);
const idOf = (item) => (item && item.id !== undefined && item.id !== null ? String(item.id) : "");
const norm = (v) => String(v ?? "").trim().toLowerCase();

/** The browser sends JSON strings (setJSON); tolerate already-parsed values. */
export function parseStoreValue(value) {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

/** Marketer ids the verified actor owns (same email, case-insensitive). */
export function ownedMarketerIdsFor(actor, marketers) {
  const email = norm(actor?.email);
  const ids = new Set();
  if (!email) return ids;
  for (const m of toArr(marketers)) {
    if (m && norm(m.email) === email && idOf(m)) ids.add(idOf(m));
  }
  return ids;
}

function owns(ctx, ownerId) {
  return Boolean(ownerId) && ctx.ownedMarketerIds.has(String(ownerId));
}

/**
 * Generic owner-scoped merge by id.
 *   ownerOf(item)         → owning marketer id
 *   counters              → { field: maxStepPerWrite } anyone may increase
 *   monotonicTrue         → boolean fields anyone may flip false → true
 *   allowCreate(item)     → non-owned new items that may still be created
 *   sanitizeCreate(item)  → shape of such a created item
 *   protect(stored, next) → owner update with server-managed fields restored
 *   immutableExisting     → existing items can never change/delete (append-only)
 */
function mergeOwnedById(stored, next, ctx, opts) {
  const {
    ownerOf, counters = {}, monotonicTrue = [], allowCreate = null, sanitizeCreate = (x) => x,
    protect = (_s, n) => n, immutableExisting = false,
  } = opts;
  const storedArr = toArr(stored);
  const nextArr = toArr(next);
  const nextById = new Map();
  for (const n of nextArr) if (idOf(n)) nextById.set(idOf(n), n);

  let rejected = 0;
  let rejectedCreates = 0;
  const seen = new Set();
  const result = [];
  for (const s of storedArr) {
    const id = idOf(s);
    if (!id) { result.push(s); continue; }
    seen.add(id);
    const n = nextById.get(id);
    if (immutableExisting) { result.push(s); if (n && JSON.stringify(n) !== JSON.stringify(s)) rejected++; continue; }
    if (owns(ctx, ownerOf(s))) {
      if (!n) continue; // the owner deleted it
      // Ownership can never be handed to someone else by a non-admin.
      if (!owns(ctx, ownerOf(n))) { result.push(s); rejected++; continue; }
      result.push(protect(s, n));
      continue;
    }
    if (!n) { result.push(s); continue; } // non-owner "delete" (or stale snapshot) → keep
    let merged = s;
    for (const [field, maxStep] of Object.entries(counters)) {
      const sv = Number(s[field]) || 0;
      const nv = Number(n[field]) || 0;
      if (nv > sv) merged = { ...merged, [field]: Math.min(nv, sv + maxStep) };
    }
    for (const field of monotonicTrue) {
      if (n[field] === true && s[field] !== true) merged = { ...merged, [field]: true };
    }
    if (merged === s && JSON.stringify(n) !== JSON.stringify(s)) rejected++;
    result.push(merged);
  }
  const created = [];
  for (const n of nextArr) {
    const id = idOf(n);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (owns(ctx, ownerOf(n))) created.push(n);
    else if (allowCreate && allowCreate(n, storedArr)) created.push(sanitizeCreate(n));
    else { rejected++; rejectedCreates++; }
  }
  return { result, created, rejected, rejectedCreates };
}

// ── per-key policies ────────────────────────────────────────────────────────

// Fields the server (or an admin) manages on a marketer record.
const PROTECTED_MARKETER_FIELDS = [
  "id", "email", "tier", "plan", "planId", "subscription", "subscriptionId", "subscriptionStatus",
  "isAdmin", "admin", "role", "authUserId", "userId", "verified", "verifiedAt", "trustState", "createdAt",
];
// Payout/identity fields an anonymous (unverified) signup may not set.
const PAYOUT_FIELDS = ["payPalEmail", "paypalEmail", "iban", "bankAccount", "bankDetails", "payoutDetails", "payoutEmail"];

function restoreFields(stored, next, fields) {
  const out = { ...next };
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(stored, f)) out[f] = stored[f];
    else delete out[f];
  }
  return out;
}

// Moderation outcomes an owner can never reverse, and server-set trust fields.
const MODERATED_STATUSES = new Set(["flagged", "removed", "rejected"]);
// videoUrl & co. are attached by the server (src/lib/cloud/reelAttach.js) — a
// stale client list can never drop them (which would make the reel private).
const PROTECTED_PRODUCT_FIELDS = [
  "trustState", "verification", "verifiedAt", "merchantEligible", "veritasHash", "importSource",
  // Product video fields are written by the server only — the studio reel
  // attachment (reelAttach.js) and the native render pipeline (reelPublisher.js).
  "videoUrl", "videoPoster", "videoProvider", "videoSynthetic", "videoStyle", "videoStatus", "videoAssetId", "videoUpdatedAt",
];

function policyProducts(stored, next, ctx) {
  const { result, created, rejected, rejectedCreates } = mergeOwnedById(stored, next, ctx, {
    ownerOf: (p) => p?.marketerId,
    counters: { clicks: 1 },
    protect: (s, n) => {
      const out = restoreFields(s, n, PROTECTED_PRODUCT_FIELDS);
      if (MODERATED_STATUSES.has(String(s.status))) out.status = s.status;
      return out;
    },
  });
  // Server-set fields can't be forged on a new product either.
  const cleanCreated = created.map((p) => {
    const out = { ...p };
    for (const f of PROTECTED_PRODUCT_FIELDS) delete out[f];
    return out;
  });
  return { ok: true, value: [...result, ...cleanCreated], rejected, rejectedCreates };
}

function policyMarketers(stored, next, ctx) {
  const { result, created, rejected, rejectedCreates } = mergeOwnedById(stored, next, ctx, {
    ownerOf: (m) => idOf(m),
    protect: (s, n) => restoreFields(s, n, PROTECTED_MARKETER_FIELDS),
    // Signup: a new studio with a fresh, unused email may be created. Without a
    // verified session it may not carry payout details (set them later, signed in).
    allowCreate: (n, storedArr) => {
      const email = norm(n?.email);
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
      return !storedArr.some((m) => norm(m?.email) === email);
    },
    sanitizeCreate: (n) => {
      const out = { ...n };
      for (const f of PROTECTED_MARKETER_FIELDS) if (f !== "id" && f !== "email" && f !== "createdAt") delete out[f];
      if (norm(ctx.actorEmail) !== norm(n.email)) for (const f of PAYOUT_FIELDS) delete out[f];
      return out;
    },
  });
  return { ok: true, value: [...result, ...created], rejected, rejectedCreates };
}

function appendOnly({ cap, maxNew, accept, sanitize = (n) => n }) {
  return (stored, next, ctx) => {
    const storedArr = toArr(stored);
    const known = new Set(storedArr.map(idOf).filter(Boolean));
    const fresh = [];
    let rejected = 0;
    for (const n of toArr(next)) {
      const id = idOf(n);
      if (!id || known.has(id)) continue;
      known.add(id);
      if (fresh.length >= maxNew || !accept(n, ctx)) { rejected++; continue; }
      fresh.push(sanitize(n));
    }
    return { ok: true, value: [...storedArr, ...fresh].slice(-cap), rejected, rejectedCreates: 0 };
  };
}

const CLICK_TYPES = new Set([undefined, null, "click", "view", "outbound_click"]);
function recentTs(ts, now) {
  const n = Number(ts);
  return Number.isFinite(n) && n > now - 24 * 60 * 60 * 1000 && n < now + 5 * 60 * 1000;
}

const policyClicks = appendOnly({
  cap: 5000,
  maxNew: 5,
  accept: (n, ctx) => typeof n.productId === "string" && n.productId.length <= 80 && CLICK_TYPES.has(n.type) && recentTs(n.ts, ctx.now),
  // A visitor's event keeps only known attribution fields, clipped (no free-form payloads).
  sanitize: (n) => {
    const out = { id: String(n.id).slice(0, 80), productId: n.productId, ts: Number(n.ts) };
    if (n.type) out.type = n.type;
    if (typeof n.marketerId === "string") out.marketerId = n.marketerId.slice(0, 80);
    for (const [k, max] of [["src", 80], ["med", 60], ["camp", 80], ["cnt", 60]]) if (typeof n[k] === "string" && n[k]) out[k] = n[k].slice(0, max);
    if (typeof n.cid === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(n.cid)) out.cid = n.cid;
    return out;
  },
});

function policyReferralClicks(stored, next, ctx) {
  // Append new clicks; existing ones may only flip converted false → true.
  const { result, created, rejected, rejectedCreates } = mergeOwnedById(stored, next, ctx, {
    ownerOf: () => "",
    monotonicTrue: ["converted"],
    allowCreate: (n) => typeof n.referrerSlug === "string" && n.referrerSlug.length <= 80 && recentTs(n.clickedAt, ctx.now),
    sanitizeCreate: (n) => ({ id: n.id, referrerSlug: n.referrerSlug, clickedAt: Number(n.clickedAt), converted: false }),
  });
  return { ok: true, value: [...result, ...created.slice(0, 2)].slice(-500), rejected, rejectedCreates };
}

function policyNotifications(stored, next, ctx) {
  const { result, created, rejected, rejectedCreates } = mergeOwnedById(stored, next, ctx, {
    ownerOf: (n) => n?.marketerId,
    // A shopper's tap creates a "click" notification for the product's creator.
    allowCreate: (n) => n?.kind === "click" && typeof n.productId === "string" && recentTs(n.ts, ctx.now),
    sanitizeCreate: (n) => ({ id: n.id, marketerId: n.marketerId, kind: "click", productId: n.productId, ts: Number(n.ts) }),
  });
  // Newest first (the client prepends), capped.
  return { ok: true, value: [...created.slice(0, 3), ...result].slice(0, 500), rejected, rejectedCreates };
}

function policyCharges(stored, next, ctx) {
  // Charges reduce a creator's own balance: owners may add, nobody may edit/delete.
  const { result, created, rejected, rejectedCreates } = mergeOwnedById(stored, next, ctx, {
    ownerOf: (c) => c?.marketerId,
    immutableExisting: true,
  });
  return { ok: true, value: [...result, ...created], rejected, rejectedCreates };
}

function policyOwnedList(stored, next, ctx) {
  const { result, created, rejected, rejectedCreates } = mergeOwnedById(stored, next, ctx, { ownerOf: (x) => x?.marketerId });
  return { ok: true, value: [...result, ...created], rejected, rejectedCreates };
}

export const BROWSER_WRITE_POLICIES = Object.freeze({
  "marketplace:products": policyProducts,
  "marketplace:marketers": policyMarketers,
  "marketplace:clicks": policyClicks,
  "marketplace:referral_clicks": policyReferralClicks,
  "marketplace:notifications": policyNotifications,
  "marketplace:charges": policyCharges,
  "marketplace:collections": policyOwnedList,
  "marketplace:videos": policyOwnedList,
});

/**
 * Apply the policy for `key`. ctx = { ownedMarketerIds:Set, actorEmail, now }.
 * → { ok:true, value, rejected } | { ok:false, error }
 */
export function applyStoreWritePolicy(key, stored, next, ctx) {
  const policy = BROWSER_WRITE_POLICIES[String(key || "").toLowerCase().trim()];
  if (!policy) return { ok: false, error: "server_only_key" };
  const parsed = parseStoreValue(next);
  if (!Array.isArray(parsed)) return { ok: false, error: "invalid_value" };
  return policy(parseStoreValue(stored), parsed, {
    ownedMarketerIds: ctx?.ownedMarketerIds instanceof Set ? ctx.ownedMarketerIds : new Set(),
    actorEmail: ctx?.actorEmail || "",
    now: Number(ctx?.now) || Date.now(),
  });
}

/**
 * Sales: the only non-admin write is "append this one signed sale". The rest
 * of the submitted array is ignored, so one signature can never rewrite history.
 */
export function mergeSignedSale(stored, signedSale) {
  const storedArr = toArr(parseStoreValue(stored));
  if (!signedSale || !idOf(signedSale)) return { ok: false, error: "signed_sale_missing" };
  if (storedArr.some((s) => idOf(s) === idOf(signedSale))) return { ok: false, error: "duplicate_signed_sale" };
  return { ok: true, value: [...storedArr, signedSale] };
}
