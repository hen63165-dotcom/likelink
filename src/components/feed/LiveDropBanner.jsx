/**
 * LiveDropBanner ⚡ — Flash sale countdown timer.
 * Creates massive FOMO with live countdown, stock meter, and social proof.
 */
import { useState, useEffect } from "react";
import { Flame, Clock, Users, Zap } from "lucide-react";

export default function LiveDropBanner({ drop, onClick }) {
  const [timeLeft, setTimeLeft] = useState(drop.timeLeft);
  const [viewers, setViewers] = useState(drop.viewers);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((t) => Math.max(0, t - 1000));
      // Simulate live viewers
      setViewers((v) => v + Math.floor(Math.random() * 3) - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = Math.floor(timeLeft / 3600000);
  const minutes = Math.floor((timeLeft % 3600000) / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);

  const soldPercent = drop.soldPercent;
  const isCritical = timeLeft < 15 * 60 * 000 || drop.stock <= 3;

  return (
    <div
      className="mb-5 rounded-2xl overflow-hidden relative cursor-pointer"
      style={{
        background: isCritical
          ? "linear-gradient(135deg, #FF4D6E, #E86A9E)"
          : "linear-gradient(135deg, #6C4CF1, #E86A9E)",
      }}
      onClick={onClick}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <Flame size={16} color="#fff" className="animate-pulse" />
          <p className="text-[11px] font-bold uppercase tracking-wider text-white/90">
            הנחת לייב — זמן מוגבל
          </p>
          <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white">
            ● LIVE
          </span>
        </div>

        {/* Countdown */}
        <div className="flex items-center justify-center gap-3 mb-3">
          <div className="text-center">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <span className="text-[18px] font-extrabold text-white">{hours}</span>
            </div>
            <p className="text-[9px] text-white/70 mt-0.5">שעות</p>
          </div>
          <span className="text-2xl text-white font-bold">:</span>
          <div className="text-center">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <span className="text-[18px] font-extrabold text-white">{String(minutes).padStart(2, "0")}</span>
            </div>
            <p className="text-[9px] text-white/70 mt-0.5">דקות</p>
          </div>
          <span className="text-2xl text-white font-bold">:</span>
          <div className="text-center">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <span className="text-[18px] font-extrabold text-white">{String(seconds).padStart(2, "0")}</span>
            </div>
            <p className="text-[9px] text-white/70 mt-0.5">שניות</p>
          </div>
        </div>

        {/* Stock meter */}
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] text-white/80">{soldPercent}% נמכר</p>
            <p className="text-[10px] text-white/80">רק {drop.stock} נותרו</p>
          </div>
          <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-white transition-all"
              style={{ width: `${soldPercent}%` }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Users size={12} color="#fff" />
            <span className="text-[10px] text-white/80">{viewers} צופים</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[11px] line-through text-white/60">₪{drop.originalPrice}</span>
            <span className="text-[16px] font-extrabold text-white">₪{drop.dropPrice}</span>
          </div>
        </div>
      </div>
    </div>
  );
}