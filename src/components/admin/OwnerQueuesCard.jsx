// Owner queues: refunds owed after a cancellation, and the Elite waitlist.
//
// LikeLink never sends a refund itself. The owner returns the money in PayPal
// (Activity → the subscription's payment → Refund) and records PayPal's refund
// id here; only then is the request marked done. The policy promises the
// refund within 14 days of the cancellation, so each row shows its due date.
import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "../ui";
import { getSessionToken } from "../../lib/auth.js";
import { toHebrewError } from "../../lib/errorMessages.js";

const REASON_HE = { cooling_off_14d: "ביטול בתוך 14 יום (בניכוי דמי ביטול)", yearly_unused_months: "מסלול שנתי — חודשים שלא נוצלו" };
const DAY = 86400000;
const fmt = (iso) => { try { return new Date(iso).toLocaleDateString("he-IL"); } catch { return ""; } };

async function ownerToken() {
  let token = "";
  try { token = sessionStorage.getItem("ll_admin_token") || ""; } catch { token = ""; }
  return token || (await getSessionToken().catch(() => null)) || "";
}
async function request(url, { method = "GET", body } = {}) {
  const token = await ownerToken();
  try {
    const res = await fetch(url, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    return { ...data, ok: res.ok && data.ok !== false };
  } catch { return { ok: false, error: "network" }; }
}

export default function OwnerQueuesCard() {
  const [refunds, setRefunds] = useState(null);
  const [waitlist, setWaitlist] = useState(null);
  const [refundIds, setRefundIds] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh() {
    const [r, w] = await Promise.all([
      request("/api/store?mode=subs&sub=refunds", { method: "POST", body: {} }),
      request("/api/store?mode=legal&action=waitlist"),
    ]);
    if (r.ok) setRefunds(r.refunds || []); else setMessage(toHebrewError(r.error, "לא הצלחנו לטעון את בקשות ההחזר"));
    if (w.ok) setWaitlist(w.waitlist || []);
  }
  useEffect(() => { refresh().catch(() => {}); }, []);

  async function markDone(id) {
    const providerRefundId = String(refundIds[id] || "").trim();
    if (!providerRefundId) { setMessage("יש להדביק את מזהה ההחזר מ-PayPal לפני הסימון."); return; }
    setBusy(true); setMessage("");
    const r = await request("/api/store?mode=subs&sub=refunds", { method: "POST", body: { id, providerRefundId } });
    setMessage(r.ok ? "ההחזר סומן כבוצע." : toHebrewError(r.error, "הסימון נכשל"));
    setBusy(false);
    await refresh();
  }

  const pending = (refunds || []).filter((r) => r.status === "pending_owner");
  const done = (refunds || []).filter((r) => r.status === "refunded");
  return (
    <div className="surface rounded-2xl p-4 mt-4">
      <p className="font-semibold">החזרים ורשימת המתנה</p>
      <p className="text-xs text-muted mt-1">LikeLink לא שולחת החזרים בעצמה. מבצעים את ההחזר ב-PayPal (פעילות ← התשלום של המנוי ← החזר), מדביקים כאן את מזהה ההחזר, ורק אז הבקשה מסומנת כבוצעה. לפי המדיניות ההחזר צריך להתבצע תוך 14 יום מהביטול.</p>
      {refunds === null ? <p className="text-xs mt-3 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> טוען…</p> : (
        <div className="mt-3 text-xs space-y-2">
          <p className="font-semibold">ממתינים להחזר: {pending.length}{done.length ? ` · בוצעו: ${done.length}` : ""}</p>
          {pending.map((r) => {
            const due = new Date(Date.parse(r.requestedAt) + 14 * DAY);
            const late = Date.now() > due.getTime();
            return (
              <div key={r.id} className="rounded-lg border p-2" style={{ borderColor: late ? "var(--danger)" : "var(--border)" }}>
                <p className="font-semibold">₪{Number(r.amount).toFixed(2)} · {REASON_HE[r.reason] || r.reason}{r.fee ? ` · דמי ביטול ₪${Number(r.fee).toFixed(2)}` : ""}</p>
                <p className="text-muted">מסלול {r.planId} {r.billingPeriod === "yearly" ? "שנתי" : "חודשי"} · בוטל {fmt(r.requestedAt)} · להחזיר עד {fmt(due.toISOString())}{late ? " · באיחור" : ""}</p>
                <p className="text-muted" dir="ltr">PayPal subscription: {r.paypalSubscriptionId || "—"}</p>
                <div className="flex gap-2 mt-1 items-center">
                  <input className="input-field px-2 py-1 text-xs flex-1" dir="ltr" placeholder="PayPal refund ID" value={refundIds[r.id] || ""} onChange={(e) => setRefundIds((s) => ({ ...s, [r.id]: e.target.value }))} />
                  <Button onClick={() => markDone(r.id)} disabled={busy}>סימון כבוצע</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {waitlist ? (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer font-semibold">רשימת המתנה ל-Elite: {waitlist.length}</summary>
          <ul className="mt-1 space-y-0.5">{waitlist.map((w) => <li key={`${w.userId}-${w.planId}`} dir="ltr">{w.email || w.userId} · {fmt(w.at)}</li>)}</ul>
        </details>
      ) : null}
      {message ? <p role="status" className="text-xs mt-2">{message}</p> : null}
    </div>
  );
}
