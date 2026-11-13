// The owner's Gemini clip (butterfly clip earbuds, 2026-11-13), repaired for posting: the model drew an
// Instagram mark into the top-left corner of two shots and garbled its last caption ("בתבזניות",
// "קיישור"). We cover the mark, set the last caption again in clean Hebrew, and put the disclosure and
// the AI label on every frame (the presenter is a generated person, not a real customer).
import { loadFont } from "@remotion/fonts";
import { Video } from "@remotion/media";
import { AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

const he = (w: string) => loadFont({ family: "HeeboHe", url: staticFile(`heebo-hebrew-${w}-normal.woff2`), weight: w });
const la = (w: string) => loadFont({ family: "HeeboLa", url: staticFile(`heebo-latin-${w}-normal.woff2`), weight: w });
Promise.all(["500", "800", "900"].flatMap((w) => [he(w), la(w)]));

const FONT = "HeeboHe, HeeboLa, sans-serif";
const INK = "#1d1838";
const VIOLET = "#6d4cff";
export const BUTTERFLY_SECONDS = 10.0;
// the shots that carry the drawn mark, and the shot with the garbled caption (from the clip's own cuts)
const MARK = [
  [0, 1.32],
  [8.41, 99],
] as const;
const LAST_SHOT = 8.41;

export const ButterflyFix: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const markOn = MARK.some(([a, b]) => t >= a && t < b);
  const pill: React.CSSProperties = {
    position: "absolute",
    left: "50%",
    translate: "-50% 0",
    whiteSpace: "nowrap",
    direction: "rtl",
    fontFamily: FONT,
    borderRadius: 999,
    background: "rgba(255,255,255,.92)",
    color: INK,
  };
  return (
    <AbsoluteFill style={{ backgroundColor: "#c7b9d6" }}>
      <Video src={staticFile("gemini-butterfly.mp4")} style={{ width: 1080, height: 1920, objectFit: "cover" }} />
      {markOn ? (
        <div
          style={{
            position: "absolute",
            left: -20,
            top: 10,
            width: 110,
            height: 170,
            borderRadius: 40,
            background: "rgb(199,185,214)",
            filter: "blur(6px)",
          }}
        />
      ) : null}
      {t >= LAST_SHOT ? (
        <div
          style={{
            position: "absolute",
            top: 240,
            left: 50,
            right: 50,
            height: 420,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            borderRadius: 48,
            background: "#ffffff",
            boxShadow: "0 18px 50px rgba(40,20,90,.18)",
            direction: "rtl",
            textAlign: "center",
            fontFamily: FONT,
            color: INK,
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 92, lineHeight: 1.1 }}>רוצות גם?</div>
          <div style={{ fontWeight: 800, fontSize: 62, lineHeight: 1.25, marginTop: 14 }}>
            כתבו <span style={{ color: VIOLET }}>אוזניות</span> בתגובות
          </div>
          <div style={{ fontWeight: 800, fontSize: 62, lineHeight: 1.25 }}>ואשלח לכן קישור בפרטי</div>
        </div>
      ) : null}
      <div style={{ ...pill, bottom: 210, padding: "12px 32px", fontSize: 42, fontWeight: 800 }}>#פרסומת · קישור שותפים</div>
      <div style={{ ...pill, bottom: 130, padding: "10px 28px", fontSize: 34, fontWeight: 500 }}>סרטון AI · הדמות נוצרה ב־AI</div>
    </AbsoluteFill>
  );
};
