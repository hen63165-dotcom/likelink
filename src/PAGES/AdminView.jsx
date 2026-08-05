import React, { useState, useMemo } from "react";
import { Lock, Users, ShoppingBag, MousePointerClick, DollarSign, Check, Flag, Trash2 } from "lucide-react";
import { useI18n } from "../lib/LangContext";
import {
  money, groupByDay, getTopCreatorIds, StatChip, EmptyState, EarningsChart, ProductThumb
} from "./SharedComponents";

const ADMIN_CODE = "hub-admin"; // demo-only client-side gate — replace with real auth before going live

export default function AdminView({ marketers, products, clicks, sales, settings, onSetStatus, onRemove, onSetFee }) {
  const { t, lang } = useI18n();
  const [unlocked, setUnlocked] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [section, setSection] = useState("overview");
  const topIds = useMemo(() => getTopCreatorIds(products), [products]);

  if (!unlocked) {
    return (
      <div className="pt-10 flex flex-col items-center text-center px-2">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "#14121F" }}>
          <Lock size={22} color="#fff" />
        </div>
        <p className="disp text-[18px] font-semibold">{t("admin.accessTitle")}</p>
        <p className="text-[13px] text-[#8B879C] mt-1.5 max-w-[260px]">{t("admin.accessSubtitle")}</p>
        <div className="w-full mt-5 flex flex-col gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value)} type="password" placeholder={t("admin.accessCodePh")} className="w-full rounded-xl px-3.5 py-2.5 text-[14px] outline-none text-center" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }} />
          {err && <p className="text-[12px] text-[#E1483B]">{err}</p>}
          <button onClick={() => (code === ADMIN_CODE ? setUnlocked(true) : setErr(t("admin.incorrect")))} className="tap w-full rounded-2xl py-3 font-semibold text-[14px]" style={{ background: "#14121F", color: "#fff" }}>
            {t("admin.unlock")}
          </button>
        </div>
        <p className="text-[11px] text-[#B4AFC0] mt-3">{t("admin.hint")} {ADMIN_CODE}</p>
      </div>
    );
  }

  const totalFees = sales.reduce((s, x) => s + x.platformFee, 0);
  const totalGMV = sales.reduce((s, x) => s + x.saleAmount, 0);

  return (
    <div className="pt-3 pb-4">
      <div className="w-full flex rounded-full p-1 mb-4" style={{ background: "#F1EFFB" }}>
        {[{ id: "overview", l: t("admin.overview") }, { id: "listings", l: t("admin.listings") }, { id: "creators", l: t("admin.creators") }].map((s) => (
          <button key={s.id} onClick={() => setSection(s.id)} className="tap flex-1 py-2 rounded-full text-[12.5px] font-semibold" style={{ background: section === s.id ? "#fff" : "transparent", color: section === s.id ? "#14121F" : "#8B879C" }}>
            {s.l}
          </button>
        ))}
      </div>

      {section === "overview" && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2.5">
            <StatChip icon={Users} label={t("admin.statCreators")} value={marketers.length} />
            <StatChip icon={ShoppingBag} label={t("admin.statListings")} value={products.length} />
            <StatChip icon={MousePointerClick} label={t("admin.statClicks")} value={clicks.length} />
            <StatChip icon={DollarSign} label={t("admin.statEarnings")} value={money(totalFees, lang)} accent />
          </div>

          <div className="rounded-2xl p-4" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}>
            <p className="text-[12.5px] font-semibold mb-1">{t("admin.gmvTitle")}</p>
            <p className="mono text-[20px] font-semibold">{money(totalGMV, lang)}</p>
            <p className="text-[11.5px] text-[#8B879C] mt-1">{t("admin.gmvSub")} {sales.length} {t("admin.gmvSalesWord")}</p>
          </div>

          <EarningsChart title={t("admin.earningsChart")} data={groupByDay(sales, "platformFee")} lang={lang} />

          <div className="rounded-2xl p-4" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12.5px] font-semibold">{t("admin.feeTitle")}</p>
              <span className="mono text-[15px] font-semibold" style={{ color: "#6C4CF1" }}>{settings.platformFeePercent}%</span>
            </div>
            <input type="range" min={0} max={40} step={1} value={settings.platformFeePercent} onChange={(e) => onSetFee(Number(e.target.value))} className="w-full accent-[#6C4CF1]" />
            <p className="text-[11px] text-[#B4AFC0] mt-1.5">{t("admin.feeNote")}</p>
          </div>
        </div>
      )}

      {section === "listings" && (
        <div className="flex flex-col gap-2.5">
          {products.length === 0 && <EmptyState icon={ShoppingBag} title={t("admin.emptyListings")} body={t("admin.emptyListingsBody")} />}
          {products.sort((a, b) => b.createdAt - a.createdAt).map((p) => (
            <AdminListingRow key={p.id} p={p} onSetStatus={onSetStatus} onRemove={onRemove} />
          ))}
        </div>
      )}

      {section === "creators" && (
        <div className="flex flex-col gap-2.5">
          {marketers.length === 0 && <EmptyState icon={Users} title={t("admin.emptyCreators")} body={t("admin.emptyCreatorsBody")} />}
          {marketers.map((m) => {
            const theirs = products.filter((p) => p.marketerId === m.id);
            const theirClicks = theirs.reduce((s, p) => s + (p.clicks || 0), 0);
            const theirFees = sales.filter((s) => s.marketerId === m.id).reduce((s, x) => s + x.platformFee, 0);
            return (
              <div key={m.id} className="rounded-2xl p-3.5 flex items-center gap-3" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 disp font-semibold text-[14px]" style={{ background: "#F1EFFB", color: "#6C4CF1" }}>
                  {m.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-semibold truncate flex items-center gap-1">{m.name} {topIds.has(m.id) && <TopBadge />}</p>
                  <p className="text-[11.5px] text-[#8B879C] truncate">{m.email}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="mono text-[12.5px] font-semibold">{theirs.length} <span className="text-[10px] text-[#B4AFC0] font-normal">{t("admin.listingsWord")}</span></p>
                  <p className="mono text-[11px] text-[#8B879C]">{theirClicks} {t("admin.clicksFeesWord")} · {money(theirFees, lang)} {t("admin.feesWord")}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdminListingRow({ p, onSetStatus, onRemove }) {
  const { t, categoryLabel } = useI18n();
  const statusStyle = {
    approved: { bg: "#E9FBF4", fg: "#00966F" },
    pending: { bg: "#FEF6E7", fg: "#B5820E" },
    flagged: { bg: "#FBEAEA", fg: "#C6392E" },
  }[p.status] || { bg: "#F1EFFB", fg: "#6C4CF1" };

  return (
    <div className="rounded-2xl p-3 flex gap-3" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}>
      <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0"><ProductThumb p={p} /></div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-semibold truncate">{p.title}</p>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: statusStyle.bg, color: statusStyle.fg }}>{p.status}</span>
        </div>
        <p className="text-[11.5px] text-[#8B879C] mt-0.5">{categoryLabel(p.category)} · {p.clicks || 0}</p>
        <div className="flex gap-1.5 mt-2">
          {p.status !== "approved" && <IconAction onClick={() => onSetStatus(p.id, "approved")} icon={Check} label={t("admin.approve")} tone="ok" />}
          {p.status !== "flagged" && <IconAction onClick={() => onSetStatus(p.id, "flagged")} icon={Flag} label={t("admin.flag")} tone="warn" />}
          <IconAction onClick={() => onRemove(p.id)} icon={Trash2} label={t("sell.remove")} tone="danger" />
        </div>
      </div>
    </div>
  );
}

function IconAction({ onClick, icon: Icon, label, tone }) {
  const styles = {
    ok: { bg: "#E9FBF4", fg: "#00966F" },
    warn: { bg: "#FEF6E7", fg: "#B5820E" },
    danger: { bg: "#FBEAEA", fg: "#C6392E" },
  }[tone];
  return (
    <button onClick={onClick} className="tap flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: styles.bg, color: styles.fg }}>
      <Icon size={11} /> {label}
    </button>
  );
}

function TopBadge() {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "#FFF4DC", color: "#B5820E" }}>
      <Check size={8} color="#B5820E" /> {t("badge.top")}
    </span>
  );
}
