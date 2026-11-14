// The radar's launch trial (Master Execution Order, item 6): the owner turns it on, sets its length
// and start, and sees what the public page will say. Saved in marketplace:settings.radarAccess
// (admin-written, public-readable) next to the other settings, which are kept as they are. The
// Basic/Pro tiers have no price and are not for sale until she approves one (radarPlans.js).
import React, { useState } from "react";
import { useMarketplace } from "../../context/MarketplaceContext";
import { RADAR_PLANS, RADAR_TRIAL, accessOf, cleanRadarAccess } from "../../lib/growth/radarPlans.js";

export default function RadarAccessCard() {
  const { settings, persistSettings } = useMarketplace();
  const current = cleanRadarAccess(settings?.radarAccess);
  const [trial, setTrial] = useState(current.trial);
  const [days, setDays] = useState(current.trialDays);
  const [start, setStart] = useState((current.startedAt || new Date().toISOString()).slice(0, 10));
  const [msg, setMsg] = useState("");
  const draft = cleanRadarAccess({ trial, trialDays: days, startedAt: `${start}T00:00:00.000Z` });
  const view = accessOf({ radarAccess: draft });

  async function save() {
    setMsg("שומר…");
    try {
      await persistSettings({ ...settings, radarAccess: draft });
      setMsg("נשמר");
    } catch (e) {
      setMsg(`לא נשמר: ${String(e?.message || e).slice(0, 80)}`);
    }
  }

  return (
    <div className="surface rounded-2xl p-5 shadow-sm" dir="rtl">
      <p className="text-sm font-semibold">רדאר הטרנדים: תקופת ניסיון ומסלולים</p>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={trial} onChange={(e) => setTrial(e.target.checked)} /> תקופת ניסיון פעילה
      </label>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <label>ימים
          <input type="number" min={1} max={RADAR_TRIAL.maxDays} value={days} onChange={(e) => setDays(Number(e.target.value))} className="input mt-1 w-full" />
        </label>
        <label>מתחילה ב־
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="input mt-1 w-full" />
        </label>
      </div>
      <p className="mt-3 text-xs text-muted leading-relaxed">
        מה יוצג: {view.state === "OPEN" ? "הרדאר פתוח לכולם, בלי באנר" : view.state === "TRIAL" ? `באנר ניסיון: עוד ${view.daysLeft} ימים` : "באנר: תקופת הניסיון הסתיימה, הרדאר נשאר פתוח ורשימת ההמתנה מוצעת"}.
        {" "}המסלולים {Object.values(RADAR_PLANS).map((p) => p.name.he).join(" ו־")}: בלי מחיר ולא למכירה עד שתאשרי מחיר, ספק סליקה ותנאי מנוי. הרשימה בתור "רשימת ההמתנה".
      </p>
      <button type="button" onClick={save} className="btn btn-primary mt-3">שמירה</button>
      {msg ? <p className="mt-2 text-xs" role="status">{msg}</p> : null}
    </div>
  );
}
