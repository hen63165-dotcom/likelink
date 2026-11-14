// The radar's launch trial (Master Execution Order, item 6): the owner turns it on, sets its length
// and start, and sees what the public page will say. Saved in marketplace:settings.radarAccess
// (admin-written, public-readable) next to the other settings, which are kept as they are. Billing:
// she approves the exact proposed prices and switches it on (radarBilling); until then the tiers
// have no price on the site and nothing is created at PayPal (radarPlans.js billingOf).
import React, { useState } from "react";
import { useMarketplace } from "../../context/MarketplaceContext";
import { RADAR_PLANS, RADAR_PRICES, RADAR_TRIAL, accessOf, billingOf, cleanRadarAccess } from "../../lib/growth/radarPlans.js";

export default function RadarAccessCard() {
  const { settings, persistSettings } = useMarketplace();
  const current = cleanRadarAccess(settings?.radarAccess);
  const [trial, setTrial] = useState(current.trial);
  const [days, setDays] = useState(current.trialDays);
  const [start, setStart] = useState((current.startedAt || new Date().toISOString()).slice(0, 10));
  const [msg, setMsg] = useState("");
  const billingNow = billingOf(settings);
  const [approve, setApprove] = useState(billingNow.approved);
  const [enabled, setEnabled] = useState(billingNow.enabled);
  const draft = cleanRadarAccess({ trial, trialDays: days, startedAt: `${start}T00:00:00.000Z` });
  const radarBilling = approve
    ? { enabled: Boolean(enabled), approvedPrices: RADAR_PRICES, approvedAt: billingNow.approved ? settings.radarBilling.approvedAt : new Date().toISOString() }
    : { enabled: false, approvedPrices: null, approvedAt: null };
  const view = accessOf({ radarAccess: draft, radarBilling });

  async function save() {
    setMsg("שומר…");
    try {
      await persistSettings({ ...settings, radarAccess: draft, radarBilling });
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
          <input type="number" min={RADAR_TRIAL.minDays} max={RADAR_TRIAL.maxDays} value={days} onChange={(e) => setDays(Number(e.target.value))} className="input mt-1 w-full" />
        </label>
        <label>מתחילה ב־
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="input mt-1 w-full" />
        </label>
      </div>
      <div className="mt-4 text-sm">
        <p className="font-semibold">מחירים מוצעים (ש״ח, כולל הכל, חיוב דרך PayPal)</p>
        <ul className="mt-1 text-xs leading-relaxed">
          {Object.values(RADAR_PLANS).map((p) => <li key={p.id}>{p.name.he}: ₪{RADAR_PRICES[p.id].monthly} לחודש · ₪{RADAR_PRICES[p.id].yearly} לשנה (12 חודשים, בלי חידוש אוטומטי)</li>)}
        </ul>
        <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={approve} onChange={(e) => { setApprove(e.target.checked); if (!e.target.checked) setEnabled(false); }} /> אני מאשרת את המחירים האלה</label>
        <label className="mt-1 flex items-center gap-2"><input type="checkbox" checked={enabled} disabled={!approve} onChange={(e) => setEnabled(e.target.checked)} /> חיוב פעיל (מציג מחירים וכפתור שדרוג)</label>
        <p className="mt-1 text-xs text-muted">אחרי ההפעלה צריך ללחוץ פעם אחת על "הקמת המסלולים ב־PayPal" למעלה, כדי ליצור את 4 המסלולים של הרדאר. בלי ההפעלה שום דבר לא נוצר ב־PayPal ואף אחד לא מחויב.</p>
      </div>
      <p className="mt-3 text-xs text-muted leading-relaxed">
        מה יוצג: {view.state === "OPEN" ? "הרדאר פתוח לכולם, בלי באנר" : view.state === "TRIAL" ? `באנר ניסיון: עוד ${view.daysLeft} ימים` : view.locked ? "תקופת הניסיון הסתיימה: הרדאר פתוח רק למנויים, ולאחרים מוצג מסך שדרוג" : "באנר: תקופת הניסיון הסתיימה, הרדאר נשאר פתוח ורשימת ההמתנה מוצעת"}.
        {" "}{radarBilling.enabled ? "המחירים והשדרוג מוצגים בעמוד /radar-pro." : "בלי חיוב פעיל: אין מחיר באתר, רק רשימת המתנה."}
      </p>
      <button type="button" onClick={save} className="btn btn-primary mt-3">שמירה</button>
      {msg ? <p className="mt-2 text-xs" role="status">{msg}</p> : null}
    </div>
  );
}
