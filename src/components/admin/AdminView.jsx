import React, { useState, useMemo, lazy, Suspense } from "react";
import { Lock, Users, ShoppingBag, MousePointerClick, DollarSign, Check, Flag, Trash2, CircleAlert } from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { money, groupByDay, getTopCreatorIds } from "../../utils/helpers";
import { StatChip, EmptyState, Button } from "../ui";
import { ProductThumb } from "../product/ProductComponents";
import { ADMIN_CODE } from "../../constants/keys";
import { buildGoogleFeed, FEED_FILE_NAME } from "../../lib/googleFeed";

// Loaded on demand so the heavy charting library stays out of the main bundle.
const EarningsChart = lazy(() => import("../charts/EarningsChart").then(m => ({ default: m.EarningsChart })));

export default function AdminView() {
  const { t, lang } = useI18n();
  const { marketers, products, clicks, sales, settings, onSetStatus, onRemove, onSetFee } = useMarketplace();
  
  const [unlocked, setUnlocked] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [section, setSection] = useState("overview");
  
  const topIds = useMemo(() => getTopCreatorIds(products), [products]);

  const approvedCount = products.filter((p) => p.status === "approved").length;

  function downloadGoogleFeed() {
    const xml = buildGoogleFeed({
      products,
      marketers,
      baseUrl: window.location.origin,
    });
    const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = FEED_FILE_NAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const feedEndpoint = `${window.location.origin}/api/google-feed`;

  if (!unlocked) {
    return (
      <div className="pt-10 flex flex-col items-center text-center px-4">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 surface shadow-sm">
          <Lock size={24} style={{ color: "var(--text)" }} />
        </div>
        <p className="disp text-xl font-semibold">{t("admin.accessTitle")}</p>
        <p className="text-sm text-muted mt-2 max-w-[280px]">{t("admin.accessSubtitle")}</p>
        
        <div className="w-full mt-6 flex flex-col gap-3">
          <input 
            value={code} 
            onChange={(e) => { setCode(e.target.value); setErr(""); }} 
            type="password" 
            placeholder={t("admin.accessCodePh")} 
            className="input-field w-full rounded-xl px-4 py-3 text-sm text-center font-mono tracking-widest" 
          />
          {err && <p className="text-xs flex items-center justify-center gap-1" style={{ color: "var(--danger)" }}><CircleAlert size={13} /> {err}</p>}
          <Button onClick={() => (ADMIN_CODE && code === ADMIN_CODE ? setUnlocked(true) : setErr(t("admin.incorrect")))}>
            {t("admin.unlock")}
          </Button>
        </div>
        {!ADMIN_CODE ? (
          <p className="text-[11px] text-faint mt-4 leading-relaxed max-w-[280px]">{t("admin.notConfigured")}</p>
        ) : null}
      </div>
    );
  }

  const totalFees = sales.reduce((s, x) => s + x.platformFee, 0);
  const totalGMV = sales.reduce((s, x) => s + x.saleAmount, 0);

  return (
    <div className="pt-4 pb-10">
      <div className="flex rounded-full p-1 mb-6 surface-subtle">
        {[
          { id: "overview", l: t("admin.overview") }, 
          { id: "listings", l: t("admin.listings") }, 
          { id: "creators", l: t("admin.creators") }
        ].map((s) => (
          <button 
            key={s.id} 
            onClick={() => setSection(s.id)} 
            className="tap flex-1 py-2 rounded-full text-xs font-semibold transition-colors" 
            style={{ 
              background: section === s.id ? "var(--bg-elevated)" : "transparent", 
              color: section === s.id ? "var(--text)" : "var(--text-muted)" 
            }}
          >
            {s.l}
          </button>
        ))}
      </div>

      {section === "overview" && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3">
            <StatChip icon={Users} label={t("admin.statCreators")} value={marketers.length} />
            <StatChip icon={ShoppingBag} label={t("admin.statListings")} value={products.length} />
            <StatChip icon={MousePointerClick} label={t("admin.statClicks")} value={clicks.length} />
            <StatChip icon={DollarSign} label={t("admin.statEarnings")} value={money(totalFees, lang)} accent />
          </div>

          <div className="surface rounded-2xl p-5 shadow-sm">
            <p className="text-xs font-semibold text-muted mb-1 uppercase tracking-wider">{t("admin.gmvTitle")}</p>
            <p className="mono text-2xl font-bold">{money(totalGMV, lang)}</p>
            <p className="text-xs text-muted mt-1.5">{t("admin.gmvSub")} {sales.length} {t("admin.gmvSalesWord")}</p>
          </div>

          <Suspense fallback={null}>
            <EarningsChart title={t("admin.earningsChart")} data={groupByDay(sales, "platformFee")} lang={lang} />
          </Suspense>

          <div className="surface rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold">{t("admin.feeTitle")}</p>
              <span className="mono text-lg font-bold" style={{ color: "var(--accent)" }}>{settings.platformFeePercent}%</span>
            </div>
            <input 
              type="range" 
              min={0} 
              max={40} 
              step={1} 
              value={settings.platformFeePercent} 
              onChange={(e) => onSetFee(Number(e.target.value))} 
              className="w-full h-1.5 bg-surface-subtle rounded-lg appearance-none cursor-pointer accent-primary" 
            />
            <p className="text-[11px] text-faint mt-3 leading-relaxed">{t("admin.feeNote")}</p>
          </div>

          <div className="surface rounded-2xl p-5 shadow-sm">
            <p className="text-sm font-semibold flex items-center justify-between">
              Google Merchant Feed
              <span className="mono text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
                {approvedCount} products
              </span>
            </p>
            <p className="text-xs text-muted mt-1.5 leading-relaxed">
              Generates a valid RSS XML feed (g:id, g:title, g:description, g:link,
              g:image_link, g:price, g:availability, g:brand) uploadable to Google
              Merchant Center.
            </p>
            <div className="flex flex-col gap-2.5 mt-4">
              <Button variant="primary" onClick={() => { downloadGoogleFeed(); }}>
                Download {FEED_FILE_NAME}
              </Button>
              <p className="text-[10.5px] text-faint leading-relaxed">
                {"Deployed endpoint (scheduled fetch URL):"}
              </p>
              <button
                type="button"
                onClick={() => { navigator.clipboard?.writeText(feedEndpoint); }}
                className="tap text-left mono text-[11px] px-3 py-2 rounded-lg truncate"
                style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}
                title={feedEndpoint}
              >
                {feedEndpoint}
              </button>
            </div>
          </div>
        </div>
      )}

      {section === "listings" && (
        <div className="flex flex-col gap-3">
          {products.length === 0 && <EmptyState icon={ShoppingBag} title={t("admin.emptyListings")} body={t("admin.emptyListingsBody")} />}
          {[...products].sort((a, b) => b.createdAt - a.createdAt).map((p) => (
            <AdminListingRow key={p.id} p={p} onSetStatus={onSetStatus} onRemove={onRemove} />
          ))}
        </div>
      )}

      {section === "creators" && (
        <div className="flex flex-col gap-3">
          {marketers.length === 0 && <EmptyState icon={Users} title={t("admin.emptyCreators")} body={t("admin.emptyCreatorsBody")} />}
          {marketers.map((m) => {
            const theirs = products.filter((p) => p.marketerId === m.id);
            const theirClicks = theirs.reduce((s, p) => s + (p.clicks || 0), 0);
            const theirFees = sales.filter((s) => s.marketerId === m.id).reduce((s, x) => s + x.platformFee, 0);
            return (
              <div key={m.id} className="surface rounded-2xl p-4 flex items-center gap-4 shadow-sm">
                <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 disp font-bold text-lg" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
                  {m.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate flex items-center gap-1.5">{m.name} {topIds.has(m.id) && <TopBadge />}</p>
                  <p className="text-xs text-muted truncate">{m.email}</p>
                </div>
                <div className="text-end shrink-0">
                  <p className="mono text-sm font-bold">{theirs.length} <span className="text-[10px] text-muted font-normal uppercase tracking-tighter">{t("admin.listingsWord")}</span></p>
                  <p className="mono text-[10px] text-muted mt-0.5">{theirClicks} {t("admin.clicksFeesWord")} · {money(theirFees, lang)}</p>
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
  const statusStyles = {
    approved: { bg: "var(--success-subtle)", fg: "var(--success)" },
    pending: { bg: "var(--warning-subtle)", fg: "var(--warning)" },
    flagged: { bg: "var(--danger-subtle)", fg: "var(--danger)" },
  };
  const style = statusStyles[p.status] || { bg: "var(--bg-subtle)", fg: "var(--text-muted)" };

  return (
    <div className="surface rounded-2xl p-3.5 flex gap-4 shadow-sm">
      <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 surface-subtle">
        <ProductThumb p={p} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-sm font-semibold truncate">{p.title}</p>
          <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0" style={{ background: style.bg, color: style.fg }}>
            {t(`status.${p.status}`)}
          </span>
        </div>
        <p className="text-xs text-muted mb-3 flex items-center gap-1.5">
          {categoryLabel(p.category)} <span className="opacity-30">•</span> <MousePointerClick size={12} /> {p.clicks || 0}
        </p>
        <div className="flex gap-2">
          {p.status !== "approved" && (
            <button 
              onClick={() => onSetStatus(p.id, "approved")} 
              className="tap flex items-center gap-1.5 text-[10.5px] font-bold px-3 py-1.5 rounded-lg" 
              style={{ background: "var(--success-subtle)", color: "var(--success)" }}
            >
              <Check size={13} /> {t("admin.approve")}
            </button>
          )}
          {p.status !== "flagged" && (
            <button 
              onClick={() => onSetStatus(p.id, "flagged")} 
              className="tap flex items-center gap-1.5 text-[10.5px] font-bold px-3 py-1.5 rounded-lg" 
              style={{ background: "var(--warning-subtle)", color: "var(--warning)" }}
            >
              <Flag size={13} /> {t("admin.flag")}
            </button>
          )}
          <button 
            onClick={() => onRemove(p.id)} 
            className="tap flex items-center gap-1.5 text-[10.5px] font-bold px-3 py-1.5 rounded-lg" 
            style={{ background: "var(--danger-subtle)", color: "var(--danger)" }}
          >
            <Trash2 size={13} /> {t("sell.remove")}
          </button>
        </div>
      </div>
    </div>
  );
}

function TopBadge() {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: "var(--warning-subtle)", color: "var(--warning)" }}>
      <Check size={10} /> {t("badge.top")}
    </span>
  );
}
