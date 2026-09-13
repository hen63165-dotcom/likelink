import { useEffect, useState } from "react";

export default function KineticWord({ words = [], intervalMs = 2500, className = "" }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (prefersReducedMotion || words.length <= 1) return undefined;

    const timer = setInterval(() => {
      setVisible(false);
      const fadeOutMs = 250;
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % words.length);
        setVisible(true);
      }, fadeOutMs);
    }, intervalMs);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words.length, intervalMs, prefersReducedMotion]);

  if (words.length === 0) return null;

  return (
    <span
      className={className}
      style={{
        display: "inline-block",
        opacity: visible ? 1 : 0,
        transition: prefersReducedMotion ? "none" : "opacity 0.25s ease",
      }}
    >
      {words[index]}
    </span>
  );
}
