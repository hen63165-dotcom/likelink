/**
 * StudioOnboarding — the guided "פתיחת סטודיו" flow (5 real steps):
 *   1. account type (creator / affiliate marketer / seller)
 *   2. store name, photo, description and social links
 *   3. the first product — paste the affiliate link (the real AddProductLink)
 *   4. preview of the public store
 *   5. publish + copy the personal link to share
 *
 * Everything is saved to the creator's REAL studio record through
 * onUpdateMarketer / onAddProduct — nothing here is local-only, and no step
 * asks for payment before the creator understands what the product does.
 */
import React, { useMemo, useState } from "react";
import {
  UserRound, Megaphone, Store, Check, ChevronLeft, ChevronRight, Copy,
  ExternalLink, Sparkles, Link2, Image as ImageIcon,
} from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { Button, LabeledInput, LabeledTextarea } from "../ui/index.jsx";
import { uploadProductImage, safePreviewSrc, safeHref } from "../../lib/uploadImage.js";
import { isSafeImageUrl, DEFAULT_PRODUCT_IMAGE } from "../../utils/helpers.js";
import { withBase } from "../../lib/basePath.js";
import AddProductLink from "./AddProductLink.jsx";

const ACCOUNT_TYPES = [
  { id: "creator", icon: UserRound, he: { title: "יוצר /ת תוכן", body: "ממליצה על מוצרים בסרטונים ותוכן, ורוצה קישור שעוקב אחרי כל קליק." }, en: { title: "Content creator", body: "Recommends products in videos and content, wants a link that tracks every click." } },
  { id: "affiliate", icon: Megaphone, he: { title: "משווק /ת אפילייט", body: "מפרסמת קישורים של רשתות שותפים ורוצה לראות ביצועים לפי מוצר." }, en: { title: "Affiliate marketer", body: "Publishes affiliate-network links and wants performance per product." } },
  { id: "seller", icon: Store, he: { title: "מוכר /ת", body: "יש לי מוצרים משלי ורוצה חנות בעמוד אחד עם קישורים ומדדים." }, en: { title: "Seller", body: "I have my own products and want one store page with links and metrics." } },
];

const SOCIAL_KEYS = ["instagram", "tiktok", "youtube", "facebook", "x"];

export default function StudioOnboarding({ onDone }) {
  const { lang } = useI18n();
  const he = lang === "he";
  const { currentMarketer: marketer, products, showToast, onUpdateMarketer } = useMarketplace();

  const initialStep = Number(marketer?.studioOnboarding?.step) > 0 ? Number(marketer.studioOnboarding.step) : 1;
  const [step, setStep] = useState(initialStep);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [firstSaved, setFirstSaved] = useState(null);
  const [form, setForm] = useState({
    name: marketer?.name || "",
    bio: marketer?.bio || "",
    image: marketer?.avatar || marketer?.avatarUrl || "",
    accountType: marketer?.accountType || "",
    socials: { ...(marketer?.socialLinks || {}) },
  });
  const set = (k) => (v) => setForm((s) => ({ ...s, [k]: v }));

  const myProducts = useMemo(
    () => (products || []).filter((p) => p.marketerId === marketer?.id),
    [products, marketer]
  );
  const published = myProducts.filter((p) => p.status === "approved");
  const storeUrl = marketer?.slug ? `${window.location.origin}${withBase(`/u/${marketer.slug}`)}` : "";
  const stepsHe = ["סוג החנות", "פרטי החנות", "המוצר הראשון", "תצוגה מקדימה", "פרסום ושיתוף"];
  const stepsEn = ["Store type", "Store details", "First product", "Preview", "Publish & share"];

  async function persistStep(nextStep, extra = {}) {
    setSaving(true);
    setErr("");
    try {
      await onUpdateMarketer(marketer.id, {
        ...extra,
        studioOnboarding: { ...(marketer.studioOnboarding || {}), step: nextStep },
      });
      setStep(nextStep);
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
      return true;
    } catch (e) {
      console.error("[StudioOnboarding] save failed", e);
      setErr(he ? "השמירה נכשלה — בדקי את החיבור ונסי שוב." : "Saving failed — check your connection and try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function validateCurrent() {
    if (step === 1 && !form.accountType) {
      setErr(he ? "בחרי את סוג החנות כדי להמשיך." : "Choose your store type to continue.");
      return false;
    }
    if (step === 2) {
      if (!form.name.trim()) { setErr(he ? "שם החנות חובה." : "A store name is required."); return false; }
      if (form.image && !isSafeImageUrl(form.image)) { setErr(he ? "כתובת התמונה לא תקינה." : "The image address is not valid."); return false; }
      for (const k of SOCIAL_KEYS) {
        const v = String(form.socials[k] || "").trim();
        if (v && !safeHref(v)) {
          setErr(he ? `הכתובת של ${k} לא תקינה — אפשר להשאיר ריק.` : `The ${k} address is not valid — or leave it empty.`);
          return false;
        }
      }
    }
    // A saved draft is not a public product: step 4 shares the store, so it needs one that is published.
    if (step === 3 && published.length === 0 && firstSaved?.status !== "approved") {
      setErr(he
        ? "צריך מוצר ראשון מפורסם כדי להמשיך. טיוטה נשמרת, אבל לא מופיעה בחנות."
        : "Publish your first product to continue. A draft is saved but does not appear in the store.");
      return false;
    }
    setErr("");
    return true;
  }

  function detailsPatch() {
    const socials = {};
    for (const k of SOCIAL_KEYS) {
      const v = String(form.socials[k] || "").trim();
      if (v) socials[k] = v;
    }
    return {
      name: form.name.trim().slice(0, 60),
      bio: form.bio.trim().slice(0, 500),
      avatar: form.image.trim().slice(0, 2000),
      socialLinks: socials,
    };
  }

  async function next() {
    if (!validateCurrent()) return;
    if (step === 2) {
      await persistStep(3, detailsPatch());
      return;
    }
    if (step === 5) {
      await finish();
      return;
    }
    // Step 1's choice is kept now, so a creator who leaves and comes back finds it.
    await persistStep(step + 1, step === 1 ? { accountType: form.accountType } : {});
  }

  async function finish() {
    setSaving(true);
    setErr("");
    try {
      await onUpdateMarketer(marketer.id, {
        ...detailsPatch(),
        accountType: form.accountType || marketer?.accountType || "",
        studioOnboarding: { ...(marketer.studioOnboarding || {}), step: 5, doneAt: Date.now() },
      });
      showToast?.(he ? "הסטודיו מוכן 🎉" : "Your studio is ready 🎉");
      onDone?.();
    } catch (e) {
      console.error("[StudioOnboarding] finish failed", e);
      setErr(he ? "השמירה נכשלה — נסי שוב." : "Saving failed — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function skip() {
    try {
      await onUpdateMarketer(marketer.id, { studioOnboarding: { ...(marketer.studioOnboarding || {}), skippedAt: Date.now() } });
    } catch { /* leaving the wizard either way */ }
    onDone?.();
  }

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      showToast?.(label || (he ? "ההעתקה הושלמה" : "Copied"));
    } catch {
      showToast?.(text);
    }
  }

  async function uploadAvatar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      set("image")(await uploadProductImage(file));
    } catch {
      setErr(he ? "התמונה לא הועלתה — אפשר להדביק כתובת תמונה." : "The image did not upload — you can paste an image URL.");
    }
  }

  if (!marketer) return null;

  return (
    <div dir={he ? "rtl" : "ltr"} className="mx-auto max-w-2xl space-y-4">
      {/* Header + progress */}
      <section className="ll-card rounded-3xl p-5 sm:p-6">
        <p className="flex items-center gap-1.5 text-xs font-bold" style={{ color: "var(--accent)" }}>
          <Sparkles size={14} /> {he ? "פתיחת סטודיו · 5 צעדים" : "Open your studio · 5 steps"}
        </p>
        <h2 className="mt-1.5 text-xl sm:text-2xl font-extrabold leading-snug" style={{ color: "var(--text)" }}>
          {he ? "כל מה שצריך כדי להתחיל — בלי לנחש" : "Everything you need to start — no guessing"}
        </h2>
        <ol className="mt-4 flex flex-wrap gap-1.5" aria-label={he ? "התקדמות" : "Progress"}>
          {(he ? stepsHe : stepsEn).map((label, i) => {
            const n = i + 1;
            const state = n < step ? "done" : n === step ? "now" : "todo";
            return (
              <li
                key={label}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold"
                style={{
                  background: state === "now" ? "var(--accent-subtle)" : "var(--bg-subtle)",
                  color: state === "done" ? "var(--success)" : state === "now" ? "var(--accent)" : "var(--text-faint)",
                  border: `1px solid ${state === "now" ? "var(--accent)" : "var(--border)"}`,
                }}
                aria-current={state === "now" ? "step" : undefined}
              >
                {state === "done" ? <Check size={12} /> : n}
                {label}
              </li>
            );
          })}
        </ol>
      </section>

      {/* Step 1 — account type */}
      {step === 1 && (
        <section className="ll-card rounded-3xl p-5 sm:p-6">
          <h3 className="text-sm font-extrabold" style={{ color: "var(--text)" }}>
            {he ? "1. מה סוג החנות שלך?" : "1. What kind of store is this?"}
          </h3>
          <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
            {he ? "אפשר לשנות את זה אחר כך." : "You can change this later."}
          </p>
          <div className="mt-3 grid gap-2.5">
            {ACCOUNT_TYPES.map((t) => {
              const Icon = t.icon;
              const active = form.accountType === t.id;
              const copy = he ? t.he : t.en;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => set("accountType")(t.id)}
                  className="ll-tap flex items-start gap-3 rounded-2xl p-4 text-start"
                  style={{
                    background: active ? "var(--accent-subtle)" : "var(--bg-subtle)",
                    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                  }}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: active ? "var(--accent)" : "var(--bg-elevated)", color: active ? "#fff" : "var(--text-secondary)" }}>
                    <Icon size={17} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-extrabold" style={{ color: active ? "var(--accent)" : "var(--text)" }}>{copy.title}</span>
                    <span className="mt-1 block text-[12px] leading-5" style={{ color: "var(--text-secondary)" }}>{copy.body}</span>
                  </span>
                  {active && <Check size={18} className="ms-auto shrink-0" style={{ color: "var(--accent)" }} />}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Step 2 — store details */}
      {step === 2 && (
        <section className="ll-card rounded-3xl p-5 sm:p-6">
          <h3 className="text-sm font-extrabold" style={{ color: "var(--text)" }}>
            {he ? "2. פרטי החנות" : "2. Store details"}
          </h3>
          <div className="mt-3 flex flex-col gap-3">
            <LabeledInput label={he ? "שם החנות (חובה)" : "Store name (required)"} value={form.name} onChange={set("name")} placeholder={he ? "למשל: הבחירות של נועה" : "e.g. Noa's picks"} />
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{he ? "תמונת החנות" : "Store photo"}</span>
              <div className="flex items-center gap-3">
                <img
                  src={safePreviewSrc(form.image, DEFAULT_PRODUCT_IMAGE)}
                  alt=""
                  className="ll-thumb shrink-0 object-cover"
                  style={{ "--thumb": "4rem", "--thumb-r": "999px",  background: "var(--bg-subtle)" }}
                  onError={(e) => { e.currentTarget.src = DEFAULT_PRODUCT_IMAGE; }}
                />
                <label className="ll-tap flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
                  <ImageIcon size={14} /> {he ? "העלאה מהמכשיר" : "Upload from device"}
                  <input type="file" accept="image/*" onChange={uploadAvatar} className="hidden" />
                </label>
              </div>
              <input value={form.image} onChange={(e) => set("image")(e.target.value)} dir="ltr" placeholder={he ? "או הדביקו כתובת תמונה" : "Or paste an image URL"} className="input-field w-full px-3.5 py-2.5 text-xs" />
            </div>
            <LabeledTextarea label={he ? "תיאור החנות" : "Store description"} value={form.bio} onChange={set("bio")} placeholder={he ? "משפט אחד עלייך ועל מה את ממליצה (עד 500 תווים)" : "One line about you and what you recommend (max 500 chars)"} />
            <div className="grid gap-2.5 sm:grid-cols-2">
              {SOCIAL_KEYS.map((k) => (
                <LabeledInput
                  key={k}
                  label={k}
                  value={form.socials[k] || ""}
                  onChange={(v) => setForm((s) => ({ ...s, socials: { ...s.socials, [k]: v } }))}
                  placeholder={`https://${k === "x" ? "x.com" : `${k}.com`}/...`}
                />
              ))}
            </div>
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {he ? "קישורים חברתיים אופציונליים — אפשר להשאיר ריק." : "Social links are optional — leave them empty if you like."}
            </p>
          </div>
        </section>
      )}

      {/* Step 3 — the first product (the real paste-a-link screen) */}
      {step === 3 && (
        <section>
          <p className="mb-3 rounded-xl px-3.5 py-3 text-xs leading-5 ll-card" style={{ color: "var(--text-secondary)" }}>
            {he
              ? "זהו המסך שתשתמשי בו בכל פעם שתרצי להוסיף מוצר. עכשיו — קישור אחד ראשון."
              : "This is the screen you will use whenever you add a product. Start with one link."}
          </p>
          <AddProductLink compact onSaved={(p) => setFirstSaved(p)} />
          {published.length > 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--success)" }}>
              <Check size={14} /> {he ? `יש לך ${published.length} מוצרים פורסמים.` : `You have ${published.length} published products.`}
            </p>
          )}
        </section>
      )}

      {/* Step 4 — preview of the public store */}
      {step === 4 && (
        <section className="ll-card rounded-3xl p-5 sm:p-6">
          <h3 className="text-sm font-extrabold" style={{ color: "var(--text)" }}>
            {he ? "4. תצוגה מקדימה של החנות" : "4. Preview of your store"}
          </h3>
          <div className="mt-3 flex items-start gap-4 rounded-2xl p-4" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
            <img
              src={safePreviewSrc(form.image, DEFAULT_PRODUCT_IMAGE)}
              alt=""
              className="ll-thumb shrink-0 object-cover" style={{ "--thumb": "4rem", "--thumb-r": "999px" }}
              onError={(e) => { e.currentTarget.src = DEFAULT_PRODUCT_IMAGE; }}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold" style={{ color: "var(--text)" }}>{form.name || marketer.name}</p>
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                {myProducts.length} {he ? "מוצרים" : "products"} · {published.length} {he ? "פורסמו" : "published"}
              </p>
              {form.bio && <p className="mt-1.5 text-xs leading-5" style={{ color: "var(--text-secondary)" }}>{form.bio}</p>}
              {SOCIAL_KEYS.filter((k) => form.socials[k]).length > 0 && (
                <p className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]" style={{ color: "var(--accent)" }}>
                  {SOCIAL_KEYS.filter((k) => form.socials[k]).map((k) => <span key={k}>{k}</span>)}
                </p>
              )}
            </div>
          </div>
          <p className="mt-3 text-[11.5px] leading-5" style={{ color: "var(--text-muted)" }}>
            {published.length === 0
              ? (he ? "החנות תופיע לציבור ברגע שתפרסמי את המוצר הראשון." : "Your store becomes public as soon as the first product is published.")
              : (he ? "החנות שלך גלויה בציבור — אפשר לפתוח בחלון חדש לבדוק איך היא נראית." : "Your store is live — open it in a new window to see how it looks.")}
          </p>
          {storeUrl && (
            <Button variant="secondary" className="mt-3" onClick={() => window.open(withBase(`/u/${marketer.slug}`), "_blank", "noopener")}>
              <ExternalLink size={14} /> {he ? "פתיחת תצוגה מקדימה" : "Open preview"}
            </Button>
          )}
        </section>
      )}

      {/* Step 5 — publish + share */}
      {step === 5 && (
        <section className="ll-card rounded-3xl p-5 sm:p-6">
          <h3 className="text-sm font-extrabold" style={{ color: "var(--text)" }}>
            {he ? "5. מוכן לפרסום ושיתוף" : "5. Ready to publish & share"}
          </h3>
          <p className="mt-1.5 text-xs leading-5" style={{ color: "var(--text-secondary)" }}>
            {he
              ? "הקישור האישי הוא החנות שלך — אפשר להעתיק ולהשתף אותו בכל מקום. מוצרים שפרסמת מופיעים בו מיד."
              : "Your personal link is your store — copy it and share it anywhere. Published products appear there immediately."}
          </p>
          {storeUrl && (
            <div className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
              <Link2 size={14} className="shrink-0" style={{ color: "var(--accent)" }} />
              <code className="min-w-0 flex-1 truncate text-xs" dir="ltr" style={{ color: "var(--text)" }}>{storeUrl}</code>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {storeUrl && (
              <Button onClick={() => copy(storeUrl, he ? "הקישור הועתק" : "Link copied")}>
                <Copy size={14} /> {he ? "העתקת הקישור האישי" : "Copy my link"}
              </Button>
            )}
            {published[0] && (
              <Button
                variant="secondary"
                onClick={() => copy(`${window.location.origin}${withBase(`/p/${published[0].id}`)}`, he ? "קישור המוצר הועתק" : "Product link copied")}
              >
                <Copy size={14} /> {he ? "העתקת קישור מוצר" : "Copy a product link"}
              </Button>
            )}
            {storeUrl && (
              <Button variant="secondary" onClick={() => window.open(withBase(`/u/${marketer.slug}`), "_blank", "noopener")}>
                <ExternalLink size={14} /> {he ? "פתיחת החנות" : "Open store"}
              </Button>
            )}
          </div>
        </section>
      )}

      {/* Error + navigation */}
      {err && (
        <p className="rounded-xl px-3.5 py-3 text-xs font-semibold" style={{ color: "var(--danger)" }} role="alert">
          {err}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-4">
        <button
          type="button"
          onClick={skip}
          className="ll-tap text-[11px] font-semibold underline"
          style={{ color: "var(--text-faint)" }}
        >
          {he ? "אמשיך מאוחר" : "I'll do this later"}
        </button>
        <div className="flex items-center gap-2">
          {step > 1 && (
            <Button variant="secondary" onClick={() => { setErr(""); setStep(step - 1); }} disabled={saving}>
              <ChevronRight size={14} /> {he ? "אחורה" : "Back"}
            </Button>
          )}
          <Button onClick={next} disabled={saving}>
            {step === 5 ? (he ? "סיום והתחלה" : "Finish & start") : (he ? "המשך" : "Continue")}
            {step < 5 && <ChevronLeft size={14} />}
          </Button>
        </div>
      </div>
    </div>
  );
}
