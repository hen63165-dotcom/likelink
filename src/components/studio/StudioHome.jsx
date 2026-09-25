/**
 * StudioHome — LikeLink2 Studio home ("סטודיו UGC · הדמני שלך").
 *
 * Visual layout follows the approved design (dark neon RTL dashboard):
 * hero + recent activity, top products / featured creators / KPIs,
 * popular products / brand channels / social channels / performance ring,
 * and the OBSERVE → OPTIMIZE growth pipeline.
 *
 * DATA RULE (project-wide): every number, name, image and status here comes
 * from the real marketplace context or the real cloud job status. When a
 * source is empty, the card shows a truthful empty state with a working
 * button to the screen that fixes it. No demo data.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Home, Package, Users, Sparkles, Heart, MessageCircle, TrendingUp, Settings,
  Play, ArrowLeft, Clapperboard, Megaphone, Send, ShieldCheck, Bot, Activity,
  Eye, Search, Target, PenTool, Radio, LineChart, Link2, BookOpen, Gauge,
} from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { fetchAutonomousJobStatus } from "../../lib/cloud/autonomousJobsClient.js";
import { buildActivityFeed, getActivity } from "../../lib/studioActivity.js";
import { money } from "../../utils/helpers";
import { isAuthorized } from "./homeAuth.js";
import { generateProductReel, canRecordVideo } from "../../lib/videoEngine.js";
import { uploadReelVideo } from "../../lib/uploadVideo.js";
import { useVideos } from "../../context/VideoContext";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fmt = (n) => new Intl.NumberFormat("he-IL").format(n);

const PIPELINE = [
  { key: "observe", icon: Eye, he: "תצפית", en: "Observe", job: "daily-trend-scan", view: "trends" },
  { key: "discover", icon: Search, he: "גילוי", en: "Discover", job: "opportunity-discovery", view: "recommendations" },
  { key: "plan", icon: Target, he: "תכנון", en: "Plan", job: "site-campaign-cycle", view: "campaigns" },
  { key: "create", icon: PenTool, he: "יצירה", en: "Create", job: "autonomous-growth-cycle", view: "content" },
  { key: "publish", icon: Radio, he: "פרסום", en: "Publish", job: "brand-pulse-publish", view: "publishing" },
  { key: "track", icon: LineChart, he: "מעקב", en: "Track", job: null, view: "performance" },
  { key: "attribution", icon: Link2, he: "ייחוס", en: "Attribution", job: null, view: "performance" },
  { key: "learn", icon: BookOpen, he: "למידה", en: "Learn", job: null, view: "trends" },
  { key: "optimize", icon: Gauge, he: "אופטימיזציה", en: "Optimize", job: null, view: "autopilot" },
];

const SOCIAL = [
  { key: "tiktok", label: "TikTok" },
  { key: "instagram", label: "Instagram" },
  { key: "youtube", label: "YouTube" },
  { key: "facebook", label: "Facebook" },
  { key: "x", label: "X" },
  { key: "pinterest", label: "Pinterest" },
];

function Card({ title, sub, action, actionLabel, children, className = "" }) {
  return (
    <section className={`sh-card ${className}`}>
      {(title || action) && (
        <header className="sh-card-head">
          <div>
            {title && <h3>{title}</h3>}
            {sub && <p>{sub}</p>}
          </div>
          {action && (
            <button type="button" className="sh-link" onClick={action}>
              {actionLabel}
              <ArrowLeft size={12} />
            </button>
          )}
        </header>
      )}
      {children}
    </section>
  );
}

function Empty({ icon: Icon, text, cta, onClick }) {
  return (
    <div className="sh-empty">
      <Icon size={22} />
      <span>{text}</span>
      {cta && (
        <button type="button" className="sh-pill" onClick={onClick}>
          {cta}
        </button>
      )}
    </div>
  );
}

function Ring({ percent }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, percent)) / 100) * c;
  return (
    <svg viewBox="0 0 88 88" className="sh-ring" role="img" aria-label={`${percent}%`}>
      <circle cx="44" cy="44" r={r} className="sh-ring-bg" />
      <circle
        cx="44" cy="44" r={r} className="sh-ring-fg"
        strokeDasharray={`${dash} ${c - dash}`} transform="rotate(-90 44 44)"
      />
      <text x="44" y="49" textAnchor="middle" className="sh-ring-text">{percent}%</text>
    </svg>
  );
}

function LiveReelMedia({ product, hero = false }) {
  const [url, setUrl] = useState("");
  const [state, setState] = useState("idle");
  const started = useRef(false);
  const { videos, addVideo } = useVideos();
  const existing = useMemo(() => (videos || [])
    .filter((v) => {
      const same = String(v?.productId || v?.productTags?.[0]?.productId || "") === String(product?.id || "");
      const u = String(v?.videoUrl || "");
      const persisted = /^https?:\/\//i.test(u) && !/available_as_motion_svg/i.test(String(v?.videoStatus || ""));
      return same && persisted && /\.(mp4|webm|mov|m4v|ogv)(?:$|[?#])/i.test(u);
    })
    .sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0))[0], [videos, product?.id]);

  useEffect(() => {
    if (existing?.videoUrl) {
      setUrl(existing.videoUrl);
      setState("ready");
    }
  }, [existing?.videoUrl]);

  useEffect(() => {
    if (!product?.id || existing?.videoUrl || started.current || !product?.image || !canRecordVideo()) return;
    const node = document.getElementById(`ll-overview-reel-${product.id}`);
    if (!node) return;
    const observer = new IntersectionObserver(async (entries) => {
      if (!entries.some((e) => e.isIntersecting) || started.current) return;
      started.current = true;
      observer.disconnect();
      setState("rendering");
      try {
        const withTimeout = (promise, ms) =>
          Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error("reel_timeout")), ms)),
          ]);
        const result = await withTimeout(
          generateProductReel({
            images: [product.image],
            title: product.title || "",
            price: Number(product.price) || 0,
            hook: `✨ ${product.title || "המוצר"} · LikeLink UGC`,
            cta: "לרכישה · לפרטים",
            storeName: "LikeLink",
            palette: hero ? "gold" : "dark",
          }),
          25000,
        );
        const remote = await withTimeout(uploadReelVideo(result.blob), 20000);
        const finalUrl = remote || result.url;
        if (remote) {
          setUrl(remote);
          setState("ready");
        } else {
          setUrl("");
          setState("preview");
        }
        addVideo({
          title: `UGC Reel · ${product.title || "Product"}`,
          videoUrl: finalUrl,
          marketerId: product.marketerId,
          productId: product.id,
          productTags: [{ productId: product.id }],
          source: "likelink_overview_ugc",
          public: Boolean(remote),
        });
      } catch {
        setState("fallback");
      }
    }, { rootMargin: "500px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [product?.id, product?.image, existing?.videoUrl, addVideo, hero]);

  return (
    <div id={`ll-overview-reel-${product?.id}`} className="relative h-full w-full overflow-hidden">
      {url ? (
        <video
          src={url}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
          onError={() => { setUrl(""); setState("fallback"); }}
        />
      ) : product?.image ? (
        <img
          src={product.image}
          alt={product?.title || ""}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      ) : (
        <div className="h-full w-full grid place-items-center text-white/60 bg-black/30 text-xs font-bold">
          LikeLink
        </div>
      )}
      <span className="absolute right-2 top-2 rounded-full px-2 py-1 text-[9px] font-black" style={{ background: "rgba(5,8,17,.82)", color: "#fff" }}>
        {state === "ready" && url
          ? "● סרטון UGC · בענן"
          : state === "rendering"
            ? "◌ יוצרת סרטון…"
            : state === "preview"
              ? "תצוגה מקדימה · טרם פורסם"
              : "סרטון UGC בקרוב"}
      </span>
    </div>
  );
}

export default function StudioHome({ onNavigate }) {
  const { lang } = useI18n();
  const he = lang === "he";
  const t = (h, e) => (he ? h : e);
  const {
    products, marketers, sales, clicks, activityFeed, notifications, currentMarketer,
  } = useMarketplace();
  const go = (view) => () => onNavigate?.(view);
  const list = useMemo(() => (Array.isArray(products) ? products : []), [products]);
  const creators = useMemo(() => (Array.isArray(marketers) ? marketers : []), [marketers]);
  const orders = useMemo(() => (Array.isArray(sales) ? sales : []), [sales]);
  const clickList = useMemo(() => (Array.isArray(clicks) ? clicks : []), [clicks]);
  const live = useMemo(() => list.filter(isAuthorized), [list]);
  const [jobs, setJobs] = useState(null);
  const [jobsError, setJobsError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchAutonomousJobStatus()
        .then((d) => {
          if (cancelled) return;
          const map = {};
          for (const j of d?.jobs || []) map[j.id] = j;
          setJobs(map);
          setJobsError(false);
        })
        .catch(() => !cancelled && setJobsError(true));
    load();
    const id = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);
  const heroProduct = live[0] || list[0] || null;
  const [ugc, setUgc] = useState(null);
  useEffect(() => {
    if (!currentMarketer || !heroProduct?.id) { setUgc(null); return undefined; }
    let cancelled = false;
    const load = async () => {
      try {
        const token = typeof window !== "undefined" ? window.__likelink?.token || "" : "";
        const res = await fetch(`/api/store?mode=ugc-assets&productId=${encodeURIComponent(heroProduct.id)}`, {
          headers: token ? { authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && data?.ok) setUgc(data.products?.[0]?.assets?.[0] || null);
      } catch { /* offline */ }
    };
    load();
    const id = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [currentMarketer, heroProduct?.id]);
  const [localLog, setLocalLog] = useState(() => getActivity(30));
  useEffect(() => { setLocalLog(getActivity(30)); }, [activityFeed]);
  const activity = useMemo(
    () => buildActivityFeed({
      activity: [...(Array.isArray(activityFeed) ? activityFeed : []), ...localLog],
      clicks: clickList, sales: orders, notifications, limit: 4,
    }),
    [activityFeed, localLog, clickList, orders, notifications]
  );
  const byClicks = useMemo(
    () => [...list].sort((a, b) => num(b.clicks) - num(a.clicks)),
    [list]
  );
  const topProducts = byClicks.slice(0, 4);
  const popular = byClicks.slice(0, 4);
  const creatorStats = useMemo(() => {
    return creators
      .map((m) => {
        const mine = list.filter((p) => p.marketerId === m.id);
        return { m, count: mine.length, clicks: mine.reduce((s, p) => s + num(p.clicks), 0) };
      })
      .sort((a, b) => b.clicks - a.clicks || b.count - a.count);
  }, [creators, list]);
  const featured = creatorStats[0] || null;
  const revenue = orders.reduce((s, o) => s + num(o.amount), 0);
  const conversion = clickList.length > 0 ? Math.round((orders.length / clickList.length) * 1000) / 10 : null;
  const verified = list.filter((p) => p?.trust?.verified || p?.trustLevel === "VERIFIED").length;
  const verifiedPct = list.length ? Math.round((verified / list.length) * 100) : 0;
  const stageState = (stage) => {
    if (!stage.job) return "none";
    if (jobsError) return "error";
    if (!jobs) return "loading";
    return String(jobs[stage.job]?.state || "pending").toLowerCase();
  };
  const stageLabel = {
    none: t("טרם מחובר", "Not connected"),
    error: t("אין חיבור", "Offline"),
    loading: t("טוען…", "Loading…"),
    pending: t("ממתין", "Pending"),
    running: t("פועל", "Running"),
    success: t("הצליח", "OK"),
    failed: t("נכשל", "Failed"),
    skipped: t("דולג", "Skipped"),
  };
  const activeJobs = jobs ? Object.values(jobs).filter((j) => String(j.state).toLowerCase() === "success").length : 0;
  const totalJobs = jobs ? Object.keys(jobs).length : 0;
  const tabs = [
    [t("תוכן", "Content"), "content"],
    [t("יוצרים", "Creators"), "creator-lab"],
    [t("קהילה", "Community"), "ugc"],
    [t("הפצה", "Distribution"), "publishing"],
    [t("צמיחה", "Growth"), "trends"],
  ];
  return (
    <div className="sh-root" dir={he ? "rtl" : "ltr"}>
      <div className="sh-title-row">
        <div>
          <h1 className="sh-title">
            {t("סטודיו UGC – ", "UGC Studio – ")}
            <span>{t("דמני שלך", "your studio")}</span>
          </h1>


          <div className="sh-tabs" role="tablist">
            {tabs.map(([label, view], i) => (
              <button key={view} type="button" role="tab" className={`sh-tab${i === 0 ? " is-first" : ""}`} onClick={go(view)}>
                {label}
              </button>
            ))}
          </div>
          <p className="sh-sub">
            {t("המערכת פועלת באופן אוטונומי כדי ליצור, להפיץ ולמדוד — על הנתונים האמיתיים שלך.",
               "The system works autonomously to create, distribute and measure — on your real data.")}
          </p>
        </div>
        <button type="button" className="sh-status" onClick={go("settings")} aria-label={t("מצב מערכת", "System status")}>
          <span className={`sh-dot ${jobsError ? "is-bad" : ""}`} />
          <b>{t("מצב מערכת", "System status")}</b>
          <small>
            {jobsError
              ? t("אין חיבור לענן", "Cloud unreachable")
              : jobs
                ? t(`${activeJobs}/${totalJobs} משימות תקינות`, `${activeJobs}/${totalJobs} jobs OK`)
                : t("מתחבר…", "Connecting…")}
          </small>
        </button>
      </div>
      <div className="sh-grid sh-row1">
        <section className="sh-hero">
          <div className="sh-hero-media">
            {ugc?.videoUrl ? (
              <video src={ugc.videoUrl} controls playsInline autoPlay muted loop preload="metadata" aria-label={t("וידאו UGC", "UGC video")} />
            ) : ugc?.imageUrl ? (
              <img src={ugc.imageUrl} alt={heroProduct?.title || ""} />
            ) : heroProduct?.image ? (
              <img src={heroProduct.image} alt={heroProduct.title || ""} />
            ) : (
              <div className="sh-hero-fallback"><Sparkles size={34} /></div>
            )}
            <span className="sh-badge">
              {ugc?.videoUrl ? t("וידאו UGC אמיתי", "Real UGC video")
                : ugc?.imageUrl ? t("תמונת UGC אמיתית", "Real UGC image")
                : t("עדיין לא נוצר UGC", "No UGC yet")}
            </span>
          </div>
          <div className="sh-hero-copy">
            <h2>{t("תוכן שמייצר תנועה. קהילה שמייצרת.", "Content that drives traffic. A community that creates.")}</h2>
            <p>{t("התחבר ליוצרים, קבל מוצרים, תן ללקוחות ליצור עבורך — ולונה תדאג להפצה.",
                  "Connect with creators, get products, let customers create for you — and Luna handles distribution.")}</p>
            <div className="sh-cta-row">
              <button type="button" className="sh-cta" onClick={go("ugc")}>
                <Play size={14} />{t("התחל עכשיו", "Start now")}
              </button>
              <button type="button" className="sh-cta ghost" onClick={go("video")}>
                <Clapperboard size={14} />{t("וידאו AI", "AI video")}
              </button>
            </div>
          </div>
        </section>
        <Card title={t("פעילות אחרונה", "Recent activity")} sub={t("אירועים שנרשמו בפועל", "Recorded events only")}
              action={go("performance")} actionLabel={t("הצג הכל", "View all")}>
          {activity.length ? (
            <ul className="sh-activity">
              {activity.map((a) => (
                <li key={a.id}>
                  <span className="sh-avatar"><Activity size={13} /></span>
                  <span className="sh-activity-text">{a.label}</span>
                  <time>{a.ts ? new Date(a.ts).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : ""}</time>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={Activity} text={t("עוד אין פעילות שנרשמה.", "No recorded activity yet.")}
                   cta={t("צור תוכן ראשון", "Create first content")} onClick={go("content")} />
          )}
        </Card>
      </div>

      <div className="sh-grid sh-row2">
        <Card title={t("מוצרים מובילים", "Top products")} sub={t("לפי לחיצות אמיתיות", "By real clicks")}
              action={go("products")} actionLabel={t("ניהול מוצרים", "Manage")} className="sh-span2">
          {topProducts.length ? (
            <div className="sh-products">
              {topProducts.map((p) => (
                <button key={p.id} type="button" className="sh-product" onClick={go("products")}>
                  <div className="sh-product-img">
                    <LiveReelMedia product={p} />
                    <span className={isAuthorized(p) ? "is-live" : ""}>{isAuthorized(p) ? "LIVE" : t("ממתין", "PENDING")}</span>
                  </div>
                  <strong>{p.title}</strong>
                  <small>{num(p.price) > 0 ? money(num(p.price), lang) : t("מחיר לא זמין", "No price")} · {fmt(num(p.clicks))} {t("קליקים", "clicks")}</small>
                </button>
              ))}
            </div>
          ) : (
            <Empty icon={Package} text={t("אין עדיין מוצר אמיתי להצגה.", "No real product to show yet.")}
                   cta={t("הוספת מוצר", "Add product")} onClick={go("products")} />
          )}
        </Card>
        <Card title={t("יוצר נבחר", "Featured creator")} action={go("creator-lab")} actionLabel={t("מעבדת יוצרים", "Creator lab")}>
          {featured ? (
            <div className="sh-creator">
              <div className="sh-creator-face" style={{ background: featured.m.color || "var(--gradient-brand)" }}>
                {String(featured.m.name || "?").slice(0, 1)}
              </div>
              <strong>{featured.m.name}</strong>
              <small>{fmt(featured.count)} {t("מוצרים", "products")} · {fmt(featured.clicks)} {t("קליקים", "clicks")}</small>
              <button type="button" className="sh-pill" onClick={go("creator-lab")}>{t("פתח פרופיל", "Open profile")}</button>
            </div>
          ) : (
            <Empty icon={Users} text={t("עוד אין יוצרים רשומים.", "No creators yet.")}
                   cta={t("למעבדת יוצרים", "Creator lab")} onClick={go("creator-lab")} />
          )}
        </Card>
        <Card title={t("סיכום ביצועים", "Performance summary")} action={go("performance")} actionLabel={t("פירוט", "Details")}>
          <div className="sh-kpis">
            <div><b>{fmt(clickList.length)}</b><span>{t("קליקים", "Clicks")}</span></div>
            <div><b>{conversion === null ? "—" : `${conversion}%`}</b><span>{t("המרה", "Conversion")}</span></div>
            <div><b>{money(revenue, lang)}</b><span>{t("הכנסות", "Revenue")}</span></div>
          </div>
        </Card>
      </div>
      <div className="sh-grid sh-row3">
        <Card title={t("מוצרים פופולריים", "Popular products")} action={go("products")} actionLabel={t("הצג הכל", "All")}>
          {popular.length ? (
            <div className="sh-mini-products">
              {popular.map((p) => (
                <button key={p.id} type="button" onClick={go("products")} title={p.title}>
                  <LiveReelMedia product={p} />
                  <span>{p.title}</span>
                </button>
              ))}
            </div>
          ) : (
            <Empty icon={Package} text={t("אין מוצרים להצגה.", "No products yet.")} cta={t("הוספת מוצר", "Add product")} onClick={go("products")} />
          )}
        </Card>
        <Card title={t("ערוצי מותג", "Brand channels")} action={go("publishing")} actionLabel={t("ניהול ערוצים", "Manage")}>
          <div className="sh-channel-list">
            <button type="button" onClick={go("publishing")}><Send size={14} /><span>{t("פרסום פנימי (LikeLink)", "Internal publishing")}</span><em className="ok">{t("פעיל", "Active")}</em></button>
            <button type="button" onClick={go("autopilot")}><Bot size={14} /><span>AutoPilot</span><em>{t("דורש ערוץ מאומת", "Needs verified channel")}</em></button>
            <button type="button" onClick={go("campaigns")}><Megaphone size={14} /><span>{t("קמפיינים", "Campaigns")}</span><em>{t("לבנייה", "Build")}</em></button>
          </div>
        </Card>
        <Card title={t("ערוצי סושיאל", "Social channels")} action={go("publishing")} actionLabel={t("חיבור", "Connect")}>
          <div className="sh-social">
            {SOCIAL.map((s) => (
              <button key={s.key} type="button" onClick={go("publishing")}>
                <b>{s.label}</b>
                <small>{t("לא מחובר", "Not connected")}</small>
              </button>
            ))}
          </div>
        </Card>
        <Card title={t("אמון מוצרים", "Product trust")} action={go("trust")} actionLabel={t("פירוט", "Details")}>
          <div className="sh-ring-wrap">
            <Ring percent={verifiedPct} />
            <div>
              <b>{verified}/{list.length}</b>
              <span>{t("מוצרים מאומתים", "Verified products")}</span>
              <button type="button" className="sh-pill" onClick={go("trust")}>{t("בדיקת אמון", "Run trust check")}</button>
            </div>
          </div>
        </Card>
      </div>
      <nav className="sh-pipeline" aria-label={t("צינור צמיחה", "Growth pipeline")}>
        {PIPELINE.map((s, i) => {
          const st = stageState(s);
          const Icon = s.icon;
          return (
            <React.Fragment key={s.key}>
              <button type="button" className={`sh-stage is-${st}`} onClick={go(s.view)}>
                <span className="sh-stage-icon"><Icon size={15} /></span>
                <b>{s.en.toUpperCase()}</b>
                <span>{he ? s.he : s.en}</span>
                <small>{stageLabel[st]}</small>
              </button>
              {i < PIPELINE.length - 1 && <span className="sh-arrow" aria-hidden="true">‹</span>}
            </React.Fragment>
          );
        })}
      </nav>
    </div>
  );
}
