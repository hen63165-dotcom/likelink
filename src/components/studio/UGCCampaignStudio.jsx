import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3, CheckCircle2, Clapperboard, ExternalLink, ImagePlus,
  Loader2, Megaphone, Play, Radio, ShieldCheck, Sparkles, UserRound, Video, Wand2
} from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { Button, EmptyState } from "../ui/index.jsx";
import { useVideos } from "../../context/VideoContext";
import { generateProductReel, canRecordVideo, REEL } from "../../lib/videoEngine.js";
import { uploadReelVideo } from "../../lib/uploadVideo.js";
import { buildCampaign } from "../../lib/cloud/campaign.js";
import { recordLunaHeartbeat } from "../../lib/cloud/lunaStatus.js";
import { getSessionToken } from "../../lib/auth.js";
import { toHebrewError } from "../../lib/errorMessages.js";
import { CHARACTER_PRESETS, CHARACTER_TYPES } from "../../lib/cloud/characters.js";
import { mediaVideoPath, STUDIO_REEL_PROVIDER } from "../../lib/cloud/reelAttach.js";

const MODEL_TYPES = [
  CHARACTER_TYPES.AI_FEMALE_MODEL,
  CHARACTER_TYPES.AI_FEMALE_CREATOR,
  CHARACTER_TYPES.AI_FEMALE_INFLUENCER,
];

const CHANNELS = [
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["telegram", "Telegram"],
  ["whatsapp", "WhatsApp"],
  ["x", "X"],
  ["linkedin", "LinkedIn"],
  ["pinterest", "Pinterest"],
];

// Both are the same thing: a short animated card built from the product's own
// store photos on this device (no person, no UGC) — only the backdrop differs.
const VIDEO_STYLES = [
  { id: "ugc", label: "Dark", he: "רקע כהה", palette: "dark", badge: "מתמונות המוצר · 9:16" },
  { id: "cinematic3d", label: "Gold", he: "רקע זהב", palette: "gold", badge: "מתמונות המוצר · 9:16" },
];

function modelLabel(type, he) {
  const p = CHARACTER_PRESETS[type];
  return p ? (he ? p.name.he : p.name.en) : type;
}

/** The product's own store photos (main photo first, then its gallery), up to four. */
function productImages(p) {
  const list = [p?.image, ...(Array.isArray(p?.images) ? p.images : []), p?.image2, p?.image3];
  return [...new Set(list.filter((x) => typeof x === "string" && /^https?:\/\//i.test(x)))].slice(0, 4);
}

/** The reel already saved for this product (the server linked it to the product), or "". */
function savedReelOf(p) {
  return p?.videoProvider === STUDIO_REEL_PROVIDER && mediaVideoPath(p?.videoUrl) ? p.videoUrl : "";
}

/**
 * A new reel is public only once the server has linked it to its product
 * (storage rule media_is_public); until then the cloud answers "not found".
 * Asks for two bytes, a few times, before calling it available.
 */
async function cloudCopyServes(url, tries = 8, waitMs = 2500) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { Range: "bytes=0-1" }, cache: "no-store" });
      const ok = (res.status === 206 || res.status === 200) && /^video\//.test(res.headers.get("content-type") || "");
      try { await res.body?.cancel?.(); } catch { /* nothing left to read */ }
      if (ok) return true;
    } catch { /* try again */ }
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  return false;
}

const secondsFor = (images) => Math.round((images * REEL.perImageMs) / 1000);

function hookFor(p, style, he) {
  if (style === "cinematic3d") {
    return he
      ? `✨ ${p?.title || "המוצר"} — סיפור מוצר קולנועי מבית LikeLink`
      : `✨ ${p?.title || "The product"} — a cinematic LikeLink product story`;
  }
  return he
    ? `🔥 ${p?.title || "המוצר"} — בואי תראי למה הוא שווה מקום בעגלה`
    : `🔥 ${p?.title || "The product"} — see why it belongs in your cart`;
}

export default function UGCCampaignStudio({ onNavigate }) {
  const { lang } = useI18n();
  const he = lang === "he";
  const { currentMarketer: marketer, products = [], showToast } = useMarketplace();
  const { addVideo } = useVideos();
  const mine = useMemo(
    () => products.filter((p) => p?.marketerId === marketer?.id && p?.status === "approved"),
    [products, marketer]
  );

  const [selectedId, setSelectedId] = useState("");
  const [characterType, setCharacterType] = useState(MODEL_TYPES[0]);
  const [activeStyle, setActiveStyle] = useState("ugc");
  const [campaign, setCampaign] = useState(null);
  const [busyAll, setBusyAll] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: "" });
  const [renders, setRenders] = useState({});
  const [playing, setPlaying] = useState("");
  const [playback, setPlayback] = useState({});
  const [message, setMessage] = useState("");

  const selected = mine.find((p) => p.id === selectedId) || mine[0] || null;
  const model = CHARACTER_PRESETS[characterType];

  useEffect(() => {
    if (!selected && mine[0]) setSelectedId(mine[0].id);
  }, [mine, selected]);

  const setRender = (key, item) => setRenders((r) => ({ ...r, [key]: { ...(r[key] || {}), ...item } }));

  // Nothing renders by itself: each reel is made on this phone and saved to
  // the cloud, so it runs only when the creator presses a button.
  const renderOne = async (product, styleId, { force = false } = {}) => {
    const style = VIDEO_STYLES.find((x) => x.id === styleId) || VIDEO_STYLES[0];
    const key = `${product.id}:${style.id}`;
    if (!force && (renders[key]?.url || savedReelOf(product))) return renders[key] || { status: "ready" };

    const images = productImages(product);
    if (!images.length) {
      const item = { status: "skipped", error: "missing_http_image" };
      setRender(key, item);
      return item;
    }

    try {
      // Real work started: a first-party reel for a real product.
      try { recordLunaHeartbeat("ugc"); } catch { /* best-effort */ }
      setRender(key, { status: "rendering", progress: 0, error: "" });
      setPlayback((v) => ({ ...v, [product.id]: "" }));
      const result = await generateProductReel({
        images,
        title: product.title || "",
        price: Number(product.price) || 0,
        hook: hookFor(product, style.id, he),
        cta: he ? "לרכישה · הלינק בפרופיל" : "Shop now · link in profile",
        storeName: marketer?.name || "LikeLink",
        palette: style.palette,
        onProgress: (p) => {
          setProgress((v) => ({ ...v, current: product.title || "", itemProgress: p }));
          setRender(key, { progress: p });
        },
      });
      // The phone plays its own recording at once; the cloud copy is checked separately.
      setRender(key, { status: "uploading", localUrl: result.url, seconds: Math.round(result.durationMs / 1000) });
      const remoteUrl = await uploadReelVideo(result.blob);
      if (!remoteUrl) {
        const item = { status: "preview", style: style.id, productId: product.id };
        setRender(key, item);
        return item;
      }
      addVideo({
        title: `${style.label} · ${product.title || "Reel"}`,
        description: hookFor(product, style.id, he),
        videoUrl: remoteUrl,
        marketerId: marketer?.id,
        productTags: [{ productId: product.id }],
        source: `likelink_first_party_${style.id}`,
        native: true,
        synthetic: true,
        public: true,
      });
      setRender(key, { status: "saved", url: remoteUrl, style: style.id, productId: product.id });
      // "Available" only when the cloud really serves it (after the server linked it to the product).
      const serves = await cloudCopyServes(remoteUrl);
      const item = { status: serves ? "ready" : "saved", url: remoteUrl, style: style.id, productId: product.id };
      setRender(key, item);
      return item;
    } catch (e) {
      const item = { status: "error", error: String(e?.message || e), style: style.id, productId: product.id };
      setRender(key, item);
      return item;
    }
  };

  const renderAll = async (styleId = activeStyle) => {
    if (!mine.length || !canRecordVideo() || busyAll) return;
    // Only products that have no saved reel yet: pressing again never redoes (or re-uploads) the rest.
    const queue = mine.filter((p) => !savedReelOf(p) && !["ready", "saved"].includes(renders[`${p.id}:${styleId}`]?.status));
    if (!queue.length) {
      showToast?.(he ? "לכל המוצרים כבר יש סרטון שמור. ליצירה מחדש: \"צור מחדש\" בכרטיס של המוצר." : "Every product already has a saved reel. To redo one, use its card.");
      return;
    }
    const ask = he
      ? `${queue.length} מוצרים בלי סרטון. הסרטונים נוצרים בטלפון הזה (כמה שניות לכל מוצר) ונשמרים בענן. להתחיל?`
      : `${queue.length} products have no reel. They are made on this device (a few seconds each) and saved to the cloud. Start?`;
    if (typeof window !== "undefined" && !window.confirm(ask)) return;
    setBusyAll(true);
    setMessage("");
    const outcome = { ready: 0, saved: 0, preview: 0, skipped: 0, error: 0 };
    setProgress({ done: 0, total: queue.length, current: "", itemProgress: 0 });
    for (const product of queue) {
      const item = await renderOne(product, styleId);
      if (item?.status === "ready") outcome.ready++;
      else if (item?.status === "saved") outcome.saved++;
      else if (item?.status === "preview") outcome.preview++;
      else if (item?.status === "skipped") outcome.skipped++;
      else outcome.error++;
      setProgress((v) => ({ ...v, done: v.done + 1, current: product.title || "" }));
      // Yield between products so the Studio stays responsive.
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    setBusyAll(false);
    // Exactly what happened to each product — available only when the cloud served it back.
    const parts = he
      ? [`${outcome.ready} סרטונים זמינים`, outcome.saved ? `${outcome.saved} נשמרו וממתינים לקישור למוצר` : "", outcome.preview ? `${outcome.preview} בטלפון בלבד (השמירה בענן נכשלה)` : "", outcome.skipped ? `${outcome.skipped} דולגו (אין תמונה)` : "", outcome.error ? `${outcome.error} נכשלו` : ""]
      : [`${outcome.ready} reels available`, outcome.saved ? `${outcome.saved} saved, waiting for the product link` : "", outcome.preview ? `${outcome.preview} on this device only` : "", outcome.skipped ? `${outcome.skipped} skipped (no image)` : "", outcome.error ? `${outcome.error} failed` : ""];
    showToast?.(parts.filter(Boolean).join(" · "));
  };

  useEffect(() => {
    if (!selected) return;
    const image = productImages(selected)[0] || "";
    setCampaign(buildCampaign(
      { ...selected, ugcImage: image },
      {
        storeUrl: typeof window !== "undefined" ? window.location.origin : "https://likelink2.vercel.app",
        angleStats: {},
      }
    ));
  }, [selected]);

  async function publish(provider) {
    if (!selected) return;
    setMessage("");
    // Real publishing work: the creator pressed publish for a real product.
    try { recordLunaHeartbeat("publishing"); } catch { /* best-effort */ }
    try {
      const token = await getSessionToken();
      const res = await fetch("/api/store?mode=publish", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          productId: selected.id,
          provider: provider || undefined,
          channel: provider || undefined,
          idempotencyKey: `ugc:${selected.id}:${provider || "likelink2"}`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || data.status || "publish_failed");
      if (data.status === "CONNECT_REQUIRED" || data.status === "ACTION_REQUIRED") {
        setMessage(he ? `נדרש חיבור אמיתי ל-${provider}. המערכת לא מסמנת פרסום כהצלחה ללא אישור מהערוץ.` : `A real ${provider} connection is required; publication is only marked after channel confirmation.`);
        return;
      }
      if (data.status !== "PUBLISHED") {
        // Accepted but not yet confirmed by the channel — never report success.
        setMessage(he ? "הבקשה התקבלה — הפרסום יסומן רק אחרי אישור מהערוץ" : "Accepted — marked published only after channel confirmation");
        return;
      }
      setMessage(data.publishedUrl || (he ? "פורסם" : "Published"));
      showToast?.(he ? `הפרסום ל-${provider || "LikeLink"} אושר לפי התוצאה האמיתית` : `Publication to ${provider || "LikeLink"} was confirmed`);
    } catch (e) {
      setMessage(he ? toHebrewError(e?.message, "הפרסום נכשל") : String(e?.message || "Publish failed"));
    }
  }

  if (!marketer) {
    return (
      <EmptyState
        icon={UserRound}
        title={he ? "התחברי כדי להפעיל את מפעל ה-UGC" : "Sign in to run the UGC factory"}
        body={he ? "המסך מציג רק תוכן אמיתי; יצירת וידאו ופרסום פועלים מתוך חשבון יוצר מאומת." : "This surface shows real content only; video generation and publishing run from a verified creator account."}
        action={<Button onClick={() => onNavigate?.("products")}>{he ? "התחברות / הרשמה" : "Sign in / register"}</Button>}
      />
    );
  }

  if (!mine.length) {
    return (
      <EmptyState
        icon={ImagePlus}
        title={he ? "אין מוצר מאושר ליצירת מדיה" : "No approved product for media"}
        body={he ? "הוסיפי מוצר אמיתי עם תמונה וקישור תקין." : "Add a real approved product with a valid image and destination."}
        action={<Button onClick={() => onNavigate?.("products")}>{he ? "למוצרים" : "Open products"}</Button>}
      />
    );
  }

  /** What a card shows: this visit's render for the chosen backdrop, else the reel already saved for the product. */
  const mediaOf = (product) => {
    const r = renders[`${product.id}:${activeStyle}`];
    if (r && r.status !== "error" && r.status !== "skipped") return { ...r, src: r.localUrl || r.url || "" };
    const saved = savedReelOf(product);
    if (saved) return { status: "ready", url: saved, src: saved, saved: true };
    return r || null;
  };
  const withReel = mine.filter((p) => ["ready", "saved"].includes(mediaOf(p)?.status)).length;
  const badgeOf = (product, media) => {
    if (playback[product.id] === "failed") return he ? "לא נטען בטלפון · נסי \"צור מחדש\"" : "Did not load · try again";
    switch (media?.status) {
      case "rendering": return he ? `יוצר בטלפון… ${Math.round((media.progress || 0) * 100)}%` : `Making… ${Math.round((media.progress || 0) * 100)}%`;
      case "uploading": return he ? "שומר בענן…" : "Saving…";
      case "saved": return he ? "נשמר · ממתין לקישור למוצר" : "Saved · waiting for the product link";
      case "ready": return playback[product.id] === "ok" ? (he ? "שמור · נבדק: מתנגן" : "Saved · plays") : (he ? "שמור · מקושר למוצר" : "Saved · linked to the product");
      case "preview": return he ? "בטלפון בלבד · לא נשמר" : "This device only · not saved";
      case "skipped": return he ? "אין תמונה למוצר" : "No product image";
      case "error": return he ? "היצירה נכשלה · נסי שוב" : "Failed · try again";
      default: return he ? "אין סרטון עדיין" : "No reel yet";
    }
  };

  return (
    <div className="ll-ugc-studio space-y-5" dir={he ? "rtl" : "ltr"} data-testid="ugc-campaign-studio">
      <section className="ll-card overflow-hidden rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-black tracking-wide" style={{ color: "var(--accent)" }}>
              <Sparkles size={14} /> LIKE LINK 2 · {he ? "סרטונים מתמונות המוצר" : "REELS FROM PRODUCT PHOTOS"}
            </div>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl" style={{ color: "var(--text)" }}>
              {he ? "סרטון קצר לכל מוצר — מתמונות המוצר" : "A short reel for every product — from its photos"}
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-7" style={{ color: "var(--text-secondary)" }}>
              {he ? `הסרטון נבנה בטלפון שלך מתמונות המוצר מהחנות (עד 4 תמונות, כ־${secondsFor(1)} שניות לכל תמונה), נשמר בענן ומקושר למוצר. זו אנימציה של תמונות — לא צילום של אדם ולא UGC אמיתי. נוצר רק כשלוחצים, ומוצר שכבר יש לו סרטון לא נוצר שוב.` : `Made on your device from the product's store photos (up to 4, about ${secondsFor(1)} s each), saved to the cloud and linked to the product. An animation of photos — not footage of a person, not real UGC. Made only when you press, and never again for a product that has one.`}
            </p>
          </div>
          <button type="button" onClick={() => onNavigate?.("share")} className="flex items-center gap-2 rounded-full px-3 py-2 text-xs font-black" style={{ background: "var(--accent)", color: "#fff" }}>
            <Sparkles size={15} /> {he ? "סרטון אנימציה עם דמות שמדברת ← בפרסום לרשתות" : "Animated character reel → Share"}
          </button>
          <div className="flex items-center gap-2 rounded-full px-3 py-2 text-xs font-black" style={{ background: "var(--success-subtle)", color: "var(--success)" }}>
            <ShieldCheck size={15} /> {he ? "רק תמונות המוצר · בלי המצאות" : "Product photos only · nothing invented"}
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[1.25fr_.8fr_.8fr]">
          <label className="text-xs font-bold" style={{ color: "var(--text-secondary)" }}>
            {he ? "מוצר פעיל" : "Active product"}
            <select value={selected?.id || ""} onChange={(e) => setSelectedId(e.target.value)} className="input-field mt-1.5 w-full rounded-xl px-3 py-3" style={{ background: "var(--bg-subtle)", color: "var(--text)" }}>
              {mine.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold" style={{ color: "var(--text-secondary)" }}>
            {he ? "דוגמנית / יוצרת" : "Model / creator"}
            <select value={characterType} onChange={(e) => setCharacterType(e.target.value)} className="input-field mt-1.5 w-full rounded-xl px-3 py-3" style={{ background: "var(--bg-subtle)", color: "var(--text)" }}>
              {MODEL_TYPES.map((type) => <option key={type} value={type}>{modelLabel(type, he)} · AI</option>)}
            </select>
          </label>
          <div className="rounded-xl p-3" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2 text-sm font-bold" style={{ color: "var(--text)" }}><UserRound size={16} /> {modelLabel(characterType, he)}</div>
            <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{he ? model?.persona?.he : model?.persona?.en}</div>
            <div className="mt-2 text-[10px] font-bold" style={{ color: "var(--accent)" }}>{he ? "דמות סינתטית מקורית — לא אדם אמיתי" : "Original synthetic character — not a real person"}</div>
            <div className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>{he ? "הדמות עדיין לא מופיעה בסרטון: הריל נוצר מתמונות המוצר בלבד." : "The character does not appear in the video yet: reels are built from the product photos only."}</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {VIDEO_STYLES.map((style) => (
            <button key={style.id} onClick={() => setActiveStyle(style.id)} className="rounded-full px-4 py-2 text-xs font-black" style={{ background: activeStyle === style.id ? "var(--accent)" : "var(--bg-subtle)", color: activeStyle === style.id ? "#fff" : "var(--text-secondary)", border: "1px solid var(--border)" }}>
              {he ? style.he : style.label} · {style.badge}
            </button>
          ))}
          <Button onClick={() => renderAll(activeStyle)} disabled={busyAll || !canRecordVideo()}>
            {busyAll ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
            {he ? "יצירת סרטון למוצרים בלי סרטון" : "Make reels for products without one"}
          </Button>
        </div>

        {busyAll && (
          <div className="mt-4 rounded-2xl p-4" style={{ background: "var(--bg-subtle)" }}>
            <div className="flex items-center justify-between text-xs font-bold" style={{ color: "var(--text)" }}>
              <span>{he ? `יוצר: ${progress.current || "מתחיל"}` : `Rendering: ${progress.current || "starting"}`}</span>
              <span dir="ltr">{progress.done}/{progress.total} · {Math.round((progress.itemProgress || 0) * 100)}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
              <div className="h-full rounded-full" style={{ width: `${progress.total ? Math.min(100, ((progress.done + (progress.itemProgress || 0)) / progress.total) * 100) : 0}%`, background: "var(--gradient-brand)" }} />
            </div>
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-black" style={{ color: "var(--text)" }}>{he ? "הסרטונים של המוצרים" : "Product video gallery"}</h3>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>{he ? `${mine.length} מוצרים · ${withReel} עם סרטון שמור` : `${mine.length} products · ${withReel} with a saved reel`}</p>
          </div>
          <div className="rounded-full px-3 py-1.5 text-[10px] font-black" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
            {he ? "לחצי על מוצר כדי לצפות" : "Tap a product to watch"}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {mine.map((product) => {
            const media = mediaOf(product);
            const image = productImages(product)[0];
            const busy = media?.status === "rendering" || media?.status === "uploading";
            // One player at a time: a phone refuses to load dozens of videos at once.
            const isPlaying = playing === product.id && media?.src;
            return (
              <article key={product.id} className="ll-card overflow-hidden rounded-3xl">
                <div className="relative aspect-[9/12] overflow-hidden" style={{ background: "var(--bg-subtle)" }}>
                  {isPlaying ? (
                    <video
                      key={media.src}
                      src={media.src}
                      poster={image || undefined}
                      controls autoPlay playsInline muted loop preload="auto"
                      onLoadedData={() => setPlayback((v) => ({ ...v, [product.id]: "ok" }))}
                      onError={() => setPlayback((v) => ({ ...v, [product.id]: "failed" }))}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => media?.src && setPlaying(product.id)}
                      disabled={!media?.src}
                      className="relative block h-full w-full"
                      aria-label={media?.src ? (he ? `צפייה בסרטון: ${product.title}` : `Watch: ${product.title}`) : (product.title || "")}
                    >
                      {image ? <img src={image} alt="" className="h-full w-full object-cover opacity-90" /> : <span className="flex h-full items-center justify-center"><Clapperboard size={28} style={{ color: "var(--text-faint)" }} /></span>}
                      {media?.src && !busy && (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(5,8,17,.7)", color: "#fff" }}><Play size={24} /></span>
                        </span>
                      )}
                      {busy && (
                        <span className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(5,8,17,.45)" }}>
                          <Loader2 size={30} className="animate-spin" style={{ color: "#fff" }} />
                        </span>
                      )}
                    </button>
                  )}
                  <div className="absolute right-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-black" style={{ background: "rgba(5,8,17,.82)", color: "#fff" }}>
                    {badgeOf(product, media)}
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-black" style={{ color: "var(--text)" }}>{product.title}</h4>
                      <p className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {Number(product.price) > 0 ? `${Number(product.price).toLocaleString("he-IL")} ₪` : (he ? "מחיר בחנות" : "Store price")}
                        {media?.seconds ? ` · ${he ? `${media.seconds} שניות` : `${media.seconds} s`}` : ""}
                      </p>
                    </div>
                    {media?.status === "ready" ? <CheckCircle2 size={17} style={{ color: "var(--success)" }} /> : <Video size={17} style={{ color: "var(--accent)" }} />}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={async () => {
                        setSelectedId(product.id);
                        setPlaying(product.id);
                        const item = await renderOne(product, activeStyle, { force: true });
                        if (item?.status === "error") showToast?.(he ? toHebrewError(item.error, "יצירת הסרטון נכשלה") : `Failed: ${item.error}`);
                        else if (item?.status === "skipped") showToast?.(he ? "למוצר הזה אין תמונה מהחנות" : "This product has no store photo");
                        else if (item?.status === "preview") showToast?.(he ? "הסרטון נוצר בטלפון, אבל השמירה בענן נכשלה" : "Made on this device, but saving failed");
                      }}
                      disabled={busyAll || busy}
                      className="rounded-xl px-3 py-2 text-[11px] font-black"
                      style={{ background: "var(--accent-subtle)", color: "var(--accent)", opacity: busyAll || busy ? 0.6 : 1 }}
                    >
                      <span className="inline-flex items-center gap-1">
                        {busy ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                        {busy ? (he ? "יוצר…" : "Making…") : media?.src ? (he ? "צור מחדש" : "Make again") : (he ? "צור סרטון" : "Make reel")}
                      </span>
                    </button>
                    <button onClick={() => onNavigate?.("share")} className="rounded-xl px-3 py-2 text-[11px] font-black" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>
                      <span className="inline-flex items-center gap-1"><ExternalLink size={12} /> {he ? "לפרסום ברשתות" : "Share"}</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {campaign && (
        <section className="ll-card rounded-3xl p-5">
          <div className="flex items-center gap-2"><Megaphone size={17} style={{ color: "var(--accent)" }} /><b style={{ color: "var(--text)" }}>{he ? "חבילת הקמפיין למוצר הפעיל" : "Campaign pack for the active product"}</b></div>
          <h3 className="mt-2 text-xl font-black" style={{ color: "var(--text)" }}>{campaign.chosenHook?.text?.split("\n")[0] || selected.title}</h3>
          <p className="mt-2 text-sm leading-7" style={{ color: "var(--text-secondary)" }}>{campaign.story}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => publish()}><ExternalLink size={15} /> {he ? "פרסום פנימי" : "Publish internally"}</Button>
            {CHANNELS.map(([id, label]) => <button key={id} onClick={() => publish(id)} className="rounded-xl px-3 py-2 text-xs font-bold" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>{label}</button>)}
          </div>
          {message && <div className="mt-3 rounded-xl p-3 text-xs" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>{message}</div>}
          <div className="mt-3 flex items-center gap-2 text-[10px]" style={{ color: "var(--text-faint)" }}>
            <BarChart3 size={13} /> {he ? "כל צפייה/קליק נמדדים רק כשאירוע אמיתי מתקבל." : "Views and clicks are measured only from real events."}
          </div>
        </section>
      )}
    </div>
  );
}
