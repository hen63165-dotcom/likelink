// Owner console (/owner) — the platform owner's private controls, apart from
// the creators' Studio. Nothing here is linked from the public site, the page
// is noindex, and it renders only after the SERVER confirms the signed-in
// account is the platform owner (sub=get → plan "owner", matched on the
// verified e-mail against OWNER_EMAIL). Anyone else sees "page not found".
// The actions themselves are enforced on the server too (owner session or
// admin token), so hiding the page is privacy, not the security boundary.
import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import PayPalPlansCard from "./PayPalPlansCard.jsx";
import { fetchMySubscription, fetchPlans } from "../../lib/commerce.js";
import { getSessionToken } from "../../lib/auth.js";

export default function OwnerConsole() {
  const [state, setState] = useState({ status: "checking" });

  useEffect(() => {
    let alive = true;
    (async () => {
      const token = await getSessionToken().catch(() => null);
      if (!token) { if (alive) setState({ status: "hidden" }); return; }
      const me = await fetchMySubscription(token).catch(() => null);
      if (!me?.ok || me.plan !== "owner") { if (alive) setState({ status: "hidden" }); return; }
      const plans = await fetchPlans().catch(() => null);
      if (alive) setState({ status: "owner", paypalReady: Boolean(plans?.ok && plans.paypalConfigured), paypalConnected: Boolean(plans?.paypalConnected) });
    })();
    return () => { alive = false; };
  }, []);

  if (state.status === "checking") {
    return <div dir="rtl" className="min-h-[60vh] flex items-center justify-center"><Loader2 className="animate-spin" size={22} /></div>;
  }
  if (state.status !== "owner") {
    return (
      <div dir="rtl" className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-center p-6">
        <h1 className="text-xl font-bold">העמוד לא נמצא</h1>
        <a href="/" className="underline">לדף הבית</a>
      </div>
    );
  }
  return (
    <div dir="rtl" className="max-w-2xl mx-auto p-4 space-y-4">
      <header>
        <h1 className="text-2xl font-bold">לוח בעלת האתר</h1>
        <p className="text-sm opacity-80">עמוד פרטי. רק החשבון שלך רואה אותו — השרת בודק את הזהות בכל כניסה.</p>
      </header>
      <section className="surface rounded-2xl p-4">
        <p className="font-semibold">תשלומים</p>
        <p className="text-sm mt-1">
          PayPal: {state.paypalConnected ? "מחובר" : "לא מחובר"} · מסלולי מנוי: {state.paypalReady ? "פעילים — הכפתורים פתוחים לכולם" : "עדיין לא נוצרו — הכפתורים סגורים"}
        </p>
      </section>
      <PayPalPlansCard />
      <section className="surface rounded-2xl p-4 text-sm space-y-1">
        <p className="font-semibold">קישורים</p>
        <a className="underline block" href="/admin">ניהול מלא (קוד ניהול)</a>
        <a className="underline block" href="/studio">הסטודיו שלי</a>
        <a className="underline block" href="/api/store?mode=discovery&action=system-check" target="_blank" rel="noopener noreferrer">בדיקת מערכת</a>
      </section>
    </div>
  );
}
