// The owner's second Gemini clip (butterfly clip earbuds, 2026-11-13): a generated woman puts the
// earbuds on, no words. We add the pro caption style (black on a white box, upper third), cover the
// fake Instagram comment sheet and back button the model drew over the last shot with our own
// "כתבו אוזניות" card, mute the clip's own sound (the runner heard only noise) under the music bed,
// and put the disclosure and the AI label on every frame.
import { loadFont } from "@remotion/fonts";
import { Audio, Video } from "@remotion/media";
import { AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

const he = (w: string) => loadFont({ family: "HeeboHe", url: staticFile(`heebo-hebrew-${w}-normal.woff2`), weight: w });
const la = (w: string) => loadFont({ family: "HeeboLa", url: staticFile(`heebo-latin-${w}-normal.woff2`), weight: w });
Promise.all(["500", "800", "900"].flatMap((w) => [he(w), la(w)]));

const FONT = "HeeboHe, HeeboLa, sans-serif";
const INK = "#111111";
const VIOLET = "#6d4cff";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const BUTTERFLY_UGC_SECONDS = 10.0;
const UI_FROM = 8.45; // the model's fake comment sheet appears at ~8.6 s

// one line per shot (the clip's own cuts: 1.5, 3.42, 5.42, 7.42)
const LINES: { from: number; to: number; text: string }[] = [
  { from: 0, to: 1.5, text: "עגילים? לא.\nאוזניות!" },
  { from: 1.5, to: 3.42, text: "קליפס שנצמד\nלאוזן מבחוץ" },
  { from: 3.42, to: 5.42, text: "נראה כמו תכשיט" },
  { from: 5.42, to: 7.42, text: "טיפ: בוחרים צבע\nבעמוד המוצר" },
  { from: 7.42, to: UI_FROM, text: "רוצות את הקישור?" },
];

const Caption: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const line = LINES.find((l) => t >= l.from && t < l.to);
  if (!line) return null;
  const local = frame - line.from * fps;
  return (
    <div style={{ position: "absolute", top: 300, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
    <div
      style={{
        maxWidth: 940,
        padding: "22px 44px",
        borderRadius: 34,
        background: "#ffffff",
        color: INK,
        direction: "rtl",
        textAlign: "center",
        whiteSpace: "pre-line",
        fontFamily: FONT,
        fontWeight: 900,
        fontSize: 74,
        lineHeight: 1.15,
        boxShadow: "0 12px 40px rgba(0,0,0,.18)",
        scale: interpolate(local, [0, 8], [0.85, 1], { ...clamp, easing: Easing.spring({ damping: 12 }) }),
        opacity: interpolate(local, [0, 4], [0, 1], clamp),
      }}
    >
      {line.text}
    </div>
    </div>
  );
};

const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - UI_FROM * fps;
  if (local < 0) return null;
  const word = "אוזניות".slice(0, Math.floor(interpolate(local, [8, 26], [0, 7], clamp)));
  const caret = Math.floor(frame / 8) % 2 === 0 ? 1 : 0;
  return (
    <>
      {/* the model's back button, top-left */}
      <div style={{ position: "absolute", left: 0, top: 0, width: 190, height: 190, background: "rgb(226,222,216)", filter: "blur(14px)" }} />
      {/* our own comment card over the model's fake sheet */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 330,
          background: "#ffffff",
          borderRadius: "48px 48px 0 0",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          direction: "rtl",
          fontFamily: FONT,
          color: INK,
          translate: `0 ${interpolate(local, [0, 8], [330, 0], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) })}px`,
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 64 }}>רוצות את הקישור?</div>
        <div style={{ display: "flex", alignItems: "center", fontWeight: 900, fontSize: 70 }}>
          <span style={{ fontWeight: 500, opacity: 0.6, marginInlineEnd: 20 }}>כתבו:</span>
          <span style={{ color: VIOLET }}>{word}</span>
          <span style={{ width: 6, height: 70, background: INK, opacity: caret, marginInlineStart: 8 }} />
        </div>
        <div style={{ fontWeight: 500, fontSize: 36, opacity: 0.75 }}>ואשלח לכן את הקישור בפרטי</div>
      </div>
    </>
  );
};

export const ButterflyUgc: React.FC = () => {
  const pill: React.CSSProperties = {
    position: "absolute",
    left: "50%",
    translate: "-50% 0",
    whiteSpace: "nowrap",
    direction: "rtl",
    fontFamily: FONT,
    borderRadius: 999,
    background: "rgba(255,255,255,.9)",
    color: INK,
  };
  return (
    <AbsoluteFill style={{ backgroundColor: "#e2ded8" }}>
      <Video src={staticFile("gemini-butterfly-2.mp4")} muted style={{ width: 1080, height: 1920, objectFit: "cover" }} />
      <Audio src={staticFile("bed.m4a")} />
      <Caption />
      <div style={{ ...pill, top: 130, padding: "10px 30px", fontSize: 38, fontWeight: 800 }}>#פרסומת · קישור שותפים</div>
      <div style={{ ...pill, top: 200, padding: "8px 24px", fontSize: 30, fontWeight: 500 }}>סרטון AI · הדמות נוצרה ב־AI</div>
      <EndCard />
    </AbsoluteFill>
  );
};
