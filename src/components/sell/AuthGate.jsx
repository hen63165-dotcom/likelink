// The Studio's sign-up / sign-in form. Used by the Studio entrance
// (StudioEntrance) and by the seller view when no studio is signed in.
// Consent: the legal pack (required, 18+) and marketing (optional, separate — 30א).
import React, { useState } from "react";
import { TrendingUp, Eye, EyeOff, CircleAlert } from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { Button, LabeledInput } from "../ui";
import { resetPassword, authConfigured, getSessionToken } from "../../lib/auth.js";
import { CLOUD_PAUSED_HE, isCloudUnavailable, snapshotTakenAt } from "../../lib/catalogSnapshot.js";
import { rememberSignupConsent, flushSignupConsent } from "../../lib/legalConsent.js";
import { LEGAL_VERSION, legalPath } from "../../lib/legal/catalog.js";
import { trackFunnel } from "../../lib/funnel.js";
import { withBase } from "../../lib/basePath.js";

export default function AuthGate({ marketers, onLogin, onSignup }) {
  const { t } = useI18n();
  const [mode, setMode] = useState("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  // Success/info messages are shown separately — never in the red error style.
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Signup consent: the legal pack (required, 18+) and marketing (optional, separate — 30א).
  const [agreed, setAgreed] = useState(false);
  const [marketing, setMarketing] = useState(false);

  async function submit() {
    if (submitting) return;
    setErr("");
    setNotice("");
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return setErr(t("auth.errEmail"));
    if (password.trim().length < 6) return setErr(t("auth.errPassword"));
    if (mode === "signup" && !name.trim()) return setErr(t("auth.errName"));
    if (mode === "signup" && !agreed) return setErr("כדי לפתוח סטודיו יש לאשר את תנאי השימוש ומדיניות הפרטיות, ולהצהיר על גיל 18 ומעלה.");
    if (mode === "signup") rememberSignupConsent({ marketing });
    setSubmitting(true);
    try {
      const result = mode === "signup" ? await onSignup(name.trim(), cleanEmail, password.trim()) : await onLogin(cleanEmail, password.trim());
      // Record the consent (version + time) as soon as a verified session exists.
      if (result?.ok !== false) getSessionToken().then((tok) => flushSignupConsent(tok)).catch(() => {});
      if (result?.ok !== false) trackFunnel(result?.needsConfirmation ? "signup_confirm_sent" : mode === "signup" ? "signup_completed" : "login_completed", mode);
      if (result?.needsConfirmation) {
        setMode("login");
        setNotice("✓ נשלח אליך מייל לאימות הכתובת. אשרי אותו ואז התחברי כאן — הסטודיו יחכה לך.");
      } else if (result?.ok === false) {
        if (result.error === "EMAIL_ALREADY_REGISTERED") setErr("הכתובת כבר רשומה והסיסמה לא תואמת. עברי ל«כניסה» או השתמשי ב«שכחתי סיסמה».");
        else if (result.error === "STUDIO_EMAIL_ALREADY_LINKED") setErr("לכתובת הזו כבר קיים סטודיו. עברי ל«כניסה» כדי להמשיך.");
        else if (isCloudUnavailable(result.error)) setErr(CLOUD_PAUSED_HE);
        else setErr(result.error || t(mode === "signup" ? "auth.errPassword" : "auth.errLogin"));
      }
    } catch (e) {
      setErr(isCloudUnavailable(e) ? CLOUD_PAUSED_HE : "אירעה שגיאה מאובטחת בתהליך. נסי שוב.");
    } finally {
      setSubmitting(false);
    }
  }

  const handleForgot = async () => {
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return setErr(t("auth.errEmail"));
    if (!authConfigured) return setErr("שירות האימות אינו מוגדר כרגע.");
    setSubmitting(true);
    setErr("");
    setNotice("");
    try {
      const res = await resetPassword(cleanEmail);
      if (!res.ok) {
        if (isCloudUnavailable(res.error)) return setErr(CLOUD_PAUSED_HE);
        const msg = String(res.error || "").toLowerCase();
        if (msg.includes("rate") || msg.includes("too many")) return setErr("נשלחו יותר מדי בקשות. נסי שוב בעוד כמה דקות.");
        return setErr("לא ניתן לשלוח כרגע איפוס סיסמה. בדקי את הכתובת ונסי שוב.");
      }
      return setNotice("✓ אם קיים חשבון עם הכתובת הזו, נשלח אליו קישור לאיפוס סיסמה. בדקי את תיבת הדואר (גם בספאם).");
    } catch {
      setErr("לא ניתן לשלוח כרגע איפוס סיסמה. נסי שוב.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pt-8 flex flex-col items-center text-center px-2">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: "var(--accent-subtle)" }}>
        <TrendingUp size={28} style={{ color: "var(--accent)" }} />
      </div>
      <p className="disp text-xl font-semibold">{t("auth.title")}</p>
      <p className="text-sm text-muted mt-2 max-w-[300px]">{t("auth.subtitle")}</p>
      {/* The catalog came from the shipped copy: the cloud is not answering, so say so before anyone fills the form. */}
      {snapshotTakenAt() && (
        <p role="status" className="w-full mt-5 rounded-xl px-3.5 py-3 text-xs leading-5 text-right surface-subtle" dir="rtl">{CLOUD_PAUSED_HE}</p>
      )}
      <div className="w-full mt-6 flex rounded-full p-1 surface-subtle">
        {["signup", "login"].map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setErr(""); setNotice(""); }}
            className="tap flex-1 py-2 rounded-full text-sm font-semibold transition-colors"
            style={{
              background: mode === m ? "var(--bg-elevated)" : "transparent",
              color: mode === m ? "var(--text)" : "var(--text-muted)",
            }}
          >
            {m === "signup" ? t("auth.createStudio") : t("auth.login")}
          </button>
        ))}
      </div>
      <div className="w-full mt-5 flex flex-col gap-3 text-left">
        {mode === "signup" && <LabeledInput label={t("auth.yourName")} value={name} onChange={setName} placeholder={t("auth.yourNamePh")} />}
        <LabeledInput
          label={t("auth.email")}
          value={email}
          onChange={(value) => { setEmail(value); if (err) setErr(""); }}
          placeholder={t("auth.emailPh")}
          type="email"
          autoComplete="email"
          inputMode="email"
/>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-secondary">{t("auth.password")}</span>
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("auth.passwordPh")}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              inputMode="text"
              spellCheck={false}
              className="input-field w-full px-3.5 py-2.5 text-sm pe-10"
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              aria-label={showPw ? "הסתרת הסיסמה" : "הצגת הסיסמה"}
              className="tap absolute inset-y-0 end-2 flex items-center px-2 text-muted"
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {mode === "login" && (
            <button type="button" onClick={handleForgot} className="tap self-end text-[11px] font-medium" style={{ color: "var(--accent)" }}>
              {t("auth.forgot")}
            </button>
          )}
        </div>
        {mode === "signup" && (
          <div className="flex flex-col gap-2 text-[11px] text-right" dir="rtl">
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
              <span>
                קראתי ואני מסכימה ל<a className="underline" href={withBase(legalPath("terms"))} target="_blank" rel="noreferrer">תנאי השימוש</a>,{" "}
                <a className="underline" href={withBase(legalPath("privacy"))} target="_blank" rel="noreferrer">מדיניות הפרטיות</a> ו
                <a className="underline" href={withBase(legalPath("cancellation"))} target="_blank" rel="noreferrer">מדיניות הביטולים</a> (גרסה <span dir="ltr" className="whitespace-nowrap">{LEGAL_VERSION}</span>), ואני בת 18 ומעלה.
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-0.5" />
              <span>אני רוצה לקבל במייל עדכונים והצעות מ-LikeLink (לא חובה, אפשר להסיר בכל עת).</span>
            </label>
          </div>
        )}
        {err && <p role="alert" className="text-xs flex items-center gap-1" style={{ color: "var(--danger)" }}><CircleAlert size={13} /> {err}</p>}
        {notice && <p role="status" className="text-xs" style={{ color: "var(--success)" }}>{notice}</p>}
        <Button onClick={submit} disabled={submitting}>{mode === "signup" ? t("auth.createBtn") : t("auth.enterBtn")}</Button>
        <p className="text-[11px] text-muted text-center">
          <a className="underline" href={withBase("/pricing")} target="_blank" rel="noreferrer">מסלולים ומחירים</a> · <a className="underline" href={withBase("/legal")} target="_blank" rel="noreferrer">מסמכים משפטיים</a>
        </p>
      </div>
      <p className="text-[11px] text-muted mt-4 max-w-[280px]">{t("auth.note")}</p>
    </div>
  );
}
