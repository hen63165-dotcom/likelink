import React from "react";
import { Sparkles, Languages, Moon, Sun, ArrowLeft, ShoppingBag, TrendingUp, Shield } from "lucide-react";
import { motion } from "framer-motion";
import { useI18n } from "../../lib/LangContext";
import { useTheme } from "../../context/ThemeContext";
import { IconButton } from "../ui";

export function TopBar({ tab, feeRate, showBack, onBack }) {
  const { t, lang, setLang } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const titles = { feed: t("topbar.feed"), sell: t("topbar.sell"), admin: t("topbar.admin") };

  return (
    <header className="w-full sticky top-0 z-40 glass-header safe-top">
      <div className="max-w-app mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {showBack && onBack && (
            <IconButton onClick={onBack} label="Back">
              <ArrowLeft size={16} />
            </IconButton>
          )}
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 brand-gradient"
            style={{ boxShadow: "0 4px 12px rgba(193,53,108,0.30)" }}
          >
            <Sparkles size={16} color="#fff" />
          </div>
          <span className="disp text-[17px] font-semibold tracking-tight">{titles[tab]}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {tab === "feed" && (
            <span
              className="mono text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap hidden xs:inline"
              style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
            >
              {feeRate}% {t("topbar.fee")}
            </span>
          )}
          <IconButton onClick={toggleTheme} label="Toggle theme">
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </IconButton>
          <IconButton onClick={() => setLang(lang === "he" ? "en" : "he")} label="Switch language">
            <Languages size={15} style={{ color: "var(--accent)" }} />
          </IconButton>
        </div>
      </div>
    </header>
  );
}

export function BottomNav({ tab, setTab }) {
  const { t } = useI18n();
  const items = [
    { id: "feed", label: t("nav.feed"), icon: ShoppingBag },
    { id: "sell", label: t("nav.sell"), icon: TrendingUp },
    { id: "admin", label: t("nav.admin"), icon: Shield },
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
