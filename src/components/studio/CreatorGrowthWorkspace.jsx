import React, { useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, FileText, Link2, Sparkles, Users } from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { Button, EmptyState, LabeledInput, LabeledTextarea } from "../ui/index.jsx";
import { buildPromotionMessage, buildPromotionShareLink, getPromotionDrafts, getPromotionGoal, PROMOTION_GOALS, PROMOTION_STATUS, savePromotionDraft, savePromotionStatus } from "../../lib/creatorGrowth.js";
import { recordActivity } from "../../lib/studioActivity.js";
import { trackAcquisition, trackSiteEvent } from "../../lib/acquisitionTrack.js";

function statusLabel(status, he) {
  return status === PROMOTION_STATUS.APPROVED ? (he ? "מאושר לשיתוף" : "Approved to share") : status === PROMOTION_STATUS.READY_TO_SHARE ? (he ? "מוכן לשיתוף" : "Ready to share") : (he ? "טיוטה" : "Draft");
}

export default function CreatorGrowthWorkspace({ onNavigate }) {
  const { lang } = useI18n(); const he = lang === "he";
  const { currentMarketer: marketer, products = [], showToast } = useMarketplace();
  const mine = useMemo(() => products.filter((p) => p?.marketerId === marketer?.id && p.status === "approved"), [products, marketer]);
  const [drafts, setDrafts] = useState([]); const [productId, setProductId] = useState(""); const [goalId, setGoalId] = useState(PROMOTION_GOALS[2].id);
  const [channels, setChannels] = useState(["whatsapp"]); const [copy, setCopy] = useState(""); const [cta, setCta] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => setDrafts(getPromotionDrafts(marketer?.id)), [marketer?.id]);
  const selected = mine.find((p) => p.id === productId) || mine[0] || null; const preview = selected ? buildPromotionMessage({ product: selected, goalId, copy, cta }) : "";
  function toggleChannel(channel) { setChannels((current) => current.includes(channel) ? current.filter((value) => value !== channel) : [...current, channel]); }
  function prepare() {
    if (!selected || !marketer) return; setBusy(true);
    const draft = savePromotionDraft({ marketer, product: selected, goalId, channels, copy, cta });
    if (!draft) { setBusy(false); showToast(he ? "לא ניתן לשמור טיוטה" : "Could not save draft"); return; }
    const ready = savePromotionStatus(draft, PROMOTION_STATUS.READY_TO_SHARE) || draft; setDrafts(getPromotionDrafts(marketer.id)); setBusy(false);
    recordActivity("ugc_created", he ? "הכנת פרסום יוצר" : "Prepared creator promotion", { productId: selected.id, goalId });
    trackAcquisition("content_view", he ? "נפתח טיוטת שיווק" : "Opened promotion draft", { page: "/studio/self-marketing", productId: selected.id, marketerId: marketer.id });
    showToast(he ? "הטיוטה מוכנה לבדיקה" : "Draft ready for review");
  }
  function approve(draft) { const next = savePromotionStatus(draft, PROMOTION_STATUS.APPROVED); if (!next) return; setDrafts(getPromotionDrafts(marketer.id)); recordActivity("ugc_shared", he ? "אושר פרסום לשיתוף" : "Promotion approved to share", { productId: draft.productId }); showToast(he ? "מוכן לשיתוף ידני" : "Ready for manual sharing"); }
  async function share(draft, channel) {
    const link = buildPromotionShareLink(draft, channel); if (!link) return;
    trackSiteEvent("share_started", { page: "/studio/self-marketing", productId: draft.productId, marketerId: marketer.id, target: channel });
    recordActivity("ugc_shared", he ? `שיתוף הוכן ב-${channel}` : `Promotion prepared for ${channel}`, { productId: draft.productId, target: channel });
    if (channel === "native" && typeof navigator !== "undefined" && navigator.share) { try { await navigator.share({ title: draft.productTitle, text: buildPromotionMessage({ product: { title: draft.productTitle }, goalId: draft.goalId, copy: draft.copy, cta: draft.cta }), url: draft.canonicalUrl }); trackSiteEvent("share_completed", { page: "/studio/self-marketing", productId: draft.productId, marketerId: marketer.id, target: "native" }); } catch {} return; }
    if (channel === "copy") { try { await navigator.clipboard.writeText(draft.canonicalUrl); trackSiteEvent("share_completed", { page: "/studio/self-marketing", productId: draft.productId, marketerId: marketer.id, target: "copy" }); showToast(he ? "הקישור הועתק" : "Link copied"); } catch { showToast(draft.canonicalUrl); } return; }
  }

  if (!marketer) return <EmptyState icon={Users} title={he ? "פתחי חשבון יוצר כדי להתחיל" : "Open a creator account to begin"} body={he ? "הפרסום נשמר לחשבון ולמכשיר שלך. אין כאן נתוני יצירה מומצאים." : "Your promotion is saved to your account and this device. No creator records are invented."} action={<Button onClick={() => onNavigate?.("products")}>{he ? "מתחברות / הרשמה" : "Sign in / register"}</Button>} />;
  return (
    <div className="space-y-4" data-testid="creator-growth-workspace">
      <div className="ll-card overflow-hidden rounded-2xl p-5">
        <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}><Sparkles size={19} /></div><div className="min-w-0"><h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>{he ? "פרסום וקידום עצמי" : "Self-promotion studio"}</h3><p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>{he ? "בחרי מוצר אמיתי, כתבי קשר, בדקי את הפרסום ואז שתפי. LikeLink2 לא מפרסמת עברך ללא אישור." : "Choose a real product, write the angle, approve it, then share. LikeLink2 never publishes on your behalf without approval."}</p></div></div>
        {mine.length === 0 ? <div className="mt-4"><EmptyState icon={FileText} title={he ? "עדיין אין מוצר מאושר לקידום" : "No approved product to promote"} body={he ? "הוסיפי מוצר אמיתי ומאושר כדי לבנות קידום מדויק." : "Add a real approved product to build a promotion."} action={<Button variant="secondary" onClick={() => onNavigate?.("products")}>{he ? "מוצרים" : "Open products"}</Button>} /></div> : <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{he ? "מוצר" : "Product"}<select value={selected?.id || ""} onChange={(event) => setProductId(event.target.value)} className="input-field mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm" style={{ background: "var(--bg-subtle)", color: "var(--text)" }}>{mine.map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}</select></label><label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{he ? "מטרת הפרסום" : "Promotion goal"}<select value={goalId} onChange={(event) => setGoalId(event.target.value)} className="input-field mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm" style={{ background: "var(--bg-subtle)", color: "var(--text)" }}>{PROMOTION_GOALS.map((item) => <option key={item.id} value={item.id}>{he ? item.he : item.en}</option>)}</select></label></div>
          <LabeledTextarea label={he ? "קשר / Hook" : "Hook / copy"} value={copy} onChange={setCopy} placeholder={he ? "כתבי כאן מה חשוב לדעת על המוצר" : "Write the useful angle for this product"} /><LabeledInput label={he ? "קריאה לפעולה" : "Call to action"} value={cta} onChange={setCta} placeholder={he ? "למשל: לבדיקת המוצר" : "e.g. Check the product"} />
          <div><p className="mb-2 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{he ? "ערוצים להכנה" : "Channels to prepare"}</p><div className="flex flex-wrap gap-2">{["native", "copy", "whatsapp", "telegram", "x"].map((channel) => <button key={channel} type="button" onClick={() => toggleChannel(channel)} className="ll-tap rounded-full px-3 py-2 text-xs font-bold" style={{ background: channels.includes(channel) ? "var(--accent-subtle)" : "var(--bg-subtle)", color: channels.includes(channel) ? "var(--accent)" : "var(--text-muted)" }}>{channel}</button>)}</div></div>
          <div className="rounded-xl p-4" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}><p className="mb-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>{he ? "תצוגה מקדימה" : "Preview"}</p><p className="whitespace-pre-wrap text-sm" style={{ color: "var(--text)" }}>{preview || (he ? "הקלדי קשר כדי לראות תצוגה." : "Add copy to see the preview.")}</p></div><Button onClick={prepare} disabled={busy || !preview}>{busy ? (he ? "שומר…" : "Saving…") : (he ? "הכנת פרסום" : "Prepare promotion")}</Button>
        </div>}
      </div>
      <div className="ll-card rounded-2xl p-5">
        <div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="text-base font-bold" style={{ color: "var(--text)" }}>{he ? "הפרסומים שלך" : "Your promotions"}</h3><p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{he ? "סטטוס מקומי ואמין. שיתוף חיצוני מתרחש רק באישורך." : "Local, truthful state. External sharing happens only after approval."}</p></div><span className="text-xs" style={{ color: "var(--text-faint)" }}>{drafts.length}</span></div>
        {drafts.length === 0 ? <p className="text-sm" style={{ color: "var(--text-muted)" }}>{he ? "הכנת פרסום ראשון כדי לראות אותו כאן." : "Prepare your first promotion to see it here."}</p> : <div className="space-y-3">{drafts.map((draft) => <div key={draft.id} className="rounded-xl p-3" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-bold" style={{ color: "var(--text)" }}>{draft.productTitle}</p><p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{he ? getPromotionGoal(draft.goalId).he : getPromotionGoal(draft.goalId).en} · {statusLabel(draft.status, he)}</p></div>{draft.status !== PROMOTION_STATUS.APPROVED && <Button variant="secondary" className="!w-auto !py-2" onClick={() => approve(draft)}><Check size={14} /> {he ? "אישור" : "Approve"}</Button>}</div><p className="mt-3 text-xs" dir="ltr" style={{ color: "var(--accent)" }}>{draft.canonicalUrl}</p><div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" className="!w-auto !py-2" onClick={() => share(draft, "copy")}><Link2 size={14} /> {he ? "העתק קישור" : "Copy link"}</Button>{draft.channels.filter((channel) => channel !== "copy").map((channel) => <Button key={channel} variant="secondary" className="!w-auto !py-2" onClick={() => share(draft, channel)}><ExternalLink size={14} /> {channel}</Button>)}</div></div>)}</div>}
      </div>
    </div>
  );
}

