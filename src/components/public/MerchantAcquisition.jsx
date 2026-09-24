import React, { useEffect } from "react";
import { ArrowLeft, Store, Sparkles, CheckCircle2, TrendingUp, Users } from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { isPublicCatalogProduct } from "../../lib/cloud/catalog.js";
import { publicUrl } from "../../lib/acquisition.js";
import { trackAcquisition, trackSiteEvent } from "../../lib/acquisitionTrack.js";
import { updatePageSEO, getDefaultSEO } from "../../lib/seo.js";
import ShareBar from "./ShareBar";

const FLOW = [
  { icon: Store, t: "מוצר", d: "מוצר אמיתי עם קישור ובעלות" },
  { icon: CheckCircle2, t: "ולידציה", d: "בדיקת זמינות, זכאות ותנאים אמיתיים" },
  { icon: Sparkles, t: "הזדמנות Luna", d: "התאמה לקהל שנמדד בלייקלינק" },
  { icon: TrendingUp, t: "תוכן", d: "Story, UGC והשוואות מבוססות מוצר" },
  { icon: Users, t: "הפצה", d: "יוצרים משתפים עם attribution" },
  { icon: CheckCircle2, t: "מדידה", d: "צפיות, קליקים ולידים — כשהם אמיתיים" },
];

export default function MerchantAcquisition({ category = null, navigate }) {
  const { lang } = useI18n();
  const L = (he, en) => (lang === "he" ? he : en);
  const { products, marketers } = useMarketplace();
  const realProducts = (products || []).filter((p) => isPublicCatalogProduct(p, marketers));
  const path = category ? `/merchants/${encodeURIComponent(category)}` : "/merchants";

  useEffect(() => {
    trackSiteEvent("merchant_landing_view", { page: path });
    updatePageSEO({ ...getDefaultSEO("home"), title: category ? `סוחרי ${category} | לייקלינק` : "יש לך מוצרים? הצטרפו כסוחרים | לייקלינק", description: "הפכו מוצרים אמיתיים לתגלית, תוכן והזדמנויות מדידה בלייקלינק — בלי להבטיח תוצאות.", url: publicUrl(path), robots: "index,follow", jsonLd: { "@context": "https://schema.org", "@type": "WebPage", name: "LikeLink for merchants", url: publicUrl(path) } });
    return () => updatePageSEO(getDefaultSEO("home"));
  }, [path, category]);
  function openStudio() { trackAcquisition("merchant_cta_click", "פתחת Studio כסוחר", { page: path }); trackSiteEvent("studio_opened", { page: path }); navigate("/studio"); }

  return <div dir="rtl" className="min-h-screen" style={{ background: "var(--bg)", color: "var(--text)" }}><div className="mx-auto max-w-5xl px-4 py-6 pb-24"><button type="button" onClick={() => navigate("/discover")} className="tap mb-6 inline-flex items-center gap-2 text-sm opacity-75"><ArrowLeft size={16} /> {L("חזרה לגילוי", "Back to discovery")}</button>
    <header className="rounded-3xl p-6 md:p-10" style={{ background: "linear-gradient(135deg, rgba(108,76,241,.24), rgba(20,25,54,.95))", border: "1px solid var(--border)" }}><div className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs" style={{ background: "rgba(255,255,255,.08)" }}><Store size={14} color="var(--accent)" /> {L("לסוחרים", "For merchants")}</div><h1 className="text-3xl md:text-5xl font-bold leading-tight">{L("יש לך מוצרים? הצטרפו למסלול הגילוי", "Have products? Join the discovery loop")}</h1><p className="mt-4 max-w-2xl text-sm md:text-base leading-7 opacity-80">{L("מוצר → ולידציה → זכאות → הזדמנות Luna → תוכן → הפצה → מדידה. כל שלב נשען על נתונים אמיתיים של החנות שלך.", "Product → validation → eligibility → Luna opportunity → content → distribution → measurement. Every step relies on real store data.")}</p><div className="mt-6 flex flex-wrap gap-3"><button type="button" onClick={openStudio} data-testid="merchant-cta" className="tap rounded-xl px-5 py-3 font-bold" style={{ background: "var(--accent)", color: "#fff" }}>{L("פתח Studio", "Open Studio")}</button><a href="#flow" className="tap rounded-xl border px-4 py-3 text-sm font-semibold" style={{ borderColor: "var(--border)" }}>{L("ראו את המסלול", "See the flow")}</a></div><p className="mt-4 text-xs opacity-60">{L("אין הבטחת מכירות או תנועה. LikeLink מודד את מה שקורה בפועל.", "No sales or traffic promise. LikeLink measures what actually happens.")}</p></header>
    <section id="flow" className="mt-8"><p className="text-xs uppercase tracking-widest opacity-60">{L("המסלול", "The loop")}</p><h2 className="text-2xl font-bold">{L("מה קורה אחרי שאתם מחברים מוצר", "What happens after you connect a product")}</h2><ol className="mt-5 grid gap-3 md:grid-cols-2">{FLOW.map(({ icon: Icon, t, d }, i) => <li key={t} className="flex gap-3 rounded-2xl p-4" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(108,76,241,.22)", color: "var(--accent)" }}><Icon size={17} /></span><div><p className="font-semibold">{i + 1}. {t}</p><p className="mt-1 text-sm opacity-70">{d}</p></div></li>)}</ol></section>
    <section className="mt-8 rounded-2xl p-5" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}><div className="flex items-center gap-2"><Sparkles size={17} color="var(--accent)" /><h2 className="font-bold">{L("מה כבר קיים בקטלוג?", "What exists in the catalog?")}</h2></div><p className="mt-2 text-sm opacity-75">{L("אם יש מוצרים מאושרים, אפשר לגלות אותם כעכשיו. אם אין — העמוד יישאר כנה ולא ימציא המלצות.", "If approved products exist, they can be discovered now. If not, this page stays honest and invents nothing.")}</p><div className="mt-4 flex flex-wrap gap-2">{realProducts.slice(0, 6).map((p) => <a key={p.id} href={`/p/${encodeURIComponent(p.id)}`} className="tap rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: "var(--border)" }}>{p.title}</a>)}</div></section>
    <div className="mt-8"><ShareBar path={path} title={L("יש לך מוצרים? הצטרפו ללייקלינק", "Have products? Join LikeLink")} text={L("מוצר → ולידציה → Luna → תוכן → הפצה → מדידה", "Product → validation → Luna → content → distribution → measurement")} compact /></div>
  </div></div>;
}
