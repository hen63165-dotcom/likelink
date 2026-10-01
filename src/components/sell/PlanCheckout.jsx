import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getAllPlans, planFeatureRows, FEATURES } from '../../lib/plans.js';
import { fetchPlans, fetchMySubscription, startSubscriptionCheckout, cancelMySubscription } from '../../lib/commerce.js';
import { getSessionToken } from '../../lib/auth.js';
import { toHebrewError } from '../../lib/errorMessages.js';
import { cancellationTerms } from '../../lib/billing/cancellation.js';
import { LEGAL_VERSION, legalPath } from '../../lib/legal/catalog.js';
import { fetchLegalStatus, acceptLegal, setMarketingConsent, joinWaitlist, flushSignupConsent } from '../../lib/legalConsent.js';

// Plans, "what's included", checkout, cancellation and the Elite waitlist —
// all from src/lib/plans.js (the same source as /pricing and the server).
// Every button does something real or says plainly why it cannot.

const SUB_STATUS_HE = {
  pending: 'ממתין לאישור התשלום מ-PayPal', active: 'פעיל', cancelled: 'בוטל',
  expired: 'הסתיים', suspended: 'מושהה — התשלום האחרון לא עבר',
};
const DAY = 86400000;
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return ''; } };
const planName = (id) => (id === 'owner' ? 'בעלת הפלטפורמה (ללא הגבלה)' : getAllPlans().find((p) => p.id === id)?.name?.he || 'חינמי');
// Feature row → the quota it is counted against (FEATURES.quotaKey in plans.js).
const QUOTA_OF = Object.fromEntries(FEATURES.filter((f) => f.quotaKey).map((f) => [f.id, f.quotaKey]));

async function fetchQuotas(token) {
  try {
    const res = await fetch('/api/store?mode=discovery&action=quotas', { headers: { authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    return res.ok && data.ok ? data : null;
  } catch { return null; }
}

function LegalLinks() {
  return <>
    <a className="underline" href={legalPath('terms')} target="_blank" rel="noreferrer">תנאי השימוש</a>,{' '}
    <a className="underline" href={legalPath('privacy')} target="_blank" rel="noreferrer">מדיניות הפרטיות</a> ו
    <a className="underline" href={legalPath('cancellation')} target="_blank" rel="noreferrer">מדיניות הביטולים וההחזרים</a>
  </>;
}

export default function PlanCheckout() {
  const requested = useMemo(() => {
    try { return new URLSearchParams(window.location.search).get('plan') || ''; } catch { return ''; }
  }, []);
  const [period, setPeriod] = useState('monthly');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [signedIn, setSignedIn] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [plan, setPlan] = useState('free');
  const [catalogReady, setCatalogReady] = useState(null);
  const [legal, setLegal] = useState(null);
  const [consent, setConsent] = useState(false);
  const [usage, setUsage] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const lock = useRef(false);

  async function refresh() {
    const token = await getSessionToken();
    setSignedIn(Boolean(token));
    if (!token) return;
    await flushSignupConsent(token).catch(() => false);
    const [s, l, q] = await Promise.all([fetchMySubscription(token), fetchLegalStatus(token), fetchQuotas(token)]);
    if (s.ok) { setSubscription(s.subscription || null); setPlan(s.plan || 'free'); }
    else setMessage(toHebrewError(s.error, 'לא ניתן לבדוק את המנוי כרגע. נסי לרענן.'));
    if (l.ok) setLegal(l);
    setUsage(q);
  }

  useEffect(() => {
    let active = true;
    fetchPlans().then((r) => { if (active) setCatalogReady(Boolean(r.ok && r.paypalConfigured)); }).catch(() => setCatalogReady(false));
    refresh().catch(() => {});
    // Bounded read-only polling after returning from PayPal; the redirect itself never grants access.
    let count = 0;
    const returning = new URLSearchParams(window.location.search).get('sub') === 'return';
    const timer = returning ? setInterval(() => { if (++count >= 12) clearInterval(timer); refresh().catch(() => {}); }, 5000) : null;
    if (requested) setTimeout(() => document.getElementById(`plan-${requested}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    return () => { active = false; clearInterval(timer); };
  }, []);

  async function run(fn) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try {
      const token = await getSessionToken();
      if (!token) { setMessage('צריך להתחבר לסטודיו כדי להמשיך.'); return; }
      await fn(token);
    } catch { setMessage('משהו השתבש — לא בוצע חיוב. נסי שוב בעוד רגע.'); }
    finally { lock.current = false; setBusy(false); }
  }

  const checkout = (planId) => run(async (token) => {
    if (!consent) { setMessage(toHebrewError('legal_acceptance_required')); return; }
    const a = await acceptLegal(token, 'checkout');
    if (!a.ok) { setMessage(toHebrewError(a.error, 'לא הצלחנו לרשום את האישור — לא בוצע חיוב.')); return; }
    const r = await startSubscriptionCheckout(token, planId, period);
    if (!r.ok) { setMessage(toHebrewError(r.error, 'לא ניתן להתחיל את התשלום כרגע — לא בוצע חיוב.')); return; }
    if (r.approveUrl) window.location.assign(r.approveUrl);
    else { setMessage('התשלום נוצר אך חסר קישור אישור. לא הופעל מסלול.'); await refresh(); }
  });

  const cancel = () => run(async (token) => {
    const r = await cancelMySubscription(token);
    setConfirmCancel(false);
    if (!r.ok) { setMessage(toHebrewError(r.error, 'לא ניתן לבטל כרגע. המנוי עדיין פעיל.')); return; }
    const t = r.terms || {};
    const refund = t.refund?.amount > 0 ? ` יוחזרו לך ₪${t.refund.amount.toFixed(2)} לחשבון ה-PayPal תוך 14 ימים${t.refund.fee ? ` (בניכוי דמי ביטול של ₪${t.refund.fee.toFixed(2)})` : ''}.` : '';
    const until = t.accessUntil && Date.parse(t.accessUntil) > Date.now() + 60000 ? ` הגישה למסלול נשארת עד ${fmtDate(t.accessUntil)}.` : ' הגישה עברה למסלול החינמי.';
    setMessage(`המנוי בוטל ב-PayPal, ולא יהיו חיובים נוספים.${until}${refund}`);
    await refresh();
  });

  const waitlist = (planId) => run(async (token) => {
    const r = await joinWaitlist(token, planId);
    setMessage(r.ok ? 'נרשמת לרשימת ההמתנה. נעדכן כשהמסלול ייפתח — בלי תשלום ובלי התחייבות.' : toHebrewError(r.error));
    await refresh();
  });

  const toggleMarketing = (optIn) => run(async (token) => {
    const r = await setMarketingConsent(token, optIn);
    setMessage(r.ok ? (optIn ? 'נרשמת לעדכונים במייל. אפשר להסיר בכל עת.' : 'הוסרת מרשימת העדכונים.') : toHebrewError(r.error));
    await refresh();
  });

  const acceptUpdated = () => run(async (token) => {
    const r = await acceptLegal(token, 'renewal_notice');
    setMessage(r.ok ? 'תודה — האישור נרשם.' : toHebrewError(r.error));
    await refresh();
  });

  const cancellable = subscription && ['active', 'trial', 'suspended'].includes(subscription.status);
  const preview = cancellable ? cancellationTerms({ sub: subscription, now: Date.now() }) : null;
  const yearlyEnds = subscription?.billingPeriod === 'yearly' && subscription.status === 'active' && subscription.expiresAt
    && Date.parse(subscription.expiresAt) - Date.now() < 60 * DAY ? subscription.expiresAt : null;
  const rows = planFeatureRows(plan === 'owner' ? 'professional' : plan);

  const paid = getAllPlans().filter((p) => p.price > 0);
  return <section dir="rtl" className="rounded-2xl p-4 my-5 border" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }} aria-labelledby="plans-title">
    <div className="flex items-baseline justify-between gap-3 flex-wrap">
      <h2 id="plans-title" className="disp text-lg font-bold">המסלול שלך</h2>
      <a href="/pricing" className="text-xs underline" target="_blank" rel="noreferrer">השוואת כל המסלולים</a>
    </div>

    {signedIn === false && <p role="status" className="text-sm mt-2">צריך להתחבר לסטודיו כדי לבחור מסלול.</p>}

    {signedIn && <div className="surface rounded-xl p-3 mt-3">
      <p className="font-bold">{planName(plan)}{subscription?.status ? ` · ${subscription.billingPeriod === 'yearly' ? 'שנתי' : 'חודשי'} · ${SUB_STATUS_HE[subscription.status] || 'בבדיקה'}` : ''}</p>
      {subscription?.verification === 'mismatch' && <p className="text-xs mt-1">התשלום ב-PayPal לא תואם למסלול — פני לתמיכה, לא הופעל מסלול.</p>}
      {subscription?.status === 'cancelled' && subscription.expiresAt && Date.parse(subscription.expiresAt) > Date.now() && <p className="text-xs mt-1">בוטל. הגישה נשארת עד {fmtDate(subscription.expiresAt)}.</p>}
      {yearlyEnds && <p className="text-xs mt-1" role="status">המסלול השנתי מסתיים ב-{fmtDate(yearlyEnds)} ואינו מתחדש אוטומטית. כדי להמשיך אחרי התאריך, אפשר לבחור מסלול חדש.</p>}
      <h3 className="text-sm font-bold mt-3">מה כלול במסלול</h3>
      <ul className="text-xs mt-1 space-y-1">
        {rows.filter((r) => r.status === 'live').map((r) => {
          const limit = usage?.limits?.[QUOTA_OF[r.id]];
          const used = usage?.used?.[QUOTA_OF[r.id]];
          return <li key={r.id} className={r.included ? '' : 'text-muted'}>
            {r.included ? '✓' : '✕'} {r.he}{r.detail && r.included ? ` — ${r.detail}` : ''}
            {r.included && limit > 0 && used != null ? ` (בשימוש: ${used} מתוך ${limit})` : ''}
            {!r.included ? ' — לא כלול' : ''}
          </li>;
        })}
      </ul>
      <p className="text-xs text-muted mt-2">בקרוב, לא כלול כרגע באף מסלול: {rows.filter((r) => r.status === 'soon').map((r) => r.he).join(' · ')}.</p>
      {cancellable && !confirmCancel && <button disabled={busy} className="tap underline text-sm mt-3" onClick={() => setConfirmCancel(true)}>ביטול מנוי</button>}
      {cancellable && confirmCancel && <div className="rounded-lg p-3 mt-3 border" style={{ borderColor: 'var(--border)' }} role="dialog" aria-label="אישור ביטול מנוי">
        <p className="text-sm font-bold">לבטל את המנוי?</p>
        <p className="text-xs mt-1">
          הביטול נשלח ל-PayPal מיד, ולא יהיו חיובים נוספים.{' '}
          {preview?.refund?.amount > 0 ? `יוחזרו לך ₪${preview.refund.amount.toFixed(2)}${preview.refund.fee ? ` (בניכוי דמי ביטול של ₪${preview.refund.fee.toFixed(2)})` : ''}. ` : ''}
          {preview && Date.parse(preview.accessUntil) > Date.now() + 60000 ? `הגישה נשארת עד ${fmtDate(preview.accessUntil)}.` : 'הגישה למסלול תסתיים עכשיו.'}
          {' '}<a className="underline" href={legalPath('cancellation')} target="_blank" rel="noreferrer">איך זה מחושב</a>
        </p>
        <div className="flex gap-3 mt-2">
          <button disabled={busy} className="tap rounded-lg px-3 py-1.5 text-sm font-bold" style={{ background: 'var(--danger, #b42318)', color: 'white' }} onClick={cancel}>כן, לבטל</button>
          <button disabled={busy} className="tap underline text-sm" onClick={() => setConfirmCancel(false)}>חזרה</button>
        </div>
      </div>}
    </div>}

    {signedIn && legal?.needsAcceptance && subscription?.status === 'active' && <div className="rounded-lg p-3 mt-3 border" style={{ borderColor: 'var(--border)' }} role="status">
      <p className="text-xs">המסמכים המשפטיים עודכנו (גרסה <span dir="ltr" className="whitespace-nowrap">{LEGAL_VERSION}</span>). אפשר לקרוא אותם ולאשר: <LegalLinks />. אם לא תסכימי, אפשר לבטל בלי דמי ביטול.</p>
      <button disabled={busy} className="tap underline text-sm mt-1" onClick={acceptUpdated}>קראתי ואני מאשרת</button>
    </div>}

    <h3 className="text-sm font-bold mt-5">שדרוג מסלול</h3>
    <div className="flex gap-2 my-3 text-sm" role="radiogroup" aria-label="תקופת חיוב">
      {[['monthly', 'חודשי · מתחדש כל חודש'], ['yearly', 'שנתי · 12 חודשים, בלי חידוש אוטומטי']].map(([id, label]) =>
        <button key={id} role="radio" aria-checked={period === id} disabled={busy} onClick={() => setPeriod(id)} className="tap rounded-full px-3 py-1.5 border" style={{ borderColor: period === id ? 'var(--accent)' : 'var(--border)', fontWeight: period === id ? 700 : 400 }}>{label}</button>)}
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      {paid.map((p) => <article key={p.id} id={`plan-${p.id}`} className="surface rounded-xl p-3 flex flex-col" style={requested === p.id ? { outline: '2px solid var(--accent)' } : undefined}>
        <h4 className="font-bold">{p.name.he}{p.comingSoon ? ' · בקרוב' : ''}</h4>
        <p className="text-xl font-bold my-2">₪{period === 'yearly' ? p.priceYearly : p.price}<span className="text-xs font-normal text-muted"> {period === 'yearly' ? 'ל-12 חודשים' : 'לחודש'}</span></p>
        <p className="text-xs mb-2">{p.tagline.he}</p>
        {!p.comingSoon && <ul className="text-xs mb-3 space-y-0.5">{planFeatureRows(p.id).filter((r) => r.status === 'live' && r.included).map((r) => <li key={r.id}>✓ {r.he}{r.detail ? ` — ${r.detail}` : ''}</li>)}</ul>}
        {p.comingSoon && <p className="text-xs mb-3">עדיין לא זמין לרכישה. ההצטרפות לרשימת ההמתנה חינמית ולא מחייבת.</p>}
        <div className="mt-auto">
          {p.comingSoon
            ? <button disabled={busy || !signedIn || legal?.waitlist?.includes(p.id)} onClick={() => waitlist(p.id)} className="tap rounded-xl w-full p-2 font-bold border disabled:opacity-50" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>{legal?.waitlist?.includes(p.id) ? 'את ברשימת ההמתנה' : 'הצטרפות לרשימת ההמתנה'}</button>
            : <button disabled={busy || catalogReady !== true || !signedIn || plan === p.id} onClick={() => checkout(p.id)} className="tap rounded-xl w-full p-2 font-bold disabled:opacity-50" style={{ background: 'var(--accent)', color: 'white' }}>{plan === p.id ? 'המסלול הנוכחי שלך' : 'התחילי את החבילה · מעבר לתשלום מאובטח'}</button>}
        </div>
      </article>)}
    </div>

    {signedIn && <div className="mt-4 space-y-2 text-xs">
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
        <span>קראתי ואני מסכימה ל<LegalLinks /> (גרסה <span dir="ltr" className="whitespace-nowrap">{LEGAL_VERSION}</span>), ואני בת 18 ומעלה. <span className="text-muted">חובה לפני תשלום.</span></span>
      </label>
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={Boolean(legal?.marketing?.optIn)} disabled={busy} onChange={(e) => toggleMarketing(e.target.checked)} className="mt-0.5" />
        <span>אני רוצה לקבל במייל עדכונים והצעות מ-LikeLink. <span className="text-muted">לא חובה. אפשר להסיר בכל עת.</span></span>
      </label>
    </div>}

    <p className="text-xs text-muted mt-3">התשלום מתבצע בדף המאובטח של PayPal, והמסלול מופעל רק אחרי אישור מאומת מהשרת. ביטול בתוך 14 יום מהתשלום הראשון מזכה בהחזר, בניכוי דמי ביטול של 5% או ₪100 (הנמוך מביניהם).</p>
    {catalogReady === false && <p role="status" className="text-sm mt-3">{toHebrewError('paypal_not_configured')}</p>}
    {message && <p role="status" className="text-sm mt-3">{message}</p>}
    {signedIn && <button disabled={busy} className="tap underline text-sm my-3" onClick={() => refresh().catch(() => {})}>בדיקת מצב המנוי</button>}
  </section>;
}
