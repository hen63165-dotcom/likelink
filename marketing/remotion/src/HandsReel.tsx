// Hands-on reels in the style the owner sent (2026-11-14, @wardrobe_fold): real hands using the
// product, full screen, no talking, little text. The footage is the store's own product video
// (fetched through her affiliate account), labelled on every frame as the seller's video, never
// as ours or as a customer's. One caption at a time in the grid's style (black on a white box,
// upper third), then the end card "תגיבי 'אני'". The clips are silent; a soft generated bed plays.
import { loadFont } from "@remotion/fonts";
import { Audio } from "@remotion/media";
import { AbsoluteFill, Easing, Freeze, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

const he = (w: string) => loadFont({ family: "HeeboHe", url: staticFile(`heebo-hebrew-${w}-normal.woff2`), weight: w });
const la = (w: string) => loadFont({ family: "HeeboLa", url: staticFile(`heebo-latin-${w}-normal.woff2`), weight: w });
Promise.all(["500", "800", "900"].flatMap((w) => [he(w), la(w)]));

const FONT = "HeeboHe, HeeboLa, sans-serif";
const INK = "#111111";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const FPS = 30;

export type Segment = { from: number; to: number; rate?: number; pos?: string };
export type Line = { from: number; to: number; text: string };
export type HandsProps = { clip: string; segments: Segment[]; lines: Line[]; name: string; endSeconds: number };

/** Seconds of footage on screen (each segment at its own speed). */
export const footageSeconds = (segments: Segment[]) => segments.reduce((s, g) => s + (g.to - g.from) / (g.rate || 1), 0);
export const totalSeconds = (p: HandsProps) => footageSeconds(p.segments) + p.endSeconds;

const Caption: React.FC<{ lines: Line[] }> = ({ lines }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const line = lines.find((l) => t >= l.from && t < l.to);
  if (!line) return null;
  const local = frame - line.from * FPS;
  return (
    <div style={{ position: "absolute", top: 330, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          maxWidth: 940,
          padding: "22px 44px",
          borderRadius: 30,
          background: "#ffffff",
          color: INK,
          direction: "rtl",
          textAlign: "center",
          whiteSpace: "pre-line",
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 70,
          lineHeight: 1.15,
          boxShadow: "0 12px 40px rgba(0,0,0,.18)",
          scale: interpolate(local, [0, 7], [0.9, 1], { ...clamp, easing: Easing.out(Easing.cubic) }),
          opacity: interpolate(local, [0, 4], [0, 1], clamp),
        }}
      >
        {line.text}
      </div>
    </div>
  );
};

const EndCard: React.FC<{ name: string; from: number }> = ({ name, from }) => {
  const frame = useCurrentFrame();
  const local = frame - from * FPS;
  if (local < 0) return null;
  return (
    <AbsoluteFill style={{ background: `rgba(0,0,0,${interpolate(local, [0, 8], [0, 0.45], clamp)})`, justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          width: 900,
          padding: "56px 40px",
          borderRadius: 44,
          background: "#ffffff",
          direction: "rtl",
          textAlign: "center",
          fontFamily: FONT,
          color: INK,
          translate: `0 ${interpolate(local, [0, 9], [60, 0], { ...clamp, easing: Easing.out(Easing.cubic) })}px`,
          opacity: interpolate(local, [0, 6], [0, 1], clamp),
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 76, lineHeight: 1.1 }}>{name}</div>
        <div style={{ fontWeight: 500, fontSize: 44, marginTop: 22, opacity: 0.75 }}>רוצה את הקישור?</div>
        <div style={{ display: "inline-block", marginTop: 24, padding: "16px 48px", borderRadius: 999, background: INK, color: "#fff", fontWeight: 900, fontSize: 60 }}>תגיבי 'אני'</div>
        <div style={{ fontWeight: 500, fontSize: 34, marginTop: 20, opacity: 0.7 }}>ואשלח לך בהודעה פרטית</div>
      </div>
    </AbsoluteFill>
  );
};

export const HandsReel: React.FC<HandsProps> = (p) => {
  const { fps } = useVideoConfig();
  let at = 0;
  const parts = p.segments.map((g, i) => {
    const rate = g.rate || 1;
    const len = Math.round(((g.to - g.from) / rate) * fps);
    const start = at;
    at += len;
    return (
      <Sequence key={i} from={start} durationInFrames={len}>
        <OffthreadVideo
          src={staticFile(p.clip)}
          muted
          playbackRate={rate}
          trimBefore={Math.round(g.from * fps)}
          style={{ width: 1080, height: 1920, objectFit: "cover", objectPosition: g.pos || "50% 50%" }}
        />
      </Sequence>
    );
  });
  const last = p.segments[p.segments.length - 1];
  const endFrom = at / fps;
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
    <AbsoluteFill style={{ backgroundColor: "#111" }}>
      {parts}
      {/* the end card sits over the last frame of the footage, held still */}
      <Sequence from={at}>
        <Freeze frame={0}>
          <OffthreadVideo
            src={staticFile(p.clip)}
            muted
            trimBefore={Math.max(0, Math.round(last.to * fps) - 2)}
            style={{ width: 1080, height: 1920, objectFit: "cover", objectPosition: last.pos || "50% 50%" }}
          />
        </Freeze>
      </Sequence>
      <Audio src={staticFile("bed.m4a")} volume={(f) => interpolate(f, [0, 10, totalSeconds(p) * fps - 20, totalSeconds(p) * fps], [0, 0.8, 0.8, 0], clamp)} />
      <Caption lines={p.lines} />
      <EndCard name={p.name} from={endFrom} />
      <div style={{ ...pill, top: 120, padding: "10px 30px", fontSize: 36, fontWeight: 800 }}>#פרסומת · קישור שותפים</div>
      <div style={{ ...pill, top: 188, padding: "8px 24px", fontSize: 30, fontWeight: 500 }}>סרטון המוכר · בעריכת LikeLink2</div>
    </AbsoluteFill>
  );
};

export const GARLIC: HandsProps = {
  clip: "garlic-store.mp4",
  segments: [{ from: 0, to: 9.6, rate: 0.85, pos: "42% 50%" }],
  lines: [
    { from: 0, to: 2.8, text: "שום כתוש\nבלי סכין?" },
    { from: 6.6, to: 9.4, text: "מגררים ישר\nעל הקרש" },
    { from: 9.9, to: 11.3, text: "ושוטפים במים" },
  ],
  name: "מגרדת שום ידנית",
  endSeconds: 2.6,
};

export const RINGS: HandsProps = {
  clip: "rings-store.mp4",
  segments: [
    { from: 0.5, to: 8.0, pos: "60% 50%" },
    { from: 18.0, to: 23.0, pos: "48% 50%" },
  ],
  lines: [
    { from: 0, to: 2.8, text: "ככה הסט הזה\nנראה על היד" },
    { from: 3.6, to: 7.3, text: "טבעת עם אבן\n+ טבעת משלימה" },
    { from: 7.8, to: 12.4, text: "טיפ: בודקים מידה\nבמודד של לונה" },
  ],
  name: "סט טבעות",
  endSeconds: 2.6,
};
