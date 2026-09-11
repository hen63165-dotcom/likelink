// LikeLink Cloud Passport ☁️ — "תעודת ענן"
// ============================================================================
// זהות אנונימית חתומה לכל מבקר — השכבה שהופכת את הענן לענן על.
//
// מה זה נותן (בלי תלות, בלי צד שלישי, בלי PII):
//   1. מדידה אמיתית של מבקרים ייחודיים — נכנסו/חזרו/חיים עכשיו/יצאו
//      (החור היחיד בדוח היומי — visitorsMeasured:false — נסגר כאן).
//   2. Rate limiting חכם לכל מצב רגיש — הגנה על הענן מפני סורקים ובוטים.
//   3. עקיבות אנונימית לחלוטין: בענן נשמר רק hash — לעולם לא ה-IP של המבקר
//      ולא התעודה עצמה. העוגייה HttpOnly — JavaScript לא רואה אותה.
//
// פורמט התעודה:  `<id>.<exp>.<hmac-sha256(id.exp)>`
// סוד: CLOUD_PASSPORT_SECRET, ואם חסר — גזירה דטרמיניסטית מסוד החתימה הקיים.

import crypto from "crypto";

const COOKIE_NAME = "ll_passport";
const TTL_MS = 90 * 24 * 3600 * 1000; // 90 ימי חיים לתעודה

const SECRET =
  process.env.CLOUD_PASSPORT_SECRET ||
  crypto.createHash("sha256").update(`likelink:passport:${process.env.STORE_SIGN_SECRET || process.env.ADMIN_CODE || "fallback"}`).digest("hex");

function sign(payload) {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
}

function safeEqual(a, b) {
  try {
    const ab = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/** hash אנונימי יציב — מה שנשמר בענן במקום התעודה עצמה */
export function passportHash(id) {
  return crypto.createHash("sha256").update(String(id || "")).digest("hex").slice(0, 32);
}

function parseCookie(req, name) {
  const raw = req.headers?.cookie || "";
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function setCookie(res, value) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${Math.floor(TTL_MS / 1000)}`,
  ];
  const prev = res.getHeader("Set-Cookie");
  const arr = prev ? (Array.isArray(prev) ? prev.concat([parts.join("; ")]) : [prev, parts.join("; ")]) : parts.join("; ");
  res.setHeader("Set-Cookie", arr);
}

/**
 * מאחזר תעודה קיימת ומאמת אותה, או מנפיק חדשה.
 * מחזיר { id, hash, fresh } — או null רק אם אי אפשר לכתוב עוגייה.
 */
export function getOrCreatePassport(req, res) {
  const raw = parseCookie(req, COOKIE_NAME);
  if (raw) {
    const [id, expStr, sig] = String(raw).split(".");
    const exp = Number(expStr);
    if (id && exp && sig && exp > Date.now() && safeEqual(sig, sign(`${id}.${exp}`))) {
      return { id, hash: passportHash(id), fresh: false };
    }
  }
  // הנפקה חדשה — ענן חתום, אי אפשר לזייף בלי הסוד (שנמצא רק בשרת)
  const id = crypto.randomBytes(16).toString("hex");
  const exp = Date.now() + TTL_MS;
  const token = `${id}.${exp}.${sign(`${id}.${exp}`)}`;
  try {
    setCookie(res, token);
  } catch {
    return null;
  }
  return { id, hash: passportHash(id), fresh: true };
}

// ── מדידת ביקורים — האמת הראשונה של הענן ────────────────────────────────────
const VISITS_KEY = "cloud:visits";
const VISITS_CAP = 3000; // תקרה — מונע צמיחה בלתי מרוסנת
const lastWriteByHash = new Map(); // debounce בזיכרון לפר-אינסטנס
const WRITE_DEBOUNCE_MS = 60_000;

function dayKey(ts = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(ts));
}

/**
 * רושם ביקור אנונימי. נכשל בשקט — מדידה לעולם לא שוברת את הבקשה העסקית.
 */
export async function recordVisit(kvGet, kvSet, hash) {
  if (!kvGet || !kvSet || !hash) return false;
  const now = Date.now();
  const last = lastWriteByHash.get(hash);
  if (last && now - last < WRITE_DEBOUNCE_MS) return false; // מניעת ספאינג כתיבות
  lastWriteByHash.set(hash, now);
  try {
    const visits = (await kvGet(VISITS_KEY, [])) || [];
    const d = dayKey(now);
    const arr = Array.isArray(visits) ? visits : [];
    const existing = arr.find((e) => e && e.d === d && e.h === hash);
    if (existing) {
      existing.l = now;
      existing.v = (existing.v || 0) + 1;
    } else {
      arr.push({ d, h: hash, f: now, l: now, v: 1 });
    }
    const capped = arr.length > VISITS_CAP ? arr.slice(-Math.floor(VISITS_CAP * 0.85)) : arr;
    await kvSet(VISITS_KEY, capped);
    return true;
  } catch {
    return false;
  }
}

/**
 * סטטיסטיקת מבקרים — המספרים האמיתיים של "מי נכנס, מי חזר, מי עכשיו".
 * אפס המצאות: כל מספר נגזר ישירות מהנתונים שנרשמו.
 */
export async function visitorStats(kvGet) {
  const visits = (await kvGet(VISITS_KEY, [])) || [];
  const arr = Array.isArray(visits) ? visits : [];
  const now = Date.now();
  const today = dayKey(now);
  const weekAgo = now - 7 * 24 * 3600 * 1000;

  const todayEntries = arr.filter((e) => e && e.d === today);
  const uniqueToday = todayEntries.length;
  const liveNow = todayEntries.filter((e) => now - (e.l || 0) < 5 * 60 * 1000).length;
  const activeRecent = todayEntries.filter((e) => now - (e.l || 0) < 30 * 60 * 1000).length;
  const exitsToday = Math.max(0, uniqueToday - activeRecent); // נראו היום, שקטים 30+ דקות
  const newToday = todayEntries.filter((e) => (e.f || 0) > now - 24 * 3600 * 1000).length;
  const returningToday = Math.max(0, uniqueToday - newToday);

  const recentWeek = arr.filter((e) => e && (e.l || 0) > weekAgo);
  const uniqueWeek = new Set(recentWeek.map((e) => e.h)).size;
  const uniqueAll = new Set(arr.map((e) => e.h)).size;
  const viewsToday = todayEntries.reduce((s, e) => s + (e.v || 1), 0);
  const avgViewsToday = uniqueToday ? Math.round((viewsToday / uniqueToday) * 10) / 10 : 0;

  return {
    uniqueToday,
    uniqueWeek,
    uniqueAll,
    liveNow,
    newToday,
    returningToday,
    exitsToday,
    viewsToday,
    avgViewsToday,
    measured: true,
  };
}

// ── Rate limiting — מגן הסף של הענן ────────────────────────────────────────
const rateBuckets = new Map(); // key → { count, windowStart }

/**
 * חלון נע פשוט בזיכרון. מחזיר true כשמותר, false כשחרג (הקורא מחליט מה לעשות).
 */
export function rateAllow(bucketName, key, limit, windowMs = 60_000) {
  if (!key) return true;
  const k = `${bucketName}:${key}`;
  const now = Date.now();
  const b = rateBuckets.get(k);
  if (!b || now - b.windowStart > windowMs) {
    rateBuckets.set(k, { count: 1, windowStart: now });
    // היגיינת זיכרון — מונעת צמיחה בלתי מרוסנת באינסטנס ארוך חיים
    if (rateBuckets.size > 5000) {
      for (const [bk, bv] of rateBuckets) {
        if (now - bv.windowStart > windowMs) rateBuckets.delete(bk);
      }
    }
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}