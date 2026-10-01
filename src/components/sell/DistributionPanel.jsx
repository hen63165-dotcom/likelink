import React, { useEffect, useState } from 'react';
import { getSessionToken } from '../../lib/auth.js';
import { toHebrewError } from '../../lib/errorMessages.js';
import ChatGptConnect from './ChatGptConnect';

// Distribution plans (drafts) from the creator's real products — hooks,
// scripts, captions with disclosure, and a tracking link per post. Nothing is
// posted from here: the creator posts by hand (or, once a network is connected
// and verified, per-post approval). A post the creator marks as posted is
// "reported", never "published" — only a network's own post id could say that.

const API = '/api/store?mode=discovery';
const STATE_HE = {
  DRAFT: 'טיוטה', READY_FOR_MANUAL_POST: 'מוכן לפרסום ידני', REPORTED_BY_CREATOR: 'סימנת שפורסם (לא מאומת מול הרשת)',
  REQUIRES_CONNECTION: 'דרוש חיבור', PUBLISHED: 'פורסם (מאומת מול הרשת)',
};

async function api(path, { method = 'GET', body } = {}) {
  try {
    const token = await getSessionToken();
    if (!token) return { ok: false, error: 'authentication_required' };
    const res = await fetch(`${API}&${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    return { ...data, ok: res.ok && data.ok !== false };
  } catch { return { ok: false, error: 'network' }; }
}

function download(file) {
  const blob = new Blob([file.content], { type: `${file.mime};charset=utf-8` });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export default function DistributionPanel({ products = [] }) {
  const approved = products.filter((p) => p && ['approved', 'active', 'published'].includes(String(p.status)));
  const [productId, setProductId] = useState('');
  const [plans, setPlans] = useState([]);
  const [open, setOpen] = useState(null);
  const [stats, setStats] = useState(null);
  const [channels, setChannels] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function refresh() {
    const [p, s, c] = await Promise.all([api('action=distribution-plans'), api('action=click-stats'), api('action=distribution-channels')]);
    if (p.ok) setPlans(p.plans || []);
    if (s.ok) setStats(s);
    if (c.ok) setChannels(c.channels || []);
  }
  useEffect(() => { refresh().catch(() => {}); }, []);
  useEffect(() => { if (!productId && approved[0]) setProductId(String(approved[0].id)); }, [approved.length]);

  async function act(fn) {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await fn(); } finally { setBusy(false); }
  }
  const create = () => act(async () => {
    const r = await api('action=distribution-plan', { method: 'POST', body: { productId } });
    if (!r.ok) { setMessage(r.error === 'product_not_ready' ? `אי אפשר עדיין: ${(r.blockers || []).join(' · ')}` : toHebrewError(r.error)); return; }
    setMessage('תוכנית ההפצה נוצרה ונשמרה כטיוטה. שום דבר לא פורסם.');
    setOpen(r.plan.id);
    await refresh();
  });
  const exportPlan = (id, format) => act(async () => {
    const r = await api(`action=distribution-export&id=${encodeURIComponent(id)}&format=${format}`);
    if (!r.ok) { setMessage(toHebrewError(r.error)); return; }
    download(r.file);
  });
  const step = (planId, post, stepName) => act(async () => {
    let postUrl = '';
    if (stepName === 'reported') postUrl = window.prompt('קישור לפוסט (לא חובה):', '') || '';
    // Explicit approval of THIS post — the server refuses a publish without it.
    if (stepName === 'publish' && !window.confirm(`לפרסם עכשיו את הפוסט הזה ב-${post.channelLabel}? הוא יוצא מיד, בחשבון שחיברת, עם הכיתוב והלינק שמוצגים כאן.`)) return;
    const r = await api('action=distribution-post', { method: 'POST', body: { planId, postId: post.postId, step: stepName, postUrl, ...(stepName === 'publish' ? { confirm: post.postId } : {}) } });
    if (!r.ok) {
      const ownerAction = r.ownerAction ? ` מה צריך לעשות: ${r.ownerAction}` : '';
      setMessage(r.error === 'channel_requires_connection' ? `הרשת הזו עדיין לא מחוברת, ולכן אי אפשר לפרסם ממנה. אפשר לפרסם ידנית עם הכיתוב והלינק.${ownerAction}` : toHebrewError(r.error));
      return;
    }
    if (stepName === 'publish') setMessage(r.post?.verification === 'PUBLIC_VERIFIED' ? `פורסם ואומת בעמוד הציבורי: ${r.post.publicUrl}` : `פורסם — ${r.post?.provider} אישר (מזהה ${r.post?.providerPostId}).`);
    await refresh();
  });
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); setMessage('הועתק.'); } catch { setMessage('ההעתקה לא הצליחה — סמני את הטקסט והעתיקי ידנית.'); } };

  return <section dir="rtl" className="rounded-2xl p-4 my-5 border" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }} aria-labelledby="dist-title">
    <h2 id="dist-title" className="disp text-lg font-bold">תוכניות הפצה</h2>
    <p className="text-xs text-muted mt-1">הוקים, תסריטים, כיתובים ולוח זמנים מהפרטים האמיתיים של המוצר, עם גילוי נאות ולינק מעקב לכל פוסט. שום דבר לא מתפרסם מכאן בלי שתעשי זאת בעצמך.</p>

    {approved.length === 0
      ? <p className="text-sm mt-3" role="status">אין עדיין מוצר מאושר. אחרי שמוצר יאושר תוכלי ליצור לו תוכנית הפצה.</p>
      : <div className="flex flex-wrap gap-2 items-center mt-3">
        <label className="text-sm">מוצר
          <select value={productId} onChange={(e) => setProductId(e.target.value)} disabled={busy} className="surface rounded-lg p-2 mx-2 max-w-[220px]">
            {approved.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </label>
        <button disabled={busy || !productId} onClick={create} className="tap rounded-xl px-3 py-2 font-bold text-sm disabled:opacity-50" style={{ background: 'var(--accent)', color: 'white' }}>יצירת תוכנית הפצה</button>
      </div>}

    {message && <p role="status" className="text-sm mt-3">{message}</p>}

    {stats && <div className="text-xs mt-4">
      <p className="font-bold">קליקים אמיתיים על הלינקים שלך: {stats.total}</p>
      {stats.byChannel && Object.keys(stats.byChannel).length > 0 && <p className="mt-1">לפי ערוץ: {Object.entries(stats.byChannel).map(([k, v]) => `${k} ${v}`).join(' · ')}</p>}
      {!stats.detailed && <p className="text-muted mt-1">פירוט לפי ערוץ ולפי פוסט זמין מ-Starter.</p>}
    </div>}

    <div className="mt-4 space-y-3">
      {plans.map((plan) => <article key={plan.id} className="surface rounded-xl p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-bold text-sm">{plan.productTitle} · {new Date(plan.createdAt).toLocaleDateString('he-IL')} · {plan.posts} פוסטים</p>
          <div className="flex gap-3 text-xs">
            <button className="tap underline" onClick={() => setOpen(open === plan.id ? null : plan.id)}>{open === plan.id ? 'סגירה' : 'פתיחה'}</button>
            <button className="tap underline" disabled={busy} onClick={() => exportPlan(plan.id, 'csv')}>ייצוא CSV</button>
            <button className="tap underline" disabled={busy} onClick={() => exportPlan(plan.id, 'json')}>ייצוא JSON</button>
          </div>
        </div>
        {open === plan.id && <ol className="mt-2 space-y-2">
          {(plan.calendar || []).map((post) => <li key={post.postId} className="rounded-lg p-2 border text-xs" style={{ borderColor: 'var(--border)' }}>
            <p className="font-bold">{post.date} · {post.channelLabel} · {post.format} · <span className="font-normal">{STATE_HE[post.state] || post.state}</span></p>
            <pre className="whitespace-pre-wrap mt-1 font-sans">{post.caption}</pre>
            {post.state === 'PUBLISHED' && <p className="mt-1">מזהה הפוסט אצל {post.provider}: {post.providerPostId}{post.publicUrl ? <> · <a className="underline" href={post.publicUrl} target="_blank" rel="noreferrer">לפוסט הציבורי</a></> : null}{post.verification === 'PUBLIC_VERIFIED' ? ' · אומת בעמוד הציבורי' : ' · אושר על ידי הרשת'}</p>}
            {post.lastError && post.state !== 'PUBLISHED' && <p className="mt-1" role="status">הפרסום האחרון נכשל: {toHebrewError(post.lastError.code)}</p>}
            <p className="text-muted mt-1">{post.aiLabel} {post.disclosureTool}</p>
            <div className="flex flex-wrap gap-3 mt-1">
              <button className="tap underline" onClick={() => copy(post.caption)}>העתקת הכיתוב</button>
              <button className="tap underline" onClick={() => copy(post.link)}>העתקת הלינק</button>
              {post.state === 'DRAFT' && <button className="tap underline" disabled={busy} onClick={() => step(plan.id, post, 'ready_manual')}>מוכן לפרסום ידני</button>}
              {post.state !== 'REPORTED_BY_CREATOR' && post.state !== 'PUBLISHED' && <button className="tap underline" disabled={busy} onClick={() => step(plan.id, post, 'reported')}>פרסמתי</button>}
              {post.state !== 'PUBLISHED' && <button className="tap underline" disabled={busy} onClick={() => step(plan.id, post, 'publish')}>{post.publish?.mode === 'api' ? 'פרסום עכשיו ב-' + post.channelLabel : 'פרסום דרך הרשת'}</button>}
            </div>
          </li>)}
        </ol>}
      </article>)}
    </div>

    {channels.length > 0 && <details className="mt-4 text-xs">
      <summary className="cursor-pointer font-bold">מצב הערוצים</summary>
      <ul className="mt-2 space-y-1">
        {channels.map((c) => <li key={c.id}>{c.label}: {c.stateHe}{c.ownerAction ? <span className="text-muted"> — דרוש מבעלת הפלטפורמה: {c.ownerAction}</span> : null}</li>)}
      </ul>
    </details>}

    <ChatGptConnect />
  </section>;
}
