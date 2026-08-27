import React from "react";
import { Sparkles, Languages, Moon, Sun, ArrowLeft, ShoppingBag, TrendingUp, Shield, Search, Camera } from "lucide-react";
import { motion } from "framer-motion";
import { useI18n } from "../../lib/LangContext";
import { useTheme } from "../../context/ThemeContext";
import { useCart } from "../../context/CartContext";
import { IconButton } from "../ui";

export function TopBar({
  tab,
  showBack,
  onBack,
  searchQuery = "",
  onSearchChange,
  onScreenshotSearch,
  activeNav = "discover",
  onNavChange,
}) {
  const { t, lang, setLang } = useI18n();
  const { theme, toggleTheme } = useTheme();

  const navItems = [
    { id: "discover", label: t("navTop.discover") },
    { id: "shop", label: t("navTop.shop") },
    { id: "deals", label: t("navTop.deals") },
  ];

  return (
    <header className="w-full sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-gray-100 safe-top">
      {/* Row 1: Brand + Smart Search + Actions */}
      <div className="max-w-app mx-auto px-4 h-16 flex items-center gap-3">
        {showBack && onBack && (
          <IconButton onClick={onBack} label={t("common.back")}>
            <ArrowLeft size={16} />
          </IconButton>
        )}

        {/* Brand */}
        <div className="flex items-center gap-2 shrink-0">
          <motion.div
            whileTap={{ scale: 0.9 }}
            className="w-9 h-9 rounded-xl flex items-center justify-center brand-gradient"
            style={{ boxShadow: "0 4px 12px rgba(193,53,108,0.30)" }}
          >
            <Sparkles size={17} color="#fff" />
          </motion.div>
        </div>

        {/* Smart search (hidden on very small screens when back shown) */}
        <div
          className={`relative flex-1 ${showBack ? "max-w-[160px] sm:max-w-xs" : "max-w-xs"} mx-auto`}
        >
          <Search
            size={15}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400"
          />
          <input
            value={searchQuery}
            onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
            placeholder={t("feed.searchPlaceholder")}
            className="w-full rounded-full border border-gray-200 bg-gray-50/70 py-2.5 pl-9 pr-10 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-200 focus:border-transparent transition-all"
          />
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={onScreenshotSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-pink-50 hover:bg-pink-100 transition-colors"
            title={t("search.screenshotSearch", "חיפוש בתמונה")}
          >
            <Camera size={16} style={{ color: "var(--accent)" }} />
          </motion.button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <IconButton onClick={toggleTheme} label={t("common.theme")}>
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </IconButton>
          <IconButton onClick={() => setLang(lang === "he" ? "en" : "he")} label={t("common.language")}>
            <Languages size={15} style={{ color: "var(--accent)" }} />
          </IconButton>
        </div>
      </div>

      {/* Row 2: Top Nav Pills */}
      {tab === "feed" && (
        <div className="max-w-app mx-auto px-4 pb-2.5">
          <div className="flex justify-center gap-1.5">
            {navItems.map((item) => {
              const active = activeNav === item.id;
              return (
                <motion.button
                  key={item.id}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onNavChange && onNavChange(item.id)}
                  className="tap px-4 py-1.5 rounded-full text-sm font-bold transition-colors"
                  style={{
                    background: active ? "#111" : "transparent",
                    color: active ? "#fff" : "#6b7280",
                  }}
                >
                  {item.label}
                </motion.button>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}

export function BottomNav({ tab, setTab }) {
  const { t } = useI18n();
  const { cartCount, setIsOpen: openCart } = useCart();
  // Public visitors only see Feed + Sell. Admin ("ניהול") is hidden from the
  // shared nav — it is reachable only via the /admin URL which shows the owner
  // lock screen (see constants/keys.js ADMIN_CODE).
  const items = [
    { id: "feed", label: t("nav.feed"), icon: ShoppingBag },
    { id: "sell", label: t("nav.sell"), icon: TrendingUp },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 safe-bottom"
      style={{ background: "var(--bg-elevated)", borderTop: "1px solid var(--border)" }}
    >
      <div className="max-w-app mx-auto flex px-4 py-1.5">
        {items.map((it) => {
          const active = tab === it.id;
          const Icon = it.icon;
          return (
            <button
              key={it.id}
              onClick={() => setTab(it.id)}
              className="tap flex-1 flex flex-col items-center gap-0.5 py-2 relative"
            >
              {active && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute -top-1.5 w-8 h-0.5 rounded-full"
                  style={{ background: "var(--accent)" }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <Icon size={20} color={active ? "var(--accent)" : "var(--text-muted)"} strokeWidth={active ? 2.4 : 2} />
              <span
                className="text-[10px] font-medium"
                style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
              >
                {it.label}
              </span>
            </button>
          );
        })}
        {/* Cart Button */}
        <button
          onClick={() => openCart(true)}
          className="tap flex flex-col items-center gap-0.5 py-2 relative"
        >
          {cartCount > 0 && (
            <motion.div
              layoutId="cart-badge"
              className="absolute -top-0.5 right-2 min-w-5 h-5 rounded-full flex items-center justify-center px-1.5"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              <span className="text-[10px] font-bold">{cartCount}</span>
            </motion.div>
          )}
          <ShoppingBag size={20} color="var(--text-muted)" strokeWidth={2} />
          <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>
            {t("cart.title", "עגלה")}
          </span>
        </button>
      </div>
    </nav>
  );
}

export function AppShell({ children, className = "" }) {
  return (
    <div
      className={`w-full min-h-screen flex flex-col ${className}`}
      style={{ background: "var(--bg)", color: "var(--text)" }}
    >
      {children}
    </div>
  );
}
