/**
 * StorefrontDesign — "עיצוב החנות שלי": edit exactly the fields the public
 * store page really renders (name, photo, bio, social links) plus the share
 * link. Nothing is saved that the public page does not show, and the preview
 * mirrors the real creator page.
 */
import React, { useMemo, useState } from "react";
import { Copy, ExternalLink, Check, CircleAlert, LayoutTemplate, Store } from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { Button, LabeledInput, LabeledTextarea } from "../ui/index.jsx";
import { uploadProductImage, safePreviewSrc, safeHref } from "../../lib/uploadImage.js";
import { isSafeImageUrl, DEFAULT_PRODUCT_IMAGE } from "../../utils/helpers.js";
import { withBase } from "../../lib/basePath.js";

const SOCIAL_KEYS = ["instagram", "tiktok", "youtube", "facebook", "x"];

export default function StorefrontDesign({ onNavigate }) {
  const { lang } = useI18n();
  const he = lang === "he";
  const { currentMarketer: marketer, products, showToast, onUpdateMarketer } = useMarketplace();

  const [form, setForm] = useState({
    name: marketer?.name || "",
    bio: marketer?.bio || "",
    image: marketer?.avatar || marketer?.avatarUrl || "",
    socials: { ...(marketer?.socialLinks || {}) },
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  const set = (k) => (v) => setForm((s) => ({ ...s, [k]: v }));

  const mine = useMemo(
    () => (products || []).filter((p) => p.marketerId === marketer?.id),
    [products, marketer]
  );
  const published = mine.filter((p) => p.status === "approved");
  const storeUrl = marketer?.slug ? `${window.location.origin}${withBase(`/u/${marketer.slug}`)}` : "";

  async function save() {
    setErr("");
    if (!form.name.trim()) return setErr(he ? "שם החנות חובה." : "A store name is required.");
    if (form.image && !isSafeImageUrl(form.image)) return setErr(he ? "כתובת התמונה לא תקינה." : "The image address is not valid.");
    for (const k of SOCIAL_KEYS) {
      const v = String(form.socials[k] || "").trim();
      if (v && !safeHref(v)) return setErr(he ? `הכתובת של ${k} לא תקינה — אפשר להשאיר ריק.` : `The ${k} address is not valid — or leave it empty.`);
    }
    setSaving(true);
    try {
      const socials = {};
      for (const k of SOCIAL_KEYS) {
        const v = String(form.socials[k] || "").trim();
        if (v) socials[k] = v;
      }
      await onUpdateMarketer(marketer.id, {
        name: form.name.trim().slice(0, 60),
        bio: form.bio.trim().slice(0, 500),
        avatar: form.image.trim().slice(0, 2000),
        socialLinks: socials,
      });
      setSaved(true);
      showToast?.(he ? "החנות עודכנה" : "Store updated");
    } catch (e) {
      console.error("[StorefrontDesign] save failed", e);
      setErr(he ? "השמירה נכשלה — בדקי את החיבור ונסי שוב." : "Saving failed — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      set("image")(await uploadProductImage(file));
      setSaved(false);
    } catch {
      setErr(he ? "התמונה לא הועלתה — אפשר להדביק כתובת תמונה." : "The image did not upload — you can paste an image URL.");
    }
  }

  async function copyStore() {
    try {
      await navigator.clipboard.writeText(storeUrl);
      showToast?.(he ? "הקישור הועתק" : "Link copied");
    } catch {
      showToast?.(storeUrl);
    }
  }

  if (!marketer) {
    return (
      <div className="ll-card rounded-3xl p-6 text-center">
        <h2 className="text-lg font-extrabold" style={{ color: "var(--text)" }}>
          {he ? "עיצוב החנות דורש סטודיו" : "Designing a store needs a studio"}
        </h2>
        <Button className="mt-4" onClick={() => onNavigate?.("products")}>{he ? "להרשמה / התחברות" : "Sign up / Sign in"}</Button>
      </div>
    );
  }

  return (
    <div dir={he ? "rtl" : "ltr"} className="space-y-5 max-w-2xl">
      {/* Editor */}
      <section className="ll-card rounded-3xl p-5 sm:p-6">
        <p className="flex items-center gap-1.5 text-xs font-bold" style={{ color: "var(--accent)" }}>
          <LayoutTemplate size={14} /> {he ? "העמוד הציבורי שלך" : "Your public page"}
        </p>
        <h2 className="mt-1 text-lg font-extrabold" style={{ color: "var(--text)" }}>
          {he ? "עיצוב החנות שלי" : "Design my store"}
        </h2>
        <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-secondary)" }}>
          {he
            ? "השדות כאן הם בדיוק מה שמוצג בעמוד החנות הציבורי. שינוי יתעדכן מיד לכל מי שיפתח את הקישור."
            : "These fields are exactly what your public store page shows. Changes take effect for everyone who opens your link."}
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <LabeledInput label={he ? "שם החנות (חובה)" : "Store name (required)"} value={form.name} onChange={set("name")} />
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
                {he ? "העלאה מהמכשיר" : "Upload from device"}
                <input type="file" accept="image/*" onChange={uploadAvatar} className="hidden" />
              </label>
            </div>
            <input value={form.image} onChange={(e) => set("image")(e.target.value)} dir="ltr" placeholder={he ? "או הדביקו כתובת תמונה" : "Or paste an image URL"} className="input-field w-full px-3.5 py-2.5 text-xs" />
          </div>
          <LabeledTextarea label={he ? "תיאור (bio)" : "Bio"} value={form.bio} onChange={set("bio")} placeholder={he ? "משפט אחד עלייך ועל מה את ממליצה" : "One line about you and what you recommend"} />
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
        </div>

        {err && (
          <p className="mt-3 flex items-start gap-1.5 text-xs font-semibold" style={{ color: "var(--danger)" }} role="alert">
            <CircleAlert size={14} className="mt-0.5 shrink-0" /> {err}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={saving}>
            {saved ? <Check size={14} /> : null}
            {saving ? (he ? "שומרת…" : "Saving…") : (he ? "שמירה והצגה" : "Save & show")}
          </Button>
          {storeUrl && (
            <Button variant="secondary" onClick={() => window.open(withBase(`/u/${marketer.slug}`), "_blank", "noopener")}>
              <ExternalLink size={14} /> {he ? "פתיחת החנות" : "Open store"}
            </Button>
          )}
        </div>
      </section>

      {/* Preview + share */}
      <section className="ll-card rounded-3xl p-5 sm:p-6">
        <h3 className="text-sm font-extrabold" style={{ color: "var(--text)" }}>
          {he ? "ככה החנות נראית" : "This is how the store looks"}
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
              {mine.length} {he ? "מוצרים" : "products"} · {published.length} {he ? "פורסמו" : "published"}
            </p>
            {form.bio && <p className="mt-1.5 text-xs leading-5" style={{ color: "var(--text-secondary)" }}>{form.bio}</p>}
            {SOCIAL_KEYS.filter((k) => safeHref(form.socials[k])).length > 0 && (
              <p className="mt-1.5 flex flex-wrap gap-2 text-[11px]" style={{ color: "var(--accent)" }}>
                {SOCIAL_KEYS.filter((k) => safeHref(form.socials[k])).map((k) => (
                  <a key={k} href={safeHref(form.socials[k])} target="_blank" rel="nofollow noopener noreferrer" className="underline">{k}</a>
                ))}
              </p>
            )}
          </div>
        </div>

        {published.length === 0 && (
          <p className="mt-3 rounded-xl px-3.5 py-3 text-xs leading-5" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
            {he
              ? "אין עדיין מוצר פורסם — עד אז החנות לא מוצגת לציבור. הוסיפי קישור אפילייט אחד ופרסמי."
              : "No published product yet — until then the store is not shown publicly. Add one affiliate link and publish it."}
          </p>
        )}
        {storeUrl && (
          <div className="mt-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
              <Store size={14} className="shrink-0" style={{ color: "var(--accent)" }} />
              <code className="min-w-0 flex-1 truncate text-xs" dir="ltr" style={{ color: "var(--text)" }}>{storeUrl}</code>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={copyStore}><Copy size={14} /> {he ? "העתקת הקישור" : "Copy link"}</Button>
              {published[0] && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    const text = `${window.location.origin}${withBase(`/p/${published[0].id}`)}`;
                    navigator.clipboard?.writeText(text).then(() => showToast?.(he ? "קישור המוצר הועתק" : "Product link copied")).catch(() => showToast?.(text));
                  }}
                >
                  <Copy size={14} /> {he ? "העתקת קישור מוצר" : "Copy product link"}
                </Button>
              )}
              <Button variant="secondary" onClick={() => onNavigate?.("add-product")}>
                {he ? "הוספת מוצר" : "Add product"}
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
