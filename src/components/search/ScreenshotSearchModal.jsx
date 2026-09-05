import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Upload, Camera, Loader2, ShoppingBag, ExternalLink } from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { analyzeImage, filterProductsByKeywords, fileToBase64, validateImageFile } from "../../lib/visionHelper";
import { rankByTrust } from "../../lib/recommendations";
import { money } from "../../utils/helpers";

export function ScreenshotSearchModal({ isOpen, onClose }) {
  const { t } = useI18n();
  const { products, sales } = useMarketplace();

  const [isDragging, setIsDragging] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(null);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await processImage(files[0]);
    }
  }, []);

  const handleFileSelect = useCallback(async (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      await processImage(files[0]);
    }
    e.target.value = "";
  }, []);

  const processImage = async (file) => {
    setError(null);
    const validation = validateImageFile(file);
    if (!validation.valid) {
      setError(t("search.invalidImage", "הקובץ אינו תקין. אנא העלה תמונה."));
      return;
    }
    try {
      setSelectedImage(file);
      const preview = await fileToBase64(file);
      setImagePreview(preview);
      setIsAnalyzing(true);
      setResults([]);
      setAnalysis(null);
      const analysisResult = await analyzeImage(file);
      setAnalysis(analysisResult);
      const matched = filterProductsByKeywords(
        products,
        analysisResult.keywords,
        analysisResult.category,
        8
      );
      // "רק הטובים עולים": מדרגים לפי מה שכבר נקנה/נלחץ בקהילה
      const ranked = rankByTrust(matched, sales, 6);
      setResults(ranked);
      setIsAnalyzing(false);
    } catch (err) {
      setError(t("search.analysisFailed", "שגיאה בניתוח התמונה"));
      setIsAnalyzing(false);
    }
  };

  const handleClose = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setResults([]);
    setAnalysis(null);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-x-4 top-[10%] max-w-2xl mx-auto bg-surface rounded-2xl shadow-2xl z-50 max-h-[80vh] overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2">
                <Camera size={20} style={{ color: "var(--accent)" }} />
                <h2 className="disp text-lg font-semibold">
                  {t("search.screenshotSearch", "חיפוש בתמונה")}
                </h2>
              </div>
              <button onClick={handleClose} className="tap p-2 rounded-xl" style={{ background: "var(--bg)" }}>
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {!selectedImage ? (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className="border-2 border-dashed rounded-2xl p-8 text-center transition-all"
                  style={{
                    borderColor: isDragging ? "var(--accent)" : "var(--border)",
                    background: isDragging ? "var(--accent-subtle)" : "transparent"
                  }}
                >
                  <Upload size={48} className="mx-auto mb-4" style={{ color: "var(--text-muted)" }} />
                  <p className="text-sm font-semibold mb-2">
                    {t("search.uploadHint", "גררו תמונה לכאן או לחצו להעלאה")}
                  </p>
                  <p className="text-xs text-muted mb-4">
                    {t("search.uploadFormats", "תומך ב-JPG, PNG, WebP")}
                  </p>
                  <label className="tap inline-flex items-center gap-2 px-4 py-2.5 rounded-xl btn-primary cursor-pointer">
                    <Camera size={16} />
                    <span className="text-sm font-semibold">
                      {t("search.selectImage", "בחירת תמונה")}
                    </span>
                    <input type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
                  </label>
                </div>
              ) : (
                <div className="space-y-4">
                  {imagePreview && (
                    <div className="relative rounded-xl overflow-hidden bg-gray-100">
                      <img src={imagePreview} alt="Uploaded screenshot" className="w-full h-48 object-contain" />
                      <button
                        onClick={() => { setSelectedImage(null); setImagePreview(null); setResults([]); setAnalysis(null); }}
                        className="absolute top-2 right-2 tap p-1.5 rounded-lg bg-black/50 text-white"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  )}

                  {isAnalyzing && (
                    <div className="flex items-center justify-center gap-3 py-8">
                      <Loader2 size={24} className="animate-spin" style={{ color: "var(--accent)" }} />
                      <p className="text-sm text-muted">{t("search.analyzing", "מנתח תמונה...")}</p>
                    </div>
                  )}

                  {error && (
                    <div className="p-4 rounded-xl bg-red-50 border border-red-200">
                      <p className="text-sm text-red-800">{error}</p>
                    </div>
                  )}

                  {analysis && !isAnalyzing && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-semibold">
                          {t("search.foundFor", "נמצא עבור")}:
                        </span>
                        <span style={{ color: "var(--accent)" }}>{analysis.keywords.join(", ")}</span>
                      </div>

                      {results.length > 0 ? (
                        <div className="grid grid-cols-2 gap-3">
                          {results.map((product) => (
                            <motion.div
                              key={product.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="surface rounded-xl p-3"
                            >
                              {product.image && (
                                <img src={product.image} alt={product.title} className="w-full h-32 object-cover rounded-lg mb-2" />
                              )}
                              <p className="text-xs font-semibold line-clamp-2 mb-1">{product.title}</p>
                              {(product._salesCount > 0 || product._clicks > 5) && (
                                <span
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 mb-1"
                                  style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
                                >
                                  ⭐ {product._salesCount > 0 ? `מומלצים — ${product._salesCount} קניות` : "מומלץ — פופולרי"}
                                </span>
                              )}
                              <p className="mono text-xs font-bold mb-2" style={{ color: "var(--accent)" }}>
                                {money(product.price, "he")}
                              </p>
                              <button
                                onClick={onClose}
                                className="tap w-full text-xs py-1.5 rounded-lg flex items-center justify-center gap-1"
                                style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
                              >
                                <ExternalLink size={12} />
                                {t("search.viewProduct", "צפה במוצר")}
                              </button>
                            </motion.div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <ShoppingBag size={48} className="mx-auto mb-3" style={{ color: "var(--text-faint)" }} />
                          <p className="text-sm text-muted">
                            {t("search.noMatch", "לא מצאנו את הפריט המדויק, אבל הנה פריטים דומים מהיוצרות שלנו")}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
