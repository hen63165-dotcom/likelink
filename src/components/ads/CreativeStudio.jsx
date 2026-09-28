import React, { useState, useMemo } from "react";
import { Image, Video, Layout, Palette, Sparkles, Download, Trash2, Copy, Eye, Plus, Minus } from "lucide-react";
import { CREATIVE_FORMAT, CREATIVE_TYPE, PLACEMENT, FORMAT_LABELS_HE, TYPE_LABELS_HE, PLACEMENT_LABELS_HE, getAvailableCreativeTypesForPlacement } from "../../lib/ads/types.js";
import { generateCreative, buildCreativePack, getAvailableCreativeTypesForPlacement as getTypesForPlacement, getRecommendedCreativeTypeForPlacement } from "../../lib/ads/creativeStudio.js";
import { EmptyState, Button, LabeledInput, LabeledSelect, Toast } from "../ui/index.jsx";

const TYPE_OPTIONS = [
  { value: "ugc", label: "UGC" },
  { value: "cinematic_3d", label: "3D קולנועי" },
  { value: "cinematic_motion", label: "תנועה קולנועית" },
  { value: "product_demo", label: "הדגמת מוצר" },
  { value: "lifestyle", label: "לייפסטייל" },
  { value: "ugc_style", label: "סגנון UGC" },
];

const PLACEMENT_OPTIONS = [
  { value: "feed_sponsored", label: "פיד ממומן" },
  { value: "search_sponsored", label: "חיפוש ממומן" },
  { value: "discovery_sponsored", label: "גילוי ממומן" },
  { value: "studio_sponsored", label: "סטודיו ממומן" },
  { value: "story_sponsored", label: "סטורי ממומן" },
  { value: "creator_sponsored", label: "יוצר ממומן" },
  { value: "contextual_recommendation", label: "המלצה קונטקסטואלית" },
];

function CreativeCard({ creative, index, onDelete, onCopyUrl, onPreview, isGenerating }) {
  if (!creative) return null;

  const formatLabels = FORMAT_LABELS_HE;
  const typeLabels = TYPE_LABELS_HE;
  const placementLabels = PLACEMENT_LABELS_HE;

  return (
    <div className="ll-card rounded-xl p-4 relative group" style={{ border: "1px solid var(--border)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-20 h-20 shrink-0 rounded-xl overflow-hidden relative" style={{ background: "var(--bg-subtle)" }}>
            {creative.assets?.primaryImage ? (
              <img src={creative.assets.primaryImage} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ color: "var(--text-faint)" }}>
                {creative.format === "video" || creative.format === "reel" || creative.format === "story" ? <Video size={24} /> : <Image size={24} />}
              </div>
            )}
            <div className="absolute bottom-1 right-1 rounded px-1 text-[9px] font-bold" style={{ background: "rgba(0,0,0,0.7)", color: "white" }}>
              {formatLabels[creative.format] || creative.format}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold truncate" style={{ color: "var(--text)" }}>{creative.copy?.headline || "ללא כותרת"}</span>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
                {typeLabels[creative.type] || creative.type}
              </span>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>
                {placementLabels[creative.placement] || creative.placement}
              </span>
              {creative.renderStatus === "pending" && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--warning-subtle)", color: "var(--warning)" }}>
                  ממתין לרינדור
                </span>
              )}
              {creative.renderStatus === "ready" && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--success-subtle)", color: "var(--success)" }}>
                  מוכן
                </span>
              )}
            </div>
            <p className="mt-1 text-sm line-clamp-2" style={{ color: "var(--text-secondary)" }}>{creative.copy?.body}</p>
            <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
              <span dir="ltr">ID: {creative.id}</span>
              <span dir="ltr">מוצר: {creative.productId}</span>
              {creative.metadata?.language && <span>{creative.metadata.language.toUpperCase()}</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button size="sm" variant="secondary" onClick={() => onPreview(creative)} disabled={isGenerating}>
            <Eye size={13} /> תצוגה
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onCopyUrl(creative.trackedUrl)} disabled={isGenerating}>
            <Copy size={13} /> העתק לינק
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onDelete(index)} disabled={isGenerating}>
            <Trash2 size={13} />
          </Button>
        </div>
      </div>

      <div className="mt-3 p-3 rounded-xl" style={{ background: "var(--bg-subtle)" }}>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>הוק</p>
            <p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>{creative.copy?.hook}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>CTA</p>
            <p className="text-sm font-medium truncate" style={{ color: "var(--accent)" }}>{creative.copy?.cta}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>גילוי נאות</p>
            <p className="text-sm truncate" style={{ color: "var(--text-secondary)" }}>{creative.copy?.disclosure}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>לינק מעקב</p>
            <p className="text-sm truncate" style={{ color: "var(--text-muted)" }} dir="ltr">{creative.trackedUrl?.slice(0, 50)}…</p>
          </div>
        </div>

        {creative.assets?.images?.length > 1 && (
          <div className="mt-3">
            <p className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: "var(--text-faint)" }}>תמונות נוספות</p>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {creative.assets.images.slice(1).map((img, i) => (
                <img key={i} src={img} alt="" className="w-16 h-16 shrink-0 rounded-lg object-cover" />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CreativeStudio({ product, campaign, onGenerate, onGeneratePack, onClose }) {
  const [selectedType, setSelectedType] = useState("ugc");
  const [selectedPlacement, setSelectedPlacement] = useState("feed_sponsored");
  const [generatedCreatives, setGeneratedCreatives] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [generatingPack, setGeneratingPack] = useState(false);
  const [toast, setToast] = useState(null);

  const availableTypes = useMemo(() => getTypesForPlacement(selectedPlacement), [selectedPlacement]);
  const recommendedType = useMemo(() => getRecommendedCreativeTypeForPlacement(selectedPlacement), [selectedPlacement]);

  const handleGenerateSingle = async () => {
    if (!product) return;
    setGenerating(true);
    try {
      const creative = generateCreative(product, selectedType, selectedPlacement, {
        marketerId: campaign?.marketerId,
        lang: "he",
      });
      if (creative) {
        setGeneratedCreatives((prev) => [creative, ...prev]);
        setToast({ type: "success", msg: "קריאייטיב נוצר בהצלחה" });
      }
    } catch (e) {
      setToast({ type: "error", msg: `שגיאה: ${e.message}` });
    } finally {
      setGenerating(false);
    }
  };

  const handleGeneratePack = async () => {
    if (!product) return;
    setGeneratingPack(true);
    try {
      const types = availableTypes.filter(t => t !== selectedType);
      const pack = buildCreativePack(product, selectedPlacement, [selectedType, ...types], {
        marketerId: campaign?.marketerId,
        lang: "he",
      });
      if (pack?.creatives?.length) {
        setGeneratedCreatives((prev) => [...pack.creatives, ...prev]);
        setToast({ type: "success", msg: `חבילת ${pack.creatives.length} קריאייטיבים נוצרה` });
      }
    } catch (e) {
      setToast({ type: "error", msg: `שגיאה: ${e.message}` });
    } finally {
      setGeneratingPack(false);
    }
  };

  const handleDelete = (index) => {
    setGeneratedCreatives((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCopyUrl = (url) => {
    navigator.clipboard.writeText(url);
    setToast({ type: "success", msg: "לינק הועתק" });
  };

  const handlePreview = (creative) => {
    window.open(creative.trackedUrl, "_blank");
  };

  if (!product) {
    return (
      <EmptyState
        icon={Sparkles}
        title="בחרי מוצר"
        body="בחרי מוצר מהקטלוג כדי ליצור עבורו קריאייטיבים."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>סטודיו קריאייטיב</h3>
        <Button variant="secondary" onClick={onClose}>
          סגור
        </Button>
      </div>

      <div className="ll-card rounded-xl p-4">
        <h4 className="text-sm font-bold mb-3" style={{ color: "var(--text)" }}>מוצר: {product.title}</h4>
        <div className="grid gap-3 sm:grid-cols-3">
          <LabeledSelect
            label="סוג קריאייטיב"
            value={selectedType}
            options={TYPE_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
            onChange={setSelectedType}
          />
          <LabeledSelect
            label="מיקום"
            value={selectedPlacement}
            options={PLACEMENT_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
            onChange={setSelectedPlacement}
          />
          <div className="sm:col-span-3">
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              מומלץ למיקום זה: <strong>{TYPE_LABELS_HE[recommendedType] || recommendedType}</strong>
              {availableTypes.length > 1 && ` · נתמך גם: ${availableTypes.filter(t => t !== recommendedType).map(t => TYPE_LABELS_HE[t] || t).join(", ")}`}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={handleGenerateSingle} disabled={generating || !product}>
            {generating ? <Loader2 className="animate-spin" size={13} /> : <Sparkles size={13} />}
            {generating ? "יוצר…" : "צור קריאייטיב יחיד"}
          </Button>
          <Button variant="secondary" onClick={handleGeneratePack} disabled={generatingPack || !product}>
            {generatingPack ? <Loader2 className="animate-spin" size={13} /> : <Layout size={13} />}
            {generatingPack ? "יוצר חבילה…" : `צור חבילת ${availableTypes.length} סוגים`}
          </Button>
        </div>
      </div>

      {generatedCreatives.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-bold" style={{ color: "var(--text)" }}>קריאייטיבים שנוצרו ({generatedCreatives.length})</h4>
          <div className="space-y-3">
            {generatedCreatives.map((creative, index) => (
              <CreativeCard
                key={creative.id || index}
                creative={creative}
                index={index}
                onDelete={handleDelete}
                onCopyUrl={handleCopyUrl}
                onPreview={handlePreview}
                isGenerating={generating || generatingPack}
              />
            ))}
          </div>
        </div>
      )}

      <Toast message={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}