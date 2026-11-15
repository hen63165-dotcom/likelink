// The selling format (the owner, 2026-11-15: "תעשה סרטונים שווים ומוכרים... תעשה את כל הסרטונים ככה").
// Real hands-on footage only (the store's own video, labelled as the seller's on every frame, or the
// owner's own clip, labelled as real). The result first, a short Hebrew hook in the first second, a cut
// on the beat every ~1 s with a small punch-in, big captions, the own energetic beat (popbeat.py) and
// no sound on the cuts. Then the end card "תגיבי 'אני'".
import { loadFont } from "@remotion/fonts";
import { Audio } from "@remotion/media";
import { AbsoluteFill, Easing, Freeze, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";

const he = (w: string) => loadFont({ family: "HeeboHe", url: staticFile(`heebo-hebrew-${w}-normal.woff2`), weight: w });
const la = (w: string) => loadFont({ family: "HeeboLa", url: staticFile(`heebo-latin-${w}-normal.woff2`), weight: w });
Promise.all(["500", "800", "900"].flatMap((w) => [he(w), la(w)]));

const FONT = "HeeboHe, HeeboLa, sans-serif";
const INK = "#111111";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const SELL_FPS = 30;

export type Cut = { from: number; to: number; pos?: string; zoom?: number };
export type Line = { from: number; to: number; text: string };
export type SellProps = {
  clip: string; audio: string; cuts: Cut[]; lines: Line[]; name: string; endSeconds: number;
  filmedBy: string; // e.g. "סרטון המוכר · בעריכת LikeLink2" or "צילום אמיתי · LikeLink2"
};

export const cutsSeconds = (c: Cut[]) => c.reduce((s, g) => s + (g.to - g.from), 0);
export const sellSeconds = (p: SellProps) => cutsSeconds(p.cuts) + p.endSeconds;

const Shot: React.FC<{ clip: string; cut: Cut; len: number; first: boolean }> = ({ clip, cut, len, first }) => {
  const f = useCurrentFrame();
  const z = cut.zoom ?? 1.0;
  // a quick punch-in at each cut, then a slow push; the first shot snaps in harder
  const s = first
    ? interpolate(f, [0, 6, len], [z * 1.14, z * 1.02, z * 1.07], { ...clamp, easing: Easing.out(Easing.cubic) })
    : interpolate(f, [0, 4, len], [z * 1.06, z * 1.0, z * 1.05], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <OffthreadVideo src={staticFile(clip)} muted trimBefore={Math.round(cut.from * SELL_FPS)}
        style={{ width: 1080, height: 1920, objectFit: "cover", objectPosition: cut.pos || "50% 50%", scale: String(s) }} />
    </AbsoluteFill>
  );
};

const Caption: React.FC<{ lines: Line[] }> = ({ lines }) => {
  const frame = useCurrentFrame();
  const t = frame / SELL_FPS;
  const line = lines.find((l) => t >= l.from && t < l.to);
  if (!line) return null;
  const local = frame - line.from * SELL_FPS;
  return (
    <div style={{ position: "absolute", top: 300, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
      <div style={{
        maxWidth: 980, padding: "24px 46px", borderRadius: 32, background: "#ffffff", color: INK, direction: "rtl",
        textAlign: "center", whiteSpace: "pre-line", fontFamily: FONT, fontWeight: 900, fontSize: 84, lineHeight: 1.12,
        boxShadow: "0 14px 44px rgba(0,0,0,.22)",
        scale: interpolate(local, [0, 5, 8], [0.82, 1.04, 1], { ...clamp, easing: Easing.out(Easing.cubic) }),
        opacity: interpolate(local, [0, 3], [0, 1], clamp),
      }}>{line.text}</div>
    </div>
  );
};

const EndCard: React.FC<{ name: string; from: number }> = ({ name, from }) => {
  const frame = useCurrentFrame();
  const local = frame - from * SELL_FPS;
  if (local < 0) return null;
  return (
    <AbsoluteFill style={{ background: `rgba(0,0,0,${interpolate(local, [0, 6], [0, 0.45], clamp)})`, justifyContent: "center", alignItems: "center" }}>
      <div style={{
        width: 920, padding: "56px 40px", borderRadius: 44, background: "#ffffff", direction: "rtl", textAlign: "center",
        fontFamily: FONT, color: INK,
        translate: `0 ${interpolate(local, [0, 8], [70, 0], { ...clamp, easing: Easing.out(Easing.back(1.6)) })}px`,
        opacity: interpolate(local, [0, 5], [0, 1], clamp),
      }}>
        <div style={{ fontWeight: 900, fontSize: 78, lineHeight: 1.1 }}>{name}</div>
        <div style={{ fontWeight: 500, fontSize: 44, marginTop: 22, opacity: 0.75 }}>רוצה את הקישור?</div>
        <div style={{ display: "inline-block", marginTop: 24, padding: "18px 52px", borderRadius: 999, background: INK, color: "#fff", fontWeight: 900, fontSize: 64 }}>תגיבי 'אני'</div>
        <div style={{ fontWeight: 500, fontSize: 34, marginTop: 20, opacity: 0.7 }}>ואשלח לך בהודעה פרטית</div>
      </div>
    </AbsoluteFill>
  );
};

export const SellReel: React.FC<SellProps> = (p) => {
  let at = 0;
  const parts = p.cuts.map((g, i) => {
    const len = Math.round((g.to - g.from) * SELL_FPS);
    const start = at;
    at += len;
    return (
      <Sequence key={i} from={start} durationInFrames={len}>
        <Shot clip={p.clip} cut={g} len={len} first={i === 0} />
      </Sequence>
    );
  });
  const last = p.cuts[p.cuts.length - 1];
  const endFrom = at / SELL_FPS;
  const total = Math.round(sellSeconds(p) * SELL_FPS);
  const pill: React.CSSProperties = {
    position: "absolute", left: "50%", translate: "-50% 0", whiteSpace: "nowrap", direction: "rtl", fontFamily: FONT,
    borderRadius: 999, background: "rgba(255,255,255,.92)", color: INK,
  };
  return (
    <AbsoluteFill style={{ backgroundColor: "#111" }}>
      {parts}
      <Sequence from={at}>
        <Freeze frame={0}>
          <OffthreadVideo src={staticFile(p.clip)} muted trimBefore={Math.max(0, Math.round(last.to * SELL_FPS) - 2)}
            style={{ width: 1080, height: 1920, objectFit: "cover", objectPosition: last.pos || "50% 50%", scale: String((last.zoom ?? 1) * 1.05) }} />
        </Freeze>
      </Sequence>
      <Audio src={staticFile(p.audio)} volume={(f) => interpolate(f, [0, 3, total - 18, total], [0, 1, 1, 0], clamp)} />
      <Caption lines={p.lines} />
      <EndCard name={p.name} from={endFrom} />
      <div style={{ ...pill, top: 110, padding: "10px 30px", fontSize: 36, fontWeight: 800 }}>#פרסומת · קישור שותפים</div>
      <div style={{ ...pill, top: 178, padding: "8px 24px", fontSize: 30, fontWeight: 500 }}>{p.filmedBy}</div>
    </AbsoluteFill>
  );
};

// Garlic chopper (ae-1005006678126295), the store's own 9.7 s clip, 720×720. Cuts on the 122 BPM beat
// (0.984 s per two beats). The result first (the grated pile), then how: clove in, push, grate, rinse.
const B = 60 / 122 * 2;
const c = (from: number, n = 1, pos = "50% 50%", zoom = 1): Cut => ({ from, to: from + B * n, pos, zoom });
export const GARLIC_SELL: SellProps = {
  clip: "garlic-store.mp4",
  audio: "pop-garlic.m4a",
  name: "מגררת שום ידנית",
  filmedBy: "סרטון המוכר · בעריכת LikeLink2",
  cuts: [
    c(6.25, 1, "50% 70%", 1.0),   // the grated garlic pile: the payoff first
    c(0.35, 1, "45% 55%", 1.0),   // the gadget in hand
    c(2.85, 1, "45% 55%", 1.0),   // a clove goes in
    c(4.35, 1, "45% 60%", 1.0),   // turn and push
    c(6.9, 1.2, "50% 65%", 1.05), // grating straight onto the board
    c(8.55, 1, "50% 50%", 1.0),   // rinse under the tap
  ],
  lines: [
    { from: 0, to: B * 2, text: "שום כתוש בלי סכין? 🧄" },
    { from: B * 2, to: B * 4, text: "שן שום פנימה" },
    { from: B * 4, to: B * 5.2, text: "מגררים ישר על הקרש" },
    { from: B * 5.2, to: B * 6.2, text: "ושוטפים במים" },
  ],
  endSeconds: 2.4,
};
