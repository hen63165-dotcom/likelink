/**
 * StudioFeed 📱 — "הסטודיו שלך, כמו המשפיען הכי גדול".
 * =================================================
 * Renders the studio's autonomous posts in a premium influencer-style feed.
 * Each post is REAL — trend-backed, buzz-generated, professional.
 *
 * Placed at the top of the main feed, before the product grid.
 * Shows the studio is ALIVE and posting like a top creator.
 */
import { useEffect, useState } from "react";
import { Sparkles, Flame, TrendingUp, Share2 } from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { composeStudioPost } from "../../lib/cloud/studioEngine";

export default function StudioFeed({ discovery, trend, navigate }) {
  const { lang } = useI18n();
  const L = (he, en) => (lang === "he" ? he : en);
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    if (!discovery?.hasResult || !discovery?.top) return;
    const post = composeStudioPost({ pick: discovery.top, trend, format: "feed" });
    if (post) setPosts([post]);
  }, [discovery, trend]);

  if (!posts.length) return null;

  return (
    <section className="mb-6">
      {/* Studio header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #C9A86C, #9C7437)" }}>
          <Sparkles size={13} color="#fff" />
        </div>
        <div>
          <p className="text-[12px] font-bold" style={{ color: "var(--text)" }}>
            {L("הסטודיו הראשי · פוסט חי", "Main studio · LIVE post")}
          </p>
          <p className="text-[10px] text-muted">
            {L("מתעדכן כל דקה לפי מה שחם עכשיו", "Updates every minute based on what's hot")}
          </p>
        </div>
        <span className="ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--accent)" }}>
          ● LIVE
        </span>
      </div>

      {/* Posts */}
      <div className="flex flex-col gap-3">
        {posts.map((post) => (
          <div key={post.productId} className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
            {/* Post header */}
            <div className="p-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px]" style={{ background: "linear-gradient(135deg, #C9A86C, #9C7437)" }}>
                🧚
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold truncate">לונה · הסטודיו הראשי</p>
                <p className="text-[9px] text-muted">{L("פוסט אוטומטי · מבוסס נתונים", "Auto post · data-backed")}</p>
              </div>
              {post.heatLevel === "critical" && <Flame size={12} className="ml-auto" style={{ color: "var(--accent)" }} />}
              {post.heatLevel === "high" && <TrendingUp size={12} className="ml-auto" style={{ color: "var(--accent)" }} />}
            </div>

            {/* Post body */}
            <div className="p-4" dir="rtl">
              <p className="text-[14px] font-extrabold leading-snug" style={{ color: "var(--text)" }}>
                {post.headline}
              </p>
              <p className="text-[12px] font-semibold mt-1" style={{ color: "var(--text)" }}>
                {post.subheading}
              </p>
              <p className="text-[11.5px] text-muted mt-2 whitespace-pre-line">
                {post.body}
              </p>
            </div>

            {/* Post CTA */}
            <div className="px-4 pb-4 flex items-center gap-2">
              <button
                type="button"
                className="tap flex-1 rounded-xl py-2 text-[11.5px] font-bold text-white"
                style={{ background: "var(--accent)" }}
                onClick={() => discovery?.top?.productId && navigate(`/p/${encodeURIComponent(discovery.top.productId)}`)}
              >
                {post.cta}
              </button>
              <button type="button" className="tap w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--bg-subtle)" }}>
                <Share2 size={14} style={{ color: "var(--text)" }} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}