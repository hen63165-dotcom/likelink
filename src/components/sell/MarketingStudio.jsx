import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Share2, Copy, Download, ExternalLink, ShoppingBag, MousePointerClick,
  DollarSign, BarChart3, MessageCircle, Image as ImageIcon, Check,
} from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { money } from "../../utils/helpers";
import {
  buildCampaign,
  buildCampaignReport,
  whatsAppChatUrl,
  toText,
} from "../../lib/marketingFeed";
import { StatChip, Button, EmptyState } from "../ui";
import { ProductThumb } from "../product/ProductComponents";

const CURRENCY = "ILS"; // Likelink prices are in ILS (₪)

export default function MarketingStudio({ marketer, products = [], sales = [], showToast }) {
  const { lang, categoryLabel } = useI18n();
  const [campaign, setCampaign] = useState(null);

  const approved = (products || []).filter((p) => p && p.status === "approved");
  const base = typeof window !== "undefined" ? window.location.origin : "https://www.likelink.com";
  const report = buildCampaignReport({ products, sales });
  const ref = toText(marketer?.trackingId, "");

  async function copy(text, label = "הקישור הועתק") {
    try {
      await navigator.clipboard.writeText(text);
      showToast?.(label);
    } catch {
      showToast?.(text);
    }
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openWhatsApp(url) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const stats = [
    { label: "מוצרים בפיד", value: approved.length, icon: ShoppingBag, color: "var(--accent)" },
    { label: "קליקים שמותר גשום", value: report.totalClicks.toLocaleString("he-IL"), icon: MousePointerClick, color: "var(--accent-2)" },
    { label: "מכירות שהוחלטו", value: report.totalSales.toLocaleString("he-IL"), icon: ShoppingBag, color: "#10b981" },
    { label: "רווח משולב", value: money(report.totalCommission, lang), icon: DollarSign, color: "#f59e0b" },
  ];

  return (
    <>
      <div className="pt-4 pb-16">
        {/* HEADER */}}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="disp text-xl font-semibold">שיווק וקמפיינים</h2>
            <p className="text-xs text-muted mt-0.5">ייצר קישורים שמודדים, הודעות וואטסאפ וכיתובי פרסום מותאמים לכל מוצר — בעברית, עם מעקב ישיר אליך.</p>
          </div>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("likelink:marketing-refresh"))}
            className="tap w-8 h-8 rounded-xl flex items-center justify-center surface"
            aria-label="רענן נתונים"
          >
            <BarChart3 size={16} style={{ color: "var(--accent)" }} />
          </button>
        </div>

        {/* STATS */}}
        <div className="grid grid-cols-2 gap-3 mb-5">
          {stats.map((s) => (
            <StatChip key={s.label} icon={s.icon} label={s.label} value={s.value} />
          ))}
        </div>

        {/* Campaign creation */}}
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold">יצירת קמפיין למוצר</p>
          <span className="text-[10px] text-muted">
            מזהה מעקב: {ref ? <span className="mono mono">{ref}</span> : "לא מוגדר — עדכן בפרופיל"}
          </span>
        </div>

        {approved.length === 0 ? (
          <EmptyState icon={ShoppingBag} title="אין לך עדיין מוצרים מאושרים" body="אשרו מוצרים בטאב 'מוצרים' לפני שתייצרו קמפיינים שיווקיים." />
        ) : (
          <div className="flex flex-col gap-3">
            {approved.map((p) => (
              <div key={p.id} className="surface rounded-2xl p-3 flex gap-3 shadow-sm">
                <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0">
                  <ProductThumb p={p} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{p.title}</p>
                  <p className="text-xs text-muted mt-0.5">{categoryLabel(p.category)} · {money(p.price, lang)}</p>
                  <p className="text-xs text-muted mt-0.5 flex items-center gap-1">
                    <MousePointerClick size={11} /> {p.clicks || 0} קליקים
                  </p>
                </div>
                <Button
                  variant="dark"
                  className="shrink-0"
                  onClick={() => setCampaign(buildCampaign(p, marketer, { baseUrl: base, currency: CURRENCY }))}
                >
                  <Share2 size={14} /> קמפיין
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Campaign builder modal */}}
        <CampaignModal
          campaign={campaign}
          lang={lang}
          onClose={() => setCampaign(null)}
          onCopy={copy}
          onDownload={downloadText}
          onWhatsApp={openWhatsApp}
        />

        {/* Performance report */}}
        <PerformanceReport report={report} lang={lang} />
      </div>
    </>
  );
}
