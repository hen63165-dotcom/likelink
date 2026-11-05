// LikeLink2, "רואים בסרטון, קונים בחנות": a pure function of time. window.seek(t) paints frame t.
// Timing is in beats (u) on the measured grid (beats.json); docs/shotlist.md is the plan.
// One real product all the way through (p-live-03, the tennis bracelet): the frame from the
// seller's own video, the real product page on likelink2.vercel.app, then the original store.
import * as M from './lib/motion.js';

const { W, H, FORMAT, E, prog, lerp, clamp, springU, SPRING, wobble, font, fill, cover, rrect, hash01, kf } = M;

// Brand tokens (src/public.css): sky, ink, one accent (rose).
const C = { sky: '#eaf2fb', sky2: '#d4e5f6', sky3: '#bdd6ef', ink: '#0d0c14', paper: '#ffffff', accent: '#d22f5d', mute: '#55617a' };
const DISPLAY = 'Display', UI = 'UI';

const HITS = [
  [0, 'hook word 1', 'impact'],
  [0.5, 'hook word 2', 'pop', { pitch: 'A5' }],
  [1, 'hook word 3', 'pop', { pitch: 'C#6' }],
  [2, 'line 2 word 1', 'pop', { pitch: 'E5' }],
  [2.5, 'line 2 word 2', 'pop', { pitch: 'A5' }],
  [3, 'אותו? (phone shakes)', 'pop', { pitch: 'E6' }],
  [7.5, 'photo lifts out', 'whoosh', { len: 0.5 }],
  [8, 'window lands', 'thud'],
  [12, 'line to product page', 'whoosh', { len: 0.45, from: 600, to: 2400 }],
  [14, 'docks in page', 'pop', { pitch: 'A5' }],
  [17, 'line to store', 'whoosh', { len: 0.45, from: 2400, to: 700, pan: 0.3 }],
  [20, 'store card', 'impact'],
  [21.5, 'no sign-up', 'tick'],
  [23.3, 'whip to end card', 'whoosh', { len: 0.4 }],
  [24.1, 'end words', 'impact'],
  [24.9, 'קונים בחנות', 'bell', { pitch: 'E6' }],
];

const s = FORMAT.safe;                       // 9x16: x 72..1008, y 250..1490
const RIGHT = s.x + s.w;                     // headlines are right-aligned (RTL)

// ------------------------------------------------------------------ helpers

// Words laid right-to-left, each springing up on its own beat; exitAt sends the line up and out.
function wordsRTL(ctx, u, words, y, size, starts, { colors = [], exitAt = null, weight = 800, family = DISPLAY, right = RIGHT, align = 'right' } = {}) {
  ctx.save();
  ctx.font = font(size, weight, family);
  ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const gap = size * 0.26;
  const ws = words.map((w) => ctx.measureText(w).width);
  const total = ws.reduce((a, b) => a + b, 0) + gap * (words.length - 1);
  let x = align === 'center' ? (W + total) / 2 : right;
  const ex = exitAt == null ? 0 : E.inBack(prog(u, exitAt, exitAt + 0.5), 1.6);
  words.forEach((w, i) => {
    const k = springU(u, starts[i], SPRING.bouncy);
    if (k > 0) {
      ctx.globalAlpha = clamp(k * 1.6);
      ctx.fillStyle = colors[i] || C.ink;
      const yy = y + (1 - k) * size * 0.85 - ex * (y + size);
      ctx.save(); ctx.translate(x - ws[i] / 2, yy); const sc = lerp(0.82, 1, clamp(k)); ctx.scale(sc, sc);
      ctx.fillText(w, 0, 0); ctx.restore();
    }
    x -= ws[i] + gap;
  });
  ctx.restore();
}

function sky(ctx, u) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#f6fbff'); g.addColorStop(0.55, C.sky); g.addColorStop(1, C.sky2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // soft clouds: seeded, drifting at three depths (the reference's sky, drawn, not copied)
  for (let i = 0; i < 9; i++) {
    const depth = 0.4 + hash01(i, 7) * 0.9;
    const x = ((hash01(i, 3) * (W + 600) + u * 9 * depth) % (W + 600)) - 300;
    const y = 180 + hash01(i, 5) * (H - 360);
    const r = 160 + hash01(i, 9) * 220 * depth;
    const cg = ctx.createRadialGradient(x, y, 0, x, y, r);
    cg.addColorStop(0, `rgba(255,255,255,${0.55 * depth})`); cg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(x, y, r * 1.6, r * 0.7, 0, 0, M.TAU); ctx.fill();
  }
}

function pill(ctx, label, x, y, size, { bg = C.ink, fg = '#fff', k = 1, center = false } = {}) {
  if (k <= 0) return;
  ctx.save();
  ctx.font = font(size, 800, UI); ctx.direction = 'rtl';
  const w = ctx.measureText(label).width + size * 1.4, h = size * 1.9;
  ctx.globalAlpha = clamp(k);
  ctx.translate(center ? x : x - w / 2, y); ctx.scale(lerp(0.85, 1, clamp(k)), lerp(0.85, 1, clamp(k)));
  rrect(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = bg; ctx.fill();
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 0, size * 0.06);
  ctx.restore();
}

// A phone drawn as a frame; the screen is always a real image.
function phone(ctx, cx, cy, w, img, { scale = 1, fy = 0, zoom = 1, label = '', progress = -1, shadow = true } = {}) {
  const h = w * 2.02, r = w * 0.13;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(scale, scale);
  if (shadow) { ctx.shadowColor = 'rgba(13,12,20,0.28)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 30; }
  rrect(ctx, -w / 2, -h / 2, w, h, r); ctx.fillStyle = C.ink; ctx.fill();
  ctx.shadowColor = 'transparent';
  const b = w * 0.035;
  if (img) cover(ctx, img, -w / 2 + b, -h / 2 + b, w - 2 * b, h - 2 * b, { fx: 0.5, fy, zoom, radius: r - b });
  rrect(ctx, -w * 0.16, -h / 2 + b * 1.6, w * 0.32, b * 2.2, b * 1.1); ctx.fillStyle = C.ink; ctx.fill();   // notch
  if (progress >= 0) {
    const pw = w - 2 * b - 60;
    rrect(ctx, -pw / 2, h / 2 - b - 40, pw, 8, 4); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
    rrect(ctx, pw / 2 - pw * progress, h / 2 - b - 40, pw * progress, 8, 4); ctx.fillStyle = '#fff'; ctx.fill();
  }
  if (label) {
    ctx.font = font(w * 0.07, 500, UI); ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    const lw = ctx.measureText(label).width;
    rrect(ctx, w / 2 - b - lw - 34, h / 2 - b - 120, lw + 24, w * 0.1, 12); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(label, w / 2 - b - 22, h / 2 - b - 120 + w * 0.072);
  }
  ctx.restore();
  return { w: w * scale, h: h * scale };
}

// The oval window (the reference's porthole, here holding the seller's frame).
function windowCard(ctx, img, x, y, w, k, squash = 0) {
  if (k <= 0) return;
  const h = w * 1.3;
  ctx.save(); ctx.translate(x, y); ctx.scale(k * (1 + squash), k * (1 - squash));
  ctx.shadowColor = 'rgba(13,12,20,0.25)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
  rrect(ctx, -w / 2 - 10, -h / 2 - 10, w + 20, h + 20, (w + 20) / 2); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.shadowColor = 'transparent';
  cover(ctx, img, -w / 2, -h / 2, w, h, { fx: 0.5, fy: 0.5, zoom: 1.15, radius: w / 2 });
  ctx.restore();
}

const bez = (p0, p1, p2, p3, t) => {
  const m = 1 - t;
  return [m * m * m * p0[0] + 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0] + t * t * t * p3[0],
          m * m * m * p0[1] + 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1] + t * t * t * p3[1]];
};
function drawPath(ctx, P, f, { width = 7, color = C.accent, dash = false, alpha = 1 } = {}) {
  if (f <= 0 || alpha <= 0) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
  if (dash) ctx.setLineDash([2, 18]);
  ctx.beginPath();
  const n = 90;
  for (let i = 0; i <= n * f; i++) { const p = bez(...P, i / n); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
  const e = bez(...P, f); ctx.lineTo(e[0], e[1]); ctx.stroke();
  ctx.setLineDash([]); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(e[0], e[1], width * 1.4, 0, M.TAU); ctx.fill();
  ctx.restore();
}

// The site's own logo (src/components/discover/PublicShell.jsx Logo): an ink square, radius 11/36,
// the link glyph's own SVG path in white, and the wordmark with its gradient "2".
const LINK = new Path2D('M9.5 14.5l5-5M8 11l-1.6 1.6a3.4 3.4 0 004.8 4.8L13 15.8M16 13l1.6-1.6a3.4 3.4 0 00-4.8-4.8L11 8.2');
function logoMark(ctx, cx, cy, size, rot = 0) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
  rrect(ctx, -size / 2, -size / 2, size, size, size * 11 / 36); ctx.fillStyle = C.ink; ctx.fill();
  const k = (size * 20 / 36) / 24;
  ctx.translate(-12 * k, -12 * k); ctx.scale(k, k);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.stroke(LINK);
  ctx.restore();
}
function wordmark(ctx, cx, y, size, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.font = font(size, 800, DISPLAY); ctx.direction = 'ltr'; ctx.textAlign = 'left';
  const a = ctx.measureText('LikeLink').width, b = ctx.measureText('2').width, x0 = cx - (a + b) / 2;
  ctx.fillStyle = C.ink; ctx.fillText('LikeLink', x0, y);
  const g = ctx.createLinearGradient(x0 + a, 0, x0 + a + b, 0);
  g.addColorStop(0, '#5b3df5'); g.addColorStop(0.55, '#c2185b'); g.addColorStop(1, '#d9480f');
  ctx.fillStyle = g; ctx.fillText('2', x0 + a, y);
  ctx.restore();
}

// ------------------------------------------------------------------ geometry
const A0 = [540, 1120];          // phone A, S1
const A1 = [250, 1240];          // phone A, S2+
const B = [800, 1150];           // phone B (the product page)
const STORE = [300, 1420];       // the store card
const WIN0 = [330, 760];         // the window after it lifts out
const PATH1 = [WIN0, [560, 640], [880, 760], [B[0], B[1] - 120]];
const PATH2 = [[B[0], B[1] + 60], [880, 1520], [560, 1560], [STORE[0] + 150, STORE[1]]];

// ------------------------------------------------------------------ the film
function draw(ctx, u, t, IMG) {
  sky(ctx, u);
  // a whip into the end card: both shots on screen, the scene leaving left as the card arrives
  const whip = E.inOutCubic(prog(u, 23.3, 24.1));
  if (whip < 1) { ctx.save(); ctx.translate(-W * whip, 0); scene(ctx, u, IMG); ctx.restore(); }
  if (whip > 0) { ctx.save(); ctx.translate(W * (1 - whip), 0); endCard(ctx, u, IMG); ctx.restore(); }
}

function scene(ctx, u, IMG) {
  const productShown = u > -0.5 && u < 24;
  if (productShown) pill(ctx, '#פרסומת · קישור שותפים', RIGHT, s.y + 10, 30, { k: springU(u, -0.4, SPRING.snappy) * (1 - prog(u, 23.6, 24)) });

  // ---- headlines
  if (u < 8.2) {
    wordsRTL(ctx, u, ['ראית', 'מוצר', 'בסרטון'], s.y + 210, 118, [0, 0.5, 1], { exitAt: 7.4 });
    wordsRTL(ctx, u, ['ולא', 'מצאת', 'אותו?'], s.y + 350, 118, [2, 2.5, 3], { exitAt: 7.5, colors: [C.ink, C.ink, C.accent] });
  }
  if (u >= 7.8 && u < 12.6) {
    wordsRTL(ctx, u, ['ב־LikeLink2'], s.y + 210, 118, [8], { exitAt: 11.9, colors: [C.accent] });
    wordsRTL(ctx, u, ['לכל', 'מוצר', 'מהסרטון'], s.y + 340, 96, [8.5, 9, 9.5], { exitAt: 12 });
  }
  if (u >= 12 && u < 17.6) {
    wordsRTL(ctx, u, ['יש', 'דף', 'משלו'], s.y + 220, 132, [12.5, 13, 13.5], { exitAt: 16.9, colors: [C.ink, C.ink, C.accent] });
  }
  if (u >= 17 && u < 24.1) {
    wordsRTL(ctx, u, ['וקישור'], s.y + 210, 118, [17.5], { exitAt: 23.5 });
    wordsRTL(ctx, u, ['ישר', 'לחנות'], s.y + 345, 118, [18, 18.5], { exitAt: 23.55, colors: [C.accent, C.accent] });
  }
  if (u >= 21 && u < 24.1) {
    wordsRTL(ctx, u, ['בלי', 'הרשמה.', 'בלי', 'תוספת', 'למחיר.'], s.y + 470, 62, [21.5, 21.7, 21.9, 22.1, 22.3], { exitAt: 23.4, weight: 500, family: UI, colors: Array(5).fill(C.mute) });
  }

  // ---- phone A: the seller's video frame
  const aIn = springU(u, -0.8, SPRING.gentle);
  const aMove = springU(u, 7.6, SPRING.gentle);
  const aOut = E.inCubic(prog(u, 16.6, 17.6));
  const ax = lerp(A0[0], A1[0], aMove) - aOut * 520, ay = lerp(A0[1] + 900 * (1 - aIn), A1[1], aMove);
  const aScale = lerp(1, 0.62, aMove);
  if (aOut < 1) {
    const lifted = prog(u, 7.5, 8.2);
    const nope = 0.05 * M.ring(u - 3, 3.2, 4);   // the phone shakes its head on "אותו?"
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(nope + 0.02 * Math.sin(u * 0.6) * (1 - aMove)); ctx.translate(-ax, -ay);
    phone(ctx, ax, ay, 440, IMG.tennis, { scale: aScale, fy: 0.5, zoom: lerp(1.0, 1.08, prog(u, -0.8, 7.5)), label: lifted < 0.5 ? 'מתוך סרטון המוכר' : '', progress: lifted < 1 ? clamp((u + 0.8) / 8.3) : -1 });
    ctx.restore();
  }

  // ---- the window: lifts out of phone A, rides PATH1 into phone B, then PATH2 to the store
  const lift = springU(u, 7.5, SPRING.bouncy);
  const ride1 = E.inOutCubic(prog(u, 12, 14));
  const ride2 = E.inOutCubic(prog(u, 17.2, 19.6));
  if (u >= 7.5) {
    drawPath(ctx, PATH1, E.outCubic(prog(u, 10, 12.4)), { dash: true, alpha: 1 - prog(u, 19.6, 20.6) });
    if (u >= 16.8) drawPath(ctx, PATH2, E.outCubic(prog(u, 16.8, 19.2)), { dash: true });
  }

  // ---- phone B: the real product page, rising on the right
  const bIn = springU(u, 11.6, SPRING.gentle);
  if (u > 11.4) {
    const dock = springU(u, 14, SPRING.wobbly);
    const pulse = 0.03 * wobble(u - 14, 2.2, 5);
    phone(ctx, B[0], B[1] + 900 * (1 - bIn), 360, IMG.page, { scale: 1 + pulse, fy: kf(u, [[12, 0], [17, 0.12], [22, 0.18]]), zoom: 1.0 });
    void dock;
  }

  // ---- the store card
  const cIn = springU(u, 20, SPRING.bouncy);
  if (u > 19.8) storeCard(ctx, STORE[0], STORE[1], cIn, IMG);

  // window on top of everything it travels over
  if (u >= 7.5 && u < 21.2 && !(u > 14.1 && u < 17.2)) {
    let p;
    if (u < 12) p = [lerp(ax, WIN0[0], clamp(lift)), lerp(ay - 60, WIN0[1], clamp(lift))];
    else if (u < 17.2) p = bez(...PATH1, ride1);
    else p = bez(...PATH2, ride2);
    const k = u < 17.2 ? clamp(lift) * (1 - E.inCubic(prog(u, 13.6, 14.1))) : E.outBack(prog(u, 17.2, 17.8), 1.4) * (1 - E.inCubic(prog(u, 19.6, 20.2)));
    const sq = 0.12 * wobble(u - 8, 2.4, 5) + 0.1 * wobble(u - 14, 2.4, 6);
    windowCard(ctx, IMG.tennis, p[0], p[1], 300, k, sq);
  }
}

function storeCard(ctx, x, y, k, IMG) {
  if (k <= 0) return;
  const w = 520, h = 230;
  ctx.save(); ctx.translate(x, y); ctx.scale(lerp(0.6, 1, k), lerp(0.6, 1, k)); ctx.globalAlpha = clamp(k * 1.4);
  ctx.shadowColor = 'rgba(13,12,20,0.22)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20;
  rrect(ctx, -w / 2, -h / 2, w, h, 36); ctx.fillStyle = C.paper; ctx.fill();
  ctx.shadowColor = 'transparent';
  cover(ctx, IMG.tennis, w / 2 - 20 - 190, -h / 2 + 20, 190, h - 40, { radius: 24, zoom: 1.2 });
  ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.fillStyle = C.ink;
  ctx.font = font(48, 800, DISPLAY); ctx.fillText('החנות', w / 2 - 240, -h / 2 + 88);
  ctx.fillText('המקורית', w / 2 - 240, -h / 2 + 146);
  ctx.font = font(26, 500, UI); ctx.fillStyle = C.accent; ctx.fillText('קישור שותפים', w / 2 - 240, -h / 2 + 196);
  ctx.restore();
}

function endCard(ctx, u, IMG) {
  const k = springU(u, 23.4, SPRING.bouncy);
  if (k > 0) logoMark(ctx, W / 2, s.y + 300, 220 * k, (1 - clamp(k)) * -0.5);
  const wm = springU(u, 23.7, SPRING.snappy);
  if (wm > 0) wordmark(ctx, W / 2, s.y + 520 + (1 - wm) * 40, 92, clamp(wm));
  wordsRTL(ctx, u, ['רואים', 'בסרטון,'], s.y + 760, 128, [24.1, 24.5], { align: 'center' });
  wordsRTL(ctx, u, ['קונים', 'בחנות.'], s.y + 910, 128, [24.9, 25.3], { align: 'center', colors: [C.accent, C.accent] });
  const url = springU(u, 26, SPRING.snappy);
  if (url > 0) pill(ctx, 'likelink2.vercel.app', W / 2, s.y + 1060, 44, { k: url, center: true });
  wordsRTL(ctx, u, ['יוצרת?', 'סטודיו', 'בחינם'], s.y + 1200, 56, [26.6, 26.75, 26.9], { align: 'center', weight: 500, family: UI, colors: [C.accent, C.ink, C.ink] });
}

M.film({
  fonts: [font(100, 800, DISPLAY), font(40, 500, UI)],
  images: { tennis: 'assets/photos/tennis.jpg', page: 'assets/shots/product.png' },
  hits: HITS,
  draw,
});
