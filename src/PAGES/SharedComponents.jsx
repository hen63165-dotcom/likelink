import React from "react";
import {
  Heart, Star, ImageOff, ShoppingBag, TrendingUp, Users, MousePointerClick, DollarSign, X, ExternalLink
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useI18n } from "../lib/LangContext";

export const CURRENCY = { he: "₪", en: "$" };

export const money = (n, lang = "en") => {
  return `${CURRENCY[lang] || "$"}${(Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2)}`;
};

export function groupByDay(sales, valueKey, days = 14) {
  const now = new Date();
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets.push({ key, label: `${d.getDate()}/${d.getMonth() + 1}`, value: 0 });
  }
  const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]));
  sales.forEach((s) => {
    const key = new Date(s.ts).toISOString().slice(0, 10);
    if (byKey[key]) byKey[key].value += s[valueKey] || 0;
  });
  return buckets;
}

export function getTopCreatorIds(products, n = 3) {
  const totals = {};
  products.forEach((p) => {
    if (p.status === "approved") totals[p.marketerId] = (totals[p.marketerId] || 0) + (p.clicks || 0);
  });
  return new Set(
    Object.entries(totals)
      .filter(([, c]) => c > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([id]) => id)
  );
}

export function EmptyState({ icon: Icon, title, body }) {
  return (
    <div className="flex flex-col items-center text-center py-16 px-6">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "#F1EFFB" }}>
        <Icon size={24} color="#6C4CF1" />
      </div>
      <p className="disp text-[16px] font-semibold">{title}</p>
      <p className="text-[13.5px] text-[#8B879C] mt-1.5 max-w-[280px]">{body}</p>
    </div>
  );
}

export function ProductThumb({ p }) {
  return p.image ? (
    <img src={p.image} alt={p.title} className="w-full h-full object-cover" />
  ) : (
    <div className="w-full h-full flex items-center justify-center" style={{ background: "#F1EFFB" }}>
      <ImageOff size={20} color="#B9AEF0" />
    </div>
  );
}

export function FavButton({ isFav, onToggle, floating }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={"tap flex items-center justify-center rounded-full " + (floating ? "absolute top-2 w-7 h-7" : "w-7 h-7")}
      style={{ insetInlineEnd: floating ? 8 : undefined, background: floating ? "rgba(255,255,255,0.92)" : "transparent" }}
    >
      <Heart size={15} color={isFav ? "#E1483B" : "#8B879C"} fill={isFav ? "#E1483B" : "none"} />
    </button>
  );
}

export function TopBadge() {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "#FFF4DC", color: "#B5820E" }}>
      <Star size={8} fill="#B5820E" /> {t("badge.top")}
    </span>
  );
}

export function ProductCard({ p, creator, isTop, lang, isFav, onToggleFavorite, onOpen }) {
  return (
    <button onClick={onOpen} className="tap text-left w-full">
      <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}>
        <div className="w-full aspect-[4/5] overflow-hidden relative">
          <ProductThumb p={p} />
          <FavButton isFav={isFav} onToggle={onToggleFavorite} floating />
        </div>
        <div className="p-2.5">
          <p className="text-[13px] font-semibold leading-snug line-clamp-2">{p.title}</p>
          <div className="flex items-center justify-between mt-1.5 gap-1">
            <span className="text-[11px] text-[#8B879C] truncate flex items-center gap-1">{creator} {isTop && <TopBadge />}</span>
            {p.price > 0 && <span className="mono text-[12px] font-medium shrink-0">{money(p.price, lang)}</span>}
          </div>
        </div>
      </div>
    </button>
  );
}

export function StreamCard({ p, creator, isTop, lang, isFav, onToggleFavorite, onOpen }) {
  const { categoryLabel } = useI18n();
  return (
    <button onClick={onOpen} className="tap text-left w-full">
      <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}>
        <div className="w-full aspect-[16/10] overflow-hidden relative">
          <ProductThumb p={p} />
          <FavButton isFav={isFav} onToggle={onToggleFavorite} floating />
        </div>
        <div className="p-3.5">
          <span className="text-[10.5px] uppercase tracking-wide font-semibold" style={{ color: "#6C4CF1" }}>{categoryLabel(p.category)}</span>
          <p className="text-[15px] font-semibold leading-snug mt-1">{p.title}</p>
          <p className="text-[13px] text-[#8B879C] mt-1 line-clamp-2">{p.description}</p>
          <div className="flex items-center justify-between mt-3 gap-1">
            <span className="text-[12px] text-[#8B879C] flex items-center gap-1">{creator} {isTop && <TopBadge />}</span>
            {p.price > 0 && <span className="mono text-[13px] font-semibold shrink-0">{money(p.price, lang)}</span>}
          </div>
        </div>
      </div>
    </button>
  );
}

export function ProductModal({ product, creator, isTop, lang, isFav, onToggleFavorite, onClose, onGetDeal }) {
  const { t, categoryLabel } = useI18n();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(20,18,31,0.55)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[520px] rounded-t-3xl overflow-hidden max-h-[88vh] flex flex-col" style={{ background: "#FFFFFF" }}>
        <div className="w-full aspect-[4/3] relative shrink-0">
          <ProductThumb p={product} />
          <button onClick={onClose} className="tap absolute top-3 w-8 h-8 rounded-full flex items-center justify-center" style={{ insetInlineEnd: 12, background: "rgba(20,18,31,0.6)" }}>
            <X size={16} color="#fff" />
          </button>
          <div className="absolute top-3" style={{ insetInlineStart: 12 }}>
            <FavButton isFav={isFav} onToggle={onToggleFavorite} floating />
          </div>
        </div>
        <div className="p-5 overflow-y-auto">
          <span className="text-[10.5px] uppercase tracking-wide font-semibold" style={{ color: "#6C4CF1" }}>{categoryLabel(product.category)}</span>
          <h2 className="disp text-[20px] font-semibold mt-1 leading-tight">{product.title}</h2>
          <p className="text-[13.5px] text-[#8B879C] mt-1 flex items-center gap-1">{t("feed.by")} {creator} {isTop && <TopBadge />}</p>
          <p className="text-[14px] leading-relaxed mt-3" style={{ color: "#4A4658" }}>{product.description}</p>
          {product.price > 0 && <p className="mono text-[18px] font-semibold mt-4">{money(product.price, lang)}</p>}
          <button onClick={onGetDeal} className="tap w-full mt-5 rounded-2xl py-3.5 flex items-center justify-center gap-2 font-semibold text-[15px]" style={{ background: "#6C4CF1", color: "#fff" }}>
            {t("feed.getDeal")} <ExternalLink size={16} />
          </button>
          <p className="text-[11px] text-center text-[#B4AFC0] mt-2.5">{t("feed.opensNewTab")}</p>
        </div>
      </div>
    </div>
  );
}

export function StatChip({ icon: Icon, label, value, accent }) {
  return (
    <div className="rounded-2xl p-3 flex flex-col gap-1.5" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}>
      <Icon size={15} color={accent ? "#00C896" : "#6C4CF1"} />
      <span className="mono text-[15px] font-semibold leading-none" style={{ color: accent ? "#00C896" : "#14121F" }}>{value}</span>
      <span className="text-[10.5px] text-[#8B879C]">{label}</span>
    </div>
  );
}

export function EarningsChart({ title, data, lang }) {
  const hasData = data.some((d) => d.value > 0);
  return (
    <div className="rounded-2xl p-4 mb-5" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}>
      <p className="text-[12.5px] font-semibold mb-2">{title}</p>
      {!hasData ? (
        <div className="h-[120px] flex items-center justify-center">
          <p className="text-[12px] text-[#B4AFC0]">—</p>
        </div>
      ) : (
        <div style={{ width: "100%", height: 120 }}>
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="earningsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6C4CF1" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#6C4CF1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#B4AFC0" }} axisLine={false} tickLine={false} interval={2} />
              <YAxis hide domain={[0, "auto"]} />
              <Tooltip
                formatter={(v) => [money(v, lang), ""]}
                labelFormatter={() => ""}
                contentStyle={{ borderRadius: 10, border: "1px solid #ECEAF3", fontSize: 11 }}
              />
              <Area type="monotone" dataKey="value" stroke="#6C4CF1" strokeWidth={2} fill="url(#earningsFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export function LabeledInput({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-[#4A4658]">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-xl px-3.5 py-2.5 text-[14px] outline-none" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }} />
    </label>
  );
}

export function LabeledTextarea({ label, value, onChange, placeholder }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-[#4A4658]">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} className="w-full rounded-xl px-3.5 py-2.5 text-[14px] outline-none resize-none" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }} />
    </label>
  );
}
