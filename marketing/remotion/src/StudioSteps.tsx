// "Open a studio" stick-figure reel (2026-11-12, skill stick-figure): one figure, four beats taken
// from the real Studio flow (open a free studio → paste an affiliate link → the store is ready to
// share), then the comment keyword. No income, no counts, no names of real people; LikeLink2's own
// promotion, so no affiliate tag. Every limb keeps its length: poses are joint angles, lengths fixed.
import { loadFont } from "@remotion/fonts";
import { Audio } from "@remotion/media";
import { AbsoluteFill, Easing, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

const he = (w: string) => loadFont({ family: "HeeboHe", url: staticFile(`heebo-hebrew-${w}-normal.woff2`), weight: w });
const la = (w: string) => loadFont({ family: "HeeboLa", url: staticFile(`heebo-latin-${w}-normal.woff2`), weight: w });
Promise.all(["500", "800", "900"].flatMap((w) => [he(w), la(w)]));

const FONT = "HeeboHe, HeeboLa, sans-serif";
const INK = "#111111";
const SKY = "#dff1ff";
const ACCENT = "#1f8fff";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const smooth = Easing.bezier(0.45, 0, 0.2, 1);

// ── the figure ──────────────────────────────────────────────────────────────
type Pose = { lu: number; ll: number; ru: number; rl: number; lt: number; ls: number; rt: number; rs: number; head: number };
const POSES: Record<string, Pose> = {
  idle: { lu: -14, ll: -8, ru: 14, rl: 8, lt: -9, ls: -4, rt: 9, rs: 4, head: 0 },
  phone: { lu: -14, ll: -8, ru: 28, rl: 152, lt: -9, ls: -4, rt: 9, rs: 4, head: 12 },
  point: { lu: -16, ll: -10, ru: 96, rl: 92, lt: -9, ls: -4, rt: 9, rs: 4, head: -4 },
  tap: { lu: -16, ll: -10, ru: 84, rl: 70, lt: -9, ls: -4, rt: 9, rs: 4, head: -6 },
  present: { lu: -20, ll: -12, ru: 62, rl: 48, lt: -9, ls: -4, rt: 9, rs: 4, head: -4 },
  cheer: { lu: -150, ll: -166, ru: 150, rl: 166, lt: -12, ls: -6, rt: 12, rs: 6, head: 0 },
};
const L = { torso: 210, upper: 112, lower: 104, thigh: 130, shin: 130, head: 52 };
const v = (deg: number, len: number) => [Math.sin((deg * Math.PI) / 180) * len, Math.cos((deg * Math.PI) / 180) * len];
const mix = (a: Pose, b: Pose, t: number): Pose =>
  Object.fromEntries(Object.keys(a).map((k) => [k, a[k as keyof Pose] + (b[k as keyof Pose] - a[k as keyof Pose]) * t])) as Pose;

// keys: [frame, pose] inside the beat; held between keys, eased across 9 frames
const usePose = (keys: [number, keyof typeof POSES][]) => {
  const frame = useCurrentFrame();
  let pose = POSES[keys[0][1]];
  for (let i = 1; i < keys.length; i++) {
    const [at, name] = keys[i];
    const t = interpolate(frame, [at, at + 9], [0, 1], { ...clamp, easing: smooth });
    if (t > 0) pose = mix(pose, POSES[name], t);
  }
  return pose;
};

const Figure: React.FC<{ x: number; ground: number; pose: Pose; phone?: boolean }> = ({ x, ground, pose, phone }) => {
  const hip = [x, ground - L.thigh - L.shin];
  const neck = [hip[0], hip[1] - L.torso];
  const shoulder = [neck[0], neck[1] + 22];
  const joint = (from: number[], a: number, len: number) => {
    const d = v(a, len);
    return [from[0] + d[0], from[1] + d[1]];
  };
  const le = joint(shoulder, pose.lu, L.upper), lh = joint(le, pose.ll, L.lower);
  const re = joint(shoulder, pose.ru, L.upper), rh = joint(re, pose.rl, L.lower);
  const lk = joint(hip, pose.lt, L.thigh), lf = joint(lk, pose.ls, L.shin);
  const rk = joint(hip, pose.rt, L.thigh), rf = joint(rk, pose.rs, L.shin);
  const headC = [neck[0] + Math.sin((pose.head * Math.PI) / 180) * L.head, neck[1] - L.head + 4];
  const line = (pts: number[][]) => `M${pts.map((p) => p.join(" ")).join(" L")}`;
  return (
    <g fill="none" stroke={INK} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round">
      <path d={line([neck, hip])} />
      <path d={line([shoulder, le, lh])} />
      <path d={line([shoulder, re, rh])} />
      <path d={line([hip, lk, lf])} />
      <path d={line([hip, rk, rf])} />
      <circle cx={headC[0]} cy={headC[1]} r={L.head} fill="#ffffff" />
      <circle cx={headC[0] + 16} cy={headC[1] - 6} r={5} fill={INK} stroke="none" />
      <circle cx={headC[0] - 12} cy={headC[1] - 6} r={5} fill={INK} stroke="none" />
      <path d={`M${headC[0] - 14} ${headC[1] + 18} Q${headC[0] + 2} ${headC[1] + 30} ${headC[0] + 18} ${headC[1] + 18}`} strokeWidth={6} />
      {phone ? <rect x={rh[0] - 26} y={rh[1] - 70} width={52} height={92} rx={10} fill={INK} stroke="none" /> : null}
    </g>
  );
};

// ── text ────────────────────────────────────────────────────────────────────
const Title: React.FC<{ children: React.ReactNode; accent?: string; size?: number }> = ({ children, accent, size = 96 }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        top: 250,
        left: 80,
        right: 80,
        direction: "rtl",
        textAlign: "center",
        fontFamily: FONT,
        fontWeight: 900,
        fontSize: size,
        lineHeight: 1.12,
        color: INK,
        opacity: interpolate(frame, [0, 8], [0, 1], clamp),
        translate: interpolate(frame, [0, 12], ["0px 30px", "0px 0px"], { ...clamp, easing: smooth }),
      }}
    >
      {children}
      {accent ? (
        <>
          <br />
          <span style={{ color: ACCENT }}>{accent}</span>
        </>
      ) : null}
    </div>
  );
};

const Stage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
    <line x1={120} y1={1520} x2={960} y2={1520} stroke={INK} strokeWidth={6} strokeLinecap="round" opacity={0.25} />
    {children}
  </svg>
);

// ── beats ───────────────────────────────────────────────────────────────────
const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const pose = usePose([[0, "idle"], [10, "phone"]]);
  return (
    <AbsoluteFill>
      <Title accent="שחברות שואלות עליהן?" size={84}>יש לך המלצות</Title>
      <Stage>
        <Figure x={540} ground={1520} pose={pose} phone />
        {/* friends' questions pop around her */}
        {[
          [300, 860, 30],
          [790, 900, 48],
          [260, 1080, 66],
        ].map(([x, y, at]) => (
          <g key={at} opacity={interpolate(frame, [at, at + 6], [0, 1], clamp)} transform={`translate(${x} ${y}) scale(${interpolate(frame, [at, at + 10], [0.5, 1], { ...clamp, easing: Easing.spring({ damping: 12 }) })})`}>
            <rect x={-70} y={-50} width={140} height={100} rx={40} fill="#ffffff" stroke={INK} strokeWidth={6} />
            <text x={0} y={22} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={64} fill={ACCENT}>?</text>
          </g>
        ))}
      </Stage>
    </AbsoluteFill>
  );
};

const OpenStudio: React.FC = () => {
  const frame = useCurrentFrame();
  const pose = usePose([[0, "idle"], [12, "point"], [44, "tap"], [56, "point"]]);
  const pressed = interpolate(frame, [48, 52, 58], [1, 0.93, 1], clamp);
  const done = interpolate(frame, [58, 66], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <Title accent="בחינם">פותחים סטודיו</Title>
      <Stage>
        <Figure x={330} ground={1520} pose={pose} />
        <g transform={`translate(770 1060) scale(${pressed})`} opacity={interpolate(frame, [6, 14], [0, 1], clamp)}>
          <rect x={-215} y={-70} width={430} height={140} rx={70} fill={INK} />
          <text x={0} y={18} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={46} fill="#ffffff" direction="rtl">פתיחת סטודיו בחינם</text>
        </g>
        <g transform="translate(770 1230)" opacity={done}>
          <circle r={50} fill={ACCENT} />
          <path d="M-22 2 L-6 18 L24 -14" fill="none" stroke="#ffffff" strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </Stage>
    </AbsoluteFill>
  );
};

const PasteLink: React.FC = () => {
  const frame = useCurrentFrame();
  const pose = usePose([[0, "point"], [8, "phone"], [40, "present"]]);
  const fly = interpolate(frame, [28, 56], [0, 1], { ...clamp, easing: smooth });
  const typed = Math.floor(interpolate(frame, [56, 80], [0, 1], clamp) * 22);
  return (
    <AbsoluteFill>
      <Title accent="קישור שותפים">מדביקים</Title>
      <Stage>
        <Figure x={330} ground={1520} pose={pose} phone={frame < 44} />
        {/* the store's add-link box */}
        <g transform="translate(730 980)" opacity={interpolate(frame, [4, 12], [0, 1], clamp)}>
          <rect x={-260} y={-90} width={520} height={180} rx={36} fill="#ffffff" stroke={INK} strokeWidth={6} />
          <text x={220} y={-30} textAnchor="start" fontFamily={FONT} fontWeight={800} fontSize={40} fill={INK} direction="rtl">הוספת קישור</text>
          <rect x={-220} y={0} width={440} height={64} rx={18} fill={SKY} />
          <text x={-200} y={44} fontFamily={FONT} fontWeight={500} fontSize={30} fill={INK}>{"https://s.click.aliexpress…".slice(0, Math.max(0, typed + 5))}</text>
        </g>
        {/* the link chip flies from her phone into the box */}
        <g
          opacity={interpolate(fly, [0, 0.05, 0.9, 1], [0, 1, 1, 0])}
          transform={`translate(${interpolate(fly, [0, 1], [450, 700])} ${interpolate(fly, [0, 0.5, 1], [1110, 880, 1010])})`}
        >
          <rect x={-90} y={-36} width={180} height={72} rx={36} fill={ACCENT} />
          <path d="M-40 0 h28 M12 0 h28" stroke="#ffffff" strokeWidth={10} strokeLinecap="round" />
          <rect x={-20} y={-14} width={40} height={28} rx={14} fill="none" stroke="#ffffff" strokeWidth={8} />
        </g>
      </Stage>
    </AbsoluteFill>
  );
};

const StoreReady: React.FC = () => {
  const frame = useCurrentFrame();
  const pose = usePose([[0, "present"], [46, "cheer"]]);
  const tiles = [0, 1, 2];
  return (
    <AbsoluteFill>
      <Title accent="מוכנה לשיתוף">החנות שלך</Title>
      <Stage>
        <Figure x={300} ground={1520} pose={pose} />
        <g transform="translate(730 1010)">
          <rect x={-250} y={-250} width={500} height={470} rx={40} fill="#ffffff" stroke={INK} strokeWidth={6} opacity={interpolate(frame, [0, 8], [0, 1], clamp)} />
          <text x={200} y={-180} textAnchor="start" fontFamily={FONT} fontWeight={900} fontSize={44} fill={INK} direction="rtl" opacity={interpolate(frame, [4, 10], [0, 1], clamp)}>
            החנות שלך
          </text>
          {tiles.map((i) => (
            <g key={i} opacity={interpolate(frame, [10 + i * 6, 18 + i * 6], [0, 1], clamp)} transform={`translate(${120 - i * 140} -40)`}>
              <rect x={-60} y={-70} width={120} height={150} rx={20} fill={SKY} />
              <rect x={-44} y={52} width={88} height={14} rx={7} fill={INK} opacity={0.25} />
            </g>
          ))}
          {/* share: one arrow out to three round network buttons (no names, no counts) */}
          <g opacity={interpolate(frame, [30, 38], [0, 1], clamp)}>
            <rect x={-200} y={90} width={400} height={92} rx={46} fill={INK} />
            <text x={0} y={150} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={42} fill="#ffffff" direction="rtl">שיתוף</text>
          </g>
          {[-130, 0, 130].map((dx, i) => (
            <circle
              key={dx}
              cx={dx}
              cy={interpolate(frame, [40 + i * 4, 56 + i * 4], [140, 300], { ...clamp, easing: smooth })}
              r={38}
              fill={ACCENT}
              opacity={interpolate(frame, [40 + i * 4, 44 + i * 4], [0, 1], clamp)}
            />
          ))}
        </g>
      </Stage>
    </AbsoluteFill>
  );
};

const Cta: React.FC = () => {
  const frame = useCurrentFrame();
  const word = "סטודיו".slice(0, Math.floor(interpolate(frame, [18, 40], [0, 6], clamp)));
  const caret = Math.floor(frame / 8) % 2 === 0 ? 1 : 0;
  return (
    <AbsoluteFill>
      <Title accent="משלך?">רוצה סטודיו</Title>
      <div
        style={{
          position: "absolute",
          top: 540,
          left: 120,
          right: 120,
          height: 190,
          borderRadius: 95,
          background: "#ffffff",
          border: `6px solid ${INK}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          direction: "rtl",
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 92,
          color: INK,
          opacity: interpolate(frame, [4, 12], [0, 1], clamp),
          scale: interpolate(frame, [4, 16], [0.85, 1], { ...clamp, easing: Easing.spring({ damping: 12 }) }),
        }}
      >
        <span style={{ fontWeight: 500, opacity: 0.6, marginInlineEnd: 24 }}>כתבי:</span>
        <span style={{ color: ACCENT }}>{word}</span>
        <span style={{ width: 6, height: 90, background: INK, opacity: caret, marginInlineStart: 8 }} />
      </div>
      <div
        style={{
          position: "absolute",
          top: 770,
          left: 80,
          right: 80,
          textAlign: "center",
          direction: "rtl",
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 52,
          color: INK,
          opacity: interpolate(frame, [44, 52], [0, 1], clamp),
        }}
      >
        ואשלח לך את הקישור בפרטי
      </div>
      <Stage>
        <Figure x={540} ground={1520} pose={POSES.cheer} />
      </Stage>
    </AbsoluteFill>
  );
};

export const STUDIO_BEATS = [
  { name: "hook", from: 0, dur: 3.5, View: Hook },
  { name: "open", from: 3.5, dur: 3.5, View: OpenStudio },
  { name: "paste", from: 7, dur: 3.5, View: PasteLink },
  { name: "store", from: 10.5, dur: 3.5, View: StoreReady },
  { name: "cta", from: 14, dur: 3.5, View: Cta },
] as const;
export const STUDIO_SECONDS = 17.5;

export const StudioSteps: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: SKY }}>
      {STUDIO_BEATS.map(({ name, from, dur, View }) => (
        <Sequence key={name} name={name} from={Math.round(from * fps)} durationInFrames={Math.round(dur * fps)}>
          <View />
        </Sequence>
      ))}
      <Audio src={staticFile("bed.m4a")} />
      <div
        style={{
          position: "absolute",
          bottom: 120,
          left: "50%",
          translate: "-50% 0",
          whiteSpace: "nowrap",
          direction: "rtl",
          fontFamily: FONT,
          fontWeight: 500,
          fontSize: 34,
          color: INK,
          background: "rgba(255,255,255,.9)",
          borderRadius: 999,
          padding: "10px 28px",
        }}
      >
        אנימציה · LikeLink2
      </div>
    </AbsoluteFill>
  );
};
