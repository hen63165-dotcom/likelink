import React, { useMemo, useState } from "react";
import {
  Search, CheckCircle2, XCircle, Copy, ExternalLink, RefreshCw, Link2, MousePointerClick, Wallet, CreditCard,
  Sparkles, Wand2, Share2, Send, AlertTriangle, Clock, Lightbulb, ShoppingBag,
} from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { useVideos } from "../../context/VideoContext";
import StudioCheckout from "../sell/StudioCheckout.jsx";
import VideoUpload from "../video/VideoUpload.jsx";
import { getSessionToken } from "../../lib/auth.js";
import { toHebrewError } from "../../lib/errorMessages.js";
import {
  merchantOf, formatPrice, publicVideos, buildCollections, activityByProduct,
} from "../../lib/site/catalog.js";
import {
  merchantEligibility, rankProducts, explainRecommendation, weakProducts, publishingTiming, contentAngles,
  buildLunaCampaign, CAMPAIGN_CHANNEL,
} from "../../lib/luna/engine.js";

const ORIGIN = "https://likelink2.vercel.app";
const FEED_URL = `${ORIGIN}/google-feed.xml`;

function useL() {
  const { lang } = useI18n();
  return { lang, he: lang === "he", L: (he, en) => (lang === "he" ? he : en) };
}

// Compact inline action button (the shared Button is full-width).
function Btn({ children, onClick, variant = "primary", disabled = false }) {
  const primary = variant === "primary";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="ll-tap inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold disabled:opacity-50"
      style={primary ? { background: "var(--accent)", color: "#fff" } : { background: "var(--bg-subtle)", color: "var(--text)", border: "1px solid var(--border)" }}
    >
      {children}
    </button>
  );
}

function Card({ children, className = "", style }) {
  return <div className={`ll-card rounded-2xl p-4 ${className}`} style={style}>{children}</div>;
}

function Title({ icon: Icon, children, sub }) {
  return (
    <div className="mb-3">
      <h3 className="flex items-center gap-2 text-base font-bold" style={{ color: "var(--text)" }}>
        {Icon && <Icon size={17} style={{ color: "var(--accent)" }} aria-hidden="true" />}{children}
      </h3>
      {sub && <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-muted)" }}>{sub}</p>}
    </div>
  );
}

function StateBadge({ ok, children, tone }) {
  const color = tone || (ok ? "var(--success)" : "var(--warning, #f59e0b)");
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "var(--bg-subtle)", color, border: `1px solid ${color}` }}>
      {children}
    </span>
  );
}

function useOwnData() {
  const { currentMarketer, products, marketers, clicks, sales, payouts, collections } = useMarketplace();
  const { videos } = useVideos();
  return useMemo(() => {
    const own = (products || []).filter((p) => currentMarketer && p.marketerId === currentMarketer.id);
    const ownIds = new Set(own.map((p) => p.id));
    return {
      marketer: currentMarketer,
      own,
      marketers: marketers || [],
      clicks: (clicks || []).filter((c) => ownIds.has(c.productId)),
      sales: (sales || []).filter((x) => currentMarketer && x.marketerId === currentMarketer.id),
      payouts: (payouts || []).filter((x) => currentMarketer && x.marketerId === currentMarketer.id),
      videos: publicVideos(videos),
      collections: buildCollections({ products: own, marketers, collections: (collections || []).filter((c) => currentMarketer && c.marketerId === currentMarketer.id) }),
    };
  }, [currentMarketer, products, marketers, clicks, sales, payouts, collections, videos]);
}

function GuestNotice({ onNavigate }) {
  const { L } = useL();
  return (
    <Card>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {L("כדי לראות את הנתונים של הסטודיו שלך צריך להתחבר.", "Sign in to see your studio data.")}
      </p>
      <div className="mt-3"><Btn onClick={() => onNavigate?.("products")}>{L("התחברות / פתיחת סטודיו", "Sign in / open a studio")}</Btn></div>
    </Card>
  );
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

// ── GOOGLE MERCHANT ─────────────────────────────────────────────────────
export function GoogleMerchantPanel({ onNavigate }) {
  const { L, lang } = useL();
  const d = useOwnData();
  const { showToast } = useMarketplace();
  const [check, setCheck] = useState(null);
  const [checking, setChecking] = useState(false);
  const results = useMemo(() => d.own.map((p) => merchantEligibility(p, d.marketers, ORIGIN, lang)), [d.own, d.marketers, lang]);
  const eligible = results.filter((r) => r.eligible);
  const blockers = useMemo(() => {
    const counts = new Map();
    for (const r of results) {
      const first = r.checks.find((c) => !c.ok);
      if (first) counts.set(first.id, { check: first, n: (counts.get(first.id)?.n || 0) + 1 });
    }
    return [...counts.values()].sort((a, b) => b.n - a.n);
  }, [results]);

  async function verifyFeed() {
    setChecking(true);
    try {
      const res = await fetch("/google-feed.xml", { cache: "no-store" });
      const text = res.ok ? await res.text() : "";
      const items = (text.match(/<item>/g) || []).length;
      setCheck({ ok: res.ok && text.includes("<rss"), items, at: new Date() });
    } catch {
      setCheck({ ok: false, items: 0, at: new Date() });
    } finally {
      setChecking(false);
    }
  }

  if (!d.marketer) return <GuestNotice onNavigate={onNavigate} />;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <Title icon={Search}>{L("חיבור ל-Merchant Center", "Merchant Center connection")}</Title>
          <StateBadge ok={false}>{L("לא מאומת מכאן", "Not verified from here")}</StateBadge>
          <p className="mt-2 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
            {L("LikeLink לא מחובר ל-API של Google, ולכן לא מציג כאן \"מחובר\" או \"פעיל\". החיבור נעשה אצלך ב-Merchant Center (הוראות למטה).", "LikeLink has no Google API connection, so it never shows \"connected\" or \"live\" here. You connect in Merchant Center (steps below).")}
          </p>
        </Card>
        <Card>
          <Title icon={Link2}>{L("הפיד", "The feed")}</Title>
          <p className="break-all text-xs font-mono" dir="ltr" style={{ color: "var(--text-secondary)" }}>{FEED_URL}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Btn variant="secondary" onClick={async () => showToast?.((await copyText(FEED_URL)) ? L("כתובת הפיד הועתקה", "Feed URL copied") : FEED_URL)}><Copy size={14} /> {L("העתקה", "Copy")}</Btn>
            <Btn variant="secondary" onClick={verifyFeed} disabled={checking}><RefreshCw size={14} className={checking ? "animate-spin" : ""} /> {L("בדיקת הפיד עכשיו", "Check the feed now")}</Btn>
          </div>
          {check && (
            <p className="mt-2 text-xs" style={{ color: check.ok ? "var(--success)" : "var(--danger)" }}>
              {check.ok
                ? L(`הפיד נטען · ${check.items} מוצרים בפיד · נבדק ב-${check.at.toLocaleTimeString("he-IL")}`, `Feed loaded · ${check.items} items · checked at ${check.at.toLocaleTimeString("en-US")}`)
                : L("הפיד לא נטען כרגע — נסי שוב בעוד רגע", "The feed did not load — try again shortly")}
            </p>
          )}
        </Card>
        <Card>
          <Title icon={ShoppingBag}>{L("מוצרים זכאים", "Eligible products")}</Title>
          <p className="text-2xl font-extrabold" style={{ color: "var(--text)" }}>{eligible.length} / {d.own.length}</p>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {L("רישומים חינמיים ב-Google: לא ניתן לאמת מכאן את הסטטוס בגוגל.", "Google free listings: the status inside Google cannot be verified from here.")}
          </p>
        </Card>
      </div>

      {eligible.length === 0 && (
        <Card style={{ borderColor: "var(--warning, #f59e0b)" }}>
          <Title icon={AlertTriangle}>{L("כרגע אין מוצרים זכאים", "No eligible products right now")}</Title>
          <ul className="space-y-2 text-sm">
            {blockers.map(({ check: c, n }) => (
              <li key={c.id} className="rounded-xl p-3" style={{ background: "var(--bg-subtle)" }}>
                <p className="font-bold" style={{ color: "var(--text)" }}>{L(`${n} מוצרים: חסר „${c.he}”`, `${n} products: missing “${c.en}”`)}</p>
                <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-secondary)" }}>{c.fix}</p>
              </li>
            ))}
          </ul>
          {blockers.some((b) => b.check.id !== "direct") && (
            <div className="mt-3"><Btn onClick={() => onNavigate?.("products")}>{L("תיקון פרטי המוצרים", "Fix product details")}</Btn></div>
          )}
        </Card>
      )}

      <Card>
        <Title icon={CheckCircle2} sub={L("הבדיקה משתמשת בדיוק באותם כללים שבונים את הפיד.", "The check uses exactly the rules that build the feed.")}>{L("סטטוס לכל מוצר", "Status per product")}</Title>
        <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
          {results.map((r) => {
            const fail = r.checks.find((c) => !c.ok);
            return (
              <li key={r.product.id} className="flex items-start gap-3 py-2">
                {r.eligible ? <CheckCircle2 size={16} style={{ color: "var(--success)" }} aria-hidden="true" /> : <XCircle size={16} style={{ color: "var(--danger)" }} aria-hidden="true" />}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold" style={{ color: "var(--text)" }}><bdi>{r.product.title}</bdi></p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>{r.eligible ? L("זכאי לפיד", "Eligible for the feed") : `${fail.label} — ${fail.fix}`}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <Title icon={Lightbulb}>{L("איך מחברים את הפיד ל-Google", "How to connect the feed to Google")}</Title>
        <ol className="list-decimal space-y-1 ps-5 text-sm leading-6" style={{ color: "var(--text-secondary)" }}>
          <li>{L("נכנסים ל-Google Merchant Center ומאמתים את האתר likelink2.vercel.app.", "Open Google Merchant Center and verify the site likelink2.vercel.app.")}</li>
          <li>{L("מוצרים ← פידים ← פיד חדש ← \"שליפה מתוזמנת\".", "Products → Feeds → New feed → \"Scheduled fetch\".")}</li>
          <li>{L("מדביקים את כתובת הפיד שלמעלה ובוחרים שליפה יומית.", "Paste the feed URL above and choose a daily fetch.")}</li>
          <li>{L("מפעילים \"רישומים חינמיים\" בהגדרות התוכנית. Google מאשר כל מוצר בנפרד.", "Enable \"free listings\" in the program settings. Google reviews each product separately.")}</li>
        </ol>
      </Card>
    </div>
  );
}

// ── AFFILIATE ───────────────────────────────────────────────────────────
export function AffiliatePanel({ onNavigate }) {
  const { L } = useL();
  const d = useOwnData();
  const { showToast } = useMarketplace();
  const activity = useMemo(() => activityByProduct(d.clicks), [d.clicks]);
  if (!d.marketer) return <GuestNotice onNavigate={onNavigate} />;
  const totalClicks = [...activity.values()].reduce((s, a) => s + a.clicks, 0);
  return (
    <div className="space-y-4">
      <Card>
        <Title icon={Link2} sub={L("כל קישור שותפים עובר דרך LikeLink: הלחיצה נרשמת, והקונה מגיעה לחנות. העמלה עצמה נקבעת בתוכנית השותפים של החנות, לא ב-LikeLink.", "Every affiliate link goes through LikeLink: the click is logged and the buyer lands in the store. The commission itself is set by the store's affiliate program, not by LikeLink.")}>
          {L("איך עובד מעקב שותפים", "How affiliate tracking works")}
        </Title>
        <div className="flex flex-wrap gap-2 text-xs">
          <StateBadge ok tone="var(--accent)">{L(`${d.own.length} מוצרים עם קישור`, `${d.own.length} products with a link`)}</StateBadge>
          <StateBadge ok tone="var(--accent)">{L(`${totalClicks} קליקים שנמדדו`, `${totalClicks} measured clicks`)}</StateBadge>
          <StateBadge ok>{L("גילוי נאות מוצג בעמוד המוצר", "Disclosure shown on the product page")}</StateBadge>
        </div>
      </Card>
      {d.own.map((p) => {
        const m = merchantOf(p);
        const a = activity.get(p.id) || { clicks: 0, views: 0 };
        const tracked = `${ORIGIN}/r?pid=${encodeURIComponent(p.id)}&src=share`;
        const commission = Number(p.commission);
        return (
          <Card key={p.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-bold" style={{ color: "var(--text)" }}><bdi>{p.title}</bdi></p>
                <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  {m.name ? L(`חנות: ${m.name}`, `Store: ${m.name}`) : L("אין קישור לחנות", "No store link")}
                  {" · "}{L(`${a.clicks} קליקים · ${a.views} צפיות`, `${a.clicks} clicks · ${a.views} views`)}
                  {" · "}{commission > 0 ? L(`עמלה כפי שהוזנה במוצר: ${commission}`, `Commission as entered: ${commission}`) : L("לא הוזנה עמלה", "No commission entered")}
                </p>
                <p className="mt-2 break-all text-[11px] font-mono" dir="ltr" style={{ color: "var(--text-secondary)" }}>{tracked}</p>
              </div>
              <div className="flex gap-2">
                <Btn variant="secondary" onClick={async () => showToast?.((await copyText(tracked)) ? L("קישור המעקב הועתק", "Tracking link copied") : tracked)}><Copy size={14} /> {L("העתקת קישור", "Copy link")}</Btn>
                {p.affiliateUrl && <Btn variant="secondary" onClick={() => window.open(p.affiliateUrl, "_blank", "noopener,noreferrer")}><ExternalLink size={14} /> {L("יעד", "Destination")}</Btn>}
              </div>
            </div>
          </Card>
        );
      })}
      {d.own.length === 0 && (
        <Card><p className="text-sm" style={{ color: "var(--text-secondary)" }}>{L("עדיין אין מוצרים. הוסיפי מוצר עם קישור לחנות — והמעקב יתחיל אוטומטית.", "No products yet. Add a product with a store link and tracking starts automatically.")}</p>
          <div className="mt-3"><Btn onClick={() => onNavigate?.("products")}>{L("הוספת מוצר", "Add a product")}</Btn></div></Card>
      )}
    </div>
  );
}

// ── PAYMENTS ────────────────────────────────────────────────────────────
export function PaymentsPanel({ onNavigate }) {
  const { L, lang } = useL();
  const d = useOwnData();
  if (!d.marketer) return <GuestNotice onNavigate={onNavigate} />;
  const earned = d.sales.reduce((s, x) => s + (Number(x.marketerNet) || 0), 0);
  const pending = d.payouts.filter((p) => p.status === "pending" || p.status === "processing").reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const paid = d.payouts.filter((p) => p.status === "paid").reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const email = String(d.marketer.payPalEmail || "");
  const masked = email ? email.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => `${a}${"•".repeat(Math.min(6, b.length))}${c}`) : "";
  const fmt = (n) => formatPrice(n, lang) || "₪0";
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Card><Title icon={Wallet}>{L("הכנסות מתועדות", "Recorded earnings")}</Title><p className="text-2xl font-extrabold" dir="ltr" style={{ color: "var(--text)" }}>{fmt(earned)}</p><p className="text-xs" style={{ color: "var(--text-muted)" }}>{L(`${d.sales.length} מכירות מתועדות`, `${d.sales.length} recorded sales`)}</p></Card>
        <Card><Title icon={Clock}>{L("ממתין לתשלום", "Pending payout")}</Title><p className="text-2xl font-extrabold" dir="ltr" style={{ color: "var(--text)" }}>{fmt(pending)}</p></Card>
        <Card><Title icon={CheckCircle2}>{L("שולם", "Paid")}</Title><p className="text-2xl font-extrabold" dir="ltr" style={{ color: "var(--text)" }}>{fmt(paid)}</p></Card>
      </div>
      <Card>
        <Title icon={CreditCard} sub={L("לכאן נשלחים התשלומים שלך. אפשר לשנות בכל רגע בהגדרות.", "Your payouts go here. You can change it any time in Settings.")}>{L("יעד לקבלת תשלומים", "Payout destination")}</Title>
        {email
          ? <p className="text-sm" style={{ color: "var(--text-secondary)" }}>PayPal: <bdi dir="ltr">{masked}</bdi></p>
          : <p className="text-sm" style={{ color: "var(--warning, #f59e0b)" }}>{L("עדיין לא הוגדר אימייל PayPal — בלי זה אי אפשר להעביר אלייך תשלום.", "No PayPal email yet — without it payouts cannot be sent.")}</p>}
        <div className="mt-3"><Btn variant="secondary" onClick={() => onNavigate?.("settings")}>{email ? L("עדכון אימייל PayPal", "Update PayPal email") : L("הגדרת אימייל PayPal", "Set PayPal email")}</Btn></div>
      </Card>
      <StudioCheckout />
      <Card>
        <p className="text-xs leading-5" style={{ color: "var(--text-muted)" }}>
          {L("מנוי מופעל רק אחרי ש-PayPal מאשר את התשלום, שהוא שייך לחשבון שלך ושהוא למסלול שבחרת. שום חבילה לא נפתחת על סמך חזרה מדף התשלום בלבד.", "A plan activates only after PayPal confirms the payment, that it belongs to your account and that it is for the plan you chose. Returning from the payment page alone never unlocks a plan.")}
        </p>
      </Card>
    </div>
  );
}

// ── GROWTH · LUNA ───────────────────────────────────────────────────────
export function GrowthPanel({ onNavigate, platform }) {
  const { L, lang } = useL();
  const d = useOwnData();
  const { marketers, showToast } = useMarketplace();
  const [kind, setKind] = useState("product");
  const [targetId, setTargetId] = useState("");
  const [plan, setPlan] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState("");
  const ranked = useMemo(() => rankProducts(d.own, { clicks: d.clicks, videos: d.videos }, lang), [d.own, d.clicks, d.videos, lang]);
  const weak = useMemo(() => weakProducts(d.own, { clicks: d.clicks, videos: d.videos }, lang).slice(0, 5), [d.own, d.clicks, d.videos, lang]);
  const timing = useMemo(() => publishingTiming(d.clicks, {}, lang), [d.clicks, lang]);
  if (!d.marketer) return <GuestNotice onNavigate={onNavigate} />;

  const creator = { id: d.marketer.id, slug: d.marketer.slug || d.marketer.id, name: d.marketer.name };
  const options = kind === "product" ? d.own.map((p) => [p.id, p.title]) : kind === "collection" ? d.collections.map((c) => [c.id, c.title]) : [[creator.id, creator.name]];

  function prepare() {
    const id = targetId || options[0]?.[0];
    const product = kind === "product" ? d.own.find((p) => p.id === id) : null;
    const collection = kind === "collection" ? d.collections.find((c) => c.id === id) : null;
    setPublishResult("");
    setPlan(buildLunaCampaign({ kind, product, collection, creator: kind === "creator" ? creator : null, marketers, clicks: d.clicks, videos: d.videos, connections: platform?.connections || [], origin: ORIGIN }, lang));
  }

  async function publishConnected() {
    if (!plan || plan.kind !== "product") return;
    setPublishing(true);
    try {
      const token = await getSessionToken();
      const id = targetId || options[0]?.[0];
      const res = await fetch("/api/store?mode=publish", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ productId: id }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: `http_${res.status}` }));
      if (!data.ok) setPublishResult(toHebrewError(data.error, L("הפרסום נכשל", "Publishing failed")));
      else if (data.status === "PUBLISHED") setPublishResult(L("פורסם — הערוץ אישר", "Published — the channel confirmed"));
      else setPublishResult(L("הבקשה נשלחה — הסטטוס יתעדכן רק אחרי אישור מהערוץ", "Sent — the status updates only after the channel confirms"));
    } catch (e) {
      setPublishResult(toHebrewError(e?.message, L("הפרסום נכשל", "Publishing failed")));
    } finally {
      setPublishing(false);
    }
  }

  const linkToShare = plan ? (plan.tracking.url || plan.publicUrl) : "";
  const channelState = (st) => st === CAMPAIGN_CHANNEL.AVAILABLE
    ? <StateBadge ok>{L("זמין", "Available")}</StateBadge>
    : st === CAMPAIGN_CHANNEL.REQUIRES_CONNECTION
      ? <StateBadge ok={false}>{L("נדרש חיבור לערוץ", "Connection required")}</StateBadge>
      : <StateBadge ok={false} tone="var(--danger)">{L("לא זכאי", "Not eligible")}</StateBadge>;
  const connectedSocial = plan?.channels.find((c) => c.id === "connected_social");

  return (
    <div className="space-y-4">
      <Card>
        <Title icon={Wand2} sub={L("בחרי מה לקדם — לונה מכינה מטרה, קהל, קריאייטיב, ערוצים ומעקב. תקציב ₪0: הפצה אורגנית בלבד.", "Pick what to promote — Luna prepares the objective, audience, creative, channels and tracking. ₪0 budget: organic distribution only.")}>
          {L("קמפיין לונה", "Luna Campaign")}
        </Title>
        <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-end">
          <div className="flex gap-1 rounded-xl p-1" style={{ background: "var(--bg-subtle)" }} role="tablist">
            {[["product", L("מוצר", "Product")], ["collection", L("אוסף", "Collection")], ["creator", L("החנות שלי", "My storefront")]].map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => { setKind(k); setTargetId(""); setPlan(null); }}
                className="rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: kind === k ? "var(--accent)" : "transparent", color: kind === k ? "#fff" : "var(--text-secondary)" }}>
                {label}
              </button>
            ))}
          </div>
          <select value={targetId || options[0]?.[0] || ""} onChange={(e) => { setTargetId(e.target.value); setPlan(null); }} className="input-field w-full rounded-xl px-3 py-2 text-sm" aria-label={L("מה לקדם", "What to promote")} disabled={!options.length}>
            {options.length ? options.map(([id, label]) => <option key={id} value={id}>{label}</option>) : <option>{L("אין פריטים זמינים", "Nothing available")}</option>}
          </select>
          <Btn onClick={prepare} disabled={!options.length}><Sparkles size={15} /> {L("לונה, תכיני קמפיין", "Luna, prepare a campaign")}</Btn>
        </div>

        {plan && (
          <div className="mt-4 space-y-3">
            <p className="text-sm font-bold" style={{ color: "var(--accent)" }}>{L("לונה הכינה עבורך קמפיין", "Luna prepared a campaign for you")}: <bdi>{plan.title}</bdi></p>
            <div className="grid gap-2 md:grid-cols-2">
              {[[L("מטרה", "Objective"), plan.objective], [L("קהל", "Audience"), plan.audience], [L("תוכן", "Creative"), plan.creative.label], [L("קריאה לפעולה", "CTA"), plan.cta], [L("תקציב", "Budget"), plan.budget.text], [L("מעקב", "Tracking"), plan.tracking.text], [L("תזמון", "Timing"), plan.timing.text]].map(([k, v]) => (
                <div key={k} className="rounded-xl p-3" style={{ background: "var(--bg-subtle)" }}>
                  <p className="text-[11px] font-bold" style={{ color: "var(--text-muted)" }}>{k}</p>
                  <p className="mt-0.5 text-sm" style={{ color: "var(--text)" }}>{v}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-2 text-xs font-bold" style={{ color: "var(--text-muted)" }}>{L("ערוצים", "Channels")}</p>
              <ul className="space-y-2">
                {plan.channels.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl p-3" style={{ background: "var(--bg-subtle)" }}>
                    <div><p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{c.label}</p><p className="text-xs" style={{ color: "var(--text-muted)" }}>{c.reason}</p></div>
                    {channelState(c.state)}
                  </li>
                ))}
              </ul>
            </div>
            {plan.angles.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold" style={{ color: "var(--text-muted)" }}>{L("הצעות לזוויות תוכן (הצעה, לא נתון)", "Content angle suggestions (suggestions, not data)")}</p>
                <ul className="list-disc space-y-1 ps-5 text-sm" style={{ color: "var(--text-secondary)" }}>{plan.angles.map((a) => <li key={a.id}>{a.text}</li>)}</ul>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Btn variant="secondary" onClick={async () => showToast?.((await copyText(linkToShare)) ? L("הקישור הועתק", "Link copied") : linkToShare)}><Copy size={14} /> {L("העתקת הקישור", "Copy link")}</Btn>
              <Btn variant="secondary" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`${plan.title}\n${linkToShare}`)}`, "_blank", "noopener,noreferrer")}><Share2 size={14} /> {L("שיתוף בוואטסאפ", "Share on WhatsApp")}</Btn>
              <Btn variant="secondary" onClick={() => window.open(plan.publicUrl, "_blank", "noopener,noreferrer")}><ExternalLink size={14} /> {L("פתיחת העמוד הציבורי", "Open the public page")}</Btn>
              {plan.kind === "product" && connectedSocial?.state === CAMPAIGN_CHANNEL.AVAILABLE
                ? <Btn onClick={publishConnected} disabled={publishing}><Send size={14} /> {publishing ? L("שולחת…", "Sending…") : L("פרסום בערוצים המחוברים", "Publish to connected channels")}</Btn>
                : <Btn variant="secondary" onClick={() => onNavigate?.("autopilot")}><Send size={14} /> {L("חיבור ערוץ", "Connect a channel")}</Btn>}
            </div>
            {publishResult && <p className="text-sm" role="status" style={{ color: "var(--text-secondary)" }}>{publishResult}</p>}
          </div>
        )}
      </Card>

      <Card>
        <Title icon={Sparkles} sub={L("כל המלצה מגיעה עם הסיבות האמיתיות שלה.", "Every recommendation carries its real reasons.")}>{L("מה לונה ממליצה לקדם", "What Luna recommends promoting")}</Title>
        {ranked.length ? (
          <ol className="space-y-2">
            {ranked.slice(0, 5).map((r, i) => (
              <li key={r.product.id} className="rounded-xl p-3" style={{ background: "var(--bg-subtle)" }}>
                <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{i + 1}. <bdi>{r.product.title}</bdi></p>
                <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-secondary)" }}>{explainRecommendation(r, lang)}</p>
              </li>
            ))}
          </ol>
        ) : <p className="text-sm" style={{ color: "var(--text-muted)" }}>{L("אין עדיין מוצרים לדרג.", "No products to rank yet.")}</p>}
      </Card>

      <Card>
        <Title icon={AlertTriangle} sub={L("מה חסר בעמודי המוצר — ומה בדיוק לתקן.", "What the product pages are missing — and exactly what to fix.")}>{L("עמודים שצריכים חיזוק", "Pages that need work")}</Title>
        {weak.length ? (
          <ul className="space-y-2">
            {weak.map((w) => (
              <li key={w.product.id} className="rounded-xl p-3" style={{ background: "var(--bg-subtle)" }}>
                <p className="text-sm font-bold" style={{ color: "var(--text)" }}><bdi>{w.product.title}</bdi></p>
                <ul className="mt-1 space-y-0.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                  {w.gaps.map((g) => <li key={g.id}>• {g.text} — {g.fix}</li>)}
                </ul>
              </li>
            ))}
            <li><Btn variant="secondary" onClick={() => onNavigate?.("products")}>{L("למסך המוצרים", "Go to products")}</Btn></li>
          </ul>
        ) : <p className="text-sm" style={{ color: "var(--success)" }}>{L("כל עמודי המוצר שלך כוללים את הפרטים החיוניים.", "All your product pages include the essentials.")}</p>}
      </Card>

      <Card>
        <Title icon={MousePointerClick}>{L("מתי לפרסם", "When to publish")}</Title>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{timing.text}</p>
        {ranked[0] && (
          <div className="mt-3">
            <p className="text-xs font-bold" style={{ color: "var(--text-muted)" }}>{L("רעיונות תוכן למוצר המוביל (הצעות)", "Content ideas for the top product (suggestions)")}</p>
            <ul className="mt-1 list-disc space-y-0.5 ps-5 text-sm" style={{ color: "var(--text-secondary)" }}>
              {contentAngles(ranked[0].product, lang).map((a) => <li key={a.id}>{a.text}</li>)}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}

/**
 * Real creator video upload — a filmed clip becomes a REAL_VIDEO in Reels.
 * (Browser-rendered animations are labelled as synthetic elsewhere.)
 */
export function RealVideoUploadCard() {
  const { L } = useL();
  const d = useOwnData();
  const { showToast } = useMarketplace();
  const { addVideo } = useVideos();
  const [productId, setProductId] = useState("");
  if (!d.marketer || !d.own.length) return null;
  const product = d.own.find((p) => p.id === productId) || d.own[0];
  return (
    <div className="ll-card mb-4 rounded-2xl p-4">
      <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{L("העלאת סרטון אמיתי שצילמת", "Upload a real video you filmed")}</p>
      <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-muted)" }}>{L("סרטון שצילמת מופיע ברילס ובעמוד המוצר עם התווית \"וידאו\". אנימציות שנוצרות מתמונות המוצר מסומנות בנפרד.", "A video you filmed appears in Reels and on the product page labelled \"Video\". Animations made from product photos are labelled separately.")}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
        <select value={product?.id || ""} onChange={(e) => setProductId(e.target.value)} className="input-field w-full rounded-xl px-3 py-2 text-sm" aria-label={L("לאיזה מוצר הסרטון", "Which product the video is for")}>
          {d.own.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        <VideoUpload product={product} marketer={d.marketer} onUploaded={addVideo} showToast={showToast} />
      </div>
    </div>
  );
}

/** Entry card shown at the top of Campaigns — opens the Luna Campaign builder. */
export function LunaCampaignEntry({ onNavigate }) {
  const { L } = useL();
  return (
    <div className="ll-card mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
      <div>
        <p className="flex items-center gap-2 text-sm font-bold" style={{ color: "var(--text)" }}><Wand2 size={16} style={{ color: "var(--accent)" }} aria-hidden="true" />{L("קמפיין לונה — הפצה חינמית מבוססת נתונים", "Luna Campaign — free, data-based distribution")}</p>
        <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{L("בחרי מוצר, אוסף או את החנות שלך — לונה מכינה מטרה, קהל, ערוצים ומעקב.", "Pick a product, a collection or your storefront — Luna prepares the objective, audience, channels and tracking.")}</p>
      </div>
      <Btn onClick={() => onNavigate?.("growth")}><Sparkles size={15} /> {L("לבניית קמפיין לונה", "Build a Luna Campaign")}</Btn>
    </div>
  );
}

