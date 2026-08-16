import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { storage } from "./storage";
import { translations, categoryLabels } from "./i18n";

const LangContext = createContext(null);
const LANG_KEY = "ui:lang";

export function LangProvider({ children }) {
  const [lang, setLangState] = useState("he");

  useEffect(() => {
    (async () => {
      const res = await storage.get(LANG_KEY, false);
      if (res && (res.value === "he" || res.value === "en")) setLangState(res.value);
    })();
  }, []);

  useEffect(() => {
    document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l) => {
    setLangState(l);
    storage.set(LANG_KEY, l, false);
  }, []);

  const dict = translations[lang];

  const t = useCallback(
    (key, vars) => {
      const parts = key.split(".");
      let node = dict;
      for (const p of parts) node = node?.[p];
      if (typeof node !== "string") return node ?? key;
      if (vars) {
        let out = node;
        for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
        return out;
      }
      return node;
    },
    [dict]
  );

  const categoryLabel = useCallback((cat) => categoryLabels[lang]?.[cat] || cat, [lang]);

  const value = useMemo(
    () => ({ lang, setLang, t, dir: lang === "he" ? "rtl" : "ltr", categoryLabel }),
    [lang, setLang, t, categoryLabel]
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useI18n must be used within LangProvider");
  return ctx;
}
