import React, { useEffect, useMemo, useState } from "react";
import {
  Activity, BarChart3, Bot, CheckCircle2, Clapperboard, ExternalLink,
  FileText, Megaphone, Package, Radio, Send, ShieldCheck, Sparkles,
  Users, Video, Wand2,
} from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { money } from "../../utils/helpers";

function Metric({ icon: Icon, value, label, tone = "accent" }) {
  return (
    <div className="ll-command-metric">
      <div className={`ll-command-icon ll-command-icon-${tone}`}><Icon size={17} /></div>
      <div className="ll-command-value">{value}</div>
      <div className="ll-command-label">{label}</div>
    </div>
  );
}

function RealBadge({ children, muted = false }) {
  return (
    <span className={`ll-command-badge ${muted ? "is-muted" : ""}`}>
      <span className="ll-command-dot" />{children}
    </span>
  );
}

export default function CreatorCommandCenter({ onNavigate }) {
  const { lang } = useI18n();
  const { products, sales, clicks, activityFeed, currentMarketer } = useMarketplace();
  const [ugcAsset, setUgcAsset] = useState(null);
  const [ugcLoading, setUgcLoading] = useState(false);
  const he = lang === "he";
  const list = Array.isArray(products) ? products : [];
  const orders = Array.isArray(sales) ? sales : [];
  const clickList = Array.isArray(clicks) ? clicks : [];
  const approved = useMemo(() => list.filter(p => p?.status === "approved" || p?.status === "active" || p?.status === "published"), [list]);
  const revenue = useMemo(() => orders.reduce((sum, s) => sum + (Number(s?.amount) || 0), 0), [orders]);
  const verified = useMemo(() => list.filter(p => p?.trust?.verified || p?.trustLevel === "VERIFIED").length, [list]);
  const live = useMemo(() => list.filter(p => p?.status === "active" || p?.status === "published").length, [list]);
  const topProducts = useMemo(() => [...list].sort((a,b) => (Number(b?.clicks)||0) - (Number(a?.clicks)||0)).slice(0, 4), [list]);
  const recent = useMemo(() => (Array.isArray(activityFeed) ? activityFeed : []).slice(0, 5), [activityFeed]);

  useEffect(() => {
    let cancelled = false;
    const loadUgc = async () => {
      if (!currentMarketer || !topProducts[0]?.id) return;
      setUgcLoading(true);
      try {
        const token = typeof window !== "undefined" ? window.__likelink?.token || "" : "";
        const res = await fetch(`/api/store?mode=ugc-assets&productId=${encodeURIComponent(topProducts[0].id)}`, {
          headers: token ? { authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && data.ok) {
          const assets = data.products?.[0]?.assets || [];
          setUgcAsset(assets[0] || null);
        }
      } catch {} finally {
        if (!cancelled) setUgcLoading(false);
      }
    };
    loadUgc();
    const interval = setInterval(loadUgc, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [currentMarketer, topProducts[0]?.id]);

  const action = (view) => onNavigate?.(view);

  return (
    <div className="ll-command-center">
      <section className="ll-command-hero">
        <div className="ll-command-hero-copy">
          <div className="ll-command-kicker"><Sparkles size={14} /> {he ? "LIKE LINK 2 · CREATOR GROWTH OS" : "LIKE LINK 2 · CREATOR GROWTH OS"}</div>
          <h2>{he ? "הסטודיו החכם שלך ליצירה, תוכן, UGC וצמיחה" : "Your command center for creation, UGC, distribution and growth"}</h2>
          <p>{he ? "Luna מחברת את המוצרים והנתונים האמיתיים שלך ליצירה, הפצה ומדידה. שום מספר לא נוצר רק כדי להיראות טוב." : "Luna connects your real products and signals to creation, distribution and measurement. No invented numbers."}</p>
          <div className="ll-command-actions">
            <button className="ll-command-primary" onClick={() => action("luna")}><Bot size={16} />{he ? "פתיחת Luna" : "Open Luna"}</button>
            <button className="ll-command-secondary" onClick={() => action("content")}><Wand2 size={16} />{he ? "יצירת תוכן" : "Create content"}</button>
            <RealBadge>{currentMarketer ? (he ? "חשבון מחובר" : "Account connected") : (he ? "מצב אורח" : "Guest mode")}</RealBadge>
          </div>
        </div>
        <div className="ll-command-hero-side">
          <div className="ll-command-orbit"><Sparkles size={30} /></div>
          <div>
            <div className="ll-command-side-title">{he ? "Luna · שכבת הבקרה" : "Luna · Control layer"}</div>
            <div className="ll-command-side-text">{he ? "מנתחת → יוצרת → מבקשת אישור → מפרסמת → מודדת" : "Analyze → create → approve → publish → measure"}</div>
          </div>
        </div>
      </section>

      <section className="ll-command-metrics">
        <Metric icon={Package} value={live} label={he ? "מוצרים חיים" : "Live products"} />
        <Metric icon={Activity} value={clickList.length} label={he ? "קליקים אמיתיים" : "Real clicks"} tone="cyan" />
        <Metric icon={BarChart3} value={money(revenue, lang)} label={he ? "הכנסות שנרשמו" : "Recorded revenue"} tone="violet" />
        <Metric icon={ShieldCheck} value={`${verified}/${list.length}`} label={he ? "מוצרים מאומתים" : "Trust verified"} tone="green" />
      </section>

      <section className="ll-command-ugc-strip">
        <div className="ll-command-ugc-copy">
          <div className="ll-command-kicker"><Sparkles size={13} /> UGC CREATOR LAB</div>
          <h3>{he ? "Luna + דוגמנית AI → תוכן שמוכן להפצה" : "Luna + AI creator → distribution-ready content"}</h3>
          <p>{he ? "התמונה והווידאו נוצרים רק ממוצר אמיתי. אם כבר נוצר asset הוא מופיע כאן; אחרת זה מצב ריק אמיתי עם כניסה ישירה לסטודיו UGC." : "Media is generated only from a real product. If an asset exists it appears here; otherwise this is a truthful empty state with a direct path to UGC Studio."}</p>
          <div className="ll-command-ugc-actions">
            <button onClick={() => action("ugc")}><Bot size={15}/>{he ? "פתיחת UGC Studio" : "Open UGC Studio"}</button>
            <RealBadge muted={!ugcAsset}>{ugcAsset ? (he ? "נוצר בענן" : "Cloud asset ready") : (he ? "עדיין לא נוצר UGC" : "No UGC asset yet")}</RealBadge>
          </div>
        </div>
        <div className="ll-command-ugc-media">
          {ugcAsset?.videoUrl ? (
            <>
              <video src={ugcAsset.videoUrl} controls playsInline preload="metadata" aria-label={he ? "וידאו UGC אמיתי" : "Real UGC video"} />
              <span className="ll-command-ugc-video"><Video size={12}/> VIDEO READY</span>
            </>
          ) : ugcAsset?.imageUrl ? (
            <>
              <img src={ugcAsset.imageUrl} alt="" />
              {ugcAsset?.videoJobId && <span className="ll-command-ugc-video"><Video size={12}/> {ugcAsset.videoStatus || "VIDEO PROCESSING"}</span>}
            </>
          ) : (
            <div className="ll-command-ugc-empty">{ugcLoading ? (he ? "טוען מצב ענן…" : "Loading cloud state…") : (he ? "אין עדיין UGC אמיתי" : "No real UGC yet")}<span>{he ? "המערכת לא מייצרת מדיה מדומה כדי למלא מקום. פתחי את UGC Studio כדי ליצור וידאו אמיתי בענן." : "The system does not create demo media just to fill space. Open UGC Studio to create a real cloud video."}</span></div>
          )}
        </div>
      </section>

      <section className="ll-command-grid">
        <div className="ll-command-panel ll-command-products">
          <div className="ll-command-panel-head">
            <div><div className="ll-command-title">{he ? "מוצרים ו-UGC" : "Products & UGC"}</div><div className="ll-command-sub">{he ? "מהקטלוג האמיתי שלך" : "From your real catalog"}</div></div>
            <button className="ll-command-link" onClick={() => action("products")}>{he ? "ניהול מוצרים" : "Manage products"} <ExternalLink size={13} /></button>
          </div>
          {topProducts.length ? (
            <div className="ll-command-product-grid">
              {topProducts.map((p) => (
                <article className="ll-command-product" key={p.id || p.title}>
                  <div className="ll-command-product-image">
                    {p.image ? <img src={p.image} alt="" /> : <Package size={25} />}
                    <span>{p.status === "approved" || p.status === "active" || p.status === "published" ? "LIVE" : "PENDING"}</span>
                  </div>
                  <div className="ll-command-product-body">
                    <strong>{p.title || (he ? "מוצר" : "Product")}</strong>
                    <div>{Number(p.price) > 0 ? money(Number(p.price), lang) : (he ? "מחיר לא זמין" : "Price unavailable")}</div>
                    <small>{Number(p.clicks)||0} {he ? "קליקים" : "clicks"} · {Number(p.sales)||0} {he ? "מכירות" : "sales"}</small>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="ll-command-empty"><Package size={28} /><strong>{he ? "אין עדיין מוצר אמיתי להצגה" : "No real product to show yet"}</strong><span>{he ? "הוסיפי מוצר מאושר והוא יופיע כאן אוטומטית." : "Add an approved product and it will appear here automatically."}</span><button onClick={() => action("products")}>{he ? "הוספת מוצר" : "Add product"}</button></div>
          )}
        </div>

        <aside className="ll-command-panel ll-command-distribution">
          <div className="ll-command-panel-head">
            <div><div className="ll-command-title">{he ? "הפצה חיצונית" : "External distribution"}</div><div className="ll-command-sub">{he ? "סטטוס אמיתי בלבד" : "Truthful status only"}</div></div>
            <Radio size={16} />
          </div>
          <div className="ll-command-channel-state">
            <div className="ll-command-channel-icon"><Send size={16} /></div>
            <div><strong>{he ? "ערוצים חיצוניים" : "External channels"}</strong><span>{he ? "נדרשת התחברות ואימות לפני פרסום." : "Connection and verification are required before publishing."}</span></div>
          </div>
          <div className="ll-command-channel-state">
            <div className="ll-command-channel-icon"><Megaphone size={16} /></div>
            <div><strong>{he ? "AutoPilot" : "AutoPilot"}</strong><span>{he ? "מפרסם רק לערוץ שאומת בפועל." : "Publishes only to channels verified in reality."}</span></div>
          </div>
          <button className="ll-command-wide" onClick={() => action("autopilot")}><Bot size={15} />{he ? "ניהול AutoPilot" : "Manage AutoPilot"}</button>
        </aside>
      </section>

      <section className="ll-command-grid ll-command-lower">
        <div className="ll-command-panel">
          <div className="ll-command-panel-head">
            <div><div className="ll-command-title">{he ? "מרכז יצירה" : "Creation center"}</div><div className="ll-command-sub">{he ? "UGC · וידאו · תוכן · קמפיינים" : "UGC · video · content · campaigns"}</div></div>
            <Video size={16} />
          </div>
          <div className="ll-command-tools">
            <button onClick={() => action("ugc")}><Users size={18}/><b>UGC</b><span>{he ? "קהילה" : "Community"}</span></button>
            <button onClick={() => action("video")}><Clapperboard size={18}/><b>AI Video</b><span>{he ? "קליפים" : "Clips"}</span></button>
            <button onClick={() => action("content")}><FileText size={18}/><b>{he ? "תוכן" : "Content"}</b><span>{he ? "יצירה והפצה" : "Create & distribute"}</span></button>
            <button onClick={() => action("campaigns")}><Megaphone size={18}/><b>{he ? "קמפיינים" : "Campaigns"}</b><span>{he ? "שיתוף" : "Sharing"}</span></button>
          </div>
        </div>

        <div className="ll-command-panel">
          <div className="ll-command-panel-head">
            <div><div className="ll-command-title">{he ? "פעילות אחרונה" : "Recent activity"}</div><div className="ll-command-sub">{he ? "אירועים שנרשמו בפועל" : "Recorded events only"}</div></div>
            <Activity size={16} />
          </div>
          {recent.length ? <div className="ll-command-activity">{recent.map((item, i) => <div key={item.id || i}><span className="ll-command-dot"/><span>{item.label || item.type || (he ? "פעולה" : "Activity")}</span></div>)}</div> : <div className="ll-command-empty compact"><Activity size={22}/><span>{he ? "אין עדיין פעילות שנרשמה." : "No recorded activity yet."}</span></div>}
        </div>
      </section>

      <section className="ll-command-pipeline">
        {[
          ["DISCOVER", he ? "גילוי" : "Discover", "01"],
          ["CREATE", he ? "יצירה" : "Create", "02"],
          ["PUBLISH", he ? "פרסום" : "Publish", "03"],
          ["ATTRACT", he ? "משיכה" : "Attract", "04"],
          ["CONVERT", he ? "המרה" : "Convert", "05"],
          ["MEASURE", he ? "מדידה" : "Measure", "06"],
          ["LEARN", he ? "למידה" : "Learn", "07"],
          ["OPTIMIZE", he ? "אופטימיזציה" : "Optimize", "08"],
        ].map(([key,label,num], i) => <React.Fragment key={key}><div className="ll-command-stage"><span>{num}</span><b>{label}</b><small>{key}</small></div>{i < 7 && <span className="ll-command-arrow">‹</span>}</React.Fragment>)}
      </section>

      <div className="ll-command-trust"><CheckCircle2 size={15} /> {he ? "אין נתוני דמו: נתונים מספריים מוצגים רק ממקורות אמיתיים. פרסום חיצוני מסומן כהצלחה רק לאחר הצלחה מתועדת." : "No demo data: numeric values come only from real sources. External publishing is marked successful only after recorded success."}</div>
    </div>
  );
}
