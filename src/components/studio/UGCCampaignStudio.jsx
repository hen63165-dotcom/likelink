import React, { useMemo, useState } from "react";
import { Bot, CheckCircle2, ExternalLink, ImagePlus, Megaphone, Play, Radio, Sparkles, UserRound, Wand2 } from "lucide-react";
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
  const [campaign, setCampaign] = useState(null);
  const [busy, setBusy] = useState(false);
  const [publishBusy, setPublishBusy] = useState("");
  const [message, setMessage] = useState("");
  const selected = mine.find((p) => p.id === productId) || mine[0] || null;
  const model = CHARACTER_PRESETS[characterType];

  const generate = async () => {
    if (!selected || !marketer) return;
    setBusy(true); setMessage("");
    try {
      const token = typeof window !== "undefined" ? window.__likelink?.token || "" : "";
      const res = await fetch("/api/store?mode=ugc-model", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ productId: selected.id, characterType }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "ugc_model_failed");
      setImageUrl(data.imageUrl || "");
      const nextProduct = { ...selected, ugcImage: data.imageUrl };
      const pack = buildCampaign(nextProduct, {
        storeUrl: typeof window !== "undefined" ? window.location.origin : "https://likelink2.vercel.app",
        angleStats: {},
      });
      setCampaign(pack);
      showToast?.(he ? "נוצרה תמונת UGC אמיתית עם דוגמנית AI ונשמרה בענן" : "Real AI-model UGC image generated and stored in the cloud");
    } catch (e) {
      setMessage(String(e?.message || "ugc_model_failed"));
    } finally {
      setBusy(false);
    }
  };

  const publish = async (provider) => {
    if (!selected) return;
    setPublishBusy(provider || "likelink2"); setMessage("");
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
        setMessage(he ? `נדרש חיבור אמיתי ל-${provider}. פתחי AutoPilot וחברי את הערוץ.` : `A real ${provider} connection is required. Open AutoPilot and connect the channel.`);
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
    return <EmptyState icon={ImagePlus} title={he ? "אין מוצר מאושר לקמפיין UGC" : "No approved product for UGC"} body={he ? "הוסיפי מוצר אמיתי עם תמונה וקישור תקין. לא יוצרים כאן מוצרי דמו." : "Add a real approved product with a valid image and link. No demo products are created here."} action={<Button onClick={() => onNavigate?.("products")}>{he ? "למוצרים" : "Open products"}</Button>} />;
  }

  return (
    <div className="space-y-4" dir={he ? "rtl" : "ltr"} data-testid="ugc-campaign-studio">
      <section className="ll-card rounded-3xl p-5 overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold" style={{ color: "var(--accent)" }}>
              <Sparkles size={14} /> LIKE LINK 2 · UGC CAMPAIGN OS
            </div>
            <h2 className="mt-2 text-2xl font-black" style={{ color: "var(--text)" }}>
              {he ? "קמפיין UGC עם דוגמנית AI — מוצר אמיתי, תוכן אמיתי, מדידה אמיתית" : "AI-model UGC campaign — real product, real content, real measurement"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm" style={{ color: "var(--text-secondary)" }}>
              {he ? "לונה בונה חבילת תוכן, יוצרת דמות סינתטית מקורית שאינה אדם אמיתי, שומרת את המדיה בענן ומעבירה את אותו מוצר ל-AutoPilot. שום פרסום חיצוני לא מסומן כהצלחה בלי חיבור ותוצאה אמיתיים." : "Luna builds the content pack, creates an original synthetic character who is not a real person, stores the media in the cloud and feeds the same product into AutoPilot. External publishing is never marked successful without a real connection and result."}
            </p>
          </div>
          <div className="rounded-2xl px-3 py-2 text-xs font-bold" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
            {he ? "AI · סינתטי · שקוף" : "AI · synthetic · disclosed"}
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
            {he ? "הדוגמנית / יוצרת" : "Model / creator"}
            <select value={characterType} onChange={(e) => setCharacterType(e.target.value)} className="input-field mt-1.5 w-full rounded-xl px-3 py-3" style={{ background: "var(--bg-subtle)", color: "var(--text)" }}>
              {MODEL_TYPES.map((type) => <option key={type} value={type}>{modelLabel(type, he)} · AI</option>)}
            </select>
          </label>
          <div className="rounded-xl p-3" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2 text-sm font-bold" style={{ color: "var(--text)" }}><Bot size={16} /> {modelLabel(characterType, he)}</div>
            <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{he ? model.persona.he : model.persona.en}</div>
            <div className="mt-2 text-[10px] font-bold" style={{ color: "var(--accent)" }}>{he ? "דמות סינתטית — לא אדם אמיתי" : "Synthetic character — not a real person"}</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={generate} disabled={busy}>
            <Wand2 size={16} /> {busy ? (he ? "לונה יוצרת…" : "Luna is creating…") : (he ? "צור תמונת UGC עם הדוגמנית" : "Create UGC image with model")}
          </Button>
          <Button variant="secondary" onClick={() => onNavigate?.("autopilot")}><Radio size={15} /> {he ? "חיבור AutoPilot" : "Open AutoPilot"}</Button>
        </div>
        {message && <div className="mt-3 rounded-xl p-3 text-xs" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>{message}</div>}
      </section>

      {imageUrl && campaign && (
        <>
          <section className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div className="ll-card rounded-3xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div><b style={{ color: "var(--text)" }}>{he ? "המדיה שנוצרה" : "Generated media"}</b><div className="text-xs" style={{ color: "var(--text-muted)" }}>{he ? "מקור: GPT Image · דמות סינתטית" : "Source: GPT Image · synthetic character"}</div></div>
                <CheckCircle2 size={18} style={{ color: "var(--success)" }} />
              </div>
              <img src={imageUrl} alt={he ? `דוגמנית AI מציגה ${selected.title}` : `AI model presenting ${selected.title}`} className="w-full max-h-[620px] rounded-2xl object-cover" />
              <div className="mt-2 text-[10px]" style={{ color: "var(--text-faint)" }}>{he ? "הדמות מקורית וסינתטית. אין כאן שימוש בזהות של אדם אמיתי." : "The character is original and synthetic; no real person's identity is used."}</div>
            </div>

            <div className="ll-card rounded-3xl p-5">
              <div className="flex items-center gap-2"><Megaphone size={17} style={{ color: "var(--accent)" }} /><b style={{ color: "var(--text)" }}>{he ? "חבילת הקמפיין" : "Campaign pack"}</b></div>
              <h3 className="mt-3 text-xl font-black" style={{ color: "var(--text)" }}>{campaign.chosenHook?.text?.split("\n")[0] || selected.title}</h3>
              <p className="mt-3 whitespace-pre-wrap text-sm" style={{ color: "var(--text-secondary)" }}>{campaign.story}</p>
              <div className="mt-4 rounded-2xl p-4" style={{ background: "var(--bg-subtle)" }}>
                <div className="flex items-center gap-2 text-xs font-bold" style={{ color: "var(--accent)" }}><Play size={13} /> {he ? "סקריפט 20 שניות" : "20-second script"}</div>
                <div className="mt-2 space-y-2">{campaign.script.map((s) => <div key={s.t} className="text-xs" style={{ color: "var(--text-secondary)" }}><b>{s.t}</b> · {s.visual} · {s.caption}</div>)}</div>
              </div>
              <div className="mt-4 rounded-2xl p-4" style={{ background: "var(--bg-subtle)" }}>
                <div className="text-xs font-bold" style={{ color: "var(--text)" }}>{he ? "קישור מדידה" : "Tracked destination"}</div>
                <div className="mt-1 break-all text-[11px]" style={{ color: "var(--text-muted)" }}>{campaign.trackedUrl}</div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => publish()} disabled={Boolean(publishBusy)}><ExternalLink size={15} /> {he ? "פרסום פנימי ב-LikeLink2" : "Publish to LikeLink2"}</Button>
                {CHANNELS.map(([id, label]) => <button key={id} onClick={() => publish(id)} disabled={Boolean(publishBusy)} className="rounded-xl px-3 py-2 text-xs font-bold" style={{ background: "var(--accent-subtle)", color: "var(--accent)", opacity: publishBusy && publishBusy !== id ? 0.5 : 1 }}>{publishBusy === id ? "…" : label}</button>)}
              </div>
              <div className="mt-3 text-[10px]" style={{ color: "var(--text-faint)" }}>{he ? "ערוץ חיצוני יצליח רק אם הוא מחובר ומאומת ב-AutoPilot. אחרת המערכת תחזיר CONNECT_REQUIRED ולא תמציא פרסום." : "An external channel succeeds only when connected and verified in AutoPilot. Otherwise the system returns CONNECT_REQUIRED and does not invent a publication."}</div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
