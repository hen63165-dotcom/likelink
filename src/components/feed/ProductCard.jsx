/**
 * ProductCard 🛍️ — LTK-style product card with influencer features.
 * Beautiful, clean, creates desire at first sight.
 */
import { Heart, Share2, ExternalLink, Flame, BadgeCheck } from "lucide-react";
import { useState } from "react";
import { generateLunaCaption, generateStockAlert } from "../../lib/cloud/influencerVoice";
import Testimonials from "./Testimonials";

export default function ProductCard({ product, onClick }) {
  const [liked, setLiked] = useState(false);
  const [showCaption, setShowCaption] = useState(false);

  const stockAlert = generateStockAlert(product);
  const caption = generateLunaCaption(product, { emotion: "hype" });

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
      {/* Product image */}
      <div className="relative aspect-[3/4] overflow-hidden cursor-pointer" onClick={() => onClick?.(product)}>
        {product.image ? (
          <img src={product.image} alt={product.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: "var(--bg-subtle)" }}>
            <span className="text-4xl">🛍️</span>
          </div>
        )}

        {/* Stock alert badge */}
        {stockAlert.urgency === "critical" && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-[#FF4D6E] flex items-center gap-1">
            <Flame size={10} color="#fff" />
            <span className="text-[9px] font-bold text-white">{stockAlert.alert}</span>
          </div>
        )}

        {/* Like button */}
        <button
          onClick={(e) => { e.stopPropagation(); setLiked(!liked); }}
          className="absolute top-2 left-2 w-7 h-7 rounded-full flex items-center justify-center bg-white/80"
        >
          <Heart size={14} fill={liked ? "#FF4D6E" : "none"} color={liked ? "#FF4D6E" : "#333"} />
        </button>

        {/* Price tag */}
        <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded-full bg-white/90">
          <span className="text-[14px] font-extrabold" style={{ color: "var(--text)" }}>₪{product.price}</span>
        </div>
      </div>

      {/* Product info */}
      <div className="p-3" dir="rtl">
        {/* Title */}
        <p className="text-[12px] font-bold leading-snug line-clamp-2" style={{ color: "var(--text)" }}>
          {product.title}
        </p>

        {/* Luna's caption preview */}
        <button
          onClick={() => setShowCaption(!showCaption)}
          className="text-[10px] font-semibold mt-1 flex items-center gap-1"
          style={{ color: "var(--accent)" }}
        >
          <BadgeCheck size={10} />
          לונה אומרת...
        </button>

        {showCaption && (
          <p className="text-[10px] mt-1 leading-snug line-clamp-3" style={{ color: "var(--muted)" }}>
            {caption.split("\n")[0]}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => onClick?.(product)}
            className="flex-1 rounded-xl py-1.5 text-[10px] font-bold text-white flex items-center justify-center gap-1"
            style={{ background: "var(--accent)" }}
          >
            קני עכשיו <ExternalLink size={10} />
          </button>
          <button className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: "var(--bg-subtle)" }}>
            <Share2 size={12} style={{ color: "var(--text)" }} />
          </button>
        </div>

        {/* Testimonials */}
        <Testimonials product={product} />
      </div>
    </div>
  );
}