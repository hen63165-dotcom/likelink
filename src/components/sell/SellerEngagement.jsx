import { useState, useMemo } from "react";
import { TrendingUp, Trophy, Flame, Award, BarChart3, Eye, MousePointerClick } from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { money } from "../../utils/helpers";
import {
  buildLeaderboard,
  computeStreak,
  awardBadges,
  rivalNudge,
  buildWeeklyDigest,
} from "../../lib/sellerEngagement";

const BADGE_LABELS = {
  top_seller: { he: "🏆 מוכר מוביל", en: "🏆 Top Seller" },
  rising_star: { he: "⭐ כוכב עולה", en: "⭐ Rising Star" },
  consistent_creator: { he: "🔥 יוצר עקבי", en: "🔥 Consistent Creator" },
  dedicated_icon: { he: "💎 אייקון מסור", en: "💎 Dedicated Icon" },
  traffic_magnet: { he: "📈 מגנט תנועה", en: "📈 Traffic Magnet" },
  proven_seller: { he: "✅ מוכר מוכח", en: "✅ Proven Seller" },
  curator: { he: "🎨 קוראיטור", en: "🎨 Curator" },
  new_comer: { he: "🌱 חדש ומבטיח", en: "🌱 New & Promising" },
};

/**
 * Seller Engagement Panel — healthy competition, streaks,
 * badges, leaderboard and weekly digest for a single seller.
 */
export default function SellerEngagement({ marketer, sales, products, marketers }) {
  const { lang } = useI18n();
  const he = lang === "he";

  const board = useMemo(
    () => buildLeaderboard(sales, products, marketers),
    [sales, products, marketers]
  );

  const mySales = useMemo(
    () => (Array.isArray(sales) ? sales : []).filter((s) => s && s.marketerId === marketer.id),
    [sales, marketer]
  );
  const myProducts = useMemo(
    () => (Array.isArray(products) ? products : []).filter((p) => p && p.marketerId === marketer.id),
    [products, marketer]
  );

  const streak = useMemo(() => computeStreak(mySales), [mySales]);
  const badges = useMemo(() => awardBadges({
    earnings: mySales.reduce((s, x) => s + (x.marketerNet || 0), 0),
    salesCount: mySales.length,
    clicks: myProducts.reduce((s, p) => s + (p.clicks || 0), 0),
        streak: streak.days,
    productCount: myProducts.length,
  }), [mySales, myProducts, streak]);

    const nudge = useMemo(() => rivalNudge(board, marketer.id), [board, marketer]);
  const digest = useMemo(() => buildWeeklyDigest(mySales, myProducts), [mySales, myProducts]);
  const myRank = board.find((r) => r.marketerId === marketer.id);
  const topFive = board.slice(0, 5);
  const label = (key) => BADGE_LABELS[key]?.[he ? "he" : "en"] || key;

  return (
    <div className="flex flex-col gap-4">
      {/* Rank + nudge */}
      <div className="surface rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Trophy size={16} style={{ color: "var(--accent)" }} />
          <p className="text-sm font-semibold">{he ? "הדירוג שלך" : "Your Rank"}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center disp font-bold text-2xl"
            style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
            {myRank ? `#${myRank.rank}` : "—"}
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-semibold">
              {myRank ? `${he ? "רווחים" : "Earnings"}: ${money(myRank.earnings, lang)}` : "—"}
            </p>
            {nudge && (
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                {nudge.text}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Streak + badges */}
      <div className="surface rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Flame size={16} style={{ color: streak.days > 0 ? "var(--warning)" : "var(--text-faint)" }} />
            <p className="text-sm font-semibold">{he ? "רצף פעילות" : "Activity Streak"}</p>
          </div>
          <span className="mono text-lg font-bold" style={{ color: streak.days > 0 ? "var(--warning)" : "var(--text-faint)" }}>
            {streak.days} {he ? "ימים" : "days"}
          </span>
        </div>
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {badges.map((b) => (
              <span key={b} className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
                style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
                {label(b)}
              </span>
            ))}
          </div>
        )}
        {badges.length === 0 && (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {he ? "פרסמי מוצרים ומכרי כדי לזכות בתגים!" : "Publish products & sell to earn badges!"}
          </p>
        )}
            </div>

      {/* Leaderboard */}
      <div className="surface rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={16} style={{ color: "var(--accent)" }} />
          <p className="text-sm font-semibold">{he ? "טבלת המובילים" : "Leaderboard"}</p>
        </div>
        <div className="flex flex-col gap-2">
          {topFive.length === 0 && (
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {he ? "עדיין אין מוכרים פעילים" : "No active sellers yet"}
            </p>
          )}
          {topFive.map((row) => {
            const isMe = row.marketerId === marketer.id;
            return (
              <div key={row.marketerId}
                className="flex items-center justify-between py-1.5 px-2 rounded-xl"
                style={isMe ? { background: "var(--accent-subtle)" } : undefined}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="mono text-xs font-bold w-5 text-center"
                    style={{ color: row.rank === 1 ? "var(--warning)" : "var(--text-faint)" }}>
                    {row.rank}
                  </span>
                  <span className="text-[12px] font-semibold truncate">
                    {row.name}
                    {isMe ? ` (${he ? "את" : "you"})` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
                    <MousePointerClick size={10} /> {row.clicks}
                  </span>
                  <span className="mono text-[12px] font-bold" style={{ color: row.rank === 1 ? "var(--success)" : "var(--text)" }}>
                    {money(row.earnings, lang)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Weekly digest */}
      <div className="surface rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Award size={16} style={{ color: "var(--accent)" }} />
          <p className="text-sm font-semibold">{he ? "סיכום שבועי" : "Weekly Digest"}</p>
        </div>
        <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-sans"
          style={{ color: "var(--text-secondary)" }}>
          {digest}
        </pre>
      </div>
    </div>
  );
}
