import React, { useState, lazy, Suspense } from "react";
import {
  TrendingUp, Plus, X, LogOut, Share2, ArrowLeft, ShoppingBag, MousePointerClick,
  DollarSign, Layers, Pencil, Trash2, Check, Rocket, CircleAlert, ImageOff,
  Upload, Loader2, Receipt,
} from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { money, groupByDay, isSafeHttpUrl, isSafeImageUrl, nextPayoutDate, formatDate } from "../../utils/helpers";
import { CATEGORY_KEYS } from "../../lib/i18n";
import { PLATFORM_FEE_PERCENT_DEFAULT, MIN_PAYOUT_THRESHOLD } from "../../constants/keys";
import { uploadProductImage } from "../../lib/uploadImage";
import { getSellerPayoutSummary } from "../../lib/payments";
import { fetchProductInfo } from "../../lib/productInfo";
import {
  EmptyState, StatChip, Button, LabeledInput, LabeledTextarea, SheetModal,
} from "../ui";
import { ProductThumb } from "../product/ProductComponents";
import { AnalyticsDashboard } from "./AnalyticsDashboard";

// Loaded on demand so the heavy charting library stays out of the main bundle
// and doesn't load for shoppers just browsing the public feed.
const EarningsChart = lazy(() => import("../charts/EarningsChart").then(m => ({ default: m.EarningsChart })));

export default function SellView({ navigate }) {
  const { t, lang } = useI18n();
  const mp = useMarketplace();
  const {
    currentMarketer: marketer, marketers, products, sales, payouts, settings,
    introSeen, dismissIntro, collections, showToast,
    onLogin, onSignup, onLogout, onAddProduct, onDeleteProduct, onLogSale,
    onAddCollection, onUpdateCollection, onDeleteCollection, onUpdateMarketer,
  } = mp;

  const [showForm, setShowForm] = useState(false);
  const [editingCollection, setEditingCollection] = useState(null);
  const [showNewCollection, setShowNewCollection] = useState(false);

  if (!introSeen) return <OnboardingIntro onDismiss={dismissIntro} />;
  if (!marketer) return <AuthGate marketers={marketers} onLogin={onLogin} onSignup={onSignup} />;

  const mine = (products || []).filter((p) => p.marketerId === marketer.id).sort((a, b) => b.createdAt - a.createdAt);
  const myClicks = mine.reduce((s, p) => s + (p.clicks || 0), 0);
  const mySales = (sales || []).filter((s) => s.marketerId === marketer.id);
  const myNet = mySales.reduce((s, x) => s + (x.marketerNet || 0), 0);
  const myGross = mySales.reduce((s, x) => s + (x.commissionAmount || 0), 0);
  const myFees = mySales.reduce((s, x) => s + (x.platformFee || 0), 0);
  const feeRate = settings?.platformFeePercent ?? PLATFORM_FEE_PERCENT_DEFAULT;
  const myLink = `${window.location.origin}/u/${typeof marketer.slug === "string" && marketer.slug ? marketer.slug : typeof marketer.id === "string" ? marketer.id : ""}`;
  const myCollections = (collections || []).filter((c) => c.marketerId === marketer.id);
  const chartData = groupByDay(mySales, "marketerNet");
  const payout = getSellerPayoutSummary(sales || [], payouts || [], marketer.id);
  const myPayouts = [...(payouts || [])].filter((p) => p.marketerId === marketer.id).sort((a, b) => b.ts - a.ts);
  const nextPayout = nextPayoutDate();
  const thresholdMet = payout.pendingPayout >= MIN_PAYOUT_THRESHOLD;
  const thresholdLeft = Math.max(0, MIN_PAYOUT_THRESHOLD - payout.pendingPayout);

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: typeof marketer.name === "string" ? marketer.name : String(marketer.name ?? marketer.email ?? ""), url: myLink });
        return;
      } catch { /* cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(myLink);
      showToast(t("sell.linkCopied"));
    } catch {
      showToast(myLink);
    }
  }

  return (
    <div className="pt-4 pb-4">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="disp text-lg font-semibold">{t("sell.studioTitle")} {marketer.name.split(" ")[0]}</p>
          <p className="text-xs text-muted mt-0.5">{marketer.email}</p>
        </div>
        <button
          onClick={onLogout}
          className="tap w-9 h-9 rounded-xl flex items-center justify-center surface"
          aria-label={t("common.logOut")}
        >
          <LogOut size={15} />
        </button>
      </div>

      <LabeledInput
        label={t("sell.trackingIdLabel")}
        value={marketer.trackingId || ""}
        onChange={(v) => onUpdateMarketer(marketer.id, { trackingId: String(v).trim() })}
        placeholder={t("sell.trackingIdPh")}
      />
      <LabeledInput
        label={t("sell.payPalEmail")}
        value={marketer.payPalEmail || ""}
        onChange={(v) => onUpdateMarketer(marketer.id, { payPalEmail: String(v).trim() })}
        placeholder={t("sell.payPalPh")}
      />

      <button
        onClick={handleShare}
        className="tap w-full rounded-2xl p-4 flex items-center gap-3 mb-5 transition-shadow hover:shadow-card"
        style={{ background: "var(--text)" }}
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--accent)" }}>
          <Share2 size={16} color="#fff" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-semibold text-white">{t("sell.sharePage")}</p>
          <p className="text-[11px] truncate opacity-60 text-white">{myLink.replace(/^https?:\/\//, "")}</p>
        </div>
        <ArrowLeft size={15} className="shrink-0 opacity-40 text-white" style={{ transform: "scaleX(var(--flip,1))" }} />
      </button>

      {/* Why sell here — persuasive pitch, low commission, built for a quick yes */}
      <div className="rounded-2xl p-4 mb-5 brand-gradient text-white">
        <p className="disp text-[15px] font-bold">{t("sell.whyTitle")}</p>
        <p className="text-[12.5px] mt-1 opacity-90 leading-relaxed">{t("sell.whySub")}</p>
        <ul className="mt-3 flex flex-col gap-2">
          <li className="flex items-start gap-2 text-[12.5px] leading-snug">
            <Check size={14} className="mt-0.5 shrink-0" />
            {t("sell.whyPoint1", { fee: feeRate, keep: 100 - feeRate })}
          </li>
          <li className="flex items-start gap-2 text-[12.5px] leading-snug">
            <Check size={14} className="mt-0.5 shrink-0" />
            {t("sell.whyPoint2")}
          </li>
          <li className="flex items-start gap-2 text-[12.5px] leading-snug">
            <Check size={14} className="mt-0.5 shrink-0" />
            {t("sell.whyPoint3")}
          </li>
          <li className="flex items-start gap-2 text-[12.5px] leading-snug">
            <Check size={14} className="mt-0.5 shrink-0" />
            {t("sell.whyPoint4")}
          </li>
        </ul>
      </div>

      <div className="grid grid-cols-3 gap-2.5 mb-5">
        <StatChip icon={ShoppingBag} label={t("sell.statListings")} value={mine.length} />
        <StatChip icon={MousePointerClick} label={t("sell.statClicks")} value={myClicks} />
        <StatChip icon={DollarSign} label={t("sell.statNet")} value={money(myNet, lang)} accent />
      </div>

      {/* Earnings dashboard: total sales, commission paid, net, pending payout */}
      <div className="surface rounded-2xl p-4 mb-5 shadow-sm">
        <div className="flex items-center justify-between gap-2 pb-2 border-b" style={{ borderColor: "var(--border)" }}>
          <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{t("sell.statSales")}</span>
          <div className="flex items-center gap-3">
            <span className="mono text-sm font-bold">{mySales.length}</span>
            <span className="mono text-sm font-bold">{money(mySales.reduce((s, x) => s + (x.saleAmount || 0), 0), lang)}</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 py-2 border-b" style={{ borderColor: "var(--border)" }}>
          <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{t("form.fromYourCommission")}</span>
          <span className="mono text-sm font-medium">{money(myGross, lang)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 py-2 border-b" style={{ borderColor: "var(--border)" }}>
          <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{t("sell.statCommissionPaid")} ({feeRate}%)</span>
          <span className="mono text-sm font-medium" style={{ color: "var(--danger)" }}>− {money(myFees, lang)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 py-2 border-b" style={{ borderColor: "var(--border)" }}>
          <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{t("sell.statNet")}</span>
          <span className="mono text-sm font-bold" style={{ color: "var(--success)" }}>{money(myNet, lang)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 pt-2">
          <span className="text-[11px] font-semibold" style={{ color: "var(--accent)" }}>{t("sell.pendingPayouts")}</span>
          <span className="mono text-base font-bold" style={{ color: "var(--accent)" }}>{money(payout.pendingPayout, lang)}</span>
        </div>
      </div>
      <p className="text-[11px] -mt-3 mb-4" style={{ color: "var(--text-muted)" }}>{t("sell.payoutNote")}</p>

      <div className="surface rounded-2xl p-4 mb-5 shadow-sm">
        <div className="flex items-center justify-between gap-2 pb-2 border-b" style={{ borderColor: "var(--border)" }}>
          <span className="text-[11px] font-semibold" style={{ color: "var(--accent)" }}>{t("sell.payoutBalance")}</span>
          <span className="mono text-lg font-bold" style={{ color: "var(--accent)" }}>{money(payout.pendingPayout, lang)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 py-2">
          <span className="text-[11px] text-muted">{t("sell.payoutNext")}</span>
          <span className="mono text-xs font-semibold">{formatDate(nextPayout.getTime())}</span>
        </div>
        <div className="rounded-xl px-3 py-2 text-[11px] font-medium" style={{ background: thresholdMet ? "var(--success-subtle)" : "var(--bg-subtle)", color: thresholdMet ? "var(--success)" : "var(--text-muted)" }}>
          {thresholdMet ? t("sell.payoutMet") : t("sell.payoutLeft", { left: thresholdLeft.toFixed(0) })}
        </div>
      </div>

      <div className="mb-5">
        <p className="text-xs font-semibold mb-2">{t("sell.payoutHistory")}</p>
        {myPayouts.length === 0 ? (
          <p className="text-xs text-muted">{t("sell.payoutNone")}</p>
        ) : (
          <div className="surface rounded-2xl overflow-hidden">
            {myPayouts.map((pay, i) => (
              <div key={pay.id} className={`flex items-center justify-between gap-2 px-3.5 py-2.5 ${i !== 0 ? "border-t" : ""}`} style={{ borderColor: "var(--border)" }}>
                <div>
                  <p className="mono text-xs font-semibold">{money(typeof pay.amount === "number" && Number.isFinite(pay.amount) ? pay.amount : 0, lang)}</p>
                  <p className="text-[10px] text-muted">{formatDate(typeof pay.ts === "number" ? pay.ts : null)}</p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: pay.status === "paid" ? "var(--success-subtle)" : "var(--accent-subtle)", color: pay.status === "paid" ? "var(--success)" : "var(--accent)" }}>
                  {pay.status === "paid" ? t("sell.payoutPaid") : t("sell.payoutPending")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Analytics Dashboard */}
      <AnalyticsDashboard marketerId={marketer?.id} products={mine} />

      <Suspense fallback={null}>
        <EarningsChart title={t("sell.earningsChart")} data={chartData} lang={lang} />
      </Suspense>

      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold flex items-center gap-1.5">
          <Layers size={14} style={{ color: "var(--accent)" }} /> {t("sell.collectionsTitle")}
        </p>
        <button
          onClick={() => setShowNewCollection(true)}
          className="tap text-[11px] font-semibold px-3 py-1.5 rounded-full flex items-center gap-1"
          style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
        >
          <Plus size={12} /> {t("sell.newCollection")}
        </button>
      </div>

      {myCollections.length === 0 ? (
        <p className="text-xs text-muted mb-5">{t("sell.emptyCollections")}</p>
      ) : (
        <div className="flex flex-col gap-2 mb-5">
          {myCollections.map((c) => (
            <div key={c.id} className="surface rounded-2xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--accent-subtle)" }}>
                <Layers size={16} style={{ color: "var(--accent)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{c.title}</p>
                <p className="text-[11px] text-muted">{c.productIds.length} {t("sell.statListings")}</p>
              </div>
              <button onClick={() => setEditingCollection(c)} className="tap w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--accent-subtle)" }}>
                <Pencil size={12} style={{ color: "var(--accent)" }} />
              </button>
              <button onClick={() => onDeleteCollection(c.id)} className="tap w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--danger-subtle)" }}>
                <Trash2 size={12} style={{ color: "var(--danger)" }} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Button onClick={() => setShowForm(true)} variant="dark" className="mb-5">
        <Plus size={17} /> {t("sell.postProduct")}
      </Button>

      {mine.length === 0 ? (
        <EmptyState icon={TrendingUp} title={t("sell.emptyTitle")} body={t("sell.emptyBody")} />
      ) : (
        <div className="flex flex-col gap-3">
          {mine.map((p) => (
            <CreatorProductRow
              key={p.id}
              p={p}
              lang={lang}
              feeRate={settings?.platformFeePercent ?? PLATFORM_FEE_PERCENT_DEFAULT}
              onDelete={() => onDeleteProduct(p.id)}
              onLogSale={(amt, comm) => onLogSale(p, amt, comm)}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <ProductForm onClose={() => setShowForm(false)} onSubmit={(d) => { onAddProduct(d); setShowForm(false); }} />
        )}
        {showNewCollection && (
          <NewCollectionModal
            onClose={() => setShowNewCollection(false)}
            onCreate={(title) => { onAddCollection(title); setShowNewCollection(false); }}
          />
        )}
        {editingCollection && (
          <CollectionEditorModal
            collection={editingCollection}
            myProducts={mine}
            onClose={() => setEditingCollection(null)}
            onSave={(productIds) => { onUpdateCollection(editingCollection.id, productIds); setEditingCollection(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function OnboardingIntro({ onDismiss }) {
  const { t } = useI18n();
  const steps = [t("onboarding.step1"), t("onboarding.step2"), t("onboarding.step3")];
  return (
    <div className="pt-8 flex flex-col items-center text-center px-2">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: "var(--accent)" }}>
        <Rocket size={28} color="#fff" />
      </div>
      <p className="disp text-xl font-semibold">{t("onboarding.title")}</p>
      <p className="text-sm text-muted mt-2">{t("onboarding.subtitle")}</p>
      <div className="w-full mt-6 flex flex-col gap-3 text-left">
        {steps.map((s, i) => (
          <div key={i} className="surface rounded-2xl p-4 flex items-start gap-3">
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mono text-xs font-semibold" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
              {i + 1}
            </div>
            <p className="text-sm leading-snug text-secondary">{s}</p>
          </div>
        ))}
      </div>
      <Button onClick={onDismiss} className="mt-6">{t("onboarding.cta")}</Button>
    </div>
  );
}

function AuthGate({ marketers, onLogin, onSignup }) {
  const { t } = useI18n();
  const [mode, setMode] = useState("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  function submit() {
    if (!email.trim() || !email.includes("@")) return setErr(t("auth.errEmail"));
    if (password.trim().length < 6) return setErr(t("auth.errPassword"));
    if (mode === "signup") {
      if (!name.trim()) return setErr(t("auth.errName"));
      onSignup(name.trim(), email.trim(), password.trim());
    } else {
      onLogin(email.trim(), password.trim());
    }
  }

  return (
    <div className="pt-8 flex flex-col items-center text-center px-2">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: "var(--accent-subtle)" }}>
        <TrendingUp size={28} style={{ color: "var(--accent)" }} />
      </div>
      <p className="disp text-xl font-semibold">{t("auth.title")}</p>
      <p className="text-sm text-muted mt-2 max-w-[300px]">{t("auth.subtitle")}</p>
      <div className="w-full mt-6 flex rounded-full p-1 surface-subtle">
        {["signup", "login"].map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setErr(""); }}
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
        <LabeledInput label={t("auth.email")} value={email} onChange={setEmail} placeholder={t("auth.emailPh")} />
        <LabeledInput label={t("auth.password")} value={password} onChange={setPassword} placeholder={t("auth.passwordPh")} type="password" />
        {err && <p className="text-xs flex items-center gap-1" style={{ color: "var(--danger)" }}><CircleAlert size={13} /> {err}</p>}
        <Button onClick={submit}>{mode === "signup" ? t("auth.createBtn") : t("auth.enterBtn")}</Button>
      </div>
      <p className="text-[11px] text-muted mt-4 max-w-[280px]">{t("auth.note")}</p>
    </div>
  );
}

function NewCollectionModal({ onClose, onCreate }) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  return (
    <SheetModal onClose={onClose} title={t("sell.newCollection")}>
      <div className="flex flex-col gap-3 p-5 pt-2">
        <LabeledInput label={t("sell.newCollection")} value={title} onChange={setTitle} placeholder={t("sell.collectionTitlePh")} />
        <Button onClick={() => title.trim() && onCreate(title.trim())}>{t("sell.newCollection")}</Button>
      </div>
    </SheetModal>
  );
}

function CollectionEditorModal({ collection, myProducts, onClose, onSave }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState(collection.productIds);
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <SheetModal onClose={onClose} title={collection.title} maxHeight="85vh">
      <div className="p-5 pt-2 overflow-y-auto">
        {myProducts.length === 0 ? (
          <p className="text-sm text-muted py-6 text-center">{t("sell.noProductsForCollection")}</p>
        ) : (
          <div className="flex flex-col gap-2 mb-4">
            {myProducts.map((p) => {
              const on = selected.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className="tap w-full flex items-center gap-3 rounded-xl p-2.5 transition-colors"
                  style={{
                    background: on ? "var(--accent-subtle)" : "var(--bg-subtle)",
                    border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                  }}
                >
                  <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0"><ProductThumb p={p} /></div>
                  <p className="text-sm font-medium flex-1 text-left truncate">{p.title}</p>
                  <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: on ? "var(--accent)" : "var(--border)" }}>
                    {on && <Check size={12} color="#fff" />}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <Button onClick={() => onSave(selected)}>{t("sell.done")}</Button>
      </div>
    </SheetModal>
  );
}

function ProductForm({ onClose, onSubmit }) {
  const { t, lang, categoryLabel } = useI18n();
  const { settings } = useMarketplace();
  const [d, setD] = useState({ title: "", description: "", image: "", affiliateUrl: "", category: CATEGORY_KEYS[0], price: "", commission: "" });
  const feeRate = settings?.platformFeePercent ?? PLATFORM_FEE_PERCENT_DEFAULT;
  const commNum = Math.max(0, Number(d?.commission) || 0);
  const priceNum = Math.max(0, Number(d?.price) || 0);
  const platformFee = Math.round(commNum * (feeRate / 100) * 100) / 100;
  const youKeep = Math.round((commNum - platformFee) * 100) / 100;
  const [err, setErr] = useState("");
  const [uploading, setUploading] = useState(false);
  const [infoLoading, setInfoLoading] = useState(false);
  const set = (k) => (v) => setD((s) => ({ ...s, [k]: v }));

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      set("image")(await uploadProductImage(file));
    } catch (e2) {
      console.error(e2);
    } finally {
      setUploading(false);
    }
  }

  async function autoFetchLink() {
    const u = d.affiliateUrl.trim();
    if (!isSafeHttpUrl(u)) return;
    setInfoLoading(true);
    try {
      const info = await fetchProductInfo(u);
      setD((s) => ({
        ...s,
        title: s.title.trim() ? s.title : info.title || s.title,
        image: s.image.trim() ? s.image : info.image || s.image,
        price: s.price ? s.price : info.price || s.price,
      }));
    } catch {
      /* never block saving — leave fields for manual entry */
    } finally {
      setInfoLoading(false);
    }
  }

  function submit() {
    if (!d.title.trim()) return setErr(t("form.errTitle"));
    if (!isSafeHttpUrl(d.affiliateUrl)) return setErr(t("form.errLink"));
    if (!isSafeImageUrl(d.image)) return setErr(t("form.errImage"));
    onSubmit(d);
  }

  return (
    <SheetModal onClose={onClose} title={t("form.newListing")} maxHeight="92vh">
      <div className="flex flex-col gap-3 p-5 pt-2 overflow-y-auto">
        <LabeledInput label={t("form.title")} value={d.title} onChange={set("title")} placeholder={t("form.titlePh")} />
        <LabeledTextarea label={t("form.description")} value={d.description} onChange={set("description")} placeholder={t("form.descriptionPh")} />
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-secondary">{t("form.imageSection")}</span>
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 surface">
              {d.image ? <img src={d.image} alt="" className="w-full h-full object-cover" /> : (
                <div className="w-full h-full flex items-center justify-center"><ImageOff size={16} style={{ color: "var(--accent)", opacity: 0.5 }} /></div>
              )}
            </div>
            <label className="tap flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold cursor-pointer" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {uploading ? t("form.uploading") : t("form.uploadFromDevice")}
              <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
            </label>
          </div>
          <input value={d.image} onChange={(e) => set("image")(e.target.value)} placeholder={t("form.orPasteUrl")} className="input-field w-full px-3.5 py-2.5 text-xs mt-1" />
        </div>
        <LabeledInput label={t("form.link")} value={d.affiliateUrl} onChange={set("affiliateUrl")} onBlur={autoFetchLink} placeholder={t("form.linkPh")} />
        {infoLoading && (
          <p className="text-[11px] flex items-center gap-1" style={{ color: "var(--accent)" }}>
            <Loader2 size={12} className="animate-spin" /> {t("form.fetching")}
          </p>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-secondary">{t("form.category")}</span>
          <select value={d.category} onChange={(e) => set("category")(e.target.value)} className="input-field w-full px-3.5 py-2.5 text-sm">
            {CATEGORY_KEYS.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label={t("form.price")} value={d.price} onChange={set("price")} placeholder="24.99" type="number" />
          <LabeledInput label={t("form.commission")} value={d.commission} onChange={set("commission")} placeholder="3.50" type="number" />
        </div>

        {(commNum > 0 || priceNum > 0) && (
          <div className="rounded-xl p-3.5 surface-subtle flex flex-col gap-2">
            <p className="text-xs font-semibold" style={{ color: "var(--accent)" }}>{t("form.earningsTitle")}</p>
            {priceNum > 0 && (
              <div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-medium">{t("form.buyerPays")}</span>
                  <span className="mono font-bold">{money(priceNum, lang)}</span>
                </div>
                <p className="text-[10.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>{t("form.buyerPaysNote")}</p>
              </div>
            )}
            {commNum > 0 ? (
              <div className="flex flex-col gap-1 border-t pt-2" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-medium">{t("form.fromYourCommission")}</span>
                  <span className="mono font-medium">{money(commNum, lang)}</span>
                </div>
                <div className="flex items-center justify-between text-[12px]" style={{ color: "var(--text-muted)" }}>
                  <span>{t("form.platformFeeOut")} ({feeRate}%)</span>
                  <span className="mono">− {money(platformFee, lang)}</span>
                </div>
                <div className="flex items-center justify-between text-[14px] font-semibold pt-1">
                  <span style={{ color: "var(--success)" }}>{t("form.youKeepOut")}</span>
                  <span className="mono" style={{ color: "var(--success)" }}>{money(youKeep, lang)}</span>
                </div>
              </div>
            ) : (
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{t("form.enterCommissionHint")}</p>
            )}
          </div>
        )}

        {err && <p className="text-xs flex items-center gap-1" style={{ color: "var(--danger)" }}><CircleAlert size={13} /> {err}</p>}
        <Button onClick={submit}>{t("form.publish")}</Button>
      </div>
    </SheetModal>
  );
}

function CreatorProductRow({ p, lang, feeRate, onDelete, onLogSale }) {
  const { t, categoryLabel } = useI18n();
  const [logging, setLogging] = useState(false);
  const [amount, setAmount] = useState(typeof p.price === "number" && Number.isFinite(p.price) ? String(p.price) : "");
  const [comm, setComm] = useState(typeof p.commission === "number" && Number.isFinite(p.commission) ? String(p.commission) : "");
  const [receipt, setReceipt] = useState(null);
  const statusColor = { approved: "var(--success)", pending: "var(--warning)", flagged: "var(--danger)" }[p.status] || "var(--text-muted)";

  async function submitSale() {
    const a = Number(amount), c = Number(comm);
    if (!a || !c) return;
    setReceipt(await onLogSale(a, c));
  }

  return (
    <div className="surface rounded-2xl p-3 flex gap-3">
      <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0"><ProductThumb p={p} /></div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold truncate">{p.title}</p>
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: statusColor }} title={t(`status.${p.status}`)} />
        </div>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted">
          <span className="flex items-center gap-1"><MousePointerClick size={12} /> {p.clicks || 0}</span>
          <span>{categoryLabel(p.category)}</span>
        </div>
        <div className="flex gap-2 mt-2">
          <button onClick={() => setLogging((v) => !v)} className="tap text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
            {t("sell.logSale")}
          </button>
          <button onClick={onDelete} className="tap text-[11px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1" style={{ background: "var(--danger-subtle)", color: "var(--danger)" }}>
            <Trash2 size={11} /> {t("sell.remove")}
          </button>
        </div>
        {logging && (
          <div className="mt-3 p-3 rounded-xl surface-subtle">
            <div className="grid grid-cols-2 gap-2">
              <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" placeholder={t("sell.saleAmountPlaceholder")} className="input-field rounded-lg px-2.5 py-2 text-xs" />
              <input value={comm} onChange={(e) => setComm(e.target.value)} type="number" placeholder={t("sell.saleCommissionPlaceholder")} className="input-field rounded-lg px-2.5 py-2 text-xs" />
            </div>
            <button onClick={submitSale} className="tap w-full mt-2 rounded-lg py-2 text-xs font-semibold text-white" style={{ background: "var(--text)" }}>
              {t("sell.confirmSale")}
            </button>
            {receipt && <CommissionTicker s={receipt} lang={lang} feeRate={feeRate} />}
          </div>
        )}
      </div>
    </div>
  );
}

function CommissionTicker({ s, lang, feeRate }) {
  const { t } = useI18n();
  return (
    <div className="mt-3 rounded-xl overflow-hidden surface">
      <div className="flex items-center gap-1.5 px-3 pt-2.5">
        <Receipt size={13} style={{ color: "var(--accent)" }} />
        <span className="text-[11px] font-semibold" style={{ color: "var(--accent)" }}>{t("ticker.title")}</span>
      </div>
      <div className="px-3 pb-3 pt-1.5 flex flex-col gap-1 mono text-xs">
        <Row label={t("ticker.saleAmount")} value={money(s.saleAmount, lang)} />
        <Row label={t("ticker.yourCommission")} value={money(s.commissionAmount, lang)} />
        <Row label={`${t("ticker.platformFee")} (${feeRate}%)`} value={`− ${money(s.platformFee, lang)}`} muted />
        <div className="h-px my-1" style={{ background: "var(--border)" }} />
        <Row label={t("ticker.youKeep")} value={money(s.marketerNet, lang)} strong />
      </div>
    </div>
  );
}

function Row({ label, value, muted, strong }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-sans" style={{ color: muted ? "var(--text-faint)" : "var(--text-muted)" }}>{label}</span>
      <span style={{ color: strong ? "var(--success)" : muted ? "var(--text-faint)" : "var(--text)", fontWeight: strong ? 700 : 500 }}>{value}</span>
    </div>
  );
}
