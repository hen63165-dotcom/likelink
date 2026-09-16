import React, { useEffect, useRef, useState } from 'react';
import { getAllPlans } from '../../lib/plans.js';
import { financialRequest } from '../../lib/commerce.js';
import { getSessionToken } from '../../lib/auth.js';

const messages = {
  UNAUTHENTICATED: 'נדרשת התחברות מאובטחת ל־LikeLink2.',
  PAYMENT_PROVIDER_REQUIRED: 'התשלום עדיין אינו מופעל. הסטודיו נשאר זמין.',
  PAYMENT_STORAGE_REQUIRED: 'התשלום טרם הופעל בענן. לא בוצע חיוב.',
  PAYMENT_RECONCILIATION_REQUIRED: 'ממתינים לאימות התשלום. אין לבצע תשלום נוסף; אפשר לרענן את הסטטוס.',
};
const orderStatus = {
  CREATING: 'מכינים תשלום מאובטח', AWAITING_PAYMENT: 'ממתין לתשלום או לאישור מהמסילה',
  CAPTURED: 'התשלום אומת', REFUNDED: 'בוצע החזר', REFUND_PENDING: 'החזר בבדיקה',
  RECONCILIATION_REQUIRED: 'נדרש בירור תשלום — אין לשלם שוב',
};

export default function StudioCheckout() {
  const [period, setPeriod] = useState('monthly');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [orders, setOrders] = useState([]);
  const [ready, setReady] = useState(null);
  const lock = useRef(false);
  const keys = useRef({});
  async function refresh() {
    const token = await getSessionToken();
    if (!token) { setMessage(messages.UNAUTHENTICATED); return; }
    const r = await financialRequest('list', token);
    if (r.ok) setOrders(r.orders);
    else setMessage(messages[r.error] || 'לא ניתן לבדוק את התשלום כרגע. נסו לרענן.');
  }
  useEffect(() => {
    let active = true;
    financialRequest('status').then(r => { if (active) setReady(r.ok && r.configured); });
    refresh().catch(() => setMessage(messages.UNAUTHENTICATED));
    // Bounded read-only polling on return; a redirect itself never grants access.
    let count = 0;
    const returning = new URLSearchParams(window.location.search).has('payment');
    const timer = returning ? setInterval(() => {
      if (++count >= 12) clearInterval(timer);
      refresh().catch(() => {});
    }, 5000) : null;
    return () => { active = false; clearInterval(timer); };
  }, []);
  async function checkout(planId) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try {
      const token = await getSessionToken();
      if (!token) { setMessage(messages.UNAUTHENTICATED); return; }
      const key = `${planId}:${period}`;
      keys.current[key] ||= crypto.randomUUID();
      const r = await financialRequest('checkout', token, { planId, billingPeriod: period, idempotencyKey: keys.current[key] });
      if (!r.ok) { setMessage(messages[r.error] || 'לא ניתן להתחיל את התשלום. לא אושרה רכישה.'); return; }
      if (r.order.checkoutUrl) window.location.assign(r.order.checkoutUrl);
      else { setMessage(orderStatus[r.order.status] || 'התשלום בבדיקה'); await refresh(); }
    } catch { setMessage(messages.PAYMENT_RECONCILIATION_REQUIRED); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section dir="rtl" className="rounded-2xl p-4 my-5 border" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
    <h2 className="disp text-lg font-bold">LikeLink2 · חבילות Studio</h2>
    <p className="text-xs text-muted mt-2">רכישה חד־פעמית לתקופה נבחרת, ללא חידוש אוטומטי. איסוף פרטי התשלום בדף מאובטח; אין צורך בחשבון אצל חברת התשלום.</p>
    <label className="block text-sm my-3">תקופת גישה
      <select aria-label="תקופת גישה" value={period} onChange={e => setPeriod(e.target.value)} disabled={busy} className="surface rounded-lg p-2 mx-2">
        <option value="monthly">30 ימים</option><option value="yearly">365 ימים</option>
      </select>
    </label>
    <div className="grid gap-3 sm:grid-cols-3">
      {getAllPlans().filter(p => p.price > 0).map(p => <article key={p.id} className="surface rounded-xl p-3">
        <h3 className="font-bold">{p.name.he}</h3>
        <p className="text-xl font-bold my-2">₪{period === 'yearly' ? p.priceYearly : p.price}</p>
        <p className="text-xs mb-3">{p.tagline.he}</p>
        <button disabled={busy || !ready} onClick={() => checkout(p.id)} className="tap rounded-xl w-full p-2 font-bold disabled:opacity-50" style={{ background: 'var(--accent)', color: 'white' }}>לתשלום מאובטח</button>
      </article>)}
    </div>
    <p className="text-xs text-muted mt-3">אמצעי התשלום הזמינים יוצגו בדף המאובטח בהתאם למכשיר ולהגדרות הסליקה.</p>
    {ready === false && <p role="status" className="text-sm mt-3">{messages.PAYMENT_PROVIDER_REQUIRED}</p>}
    {message && <p role="status" className="text-sm mt-3">{message}</p>}
    <button disabled={busy} className="tap underline text-sm my-3" onClick={() => refresh().catch(() => setMessage(messages.UNAUTHENTICATED))}>רענון מצב הרכישות</button>
    <ul className="space-y-2">{orders.map(o => <li key={o.id} className="surface p-2 rounded-lg text-xs">
      <span>{o.planId} · ₪{(o.amountMinor / 100).toFixed(2)} · {orderStatus[o.status] || o.status}</span>
      {o.environment === 'sandbox' && <strong className="block">סביבת בדיקה בלבד — ללא הפעלת חבילה</strong>}
      <span dir="ltr" className="block break-all text-muted">{o.id}</span>
    </li>)}</ul>
  </section>;
}
