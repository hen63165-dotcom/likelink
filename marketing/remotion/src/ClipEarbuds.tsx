// Lilac clip earbuds reel (2026-11-12): the seller's own photos (cropped clear of its brand marks
// and printed text), a drawn diagram labelled as one, the AI voice lines already approved for
// this product, and the disclosure on every frame. No price, no sound or battery claim.
import { loadFont } from "@remotion/fonts";
import { Audio } from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const he = (w: string) => loadFont({ family: "HeeboHe", url: staticFile(`heebo-hebrew-${w}-normal.woff2`), weight: w });
const la = (w: string) => loadFont({ family: "HeeboLa", url: staticFile(`heebo-latin-${w}-normal.woff2`), weight: w });
Promise.all(["500", "800", "900"].flatMap((w) => [he(w), la(w)]));

const FONT = "HeeboHe, HeeboLa, sans-serif";
const INK = "#1d1838";
const LILAC = "#ece8fb";
const VIOLET = "#6d4cff";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const out = Easing.bezier(0.16, 1, 0.3, 1);

// The scene plan in seconds; each voice line sits inside its own scene.
export const SCENES = [
  { name: "hook", from: 0, dur: 2.6, voice: "v1.mp3" },
  { name: "jewel", from: 2.6, dur: 4.5, voice: "v2.mp3" },
  { name: "clip", from: 7.1, dur: 3.4, voice: "v3.mp3" },
  { name: "worn", from: 10.5, dur: 2.8, voice: "v4.mp3" },
  { name: "cta", from: 13.3, dur: 4.0, voice: "v5.mp3" },
] as const;
export const TOTAL_SECONDS = 17.3;

const Pop: React.FC<{ at: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ at, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <span
      style={{
        display: "inline-block",
        opacity: interpolate(frame, [at * fps, at * fps + 6], [0, 1], clamp),
        scale: interpolate(frame, [at * fps, at * fps + 10], [0.6, 1], { ...clamp, easing: Easing.spring({ damping: 12 }) }),
        translate: interpolate(frame, [at * fps, at * fps + 10], ["0px 30px", "0px 0px"], { ...clamp, easing: out }),
        ...style,
      }}
    >
      {children}
    </span>
  );
};

const Headline: React.FC<{ children: React.ReactNode; top?: number; size?: number }> = ({ children, top = 250, size = 96 }) => (
  <div
    style={{
      position: "absolute",
      top,
      left: 80,
      right: 80,
      direction: "rtl",
      textAlign: "center",
      fontFamily: FONT,
      fontWeight: 900,
      fontSize: size,
      lineHeight: 1.12,
      color: INK,
      textShadow: "0 2px 0 rgba(255,255,255,.65)",
    }}
  >
    {children}
  </div>
);

const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = ["מה", "זה", "העיצוב", "הזה?!"];
  return (
    <AbsoluteFill style={{ backgroundColor: LILAC }}>
      <Img
        src={staticFile("lilac.png")}
        style={{
          position: "absolute",
          top: 520,
          left: -140,
          width: 1360,
          maskImage: "linear-gradient(to bottom, transparent 0%, black 14%, black 82%, transparent 100%)",
                    scale: interpolate(frame, [0, 2.6 * fps], [1.18, 1.0], { ...clamp, easing: out }),
          rotate: interpolate(frame, [0, 2.6 * fps], ["-3deg", "0deg"], clamp),
        }}
      />
      <Headline top={260} size={118}>
        {words.map((w, i) => (
          <Pop key={w} at={0.05 + i * 0.22} style={{ marginInline: 14 }}>
            {w}
          </Pop>
        ))}
      </Headline>
    </AbsoluteFill>
  );
};

const Sparkle: React.FC<{ x: number; y: number; at: number; size?: number }> = ({ x, y, at, size = 120 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame - at * fps;
  return (
    <svg
      width={size}
      height={size}
      viewBox="-50 -50 100 100"
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        opacity: interpolate(t, [0, 6, 16, 26], [0, 1, 1, 0], clamp),
        scale: interpolate(t, [0, 8, 26], [0.2, 1.1, 0.4], clamp),
        rotate: interpolate(t, [0, 26], ["0deg", "45deg"], clamp),
      }}
    >
      <path d="M0 -48 C6 -8 8 -6 48 0 C8 6 6 8 0 48 C-6 8 -8 6 -48 0 C-8 -6 -6 -8 0 -48 Z" fill="#ffffff" />
    </svg>
  );
};

const Jewel: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const strike = interpolate(frame, [2.0 * fps, 2.35 * fps], [0, 1], { ...clamp, easing: out });
  return (
    <AbsoluteFill style={{ backgroundColor: LILAC }}>
      <Img
        src={staticFile("lilac.png")}
        style={{
          position: "absolute",
          top: 500,
          left: -330,
          width: 1700,
          maskImage: "linear-gradient(to bottom, transparent 0%, black 14%, black 82%, transparent 100%)",
                    scale: interpolate(frame, [0, 4.5 * fps], [1.0, 1.12], clamp),
          translate: interpolate(frame, [0, 4.5 * fps], ["0px 0px", "120px -40px"], clamp),
        }}
      />
      {/* a light sweep across the chrome */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,.55) 50%, transparent 60%)",
          translate: interpolate(frame, [0.4 * fps, 1.6 * fps], ["-1100px 0px", "1100px 0px"], clamp),
        }}
      />
      <Sparkle x={420} y={980} at={0.5} />
      <Sparkle x={700} y={1260} at={0.9} size={90} />
      <Sparkle x={300} y={1420} at={1.3} size={70} />
      <Headline top={230} size={100}>
        <Pop at={0.1}>נראה כמו </Pop>{" "}
        <Pop at={0.3} style={{ position: "relative" }}>
          תכשיט…
          <span
            style={{
              position: "absolute",
              left: -10,
              right: -10,
              top: "52%",
              height: 12,
              borderRadius: 6,
              background: VIOLET,
              scale: `${strike} 1`,
              transformOrigin: "right center",
            }}
          />
        </Pop>
        <br />
        <Pop at={2.3} style={{ color: VIOLET, fontSize: 104 }}>
          אבל אלה אוזניות!
        </Pop>
      </Headline>
    </AbsoluteFill>
  );
};

const Clip: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const draw = interpolate(frame, [0, 1.0 * fps], [1, 0], { ...clamp, easing: out });
  const slide = interpolate(frame, [0.9 * fps, 1.7 * fps], [0, 1], { ...clamp, easing: Easing.spring({ damping: 14 }) });
  return (
    <AbsoluteFill style={{ backgroundColor: "#f6f4ff" }}>
      <Headline top={230} size={92}>
        <Pop at={0.1}>קליפס קטן</Pop> <Pop at={0.35}>שנצמד לאוזן</Pop>{" "}
        <Pop at={0.6} style={{ color: VIOLET }}>
          מבחוץ
        </Pop>
      </Headline>
      <svg viewBox="0 0 700 820" style={{ position: "absolute", left: 140, top: 640, width: 800, height: 937 }}>
        {/* a stylised ear, drawn line by line */}
        <g fill="none" stroke={INK} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1}>
          <path
            pathLength={1}
            strokeDashoffset={draw}
            d="M250 120 C430 70 590 190 575 370 C565 480 500 520 470 600 C445 670 400 760 320 750 C250 742 235 680 265 640 C290 605 330 600 340 560"
          />
          <path pathLength={1} strokeDashoffset={draw} d="M300 230 C420 215 480 320 455 400 C440 450 395 470 380 510" />
          <path pathLength={1} strokeDashoffset={draw} d="M250 120 C170 150 150 260 175 330" />
          <path pathLength={1} strokeDashoffset={draw} d="M215 420 C185 440 188 485 222 495" />
        </g>
        {/* the clip: the bridge goes over the rim, one ball rests in front, one behind */}
        <g
          style={{
            translate: `${interpolate(slide, [0, 1], [260, 0])}px ${interpolate(slide, [0, 1], [-120, 0])}px`,
            opacity: interpolate(slide, [0, 0.15], [0, 1], clamp),
          }}
        >
          <path d="M395 455 C430 360 560 330 600 420" fill="none" stroke="#9a8cf0" strokeWidth={30} strokeLinecap="round" />
          <circle cx={385} cy={470} r={52} fill="#b9adf7" stroke="#7d6ae6" strokeWidth={6} />
          <circle cx={372} cy={455} r={14} fill="#ffffff" opacity={0.8} />
          <circle cx={615} cy={455} r={46} fill="#b9adf7" stroke="#7d6ae6" strokeWidth={6} />
        </g>
      </svg>
    </AbsoluteFill>
  );
};

const Worn: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ring = interpolate(frame, [0.5 * fps, 1.1 * fps], [0, 1], { ...clamp, easing: out });
  return (
    <AbsoluteFill style={{ backgroundColor: LILAC }}>
      <div
        style={{
          position: "absolute",
          top: 560,
          left: 60,
          width: 960,
          height: 869,
          borderRadius: 48,
          overflow: "hidden",
          boxShadow: "0 30px 80px rgba(40,20,120,.25)",
        }}
      >
        <Img
          src={staticFile("worn.png")}
          style={{
            width: 960,
            height: 869,
            objectFit: "cover",
            scale: interpolate(frame, [0, 2.8 * fps], [1.0, 1.35], clamp),
            transformOrigin: "53% 51%",
          }}
        />
        {/* a ring around the earbud */}
        <svg width={960} height={869} style={{ position: "absolute", inset: 0 }}>
          <circle
            cx={510}
            cy={442}
            r={interpolate(frame, [0, 2.8 * fps], [92, 118], clamp)}
            fill="none"
            stroke="#ffffff"
            strokeWidth={10}
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - ring}
          />
        </svg>
      </div>
      <Headline top={240} size={96}>
        <Pop at={0.1}>בלי שום דבר</Pop>
        <br />
        <Pop at={0.4} style={{ color: VIOLET }}>
          בתוך האוזן
        </Pop>
      </Headline>
      <div
        style={{
          position: "absolute",
          top: 1450,
          left: 80,
          right: 80,
          textAlign: "center",
          direction: "rtl",
          fontFamily: FONT,
          fontWeight: 500,
          fontSize: 40,
          color: INK,
          opacity: 0.85,
        }}
      >
        תמונת המוכר · בתמונה: הצבע השחור
      </div>
    </AbsoluteFill>
  );
};

const Cta: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const typed = Math.floor(interpolate(frame, [1.3 * fps, 1.9 * fps], [0, 3], clamp));
  const word = "אני".slice(0, typed);
  const caret = Math.floor(frame / 8) % 2 === 0 ? 1 : 0;
  return (
    <AbsoluteFill style={{ backgroundColor: LILAC }}>
      <Img
        src={staticFile("lilac.png")}
        style={{
          position: "absolute",
          top: 290,
          left: 170,
          width: 740,
          borderRadius: 40,
          scale: interpolate(frame, [0, 0.6 * fps], [0.85, 1], { ...clamp, easing: Easing.spring({ damping: 14 }) }),
        }}
      />
      <Headline top={880} size={100}>
        <Pop at={0.15}>רוצה את הקישור?</Pop>
      </Headline>
      <div
        style={{
          position: "absolute",
          top: 1120,
          left: 140,
          right: 140,
          height: 190,
          borderRadius: 95,
          background: "#ffffff",
          boxShadow: "0 20px 60px rgba(40,20,120,.18)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          direction: "rtl",
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 92,
          color: INK,
          opacity: interpolate(frame, [0.8 * fps, 1.1 * fps], [0, 1], clamp),
          scale: interpolate(frame, [0.8 * fps, 1.2 * fps], [0.8, 1], { ...clamp, easing: Easing.spring({ damping: 12 }) }),
        }}
      >
        <span style={{ fontWeight: 500, opacity: 0.7, marginInlineEnd: 24 }}>כתבי:</span>
        <span style={{ color: VIOLET }}>{word}</span>
        <span style={{ width: 6, height: 90, background: INK, opacity: caret, marginInlineStart: 8 }} />
      </div>
      <div
        style={{
          position: "absolute",
          top: 1360,
          left: 80,
          right: 80,
          textAlign: "center",
          direction: "rtl",
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 50,
          color: INK,
          opacity: interpolate(frame, [2.0 * fps, 2.3 * fps], [0, 1], clamp),
        }}
      >
        ואשלח לך אותו בפרטי
      </div>
    </AbsoluteFill>
  );
};

// What is on every frame: the disclosure on top, who made the pictures and the voice at the bottom.
const Labels: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const clip = SCENES[2];
  const inDiagram = frame >= clip.from * fps && frame < (clip.from + clip.dur) * fps;
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
    <AbsoluteFill>
      <div style={{ ...pill, top: 110, padding: "12px 34px", fontSize: 44, fontWeight: 800 }}>#פרסומת · קישור שותפים</div>
      <div style={{ ...pill, bottom: 120, padding: "10px 28px", fontSize: 34, fontWeight: 500 }}>
        {inDiagram ? "איור להמחשה · קול AI · בעריכת LikeLink2" : "תמונות המוכר · קול AI · בעריכת LikeLink2"}
      </div>
    </AbsoluteFill>
  );
};

const SCENE_VIEW: Record<(typeof SCENES)[number]["name"], React.FC> = { hook: Hook, jewel: Jewel, clip: Clip, worn: Worn, cta: Cta };

export const ClipEarbuds: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: LILAC }}>
      {SCENES.map((s) => {
        const View = SCENE_VIEW[s.name];
        return (
          <Sequence key={s.name} name={s.name} from={Math.round(s.from * fps)} durationInFrames={Math.round(s.dur * fps)}>
            <View />
            <Sequence from={4}>
              <Audio src={staticFile(s.voice)} />
            </Sequence>
          </Sequence>
        );
      })}
      <Audio src={staticFile("bed.m4a")} />
      <Labels />
    </AbsoluteFill>
  );
};
