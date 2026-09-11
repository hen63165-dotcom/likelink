/**
 * StoryRings 🌈 — שורת טבעות הסטורי בראש העמוד.
 * החתימה החזותית של אפליקציית משפיען על (LTK / Instagram / TikTok Shop):
 * טבעת ראשונה = לונה (הפנים האמיתיות של הענן) עם גרדיאנט מסתובב + ניאון,
 * וטבעות היוצרות המובילות סביבה. לחיצה = סטורי מסך מלא או מעבר לפרופיל.
 * 100% קוד, אפס תלות, אנימציה קלה.
 */
import { useState } from "react";
import { Plus } from "lucide-react";
import { LunaAvatar } from "../ambassador/LunaAvatar";
import { CreatorAvatar } from "../product/ProductComponents";
import LunaStoryViewer from "./LunaStoryViewer";

// ריבוע גרדיאנט אוטבנטי ליציבות — צבעים חמים ייחודיים לכל טבעת
const RING_HUES = [325, 262, 16, 200, 355, 96]; // ורוד, סגול, כתום, כחול, אדום, ירוק

function Ring({ hue, active, children, onClick, label, live }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="tap shrink-0 flex flex-col items-center gap-1.5"
      style={{ outline: "none" }}
    >
      <span
        className={`ll-story-ring rounded-full flex items-center justify-center ${active ? "ll-ring-spin" : ""}`}
        style={{ width: 72, height: 72, padding: 3 }}
      >
        <span
          className="rounded-full flex items-center justify-center overflow-hidden"
          style={{ width: "100%", height: "100%", background: "var(--bg-elevated, #fff)" }}
        >
          {children}
        </span>
      </span>
      <span className="max-w-[72px] truncate text-[10px] font-bold" style={{ color: "var(--text-secondary)" }}>
        {label}
      </span>
      {live ? (
        <span
          className="absolute -top-0.5 -end-0.5 w-3.5 h-3.5 rounded-full border-2"
          style={{ background: "#22c55e", borderColor: "var(--bg-elevated, #fff)" }}
        />
      ) : null}
    </button>
  );
}

export default function StoryRings({ marketers = [], products = [], navigate, lang = "he" }) {
  const [story, setStory] = useState(null); // המוצר שנפתח במסך מלא

  // הבחירה של לונה — המוצר הבכיר הציבורי הראשון
  const lunaPick =
    products.find((p) => p?.status === "approved") || products[0] || null;

  // היוצרות המובילות (לפי קליקים) — עד 4
  const topCreators = [...marketers]
    .filter((m) => m && m.slug && m.id)
    .sort((a, b) => (b.clicks || 0) - (a.clicks || 0))
    .slice(0, 4);

  return (
    <>
      <div className="relative mb-4">
        <div className="flex items-center gap-4 overflow-x-auto pb-2 ll-no-scroll" dir="rtl">
          <Ring
            hue={RING_HUES[0]}
            active
            label={lang === "he" ? "לונה" : "Luna"}
            live
            onClick={() => lunaPick && setStory(lunaPick)}
          >
            <LunaAvatar persona={undefined} size={60} glow={false} />
          </Ring>

          {topCreators.map((m, i) => (
            <Ring
              key={m.id}
              hue={RING_HUES[(i + 1) % RING_HUES.length]}
              label={(m.name || "").split(" ")[0]}
              onClick={() => navigate && navigate(`/u/${m.slug}`)}
            >
              <CreatorAvatar marketer={m} size={60} />
            </Ring>
          ))}

          {/* טבעת ההזמנה — פן של "כולם רוצים להיות כאן" */}
          <Ring
            hue={RING_HUES[0]}
            label={lang === "he" ? "פתחי סטודיו" : "Open studio"}
            onClick={() => navigate && navigate("/sell")}
          >
            <span
              className="flex items-center justify-center rounded-full"
              style={{ width: 60, height: 60, background: "var(--accent-subtle)", color: "var(--accent)" }}
            >
              <Plus size={24} />
            </span>
          </Ring>
        </div>
        <p className="text-[10px] font-semibold tracking-wide uppercase text-muted px-1" dir="rtl">
          {lang === "he" ? "סיפורי הענן — הקליקי של היום" : "Cloud stories — today's picks"}
        </p>
      </div>

      {story && (
        <LunaStoryViewer
          product={story}
          onClose={() => setStory(null)}
          onProductClick={(p) => { setStory(null); navigate && navigate(`/p/${p.id}`); }}
        />
      )}
    </>
  );
}