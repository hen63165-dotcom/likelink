// סטודיו חינמי — a 20 s 9:16 reel in the Dark Tech Keynote style (Lemo-Opuscar), for LikeLink2's creators.
// The phone shows the real /join and /studio pages (captured from the site's own build, 2026-11-08).
// Ends on the comment keyword "סטודיו" (the AutoDM sends the /join link). Pure function of time.
import { clamp, lerp, seg, eo, ei, eio, back, spring, TAU } from '../../core/lib.js';

const W = 1080, H = 1920, DUR = 20;
const ACC = '#8B7CFF', TXT = '#ECEEF4', DIM = '#8A90A0';
const cv = document.getElementById('c'), g = cv.getContext('2d');
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
const font = (px, wt = 900) => `${wt} ${px}px H`;
const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2))); };

const IMG = {};
const load = (n, f) => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(IMG[n] = i); i.onerror = bad; i.src = `assets/${f}`; });

function stage() {
  g.fillStyle = '#0A0B0F'; g.fillRect(0, 0, W, H);
  let r = g.createRadialGradient(540, 420, 0, 540, 420, 1300);
  r.addColorStop(0, 'rgba(46,52,74,.62)'); r.addColorStop(1, 'rgba(10,11,15,0)'); g.fillStyle = r; g.fillRect(0, 0, W, H);
  r = g.createRadialGradient(240, 1500, 0, 240, 1500, 760);
  r.addColorStop(0, rgba(ACC, 0.07)); r.addColorStop(1, rgba(ACC, 0)); g.fillStyle = r; g.fillRect(0, 0, W, H);
  const m = 48;
  for (let i = 0; i <= W / m; i++) { g.fillStyle = `rgba(255,255,255,${i % 4 ? .028 : .055})`; g.fillRect(i * m + 12, 0, 1, H); }
  for (let j = 0; j <= H / m; j++) { g.fillStyle = `rgba(255,255,255,${j % 4 ? .028 : .055})`; g.fillRect(0, j * m, W, 1); }
}
function vignette() {
  const r = g.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.78);
  r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = r; g.fillRect(0, 0, W, H);
}

const PW = 820, PH = Math.round(PW * 16 / 9), BZ = 12, IW = PW - BZ * 2, IS = IW / 1080;
function phone(paint, x, y, o = {}) {
  const { sx = 1, sy = 1 } = o;
  g.save(); g.translate(x + PW / 2, y + PH / 2); g.scale(sx, sy); g.translate(-PW / 2, -PH / 2);
  g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 80; g.shadowOffsetY = 30;
  g.fillStyle = '#05060A'; rr(0, 0, PW, PH, 70); g.fill(); g.shadowColor = 'transparent';
  g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 2; rr(1, 1, PW - 2, PH - 2, 69); g.stroke();
  g.save(); rr(BZ, BZ, IW, PH - BZ * 2, 58); g.clip(); g.translate(BZ, BZ); g.scale(IS, IS); paint(); g.restore();
  g.restore();
}
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


// shots inside the phone: [from, image, caption]; each enters by sliding up over the last (a scroll)
const SHOTS = [
  [1.9, 'join-0', 'סטודיו חינמי ליוצרות'],
  [4.5, 'studio-0', 'מדביקים קישור למוצר'],
  [7.5, 'studio-600', 'קישור אחד בביו, כל ההמלצות בפנים'],
  [10.5, 'join-600', 'עד 5 מוצרים בחינם'],
  [13.5, 'studio-1200', 'פותחים בדקה, בלי כרטיס אשראי'],
];
const HL = { 'join-600': [[1100, 120, 10.9], [1340, 120, 11.6]], 'studio-600': [[1225, 300, 8.0]] };
function screen(t) {
  let k = 0; for (let i = 0; i < SHOTS.length; i++) if (t >= SHOTS[i][0]) k = i;
  const [t0, img] = SHOTS[k];
  const enter = k === 0 ? 1 : eio(seg(t, t0, t0 + 0.35));
  if (k > 0 && enter < 1) g.drawImage(IMG[SHOTS[k - 1][1]], 0, -enter * 1920);
  // a slow push into the hero of the studio page
  const z = img === 'studio-0' ? 1 + 0.18 * eio(seg(t, t0 + 0.6, t0 + 2.4)) : 1;
  g.save(); g.translate(0, (1 - enter) * 1920); g.translate(540, 700); g.scale(z, z); g.translate(-540, -700);
  g.drawImage(IMG[img], 0, 0);
  for (const [y, h, at] of (HL[img] || [])) {
    const on = seg(t, at, at + 0.3);
    if (on <= 0) continue;
    g.fillStyle = rgba(ACC, 0.16 * on); rr(30, y, 1020, h, 30); g.fill();
    g.fillStyle = rgba(ACC, on); rr(1040, y + 10, 10, (h - 20) * eo(on), 5); g.fill();
  }
  g.restore();
}

const PHONE_Y = 452;
function render(t) {
  t = clamp(t, 0, DUR);
  g.setTransform(1, 0, 0, 1, 0, 0);
  stage();
  if (t < 2.3) {
    const lift = ei(seg(t, 1.85, 2.25)) * 520;
    g.save(); g.translate(0, -lift); g.globalAlpha = 1 - seg(t, 2.05, 2.25);
    dropWord('יש לך המלצות', 540, 830, 124, -0.24, t);
    dropWord('שאת שולחת', 540, 990, 124, 0.5, t, ACC);
    dropWord('לחברות?', 540, 1140, 124, 0.75, t, ACC);
    g.restore();
  }
  if (t >= 1.9 && t < 16.4) {
    const py = lerp(H + 40, PHONE_Y, back(seg(t, 1.9, 2.4), 1.3));
    const off = seg(t, 16.0, 16.35), sy = off < 0.6 ? lerp(1, 0.012, ei(off / 0.6)) : 0.012, sx = off < 0.6 ? 1 : lerp(1, 0, eo((off - 0.6) / 0.4));
    phone(() => screen(t), (W - PW) / 2, py, { sx, sy });
  }
  SHOTS.forEach(([t0, , text], i) => caption(text, life(t, i === 0 ? 2.25 : t0 + 0.2, i === SHOTS.length - 1 ? 15.9 : SHOTS[i + 1][0] + 0.1), 330, text.length > 24 ? 50 : 58));
  if (t >= 16.2 && t < 17.1) {
    g.save(); g.globalAlpha = 1 - seg(t, 16.9, 17.05);
    dropWord('חינם.', 540, 960, 190, 16.3, t);
    g.restore();
  }
  if (t >= 17.0) {
    const p = spring(t - 17.0, 8, 0.5), a = clamp(seg(t, 17.0, 17.25));
    g.save(); g.globalAlpha = a; g.direction = 'rtl'; g.textAlign = 'center';
    g.font = font(92, 900); g.fillStyle = TXT; g.fillText('רוצה סטודיו משלך?', 540, 760 + (1 - p) * 50);
    const bw = 760, bh = 190, bx = 160, by = 860 + (1 - p) * 70;
    g.shadowColor = rgba(ACC, .7); g.shadowBlur = 50; g.fillStyle = ACC; rr(bx, by, bw, bh, bh / 2); g.fill(); g.shadowColor = 'transparent';
    g.fillStyle = '#0A0B0F'; g.font = font(92, 900); g.textBaseline = 'middle'; g.fillText('כתבי ״סטודיו״', 540, by + bh / 2 + 4);
    g.textBaseline = 'alphabetic'; g.font = font(54, 700); g.fillStyle = DIM; g.fillText('ואשלח לך את הקישור בפרטי', 540, 1160 + (1 - p) * 80);
    g.font = font(34, 700); g.fillStyle = 'rgba(138,144,160,.85)'; g.fillText('LikeLink2 · באתר יש קישורי שותפים', 540, 1700);
    g.restore();
  }
  vignette();
}

const EV = [
  { t: 0.0, type: 'impact' }, { t: 0.5, type: 'tap' }, { t: 0.75, type: 'tap' }, { t: 1.9, type: 'whoosh' }, { t: 2.25, type: 'pop' },
  ...SHOTS.slice(1).flatMap(([t0]) => [{ t: t0, type: 'whoosh' }, { t: t0 + 0.35, type: 'glass' }]),
  { t: 8.0, type: 'pop' }, { t: 10.9, type: 'glass' }, { t: 11.6, type: 'glass' },
  { t: 16.0, type: 'crtoff' }, { t: 16.3, type: 'stamp' }, { t: 17.0, type: 'swell' },
];
function TEXTS(t) {
  const out = []; const add = (id, text, a, b, box) => { if (t >= a && t <= b) out.push({ id, text, x0: box[0], y0: box[1], x1: box[2], y1: box[3] }); };
  add('hook', 'יש לך המלצות שאת שולחת לחברות?', 0.95, 1.85, [60, 680, 1020, 1180]);
  SHOTS.forEach(([t0, , text], i) => add(`s${i}`, text, (i === 0 ? 2.25 : t0 + 0.2) + 0.18, (i === SHOTS.length - 1 ? 15.9 : SHOTS[i + 1][0]), [60, 250, 1020, 410]));
  add('end', 'רוצה סטודיו משלך? כתבי סטודיו', 17.25, 20, [100, 660, 980, 1200]);
  return out;
}
Object.assign(window, { render, DUR, EV, TEXTS });
await Promise.all([document.fonts.load('900 60px H', 'אבג'), document.fonts.load('700 40px H', 'אבג LikeLink2'), ...['join-0', 'join-600', 'studio-0', 'studio-600', 'studio-1200'].map((n) => load(n, n + '.jpg'))]);
render(+(new URLSearchParams(location.search).get('t') || 0));
window.READY = true;
