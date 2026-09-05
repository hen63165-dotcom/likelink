/**
 * Likelink Story Kit — יצירת סטורי מעוצב בקליק (Instagram / TikTok).
 * מייצר תמונה 1080×1920 עם המוצר, המחיר והמיתוג, מוריד אותה,
 * מעתיק את הטקסט ופותח את האפליקציה. הכל בצד הלקוח, בלי שרת.
 */

// פורמטים נתמכים — סטורי, פוסט פורטרט וריבוע
const FORMATS = {
  story: { w: 1080, h: 1920 },
  post: { w: 1080, h: 1350 },
  square: { w: 1080, h: 1080 },
};

/** סגנונות עיצוב — כל אחת בוחרת את הווייב שלה בקליק */
export const STORY_STYLES = [
  { id: "lux", label: "לוקס ✨", desc: "עולם הבית של לייקלינק — קרם ושמפניה" },
  { id: "pixar", label: "פיקסאר 🎬", desc: "פוסטר קולנועי חם" },
  { id: "neon", label: "ניאון 🌃", desc: "זוהר של לילה" },
  { id: "minimal", label: "מינימלי 🤍", desc: "נקי ואלגנטי" },
  { id: "party", label: "מסיבה 🎉", desc: "צבע, ניצוצות, חיוך" },
];

export const STORY_FORMATS = [
  { id: "story", label: "סטורי 9:16" },
  { id: "post", label: "פוסט 4:5" },
  { id: "square", label: "ריבוע 1:1" },
];

const PALETTES = {
  // לוקס — העולם של Likelink עצמה: קרם, שמפניה, פחם.
  // כל יצירה באה משפת המותג של האתר, לא מהפלטה הסגולה הישנה.
  lux: {
    bg: ["#F7F3EA", "#EDE3CE", "#E3D5BC"],
    store: "rgba(33,28,22,0.92)",
    title: "#211C16",
    price: "#9C7437",
    cta: "rgba(33,28,22,0.85)",
    boxStroke: "rgba(156,116,55,0.35)",
    badgeBg: "rgba(183,143,79,0.16)",
    badgeText: "#7A5A2C",
  },
  pixar: {
    bg: ["#FFB25E", "#E86A9E", "#4C2E8C"],
    store: "rgba(255,255,255,0.95)",
    title: "#FFFFFF",
    price: "#FFE49A",
    cta: "rgba(255,255,255,0.95)",
    boxStroke: "rgba(255,255,255,0.55)",
    badgeBg: "rgba(255,255,255,0.92)",
    badgeText: "#7A3C1E",
  },
  lux_legacy: {
    bg: ["#6C4CF1", "#3D2E8C", "#14121F"],
    store: "rgba(255,255,255,0.92)",
    title: "#FFFFFF",
    price: "#FFD9F2",
    cta: "rgba(255,255,255,0.9)",
    boxStroke: null,
    badgeBg: "rgba(255,255,255,0.16)",
    badgeText: "#FFFFFF",
  },
  neon: {
    bg: ["#0F0C29", "#302B63", "#24243E"],
    store: "rgba(255,255,255,0.9)",
    title: "#FFFFFF",
    price: "#5FFAE0",
    cta: "rgba(255,255,255,0.88)",
    boxStroke: "rgba(95,250,224,0.6)",
    glow: "#FF3CAC",
    badgeBg: "rgba(255,60,172,0.25)",
    badgeText: "#FFD1EC",
  },
  minimal: {
    bg: ["#FAF7F2", "#F1EAE0", "#EFE6D8"],
    store: "rgba(30,26,22,0.8)",
    title: "#1E1A16",
    price: "#B4552D",
    cta: "rgba(30,26,22,0.72)",
    boxStroke: "rgba(30,26,22,0.18)",
    badgeBg: "rgba(30,26,22,0.08)",
    badgeText: "#1E1A16",
  },
  party: {
    bg: ["#3B0A57", "#C33764", "#FF8A3D"],
    store: "rgba(255,255,255,0.95)",
    title: "#FFFFFF",
    price: "#FFE45B",
    cta: "rgba(255,255,255,0.9)",
    boxStroke: "rgba(255,255,255,0.5)",
    badgeBg: "rgba(255,255,255,0.2)",
    badgeText: "#3B0A57",
  },
};

const HOOKS = [
  "המומלצת של היום ✨",
  "הפריט שכולן מדברות עליו 💬",
  "מתאים לך בדיוק 💜",
  "חייבות לראות 👀",
  "הנמכר ביותר השבוע 🔥",
];

function hashString(s) {
  let h = 0;
  for (let i = 0; i < String(s || "").length; i++) h = (h * 31 + String(s).charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** רקע גרדיאנט לפי סגנון + קישוטים ייחודיים לכל סגנון */
function drawBackground(ctx, W, H, pal, style) {
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, pal.bg[0]);
  grad.addColorStop(0.55, pal.bg[1]);
  grad.addColorStop(1, pal.bg[2]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  if (style === "pixar") {
    // זרקור חם מלמעלה + בוקה רך — תחושת פוסטר אנימציה
    const glow = ctx.createRadialGradient(W / 2, H * 0.08, 40, W / 2, H * 0.08, H * 0.42);
    glow.addColorStop(0, "rgba(255,236,180,0.55)");
    glow.addColorStop(1, "rgba(255,236,180,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H * 0.6);
    const bokeh = [
      [140, H * 0.16, 46], [W - 120, H * 0.24, 34], [90, H * 0.52, 28],
      [W - 100, H * 0.62, 40], [W / 2, H * 0.05, 22],
    ];
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    bokeh.forEach(([x, y, r]) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (style === "neon") {
    // טבעות זוהר ניאון
    ctx.save();
    ctx.strokeStyle = pal.glow;
    ctx.shadowColor = pal.glow;
    ctx.shadowBlur = 60;
    ctx.lineWidth = 6;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(W - 140, H * 0.12, 90, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(120, H * 0.82, 60, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else if (style === "minimal") {
    // מסגרת פנימית עדינה
    ctx.save();
    ctx.strokeStyle = "rgba(30,26,22,0.22)";
    ctx.lineWidth = 3;
    roundRectPath(ctx, 48, 48, W - 96, H - 96, 44);
    ctx.stroke();
    ctx.restore();
  } else if (style === "lux") {
    // נקודות עדינות כמו אבק כוכבים
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    for (let i = 0; i < 26; i++) {
      const x = ((i * 197) % W) + 20;
      const y = ((i * 331) % H) + 20;
      ctx.beginPath();
      ctx.arc(x, y, i % 3 === 0 ? 4 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** טעינת תמונה חוצת-דומיין בבטחה (crossOrigin כדי שהקנבס לא ייחסם) */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** ציור תמונה במצב "cover" בתוך מסגרת מעוגלת */
function drawCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.save();
  roundRectPath(ctx, x, y, w, h, 36);
  ctx.clip();
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3); // עד 3 שורות כותרת
}

/**
 * בונה את תמונת הקריאייטיב ומחזיר Blob PNG.
 * style: pixar | lux | neon | minimal   format: story | post | square
 */
export async function buildStoryImage({ title, price = 0, image, storeName = "", style = "pixar", format = "story" }) {
  const pal = PALETTES[style] || PALETTES.pixar;
  const { w: W, h: H } = FORMATS[format] || FORMATS.story;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  drawBackground(ctx, W, H, pal, style);

  // שם החנות למעלה
  ctx.fillStyle = pal.store;
  ctx.font = `600 ${Math.round(W * 0.041)}px 'Heebo', 'Assistant', sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(storeName || "Likelink", W / 2, Math.round(H * 0.068));

  // תג הוק שיווקי (מתחלף לפי המוצר)
  const hook = HOOKS[hashString(title) % HOOKS.length];
  const hookFont = Math.round(W * 0.032);
  ctx.font = `700 ${hookFont}px 'Heebo', sans-serif`;
  const hookW = ctx.measureText(hook).width + W * 0.07;
  const hookH = hookFont * 2.1;
  const hookY = Math.round(H * 0.092);
  ctx.fillStyle = pal.badgeBg;
  roundRectPath(ctx, (W - hookW) / 2, hookY, hookW, hookH, hookH / 2);
  ctx.fill();
  ctx.fillStyle = pal.badgeText;
  ctx.fillText(hook, W / 2, hookY + hookH * 0.68);

  // תמונת המוצר — פריסה פרופורציונלית לכל פורמט
  const img = await loadImage(image);
  const boxX = Math.round(W * 0.083);
  const boxY = Math.round(H * 0.148);
  const boxW = W - boxX * 2;
  const boxH = Math.round(H * 0.5625);
  if (img) {
    drawCover(ctx, img, boxX, boxY, boxW, boxH);
  } else {
    ctx.save();
    roundRectPath(ctx, boxX, boxY, boxW, boxH, 36);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "500 60px 'Heebo', sans-serif";
    ctx.fillText("🛍️", W / 2, boxY + boxH / 2);
  }

  // מסגור תיבת התמונה לפי סגנון
  if (pal.boxStroke) {
    ctx.save();
    ctx.strokeStyle = pal.boxStroke;
    ctx.lineWidth = 5;
    roundRectPath(ctx, boxX, boxY, boxW, boxH, 36);
    ctx.stroke();
    ctx.restore();
  }

  // כותרת המוצר
  ctx.textAlign = "center";
  ctx.fillStyle = pal.title;
  ctx.font = `700 ${Math.round(W * 0.059)}px 'Heebo', sans-serif`;
  const lines = wrapText(ctx, title || "", W - 160);
  let ty = boxY + boxH + Math.round(H * 0.062);
  lines.forEach((line) => {
    ctx.fillText(line, W / 2, ty);
    ty += Math.round(W * 0.078);
  });

  // מחיר
  if (price > 0) {
    ctx.font = `800 ${Math.round(W * 0.081)}px 'Heebo', sans-serif`;
    ctx.fillStyle = pal.price;
    ctx.fillText(`₪${price}`, W / 2, ty + Math.round(H * 0.02));
  }

  // CTA + מיתוג ויראלי (כל סטורי שנשמר מחותם במותג — מי שרואה, רוצה את זה)
  ctx.font = `600 ${Math.round(W * 0.043)}px 'Heebo', sans-serif`;
  ctx.fillStyle = pal.cta;
  ctx.fillText("קנייה בטוחה בקליק · Likelink 💜", W / 2, H - Math.round(H * 0.09));
  ctx.font = `500 ${Math.round(W * 0.029)}px 'Heebo', sans-serif`;
  ctx.fillStyle = pal.price;
  ctx.fillText("נוצר בסטודיו של Likelink · likelink2.app", W / 2, H - Math.round(H * 0.038));

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

/** הורדת ה-Blob כקובץ לגלריה */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * העתקת תמונה ללוח (שיהיה אפשר פשוט להדביק באינסטגרם/טיקטוק).
 * לא כל הדפדפנים תומכים — מחזיר false בשקט.
 */
export async function copyImageToClipboard(blob) {
  try {
    if (!navigator.clipboard || typeof ClipboardItem === "undefined") return false;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}

/**
 * הרצת תהליך קריאייטיב מלא בקליק אחד:
 * תמונה בסגנון שנבחר ← הורדה + העתקה ללוח ← העתקת טקסט ← פתיחת האפליקציה.
 */
export async function runStoryShare({
  network = "instagram",
  product,
  storeName = "",
  caption = "",
  link = "",
  style = "pixar",
  format = "story",
}) {
  try {
    const blob = await buildStoryImage({
      title: product?.title,
      price: Number(product?.price) || 0,
      image: product?.image,
      storeName,
      style,
      format,
    });
    downloadBlob(blob, `likelink-${style}-${format}.png`);
    const imgCopied = await copyImageToClipboard(blob);
    try {
      await navigator.clipboard.writeText(`${caption}\n${link}`.trim());
    } catch { /* clipboard optional */ }
    const target =
      network === "tiktok"
        ? "https://www.tiktok.com/upload"
        : "https://www.instagram.com/";
    window.open(target, "_blank", "noopener,noreferrer");
    return { ok: true, imgCopied };
  } catch {
    return { ok: false };
  }
}
