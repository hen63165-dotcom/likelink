import { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import { storage } from "../lib/storage.js";
import { recordActivity, getActivity } from "../lib/studioActivity.js";
import { supabase } from "../lib/supabaseClient.js";
import { signUpSeller, signInSeller, signOutSeller, authConfigured, getSessionToken } from "../lib/auth.js";
import { K, PLATFORM_FEE_PERCENT_DEFAULT, MIN_PAYOUT_THRESHOLD, PAYOUT_METHOD, PAYOUT_DEFAULT, BOOST_PRICE, BOOST_DURATION_HOURS } from "../constants/keys.js";
import { uid, slugify, uniqueSlug, isValidEmail, isSafeHttpUrl, isSafeImageUrl, clampNumber, injectAliExpressTracking, findProductsNeedingTracking, fetchOgImage } from "../utils/helpers.js";
import { toHebrewError, authErrorHe } from "../lib/errorMessages.js";
import { CATEGORY_KEYS } from "../lib/i18n.js";
import { useI18n } from "../lib/LangContext";
// SECURITY: NO seed fallback here. When the cloud is unreachable or empty, the
// UI must show an EMPTY marketplace — never fake demo products/marketers.
// The server auto-bootstraps the real catalog (api/store.mjs autoBootstrapCatalog).
import { getSellerPayoutSummary, PAYOUT_STATUS } from "../lib/payments.js";
import { getPendingReferral, clearPendingReferral, trackReferralConversion } from "../lib/referral.js";
import { resolveCurrentMarketer, linkMarketer, fetchOwnPrivate } from "../lib/cloud/identity.js";
import { assertAuthSafeForEnvironment } from "../lib/auth-v2/prodGuard.js";

const MarketplaceContext = createContext(null);

function isLegacyDemoSeed(products = [], marketers = []) {
  const legacyProductTitles = new Set([
    "שמלת קיץ מקסי מאריג משי",
    "מעיל פסים קשמיר רך",
    "תיק עור אמיתי בסגנון בלגי",
    "עגילי כסף מינימליסטיים",
    "סרום ויטמין C להבהרה",
    "מברשת בישום מבריקה",
    "קרם לחות ל־24 שעות",
    "מסכת בוץ ירוק טיהור",
    "סט בנייה מעץ לילדים",
    "מנורת שולחן חכמה עם טעינה אלחוטית",
    "אוזניות אלחוטיות עם ביטול רעשים",
    "ערכת סירים מנירוסטה",
    "מדפי קיר מודולריים",
    "אביזרי התנגדות לסט כושר ביתי",
    "שטיח יוגה אקולוגי",
  ]);

  const legacyMarketerNames = new Set([
    "מיה כהן",
    "נועה לוי",
    "דנה אברהם",
    "שירה מזרחי",
  ]);

  return (
    Array.isArray(products) && products.some((p) => legacyProductTitles.has(String(p?.title || ""))) ||
    Array.isArray(marketers) && marketers.some((m) => legacyMarketerNames.has(String(m?.name || "")))
  );
}

function resetLegacyMarketplaceStorage() {
  try {
    const keysToClear = [
      K.marketers,
      K.products,
      "sch:shared:marketplace:marketers",
      "sch:shared:marketplace:products",
      "sch:shared:marketplace:sales",
      "sch:shared:marketplace:settings",
      "sch:shared:marketplace:clicks",
      "sch:shared:marketplace:notifications",
      "sch:shared:marketplace:collections",
      "sch:shared:marketplace:payouts",
      "sch:shared:marketplace:charges",
    ];
    keysToClear.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        // noop
      }
    });
  } catch {
    // noop
  }
}

// Creator privacy: the public creators row carries no e-mail / payout fields.
// The verified owner's own fields (GET /api/store?mode=me) are merged into
// their record in memory only, so settings show them and saves keep them.
function mergePrivateInto(setMarketers, rows) {
  const byId = new Map((rows || []).filter((r) => r && r.id).map((r) => [String(r.id), r]));
  if (!byId.size) return;
  setMarketers((prev) => prev.map((m) => {
    const p = byId.get(String(m?.id));
    if (!p) return m;
    const { id, ...fields } = p;
    const bank = fields.bankDetails || m.bankDetails || {};
    return {
      ...m,
      ...fields,
      bankDetails: { bankName: String(bank.bankName ?? ""), branch: String(bank.branch ?? ""), account: String(bank.account ?? ""), holder: String(bank.holder ?? ""), ...(bank.iban ? { iban: String(bank.iban) } : {}) },
    };
  }));
}

async function getJSON(key, shared, fallback) {
  const res = await storage.get(key, shared);
  if (res == null || res.value == null) return fallback;
  try {
    const parsed = JSON.parse(res.value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

async function setJSON(key, value, shared) {
  await storage.set(key, JSON.stringify(value), shared);
}

// Safe coercion helpers — never throw "Cannot convert object to primitive value",
// even when a legacy record holds a non-primitive field.
const toArr = (v) => (Array.isArray(v) ? v : []);
const toStr = (v, fb = "") => {
  if (typeof v === "string") return v;
  try { return String(v ?? fb); } catch { return fb; }
};
const toNum = (v, fb = 0) => {
  try {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fb;
  } catch { return fb; }
};

export function MarketplaceProvider({ children }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [marketers, setMarketers] = useState([]);
  const [products, setProducts] = useState([]);
  const [clicks, setClicks] = useState([]);
  const [sales, setSales] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [charges, setCharges] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [settings, setSettings] = useState({ platformFeePercent: PLATFORM_FEE_PERCENT_DEFAULT });
  const [sessionMarketerId, setSessionMarketerId] = useState(null);
  // Local Studio activity feed (real actions performed on this device).
  // Bumped every time an action is recorded so Overview re-renders live.
  const [activityTick, setActivityTick] = useState(0);
  const [activityFeed, setActivityFeed] = useState(() => getActivity(30));

  const pushActivity = useCallback((type, label, meta) => {
    try {
      recordActivity(type, label, meta);
      setActivityFeed(getActivity(30));
      setActivityTick((t) => t + 1);
    } catch {
      // activity is best-effort
    }
  }, []);
  const [favorites, setFavorites] = useState([]);
  const [collections, setCollections] = useState([]);
  const [following, setFollowing] = useState([]);
  const [introSeen, setIntroSeen] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    (async () => {
      const [m, p, c, s, st, sess, fav, intro, cols, follow, po, ch, nt] = await Promise.all([
        getJSON(K.marketers, true, []),
        getJSON(K.products, true, []),
        getJSON(K.clicks, true, []),
        getJSON(K.sales, true, []),
        getJSON(K.settings, true, { platformFeePercent: PLATFORM_FEE_PERCENT_DEFAULT }),
        getJSON(K.session, false, { marketerId: null }),
        getJSON(K.favorites, false, []),
        getJSON(K.introSeen, false, false),
        getJSON(K.collections, true, []),
        getJSON(K.following, false, []),
        getJSON(K.payouts, true, []),
        getJSON(K.charges, true, []),
        getJSON(K.notifications, true, []),
      ]);

            const legacySeedDetected = isLegacyDemoSeed(p || [], m || []);
      if (legacySeedDetected) {
        // 🔥 Self-heal: wipe the localStorage copies of the 14 legacy demo
        // products so they no longer appear in the feed or generate the
        // "Products needing a manual tracking-ID fix" console warning.
        // The cloud is re-bootstrapped by `force-bootstrap`; this handles
        // the client-side copy for every returning visitor instantly.
        console.info("[Likelink] Legacy demo seed detected in localStorage — self-healing");
        resetLegacyMarketplaceStorage();
      }
      const safeMarketers = toArr(m);
      const safeProducts = toArr(p);

      // Production safety: never reset shared marketplace data or replace production data with demo seeds.

      // Self-heal corrupt legacy records: every string field must be a plain
      // string so any string coercion (render, template literals, navigator.share,
      // URLSearchParams, login lookup) never crashes. slug falls back to slugify(name).
      setMarketers(
        toArr(safeMarketers).map((x) => {
          const name = typeof x?.name === "string" ? x.name : String(x?.name ?? x?.email ?? "");
          const email = typeof x?.email === "string" ? x.email : String(x?.email ?? "");
          const slug =
            typeof x?.slug === "string" && x.slug.trim() ? x.slug : slugify(name);
          return {
            ...x,
            id: typeof x?.id === "string" ? x.id : String(x?.id ?? ""),
            name,
            email,
            slug,
            trackingId: typeof x?.trackingId === "string" ? x.trackingId : String(x?.trackingId ?? ""),
            payPalEmail: typeof x?.payPalEmail === "string" ? x.payPalEmail : String(x?.payPalEmail ?? ""),
            paymentMethod: PAYOUT_DEFAULT,
            bankDetails: (() => {
              try {
                const b = x?.bankDetails || {};
                return {
                  bankName: String(b?.bankName ?? ""),
                  branch: String(b?.branch ?? ""),
                  account: String(b?.account ?? ""),
                  holder: String(b?.holder ?? ""),
                };
              } catch {
                return { bankName: "", branch: "", account: "", holder: "" };
              }
            })(),
            paymentNote: typeof x?.paymentNote === "string" ? x.paymentNote : String(x?.paymentNote ?? ""),
            bio: typeof x?.bio === "string" ? x.bio : String(x?.bio ?? ""),
          };
        })
      );
      // Sanitize the other stores so numeric/string conversions never crash:
      // product price/commission, sale/payout numerics (+ts), settings fee, collections.
      const validMarketerIds = new Set(toArr(safeMarketers).map((m) => (typeof m?.id === "string" ? m.id.trim() : "")).filter(Boolean));
      const sanitizedProducts = toArr(safeProducts)
        .filter((x) => {
          const marketerId = typeof x?.marketerId === "string" ? x.marketerId.trim() : "";
          return Boolean(marketerId) && validMarketerIds.has(marketerId);
        })
        .map((x) => ({
          ...x,
          marketerId: x.marketerId.trim(),
          price: toNum(x?.price, 0),
          commission: toNum(x?.commission, 0),
        }));
      setProducts(sanitizedProducts);
      setClicks(toArr(c));
      setSales(
        toArr(s).map((x) => ({
          ...x,
          saleAmount: toNum(x?.saleAmount, 0),
          commissionAmount: toNum(x?.commissionAmount, 0),
          platformFee: toNum(x?.platformFee, 0),
          marketerNet: toNum(x?.marketerNet, 0),
          ts: toNum(x?.ts, 0),
        }))
      );
      setSettings({
        ...(st && typeof st === "object" ? st : {}),
        platformFeePercent: toNum(st?.platformFeePercent, PLATFORM_FEE_PERCENT_DEFAULT),
      });
      // Cloud identity: when Auth is configured, resolve the session from the
      // authenticated user (not from localStorage, which is not an authorization
      // boundary). Falls back to localStorage for local-dev without Supabase.
      let activeMarketerId = sess?.marketerId || null;
      if (authConfigured) {
        // With real auth only a VERIFIED session opens a studio. A stale id in
        // localStorage without a session would show the studio while every
        // save is refused by the server.
        let resolved = null;
        try { resolved = await resolveCurrentMarketer(safeMarketers); } catch { resolved = null; }
        activeMarketerId = resolved?.marketerId || null;
        if (resolved?.private) mergePrivateInto(setMarketers, [resolved.private]);
      }
      setSessionMarketerId(activeMarketerId);
      setFavorites(toArr(fav));
      setIntroSeen(Boolean(intro));
      setCollections(
        toArr(cols).map((x) => ({
          ...x,
          id: toStr(x?.id),
          marketerId: toStr(x?.marketerId),
          title: toStr(x?.title),
          productIds: Array.isArray(x?.productIds) ? x.productIds : [],
        }))
      );
      setFollowing(toArr(follow));
      setPayouts(
        toArr(po).map((x) => ({
          ...x,
          amount: toNum(x?.amount, 0),
          ts: toNum(x?.ts, 0),
          paidAt: x?.paidAt == null ? null : toNum(x?.paidAt, 0),
        }))
      );
      setCharges(
        toArr(ch).map((x) => ({
          ...x,
          marketerId: toStr(x?.marketerId),
          amount: toNum(x?.amount, 0),
          ts: toNum(x?.ts, 0),
        }))
      );
      setNotifications(toArr(nt).slice(0, 60));
      setLoading(false);
    })();
  }, []);

  // Retroactive audit: flag saved products whose affiliateUrl is a placeholder
  // or lacks an AliExpress tracking ID, so the owner can fix them manually.
  useEffect(() => {
    if (loading) return;
    const flagged = findProductsNeedingTracking(products, marketers);
    if (flagged.length) {
      console.warn("[Likelink] Products needing a manual tracking-ID fix:", flagged);
    }
  }, [loading, products, marketers]);

  const showToast = useCallback((msg) => {
    setToast({ msg });
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => setToast(null), 2600);
  }, []);

  const persistMarketers = useCallback(async (next) => {
    setMarketers(next);
    await setJSON(K.marketers, next, true);
  }, []);

  const persistProducts = useCallback(async (next) => {
    setProducts(next);
    await setJSON(K.products, next, true);
  }, []);

  const persistClicks = useCallback(async (next) => {
    setClicks(next);
    await setJSON(K.clicks, next, true);
  }, []);

  const persistSales = useCallback(async (next) => {
    setSales(next);
    await setJSON(K.sales, next, true);
  }, []);

  const persistPayouts = useCallback(async (next) => {
    setPayouts(next);
    await setJSON(K.payouts, next, true);
  }, []);

  const persistCharges = useCallback(async (next) => {
    setCharges(next);
    await setJSON(K.charges, next, true);
  }, []);

  const persistNotifications = useCallback(async (next) => {
    setNotifications(next);
    await setJSON(K.notifications, next, true);
  }, []);

  const persistSettings = useCallback(async (next) => {
    setSettings(next);
    await setJSON(K.settings, next, true);
  }, []);

  const persistSession = useCallback(async (marketerId) => {
    setSessionMarketerId(marketerId);
    await setJSON(K.session, { marketerId }, false);
  }, []);

  const toggleFavorite = useCallback(async (productId) => {
    pushActivity("favorite.toggle", "סימנת מוצר במועדפים ⭐", { productId });
    setFavorites((prev) => {
      const next = prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId];
      setJSON(K.favorites, next, false);
      return next;
    });
  }, []);

  const dismissIntro = useCallback(async () => {
    setIntroSeen(true);
    await setJSON(K.introSeen, true, false);
  }, []);

  const persistCollections = useCallback(async (next) => {
    setCollections(next);
    await setJSON(K.collections, next, true);
  }, []);

  const toggleFollow = useCallback(async (marketerId) => {
    pushActivity("creator.follow", "עקבת אחרי יוצר/ת 💜", { marketerId });
    setFollowing((prev) => {
      const next = prev.includes(marketerId) ? prev.filter((id) => id !== marketerId) : [...prev, marketerId];
      setJSON(K.following, next, false);
      return next;
    });
  }, [pushActivity]);

  const currentMarketer = useMemo(
    () => marketers.find((m) => m.id === sessionMarketerId) || null,
    [marketers, sessionMarketerId]
  );

  const recordClick = useCallback(
    async (product) => {
      if (!product || !product.id) return;
      pushActivity("product.click", `פתחת דיל: ${String(product.title || product.id).slice(0, 80)}`, { productId: product.id });
      // Traffic source truth — recorded ONLY when actually available
      // (utm params / referral param / referrer host). Never guessed.
      let src = null;
      let med = null;
      let camp = null;
      try {
        const params = new URLSearchParams(window.location.search);
        src = params.get("utm_source") || params.get("ref") || null;
        med = params.get("utm_medium") || null;
        camp = params.get("utm_campaign") || null;
        if (!src && document.referrer) {
          src = new URL(document.referrer).hostname || null;
        }
      } catch { /* no source available — recorded without one */ }
      const c = {
        id: uid(),
        productId: product.id,
        marketerId: product.marketerId,
        ts: Date.now(),
        ...(src ? { src: String(src).slice(0, 80) } : {}),
        ...(med ? { med: String(med).slice(0, 60) } : {}),
        ...(camp ? { camp: String(camp).slice(0, 80) } : {}),
      };
      const nextClicks = [...clicks, c];
      const nextProducts = products.map((p) =>
        p.id === product.id ? { ...p, clicks: (p.clicks || 0) + 1 } : p
      );
      // Tracking is best-effort and must NEVER block the buyer: callers await
      // this before opening the deal, so a failed write is logged, not thrown.
      try {
        await persistClicks(nextClicks);
        await persistProducts(nextProducts);
        // Real-time buyer activity → seller notification (click = someone tapped their deal)
        await persistNotifications([
          {
            id: uid(),
            marketerId: product.marketerId,
            kind: "click",
            productId: product.id,
            ts: Date.now(),
          },
          ...(notifications || []),
        ].slice(0, 60));
      } catch (e) {
        console.warn("[Likelink] click tracking not saved", e?.message || e);
      }
    },
    [clicks, products, notifications, persistClicks, persistProducts, persistNotifications]
  );

  // Product-view tracking (first-party, no guessing). A view event is stored in
  // the SAME shared clicks feed with type:'view' so legacy click consumers that
  // ignore the type field see zero change; analytics counts views separately.
  const recordProductView = useCallback(
    async (product) => {
      if (!product?.id) return; pushActivity('product.view', 'צפית במוצר', { productId: product.id });
      // Dedupe per session: one view per product per browser session (honest metric).
      try {
        const seen = JSON.parse(sessionStorage.getItem("ll_viewed") || "[]");
        if (seen.includes(product.id)) return;
        seen.push(product.id);
        sessionStorage.setItem("ll_viewed", JSON.stringify(seen.slice(-200)));
      } catch { /* private mode — still record the first view */ }
      let src = null;
      try {
        const params = new URLSearchParams(window.location.search);
        src = params.get("utm_source") || params.get("ref") || (document.referrer ? new URL(document.referrer).hostname : null);
      } catch { /* no source available */ }
      const v = {
        id: uid(),
        type: "view",
        productId: product.id,
        marketerId: product.marketerId || null,
        ts: Date.now(),
        ...(src ? { src: String(src).slice(0, 80) } : {}),
        ...(new URLSearchParams(window.location.search).get("utm_campaign")
          ? { camp: new URLSearchParams(window.location.search).get("utm_campaign").slice(0, 80) }
          : {}),
      };
      try { await persistClicks([...clicks, v]); } catch (e) { console.warn("[Likelink] view tracking not saved", e?.message || e); }
    },
    [clicks, persistClicks]
  );

  // After a VERIFIED Supabase sign-in: open the user's studio, creating it when
  // the account exists but the studio record was never finished (otherwise
  // login says "no studio" and signup says "already registered" — a dead end).
  const openStudioForVerifiedUser = useCallback(async (authUser, cleanEmail, nameHint) => {
    let marketer = null;
    try {
      const resolved = await resolveCurrentMarketer(marketers);
      marketer = resolved?.marketerId ? marketers.find((m) => m.id === resolved.marketerId) || null : null;
      if (resolved?.private) mergePrivateInto(setMarketers, [resolved.private]);
    } catch { /* fall back to the email match below */ }
    if (!marketer) marketer = marketers.find((m) => String(m?.email || "").trim().toLowerCase() === cleanEmail) || null;
    if (!marketer) {
      const baseName = String(nameHint || cleanEmail.split("@")[0] || "Studio").trim().slice(0, 60) || "Studio";
      marketer = {
        id: uid(),
        name: baseName,
        email: cleanEmail,
        trackingId: "",
        slug: uniqueSlug(slugify(baseName), marketers.map((x) => x.slug).filter(Boolean)),
        createdAt: Date.now(),
      };
      try {
        await persistMarketers([...marketers, marketer]);
      } catch (e) {
        return { ok: false, error: toHebrewError(e?.message, "יצירת הסטודיו נכשלה — נסי שוב בעוד רגע") };
      }
      showToast(t("sell.studioCreated"));
    }
    await persistSession(marketer.id);
    if (authUser?.id) linkMarketer(authUser.id, marketer.id).catch(() => {});
    return { ok: true };
  }, [marketers, persistMarketers, persistSession, showToast, t]);

  const value = useMemo(
    () => ({
      loading,
      marketers,
      products,
      clicks,
      sales,
      payouts,
      charges,
      notifications,
      settings,
      sessionMarketerId,
      favorites,
      collections,
      following,
      introSeen,
      toast,
      currentMarketer,
      showToast,
      persistMarketers,
      persistProducts,
      persistClicks,
      persistSales,
      persistSettings,
      persistSession,
      toggleFavorite,
      dismissIntro,
      persistCollections,
      toggleFollow,
      recordClick,
      onLogin: async (email, password) => {
        try { assertAuthSafeForEnvironment(authConfigured); } catch (e) { return { ok: false, error: "שגיאת הגדרת מערכת — פני לתמיכה" }; }
        const cleanEmail = String(email || "").trim().toLowerCase();
        if (!isValidEmail(cleanEmail)) return { ok: false, error: t("auth.errEmail") };
        // 🔒 Fail loud: login REQUIRES real auth. Never fall back to
        // email-only matching, even when Supabase Auth is not configured.
        if (!authConfigured) return { ok: false, error: "החיבור למערכת האבטחה נכשל, נסי שוב מאוחר יותר" };

        // Authenticate first — Supabase Auth is the identity source.
        const res = await signInSeller({ email: cleanEmail, password });
        if (!res.ok) return { ok: false, error: authErrorHe(res, t("auth.errLogin")) };
        return openStudioForVerifiedUser(res.data?.user, cleanEmail, "");
      },
      onSignup: async (name, email, password) => {
        try { assertAuthSafeForEnvironment(authConfigured); } catch (e) { return { ok: false, error: "שגיאת הגדרת מערכת — פני לתמיכה" }; }
        const cleanName = String(name || "").trim().slice(0, 60);
        const cleanEmail = String(email || "").trim().toLowerCase();
        if (!cleanName || !isValidEmail(cleanEmail)) return { ok: false, error: t("auth.errEmail") };
        // 🔒 Fail loud: signup REQUIRES real auth. Never create a studio or a
        // session on email-only matching, even when Supabase Auth is missing.
        if (!authConfigured) return { ok: false, error: "החיבור למערכת האבטחה נכשל, נסי שוב מאוחר יותר" };
        let authUserId = null;
        let hasSession = false;
        if (authConfigured) {
          const res = await signUpSeller({ email: cleanEmail, password });
          const createdUser = res.ok ? (res.data?.user || null) : null;
          const identities = Array.isArray(createdUser?.identities) ? createdUser.identities : null;
          const duplicate = (!res.ok && /user_already_exists|email_exists|already registered|already exists/i.test(`${res.code || ""} ${res.error || ""}`)) ||
            Boolean(createdUser && identities && identities.length === 0);
          if (duplicate) {
            // Existing account: the right password simply signs in (and creates
            // the studio if an earlier signup never finished) — no dead end
            // between "already registered" and "no studio for this email".
            const login = await signInSeller({ email: cleanEmail, password });
            if (login.ok) return openStudioForVerifiedUser(login.data?.user, cleanEmail, cleanName);
            return { ok: false, error: "EMAIL_ALREADY_REGISTERED" };
          }
          if (!res.ok) return { ok: false, error: authErrorHe(res, t("auth.errPassword")) };
          authUserId = createdUser?.id || null;
          hasSession = Boolean(res.data?.session);
          if (supabase && createdUser?.id && hasSession) {
            // ON CONFLICT DO NOTHING: authenticated users have no UPDATE grant on
            // profiles.is_admin, so a DO UPDATE upsert is always rejected.
            const { error: profileError } = await supabase
              .from("profiles")
              .upsert({ id: createdUser.id, is_admin: false }, { onConflict: "id", ignoreDuplicates: true });
            if (profileError) console.error("[Likelink] profile bootstrap failed", profileError);
          }
        }
        const ownRecords = hasSession ? await fetchOwnPrivate() : [];
        const existing = marketers.find((m) => String(m?.email || "").trim().toLowerCase() === cleanEmail) ||
          marketers.find((m) => ownRecords.some((o) => o.id === m.id));
        if (!hasSession) {
          // Email confirmation required: no verified session yet, so the studio
          // is not opened (every save would be refused). The studio record is
          // prepared now when possible and opens on the first verified login.
          if (!existing) {
            const pending = { id: uid(), name: cleanName, email: cleanEmail, trackingId: "", slug: uniqueSlug(slugify(cleanName), marketers.map((x) => x.slug).filter(Boolean)), createdAt: Date.now() };
            try { await persistMarketers([...marketers, pending]); } catch { /* created on first verified login instead */ }
          }
          return { ok: true, needsConfirmation: true };
        }
        // A verified new account whose email already has a studio (created
        // before accounts were required) simply opens that studio.
        if (existing) return openStudioForVerifiedUser({ id: authUserId }, cleanEmail, cleanName);
        const m = {
          id: uid(),
          name: cleanName,
          email: cleanEmail,
          trackingId: "",
          slug: uniqueSlug(slugify(cleanName), marketers.map((x) => x.slug).filter(Boolean)),
          createdAt: Date.now(),
          referrerSlug: getPendingReferral(),
        };
        // Credit the referrer (if any) and clear the pending referral from session
        const referrerSlug = getPendingReferral();
        if (referrerSlug) {
          await trackReferralConversion(referrerSlug, m.slug);
          clearPendingReferral();
        }
        await persistMarketers([...marketers, m]);
        await persistSession(m.id);
        // Cloud identity: establish the trusted auth → marketer link server-side.
        // Failure is non-critical — login will use email fallback + auto-link.
        if (authConfigured && authUserId) {
          linkMarketer(authUserId, m.id).catch(() => {});
        }
        showToast(t("sell.studioCreated"));
        return { ok: true };
      },
      onLogout: async () => {
        if (authConfigured) await signOutSeller();
        await persistSession(null);
      },
      onAddProduct: async (draft) => {
        if (!currentMarketer) return;
        const title = String(draft.title || "").trim().slice(0, 120);
        const description = String(draft.description || "").trim().slice(0, 600);
        const affiliateUrl = injectAliExpressTracking(String(draft.affiliateUrl || "").trim().slice(0, 2000), currentMarketer?.trackingId);
        const image = String(draft.image || "").trim().slice(0, 4000);
        if (!title) return showToast(t("form.errTitle"));
        if (!isSafeHttpUrl(affiliateUrl)) return showToast(t("form.errLink"));
        if (!isSafeImageUrl(image)) return showToast(t("form.errImage"));
        const p = {
          id: uid(),
          marketerId: currentMarketer.id,
          title,
          description,
          image,
          affiliateUrl,
          category: CATEGORY_KEYS.includes(draft.category) ? draft.category : "Other",
          price: clampNumber(draft.price),
          commission: clampNumber(draft.commission),
          status: "approved",
          clicks: 0,
          createdAt: Date.now(),
        };
        await persistProducts([...products, p]); pushActivity('product.add', 'הוספת מוצר חדש', { productId: p.id });

        // Convenience (best-effort, never blocks save): if no manual image was
        // provided, try to auto-pull an Open Graph preview image from the link.
        // On failure the product simply keeps the manual Image URL field.
        if (!image) {
          fetchOgImage(affiliateUrl)
            .then((og) => {
              if (og) {
                persistProducts([...products.filter((x) => x.id !== p.id), { ...p, image: og }]);
              }
            })
            .catch(() => {});
        }

        showToast(t("sell.published"));

        // 🚀 One upload → everywhere: instant launch announcement to every
        // channel this creator connected in AutoPilot (fire-and-forget; the
        // server is idempotent — one announcement per product, ever).
        fetch("/api/autopilot", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: "announce", productId: p.id }),
          keepalive: true,
        }).catch(() => {});
      },
      onDeleteProduct: async (id) => {
        await persistProducts(products.filter((p) => p.id !== id));
        showToast(t("sell.removed"));
      },
      onLogSale: async (product, saleAmount, commissionAmount) => {
        if (!product) return null;
        // Balanced path: ask the server to validate + sign this self-report.
        // The server signs only for the signed-in owner of the studio.
        const signToken = await getSessionToken().catch(() => null);
        const signRes = await fetch("/api/sign-sale", {
          method: "POST",
          headers: { "content-type": "application/json", ...(signToken ? { authorization: `Bearer ${signToken}` } : {}) },
          body: JSON.stringify({
            productId: product.id,
            marketerId: product.marketerId,
            saleAmount: Number(saleAmount),
            commissionAmount: Number(commissionAmount),
          }),
          signal: AbortSignal.timeout(15000),
        }).catch(() => null);
        const signData = signRes ? await signRes.json().catch(() => ({})) : {};
        if (!signRes || !signRes.ok || !signData.ok || !signData.sale) {
          showToast(
            signData?.error
              ? t("sell.signedSaleRejected", "השרת דחה את רישום המכירה") + ` (${signData.error})`
              : t("sell.signedSaleRejected", "השרת דחה את רישום המכירה")
          );
          return null;
        }

        const signedSale = signData.sale; // server-authoritative (id, fee, net, ts)
        const nextSales = [...sales, signedSale];
        setSales(nextSales);
        try {
          await storage.signedSet(K.sales, nextSales, signedSale, signData.sig, signData.sigTs);
        } catch (e) {
          console.error("signed sale persist failed", e);
          showToast(t("sell.signedSaleRejected", "השרת דחה את רישום המכירה"));
          return null;
        }
        return signedSale;
      },
      onAddCollection: async (title) => {
        if (!currentMarketer) return;
        const clean = String(title || "").trim().slice(0, 60);
        if (!clean) return;
        const col = { id: uid(), marketerId: currentMarketer.id, title: clean, productIds: [], createdAt: Date.now() };
        await persistCollections([...collections, col]);
      },
      onUpdateCollection: async (id, productIds) => {
        await persistCollections(collections.map((c) => (c.id === id ? { ...c, productIds } : c)));
      },
      onDeleteCollection: async (id) => {
        await persistCollections(collections.filter((c) => c.id !== id));
      },
      onSetStatus: async (id, status) => {
        await persistProducts(products.map((p) => (p.id === id ? { ...p, status } : p)));
        showToast(status === "approved" ? t("admin.approved2") : status === "flagged" ? t("admin.flagged2") : t("admin.removed2"));
        // 🚀 Approval = go-live: instant launch announcement to the creator's
        // channels (fire-and-forget; server-side idempotency prevents doubles).
        if (status === "approved") {
          fetch("/api/autopilot", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ mode: "announce", productId: id }),
            keepalive: true,
          }).catch(() => {});
        }
      },
      onRemove: async (id) => {
        await persistProducts(products.filter((p) => p.id !== id));
        showToast(t("admin.removed2"));
      },
      onSetFee: async (val) => {
        await persistSettings({ ...settings, platformFeePercent: val });
      },
      loadAdminPrivate: async (adminToken) => {
        const rows = await fetchOwnPrivate({ adminToken });
        if (rows.length) mergePrivateInto(setMarketers, rows);
        return rows.length;
      },
      onUpdateMarketer: async (id, patch) => {
        await persistMarketers(marketers.map((m) => (m.id === id ? { ...m, ...patch } : m)));
      },
      onCreatePayout: async (marketerId) => {
        const summary = getSellerPayoutSummary(sales, payouts, marketerId);
        const open = payouts.some((p) => p.marketerId === marketerId && (p.status === PAYOUT_STATUS.PENDING || p.status === PAYOUT_STATUS.PROCESSING));
        if (summary.pendingPayout < MIN_PAYOUT_THRESHOLD || open) return;
        const marketer = marketers.find((m) => m.id === marketerId);
        const method = marketer?.paymentMethod || PAYOUT_DEFAULT;
        const payout = {
          id: uid(),
          marketerId,
          amount: Math.round(summary.pendingPayout * 100) / 100,
          status: PAYOUT_STATUS.PENDING,
          method,
          recipient: {
            payPalEmail: marketer?.payPalEmail || "",
            bank: marketer?.bankDetails || {},
          },
          ts: Date.now(),
          paidAt: null,
          note: "",
        };
        await persistPayouts([...payouts, payout]);
        showToast(t("sell.payoutCreated"));
        // NOTE: no client-side payment here — the browser has no PayPal
        // credentials. The payout stays PENDING and the server-side worker
        // (/api/payouts/process — daily cron) pays it via PayPal Payouts API
        // and marks it paid. Admin sees it in PayoutsSection until then.
      },
      onMarkPayoutPaid: async (payoutId) => {
        await persistPayouts(
          payouts.map((p) => (p.id === payoutId ? { ...p, status: PAYOUT_STATUS.PAID, paidAt: Date.now() } : p))
        );
        showToast(t("sell.payoutPaid2"));
      },
      onBuyBoost: async (productId) => {
        if (!currentMarketer) return showToast(t("auth.login"));
        const product = products.find((p) => p.id === productId);
        if (!product || product.marketerId !== currentMarketer.id) return;
        const summary = getSellerPayoutSummary(sales, payouts, currentMarketer.id, charges);
        if (summary.pendingPayout < BOOST_PRICE) return showToast(t("sell.boostNoBalance"));
        const now = Date.now();
        const charge = {
          id: uid(),
          marketerId: currentMarketer.id,
          productId,
          amount: BOOST_PRICE,
          reason: "boost",
          ts: now,
        };
        const boostedUntil = now + BOOST_DURATION_HOURS * 60 * 60 * 1000;
        await persistCharges([...charges, charge]);
        await persistProducts(products.map((p) => (p.id === productId ? { ...p, boostedUntil } : p)));
        showToast(t("sell.boostActive"));
      },
    }),
    [
      loading, marketers, products, clicks, sales, payouts, charges, notifications, settings, sessionMarketerId, activityFeed, activityTick, pushActivity,
      favorites, collections, following, introSeen, toast, currentMarketer,
      showToast, persistMarketers, persistProducts, persistClicks, persistSales, persistPayouts, persistCharges, persistNotifications,
      persistSettings, persistSession, toggleFavorite, dismissIntro, persistCollections, activityFeed, activityTick, pushActivity,
      toggleFollow, recordClick, recordProductView, activityFeed, activityTick, pushActivity, t,
      openStudioForVerifiedUser,
    ]
  );

  return <MarketplaceContext.Provider value={value}>{children}</MarketplaceContext.Provider>;
}

export function useMarketplace() {
  const ctx = useContext(MarketplaceContext);
  if (!ctx) throw new Error("useMarketplace must be used within MarketplaceProvider");
  return ctx;
}

/** Same context, but null (instead of throwing) outside the provider — for
 *  shared leaf components such as product thumbnails. */
export function useOptionalMarketplace() {
  return useContext(MarketplaceContext);
}
