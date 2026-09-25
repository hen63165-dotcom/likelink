import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3, CheckCircle2, Clapperboard, ExternalLink, ImagePlus,
  Loader2, Megaphone, Play, Radio, ShieldCheck, Sparkles, UserRound, Video, Wand2
} from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { Button, EmptyState } from "../ui/index.jsx";
import { useVideos } from "../../context/VideoContext";
import { generateProductReel, canRecordVideo } from "../../lib/videoEngine.js";
import { uploadReelVideo } from "../../lib/uploadVideo.js";
import { buildCampaign } from "../../lib/cloud/campaign.js";
import { CHARACTER_PRESETS, CHARACTER_TYPES } from "../../lib/cloud/characters.js";

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

const VIDEO_STYLES = [
  { id: "ugc", label: "UGC", palette: "dark", badge: "יוצרת · 9:16" },
  { id: "cinematic3d", label: "3D Cinematic", palette: "gold", badge: "אנימציה מקורית · 9:16" },
];

function modelLabel(type, he) {
  const p = CHARACTER_PRESETS[type];
  return p ? (he ? p.name.he : p.name.en) : type;
}

function productImages(p) {
  return [p?.image, p?.image2, p?.image3].filter((x) => typeof x === "string" && /^https?:\/\//i.test(x));
}

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
  const [message, setMessage] = useState("");
  const startedRef = useRef(false);

  const selected = mine.find((p) => p.id === selectedId) || mine[0] || null;
  const model = CHARACTER_PRESETS[characterType];

  useEffect(() => {
    if (!selected && mine[0]) setSelectedId(mine[0].id);
  }, [mine, selected]);

  const renderOne = async (product, styleId) => {
    const style = VIDEO_STYLES.find((x) => x.id === styleId) || VIDEO_STYLES[0];
    const key = `${product.id}:${style.id}`;
    if (renders[key]?.url) return renders[key];

    const images = productImages(product);
    if (!images.length) {
      const item = { status: "skipped", error: "missing_http_image" };
      setRenders((r) => ({ ...r, [key]: item }));
      return item;
    }

    try {
      const result = await generateProductReel({
        images,
        title: product.title || "",
        price: Number(product.price) || 0,
        hook: hookFor(product, style.id, he),
        cta: he ? "לרכישה · הלינק בפרופיל" : "Shop now · link in profile",
        storeName: marketer?.name || "LikeLink",
        palette: style.palette,
        onProgress: (p) => setProgress((v) => ({ ...v, current: product.title || "", itemProgress: p })),
      });
      const remoteUrl = await uploadReelVideo(result.blob);
      const url = remoteUrl || result.url;
      const item = {
        status: "ready",
        url,
        remote: Boolean(remoteUrl),
        mime: result.mime,
        style: style.id,
        productId: product.id,
      };
      setRenders((r) => ({ ...r, [key]: item }));
      addVideo({
        title: `${style.label} · ${product.title || "Reel"}`,
        description: hookFor(product, style.id, he),
        videoUrl: url,
        marketerId: marketer?.id,
        productTags: [{ productId: product.id }],
        source: `likelink_first_party_${style.id}`,
        public: Boolean(remoteUrl),
      });
      return item;
    } catch (e) {
      const item = { status: "error", error: String(e?.message || e), style: style.id, productId: product.id };
      setRenders((r) => ({ ...r, [key]: item }));
      return item;
    }
  };

  const renderAll = async (styleId = activeStyle) => {
    if (!mine.length || !canRecordVideo() || busyAll) return;
    setBusyAll(true);
    setMessage("");
    const queue = mine.slice();
    setProgress({ done: 0, total: queue.length, current: "", itemProgress: 0 });
    for (const product of queue) {
      await renderOne(product, styleId);
      setProgress((v) => ({ ...v, done: v.done + 1, current: product.title || "" }));
      // Yield between products so the Studio stays responsive.
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    setBusyAll(false);
    showToast?.(he ? `נוצרו ${queue.length} סרטוני ${styleId === "ugc" ? "UGC" : "3D"} אמיתיים ונשמרו בפיד` : `${queue.length} real ${styleId === "ugc" ? "UGC" : "3D"} videos generated and saved`);
  };

  // On entering UGC, automatically build the complete first-party UGC set once.
  useEffect(() => {
    if (!marketer || !mine.length || startedRef.current || !canRecordVideo()) return;
    startedRef.current = true;
    renderAll("ugc");
    // Intentionally runs once per Studio entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketer?.id, mine.length]);

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
    try {
      const token = typeof window !== "undefined" ? window.__likelink?.token || "" : "";
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
      setMessage(data.publishedUrl || data.status || "PUBLISHED");
      showToast?.(he ? `הפרסום ל-${provider || "LikeLink"} אושר לפי התוצאה האמיתית` : `Publication to ${provider || "LikeLink"} was confirmed`);
    } catch (e) {
      setMessage(String(e?.message || "publish_failed"));
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

  const totalReady = Object.values(renders).filter((x) => x?.status === "ready").length;
  const styleReady = Object.values(renders).filter((x) => x?.status === "ready" && x.style === activeStyle).length;

  return (
    <div className="ll-ugc-studio space-y-5" dir={he ? "rtl" : "ltr"} data-testid="ugc-campaign-studio">
      <section className="ll-card overflow-hidden rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-black tracking-wide" style={{ color: "var(--accent)" }}>
              <Sparkles size={14} /> LIKE LINK 2 · CREATOR GROWTH OS · UGC FACTORY
            </div>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl" style={{ color: "var(--text)" }}>
              {he ? "מפעל תוכן אמיתי — סרטון לכל מוצר" : "Real content factory — a video for every product"}
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-7" style={{ color: "var(--text-secondary)" }}>
              {he ? "כל מוצר מאושר מקבל ריל 9:16 שנוצר במנוע הווידאו הראשון-צדדי של LikeLink, עולה לאחסון כאשר זמין, ונכנס לפיד התוכן. אין תמונות אנליטיקה בתוך קריאייטיב, ואין ספק AI חיצוני נדרש." : "Every approved product gets a 9:16 reel from LikeLink's first-party browser engine, uploaded when available and added to the content feed. Dashboard analytics images are never used as creative media."}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full px-3 py-2 text-xs font-black" style={{ background: "var(--success-subtle)", color: "var(--success)" }}>
            <ShieldCheck size={15} /> {he ? "מקור ראשון · אמיתי · ללא דמו" : "First-party · real · no demo"}
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
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {VIDEO_STYLES.map((style) => (
            <button key={style.id} onClick={() => setActiveStyle(style.id)} className="rounded-full px-4 py-2 text-xs font-black" style={{ background: activeStyle === style.id ? "var(--accent)" : "var(--bg-subtle)", color: activeStyle === style.id ? "#fff" : "var(--text-secondary)", border: "1px solid var(--border)" }}>
              {style.label} · {style.badge}
            </button>
          ))}
          <Button onClick={() => renderAll(activeStyle)} disabled={busyAll || !canRecordVideo()}>
            {busyAll ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
            {he ? `הפקת ${activeStyle === "ugc" ? "UGC" : "3D"} לכל המוצרים` : `Generate ${activeStyle === "ugc" ? "UGC" : "3D"} for every product`}
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
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>{he ? `${mine.length} מוצרים · ${styleReady} סרטוני ${activeStyle === "ugc" ? "UGC" : "3D"} מוכנים` : `${mine.length} products · ${styleReady} ${activeStyle === "ugc" ? "UGC" : "3D"} videos ready`}</p>
          </div>
          <div className="rounded-full px-3 py-1.5 text-[10px] font-black" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
            {he ? `${totalReady} נכסים מוכנים` : `${totalReady} assets ready`}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {mine.map((product) => {
            const key = `${product.id}:${activeStyle}`;
            const media = renders[key];
            const image = productImages(product)[0];
            return (
              <article key={product.id} className="ll-card overflow-hidden rounded-3xl">
                <div className="relative aspect-[9/12] overflow-hidden" style={{ background: "var(--bg-subtle)" }}>
                  {media?.url ? (
                    <video src={media.url} controls playsInline muted loop className="h-full w-full object-cover" />
                  ) : image ? (
                    <img src={image} alt="" className="h-full w-full object-cover opacity-90" />
                  ) : (
                    <div className="flex h-full items-center justify-center"><Clapperboard size={28} style={{ color: "var(--text-faint)" }} /></div>
                  )}
                  <div className="absolute right-3 top-3 rounded-full px-2.5 py-1 text-[9px] font-black" style={{ background: "rgba(5,8,17,.82)", color: "#fff" }}>
                    {media?.status === "ready" ? (activeStyle === "ugc" ? "UGC · READY" : "3D · READY") : (busyAll ? "RENDERING" : "READY TO GENERATE")}
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-black" style={{ color: "var(--text)" }}>{product.title}</h4>
                      <p className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>{Number(product.price) > 0 ? `${Number(product.price).toLocaleString("he-IL")} ₪` : (he ? "מחיר בחנות" : "Store price")}</p>
                    </div>
                    {media?.remote ? <CheckCircle2 size={17} style={{ color: "var(--success)" }} /> : <Video size={17} style={{ color: "var(--accent)" }} />}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button onClick={() => { setSelectedId(product.id); renderOne(product, activeStyle); }} disabled={busyAll} className="rounded-xl px-3 py-2 text-[11px] font-black" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
                      <span className="inline-flex items-center gap-1"><Play size={12} /> {he ? "צור / רענן" : "Generate / refresh"}</span>
                    </button>
                    <button onClick={() => onNavigate?.("publishing")} className="rounded-xl px-3 py-2 text-[11px] font-black" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>
                      <span className="inline-flex items-center gap-1"><ExternalLink size={12} /> {he ? "להפצה" : "Distribute"}</span>
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
