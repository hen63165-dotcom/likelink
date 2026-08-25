import React, { useMemo, useState } from "react";
import {
  Check, Copy, Share2, MessageCircle, Send, Globe, Mail,
  Link2, ShoppingBag, Sparkles, X, Camera, Music2,
} from "lucide-react";
import { runStoryShare } from "../../lib/storyKit";
import { buildWeeklyPlan, todayHebrewIndex } from "../../lib/autoPilot";
import { useI18n } from "../../lib/LangContext";
import { money } from "../../utils/helpers";
import { SheetModal, Button, LabeledInput } from "../ui";
import { ProductThumb } from "../product/ProductComponents";

/**
 * CampaignBuilder — "Share a whole campaign in one tap".
 * Picks the seller's products and instantly builds a ready-to-post Hebrew
 * (or English) message + share links for WhatsApp / Facebook / Telegram /
 * X / Email / clipboard — the fastest way to publish a campaign everywhere.
 */
export default function CampaignBuilder({ marketer, products, link, lang, onClose, showToast }) {
  const { t } = useI18n();

  const [title, setTitle] = useState(t("sell.campaignDefaultTitle"));
  const [promo, setPromo] = useState("");
  const [selected, setSelected] = useState(() =>
    (products || []).map((p) => p.id)
  );

  const toggle = (id) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const all = (products || []).map((p) => p.id);
  const allOn = selected.length === all.length && all.length > 0;
  const toggleAll = () => setSelected(allOn ? [] : all);

  const chosen = useMemo(
    () => (products || []).filter((p) => selected.includes(p.id)),
    [products, selected]
  );

  const message = useMemo(() => {
    const lines = [String(title || t("sell.campaignDefaultTitle")), ""];
    if (promo && String(promo).trim()) {
      lines.push(`🎟️ ${t("sell.campaignPromoLine")}: ${String(promo).trim()}`);
      lines.push("");
    }
    lines.push(t("sell.campaignIntro"));
    chosen.forEach((p, i) => {
      const price = Number(p.price) > 0 ? ` — ${money(Number(p.price), lang)}` : "";
      lines.push(`${i + 1}. ${String(p.title ?? "")}${price}`);
    });
    lines.push("");
    lines.push(t("sell.campaignOutro"));
    lines.push(link);
    return lines.join("\n");
  }, [title, promo, chosen, t, lang, link]);

  async function copyAll() {
    const text = `${message}\n\n${link}`;
    try {
      await navigator.clipboard.writeText(text);
      showToast(t("sell.campaignCopied"));
    } catch {
      showToast(text);
    }
  }

  async function nativeShare() {
    if (!navigator.share) return copyAll();
    try {
      await navigator.share({ title: String(title), text: message, url: link });
    } catch { /* cancelled */ }
  }

  function openTarget(url) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function handleStory(network) {
    const star = chosen[0];
    if (!star) return showToast(t("sell.campaignNoProducts"));
    const res = await runStoryShare({
      network,
      product: star,
      storeName: marketer?.name || "",
      caption: message,
      link,
    });
    showToast(
      res.ok
        ? "💜 התמונה הורדה והטקסט הועתק — פרסמי בסטורי!"
        : "אופס, משהו נתקע — נסי שוב"
    );
  }

  const [plan] = useState(() =>
    buildWeeklyPlan({ storeName: marketer?.name || "", products: products || [], link })
  );
  const [executedIds, setExecutedIds] = useState(() => new Set());

  async function runPlanItem(item) {
    if (!item || executedIds.has(item.id)) return;
    setExecutedIds((s) => new Set([...s, item.id]));
    if (item.mode === "instagram" || item.mode === "tiktok") {
      await handleStory(item.mode);
      return;
    }
    if (item.url) openTarget(item.url);
  }

  const targets = [
    { id: "wa", label: "WhatsApp", bg: "#25D366", icon: MessageCircle, url: () => `https://wa.me/?text=${encodeURIComponent(`${message}\n${link}`)}` },
    { id: "fb", label: "Facebook", bg: "#1877F2", icon: Globe, url: () => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}&quote=${encodeURIComponent(message)}` },
    { id: "tg", label: "Telegram", bg: "#229ED9", icon: Send, url: () => `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(message)}` },
    { id: "x", label: "X", bg: "#111111", icon: Share2, url: () => `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}&url=${encodeURIComponent(link)}` },
    { id: "mail", label: t("sell.campaignShareEmail"), bg: "#8A8071", icon: Mail, url: () => `mailto:?subject=${encodeURIComponent(String(title))}&body=${encodeURIComponent(`${message}\n${link}`)}` },
  ];

  return (
    <SheetModal onClose={onClose} title={t("sell.campaignTitle")} maxHeight="92vh">
      <div className="flex flex-col gap-4 p-5 pt-2 overflow-y-auto">

        {/* Hero preview card */}
        <div className="rounded-2xl p-4 brand-gradient text-white">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.18)" }}>
              <Sparkles size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate">{marketer.name}</p>
              <p className="text-[11px] opacity-80 truncate">{link.replace(/^https?:\/\//, "")}</p>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold" style={{ background: "rgba(255,255,255,0.18)" }}>
              {chosen.length} {t("sell.campaignProducts")}
            </span>
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed opacity-90">{t("sell.campaignTagline")}</p>
        </div>

        {/* Campaign settings */}
        <LabeledInput label={t("sell.campaignTitleLabel")} value={title} onChange={setTitle} placeholder={t("sell.campaignDefaultTitle")} />
        <LabeledInput label={t("sell.campaignPromoLabel")} value={promo} onChange={setPromo} placeholder={t("sell.campaignPromoPh")} />

        {/* Product picker */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold flex items-center gap-1.5">
              <ShoppingBag size={14} style={{ color: "var(--accent)" }} /> {t("sell.campaignPickProducts")}
            </p>
            <button
              onClick={toggleAll}
              className="tap text-[11px] font-semibold px-3 py-1.5 rounded-full flex items-center gap-1"
              style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
            >
              {all ? null : <Check size={12} />} {allOn ? t("sell.campaignClearAll") : t("sell.campaignSelectAll")}
            </button>
          </div>
          {(products || []).length === 0 ? (
            <p className="text-sm text-muted py-4 text-center">{t("sell.campaignNoProducts")}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {products.map((p) => {
                const on = selected.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    className="tap w-full flex items-center gap-3 rounded-xl p-2 transition-colors"
                    style={{
                      background: on ? "var(--accent-subtle)" : "var(--bg-subtle)",
                      border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                    }}
                  >
                    <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0"><ProductThumb p={p} /></div>
                    <p className="text-[13px] font-medium flex-1 min-w-0 text-left truncate">{p.title}</p>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: on ? "var(--accent)" : "var(--border)" }}>
                      {on && <Check size={12} color="#fff" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Live message preview */}
        <div>
          <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <Link2 size={14} style={{ color: "var(--accent)" }} /> {t("sell.campaignPreview")}
          </p>
          <div className="rounded-2xl p-3.5 text-[12.5px] leading-relaxed whitespace-pre-wrap" style={{ background: "var(--bg)", border: "1px dashed var(--border)" }}>
            {message}
          </div>
          <button
            onClick={copyAll}
            className="tap w-full mt-2 py-2.5 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2"
            style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
          >
            <Copy size={14} /> {t("sell.campaignCopy")}
          </button>
        </div>

        {/* Share targets */}
        <div>
          <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <Share2 size={14} style={{ color: "var(--accent)" }} /> {t("sell.campaignShareTitle")}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {targets.map(({ id, label, bg, icon: Icon, url }) => (
              <button
                key={id}
                onClick={() => openTarget(url())}
                className="tap flex flex-col items-center gap-1.5 py-3 rounded-xl text-white"
                style={{ background: bg }}
              >
                <Icon size={16} />
                <span className="text-[10.5px] font-semibold">{label}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button
              onClick={() => handleStory("instagram")}
              className="tap flex flex-col items-center gap-1.5 py-3 rounded-xl text-white"
              style={{ background: "linear-gradient(45deg,#F58529,#DD2A7B,#8134AF)" }}
            >
              <Camera size={16} />
              <span className="text-[10.5px] font-semibold">Instagram Story ✨</span>
            </button>
            <button
              onClick={() => handleStory("tiktok")}
              className="tap flex flex-col items-center gap-1.5 py-3 rounded-xl text-white"
              style={{ background: "#010101" }}
            >
              <Music2 size={16} />
              <span className="text-[10.5px] font-semibold">TikTok Story ✨</span>
            </button>
          </div>
          <Button onClick={nativeShare} variant="dark" className="mt-2">
            <Share2 size={15} /> {t("sell.campaignNativeShare")}
          </Button>
        </div>

        <div className="rounded-2xl p-4" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
          <p className="text-xs font-semibold mb-1 flex items-center gap-1.5">
            <Sparkles size={14} style={{ color: "var(--accent)" }} /> אוטו-פיילוט · שבוע שלם של קמפיינים מוכן ✨
          </p>
          <p className="text-[11px] mb-3" style={{ color: "var(--text-muted)" }}>
            האתר בנה לך תוכנית פרסום לשבוע — ערוץ אחר, זווית אחרת, בשעות השיא של הקהל.
            לוחצת <b>הרצה</b> בכל יום וזהו 💜
          </p>
          <div className="flex flex-col gap-1.5">
            {plan.map((item) => {
              const done = executedIds.has(item.id);
              const isToday = item.id === `day-${todayHebrewIndex()}`;
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded-xl p-2"
                  style={{
                    background: done ? "var(--success-subtle)" : "var(--bg)",
                    border: `1px solid ${isToday && !done ? "var(--accent)" : "var(--border)"}`,
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold truncate">
                      {done ? "✅" : isToday ? "📍" : "•"} {item.dayLabel} · {item.channelLabel}
                    </p>
                    <p className="text-[10.5px] truncate" style={{ color: "var(--text-muted)" }}>
                      {item.timeLabel} · {item.caption}
                    </p>
                  </div>
                  {!done && (
                    <button
                      onClick={() => runPlanItem(item)}
                      className="tap shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-bold"
                      style={{ background: "var(--accent)", color: "#fff" }}
                    >
                      הרצה ▶
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <button onClick={onClose} className="tap w-full py-3 rounded-xl text-sm font-medium text-muted flex items-center justify-center gap-2" style={{ background: "var(--bg-subtle)" }}>
          <X size={15} /> {t("sell.done")}
        </button>
      </div>
    </SheetModal>
  );
}