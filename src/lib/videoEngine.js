/**
 * Likelink Video Engine 🎬
 * ---------------------------------------------------------------
 * מנוע סרטונים אמיתי שרץ לגמרי בדפדפן — בלי API חיצוני, בלי קרדיטים,
 * בלי עלות לוידאו. בדיוק ה"קוד ללא קוד": היוצרת נותנת מוצר + טקסט,
 * והמנוע בונה קליפ 9:16 מוכן לרילס/סטורי.
 *
 * טכנולוגיה: Canvas + captureStream() + MediaRecorder → קובץ WebM.
 *  - אפקט Ken Burns (זום עדין) על תמונת המוצר
 *  - טלאי מותג + שם חנות + הוק שיווקי + מחיר + כפתור CTA
 *  - רקע בסגנון לייקלינק: פחם / קרם לוקסוס / זהב
 *  - תמיכה מלאה בעברית (ctx.direction = 'rtl')
 */

export const REEL = {
  w: 720,
  h: 1280, // 9:16
  perImageMs: 3200,
};

// גופנים עם תמיכת עברית
const FONT = "-apple-system, 'Segoe UI', 'Heebo', 'Assistant', 'Roboto', system-ui, sans-serif";

/** פלטות צבע — אותן פלטות של מערכת העיצוב של לייקלינק (לוקסוס/פחם/זהב) */
export const PALETTES = {
  dark: {
    bgA: "#211C16", bgB: "#0A0A0A",
    text: "#FFF8EC", accent: "#B78F4F", accentDeep: "#8A6A2F",
    accentText: "#1A140B",
    glow: "rgba(183,143,79,0.35)",
  },
  cream: {
    bgA: "#F7F3EA", bgB: "#EDE3CE",
    text: "#211C16", accent: "#9C7437", accentDeep: "#7A5A2C",
    accentText: "#FFF8EC",
    glow: "rgba(156,116,55,0.28)",
  },
  gold: {
    bgA: "#241404", bgB: "#0E0A04",
    text: "#FFF4DC", accent: "#D4A94E", accentDeep: "#A9822F",
    accentText: "#241404",
    glow: "rgba(212,169,78,0.4)",
  },
};

/** בדיקה שהדפדפן תומך בהקלטת וידאו (Canvas captureStream + MediaRecorder) */
export function canRecordVideo() {
  if (typeof window === "undefined") return false;
  if (typeof MediaRecorder === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return typeof c.captureStream === "function";
  } catch {
    return false;
  }
}

/** בוחר את ה-mime type הכי איכותי שנתמך */
export function pickRecorderMime() {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  for (const m of candidates) {
    try {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) return m;
    } catch { /* נמשיך */ }
  }
  return "";
}

/**
 * טוען תמונה ל-canvas בבטחה (crossOrigin) — אם האתר החיצוני לא מאפשר
 * CORS חוזרים null והמנוע גולש לכרטיס גרדיאנט + טקסט אלגנטי.
 */
function loadImageSafe(src) {
  return new Promise((resolve) => {
    if (!src || typeof Image === "undefined") return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = setTimeout(() => resolve(null), 4000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    try {
      img.src = src;
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/** מלבן עם פינות מעוגלות */
function roundedRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** רקע: גרדיאנט עמוק + זוהר עדין בצבע המותג */
function drawBackground(ctx, W, H, pal) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, pal.bgA);
  g.addColorStop(1, pal.bgB);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const rg = ctx.createRadialGradient(W / 2, H * 0.42, 40, W / 2, H * 0.42, W * 0.72);
  rg.addColorStop(0, pal.glow);
  rg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);
}

/** תמונה בסגנון cover + Ken Burns (זום עדין לאורך הפריים) */
function drawImageSeg(ctx, img, t, W, H) {
  const iw = img.naturalWidth || 600;
  const ih = img.naturalHeight || 800;
  const cover = Math.max(W / iw, H / ih);
  let dw = iw * cover;
  let dh = ih * cover;
  const zoom = 1 + t * 0.14; // זום 1 → 1.14
  dw *= zoom;
  dh *= zoom;
  const sx = (W - dw) / 2;
  const sy = (H - dh) / 2;
  ctx.drawImage(img, sx, sy, dw, dh);

  // וינייט עדין לקריאות הטקסט
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgba(0,0,0,0.30)");
  g.addColorStop(0.45, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.58)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** שכבת-על: מותג + שם חנות + הוק + מחיר + CTA */
function drawOverlay(ctx, o, W, H, t) {
  const { pal, title, price, hook, cta, storeName } = o;
  const fade = Math.min(1, t / 0.45);
  ctx.globalAlpha = fade;
  ctx.textAlign = "center";
  ctx.direction = "rtl";

  // מותג עליון
  ctx.font = `600 ${Math.round(W * 0.034)}px ${FONT}`;
  ctx.fillStyle = pal.accent;
  ctx.fillText("LIKELINK", W / 2, 116);
  ctx.fillRect(W / 2 - 30, 138, 60, 3);

  // שם החנות / היוצרת
  ctx.font = `700 ${Math.round(W * 0.046)}px ${FONT}`;
  ctx.fillStyle = pal.text;
  ctx.fillText(String(storeName || "Likelink").slice(0, 34), W / 2, 178);

  // הוק שיווקי (עם fallback לשם המוצר)
  const hookText = hook || title;
  ctx.font = `800 ${Math.round(W * 0.068)}px ${FONT}`;
  ctx.fillStyle = pal.text;
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 24;
  drawWrapped(ctx, hookText, W / 2, 628, W * 0.82, 96, 3);
  ctx.shadowBlur = 0;

  // מחיר בכדית champagnes
  const priceStr = Number(price) > 0 ? `${Number(price).toLocaleString("he-IL")} ₪` : "המחיר בחנות";
  ctx.font = `800 ${Math.round(W * 0.058)}px ${FONT}`;
  const pw = ctx.measureText(priceStr).width + 68;
  roundedRect(ctx, W / 2 - pw / 2, 880, pw, 84, 42);
  ctx.fillStyle = pal.accent;
  ctx.fill();
  ctx.fillStyle = pal.accentText;
  ctx.fillText(priceStr, W / 2, 922);

  // כפתור CTA בתחתית
  ctx.font = `800 ${Math.round(W * 0.046)}px ${FONT}`;
  const cw = Math.min(W * 0.82, ctx.measureText(cta).width + 84);
  roundedRect(ctx, W / 2 - cw / 2, 1080, cw, 96, 48);
  const cg = ctx.createLinearGradient(0, 1080, 0, 1176);
  cg.addColorStop(0, pal.accent);
  cg.addColorStop(1, pal.accentDeep);
  ctx.fillStyle = cg;
  ctx.fill();
  ctx.fillStyle = pal.accentText;
  ctx.fillText(cta, W / 2, 1128);
  ctx.globalAlpha = 1;
}

/**
 * הפונקציה הראשית — מייצרת ריל ממוצר + טקסט.
 * @param {object} opts
 * @param {string[]} opts.images - כתובות תמונות (יחסיות / מוחלטות / data:)
 * @param {string} opts.title - שם המוצר
 * @param {number} opts.price - מחיר (₪)
 * @param {string} opts.hook - הוק שיווקי (בעברית)
 * @param {string} opts.cta - טקסט כפתור המעשה
 * @param {string} opts.storeName - שם החנות / היוצרת
 * @param {'dark'|'cream'|'gold'} opts.palette - ערכת צבע
 * @param {(p:number)=>void} opts.onProgress - קולבק התקדמות 0..1
 * @returns {Promise<{blob:Blob,url:string,width:number,height:number,durationMs:number,mime:string}>}
 */
export async function generateProductReel({
  images = [], title = "", price = 0, hook = "",
  cta = "לרכישה 👉 הלינק בפרופיל", storeName = "Likelink", palette = "dark",
  onProgress = () => {}, mime = pickRecorderMime(),
} = {}) {
  if (!canRecordVideo()) throw new Error("video_not_supported");
  const W = REEL.w;
  const H = REEL.h;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_2d_unavailable");
  ctx.direction = "rtl";
  ctx.textBaseline = "middle";

  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 3_500_000 });
  const chunks = [];
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };

  // טוענים את התמונות מראש — מי שנכשל גולש לכרטיס גרדיאנט
  const imgs = [];
  for (const src of images) imgs.push(await loadImageSafe(src));
  const usable = imgs.filter(Boolean);
  const segs = usable.length ? usable : [null]; // null → כרטיס טקסט בלבד
  const finalMs = segs.length * REEL.perImageMs;
  const pal = PALETTES[palette] || PALETTES.dark;

  const draw = (elapsed) => {
    const overall = Math.min(elapsed, finalMs);
    const segIndex = Math.min(segs.length - 1, Math.floor(overall / REEL.perImageMs));
    const t = overall / REEL.perImageMs - segIndex;
    drawBackground(ctx, W, H, pal);
    const img = segs[segIndex];
    if (img) drawImageSeg(ctx, img, t, W, H);
    drawOverlay(ctx, { pal, title, price, hook, cta, storeName }, W, H, t);
  };

  rec.start(200);
  await new Promise((resolve, reject) => {
    const startT = performance.now();
    rec.onerror = () => reject(new Error("recorder_failed"));
    const frame = () => {
      const elapsed = performance.now() - startT;
      draw(elapsed);
      const overall = Math.min(elapsed, finalMs);
      onProgress(overall / finalMs);
      if (elapsed >= finalMs) {
        try { rec.stop(); } catch { /* כבר נעצר */ }
        resolve();
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });

  const blob = await new Promise((resolve) => {
    rec.onstop = () => {
      const b = new Blob(chunks, { type: rec.mimeType || mime || "video/webm" });
      resolve(b);
    };
  });
  try { stream.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }

  const url = URL.createObjectURL(blob);
  return { blob, url, width: W, height: H, durationMs: finalMs, mime: rec.mimeType || "video/webm" };
}

/** הערכת משך הווידאו לפי מספר תמונות */
export function estimateReelDuration(imageCount) {
  return Math.max(1, Number(imageCount) || 1) * REEL.perImageMs;
}