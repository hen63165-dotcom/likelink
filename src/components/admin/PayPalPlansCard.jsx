// PayPal subscription plans — one-time provisioning, owner/admin only.
//
// Creates (or adopts) the catalog product + the 6 billing plans in ILS at the
// site's prices through POST /api/store?mode=subs&sub=provision-plans, then
// shows what PayPal confirmed (ACTIVE, ILS, price). It never creates a
// subscription and never charges anyone.
import React, { useState } from "react";
import { Loader2, CheckCircle2, CircleAlert } from "lucide-react";
import { Button } from "../ui";
import { getSessionToken } from "../../lib/auth.js";
import { toHebrewError } from "../../lib/errorMessages.js";

const LABEL = {
  "starter:monthly": "Starter חודשי", "starter:yearly": "Starter שנתי",
  "professional:monthly": "Professional חודשי", "professional:yearly": "Professional שנתי",
};

export default function PayPalPlansCard() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function provision() {
    if (!window.confirm("ייווצרו (או יאומתו) 4 מסלולי מנוי ב-PayPal Live בשקלים: Starter ₪29/₪290, Professional ₪79/₪790. זה לא מחייב אף אחד. להמשיך?")) return;
    setBusy(true);
    setError("");
    let token = "";
    try { token = sessionStorage.getItem("ll_admin_token") || ""; } catch { token = ""; }
    if (!token) token = (await getSessionToken().catch(() => null)) || "";
    try {
      const res = await fetch("/api/store?mode=subs&sub=provision-plans", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: "{}",
      });
      const data = await res.json().catch(() => ({ ok: false, error: `http_${res.status}` }));
      if (!res.ok && !data.verified) setError(toHebrewError(data.error, "יצירת המסלולים נכשלה"));
      else setResult(data);
    } catch (e) {
      setError(toHebrewError(e?.message, "יצירת המסלולים נכשלה"));
    }
    setBusy(false);
  }

  return (
    <div className="surface rounded-2xl p-4 mt-4">
      <p className="font-semibold">מסלולי מנוי ב-PayPal</p>
      <p className="text-xs text-muted mt-1">יצירה חד-פעמית של 4 המסלולים (Starter ו-Professional, חודשי ושנתי) בשקלים, לפי המחירים באתר. Elite לא נוצר (בקרוב). פעולה חוזרת רק מאמתת — לא יוצרת כפילויות ולא מחייבת.</p>
      <div className="mt-3 max-w-xs">
        <Button onClick={provision} disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : null} יצירה / אימות מסלולים</Button>
      </div>
      {error ? <p className="text-xs mt-2" style={{ color: "var(--danger)" }}>{error}</p> : null}
      {result ? (
        <div className="mt-3 space-y-1 text-xs">
          <p className="font-semibold">{result.ok ? "כל המסלולים קיימים ופעילים ב-PayPal" : "חלק מהמסלולים לא אומתו — ראי פירוט"}</p>
          {(result.verified || []).map((v) => (
            <div key={v.key} className="flex items-center gap-1.5">
              {v.ok ? <CheckCircle2 size={12} style={{ color: "var(--success)" }} /> : <CircleAlert size={12} style={{ color: "var(--danger)" }} />}
              <span>{LABEL[v.key] || v.key} · ₪{v.price}</span>
              <span className="text-muted">{v.id ? `${v.id} · ${v.status || "לא אומת"}` : "לא נוצר"}</span>
            </div>
          ))}
          {result.created?.length ? <p className="text-muted">נוצרו עכשיו: {result.created.length}</p> : null}
          {result.adopted?.length ? <p className="text-muted">כבר היו קיימים ואומצו: {result.adopted.length}</p> : null}
          {result.failed?.length ? <p style={{ color: "var(--danger)" }}>נכשלו: {result.failed.map((f) => LABEL[f.key] || f.key).join(", ")}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
