import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { storage } from "../lib/storage.js";
import { K } from "../constants/keys.js";

const ThemeContext = createContext(null);

/**
 * ThemeProvider — marketplace light theme by default, with an optional
 * transient (non-persisted) override used by the Studio shell to force the
 * dark premium theme while the seller studio is open, without changing the
 * visitor's saved preference for the public marketplace.
 */
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState("light");
  const [storedTheme, setStoredTheme] = useState("light");

  useEffect(() => {
    (async () => {
      let resolved = "light";
      try {
        const res = await storage.get(K.theme, false);
        if (res?.value === "dark" || res?.value === "light") resolved = res.value;
        else if (window.matchMedia("(prefers-color-scheme: dark)").matches) resolved = "dark";
      } catch {
        /* storage unavailable — keep light */
      }
      setStoredTheme(resolved);
      setThemeState(resolved);
    })();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const setTheme = useCallback((t, persist = true) => {
    if (t !== "dark" && t !== "light") return;
    setThemeState(t);
    if (persist) {
      setStoredTheme(t);
      storage.set(K.theme, t, false);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark", true);
  }, [theme, setTheme]);

  const value = useMemo(
    () => ({ theme, storedTheme, setTheme, toggleTheme, isDark: theme === "dark" }),
    [theme, storedTheme, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
