import React from "react";
import { ArrowUpLeft, Bot, Clapperboard, Play, Sparkles, Users } from "lucide-react";
import { CreatorAvatar } from "../product/ProductComponents";
import { useI18n } from "../../lib/LangContext";
import { isPublicCatalogProduct } from "../../lib/cloud/catalog.js";
import { normalizeImageUrl, money } from "../../utils/helpers.js";

export default function PublicGrowthShowcase({ marketers = [], products = [], videos = [], navigate, onPlay }) {
  const { lang } = useI18n();
  const he = lang === "he";
  const publicProducts = products.filter((p) => isPublicCatalogProduct(p, marketers));
  const creators = marketers.filter(Boolean).slice(0, 6);
  const reels = Array.isArray(videos) ? videos.slice(0, 6) : [];
  const featured = publicProducts.slice(0, 3);

  return (
    <section className="mb-6 overflow-hidden rounded-[28px] border p-4 sm:p-5" style={{ borderColor: "var(--border)", background: "linear-gradient(135deg, rgba(99,102,241,.10), rgba(15,19,33,.92) 58%, rgba(6,182,212,.07))" }} dir={he ? "rtl" : "ltr"}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em]" style={{ color: "var(--accent)" }}>
            <Sparkles size={13} /> LikeLink Studio · Creator Commerce
          </div>
          <h2 className="text-xl font-black tracking-tight sm:text-2xl" style={{ color: "var(--text)" }}>
            {he ? "תוכן, יוצרות ומוצרים — מחוברים לקנייה" : "Creators, UGC and products — connected to checkout"}
          </h2>
          <p className="mt-1 max-w-2xl text-xs sm:text-sm" style={{ color: "var(--text-secondary)" }}>
            {he ? "קונים מגלים. יוצרות בונות סטודיו. Luna מחברת בין תוכן, מוצר, אמון ופעולה." : "Shoppers discover. Creators build. Luna connects content, product, trust and action."}
          </p>
        </div>
        <button type="button" onClick={() => navigate("/sell")} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black" style={{ background: "var(--accent)", color: "#fff" }}>
          <Bot size={14} /> {he ? "פתחי את הסטודיו" : "Open Creator Studio"}
        </button>
      </div>

      {reels.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {reels.map((v, i) => {
            const product = publicProducts.find((p) => p.id === v.productTags?.[0]?.productId) || featured[i % Math.max(featured.length, 1)];
            return (
              <button key={v.id || i} type="button" onClick={() => onPlay?.(v)} className="group relative aspect-[9/14] overflow-hidden rounded-2xl border text-right" style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}>
                {product?.image ? <img src={normalizeImageUrl(product.image)} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" /> : <div className="h-full w-full" />}
                <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-1 text-[9px] font-black text-white"><Play size={10} className="inline" /> UGC</span>
                <span className="absolute bottom-2 left-2 right-2 truncate text-[10px] font-bold text-white">{product?.title || v.title || "Reel"}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed p-4" style={{ borderColor: "var(--border)", background: "rgba(255,255,255,.025)" }}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}><Clapperboard size={22} /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black" style={{ color: "var(--text)" }}>{he ? "וידאו UGC אמיתי יופיע כאן" : "Real UGC video appears here"}</p>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{he ? "אין כרגע וידאו ציבורי מאומת — לא נציג וידאו דמה. אפשר ליצור אותו מהסטודיו." : "There is no verified public reel yet — no demo video is shown. Create one from Studio."}</p>
            </div>
            <button type="button" onClick={() => navigate("/sell")} className="rounded-xl border px-3 py-2 text-xs font-black" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
              {he ? "יצירת UGC" : "Create UGC"} <ArrowUpLeft size={12} className="inline" />
            </button>
          </div>
        </div>
      )}

      {creators.length > 0 && (
        <div className="mt-4 flex items-center gap-3 overflow-x-auto pb-1">
          <div className="flex shrink-0 items-center gap-2 text-xs font-black" style={{ color: "var(--text-secondary)" }}><Users size={14} /> {he ? "יוצרות פעילות" : "Active creators"}</div>
          {creators.map((m) => (
            <button key={m.id} type="button" onClick={() => navigate(`/u/${encodeURIComponent(m.slug || m.id)}`)} className="flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1.5" style={{ borderColor: "var(--border)", background: "rgba(255,255,255,.035)" }}>
              <CreatorAvatar marketer={m} size={26} />
              <span className="max-w-[90px] truncate text-[10px] font-bold" style={{ color: "var(--text)" }}>{m.name || "Creator"}</span>
            </button>
          ))}
        </div>
      )}

      {featured.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {featured.map((p) => (
            <button key={p.id} type="button" onClick={() => navigate(`/p/${encodeURIComponent(p.id)}`)} className="flex items-center gap-3 rounded-2xl border p-2.5 text-right" style={{ borderColor: "var(--border)", background: "rgba(255,255,255,.025)" }}>
              {p.image ? <img src={normalizeImageUrl(p.image)} alt="" className="h-12 w-12 rounded-xl object-cover" loading="lazy" /> : <div className="h-12 w-12 rounded-xl" style={{ background: "var(--bg-subtle)" }} />}
              <span className="min-w-0 flex-1"><strong className="block truncate text-xs" style={{ color: "var(--text)" }}>{p.title}</strong><small style={{ color: "var(--text-muted)" }}>{Number(p.price) > 0 ? money(Number(p.price), lang) : (he ? "מחיר לא זמין" : "Price unavailable")}</small></span>
              <ArrowUpLeft size={13} style={{ color: "var(--accent)" }} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
