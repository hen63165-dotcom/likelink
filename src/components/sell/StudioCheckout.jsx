import React, { useEffect, useRef, useState } from 'react';
import { getAllPlans } from '../../lib/plans.js';
import { fetchPlans, fetchMySubscription, startSubscriptionCheckout, cancelMySubscription } from '../../lib/commerce.js';
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
  const [subscription, setSubscription] = useState(null);
  const [catalogReady, setCatalogReady] = useState(null);
  const lock = useRef(false);
  const keys = useRef({});
  async function refresh() {
    const token = await getSessionToken();
    if (!token) { setMessage(messages.UNAUTHENTICATED); return; }
    const r = await fetchMySubscription(token);
    if (r.ok) setSubscription(r.subscription || null);
    else setMessage(messages[r.error] || 'לא ניתן לבדוק את המנוי כרגע. נסו לרענן.');
  }
  useEffect(() => {
    let active = true;
    fetchPlans().then(r => { if (active) setCatalogReady(Boolean(r.ok && r.paypalConfigured)); }).catch(() => setCatalogReady(false));
    refresh().catch(() => setMessage(messages.UNAUTHENTICATED));
    // Bounded read-only polling on return; a redirect itself never grants access.
    let count = 0;
    const returning = new URLSearchParams(window.location.search).has('sub');
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
      const r = await startSubscriptionCheckout(token, planId, period);
      if (!r.ok) { setMessage(r.error === 'paypal_not_configured' ? messages.PAYMENT_PROVIDER_REQUIRED : (r.error || 'לא ניתן להתחיל את התשלום.')); return; }
      if (r.approveUrl) window.location.assign(r.approveUrl);
      else { setMessage('התשלום נוצר אך חסר קישור אישור. לא הופעלה חבילה.'); await refresh(); }
    } catch { setMessage(messages.PAYMENT_RECONCILIATION_REQUIRED); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section dir="rtl" className="rounded-2xl p-4 my-5 border" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
    <h2 className="disp text-lg font-bold">LikeLink2 · חבילות Studio</h2>
    <p className="text-xs text-muted mt-2">מנוי חודשי או שנתי. החיוב מתבצע בדף הרשמי המאובטח של PayPal, והמנוי מופעל רק לאחר אישור שרת מאומת.</p>
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
        <button disabled={busy || catalogReady !== true} onClick={() => checkout(p.id)} className="tap rounded-xl w-full p-2 font-bold disabled:opacity-50" style={{ background: 'var(--accent)', color: 'white' }}>לתשלום מאובטח</button>
      </article>)}
    </div>
    <p className="text-xs text-muted mt-3">אמצעי התשלום הזמינים יוצגו בדף המאובטח בהתאם למכשיר ולהגדרות הסליקה.</p>
    {catalogReady === false && <p role="status" className="text-sm mt-3">{messages.PAYMENT_PROVIDER_REQUIRED}</p>}
    {subscription?.status && <p role="status" className="text-sm mt-3">מנוי נוכחי: {subscription.planId} · {subscription.billingPeriod === 'yearly' ? 'שנתי' : 'חודשי'} · {subscription.status}</p>}
    {message && <p role="status" className="text-sm mt-3">{message}</p>}
    <button disabled={busy} className="tap underline text-sm my-3" onClick={() => refresh().catch(() => setMessage(messages.UNAUTHENTICATED))}>רענון מצב המנוי</button>
    {subscription?.status === 'active' && <button disabled={busy} className="tap underline text-sm block" onClick={async () => { const token = await getSessionToken(); const r = await cancelMySubscription(token); setMessage(r.ok ? 'המנוי בוטל. הגישה תישאר לפי תנאי המנוי המאושר.' : (r.error || 'לא ניתן לבטל כרגע.')); await refresh(); }}>ביטול מנוי</button>}
  </section>;
}
