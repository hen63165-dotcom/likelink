import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, ShoppingBag, X } from "lucide-react";
import { useVideos } from "../../context/VideoContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { useI18n } from "../../lib/LangContext";
import { money } from "../../utils/helpers";

export function ReelsPlayer({ video, onClose, onProductClick }) {
  const { t } = useI18n();
  const { products, marketers } = useMarketplace();
  const { trackVideoView, trackProductClick } = useVideos();
  const [isPlaying, setIsPlaying] = useState(true);
  const [showTags, setShowTags] = useState(true);
  const [activeTag, setActiveTag] = useState(null);

  useEffect(() => {
    trackVideoView(video.id);
  }, [video.id, trackVideoView]);

  const getProductDetails = (productId) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return null;
    const marketer = marketers.find((m) => m.id === product.marketerId);
    return { product, marketer };
  };

  const handleProductClick = (productId) => {
    trackProductClick(video.id, productId);
    const details = getProductDetails(productId);
    if (details && onProductClick) {
      onProductClick(details.product, details.marketer);
    }
  };

  const getVideoEmbedUrl = (url) => {
    if (!url) return null;
    const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/);
    if (youtubeMatch) {
      return `https://www.youtube.com/embed/${youtubeMatch[1]}?autoplay=1&mute=1&loop=1&playlist=${youtubeMatch[1]}&controls=0`;
    }
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) {
      return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1&mute=1&loop=1&controls=0`;
    }
    if (url.match(/\.(mp4|webm|mov)$/i)) {
      return url;
    }
    return null;
  return (
    <div className="relative w-full aspect-[9/16] bg-black rounded-2xl overflow-hidden">
      {video.videoUrl.match(/\.(mp4|webm|mov)$/i) ? (
        <video src={video.videoUrl} autoPlay loop muted playsInline className="w-full h-full object-cover" />
      ) : (
        <iframe src={embedUrl} className="w-full h-full" allow="autoplay; encrypted-media" allowFullScreen title={video.title || "Reel"} />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none">
        <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
          <h3 className="font-semibold text-sm mb-1">{video.title || "Untitled Reel"}</h3>
          {video.description && <p className="text-xs text-white/80 line-clamp-2">{video.description}</p>}
        </div>
      </div>

      <AnimatePresence>
        {showTags && video.productTags?.length > 0 && (
          <div className="absolute inset-0">
            {video.productTags.map((tag, index) => {
              const details = getProductDetails(tag.productId);
              if (!details) return null;
              const positions = [{ top: "20%", left: "10%" }, { top: "40%", right: "10%" }, { top: "60%", left: "10%" }];
              const position = positions[index % positions.length];

              return (
                <motion.button key={tag.productId} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ delay: index * 0.1 }} className="absolute tap" style={position}>
                  <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-lg">
                    <ShoppingBag size={14} className="text-gray-800" />
                    <span className="text-xs font-semibold text-gray-800 whitespace-nowrap">{money(details.product.price, "he")}</span>
                  </div>
                  {activeTag === tag.productId && (
                    <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mt-2 bg-white rounded-xl p-3 shadow-xl w-64">
                      {details.product.image && <img src={details.product.image} alt={details.product.title} className="w-full h-32 object-cover rounded-lg mb-2" />}
                      <p className="text-xs font-semibold text-gray-900 line-clamp-2">{details.product.title}</p>
                      <button onClick={() => handleProductClick(tag.productId)} className="mt-2 w-full tap bg-blue-600 text-white text-xs font-semibold py-2 rounded-lg">
                        {t("reels.clickToShop", "לחצי לקנייה")}
                      </button>
                    </motion.div>
                  )}
                </motion.button>
              );
            })}
          </div>
        )}
      </AnimatePresence>

      <div className="absolute top-4 right-4 flex gap-2">
        <button onClick={() => setShowTags(!showTags)} className="tap p-2 rounded-full bg-white/20 backdrop-blur-sm text-white">
          <ShoppingBag size={18} />
        </button>
        {onClose && (
          <button onClick={onClose} className="tap p-2 rounded-full bg-white/20 backdrop-blur-sm text-white">
            <X size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
  };

  const embedUrl = getVideoEmbedUrl(video.videoUrl);
  if (!embedUrl) return null;
﻿import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, ShoppingBag, X } from "lucide-react";
import { useVideos } from "../../context/VideoContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { useI18n } from "../../lib/LangContext";
import { money } from "../../utils/helpers";

export function ReelsPlayer({ video, onClose, onProductClick }) {
  const { t } = useI18n();
  const { products, marketers } = useMarketplace();
  const { trackVideoView, trackProductClick } = useVideos();
  const [isPlaying, setIsPlaying] = useState(true);
  const [showTags, setShowTags] = useState(true);
  const [activeTag, setActiveTag] = useState(null);

  useEffect(() => {
    trackVideoView(video.id);
  }, [video.id, trackVideoView]);

  const getProductDetails = (productId) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return null;
    const marketer = marketers.find((m) => m.id === product.marketerId);
    return { product, marketer };
  };

  const handleProductClick = (productId) => {
    trackProductClick(video.id, productId);
    const details = getProductDetails(productId);
    if (details && onProductClick) {
      onProductClick(details.product, details.marketer);
    }
  };

  const getVideoEmbedUrl = (url) => {
    if (!url) return null;
    const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/);
    if (youtubeMatch) {
      return `https://www.youtube.com/embed/${youtubeMatch[1]}?autoplay=1&mute=1&loop=1&playlist=${youtubeMatch[1]}&controls=0`;
    }
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) {
      return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1&mute=1&loop=1&controls=0`;
    }
    if (url.match(/\.(mp4|webm|mov)$/i)) {
      return url;
    }
    return null;
  };

  const embedUrl = getVideoEmbedUrl(video.videoUrl);
  if (!embedUrl) return null;

  return (
    <div className="relative w-full aspect-[9/16] bg-black rounded-2xl overflow-hidden">
      {video.videoUrl.match(/\.(mp4|webm|mov)$/i) ? (
        <video src={video.videoUrl} autoPlay loop muted playsInline className="w-full h-full object-cover" />
      ) : (
        <iframe src={embedUrl} className="w-full h-full" allow="autoplay; encrypted-media" allowFullScreen title={video.title || "Reel"} />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none">
        <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
          <h3 className="font-semibold text-sm mb-1">{video.title || "Untitled Reel"}</h3>
          {video.description && <p className="text-xs text-white/80 line-clamp-2">{video.description}</p>}
        </div>
      </div>

      <AnimatePresence>
        {showTags && video.productTags?.length > 0 && (
          <div className="absolute inset-0">
            {video.productTags.map((tag, index) => {
              const details = getProductDetails(tag.productId);
              if (!details) return null;
              const positions = [{ top: "20%", left: "10%" }, { top: "40%", right: "10%" }, { top: "60%", left: "10%" }];
              const position = positions[index % positions.length];

              return (
                <motion.button key={tag.productId} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ delay: index * 0.1 }} className="absolute tap" style={position}>
                  <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-lg">
                    <ShoppingBag size={14} className="text-gray-800" />
                    <span className="text-xs font-semibold text-gray-800 whitespace-nowrap">{money(details.product.price, "he")}</span>
                  </div>
                  {activeTag === tag.productId && (
                    <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mt-2 bg-white rounded-xl p-3 shadow-xl w-64">
                      {details.product.image && <img src={details.product.image} alt={details.product.title} className="w-full h-32 object-cover rounded-lg mb-2" />}
                      <p className="text-xs font-semibold text-gray-900 line-clamp-2">{details.product.title}</p>
                      <button onClick={() => handleProductClick(tag.productId)} className="mt-2 w-full tap bg-blue-600 text-white text-xs font-semibold py-2 rounded-lg">
                        {t("reels.clickToShop", "לחצי לקנייה")}
                      </button>
                    </motion.div>
                  )}
                </motion.button>
              );
            })}
          </div>
        )}
      </AnimatePresence>

      <div className="absolute top-4 right-4 flex gap-2">
        <button onClick={() => setShowTags(!showTags)} className="tap p-2 rounded-full bg-white/20 backdrop-blur-sm text-white">
          <ShoppingBag size={18} />
        </button>
        {onClose && (
          <button onClick={onClose} className="tap p-2 rounded-full bg-white/20 backdrop-blur-sm text-white">
            <X size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
