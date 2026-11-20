// Entry of the Wix dashboard page (wix/radar.html → /wix/radar). Lean on purpose: no site shell, no
// cloud client, no sign-in. It reads the radar board the way /radar does (the server first, then the
// public file next to the site) and renders only what sanitizeBoard keeps.
import React from "react";
import { createRoot } from "react-dom/client";
import { sanitizeBoard } from "../lib/growth/radarBoard.js";
import { wixLang } from "../lib/growth/wixRadar.js";
import WixRadar from "./WixRadar.jsx";
import "./wix.css";

const BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

async function loadBoard() {
  try {
    const res = await fetch(`${BASE}/api/store?mode=radar-board`, { cache: "no-store" });
    if (res.ok || res.status === 402) {
      const body = await res.json();
      const doc = sanitizeBoard(res.ok ? body?.board : body?.teaser);
      if (doc) return doc;
    }
  } catch { /* no server here (the GitHub Pages mirror): the public file */ }
  try {
    const res = await fetch(`${BASE}/radar/board.json`, { cache: "no-cache" });
    if (res.ok) return sanitizeBoard(await res.json());
  } catch { /* shown as a reading that could not load */ }
  return null;
}

const lang = wixLang(location.search);
document.documentElement.lang = lang;
document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
const root = createRoot(document.getElementById("root"));
const msg = (he, en) => root.render(<main className="wr" dir={lang === "he" ? "rtl" : "ltr"}><p className="wr-quiet">{lang === "he" ? he : en}</p></main>);

msg("טוען את הקריאה של הבוקר…", "Loading this morning's reading…");
loadBoard().then((board) => {
  if (board) root.render(<WixRadar board={board} lang={lang} />);
  else msg("הקריאה בדרך. נסו לרענן בעוד דקה.", "The reading did not load. Try refreshing in a minute.");
});
