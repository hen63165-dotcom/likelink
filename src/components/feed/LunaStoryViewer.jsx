/**
 * LunaStoryViewer 🎬 — Pixar-style animated story viewer.
 * Full-screen immersive story experience with Luna as the character.
 */
import { useState, useEffect, useCallback } from "react";
import { X, ChevronRight, Share2, Heart } from "lucide-react";
import { generateProductStory } from "../../lib/cloud/storyEngine";
import { useI18n } from "../../lib/LangContext";

export default function LunaStoryViewer({ product, onClose, onProductClick }) {
  const { lang } = useI18n();
  const L = (he, en) => (lang === "he" ? he : en);

  const [story, setStory] = useState(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [progress, setProgress] = useState(0);
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    if (product) {
      setStory(generateProductStory(product));
      setCurrentFrame(0);
      setProgress(0);
    }
  }, [product]);

  useEffect(() => {
    if (!story) return;
    const frame = story.frames[currentFrame];
    if (!frame) return;
    const duration = frame.duration || 3000;
    const interval = 50;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += interval;
      setProgress((elapsed / duration) * 100);
      if (elapsed >= duration) {
        clearInterval(timer);
        if (currentFrame < story.frames.length - 1) {
          setCurrentFrame((f) => f + 1);
          setProgress(0);
        }
      }
    }, interval);
    return () => clearInterval(timer);
  }, [story, currentFrame]);

  const handleTap = useCallback(() => {
    if (!story) return;
    if (currentFrame < story.frames.length - 1) {
      setCurrentFrame((f) => f + 1);
      setProgress(0);
    } else {
      onProductClick?.(product);
    }
  }, [story, currentFrame, product, onProductClick]);

  const handleShare = useCallback(() => {
    if (!story || !product) return;
    if (navigator.share) {
      navigator.share({ title: product.title, text: story.shareable.text });
    } else {
      navigator.clipboard.writeText(story.shareable.text);
    }
  }, [story, product]);

  if (!story || !product) return null;
  const frame = story.frames[currentFrame];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: "#000" }}>
      <div
        className="relative w-full h-full max-w-[420px] mx-auto overflow-hidden"
        style={{ background: frame.backgroundColor }}
        onClick={handleTap}
      >
        {frame.product.image && (
          <div className="absolute inset-0">
            <img src={frame.product.image} alt={frame.product.title} className="w-full h-full object-cover" style={{ opacity: 0.4 }} />
            <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, ${frame.backgroundColor}99 0%, transparent 40%, ${frame.backgroundColor} 100%)` }} />
          </div>
        )}

        <div className="absolute top-0 left-0 right-0 z-20 flex gap-1 p-3">
          {story.frames.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.3)" }}>
              <div className="h-full rounded-full" style={{ background: "#fff", width: i < currentFrame ? "100%" : i === currentFrame ? `${progress}%` : "0%" }} />
            </div>
          ))}
        </div>

        <div className="absolute top-6 left-0 right-0 z-20 flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm" style={{ background: "linear-gradient(135deg, #C9A86C, #9C7437)" }}>🧚</div>
            <div>
              <p className="text-[11px] font-bold text-white">לונה · הסטודיו</p>
              <p className="text-[9px] text-white/70">עכשיו</p>
            </div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); onClose?.(); }} className="w-7 h-7 rounded-full flex items-center justify-center bg-white/20">
            <X size={14} color="#fff" />
          </button>
        </div>

        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6">
          <div className="text-5xl mb-6">{frame.lunaEmoji}</div>
          <p className="text-center text-white leading-tight" style={{ fontSize: frame.textStyle.fontSize, fontWeight: frame.textStyle.fontWeight, textShadow: "0 2px 8px rgba(0,0,0,0.5)" }} dir="rtl">
            {frame.lunaText}
          </p>
          {currentFrame >= 3 && (
            <div className="mt-6 px-4 py-3 rounded-2xl text-center" style={{ background: "rgba(255,255,255,0.2)" }}>
              <p className="text-[13px] font-bold text-white" dir="rtl">{frame.product.title}</p>
              <p className="text-[16px] font-extrabold text-white mt-1">₪{frame.product.price}</p>
            </div>
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-20 p-4">
          <button onClick={(e) => { e.stopPropagation(); onProductClick?.(product); }} className="w-full rounded-2xl py-3 text-[14px] font-bold text-white flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg, #6C4CF1, #E86A9E)" }}>
            {L("קני עכשיו", "Shop Now")} <ChevronRight size={16} />
          </button>
          <div className="flex items-center justify-center gap-4 mt-3">
            <button onClick={(e) => { e.stopPropagation(); setLiked(!liked); }} className="flex items-center gap-1 text-white/80">
              <Heart size={16} fill={liked ? "#FF4D6E" : "none"} color={liked ? "#FF4D6E" : "#fff"} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); handleShare(); }} className="flex items-center gap-1 text-white/80">
              <Share2 size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}