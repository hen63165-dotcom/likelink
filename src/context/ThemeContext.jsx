import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { storage } from "../lib/storage.js";
import { K } from "../constants/keys.js";

const ThemeContext = createContext(null);

function getInitialTheme() {
  if (typeof document === "undefined") return "dark";
  const current = document.documentElement.getAttribute("data-theme");
  if (current === "dark" || current === "light") return current;
  return "dark";
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getInitialTheme);
  const [storedTheme, setStoredTheme] = useState(getInitialTheme);

  useEffect(() => {
    (async () => {
      let resolved = null;
      try {
        const res = await storage.get(K.theme, false);
        if (res?.value === "dark" || res?.value === "light") resolved = res.value;
      } catch {
        /* storage unavailable */
      }
      if (resolved) {
        setStoredTheme(resolved);
      } else {
        setStoredTheme("dark");
      }
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
  if (!ctx) throw new Error("useTheme must be used within ThemeContext.Provider");
  return ctx;
}