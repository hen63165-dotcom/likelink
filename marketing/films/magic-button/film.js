// כפתור הקסם — a 20 s 9:16 reel in the Dark Tech Keynote style (Lemo-Opuscar), for LikeLink2.
// Every screen inside the phone is a real frame of the live /magic page (magic-demo recording, 2026-11-07).
// Pure function of time: window.render(t) paints frame t; no state carried between frames.
import { clamp, lerp, seg, ss, eo, ei, eio, back, spring, TAU } from '../../core/lib.js';

const W = 1080, H = 1920, DUR = 20;
const ACC = '#8B7CFF';            // the one accent (echoes the site's own focus ring)
const WARN = '#FFB020';           // the problem colour: only on the "brand name" line
const TXT = '#ECEEF4', DIM = '#8A90A0';
const cv = document.getElementById('c'), g = cv.getContext('2d');

const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
const font = (px, wt = 900) => `${wt} ${px}px H`;
const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2))); };

// ── assets ────────────────────────────────────────────────────────────────
const IMG = {};
const names = ['s1.0', 's5.2', 's6.3', 's10.5', 's17.5', 's20.5'];
const load = (n) => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(IMG[n] = i); i.onerror = bad; i.src = `assets/${n}.jpg`; });

// ── stage ─────────────────────────────────────────────────────────────────
function stage(camY = 0) {
  g.fillStyle = '#0A0B0F'; g.fillRect(0, 0, W, H);
  let r = g.createRadialGradient(540, 420, 0, 540, 420, 1300);
  r.addColorStop(0, 'rgba(46,52,74,.62)'); r.addColorStop(1, 'rgba(10,11,15,0)');
  g.fillStyle = r; g.fillRect(0, 0, W, H);
  r = g.createRadialGradient(860, 1500, 0, 860, 1500, 760);
  r.addColorStop(0, rgba(ACC, 0.07)); r.addColorStop(1, rgba(ACC, 0));
  g.fillStyle = r; g.fillRect(0, 0, W, H);
  // hairline grid on a 48 px module (moves only with the camera)
  const m = 48, oy = ((camY % (m * 4)) + m * 4) % (m * 4);
  for (let i = 0; i <= W / m; i++) { g.fillStyle = `rgba(255,255,255,${i % 4 ? .028 : .055})`; g.fillRect(i * m + 12, 0, 1, H); }
  for (let j = -4; j <= H / m + 4; j++) { const y = j * m + oy; g.fillStyle = `rgba(255,255,255,${(j % 4 + 4) % 4 ? .028 : .055})`; g.fillRect(0, y, W, 1); }
}
function vignette() {
  const r = g.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.78);
  r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, 'rgba(0,0,0,.55)');
  g.fillStyle = r; g.fillRect(0, 0, W, H);
}

// ── the phone ─────────────────────────────────────────────────────────────
const PW = 820, PH = Math.round(PW * 16 / 9), BZ = 12;          // body 760×1351, bezel 12
const IW = PW - BZ * 2, IS = IW / 1080;                          // screen width, image scale
function phoneScreen(paint, x, y, o = {}) {
  const { alpha = 1, sy = 1, sx = 1 } = o;
  g.save(); g.globalAlpha = alpha;
  g.translate(x + PW / 2, y + PH / 2); g.scale(sx, sy); g.translate(-PW / 2, -PH / 2);
  g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 80; g.shadowOffsetY = 30;
  g.fillStyle = '#05060A'; rr(0, 0, PW, PH, 70); g.fill(); g.shadowColor = 'transparent';
  g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 2; rr(1, 1, PW - 2, PH - 2, 69); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1; rr(4, 4, PW - 8, PH - 8, 66); g.stroke();
  g.save(); rr(BZ, BZ, IW, PH - BZ * 2, 58); g.clip();
  g.translate(BZ, BZ); g.scale(IS, IS);   // screen space = the real 1080×1920 frame
  paint();
  g.restore(); g.restore();
}
const shot = (n, dx = 0, dy = 0) => g.drawImage(IMG[n], dx, dy, 1080, 1920);

// ── captions (a UI component: dark pill, 1 px border, accent dot on the reading side) ──
function caption(text, a, y = 300, px = 60) {
  if (a <= 0) return;
  g.save(); g.font = font(px, 900); g.direction = 'rtl';
  const tw = g.measureText(text).width, h = px * 1.85, w = tw + px * 2.2, x = W / 2 - w / 2, yy = y - h / 2 + (1 - eo(a)) * 14;
  g.globalAlpha = eo(a);
  g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 40; g.shadowOffsetY = 10;
  g.fillStyle = 'rgba(14,16,22,.86)'; rr(x, yy, w, h, h / 2); g.fill(); g.shadowColor = 'transparent';
  g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1.5; rr(x + .5, yy + .5, w - 1, h - 1, h / 2); g.stroke();
  g.fillStyle = ACC; g.shadowColor = rgba(ACC, .9); g.shadowBlur = 14; g.beginPath(); g.arc(x + w - px * 0.62, yy + h / 2, px * 0.13, 0, TAU); g.fill(); g.shadowColor = 'transparent';
  g.fillStyle = TXT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, W / 2 - px * 0.18, yy + h / 2 + 2);
  g.restore();
}
// a caption's life: rises in at a, retracts at b
const life = (t, a, b) => (t < a || t > b) ? 0 : Math.min(seg(t, a, a + 0.18), 1 - seg(t, b - 0.14, b));

// big type that drops onto its line on a beat (fast-out with one small overshoot)
function dropWord(text, x, y, px, t0, t, color = TXT, align = 'right') {
  if (t < t0) return 0;
  const p = seg(t, t0, t0 + 0.24), e = back(p, 1.3);
  g.save(); g.font = font(px, 900); g.direction = 'rtl'; g.textAlign = align; g.textBaseline = 'alphabetic';
  g.globalAlpha = clamp(p * 3);
  g.fillStyle = color;
  if (color === ACC) { g.shadowColor = rgba(ACC, .55); g.shadowBlur = 30; }
  g.fillText(text, x, y - (1 - e) * 70);
  g.restore();
  g.font = font(px, 900); return g.measureText(text + ' ').width;
}

// ── timeline ──────────────────────────────────────────────────────────────
// beat = 0.5 s (120 bpm). Sections: hook 0–2, tool 2–4, paste 4–7, price 7–10, checks 10–13, no link 13–16, free 16–18, end 18–20.
const PHONE_Y = 452;                 // resting top of the phone
const BTN = [540, 980];              // "הדבקה ובדיקה" in the real frame
const PRICE = [770, 1584, 236, 84];  // ₪5.19 box in s6.3 (x, y, w, h)
const NOTES = [[620, 92, ACC], [790, 182, WARN], [1036, 246, ACC]];   // s10.5 lines (y, h, colour)
const FIELD = [330, 836, 716, 156];  // the query field in s17.5

function phoneY(t) {               // rises into frame at 1.9 s, collapses at 16 s
  if (t < 1.9) return H + 40;
  return lerp(H + 40, PHONE_Y, back(seg(t, 1.9, 2.4), 1.3));
}
// camera onto the phone: zoom z around a point of the real frame (fx, fy) that lands at (cx, cy) on canvas
function withCam(z, fx, fy, cx, cy, py, draw) {
  g.save();
  const ax = (W - PW) / 2 + BZ + fx * IS, ay = py + BZ + fy * IS;   // the point on canvas at zoom 1
  const tx = lerp(ax, cx, (z - 1) / Math.max(1e-6, z)), ty = lerp(ay, cy, (z - 1) / Math.max(1e-6, z));
  g.translate(tx, ty); g.scale(z, z); g.translate(-ax, -ay);
  draw(); g.restore();
}
const logZoom = (a, b, p) => a * Math.pow(b / a, p);

function screenAt(t) {   // what the phone shows, in screen space (1080×1920 real frame)
  if (t < 7) {
    shot('s1.0');
    // the tap: accent ring from the button on beat 11 (5.5 s), the button dips
    if (t > 5.4 && t < 6.4) {
      const p = seg(t, 5.5, 6.2);
      g.save(); g.strokeStyle = rgba(ACC, 1 - p); g.lineWidth = 10 * (1 - p) + 2;
      g.shadowColor = rgba(ACC, .8); g.shadowBlur = 30;
      rr(40 - p * 40, 906 - p * 40, 1000 + p * 80, 148 + p * 80, 74 + p * 40); g.stroke(); g.restore();
    }
    // the check runs: a soft light band sweeps the page (6.0–6.9)
    if (t > 6.0 && t < 7) {
      const p = seg(t, 6.0, 6.9), yb = lerp(-300, 2200, eio(p));
      const b = g.createLinearGradient(0, yb - 260, 0, yb + 260);
      b.addColorStop(0, rgba(ACC, 0)); b.addColorStop(.5, rgba(ACC, .16)); b.addColorStop(1, rgba(ACC, 0));
      g.fillStyle = b; g.fillRect(0, 0, 1080, 1920);
    }
    return;
  }
  if (t < 10) {   // the result, then it scrolls up into the notes
    const s = eio(seg(t, 9.75, 10.15));
    shot('s6.3', 0, -s * 1920); if (s > 0) shot('s10.5', 0, 1920 - s * 1920);
    // accent ring drawing around the real price on beat 16 (8.0 s)
    const p = seg(t, 8.0, 8.5);
    if (p > 0 && s < 1) {
      const [x, y, w, h] = PRICE, len = 2 * (w + h) + 40;
      g.save(); g.translate(0, -s * 1920);
      g.strokeStyle = ACC; g.lineWidth = 7; g.lineCap = 'round'; g.shadowColor = rgba(ACC, .9); g.shadowBlur = 24;
      g.setLineDash([len * eo(p), len]); rr(x - 18, y - 12, w + 36, h + 24, 28); g.stroke(); g.restore();
    }
    return;
  }
  if (t < 13.5) {   // the checks: three lines light up, the brand line in the problem colour
    const wx = eio(seg(t, 13.0, 13.4));
    g.save(); g.translate(-wx * 1080 * -1, 0);
    shot('s10.5');
    NOTES.forEach(([y, h, c], i) => {
      const on = seg(t, 10.0 + i, 10.25 + i);
      if (on <= 0) return;
      g.fillStyle = rgba(c, 0.14 * on); rr(70, y, 950, h, 22); g.fill();
      g.fillStyle = rgba(c, on); rr(1020, y + 6, 8, (h - 12) * eo(on), 4); g.fill();
    });
    g.restore();
    if (wx > 0) { g.save(); g.translate(wx * 1080 - 1080, 0); shot('s17.5'); g.restore(); }
    return;
  }
  if (t < 16) {
    const s = eio(seg(t, 14.75, 15.1));
    shot('s17.5', 0, -s * 1920);
    // the query field breathes in the accent while the words are typed
    if (s < 1) {
      const p = 0.5 + 0.5 * Math.sin((t - 13.5) * TAU * 1.2);
      const [x, y, w, h] = FIELD;
      g.save(); g.translate(0, -s * 1920); g.strokeStyle = rgba(ACC, 0.35 + 0.45 * p); g.lineWidth = 8;
      g.shadowColor = rgba(ACC, .8); g.shadowBlur = 20 + 20 * p; rr(x - 6, y - 6, w + 12, h + 12, h / 2 + 6); g.stroke(); g.restore();
    }
    if (s > 0) { const k = 1 + 0.04 * (1 - spring(t - 15.1, 9, 0.45)); g.save(); g.translate(540, 1920 - s * 1920 + 960); g.scale(k, k); g.translate(-540, -960); shot('s20.5'); g.restore(); }
    return;
  }
  shot('s20.5');
}

function render(t) {
  t = clamp(t, 0, DUR);
  g.setTransform(1, 0, 0, 1, 0, 0);
  stage();

  // 1 · hook (0–2 s): words drop on the beat; the block lifts away as the phone rises into it
  if (t < 2.3) {
    const lift = ei(seg(t, 1.85, 2.25)) * 520;
    g.save(); g.translate(0, -lift); g.globalAlpha = 1 - seg(t, 2.05, 2.25);
    let x = 990;
    x -= dropWord('ראית', x, 820, 116, -0.24, t);
    x -= dropWord('מוצר', x, 820, 116, 0.25, t);
    dropWord('באלי?', x, 820, 116, 0.5, t);
    dropWord('רגע לפני', 990, 990, 132, 1.0, t, ACC);
    dropWord('שקונים.', 990, 1150, 132, 1.25, t, ACC);
    g.restore();
  }

  // the phone (2–16 s)
  if (t >= 1.9 && t < 16.4) {
    const py = phoneY(t);
    // camera: push-in to the button (4–5 s), hold, pull back (6–6.6), a small push to the price (7.6–9)
    let z = 1, fx = 540, fy = 980, cx = 540, cy = 1060;
    if (t >= 4 && t < 6.6) { z = logZoom(1, 1.9, eio(seg(t, 4.0, 5.0))); z = logZoom(z, 1, eio(seg(t, 6.05, 6.6))); }
    if (t >= 7.4 && t < 10) { z = logZoom(1, 1.32, eio(seg(t, 7.4, 8.4))); z = logZoom(z, 1, eio(seg(t, 9.4, 9.9))); fx = 888; fy = 1626; cx = 640; cy = 1260; }
    // collapse at 16 s: squash to a line, then to a point (a screen switching off)
    const off = seg(t, 16.0, 16.35), sy = off < 0.6 ? lerp(1, 0.012, ei(off / 0.6)) : 0.012, sx = off < 0.6 ? 1 : lerp(1, 0, eo((off - 0.6) / 0.4));
    withCam(z, fx, fy, cx, cy, py, () => phoneScreen(() => screenAt(t), (W - PW) / 2, py, { sx, sy }));
  }

  // captions (upper third, kept inside the profile grid's 3:4 crop)
  caption('כפתור הקסם בודק לך', life(t, 2.25, 3.95), 330);
  caption('מדביקים קישור', life(t, 4.15, 6.9), 330);
  caption('המחיר בחנות עכשיו', life(t, 7.1, 9.85), 330);
  caption('מה לבדוק לפני שמזמינים', life(t, 10.05, 11.45), 330);
  caption('שם של מותג? כנראה חיקוי', life(t, 11.5, 12.95), 330, 56);
  caption('אין קישור? כותבים בעברית', life(t, 13.4, 15.95), 330, 56);

  // 7 · free (16–18 s): two lines stamp in on the beat
  if (t >= 16.2 && t < 18.1) {
    const out = ei(seg(t, 17.85, 18.05));
    g.save(); g.globalAlpha = 1 - out; g.translate(0, -out * 120);
    dropWord('חינם.', 540, 900, 170, 16.3, t, TXT, 'center');
    dropWord('בלי הרשמה.', 540, 1110, 150, 17.0, t, ACC, 'center');
    g.restore();
  }

  // 8 · end card (18–20 s)
  if (t >= 18.0) {
    const p = spring(t - 18.0, 8, 0.5), a = clamp(seg(t, 18.0, 18.25));
    g.save(); g.globalAlpha = a; g.direction = 'rtl'; g.textAlign = 'center';
    g.font = font(150, 900); g.fillStyle = TXT; g.fillText('כפתור הקסם', 540, 900 + (1 - p) * 60);
    g.font = font(54, 700); g.fillStyle = ACC; g.shadowColor = rgba(ACC, .6); g.shadowBlur = 24;
    g.direction = 'ltr'; g.fillText('likelink2.vercel.app/magic', 540, 1040 + (1 - p) * 80); g.shadowColor = 'transparent';
    g.direction = 'rtl'; g.font = font(44, 700); g.fillStyle = DIM;
    g.fillText('מדביקים קישור · רואים לפני שקונים', 540, 1140 + (1 - p) * 90);
    g.font = font(34, 700); g.fillStyle = 'rgba(138,144,160,.85)'; g.fillText('באתר יש קישורי שותפים', 540, 1700);
    g.restore();
  }
  vignette();
}

// sound and cue events (the mix reads the same list)
const EV = [
  { t: 0.0, type: 'impact' }, { t: 0.25, type: 'tick' }, { t: 0.5, type: 'tick' }, { t: 1.0, type: 'tap' }, { t: 1.25, type: 'tap' },
  { t: 1.9, type: 'whoosh' }, { t: 2.25, type: 'pop' }, { t: 4.0, type: 'rise' }, { t: 5.5, type: 'click' }, { t: 6.0, type: 'shimmer' },
  { t: 7.0, type: 'pop' }, { t: 8.0, type: 'ding' }, { t: 9.75, type: 'whoosh' }, { t: 10.0, type: 'glass' }, { t: 11.0, type: 'warn' },
  { t: 12.0, type: 'glass' }, { t: 13.0, type: 'whoosh' }, { t: 14.75, type: 'whoosh' }, { t: 15.1, type: 'thump' },
  { t: 16.0, type: 'crtoff' }, { t: 16.3, type: 'stamp' }, { t: 17.0, type: 'stamp' }, { t: 18.0, type: 'swell' },
];

function TEXTS(t) {
  const out = [];
  const add = (id, text, a, b, box) => { if (t >= a && t <= b) out.push({ id, text, x0: box[0], y0: box[1], x1: box[2], y1: box[3] }); };
  add('hook', 'ראית מוצר באלי? רגע לפני שקונים.', 0.75, 1.85, [60, 680, 1020, 1180]);
  add('c1', 'כפתור הקסם בודק לך', 2.45, 3.8, [120, 250, 960, 410]);
  add('c2', 'מדביקים קישור', 4.35, 6.75, [200, 250, 880, 410]);
  add('c3', 'המחיר בחנות עכשיו', 7.3, 9.7, [150, 250, 930, 410]);
  add('c4', 'מה לבדוק לפני שמזמינים', 10.25, 11.3, [90, 250, 990, 410]);
  add('c5', 'שם של מותג? כנראה חיקוי', 11.7, 12.8, [90, 250, 990, 410]);
  add('c6', 'אין קישור? כותבים בעברית', 13.6, 15.8, [90, 250, 990, 410]);
  add('free', 'חינם. בלי הרשמה.', 17.25, 17.85, [100, 720, 980, 1160]);
  add('end', 'כפתור הקסם likelink2.vercel.app/magic', 18.3, 20, [60, 760, 1020, 1160]);
  return out;
}

Object.assign(window, { render, DUR, EV, TEXTS });
await Promise.all([document.fonts.load('900 60px H', 'אבג'), document.fonts.load('700 40px H', 'אבג abc'), document.fonts.load('900 60px H', 'abc'), ...names.map(load)]);
render(+(new URLSearchParams(location.search).get('t') || 0));
window.READY = true;
