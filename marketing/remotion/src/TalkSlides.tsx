// Talking slides (the owner, 2026-11-15: "Shira and Noa move and explain every slide from the
// side, with a microphone, reading it out"). The carousel's own slides, one after another like a
// swipe; beside each one the presenter whose turn it is, in a window, saying the slide into a
// podcast microphone — her own animated clip with her mouth redrawn to the line by MuseTalk
// (scripts/media/presenter, free). What she says appears word by word in a speech bubble for
// viewers with the sound off. Both presenters are original animated characters, labelled
// "דמות AI" on every frame; the slides carry the ad label. No sound effects on the cuts.
import { loadFont } from "@remotion/fonts";
import { Audio } from "@remotion/media";
import { AbsoluteFill, Easing, Freeze, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";

const he = (w: string) => loadFont({ family: "HeeboHe", url: staticFile(`heebo-hebrew-${w}-normal.woff2`), weight: w });
const la = (w: string) => loadFont({ family: "HeeboLa", url: staticFile(`heebo-latin-${w}-normal.woff2`), weight: w });
Promise.all(["500", "800", "900"].flatMap((w) => [he(w), la(w)]));

const FONT = "HeeboHe, HeeboLa, sans-serif";
const INK = "#0b0b0b";
const SUN = "#FFD60A";
const RED = "#e11d48";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const FPS = 30;
const GAP = 0.25; // a breath between two lines
const LEAD = 0.25; // the first slide shows a moment before she speaks
const HOLD = 1.1; // the last slide stays after the last word

export type Word = [number, number, string];
export type TalkLine = { id: string; presenter: "shira" | "noa"; slide: string; dark?: boolean; seconds: number; words: Word[]; video: string };
export type TalkProps = { lines: TalkLine[]; bed: string; header: string };

const NAMES = { shira: "שירה", noa: "נועה" } as const;
// her face fills the window: the clip is her from the waist up, so it is enlarged around her head
const VIDEO: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 20%", scale: 1.3, transformOrigin: "50% 34%" };

/** Each line's start (seconds) and the whole length. */
export const timeline = (lines: TalkLine[]) => {
  let t = LEAD;
  const starts = lines.map((l) => {
    const s = t;
    t += l.seconds + GAP;
    return s;
  });
  return { starts, total: t - GAP + HOLD };
};
export const talkSeconds = (p: TalkProps) => timeline(p.lines).total;

/** The words in bubbles of up to three (a new bubble after a sentence ends). */
const chunks = (words: Word[]) => {
  const out: { from: number; text: string; words: Word[] }[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) out.push({ from: cur[0][0], text: cur.map((w) => w[2]).join(" "), words: cur });
    cur = [];
  };
  for (const w of words) {
    cur.push(w);
    if (cur.length >= 3 || /[.?!:,]$/.test(w[2])) flush();
  }
  flush();
  return out;
};

const SLIDE = { x: 96, y: 150, w: 888, h: 1110 };
const WIN = { x: 40, y: 1010, w: 430, h: 574 };

const Mic: React.FC<{ local: number }> = ({ local }) => {
  const rise = interpolate(local, [0, 9], [90, 0], { ...clamp, easing: Easing.out(Easing.back(1.6)) });
  return (
    <div style={{ position: "absolute", left: WIN.x + WIN.w * 0.8 - 45, top: WIN.y + WIN.h * 0.64 + rise, width: 90, height: 300, rotate: "-16deg", transformOrigin: "50% 100%", zIndex: 6 }}>
      {/* the head: a rounded metal mesh grille */}
      <div
        style={{
          position: "absolute",
          left: 4,
          top: 0,
          width: 82,
          height: 104,
          borderRadius: "46% 46% 40% 40%",
          border: `5px solid ${INK}`,
          backgroundImage: `radial-gradient(circle at 32% 24%, rgba(255,255,255,.75) 0 14%, rgba(255,255,255,0) 42%), radial-gradient(#202227 30%, rgba(0,0,0,0) 34%), linear-gradient(140deg, #d9dce2, #6d7380 70%, #3f444d)`,
          backgroundSize: "100% 100%, 8px 8px, 100% 100%",
          boxShadow: "inset -10px -12px 18px rgba(0,0,0,.35)",
        }}
      />
      {/* the ring between the grille and the handle */}
      <div style={{ position: "absolute", left: 12, top: 98, width: 66, height: 20, borderRadius: 8, border: `5px solid ${INK}`, background: `linear-gradient(90deg, #8a8f99, #f1f3f6 40%, #7b808a)` }} />
      {/* the handle, tapering down and out of the window */}
      <div
        style={{
          position: "absolute",
          left: 20,
          top: 114,
          width: 50,
          height: 186,
          borderRadius: "10px 10px 22px 22px",
          border: `5px solid ${INK}`,
          background: `linear-gradient(90deg, #111 0%, #3a3d44 35%, #16171a 70%, #000 100%)`,
          clipPath: "polygon(0 0, 100% 0, 86% 100%, 14% 100%)",
        }}
      />
    </div>
  );
};

const Presenter: React.FC<{ line: TalkLine; at: number; dark: boolean }> = ({ line, at, dark }) => {
  const frame = useCurrentFrame();
  const local = frame - at * FPS;
  const pop = interpolate(local, [0, 6, 11], [0.82, 1.05, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const tilt = interpolate(local, [0, 6, 12], [-5, 2, 0], clamp);
  const edge = dark ? SUN : INK;
  const vid = Math.max(2, Math.floor(line.seconds * FPS));
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: WIN.x,
          top: WIN.y,
          width: WIN.w,
          height: WIN.h,
          borderRadius: 34,
          border: `7px solid ${edge}`,
          boxShadow: `11px 11px 0 ${edge}`,
          overflow: "hidden",
          background: "#fff",
          scale: pop,
          rotate: `${tilt}deg`,
          zIndex: 5,
        }}
      >
        {/* her line, then its last frame held through the breath before the next slide */}
        <Sequence durationInFrames={vid} layout="none">
          <OffthreadVideo src={staticFile(line.video)} style={VIDEO} />
        </Sequence>
        <Sequence from={vid} layout="none">
          <Freeze frame={vid - 2}>
            <OffthreadVideo muted src={staticFile(line.video)} style={VIDEO} />
          </Freeze>
        </Sequence>
      </div>
      <Mic local={local} />
      <div
        style={{
          position: "absolute",
          left: WIN.x + WIN.w / 2,
          top: WIN.y + WIN.h - 4,
          translate: "-50% 0",
          whiteSpace: "nowrap",
          padding: "7px 20px",
          borderRadius: 999,
          background: dark ? SUN : INK,
          color: dark ? INK : SUN,
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 28,
          direction: "rtl",
          zIndex: 7,
          scale: pop,
        }}
      >
        {NAMES[line.presenter]} · דמות AI
      </div>
    </>
  );
};

const Bubble: React.FC<{ line: TalkLine; at: number; dark: boolean }> = ({ line, at, dark }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS - at;
  const parts = chunks(line.words);
  const i = parts.reduce((k, c, j) => (t >= c.from ? j : k), -1);
  if (i < 0) return null;
  const local = (t - parts[i].from) * FPS;
  const edge = dark ? SUN : INK;
  return (
    <div style={{ position: "absolute", left: WIN.x + WIN.w + 34, right: 36, top: 1300, display: "flex", justifyContent: "flex-start", direction: "ltr", zIndex: 8 }}>
      <div
        style={{
          direction: "rtl",
          background: "#fff",
          color: INK,
          border: `6px solid ${edge}`,
          boxShadow: `9px 9px 0 ${edge}`,
          borderRadius: "34px 34px 34px 6px",
          padding: "16px 28px",
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 50,
          lineHeight: 1.12,
          scale: interpolate(local, [0, 5], [0.88, 1], { ...clamp, easing: Easing.out(Easing.cubic) }),
          opacity: interpolate(local, [0, 3], [0.2, 1], clamp),
          transformOrigin: "0% 100%",
        }}
      >
        {parts[i].words.map((w, j) => (
          <span key={j} style={{ color: t >= w[0] && (j === parts[i].words.length - 1 || t < parts[i].words[j + 1][0]) ? RED : INK }}>
            {w[2]}
            {j < parts[i].words.length - 1 ? " " : ""}
          </span>
        ))}
      </div>
    </div>
  );
};

const Slide: React.FC<{ src: string; at: number; next?: number; first: boolean }> = ({ src, at, next, first }) => {
  const frame = useCurrentFrame();
  const local = frame - at * FPS;
  // a swipe, the way a Hebrew carousel turns: the next slide comes in from the left
  const enter = first ? 0 : interpolate(local, [-10, 0], [-1100, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
  const leave = next === undefined ? 0 : interpolate(frame - next * FPS, [-10, 0], [0, 1100], { ...clamp, easing: Easing.in(Easing.cubic) });
  if (next !== undefined && frame > next * FPS) return null;
  if (!first && local < -10) return null;
  return (
    <div style={{ position: "absolute", left: SLIDE.x, top: SLIDE.y, width: SLIDE.w, height: SLIDE.h, translate: `${enter + leave}px 0`, borderRadius: 30, overflow: "hidden", border: `6px solid ${INK}`, boxShadow: `12px 12px 0 ${INK}` }}>
      <Img src={staticFile(src)} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
};

export const TalkSlides: React.FC<TalkProps> = (p) => {
  const frame = useCurrentFrame();
  const { starts, total } = timeline(p.lines);
  const t = frame / FPS;
  const k = starts.reduce((acc, s, j) => (t >= s - 0.2 ? j : acc), 0);
  const dark = !!p.lines[k].dark;
  return (
    <AbsoluteFill style={{ backgroundColor: dark ? "#111" : SUN, fontFamily: FONT }}>
      {p.lines.map((l, j) => (
        <Slide key={l.id} src={l.slide} at={j === 0 ? 0 : starts[j] - 0.05} next={j < p.lines.length - 1 ? starts[j + 1] - 0.05 : undefined} first={j === 0} />
      ))}
      {p.header ? (
        <div style={{ position: "absolute", top: 96, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
          <div style={{ direction: "rtl", padding: "10px 28px", borderRadius: 999, background: dark ? SUN : INK, color: dark ? INK : SUN, fontWeight: 900, fontSize: 34 }}>{p.header}</div>
        </div>
      ) : null}
      {p.lines.map((l, j) => (
        <Sequence key={l.id} from={Math.round(starts[j] * FPS)} durationInFrames={Math.round(((j < p.lines.length - 1 ? starts[j + 1] : total) - starts[j]) * FPS)}>
          <Presenter line={l} at={0} dark={!!l.dark} />
          <Bubble line={l} at={0} dark={!!l.dark} />
        </Sequence>
      ))}
      <Audio src={staticFile(p.bed)} volume={(f) => interpolate(f, [0, 12, total * FPS - 24, total * FPS], [0, 0.35, 0.35, 0], clamp)} />
    </AbsoluteFill>
  );
};
