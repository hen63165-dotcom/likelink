import React, { useState, useEffect, useMemo } from "react";
import {
  ShoppingBag, MousePointerClick, DollarSign, LogOut, Share2, ArrowLeft, Plus, Layers, Pencil, Trash2, X, Rocket, TrendingUp, CircleAlert, Loader2, Upload, ImageOff, Check, Receipt
} from "lucide-react";
import { useI18n } from "../lib/LangContext";
import { CATEGORY_KEYS } from "../lib/i18n";
import { uploadProductImage } from "../lib/uploadImage";
import {
  money, groupByDay, ProductThumb, EmptyState, StatChip, EarningsChart, LabeledInput, LabeledTextarea
} from "./SharedComponents";

export default function SellView({
  marketer, marketers, products, sales, settings, showToast, navigate, introSeen, onDismissIntro,
  collections, onAddCollection, onUpdateCollection, onDeleteCollection, onLogin, onSignup, onLogout,
  onAddProduct, onDeleteProduct, onLogSale
}) {
  const { t, lang } = useI18n();
  const [showForm, setShowForm] = useState(false);
  const [editingCollection, setEditingCollection] = useState(null);
  const [showNewCollection, setShowNewCollection] = useState(false);

  if (!introSeen) {
    return <OnboardingIntro onDismiss={onDismissIntro} />;
  }

  if (!marketer) {
    return <AuthGate marketers={marketers} onLogin={onLogin} onSignup={onSignup} />;
  }

  const mine = products.filter((p) => p.marketerId === marketer.id).sort((a, b) => b.createdAt - a.createdAt);
  const myClicks = mine.reduce((s, p) => s + (p.clicks || 0), 0);
  const mySales = sales.filter((s) => s.marketerId === marketer.id);
  const myNet = mySales.reduce((s, x) => s + x.marketerNet, 0);
  const myLink = `${window.location.origin}/u/${marketer.slug || marketer.id}`;
  const myCollections = collections.filter((c) => c.marketerId === marketer.id);
  const chartData = groupByDay(mySales, "marketerNet");

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: marketer.name, url: myLink });
        return;
      } catch {
        /* user cancelled share sheet — fall through to clipboard */
      }
    }
    try {
      await navigator.clipboard.writeText(myLink);
      showToast(t("sell.linkCopied"));
    } catch {
      showToast(myLink);
    }
  }

  return (
    <div className="pt-3 pb-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="disp text-[17px] font-semibold">{t("sell.studioTitle")} {marketer.name.split(" ")[0]}</p>
          <p className="text-[12.5px] text-[#8B879C]">{marketer.email}</p>
        </div>
        <button onClick={onLogout} className="tap w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}>
          <LogOut size={14} />
        </button>
      </div>

      <button onClick={handleShare} className="tap w-full rounded-2xl p-3.5 flex items-center gap-3 mb-4" style={{ background: "#14121F" }}>
        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "#6C4CF1" }}>
          <Share2 size={15} color="#fff" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[12.5px] font-semibold text-white">{t("sell.sharePage")}</p>
          <p className="text-[11px] truncate" style={{ color: "#A9A5BC" }}>{myLink.replace(/^https?:\/\//, "")}</p>
        </div>
        <ArrowLeft size={15} color="#8B879C" className="shrink-0" style={{ transform: "scaleX(var(--flip,1))" }} />
      </button>

      <div className="grid grid-cols-3 gap-2.5 mb-5">
        <StatChip icon={ShoppingBag} label={t("sell.statListings")} value={mine.length} />
        <StatChip icon={MousePointerClick} label={t("sell.statClicks")} value={myClicks} />
        <StatChip icon={DollarSign} label={t("sell.statNet")} value={money(myNet, lang)} accent />
      </div>

      <EarningsChart title={t("sell.earningsChart")} data={chartData} lang={lang} />

      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[12.5px] font-semibold flex items-center gap-1.5"><Layers size={14} color="#6C4CF1" /> {t("sell.collectionsTitle")}</p>
        <button onClick={() => setShowNewCollection(true)} className="tap text-[11.5px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1" style={{ background: "#F1EFFB", color: "#6C4CF1" }}>
          <Plus size={12} /> {t("sell.newCollection")}
        </button>
      </div>

      {myCollections.length === 0 ? (
        <p className="text-[12px] text-[#B4AFC0] mb-5">{t("sell.emptyCollections")}</p>
      ) : (
        <div className="flex flex-col gap-2 mb-5">
          {myCollections.map((c) => (
            <div key={c.id} className="rounded-2xl p-3 flex items-center gap-3" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#F1EFFB" }}>
                <Layers size={16} color="#6C4CF1" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold truncate">{c.title}</p>
                <p className="text-[11px] text-[#8B879C]">{c.productIds.length} {t("sell.statListings")}</p>
              </div>
              <button onClick={() => setEditingCollection(c)} className="tap w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: "#F1EFFB" }}>
                <Pencil size={12} color="#6C4CF1" />
              </button>
              <button onClick={() => onDeleteCollection(c.id)} className="tap w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: "#FBEAEA" }}>
                <Trash2 size={12} color="#E1483B" />
              </button>
            </div>
          ))}
        </div>
      )}

      <button onClick={() => setShowForm(true)} className="tap w-full rounded-2xl py-3.5 flex items-center justify-center gap-2 font-semibold text-[15px] mb-5" style={{ background: "#14121F", color: "#fff" }}>
        <Plus size={17} /> {t("sell.postProduct")}
      </button>

      {mine.length === 0 ? (
        <EmptyState icon={TrendingUp} title={t("sell.emptyTitle")} body={t("sell.emptyBody")} />
      ) : (
        <div className="flex flex-col gap-3">
          {mine.map((p) => (
            <CreatorProductRow key={p.id} p={p} lang={lang} feeRate={settings.platformFeePercent} onDelete={() => onDeleteProduct(p.id)} onLogSale={(amt, comm) => onLogSale(p, amt, comm)} />
          ))}
        </div>
      )}

      {showForm && <ProductForm onClose={() => setShowForm(false)} onSubmit={(d) => { onAddProduct(d); setShowForm(false); }} />}
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
    </div>
  );
}

function NewCollectionModal({ onClose, onCreate }) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(20,18,31,0.55)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[520px] rounded-t-3xl" style={{ background: "#FFFFFF" }}>
        <div className="flex items-center justify-between p-5 pb-2">
          <p className="disp text-[17px] font-semibold">{t("sell.newCollection")}</p>
          <button onClick={onClose} className="tap w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#F1EFFB" }}>
            <X size={15} />
          </button>
        </div>
        <div className="flex flex-col gap-3 p-5 pt-2">
          <LabeledInput label={t("sell.newCollection")} value={title} onChange={setTitle} placeholder={t("sell.collectionTitlePh")} />
          <button
            onClick={() => title.trim() && onCreate(title.trim())}
            className="tap w-full rounded-2xl py-3.5 font-semibold text-[15px]"
            style={{ background: "#6C4CF1", color: "#fff" }}
          >
            {t("sell.newCollection")}
          </button>
        </div>
      </div>
    </div>
  );
}

function CollectionEditorModal({ collection, myProducts, onClose, onSave }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState(collection.productIds);

  function toggle(id) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(20,18,31,0.55)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[520px] rounded-t-3xl max-h-[85vh] overflow-y-auto" style={{ background: "#FFFFFF" }}>
        <div className="flex items-center justify-between p-5 pb-2 sticky top-0" style={{ background: "#FFFFFF" }}>
          <p className="disp text-[17px] font-semibold">{collection.title}</p>
          <button onClick={onClose} className="tap w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#F1EFFB" }}>
            <X size={15} />
          </button>
        </div>
        <div className="p-5 pt-2">
          {myProducts.length === 0 ? (
            <p className="text-[12.5px] text-[#8B879C] py-6 text-center">{t("sell.noProductsForCollection")}</p>
          ) : (
            <div className="flex flex-col gap-2 mb-4">
              {myProducts.map((p) => {
                const on = selected.includes(p.id);
                return (
                  <button key={p.id} onClick={() => toggle(p.id)} className="tap w-full flex items-center gap-3 rounded-xl p-2.5" style={{ background: on ? "#F1EFFB" : "#FAFAF8", border: "1px solid " + (on ? "#D9CDF5" : "#ECEAF3") }}>
                    <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0"><ProductThumb p={p} /></div>
                    <p className="text-[12.5px] font-medium flex-1 text-left truncate">{p.title}</p>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: on ? "#6C4CF1" : "#ECEAF3" }}>
                      {on && <Check size={12} color="#fff" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <button onClick={() => onSave(selected)} className="tap w-full rounded-2xl py-3.5 font-semibold text-[15px]" style={{ background: "#6C4CF1", color: "#fff" }}>
            {t("sell.done")}
          </button>
        </div>
      </div>
    </div>
  );
}

function OnboardingIntro({ onDismiss }) {
  const { t } = useI18n();
  const steps = [t("onboarding.step1"), t("onboarding.step2"), t("onboarding.step3")];
  return (
    <div className="pt-10 flex flex-col items-center text-center px-2">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "#6C4CF1" }}>
        <Rocket size={24} color="#fff" />
      </div>
      <p className="disp text-[19px] font-semibold">{t("onboarding.title")}</p>
      <p className="text-[13.5px] text-[#8B879C] mt-1.5">{t("onboarding.subtitle")}</p>

      <div className="w-full mt-6 flex flex-col gap-3 text-left">
        {steps.map((s, i) => (
          <div key={i} className="flex items-start gap-3 rounded-2xl p-3.5" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mono text-[12px] font-semibold" style={{ background: "#F1EFFB", color: "#6C4CF1" }}>
              {i + 1}
            </div>
            <p className="text-[13.5px] leading-snug" style={{ color: "#4A4658" }}>{s}</p>
          </div>
        ))}
      </div>

      <button onClick={onDismiss} className="tap w-full mt-6 rounded-2xl py-3.5 font-semibold text-[15px]" style={{ background: "#6C4CF1", color: "#fff" }}>
        {t("onboarding.cta")}
      </button>
    </div>
  );
}

function AuthGate({ marketers, onLogin, onSignup }) {
  const { t } = useI18n();
  const [mode, setMode] = useState("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");

  function submit() {
    if (!email.trim() || !email.includes("@")) return setErr(t("auth.errEmail"));
    if (mode === "signup") {
      if (!name.trim()) return setErr(t("auth.errName"));
      onSignup(name.trim(), email.trim());
    } else {
      const m = marketers.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
      if (!m) return setErr(t("auth.errNoStudio"));
      onLogin(m);
    }
  }

  return (
    <div className="pt-8 flex flex-col items-center text-center px-2">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "#F1EFFB" }}>
        <TrendingUp size={24} color="#6C4CF1" />
      </div>
      <p className="disp text-[19px] font-semibold">{t("auth.title")}</p>
      <p className="text-[13.5px] text-[#8B879C] mt-1.5 max-w-[280px]">{t("auth.subtitle")}</p>

      <div className="w-full mt-6 flex rounded-full p-1" style={{ background: "#F1EFFB" }}>
        {["signup", "login"].map((m) => (
          <button key={m} onClick={() => { setMode(m); setErr(""); }} className="tap flex-1 py-2 rounded-full text-[13px] font-semibold" style={{ background: mode === m ? "#fff" : "transparent", color: mode === m ? "#14121F" : "#8B879C" }}>
            {m === "signup" ? t("auth.createStudio") : t("auth.login")}
          </button>
        ))}
      </div>

      <div className="w-full mt-5 flex flex-col gap-3 text-left">
        {mode === "signup" && <LabeledInput label={t("auth.yourName")} value={name} onChange={setName} placeholder={t("auth.yourNamePh")} />}
        <LabeledInput label={t("auth.email")} value={email} onChange={setEmail} placeholder={t("auth.emailPh")} />
        {err && <p className="text-[12.5px] text-[#E1483B] flex items-center gap-1"><CircleAlert size={13} /> {err}</p>}
        <button onClick={submit} className="tap w-full rounded-2xl py-3.5 font-semibold text-[15px] mt-1" style={{ background: "#6C4CF1", color: "#fff" }}>
          {mode === "signup" ? t("auth.createBtn") : t("auth.enterBtn")}
        </button>
      </div>
      <p className="text-[11px] text-[#B4AFC0] mt-4 max-w-[280px]">{t("auth.note")}</p>
    </div>
  );
}

function ProductForm({ onClose, onSubmit }) {
  const { t } = useI18n();
  const [d, setD] = useState({ title: "", description: "", image: "", affiliateUrl: "", category: CATEGORY_KEYS[0], price: "", commission: "" });
  const [err, setErr] = useState("");
  const [uploading, setUploading] = useState(false);
  const set = (k) => (v) => setD((s) => ({ ...s, [k]: v }));

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadProductImage(file);
      set("image")(url);
    } catch (err2) {
      console.error(err2);
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    if (!d.title.trim()) return setErr(t("form.errTitle"));
    if (!d.affiliateUrl.trim().startsWith("http")) return setErr(t("form.errLink"));
    onSubmit(d);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(20,18,31,0.55)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[520px] rounded-t-3xl max-h-[92vh] overflow-y-auto" style={{ background: "#FFFFFF" }}>
        <div className="flex items-center justify-between p-5 pb-2 sticky top-0" style={{ background: "#FFFFFF" }}>
          <p className="disp text-[17px] font-semibold">{t("form.newListing")}</p>
          <button onClick={onClose} className="tap w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#F1EFFB" }}>
            <X size={15} />
          </button>
        </div>
        <div className="flex flex-col gap-3 p-5 pt-2">
          <LabeledInput label={t("form.title")} value={d.title} onChange={set("title")} placeholder={t("form.titlePh")} />
          <LabeledTextarea label={t("form.description")} value={d.description} onChange={set("description")} placeholder={t("form.descriptionPh")} />

          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[#4A4658]">{t("form.imageSection")}</span>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0" style={{ background: "#F1EFFB", border: "1px solid #ECEAF3" }}>
                {d.image ? <img src={d.image} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><ImageOff size={16} color="#B9AEF0" /></div>}
              </div>
              <label className="tap flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-[12.5px] font-semibold cursor-pointer" style={{ background: "#F1EFFB", color: "#6C4CF1" }}>
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {uploading ? t("form.uploading") : t("form.uploadFromDevice")}
                <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
              </label>
            </div>
            <input
              value={d.image}
              onChange={(e) => set("image")(e.target.value)}
              placeholder={t("form.orPasteUrl")}
              className="w-full rounded-xl px-3.5 py-2.5 text-[12.5px] outline-none mt-1"
              style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}
            />
          </div>

          <LabeledInput label={t("form.link")} value={d.affiliateUrl} onChange={set("affiliateUrl")} placeholder={t("form.linkPh")} />
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[#4A4658]">{t("form.category")}</span>
            <select value={d.category} onChange={(e) => set("category")(e.target.value)} className="w-full rounded-xl px-3.5 py-2.5 text-[14px] outline-none" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}>
              {CATEGORY_KEYS.map((c) => <CategoryOption key={c} value={c} />)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <LabeledInput label={t("form.price")} value={d.price} onChange={set("price")} placeholder="24.99" type="number" />
            <LabeledInput label={t("form.commission")} value={d.commission} onChange={set("commission")} placeholder="3.50" type="number" />
          </div>
          {err && <p className="text-[12.5px] text-[#E1483B] flex items-center gap-1"><CircleAlert size={13} /> {err}</p>}
          <button onClick={submit} className="tap w-full rounded-2xl py-3.5 font-semibold text-[15px] mt-1" style={{ background: "#6C4CF1", color: "#fff" }}>
            {t("form.publish")}
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryOption({ value }) {
  const { categoryLabel } = useI18n();
  return <option value={value}>{categoryLabel(value)}</option>;
}

function CreatorProductRow({ p, lang, feeRate, onDelete, onLogSale }) {
  const { t, categoryLabel } = useI18n();
  const [logging, setLogging] = useState(false);
  const [amount, setAmount] = useState(p.price ? String(p.price) : "");
  const [comm, setComm] = useState(p.commission ? String(p.commission) : "");
  const [receipt, setReceipt] = useState(null);

  const statusColor = { approved: "#00C896", pending: "#E8A93B", flagged: "#E1483B" }[p.status] || "#8B879C";

  async function submitSale() {
    const a = Number(amount), c = Number(comm);
    if (!a || !c) return;
    const s = await onLogSale(a, c);
    setReceipt(s);
  }

  return (
    <div className="rounded-2xl p-3 flex gap-3" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}>
      <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0"><ProductThumb p={p} /></div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-[13.5px] font-semibold truncate">{p.title}</p>
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: statusColor }} title={p.status} />
        </div>
        <div className="flex items-center gap-3 mt-1 text-[11.5px] text-[#8B879C]">
          <span className="flex items-center gap-1"><MousePointerClick size={12} /> {p.clicks || 0}</span>
          <span>{categoryLabel(p.category)}</span>
        </div>
        <div className="flex gap-2 mt-2">
          <button onClick={() => setLogging((v) => !v)} className="tap text-[11.5px] font-semibold px-2.5 py-1 rounded-full" style={{ background: "#F1EFFB", color: "#6C4CF1" }}>
            {t("sell.logSale")}
          </button>
          <button onClick={onDelete} className="tap text-[11.5px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1" style={{ background: "#FBEAEA", color: "#E1483B" }}>
            <Trash2 size={11} /> {t("sell.remove")}
          </button>
        </div>
        {logging && (
          <div className="mt-3 p-3 rounded-xl" style={{ background: "#FAFAF8" }}>
            <div className="grid grid-cols-2 gap-2">
              <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" placeholder={t("sell.saleAmountPlaceholder")} className="rounded-lg px-2.5 py-2 text-[12.5px] outline-none" style={{ border: "1px solid #ECEAF3" }} />
              <input value={comm} onChange={(e) => setComm(e.target.value)} type="number" placeholder={t("sell.saleCommissionPlaceholder")} className="rounded-lg px-2.5 py-2 text-[12.5px] outline-none" style={{ border: "1px solid #ECEAF3" }} />
            </div>
            <button onClick={submitSale} className="tap w-full mt-2 rounded-lg py-2 text-[12.5px] font-semibold" style={{ background: "#14121F", color: "#fff" }}>
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
    <div className="mt-3 rounded-xl overflow-hidden" style={{ border: "1px dashed #D9D3F2", background: "#FFFFFF" }}>
      <div className="flex items-center gap-1.5 px-3 pt-2.5">
        <Receipt size={13} color="#6C4CF1" />
        <span className="text-[11px] font-semibold" style={{ color: "#6C4CF1" }}>{t("ticker.title")}</span>
      </div>
      <div className="px-3 pb-3 pt-1.5 flex flex-col gap-1 mono text-[12px]">
        <Row label={t("ticker.saleAmount")} value={money(s.saleAmount, lang)} />
        <Row label={t("ticker.yourCommission")} value={money(s.commissionAmount, lang)} />
        <Row label={`${t("ticker.platformFee")} (${feeRate}%)`} value={`− ${money(s.platformFee, lang)}`} muted />
        <div className="h-px my-1" style={{ background: "#ECEAF3" }} />
        <Row label={t("ticker.youKeep")} value={money(s.marketerNet, lang)} strong />
      </div>
    </div>
  );
}

function Row({ label, value, muted, strong }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: muted ? "#B4AFC0" : "#8B879C" }} className="font-sans">{label}</span>
      <span style={{ color: strong ? "#00C896" : muted ? "#B4AFC0" : "#14121F", fontWeight: strong ? 700 : 500 }}>{value}</span>
    </div>
  );
}
