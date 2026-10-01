import React, { useEffect, useState } from 'react';
import { getSessionToken } from '../../lib/auth.js';
import { toHebrewError } from '../../lib/errorMessages.js';

// "חיבור ל-ChatGPT": API keys for the Likelink Content Studio GPT (shown once,
// stored hashed, revocable — Professional) and the drafts the GPT saved.
// Drafts are approved here by the creator; the GPT can never approve or publish.

const GPT = '/api/store?mode=gpt';
async function gpt(op, { method = 'GET', body } = {}) {
  try {
    const token = await getSessionToken();
    if (!token) return { ok: false, error: 'authentication_required' };
    const res = await fetch(`${GPT}&op=${op}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    return { ...data, ok: res.ok && data.ok !== false };
  } catch { return { ok: false, error: 'network' }; }
}

export default function ChatGptConnect() {
  const [status, setStatus] = useState(null);
  const [keys, setKeys] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [fresh, setFresh] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function refresh() {
    const [s, k, d] = await Promise.all([gpt('status'), gpt('keys'), gpt('my-drafts')]);
    if (s.ok) setStatus(s);
    if (k.ok) setKeys(k.keys || []);
    if (d.ok) setDrafts(d.drafts || []);
  }
  useEffect(() => { refresh().catch(() => {}); }, []);
  const act = async (fn) => { if (busy) return; setBusy(true); setMessage(''); try { await fn(); } finally { setBusy(false); } };

  const create = () => act(async () => {
    const r = await gpt('keys-create', { method: 'POST', body: { name: 'ChatGPT' } });
    if (!r.ok) { setMessage(r.error === 'too_many_keys' ? 'יש כבר 3 מפתחות פעילים. בטלי אחד כדי ליצור חדש.' : toHebrewError(r.error)); return; }
    setFresh(r.key);
    await refresh();
  });
  const revoke = (id) => act(async () => {
    const r = await gpt('keys-revoke', { method: 'POST', body: { id } });
    setMessage(r.ok ? 'המפתח בוטל ומפסיק לעבוד מיד.' : toHebrewError(r.error));
    await refresh();
  });
  const approve = (draftId) => act(async () => {
    const r = await gpt('draft-approve', { method: 'POST', body: { draftId } });
    setMessage(r.ok ? 'הטיוטה אושרה לפרסום ידני. הכיתוב והלינק מוכנים להעתקה.' : toHebrewError(r.error));
    await refresh();
  });
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); setMessage('הועתק.'); } catch { setMessage('ההעתקה לא הצליחה — סמני והעתיקי ידנית.'); } };

  return <details className="mt-5 rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
    <summary className="cursor-pointer font-bold text-sm">חיבור ל-ChatGPT</summary>
    <p className="text-xs text-muted mt-2">GPT בשם "Likelink Content Studio" שכותב טיוטות מהמוצרים שלך ושומר אותן כאן. הוא לא יכול לפרסם או לאשר.</p>
    <ol className="text-xs text-muted mt-1 list-decimal pe-4 space-y-0.5">
      <li>יוצרים כאן מפתח ומעתיקים אותו.</li>
      <li>ב-ChatGPT: ‏Explore GPTs ← Create ← Configure ← Actions ← Import from URL: <span dir="ltr">https://likelink2.vercel.app/api/gpt/openapi.json</span></li>
      <li>‏Authentication ← API Key ← Bearer ← מדביקים את המפתח. ‏Privacy Policy: <span dir="ltr">https://likelink2.vercel.app/legal/privacy</span></li>
    </ol>
    {status && !status.apiAccess && <p className="text-xs mt-2" role="status">החיבור ל-ChatGPT כלול במסלול Professional.</p>}
    {status?.apiAccess && <div className="mt-2 text-xs space-y-2">
      <button disabled={busy} onClick={create} className="tap rounded-lg px-3 py-1.5 font-bold" style={{ background: 'var(--accent)', color: 'white' }}>יצירת מפתח</button>
      {fresh && <div className="rounded-lg p-2 border" style={{ borderColor: 'var(--accent)' }} role="status">
        <p className="font-bold">המפתח החדש — מוצג פעם אחת בלבד:</p>
        <code className="block break-all mt-1" dir="ltr">{fresh}</code>
        <div className="flex gap-3 mt-1"><button className="tap underline" onClick={() => copy(fresh)}>העתקה</button><button className="tap underline" onClick={() => setFresh('')}>שמרתי, להסתיר</button></div>
        <p className="text-muted mt-1">ב-ChatGPT: Actions → Authentication → API Key → Bearer. אל תדביקי את המפתח בהוראות של ה-GPT.</p>
      </div>}
      {keys.length > 0 && <ul className="space-y-1">{keys.map((k) => <li key={k.id}>
        <span dir="ltr">{k.prefix}…</span> · נוצר {new Date(k.createdAt).toLocaleDateString('he-IL')}{k.lastUsedAt ? ` · שימוש אחרון ${new Date(k.lastUsedAt).toLocaleDateString('he-IL')}` : ''}
        {k.revokedAt ? ' · בוטל' : <button className="tap underline mx-2" disabled={busy} onClick={() => revoke(k.id)}>ביטול</button>}
      </li>)}</ul>}
    </div>}
    {drafts.length > 0 && <div className="mt-3">
      <p className="font-bold text-xs">טיוטות מ-ChatGPT</p>
      <ul className="mt-1 space-y-2">{drafts.map((d) => <li key={d.id} className="rounded-lg p-2 border text-xs" style={{ borderColor: 'var(--border)' }}>
        <p className="font-bold">{d.channel} · {d.status === 'DRAFT' ? 'טיוטה' : 'אושרה לפרסום ידני'} · {new Date(d.createdAt).toLocaleDateString('he-IL')}</p>
        <pre className="whitespace-pre-wrap mt-1 font-sans">{d.caption}</pre>
        <p className="text-muted mt-1">{d.aiLabel}</p>
        <div className="flex gap-3 mt-1">
          <button className="tap underline" onClick={() => copy(d.caption)}>העתקת הכיתוב</button>
          {d.status === 'DRAFT' && <button className="tap underline" disabled={busy} onClick={() => approve(d.id)}>אישור לפרסום ידני</button>}
        </div>
      </li>)}</ul>
    </div>}
    {message && <p role="status" className="text-xs mt-2">{message}</p>}
  </details>;
}
