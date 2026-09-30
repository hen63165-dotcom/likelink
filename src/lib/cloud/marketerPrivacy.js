// Creator privacy — what is public about a creator, and what is not.
//
// marketplace:marketers is on the public read allowlist (the site renders
// creator pages from it). It must therefore carry PUBLIC fields only. Contact
// and payout fields live in marketplace:marketers:private, a server-only key
// (not on the allowlist, so the anon key can never read it — no RLS change).
// Payout recipients (a PayPal email / bank details snapshot) likewise live in
// marketplace:payouts:recipients, never in the public payouts row.
//
// Server kv helpers MERGE on read (so ownership checks keep seeing the email)
// and SPLIT on write. A private value is only ever replaced by a non-empty
// value: a client that never loaded its private fields cannot erase them.
//
// Isomorphic and dependency-free (browser + serverless).

export const MARKETERS_KEY = "marketplace:marketers";
export const PRIVATE_MARKETERS_KEY = "marketplace:marketers:private";
export const PAYOUTS_KEY = "marketplace:payouts";
export const PAYOUT_RECIPIENTS_KEY = "marketplace:payouts:recipients";

export const PRIVATE_MARKETER_FIELDS = Object.freeze([
  "email", "payPalEmail", "paypalEmail", "bankDetails", "paymentNote",
  "iban", "bankAccount", "payoutDetails", "payoutEmail", "phone",
]);

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const toArr = (v) => (Array.isArray(v) ? v : []);
const idOf = (x) => (x && x.id !== undefined && x.id !== null ? String(x.id) : "");
const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** Parse a kv value that may arrive as a JSON string. */
export function parseValue(value) {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

/** true when a field holds real data (non-empty string, number, or an object with any real leaf). */
export function hasValue(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (typeof v === "number" || typeof v === "boolean") return true;
  if (Array.isArray(v)) return v.some(hasValue);
  if (typeof v === "object") return Object.values(v).some(hasValue);
  return false;
}

/** The public representation of one creator. */
export function publicMarketer(m) {
  if (!isObj(m)) return m;
  const out = { ...m };
  for (const f of PRIVATE_MARKETER_FIELDS) delete out[f];
  return out;
}

/** The private fields of one creator that hold real data. */
export function privateFieldsOf(m) {
  const out = {};
  if (!isObj(m)) return out;
  for (const f of PRIVATE_MARKETER_FIELDS) if (hasValue(m[f])) out[f] = m[f];
  return out;
}

/** list → { publicList, privateById } */
export function splitMarketers(list) {
  const publicList = [];
  const privateById = {};
  for (const m of toArr(parseValue(list))) {
    const id = idOf(m);
    publicList.push(publicMarketer(m));
    const priv = privateFieldsOf(m);
    if (id && Object.keys(priv).length) privateById[id] = priv;
  }
  return { publicList, privateById };
}

/** Full records for server-side use (ownership, payouts). Private wins over legacy public copies. */
export function mergeMarketers(publicList, privateById) {
  const priv = isObj(parseValue(privateById)) ? parseValue(privateById) : {};
  const list = parseValue(publicList);
  if (!Array.isArray(list)) return list ?? null;
  return list.map((m) => {
    const id = idOf(m);
    return id && isObj(priv[id]) ? { ...m, ...priv[id] } : m;
  });
}

/**
 * Merge new private fields into the stored map for the ids that still exist.
 * An empty incoming value never erases a stored one; ids no longer in the
 * public list are dropped (their creator was removed).
 */
export function mergePrivateMaps(stored, incoming, keepIds) {
  const s = isObj(parseValue(stored)) ? parseValue(stored) : {};
  const inc = isObj(incoming) ? incoming : {};
  const out = {};
  for (const id of keepIds) {
    const base = isObj(s[id]) ? { ...s[id] } : {};
    for (const [f, v] of Object.entries(isObj(inc[id]) ? inc[id] : {})) if (hasValue(v)) base[f] = v;
    if (Object.keys(base).length) out[id] = base;
  }
  return out;
}

/** payouts → { publicPayouts, recipientsById } (the recipient snapshot never goes public). */
export function splitPayouts(payouts) {
  const publicPayouts = [];
  const recipientsById = {};
  for (const p of toArr(parseValue(payouts))) {
    if (!isObj(p)) { publicPayouts.push(p); continue; }
    const { recipient, ...rest } = p;
    const id = idOf(p);
    if (id && hasValue(recipient)) recipientsById[id] = recipient;
    publicPayouts.push(rest);
  }
  return { publicPayouts, recipientsById };
}

export function mergePayouts(publicPayouts, recipientsById) {
  const rec = isObj(parseValue(recipientsById)) ? parseValue(recipientsById) : {};
  const list = parseValue(publicPayouts);
  if (!Array.isArray(list)) return list ?? null;
  return list.map((p) => {
    const id = idOf(p);
    if (!id || !isObj(p)) return p;
    if (hasValue(p.recipient)) return p; // legacy row that still carries it
    return rec[id] ? { ...p, recipient: rec[id] } : p;
  });
}

/** Recipient snapshots are append/replace-only and never erased by an empty value. */
export function mergeRecipientMaps(stored, incoming, keepIds) {
  const s = isObj(parseValue(stored)) ? parseValue(stored) : {};
  const out = {};
  for (const id of keepIds) {
    if (incoming && hasValue(incoming[id])) out[id] = incoming[id];
    else if (hasValue(s[id])) out[id] = s[id];
  }
  return out;
}

/** Count e-mail-like strings in a public value (the privacy probe — counts only). */
export function countEmailLike(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return (text.match(EMAIL_RE) || []).length;
}

const idsOf = (list) => toArr(list).map(idOf).filter(Boolean);

/**
 * Wrap a server's raw kv helpers so creator/payout privacy is automatic:
 * reads of the two public keys come back merged with their private maps,
 * writes are split. `assertWritable` is the kvReadGuard check — a private map
 * that could not be read is never overwritten.
 *   get(key, fallback) → value | fallback      set(key, value) → Promise
 */
export function createPrivateKv({ get, set, assertWritable = () => {} }) {
  return {
    async get(key, fallback = null) {
      if (key === MARKETERS_KEY) {
        const [pub, priv] = await Promise.all([get(MARKETERS_KEY, null), get(PRIVATE_MARKETERS_KEY, null)]);
        return mergeMarketers(pub, priv) ?? fallback;
      }
      if (key === PAYOUTS_KEY) {
        const [pub, rec] = await Promise.all([get(PAYOUTS_KEY, null), get(PAYOUT_RECIPIENTS_KEY, null)]);
        return mergePayouts(pub, rec) ?? fallback;
      }
      return get(key, fallback);
    },
    async set(key, value) {
      if (key === MARKETERS_KEY || key === PAYOUTS_KEY) {
        const list = parseValue(value);
        if (!Array.isArray(list)) return set(key, value);
        const privateKey = key === MARKETERS_KEY ? PRIVATE_MARKETERS_KEY : PAYOUT_RECIPIENTS_KEY;
        const split = key === MARKETERS_KEY ? splitMarketers(list) : splitPayouts(list);
        const publicList = key === MARKETERS_KEY ? split.publicList : split.publicPayouts;
        const incoming = key === MARKETERS_KEY ? split.privateById : split.recipientsById;
        // The effective stored private data = legacy copies still sitting in
        // the public row (pre-split) + the private map (wins). The first write
        // after the split therefore migrates them instead of dropping them.
        const [stored, legacyPublic] = await Promise.all([get(privateKey, null), get(key, null)]);
        assertWritable(privateKey);
        assertWritable(key);
        const legacy = key === MARKETERS_KEY ? splitMarketers(legacyPublic).privateById : splitPayouts(legacyPublic).recipientsById;
        const priv = isObj(parseValue(stored)) ? parseValue(stored) : {};
        const effective = { ...legacy };
        for (const [id, v] of Object.entries(priv)) effective[id] = key === MARKETERS_KEY && isObj(v) ? { ...(legacy[id] || {}), ...v } : v;
        const merged = key === MARKETERS_KEY
          ? mergePrivateMaps(effective, incoming, idsOf(publicList))
          : mergeRecipientMaps(effective, incoming, idsOf(publicList));
        await set(privateKey, merged);
        return set(key, publicList);
      }
      return set(key, value);
    },
  };
}
