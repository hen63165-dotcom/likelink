import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import { storage } from "../lib/storage";
import { K } from "../constants/keys";
import { uid, slugify, uniqueSlug, isValidEmail, isSafeHttpUrl, isSafeImageUrl, clampNumber } from "../utils/helpers";
import { CATEGORY_KEYS } from "../lib/i18n";
import { useI18n } from "../lib/LangContext";
import { SEED_MARKETERS, SEED_PRODUCTS } from "../data/seed";

const MarketplaceContext = createContext(null);

async function getJSON(key, shared, fallback) {
  const res = await storage.get(key, shared);
  try {
    return res ? JSON.parse(res.value) : fallback;
  } catch {
    return fallback;
  }
}

async function setJSON(key, value, shared) {
  await storage.set(key, JSON.stringify(value), shared);
}

export function MarketplaceProvider({ children }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [marketers, setMarketers] = useState([]);
  const [products, setProducts] = useState([]);
  const [clicks, setClicks] = useState([]);
  const [sales, setSales] = useState([]);
  const [settings, setSettings] = useState({ platformFeePercent: 15 });
  const [sessionMarketerId, setSessionMarketerId] = useState(null);
  const [favorites, setFavorites] = useState([]);
  const [collections, setCollections] = useState([]);
  const [following, setFollowing] = useState([]);
  const [introSeen, setIntroSeen] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    (async () => {
      const [m, p, c, s, st, sess, fav, intro, cols, follow] = await Promise.all([
        getJSON(K.marketers, true, SEED_MARKETERS),
        getJSON(K.products, true, SEED_PRODUCTS),
        getJSON(K.clicks, true, []),
        getJSON(K.sales, true, []),
        getJSON(K.settings, true, { platformFeePercent: 15 }),
        getJSON(K.session, false, { marketerId: null }),
        getJSON(K.favorites, false, []),
        getJSON(K.introSeen, false, false),
        getJSON(K.collections, true, []),
        getJSON(K.following, false, []),
      ]);
      setMarketers(m);
      setProducts(p);
      setClicks(c);
      setSales(s);
      setSettings(st);
      setSessionMarketerId(sess?.marketerId || null);
      setFavorites(fav);
      setIntroSeen(Boolean(intro));
      setCollections(cols);
      setFollowing(follow);
      setLoading(false);
    })();
  }, []);

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
    },
    [clicks, products, persistClicks, persistProducts]
  );

  const value = useMemo(
    () => ({
      loading,
      marketers,
      products,
      clicks,
      sales,
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
      onLogin: async (m) => persistSession(m.id),
      onSignup: async (name, email) => {
        const cleanName = String(name || "").trim().slice(0, 60);
        const cleanEmail = String(email || "").trim().toLowerCase();
        if (!cleanName || !isValidEmail(cleanEmail)) return showToast(t("auth.errEmail"));
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
          slug: uniqueSlug(slugify(cleanName), marketers.map((x) => x.slug).filter(Boolean)),
          createdAt: Date.now(),
        };
        await persistMarketers([...marketers, m]);
        await persistSession(m.id);
        showToast(t("sell.studioCreated"));
      },
      onLogout: async () => persistSession(null),
      onAddProduct: async (draft) => {
        if (!currentMarketer) return;
        const title = String(draft.title || "").trim().slice(0, 120);
        const description = String(draft.description || "").trim().slice(0, 600);
        const affiliateUrl = String(draft.affiliateUrl || "").trim().slice(0, 2000);
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
    }),
    [
      loading, marketers, products, clicks, sales, settings, sessionMarketerId,
      favorites, collections, following, introSeen, toast, currentMarketer,
      showToast, persistMarketers, persistProducts, persistClicks, persistSales,
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
