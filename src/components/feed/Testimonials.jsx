/**
 * Testimonials 💬 — Social proof from "followers".
 * Real-looking testimonials with names, avatars, ratings, dates.
 */
import { Star } from "lucide-react";
import { generateTestimonial } from "../../lib/cloud/influencerVoice";

export default function Testimonials({ product }) {
  // Generate 3 testimonials for this product
  const testimonials = [
    generateTestimonial(product),
    generateTestimonial(product),
    generateTestimonial(product),
  ];

  return (
    <div className="mt-4">
      <p className="text-[12px] font-bold mb-2" style={{ color: "var(--text)" }}>
        מה הפידבקים אומרים 💬
      </p>
      <div className="flex flex-col gap-2">
        {testimonials.map((t, i) => (
          <div
            key={i}
            className="rounded-xl p-2.5 flex items-start gap-2"
            style={{ background: "var(--bg-subtle)" }}
          >
            <img src={t.avatar} alt={t.name} className="w-7 h-7 rounded-full shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] font-bold" style={{ color: "var(--text)" }}>{t.name}</p>
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} size={8} fill="#C9A86C" color="#C9A86C" />
                  ))}
                </div>
                <span className="text-[9px] text-muted mr-auto">{t.date}</span>
              </div>
              <p className="text-[10px] mt-0.5 leading-snug" style={{ color: "var(--text)" }} dir="rtl">
                {t.text}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}