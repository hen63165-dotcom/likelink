// The site search box (with voice and photo search) and its icons. The home
// page itself lives in luxe.jsx.
import React, { useEffect, useRef, useState } from "react";
import { useL } from "./kit";

/* ------------------------------------------------------------------ icons */

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };

export function SearchIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="M15.6 15.6 20 20" />
    </svg>
  );
}

export function MicIcon({ size = 19 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <rect x="9" y="3" width="6" height="11.5" rx="3" />
      <path d="M5.6 11.2a6.4 6.4 0 0 0 12.8 0" />
      <path d="M12 17.6V21M9.2 21h5.6" />
    </svg>
  );
}

export function CameraIcon({ size = 19 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M3.8 9a2.6 2.6 0 0 1 2.6-2.6h1.5l1.3-1.9a1.6 1.6 0 0 1 1.3-.7h3a1.6 1.6 0 0 1 1.3.7l1.3 1.9h1.5A2.6 2.6 0 0 1 20.2 9v7.4a2.6 2.6 0 0 1-2.6 2.6H6.4a2.6 2.6 0 0 1-2.6-2.6z" />
      <circle cx="12" cy="12.6" r="3.3" />
      <circle cx="17.1" cy="9.4" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* ----------------------------------------------------------------- search */

const SpeechRec = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

/** A photo picked on the home page travels to /search in memory (never uploaded). */
export const imageHandoff = { file: null };

export function SearchBox({ value, onChange, onSubmit, autoFocus = false, big = false, onImage = null, inputProps = {} }) {
  const { L, lang } = useL();
  const ref = useRef(null);
  const fileRef = useRef(null);
  const [listening, setListening] = useState(false);
  // Voice: the browser's own speech recognition (no provider, no upload by us).
  function listen() {
    if (!SpeechRec || listening) return;
    const rec = new SpeechRec();
    rec.lang = lang === "he" ? "he-IL" : "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => { const t = e.results?.[0]?.[0]?.transcript || ""; if (t) { onChange(t); onSubmit?.(t); } };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  }
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  return (
    <form
      role="search"
      className="lx-search"
      style={big ? { minHeight: 62 } : undefined}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(value);
      }}
    >
      <span className="lx-mute shrink-0"><SearchIcon /></span>
      <label htmlFor="lx-q" className="lx-sr">{L("חיפוש", "Search")}</label>
      <input
        id="lx-q"
        ref={ref}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={L("מה מחפשים? מוצר, יוצר/ת, קטגוריה…", "Search products, creators, categories…")}
        {...inputProps}
      />
      {value ? (
        <button type="button" className="lx-search-tool" onClick={() => onChange("")} aria-label={L("ניקוי", "Clear")}>
          <svg width="16" height="16" viewBox="0 0 24 24" {...stroke} strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      ) : null}
      {big && SpeechRec ? (
        <button type="button" className="lx-search-tool" onClick={listen} aria-label={L("חיפוש קולי", "Voice search")} aria-pressed={listening} title={L("דברו — נחפש בשבילכם", "Speak — we'll search")}>
          <MicIcon />
        </button>
      ) : null}
      {big && onImage ? (
        <>
          <button type="button" className="lx-search-tool" onClick={() => fileRef.current?.click()} aria-label={L("חיפוש לפי תמונה", "Search by image")} title={L("תמונה או צילום מסך של מוצר", "A photo or screenshot of a product")}>
            <CameraIcon />
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onImage(f); e.target.value = ""; }} />
        </>
      ) : null}
      <button type="submit" className="lx-btn lx-btn-rose lx-search-go" aria-label={L("חיפוש", "Search")}>
        <span className="hidden sm:inline">{L("חיפוש", "Search")}</span>
        <span className="sm:hidden"><SearchIcon size={19} /></span>
      </button>
    </form>
  );
}

