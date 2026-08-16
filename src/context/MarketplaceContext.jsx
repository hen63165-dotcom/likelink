import { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import { storage } from "../lib/storage";
import { supabase } from "../lib/supabaseClient";
import { signUpSeller, signInSeller, signOutSeller, authConfigured } from "../lib/auth";
import { K, PLATFORM_FEE_PERCENT_DEFAULT, MIN_PAYOUT_THRESHOLD, PAYOUT_METHOD, BOOST_PRICE, BOOST_DURATION_HOURS } from "../constants/keys";
import { uid, slugify, uniqueSlug, isValidEmail, isSafeHttpUrl, isSafeImageUrl, clampNumber, injectAliExpressTracking, findProductsNeedingTracking, fetchOgImage } from "../utils/helpers";
import { CATEGORY_KEYS } from "../lib/i18n";
import { useI18n } from "../lib/LangContext";
import { SEED_MARKETERS, SEED_PRODUCTS } from "../data/seed";
import { getSellerPayoutSummary, PAYOUT_STATUS } from "../lib/payments";

const MarketplaceContext = createContext(null);

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
  const [favorites, setFavorites] = useState([]);
  const [collections, setCollections] = useState([]);
  const [following, setFollowing] = useState([]);
  const [introSeen, setIntroSeen] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    (async () => {
      const [m, p, c, s, st, sess, fav, intro, cols, follow, po, ch, nt] = await Promise.all([
        getJSON(K.marketers, true, SEED_MARKETERS),
        getJSON(K.products, true, SEED_PRODUCTS),
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
      // Self-heal corrupt legacy records: every string field must be a plain
      // string so any string coercion (render, template literals, navigator.share,
      // URLSearchParams, login lookup) never crashes. slug falls back to slugify(name).
      setMarketers(
        (m || []).map((x) => {
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
            bio: typeof x?.bio === "string" ? x.bio : String(x?.bio ?? ""),
          };
        })
      );
      // Sanitize the other stores so numeric/string conversions never crash:
      // product price/commission, sale/payout numerics (+ts), settings fee, collections.
      setProducts(
        (p || []).map((x) => ({
          ...x,
          price: toNum(x?.price, 0),
          commission: toNum(x?.commission, 0),
        }))
      );
      setClicks(c || []);
      setSales(
        (s || []).map((x) => ({
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
      setSessionMarketerId(sess?.marketerId || null);
      setFavorites(fav || []);
      setIntroSeen(Boolean(intro));
      setCollections(
        (cols || []).map((x) => ({
          ...x,
          id: toStr(x?.id),
          marketerId: toStr(x?.marketerId),
          title: toStr(x?.title),
          productIds: Array.isArray(x?.productIds) ? x.productIds : [],
        }))
      );
      setFollowing(follow || []);
      setPayouts(
        (po || []).map((x) => ({
          ...x,
          amount: toNum(x?.amount, 0),
          ts: toNum(x?.ts, 0),
          paidAt: x?.paidAt == null ? null : toNum(x?.paidAt, 0),
        }))
      );
      setCharges(
        (ch || []).map((x) => ({
          ...x,
          marketerId: toStr(x?.marketerId),
          amount: toNum(x?.amount, 0),
          ts: toNum(x?.ts, 0),
        }))
      );
      setNotifications(Array.isArray(nt) ? nt.slice(0, 60) : []);
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
    setFollowing((prev) => {
      const next = prev.includes(marketerId) ? prev.filter((id) => id !== marketerId) : [...prev, marketerId];
      setJSON(K.following, next, false);
      return next;
    });
  }, []);

  const currentMarketer = useMemo(
    () => marketers.find((m) => m.id === sessionMarketerId) || null,
    [marketers, sessionMarketerId]
  );

  const recordClick = useCallback(
    async (product) => {
      const c = { id: uid(), productId: product.id, marketerId: product.marketerId, ts: Date.now() };
      const nextClicks = [...clicks, c];
      const nextProducts = products.map((p) =>
        p.id === product.id ? { ...p, clicks: (p.clicks || 0) + 1 } : p
      );
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
    },
    [clicks, products, notifications, persistClicks, persistProducts, persistNotifications]
  );

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
        const cleanEmail = String(email || "").trim().toLowerCase();
        if (!isValidEmail(cleanEmail)) return showToast(t("auth.errEmail"));
        const marketer = marketers.find((m) => m.email.toLowerCase() === cleanEmail) || null;
        if (authConfigured) {
          const res = await signInSeller({ email: cleanEmail, password });
          if (!res.ok) return showToast(res.error || t("auth.errLogin"));
        }
        if (!marketer) return showToast(t("auth.errNoStudio"));
        await persistSession(marketer.id);
      },
      onSignup: async (name, email, password) => {
        const cleanName = String(name || "").trim().slice(0, 60);
        const cleanEmail = String(email || "").trim().toLowerCase();
        if (!cleanName || !isValidEmail(cleanEmail)) return showToast(t("auth.errEmail"));
        if (authConfigured) {
          const res = await signUpSeller({ email: cleanEmail, password });
          if (!res.ok) return showToast(res.error || t("auth.errPassword"));
          // Ensure a profiles row exists so RLS + isAdmin() (src/lib/auth.js) have a record.
          if (supabase && res.data?.user?.id) {
            await supabase
              .from("profiles")
              .upsert({ id: res.data.user.id, is_admin: false }, { onConflict: "id" })
              .catch(() => {});
          }
        }
        const existing = marketers.find((m) => m.email.toLowerCase() === cleanEmail);
        if (existing) {
          await persistSession(existing.id);
          showToast(`${t("sell.welcomeBack")} ${existing.name.split(" ")[0]}`);
          return;
        }
        const m = {
          id: uid(),
          name: cleanName,
          email: cleanEmail,
          trackingId: "",
          slug: uniqueSlug(slugify(cleanName), marketers.map((x) => x.slug).filter(Boolean)),
          createdAt: Date.now(),
        };
        await persistMarketers([...marketers, m]);
        await persistSession(m.id);
        showToast(t("sell.studioCreated"));
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
        await persistProducts([...products, p]);

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
      },
      onDeleteProduct: async (id) => {
        await persistProducts(products.filter((p) => p.id !== id));
        showToast(t("sell.removed"));
      },
      onLogSale: async (product, saleAmount, commissionAmount) => {
        const fee = Math.round(commissionAmount * (settings.platformFeePercent / 100) * 100) / 100;
        const net = Math.round((commissionAmount - fee) * 100) / 100;
        const s = {
          id: uid(),
          productId: product.id,
          marketerId: product.marketerId,
          saleAmount,
          commissionAmount,
          platformFee: fee,
          marketerNet: net,
          ts: Date.now(),
        };
        await persistSales([...sales, s]);
        return s;
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
      },
      onRemove: async (id) => {
        await persistProducts(products.filter((p) => p.id !== id));
        showToast(t("admin.removed2"));
      },
      onSetFee: async (val) => {
        await persistSettings({ ...settings, platformFeePercent: val });
      },
      onUpdateMarketer: async (id, patch) => {
        await persistMarketers(marketers.map((m) => (m.id === id ? { ...m, ...patch } : m)));
      },
      onCreatePayout: async (marketerId) => {
        const summary = getSellerPayoutSummary(sales, payouts, marketerId);
        const open = payouts.some((p) => p.marketerId === marketerId && p.status === PAYOUT_STATUS.PENDING);
        if (summary.pendingPayout < MIN_PAYOUT_THRESHOLD || open) return;
        const payout = {
          id: uid(),
          marketerId,
          amount: Math.round(summary.pendingPayout * 100) / 100,
          status: PAYOUT_STATUS.PENDING,
          method: PAYOUT_METHOD,
          ts: Date.now(),
          paidAt: null,
          note: "",
        };
        await persistPayouts([...payouts, payout]);
        showToast(t("sell.payoutCreated"));
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
      loading, marketers, products, clicks, sales, payouts, charges, notifications, settings, sessionMarketerId,
      favorites, collections, following, introSeen, toast, currentMarketer,
      showToast, persistMarketers, persistProducts, persistClicks, persistSales, persistPayouts, persistCharges, persistNotifications,
      persistSettings, persistSession, toggleFavorite, dismissIntro, persistCollections,
      toggleFollow, recordClick, t,
    ]
  );

  return <MarketplaceContext.Provider value={value}>{children}</MarketplaceContext.Provider>;
}

export function useMarketplace() {
  const ctx = useContext(MarketplaceContext);
  if (!ctx) throw new Error("useMarketplace must be used within MarketplaceProvider");
  return ctx;
}
