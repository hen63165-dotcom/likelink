import React, { useState, useEffect, Suspense, lazy } from "react";
import { MarketplaceProvider, useMarketplace } from "./context/MarketplaceContext";
import { ThemeProvider } from "./context/ThemeContext";
import { LangProvider, useI18n } from "./lib/LangContext";
import { CartProvider } from "./context/CartContext";
import { PLATFORM_FEE_PERCENT_DEFAULT } from "./constants/keys";
import { parsePath } from "./utils/routing";

// Modern Layout & UI
import { AppShell, TopBar, BottomNav } from "./components/layout/AppShell";
import { Toast, LoadingScreen } from "./components/ui";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Cart } from "./components/cart/Cart";
import { ScreenshotSearchModal } from "./components/search/ScreenshotSearchModal";

// View Components — lazy-loaded for faster first paint (code-splitting)
const FeedView = lazy(() => import("./components/feed/FeedView"));
const SellView = lazy(() => import("./components/sell/SellView"));
const AdminView = lazy(() => import("./components/admin/AdminView"));
const CreatorProfilePage = lazy(() => import("./PAGES/CreatorProfilePage"));

// TEMPORARY diagnostic page (raw data dump) — remove together with RawDataDump.jsx
const RawDataDump = lazy(() => import("./components/debug/RawDataDump"));
export default function AppRoot() {
  return (
    <LangProvider>
      <ThemeProvider>
        <MarketplaceProvider>
          <CartProvider>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
            <Cart />
          </CartProvider>
        </MarketplaceProvider>
      </ThemeProvider>
    </LangProvider>
  );
}

function App() {
  const { lang, setLang } = useI18n();
  const { loading, settings, toast, showToast, marketers, products, collections, favorites, following, toggleFavorite, toggleFollow, recordClick } = useMarketplace();
  const [tab, setTab] = useState("feed");
  const [route, setRoute] = useState(() => parsePath(window.location.pathname));
  const [searchQuery, setSearchQuery] = useState("");
  const [activeNav, setActiveNav] = useState("discover");
  const [screenshotOpen, setScreenshotOpen] = useState(false);

  useEffect(() => {
    const onPop = () => setRoute(parsePath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Reset scroll to top on navigation (tab switch or creator route) for a clean
  // premium feel — never leave the user halfway down a long feed.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [tab, route]);

  function navigate(path) {
    window.history.pushState({}, "", path);
    setRoute(parsePath(path));
  }

  // TEMPORARY: raw-storage diagnostic page (/#dbg). Remove with RawDataDump.jsx
  if (window.location.hash === "#dbg") {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <RawDataDump />
      </Suspense>
    );
  }

  if (loading) return <LoadingScreen />;

  // Creator Profile Route
  if (route.type === "creator") {
    return (
      <AppShell>
        <Suspense fallback={<LoadingScreen />}>
          <CreatorProfilePage
            slug={route.slug}
            marketers={marketers}
            products={products}
            collections={collections}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            following={following}
            onToggleFollow={toggleFollow}
            recordClick={recordClick}
            showToast={showToast}
            navigate={navigate}
            lang={lang}
            setLang={setLang}
          />
        </Suspense>
        <Toast message={toast?.msg} />
      </AppShell>
    );
  }

  // Main App Tabs
  return (
    <AppShell>
      <TopBar
        tab={tab}
        feeRate={settings?.platformFeePercent ?? PLATFORM_FEE_PERCENT_DEFAULT}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onScreenshotSearch={() => setScreenshotOpen(true)}
        activeNav={activeNav}
        onNavChange={setActiveNav}
      />

      <main className="flex-1 w-full max-w-app mx-auto pb-24 px-4">
        <Suspense fallback={<LoadingScreen />}>
          {tab === "feed" && (
            <FeedView
              navigate={navigate}
              query={searchQuery}
              setQuery={setSearchQuery}
              activeNav={activeNav}
              setActiveNav={setActiveNav}
              onScreenshotSearch={() => setScreenshotOpen(true)}
            />
          )}
          {tab === "sell" && <SellView navigate={navigate} />}
          {tab === "admin" && <AdminView />}
        </Suspense>
      </main>

      <BottomNav tab={tab} setTab={setTab} />
      <Toast message={toast?.msg} />
      <ScreenshotSearchModal
        isOpen={screenshotOpen}
        onClose={() => setScreenshotOpen(false)}
      />
    </AppShell>
  );
}
