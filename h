warning: in the working copy of 'src/components/sell/SellerEngagement.jsx', LF will be replaced by CRLF the next time Git touches it
[1mdiff --git a/src/components/sell/SellerEngagement.jsx b/src/components/sell/SellerEngagement.jsx[m
[1mindex 47c2ba8..1239d7c 100644[m
[1m--- a/src/components/sell/SellerEngagement.jsx[m
[1m+++ b/src/components/sell/SellerEngagement.jsx[m
[36m@@ -12,6 +12,13 @@[m [mimport {[m
   buildDailyMissions,[m
   weeklyGoalProgress,[m
 } from "../../lib/sellerEngagement";[m
[32m+[m[32m// ─── Achievements engine (src/lib/gamification.js — wired in unmodified) ────[m
[32m+[m[32mimport {[m
[32m+[m[32m  checkAchievements,[m
[32m+[m[32m  calculateTotalPoints,[m
[32m+[m[32m  getDailyChallenge,[m
[32m+[m[32m  getWeeklyQuest,[m
[32m+[m[32m} from "../../lib/gamification";[m
 [m
 const BADGE_LABELS = {[m
   top_seller: { he: "🏆 מוכר מוביל", en: "🏆 Top Seller" },[m
[36m@@ -97,6 +104,18 @@[m [mexport default function SellerEngagement({ marketer, sales, products, marketers[m
   }, [mySales]);[m
   const weekGoal = useMemo(() => weeklyGoalProgress(weekSales, pastAvg), [weekSales, pastAvg]);[m
 [m
[32m+[m[32m  // ─── Achievements + rotating challenges (src/lib/gamification.js) ───[m
[32m+[m[32m  const achievements = useMemo([m
[32m+[m[32m    () => checkAchievements(marketer, products, sales),[m
[32m+[m[32m    [marketer, products, sales][m
[32m+[m[32m  );[m
[32m+[m[32m  const achievementPoints = useMemo(() => calculateTotalPoints(achievements), [achievements]);[m
[32m+[m[32m  const dailyChallenge = useMemo(() => getDailyChallenge(new Date().getDate()), []);[m
[32m+[m[32m  const weeklyQuest = useMemo([m
[32m+[m[32m    () => getWeeklyQuest(Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000))),[m
[32m+[m[32m    [][m
[32m+[m[32m  );[m
[32m+[m
   return ([m
     <div className="flex flex-col gap-4">[m
       {/* Level + XP (2026) */}[m
[36m@@ -250,6 +269,46 @@[m [mexport default function SellerEngagement({ marketer, sales, products, marketers[m
           {digest}[m
         </pre>[m
       </div>[m
[32m+[m
[32m+[m[32m      {/* Achievements + rotating challenges (src/lib/gamification.js) */}[m
[32m+[m[32m      <div className="surface rounded-2xl p-5">[m
[32m+[m[32m        <div className="flex items-center justify-between mb-3">[m
[32m+[m[32m          <div className="flex items-center gap-2">[m
[32m+[m[32m            <Trophy size={16} style={{ color: "var(--accent)" }} />[m
[32m+[m[32m            <p className="text-sm font-semibold">{he ? "הישגים" : "Achievements"}</p>[m
[32m+[m[32m          </div>[m
[32m+[m[32m          <span className="mono text-[11px]" style={{ color: "var(--text-muted)" }}>[m
[32m+[m[32m            {achievementPoints} pts[m
[32m+[m[32m          </span>[m
[32m+[m[32m        </div>[m
[32m+[m[32m        {achievements.length > 0 ? ([m
[32m+[m[32m          <div className="flex flex-wrap gap-2">[m
[32m+[m[32m            {achievements.map((a) => ([m
[32m+[m[32m              <span key={a.id} title={a.description}[m
[32m+[m[32m                className="text-[10px] font-semibold px-2.5 py-1 rounded-full"[m
[32m+[m[32m                style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>[m
[32m+[m[32m                {a.name}[m
[32m+[m[32m              </span>[m
[32m+[m[32m            ))}[m
[32m+[m[32m          </div>[m
[32m+[m[32m        ) : ([m
[32m+[m[32m          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>[m
[32m+[m[32m            {he ? "המכירה הראשונה שלך תפתח את ההישג הראשון 🎉" : "Your first sale unlocks your first achievement 🎉"}[m
[32m+[m[32m          </p>[m
[32m+[m[32m        )}[m
[32m+[m[32m        <div className="flex flex-col gap-1.5 mt-3 pt-3" style={{ borderTop: "1px solid var(--accent-subtle)" }}>[m
[32m+[m[32m          <div className="flex items-center gap-2 text-[11px]">[m
[32m+[m[32m            <span>{dailyChallenge.name}</span>[m
[32m+[m[32m            <span className="flex-1" style={{ color: "var(--text-muted)" }}>{dailyChallenge.description}</span>[m
[32m+[m[32m            <span className="mono text-[10px]" style={{ color: "var(--text-faint)" }}>+{dailyChallenge.reward}</span>[m
[32m+[m[32m          </div>[m
[32m+[m[32m          <div className="flex items-center gap-2 text-[11px]">[m
[32m+[m[32m            <span>{weeklyQuest.name}</span>[m
[32m+[m[32m            <span className="flex-1" style={{ color: "var(--text-muted)" }}>{weeklyQuest.description}</span>[m
[32m+[m[32m            <span className="mono text-[10px]" style={{ color: "var(--text-faint)" }}>+{weeklyQuest.reward}</span>[m
[32m+[m[32m          </div>[m
[32m+[m[32m        </div>[m
[32m+[m[32m      </div>[m
     </div>[m
   );[m
 }[m
