import React, { useState, useEffect } from "react";
import { MarketplaceProvider, useMarketplace } from "./context/MarketplaceContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { LangProvider, useI18n } from "./lib/LangContext";
import { parsePath } from "./utils/routing";

// Modern Layout & UI
import { AppShell, TopBar, BottomNav } from "./components/layout/AppShell";
import { Toast, LoadingScreen } from "./components/ui";

// View Components
import FeedView from "./components/feed/FeedView";
import SellView from "./components/sell/SellView";
import AdminView from "./components/admin/AdminView";
import CreatorProfilePage from "./PAGES/CreatorProfilePage"; // We'll redesign this soon

export default function AppRoot() {
  return (
    <LangProvider>
      <ThemeProvider>
        <MarketplaceProvider>
          <App />
        </MarketplaceProvider>
      </ThemeProvider>
    </LangProvider>
  );
}

function App() {
  const { lang, setLang } = useI18n();
  const { loading, settings, toast, showToast } = useMarketplace();
  const [tab, setTab] = useState("feed");
  const [route, setRoute] = useState(() => parsePath(window.location.pathname));

  useEffect(() => {
    const onPop = () => setRoute(parsePath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function navigate(path) {
    window.history.pushState({}, "", path);
    setRoute(parsePath(path));
  }

  if (loading) return <LoadingScreen />;

  // Creator Profile Route
  if (route.type === "creator") {
    return (
      <AppShell>
        <CreatorProfilePage
          slug={route.slug}
          // Note: CreatorProfilePage still uses props for now, 
          // we will refactor it to use useMarketplace internal hooks in Sprint 1.
          {...useMarketplace()} 
          navigate={navigate}
          lang={lang}
          setLang={setLang}
        />
        <Toast message={toast?.msg} />
      </AppShell>
    );
  }

  // Main App Tabs
  return (
    <AppShell>
      <TopBar 
        tab={tab} 
        feeRate={settings.platformFeePercent} 
      />

      <main className="flex-1 w-full max-w-app mx-auto pb-24 px-4">
        {tab === "feed" && <FeedView />}
        {tab === "sell" && <SellView navigate={navigate} />}
        {tab === "admin" && <AdminView />}
      </main>

      <BottomNav tab={tab} setTab={setTab} />
      <Toast message={toast?.msg} />
    </AppShell>
  );
}
