import React, { useState } from "react";
import { Copy, Video, Image, Type, Hash, Play } from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { createCreativeVariant, mutateCreative, CREATIVE_TYPES, CREATIVE_STATUS } from "../../lib/cloud/creativeMutation.js";

export default function CreativeMutation({ product, trend, lang = "he" }) {
  const { t } = useI18n();
  const [creative, setCreative] = useState(null);
  const [copied, setCopied] = useState({});
  const [type, setType] = useState(CREATIVE_TYPES.POST);

  const generate = () => {
    if (!product) return;
    const cv = createCreativeVariant({ product, trend, language: lang === "he" ? "he" : "en", creativeType: type });
    setCreative(cv);
  };

  const mutate = (mutationType) => {
    if (!creative) return;
    setCreative(mutateCreative(creative, mutationType));
  };

  const copy = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied((prev) => ({ ...prev, [key]: true }));
      setTimeout(() => setCopied((prev) => ({ ...prev, [key]: false })), 1500);
    });
  };

  const L = (he, en) => (lang === "he" ? he : en);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Zap size={18} style={{ color: "var(--accent)" }} />
        <span className="text-sm font-semibold">{L("מנוע היצירה המוטנטית", "Creative Mutation Engine")}</span>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-[10px] text-muted">{L("סוג יצירה", "Creative type")}</label>
        <div className="flex flex-wrap gap-2">
          {Object.values(CREATIVE_TYPES).map((ct) => (
            <button
              key={ct}
              onClick={() => setType(ct)}
              className="tap shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold"
              style={{
                background: type === ct ? "var(--accent)" : "var(--bg-subtle)",
                color: type === ct ? "#fff" : "var(--text-muted)",
              }}
            >
              {ct}
            </button>
          ))}
        </div>
      </div>

      <button onClick={generate} disabled={!product} className="tap w-full py-3 rounded-xl text-sm font-bold" style={{ background: product ? "var(--accent)" : "var(--bg-subtle)", color: product ? "#fff" : "var(--text-muted)" }}>
        {L("צור וריאציה", "Generate variant")}
      </button>

      {creative && (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl p-4 surface" style={{ border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted">CREATIVE</p>
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "#00C89620", color: "#00C896" }}>{creative.status}</span>
            </div>
            <p className="text-sm font-semibold mb-2">{creative.title}</p>
            <p className="text-xs italic mb-3" style={{ color: "var(--accent)" }}>"{creative.hooks?.[0]?.text || creative.script?.hook || ""}"</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {(creative.hashtags || []).slice(0, 8).map((tag, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--bg-subtle)", color: "var(--text-muted)" }}>{tag}</span>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div><span className="text-muted">cta:</span> <span className="font-semibold">{creative.script?.cta}</span></div>
              <div><span className="text-muted">aspect:</span> <span className="font-semibold">{creative.aspectRatio}</span></div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={() => mutate("hook")} className="tap px-3 py-2 rounded-xl text-xs font-semibold surface" style={{ border: "1px solid var(--border)" }}>
              <Type size={12} className="inline-block me-1" />{L("החלף hook", "Mutate hook")}
            </button>
            <button onClick={() => mutate("cta")} className="tap px-3 py-2 rounded-xl text-xs font-semibold surface" style={{ border: "1px solid var(--border)" }}>
              <Copy size={12} className="inline-block me-1" />{L("החלף CTA", "Mutate CTA")}
            </button>
            <button onClick={() => mutate("aspect_ratio")} className="tap px-3 py-2 rounded-xl text-xs font-semibold surface" style={{ border: "1px solid var(--border)" }}>
              <Image size={12} className="inline-block me-1" />{L("החלף יחס", "Mutate aspect")}
            </button>
            <button onClick={() => copy(JSON.stringify(creative, null, 2), "json")} className="tap px-3 py-2 rounded-xl text-xs font-semibold surface" style={{ border: "1px solid var(--border)" }}>
              <Copy size={12} className="inline-block me-1" />{L("ייצוא JSON", "Export JSON")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
