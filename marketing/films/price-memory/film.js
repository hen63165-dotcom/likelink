// 11.11: המחיר באמת ירד? — a 16 s 9:16 reel in the Dark Tech Keynote style (Lemo-Opuscar), for LikeLink2.
// Every screen inside the phone is a real frame of the live /magic page after the price memory went live
// (magic-demo release, magic-clean.mp4, 2026-11-08 19:14 UTC): the paste screen, the store's answer, and the
// real "שמרנו בדפדפן שלך את המחיר של היום" box. The second check (11.11 itself) is NOT shown: it has not
// happened yet, so the film says it in words only. Pure function of time: window.render(t) paints frame t.
import { clamp, lerp, seg, eo, ei, eio, back, spring, TAU } from '../../core/lib.js';

const W = 1080, H = 1920, DUR = 16;
const ACC = '#8B7CFF';
const TXT = '#ECEEF4', DIM = '#8A90A0';
const cv = document.getElementById('c'), g = cv.getContext('2d');

const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
const font = (px, wt = 900) => `${wt} ${px}px H`;
const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2))); };

const IMG = {};
const names = ['s1.0', 's7.0', 's9.0'];
const load = (n) => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(IMG[n] = i); i.onerror = bad; i.src = `assets/${n}.jpg`; });

function stage() {
  g.fillStyle = '#0A0B0F'; g.fillRect(0, 0, W, H);
  let r = g.createRadialGradient(540, 420, 0, 540, 420, 1300);
  r.addColorStop(0, 'rgba(46,52,74,.62)'); r.addColorStop(1, 'rgba(10,11,15,0)'); g.fillStyle = r; g.fillRect(0, 0, W, H);
  r = g.createRadialGradient(860, 1500, 0, 860, 1500, 760);
  r.addColorStop(0, rgba(ACC, 0.07)); r.addColorStop(1, rgba(ACC, 0)); g.fillStyle = r; g.fillRect(0, 0, W, H);
  const m = 48;
  for (let i = 0; i <= W / m; i++) { g.fillStyle = `rgba(255,255,255,${i % 4 ? .028 : .055})`; g.fillRect(i * m + 12, 0, 1, H); }
  for (let j = 0; j <= H / m; j++) { g.fillStyle = `rgba(255,255,255,${j % 4 ? .028 : .055})`; g.fillRect(0, j * m, W, 1); }
}
function vignette() {
  const r = g.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.78);
  r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = r; g.fillRect(0, 0, W, H);
}

// the phone: a 1080×1920 real frame painted inside the screen
const PW = 820, PH = Math.round(PW * 16 / 9), BZ = 12, IW = PW - BZ * 2, IS = IW / 1080;
function phoneScreen(paint, x, y, o = {}) {
  const { sy = 1, sx = 1 } = o;
  g.save(); g.translate(x + PW / 2, y + PH / 2); g.scale(sx, sy); g.translate(-PW / 2, -PH / 2);
  g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 80; g.shadowOffsetY = 30;
  g.fillStyle = '#05060A'; rr(0, 0, PW, PH, 70); g.fill(); g.shadowColor = 'transparent';
  g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 2; rr(1, 1, PW - 2, PH - 2, 69); g.stroke();
  g.save(); rr(BZ, BZ, IW, PH - BZ * 2, 58); g.clip(); g.translate(BZ, BZ); g.scale(IS, IS); paint(); g.restore();
  g.restore();
}
const shot = (n, dx = 0, dy = 0, a = 1) => { g.save(); g.globalAlpha = a; g.drawImage(IMG[n], dx, dy, 1080, 1920); g.restore(); };

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
const life = (t, a, b) => (t < a || t > b) ? 0 : Math.min(seg(t, a, a + 0.18), 1 - seg(t, b - 0.14, b));
function dropWord(text, x, y, px, t0, t, color = TXT, align = 'center') {
  if (t < t0) return;
  const p = seg(t, t0, t0 + 0.24), e = back(p, 1.3);
  g.save(); g.font = font(px, 900); g.direction = 'rtl'; g.textAlign = align; g.globalAlpha = clamp(p * 3); g.fillStyle = color;
  if (color === ACC) { g.shadowColor = rgba(ACC, .55); g.shadowBlur = 34; }
  g.fillText(text, x, y - (1 - e) * 70); g.restore();
}

// the real "saved" box in s9.0 (measured on the frame): x, y, w, h
const SAVED = [83, 1337, 954, 179];
const BTN_Y = 977;   // "הדבקה ובדיקה" in s1.0
const PHONE_Y = 452;
const logZoom = (a, b, p) => a * Math.pow(b / a, p);
function withCam(z, fx, fy, cx, cy, py, draw) {
  g.save();
  const ax = (W - PW) / 2 + BZ + fx * IS, ay = py + BZ + fy * IS;
  const tx = lerp(ax, cx, (z - 1) / Math.max(1e-6, z)), ty = lerp(ay, cy, (z - 1) / Math.max(1e-6, z));
  g.translate(tx, ty); g.scale(z, z); g.translate(-ax, -ay); draw(); g.restore();
}

function screenAt(t) {
  if (t < 4.6) {
    shot('s1.0');
    if (t > 3.4 && t < 4.4) {   // the tap on "הדבקה ובדיקה"
      const p = seg(t, 3.5, 4.2);
      g.save(); g.strokeStyle = rgba(ACC, 1 - p); g.lineWidth = 10 * (1 - p) + 2; g.shadowColor = rgba(ACC, .8); g.shadowBlur = 30;
      rr(40 - p * 40, BTN_Y - 74 - p * 40, 1000 + p * 80, 148 + p * 80, 74 + p * 40); g.stroke(); g.restore();
    }
    if (t > 4.0) {               // the check runs: a light band sweeps the page
      const p = seg(t, 4.0, 4.6), yb = lerp(-300, 2200, eio(p));
      const b = g.createLinearGradient(0, yb - 260, 0, yb + 260);
      b.addColorStop(0, rgba(ACC, 0)); b.addColorStop(.5, rgba(ACC, .16)); b.addColorStop(1, rgba(ACC, 0));
      g.fillStyle = b; g.fillRect(0, 0, 1080, 1920);
    }
    return;
  }
  // the store's answer, then the page moves on to the saved box (a soft slide between the two real frames)
  const s = eio(seg(t, 6.3, 6.85));
  if (s < 1) shot('s7.0', 0, -s * 260, 1);
  if (s > 0) shot('s9.0', 0, (1 - s) * 260, s);
  if (t > 7.0) {               // the accent ring draws itself around the real box
    const p = seg(t, 7.0, 7.6), [x, y, w, h] = SAVED, len = 2 * (w + h) + 40;
    g.save(); g.strokeStyle = ACC; g.lineWidth = 8; g.lineCap = 'round'; g.shadowColor = rgba(ACC, .9); g.shadowBlur = 26;
    g.setLineDash([len * eo(p), len]); rr(x - 14, y - 12, w + 28, h + 24, 30); g.stroke(); g.restore();
  }
}

function render(t) {
  t = clamp(t, 0, DUR);
  g.setTransform(1, 0, 0, 1, 0, 0);
  stage();

  // 1 · hook (0–2.3 s)
  if (t < 2.3) {
    const lift = ei(seg(t, 1.85, 2.25)) * 520;
    g.save(); g.translate(0, -lift); g.globalAlpha = 1 - seg(t, 2.05, 2.25);
    dropWord('11.11', 540, 840, 250, -0.24, t, ACC);
    dropWord('המחיר', 540, 1040, 140, 0.5, t);
    dropWord('באמת ירד?', 540, 1200, 140, 0.9, t);
    g.restore();
  }

  // 2 · the phone (1.9–10.5 s)
  if (t >= 1.9 && t < 10.55) {
    const py = lerp(H + 40, PHONE_Y, back(seg(t, 1.9, 2.4), 1.3));
    let z = 1;
    const fx = 560, fy = 1426, cx = 540, cy = 1240;
    if (t >= 7.4 && t < 10) { z = logZoom(1, 1.3, eio(seg(t, 7.4, 8.4))); z = logZoom(z, 1, eio(seg(t, 9.4, 9.95))); }
    const off = seg(t, 10.0, 10.35), sy = off < 0.6 ? lerp(1, 0.012, ei(off / 0.6)) : 0.012, sx = off < 0.6 ? 1 : lerp(1, 0, eo((off - 0.6) / 0.4));
    withCam(z, fx, fy, cx, cy, py, () => phoneScreen(() => screenAt(t), (W - PW) / 2, py, { sx, sy }));
  }

  caption('בודקים את המחיר היום', life(t, 2.25, 4.45), 330);
  caption('כפתור הקסם בודק בחנות', life(t, 4.6, 6.75), 330, 58);
  caption('ושומר לך את המחיר', life(t, 6.9, 9.95), 330);

  // 3 · what happens next, in words only (the second check has not happened yet)
  if (t >= 10.45 && t < 13.1) {
    const out = ei(seg(t, 12.85, 13.05));
    g.save(); g.globalAlpha = 1 - out; g.translate(0, -out * 120);
    dropWord('ב־11.11', 540, 820, 190, 10.5, t, ACC);
    dropWord('בודקים שוב', 540, 1010, 120, 11.0, t);
    dropWord('ורואים אם באמת ירד.', 540, 1170, 96, 11.5, t);
    g.restore();
  }

  // 4 · end card: the comment keyword
  if (t >= 13.0) {
    const p = spring(t - 13.0, 8, 0.5), a = clamp(seg(t, 13.0, 13.25));
    g.save(); g.globalAlpha = a; g.direction = 'rtl'; g.textAlign = 'center';
    g.font = font(96, 900); g.fillStyle = TXT; g.fillText('רוצה את הכפתור?', 540, 760 + (1 - p) * 50);
    const bw = 700, bh = 190, bx = 190, by = 860 + (1 - p) * 70;
    g.shadowColor = rgba(ACC, .7); g.shadowBlur = 50; g.fillStyle = ACC; rr(bx, by, bw, bh, bh / 2); g.fill(); g.shadowColor = 'transparent';
    g.fillStyle = '#0A0B0F'; g.font = font(92, 900); g.textBaseline = 'middle'; g.fillText('כתבי ״קסם״', 540, by + bh / 2 + 4);
    g.textBaseline = 'alphabetic'; g.font = font(54, 700); g.fillStyle = DIM; g.fillText('ואשלח לך בהודעה פרטית', 540, 1160 + (1 - p) * 80);
    g.font = font(48, 700); g.fillStyle = TXT; g.fillText('חינם · בלי הרשמה', 540, 1260 + (1 - p) * 90);
    g.font = font(34, 700); g.fillStyle = 'rgba(138,144,160,.85)'; g.fillText('באתר יש קישורי שותפים', 540, 1700);
    g.restore();
  }
  vignette();
}

const EV = [
  { t: 0.0, type: 'impact' }, { t: 0.5, type: 'tap' }, { t: 0.9, type: 'tap' }, { t: 1.9, type: 'whoosh' }, { t: 2.25, type: 'pop' },
  { t: 3.5, type: 'click' }, { t: 4.0, type: 'shimmer' }, { t: 4.6, type: 'pop' }, { t: 6.3, type: 'whoosh' }, { t: 7.0, type: 'ding' },
  { t: 10.0, type: 'crtoff' }, { t: 10.5, type: 'stamp' }, { t: 11.0, type: 'stamp' }, { t: 11.5, type: 'stamp' }, { t: 13.0, type: 'swell' },
];
function TEXTS(t) {
  const out = []; const add = (id, text, a, b, box) => { if (t >= a && t <= b) out.push({ id, text, x0: box[0], y0: box[1], x1: box[2], y1: box[3] }); };
  add('hook', '11.11 המחיר באמת ירד?', 1.15, 1.85, [60, 600, 1020, 1240]);
  add('c1', 'בודקים את המחיר היום', 2.45, 4.3, [90, 250, 990, 410]);
  add('c2', 'כפתור הקסם בודק בחנות', 4.8, 6.6, [90, 250, 990, 410]);
  add('c3', 'ושומר לך את המחיר', 7.1, 9.8, [120, 250, 960, 410]);
  add('next', 'ב־11.11 בודקים שוב ורואים אם באמת ירד.', 11.75, 12.85, [60, 620, 1020, 1200]);
  add('end', 'רוצה את הכפתור? כתבי קסם', 13.25, 16, [100, 660, 980, 1290]);
  return out;
}
Object.assign(window, { render, DUR, EV, TEXTS });
await Promise.all([document.fonts.load('900 60px H', 'אבג'), document.fonts.load('700 40px H', 'אבג'), document.fonts.load('900 60px H', '11.11'), ...names.map(load)]);
render(+(new URLSearchParams(location.search).get('t') || 0));
window.READY = true;
