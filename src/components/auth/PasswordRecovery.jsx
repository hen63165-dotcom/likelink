import React, { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../../lib/supabaseClient.js";
import { authErrorHe } from "../../lib/errorMessages.js";

// Completes the "forgot password" flow. The reset e-mail link lands on the
// site with a recovery session (#…type=recovery); Supabase then fires
// PASSWORD_RECOVERY. Without this screen the visitor would be signed in but
// never asked for a new password — and locked out again next time.
export default function PasswordRecovery() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured || !supabase) return undefined;
    try {
      if (/type=recovery/.test(window.location.hash || "")) setOpen(true);
    } catch { /* no location */ }
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setOpen(true);
    });
    return () => data?.subscription?.unsubscribe?.();
  }, []);

  async function save() {
    setError("");
    if (password.length < 6) return setError("הסיסמה צריכה להכיל לפחות 6 תווים");
    if (password !== confirm) return setError("שתי הסיסמאות לא זהות");
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(authErrorHe({ error: updateError.message, code: updateError.code }, "עדכון הסיסמה נכשל — נסי שוב"));
        return;
      }
      setDone(true);
      try { window.history.replaceState({}, "", window.location.pathname + window.location.search); } catch { /* ignore */ }
    } catch (e) {
      setError(authErrorHe({ error: e?.message }, "עדכון הסיסמה נכשל — נסי שוב"));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="ll-pw-title" dir="rtl" className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: "rgba(5,8,17,.72)" }}>
      <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: "var(--bg-elevated)", color: "var(--text)", border: "1px solid var(--border)" }}>
        <h2 id="ll-pw-title" className="text-lg font-bold">{done ? "הסיסמה עודכנה" : "בחירת סיסמה חדשה"}</h2>
        {done ? (
          <>
            <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>מעכשיו מתחברים עם הסיסמה החדשה.</p>
            <button type="button" className="tap mt-4 w-full rounded-xl p-2.5 font-bold" style={{ background: "var(--accent)", color: "#fff" }} onClick={() => setOpen(false)}>
              סגירה
            </button>
          </>
        ) : (
          <>
            <label className="mt-3 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              סיסמה חדשה
              <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-field mt-1 w-full px-3 py-2.5 text-sm" />
            </label>
            <label className="mt-3 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              אימות סיסמה
              <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input-field mt-1 w-full px-3 py-2.5 text-sm" />
            </label>
            {error && <p role="alert" className="mt-2 text-xs" style={{ color: "var(--danger)" }}>{error}</p>}
            <button type="button" disabled={busy} onClick={save} className="tap mt-4 w-full rounded-xl p-2.5 font-bold disabled:opacity-60" style={{ background: "var(--accent)", color: "#fff" }}>
              {busy ? "שומרת…" : "שמירת הסיסמה"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
