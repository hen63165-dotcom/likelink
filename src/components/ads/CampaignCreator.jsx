import React, { useState, useEffect } from "react";
import { ArrowLeft, Save, X, AlertCircle, CheckCircle, HelpCircle, Loader2 } from "lucide-react";
import { CAMPAIGN_OBJECTIVE, CAMPAIGN_STATUS, CAMPAIGN_TIER, PLACEMENT, OBJECTIVE_LABELS_HE, STATUS_LABELS_HE, TIER_LABELS_HE, PLACEMENT_LABELS_HE, isValidObjective, isValidStatus, isValidPlacement, isValidTier } from "../../lib/ads/types.js";
import { validateCampaign, getAvailablePlacements, getTierLimits } from "../../lib/ads/campaignManager.js";
import { EmptyState, Button, LabeledInput, LabeledSelect, LabeledTextarea, Toast } from "../ui/index.jsx";

const OBJECTIVE_OPTIONS = [
  { value: "sales", label: "מכירות" },
  { value: "affiliate_clicks", label: "קליקים לשותפים" },
  { value: "product_discovery", label: "גילוי מוצרים" },
  { value: "traffic", label: "תנועה" },
  { value: "leads", label: "לידים" },
];

const TIER_OPTIONS = [
  { value: "starter", label: "Starter" },
  { value: "professional", label: "Professional" },
  { value: "business", label: "Business" },
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

function PlacementCheckbox({ placement, checked, onChange, tier, availablePlacements }) {
  const isAvailable = availablePlacements.includes(placement.value);
  return (
    <label className={`flex items-center gap-2 p-2 rounded-xl cursor-pointer transition-all ${checked ? "ring-2" : ""}`} style={{ 
      background: checked ? "var(--accent-subtle)" : "var(--bg-subtle)",
      borderColor: checked ? "var(--accent)" : "var(--border)",
      opacity: isAvailable ? 1 : 0.5,
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={!isAvailable}
        className="w-4 h-4 rounded accent-[var(--accent)]"
      />
      <span className="text-sm font-medium" style={{ color: isAvailable ? "var(--text)" : "var(--text-faint)" }}>
        {placement.label}
      </span>
      {!isAvailable && (
        <HelpCircle size={12} style={{ color: "var(--text-faint)" }} title="לא זמין בדרגה זו" />
      )}
    </label>
  );
}

export default function CampaignCreator({ 
  product, 
  campaign, 
  marketerTier = "starter",
  onSave, 
  onClose,
  products = []
}) {
  const [formData, setFormData] = useState({
    name: "",
    productId: product?.id || "",
    objective: "sales",
    tier: marketerTier,
    budget: "",
    dailyBudget: "",
    startDate: "",
    endDate: "",
    targeting: {},
    placements: ["feed_sponsored", "search_sponsored"],
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  const availablePlacements = getAvailablePlacements(marketerTier);
  const tierLimits = getTierLimits(marketerTier);

  useEffect(() => {
    if (campaign) {
      setFormData({
        name: campaign.name,
        productId: campaign.productId,
        objective: campaign.objective,
        tier: campaign.tier,
        budget: campaign.budget || "",
        dailyBudget: campaign.dailyBudget || "",
        startDate: campaign.startDate ? new Date(campaign.startDate).toISOString().split("T")[0] : "",
        endDate: campaign.endDate ? new Date(campaign.endDate).toISOString().split("T")[0] : "",
        targeting: campaign.targeting || {},
        placements: campaign.placements || ["feed_sponsored", "search_sponsored"],
      });
    } else if (product) {
      setFormData((prev) => ({ ...prev, productId: product.id }));
    }
  }, [campaign, product, marketerTier]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }));
  };

  const handleTargetingChange = (key, value) => {
    setFormData((prev) => ({
      ...prev,
      targeting: { ...prev.targeting, [key]: value },
    }));
  };

  const handlePlacementToggle = (placementId, checked) => {
    setFormData((prev) => ({
      ...prev,
      placements: checked
        ? [...prev.placements, placementId]
        : prev.placements.filter((p) => p !== placementId),
    }));
  };

  const validateForm = () => {
    const validation = validateCampaign(formData);
    const newErrors = {};
    for (const err of validation.errors) {
      if (err.includes("שם")) newErrors.name = err;
      else if (err.includes("מוצר")) newErrors.productId = err;
      else if (err.includes("מטרה")) newErrors.objective = err;
      else if (err.includes("תקציב יומי")) newErrors.dailyBudget = err;
      else if (err.includes("תאריך")) newErrors.startDate = err;
    }
    setErrors(newErrors);
    return validation.valid;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const result = await onSave(formData);
      if (result?.ok) {
        setToast({ type: "success", msg: campaign ? "קמפיין עודכן" : "קמפיין נוצר בהצלחה" });
        setTimeout(() => onClose(), 1500);
      } else {
        setToast({ type: "error", msg: result?.error || "שגיאה בשמירה" });
      }
    } catch (e) {
      setToast({ type: "error", msg: `שגיאה: ${e.message}` });
    } finally {
      setSubmitting(false);
    }
  };

  const isEditing = !!campaign;

  return (
    <div className="ll-card rounded-2xl p-4 lg:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={onClose}>
            <ArrowLeft size={16} />
          </Button>
          <h2 className="text-xl font-bold" style={{ color: "var(--text)" }}>
            {isEditing ? "עריכת קמפיין" : "יצירת קמפיין חדש"}
          </h2>
        </div>
        <Button variant="secondary" onClick={onClose}>
          <X size={16} />
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>פרטים בסיסיים</h3>

          <LabeledInput
            label="שם הקמפיין"
            value={formData.name}
            onChange={(v) => handleChange("name", v)}
            placeholder="למשל: קיץ 2024 - שמלות פרחוניות"
            error={errors.name}
            required
          />

          <LabeledSelect
            label="מוצר"
            value={formData.productId}
            options={products.map(p => ({ value: p.id, label: `${p.title} (₪${p.price})` }))}
            onChange={(v) => handleChange("productId", v)}
            error={errors.productId}
            required
            placeholder="בחרי מוצר"
          />

          <LabeledSelect
            label="מטרת הקמפיין"
            value={formData.objective}
            options={OBJECTIVE_OPTIONS}
            onChange={(v) => handleChange("objective", v)}
            error={errors.objective}
            required
          />

          <LabeledSelect
            label="דרגה"
            value={formData.tier}
            options={TIER_OPTIONS}
            onChange={(v) => handleChange("tier", v)}
            disabled={isEditing}
          />
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>תקציב ותזמון</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledInput
              label="תקציב כולל (אופציונלי)"
              type="number"
              step="0.01"
              min="0"
              value={formData.budget}
              onChange={(v) => handleChange("budget", v)}
              placeholder="ללא הגבלה"
            />
            <LabeledInput
              label="תקציב יומי"
              type="number"
              step="0.01"
              min="0"
              max={tierLimits.maxDailyBudget}
              value={formData.dailyBudget}
              onChange={(v) => handleChange("dailyBudget", v)}
              placeholder={`מקסימום ₪${tierLimits.maxDailyBudget}`}
              error={errors.dailyBudget}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledInput
              label="תאריך התחלה"
              type="date"
              value={formData.startDate}
              onChange={(v) => handleChange("startDate", v)}
              error={errors.startDate}
            />
            <LabeledInput
              label="תאריך סיום (אופציונלי)"
              type="date"
              value={formData.endDate}
              onChange={(v) => handleChange("endDate", v)}
              error={errors.endDate}
            />
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>מיקומים (Placements)</h3>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            הדרגה שלך (<strong>{TIER_LABELS_HE[marketerTier]}</strong>) מאפשרת: {tierLimits.placements.map(p => PLACEMENT_LABELS_HE[p]).join(", ")}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {PLACEMENT_OPTIONS.map((placement) => (
              <PlacementCheckbox
                key={placement.value}
                placement={placement}
                checked={formData.placements.includes(placement.value)}
                onChange={(checked) => handlePlacementToggle(placement.value, checked)}
                tier={marketerTier}
                availablePlacements={availablePlacements}
              />
            ))}
          </div>
          {formData.placements.length === 0 && (
            <p className="text-xs" style={{ color: "var(--danger)" }}>יש לבחור לפחות מיקום אחד</p>
          )}
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>טירגוט (אופציונלי)</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledInput
              label="קטגוריה"
              value={formData.targeting.category || ""}
              onChange={(v) => handleTargetingChange("category", v)}
              placeholder="למשל: fashion, beauty, home"
            />
            <LabeledInput
              label="טווח מחירים - מינימום"
              type="number"
              step="0.01"
              min="0"
              value={formData.targeting.priceMin || ""}
              onChange={(v) => handleTargetingChange("priceMin", v)}
              placeholder="₪"
            />
            <LabeledInput
              label="טווח מחירים - מקסימום"
              type="number"
              step="0.01"
              min="0"
              value={formData.targeting.priceMax || ""}
              onChange={(v) => handleTargetingChange("priceMax", v)}
              placeholder="₪"
            />
            <LabeledInput
              label="קהל יעד"
              value={formData.targeting.audience || ""}
              onChange={(v) => handleTargetingChange("audience", v)}
              placeholder="למשל: women_18_35, parents, students"
            />
          </div>
        </div>

        <div className="pt-4 border-t" style={{ borderColor: "var(--border)" }}>
          <div className="flex flex-wrap gap-3 justify-end">
            <Button variant="secondary" type="button" onClick={onClose} disabled={submitting}>
              ביטול
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              {submitting ? "שומר…" : (isEditing ? "עדכן קמפיין" : "צור קמפיין")}
            </Button>
          </div>
        </div>
      </form>

      <Toast message={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}