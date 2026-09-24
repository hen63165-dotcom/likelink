import React, { useEffect, useMemo, useState } from "react";
import { Bot, CheckCircle2, ExternalLink, ImagePlus, Megaphone, Play, Radio, Sparkles, UserRound, Video, Wand2, ShieldCheck, BarChart3 } from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { Button, EmptyState } from "../ui/index.jsx";
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

function modelLabel(type, he) {
  const p = CHARACTER_PRESETS[type];
  return p ? (he ? p.name.he : p.name.en) : type;
}

export default function UGCCampaignStudio({ onNavigate }) {
  const { lang } = useI18n();
  const he = lang === "he";
  const { currentMarketer: marketer, products = [], showToast } = useMarketplace();
  const mine = useMemo(
    () => products.filter((p) => p?.marketerId === marketer?.id && p?.status === "approved"),
    [products, marketer]
  );

  const [productId, setProductId] = useState("");
  const [characterType, setCharacterType] = useState(MODEL_TYPES[0]);
  const [imageUrl, setImageUrl] = useState("");
  const [asset, setAsset] = useState(null);
  const [campaign, setCampaign] = useState(null);
  const [busy, setBusy] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);
  const [publishBusy, setPublishBusy] = useState("");
  const [message, setMessage] = useState("");
  const [videoStatus, setVideoStatus] = useState("");
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState("");

  const selected = mine.find((p) => p.id === productId) || mine[0] || null;
  const model = CHARACTER_PRESETS[characterType];

  const token = () => typeof window !== "undefined" ? window.__likelink?.token || "" : "";
  const authHeaders = () => ({ "content-type": "application/json", ...(token() ? { authorization: `Bearer ${token()}` } : {}) });

  const queueVideoForAsset = async (assetToQueue, silent = false) => {
    if (!selected || !assetToQueue?.id) return null;
    if (!silent) { setVideoBusy(true); setMessage(""); }
    try {
      const res = await fetch("/api/store?mode=ugc-video-queue", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ productId: selected.id, assetId: assetToQueue.id, characterType }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.detail || data.error || "ugc_video_queue_failed");
      const nextAsset = data.asset || assetToQueue;
      setAsset(nextAsset);
      setVideoStatus(nextAsset.videoStatus || data.status || "queued");
      setVideoProgress(Number(nextAsset.videoProgress || 0));
      if (!silent) showToast?.(he ? "וידאו UGC נכנס לתור הענן" : "UGC video entered the cloud queue");
      return nextAsset;
    } catch (e) {
      if (!silent) setMessage(String(e?.message || "ugc_video_queue_failed"));
      return null;
    } finally {
      if (!silent) setVideoBusy(false);
    }
  };

  const generate = async () => {
    if (!selected || !marketer) return;
    setBusy(true); setMessage("");
    try {
      const res = await fetch("/api/store?mode=ugc-model", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ productId: selected.id, characterType }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "ugc_model_failed");
      const nextAsset = data.asset || null;
      setAsset(nextAsset);
      setImageUrl(data.imageUrl || nextAsset?.imageUrl || "");
      setVideoUrl(nextAsset?.videoUrl || "");
      setVideoStatus(nextAsset?.videoStatus || "");
      setVideoProgress(Number(nextAsset?.videoProgress || 0));
      const nextProduct = { ...selected, ugcImage: data.imageUrl || nextAsset?.imageUrl };
      setCampaign(buildCampaign(nextProduct, {
        storeUrl: typeof window !== "undefined" ? window.location.origin : "https://likelink2.vercel.app",
        angleStats: {},
      }));
      showToast?.(he ? "Luna יצרה UGC סינתטי אמיתי ושמרה אותו בענן" : "Luna created real synthetic UGC and stored it in the cloud");
      if (nextAsset?.id && !nextAsset?.videoUrl && !nextAsset?.videoJobId) {
        const queued = await queueVideoForAsset(nextAsset, true);
        if (!queued && nextAsset) {
          setVideoStatus("BLOCKED");
        }
      }
    } catch (e) {
      setMessage(String(e?.message || "ugc_model_failed"));
    } finally {
      setBusy(false);
    }
  };

  const queueVideo = async () => {
    await queueVideoForAsset(asset, false);
  };

  useEffect(() => {
    if (!asset?.videoJobId || videoUrl) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/store?mode=ugc-video-status", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ productId: selected?.id, videoJobId: asset.videoJobId }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled || !data?.ok) return;
        if (data.asset) setAsset(data.asset);
        setVideoStatus(data.status || data.asset?.videoStatus || "");
        setVideoProgress(Number(data.asset?.videoProgress || 0));
        if (data.asset?.videoUrl) setVideoUrl(data.asset.videoUrl);
      } catch {}
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [asset?.videoJobId, selected?.id, videoUrl]);

  const publish = async (provider) => {
    if (!selected) return;
    setPublishBusy(provider || "likelink2"); setMessage("");
    try {
      const res = await fetch("/api/store?mode=publish", {
        method: "POST",
        headers: authHeaders(),
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
        setMessage(he ? `נדרש חיבור אמיתי ל-${provider}. AutoPilot לא יסמן פרסום בלי חיבור מאומת.` : `A real ${provider} connection is required. AutoPilot will not mark publication successful without verification.`);
        return;
      }
      showToast?.(he ? `הפרסום ל-${provider || "LikeLink2"} אושר לפי תוצאה אמיתית` : `Publication to ${provider || "LikeLink2"} confirmed by the real result`);
      setMessage(data.publishedUrl || data.status || "PUBLISHED");
    } catch (e) {
      setMessage(String(e?.message || "publish_failed"));
    } finally {
      setPublishBusy("");
    }
  };

  if (!marketer) {
    return <EmptyState icon={UserRound} title={he ? "התחברי כדי לבנות קמפיין UGC" : "Sign in to build a UGC campaign"} body={he ? "הקמפיין עובד רק על מוצר אמיתי שבבעלות הסטודיו שלך." : "Campaigns operate only on a real approved product owned by your studio."} action={<Button onClick={() => onNavigate?.("products")}>{he ? "התחברות / הרשמה" : "Sign in / register"}</Button>} />;
  }

  if (!mine.length) {
    return <EmptyState icon={ImagePlus} title={he ? "אין מוצר מאושר לקמפיין UGC" : "No approved product for UGC"} body={he ? "הוסיפי מוצר אמיתי עם תמונה וקישור תקין. לא נוצרים כאן מוצרי דמו." : "Add a real approved product with a valid image and link. No demo products are created here."} action={<Button onClick={() => onNavigate?.("products")}>{he ? "למוצרים" : "Open products"}</Button>} />;
  }

  return (
    <div className="ll-ugc-studio space-y-4" dir={he ? "rtl" : "ltr"} data-testid="ugc-campaign-studio">
      <section className="ll-card rounded-3xl p-5 overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-black" style={{ color: "var(--accent)" }}>
              <Sparkles size={14} /> LIKE LINK 2 · CREATOR GROWTH OS · UGC
            </div>
            <h2 className="mt-2 text-3xl font-black leading-tight" style={{ color: "var(--text)" }}>
              {he ? "סטודיו UGC של Luna — דוגמנית AI, וידאו, פרסום ומדידה" : "Luna UGC Studio — AI creator, video, distribution and measurement"}
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-7" style={{ color: "var(--text-secondary)" }}>
              {he ? "אותו מוצר אמיתי עובר דרך יצירת המדיה, קישור מדידה, AutoPilot והערוצים המחוברים. הדמות סינתטית ומסומנת. אין מספרים, ביקורות או תוצאות שהמערכת ממציאה." : "The same real product flows through media creation, tracked links, AutoPilot and connected channels. The creator is synthetic and disclosed. No numbers, reviews or outcomes are invented."}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-black" style={{ background: "var(--success-subtle)", color: "var(--success)" }}>
            <ShieldCheck size={15} /> {he ? "ענן · מאומת · ללא דמו" : "Cloud · verified · no demo"}
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <label className="text-xs font-bold" style={{ color: "var(--text-secondary)" }}>
            {he ? "מוצר מאושר" : "Approved product"}
            <select value={selected?.id || ""} onChange={(e) => setProductId(e.target.value)} className="input-field mt-1.5 w-full rounded-xl px-3 py-3" style={{ background: "var(--bg-subtle)", color: "var(--text)" }}>
              {mine.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold" style={{ color: "var(--text-secondary)" }}>
            {he ? "הדוגמנית / היוצרת" : "Model / creator"}
            <select value={characterType} onChange={(e) => setCharacterType(e.target.value)} className="input-field mt-1.5 w-full rounded-xl px-3 py-3" style={{ background: "var(--bg-subtle)", color: "var(--text)" }}>
              {MODEL_TYPES.map((type) => <option key={type} value={type}>{modelLabel(type, he)} · AI</option>)}
            </select>
          </label>
          <div className="rounded-xl p-3" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2 text-sm font-bold" style={{ color: "var(--text)" }}><Bot size={16} /> {modelLabel(characterType, he)}</div>
            <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{he ? model.persona.he : model.persona.en}</div>
            <div className="mt-2 text-[10px] font-bold" style={{ color: "var(--accent)" }}>{he ? "דמות סינתטית מקורית — לא אדם אמיתי" : "Original synthetic character — not a real person"}</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={generate} disabled={busy}>
            <Wand2 size={16} /> {busy ? (he ? "Luna יוצרת…" : "Luna is creating…") : (he ? "צור UGC עם הדוגמנית" : "Create UGC with model")}
          </Button>
          <Button variant="secondary" onClick={queueVideo} disabled={!asset || videoBusy || Boolean(videoUrl)}>
            <Video size={15} /> {videoBusy ? (he ? "מעלה לתור…" : "Queueing…") : (he ? "הפקת וידאו AI בענן" : "Generate cloud AI video")}
          </Button>
          <Button variant="secondary" onClick={() => onNavigate?.("autopilot")}><Radio size={15} /> {he ? "חיבור AutoPilot" : "Open AutoPilot"}</Button>
        </div>
        {message && <div className="mt-3 rounded-xl p-3 text-xs" style={{ background: "var(--danger-subtle)", color: "var(--text-secondary)" }}>{message}</div>}
      </section>

      {imageUrl && campaign && (
        <>
          <section className="grid gap-4 xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
            <div className="ll-card rounded-3xl p-4 overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <div><b style={{ color: "var(--text)" }}>{he ? "היוצרת הסינתטית" : "Synthetic creator"}</b><div className="text-xs" style={{ color: "var(--text-muted)" }}>{he ? "מקור: OpenAI Image · נשמר בענן" : "Source: OpenAI Image · stored in cloud"}</div></div>
                <CheckCircle2 size={18} style={{ color: "var(--success)" }} />
              </div>
              <div className="relative overflow-hidden rounded-2xl">
                <img src={imageUrl} alt={he ? `דוגמנית AI מציגה ${selected.title}` : `AI creator presenting ${selected.title}`} className="w-full max-h-[720px] object-cover" />
                <div className="absolute bottom-3 right-3 rounded-full px-3 py-1.5 text-[10px] font-black" style={{ background: "rgba(5,8,17,.78)", color: "#fff" }}>AI · SYNTHETIC</div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-xl p-3" style={{ background: "var(--bg-subtle)" }}><ImagePlus size={14} /><b className="block mt-1 text-xs">{he ? "תמונה" : "Image"}</b><span className="text-[9px]" style={{ color: "var(--text-muted)" }}>READY</span></div>
                <div className="rounded-xl p-3" style={{ background: "var(--bg-subtle)" }}><Video size={14} /><b className="block mt-1 text-xs">{he ? "וידאו" : "Video"}</b><span className="text-[9px]" style={{ color: "var(--text-muted)" }}>{videoStatus || "NOT_QUEUED"}</span></div>
                <div className="rounded-xl p-3" style={{ background: "var(--bg-subtle)" }}><BarChart3 size={14} /><b className="block mt-1 text-xs">{he ? "מדידה" : "Tracking"}</b><span className="text-[9px]" style={{ color: "var(--text-muted)" }}>UTM</span></div>
              </div>
            </div>

            <div className="space-y-4">
              {videoUrl && (
                <div className="ll-card rounded-3xl p-4">
                  <div className="flex items-center justify-between">
                    <div><b style={{ color: "var(--text)" }}>{he ? "וידאו UGC מוכן" : "UGC video ready"}</b><div className="text-xs" style={{ color: "var(--text-muted)" }}>{he ? "נוצר בענן ומקושר לאותו מוצר" : "Cloud-generated and linked to the same product"}</div></div>
                    <CheckCircle2 size={18} style={{ color: "var(--success)" }} />
                  </div>
                  <video className="mt-3 w-full rounded-2xl" controls playsInline src={videoUrl} />
                </div>
              )}

              {!videoUrl && asset?.videoJobId && (
                <div className="ll-card rounded-3xl p-4">
                  <div className="flex items-center gap-2"><Video size={17} style={{ color: "var(--accent)" }} /><b style={{ color: "var(--text)" }}>{he ? "וידאו בתהליך" : "Video processing"}</b></div>
                  <div className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>{videoStatus || "queued"} · {videoProgress}%</div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: "var(--bg-subtle)" }}><div style={{ width: `${Math.max(0, Math.min(100, videoProgress))}%`, height: "100%", background: "var(--gradient-brand)" }} /></div>
                </div>
              )}

              <div className="ll-card rounded-3xl p-5">
                <div className="flex items-center gap-2"><Megaphone size={17} style={{ color: "var(--accent)" }} /><b style={{ color: "var(--text)" }}>{he ? "חבילת הקמפיין" : "Campaign pack"}</b></div>
                <h3 className="mt-3 text-xl font-black" style={{ color: "var(--text)" }}>{campaign.chosenHook?.text?.split("\n")[0] || selected.title}</h3>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7" style={{ color: "var(--text-secondary)" }}>{campaign.story}</p>
                <div className="mt-4 rounded-2xl p-4" style={{ background: "var(--bg-subtle)" }}>
                  <div className="flex items-center gap-2 text-xs font-bold" style={{ color: "var(--accent)" }}><Play size={13} /> {he ? "סקריפט UGC" : "UGC script"}</div>
                  <div className="mt-2 space-y-2">{campaign.script.map((s) => <div key={s.t} className="text-xs" style={{ color: "var(--text-secondary)" }}><b>{s.t}</b> · {s.visual} · {s.caption}</div>)}</div>
                </div>
                <div className="mt-4 rounded-2xl p-4" style={{ background: "var(--bg-subtle)" }}>
                  <div className="text-xs font-bold" style={{ color: "var(--text)" }}>{he ? "קישור מדידה" : "Tracked destination"}</div>
                  <div className="mt-1 break-all text-[11px]" style={{ color: "var(--text-muted)" }}>{campaign.trackedUrl}</div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={() => publish()} disabled={Boolean(publishBusy)}><ExternalLink size={15} /> {he ? "פרסום פנימי" : "Publish internally"}</Button>
                  {CHANNELS.map(([id, label]) => <button key={id} onClick={() => publish(id)} disabled={Boolean(publishBusy)} className="rounded-xl px-3 py-2 text-xs font-bold" style={{ background: "var(--accent-subtle)", color: "var(--accent)", opacity: publishBusy && publishBusy !== id ? 0.5 : 1 }}>{publishBusy === id ? "…" : label}</button>)}
                </div>
                <div className="mt-3 flex items-center gap-2 text-[10px]" style={{ color: "var(--text-faint)" }}><ShieldCheck size={13} /> {he ? "פרסום חיצוני מסומן כהצלחה רק לאחר חיבור ותוצאה אמיתיים." : "External publishing is marked successful only after a real connection and result."}</div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
