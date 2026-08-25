/**
 * Likelink Story Kit — יצירת סטורי מעוצב בקליק (Instagram / TikTok).
 * מייצר תמונה 1080×1920 עם המוצר, המחיר והמיתוג, מוריד אותה,
 * מעתיק את הטקסט ופותח את האפליקציה. הכל בצד הלקוח, בלי שרת.
 */

const W = 1080;
const H = 1920;

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
 * בונה את תמונת הסטורי ומחזיר Blob PNG.
 */
export async function buildStoryImage({ title, price = 0, image, storeName = "" }) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // רקע גרדיאנט יוקרתי
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#6C4CF1");
  grad.addColorStop(0.55, "#3D2E8C");
  grad.addColorStop(1, "#14121F");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // שם החנות למעלה
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "600 44px 'Heebo', 'Assistant', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(storeName || "Likelink", W / 2, 130);

  // תמונת המוצר
  const img = await loadImage(image);
  const boxX = 90;
  const boxY = 240;
  const boxW = W - 180;
  const boxH = 1080;
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

  // כותרת המוצר
  ctx.textAlign = "center";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "700 64px 'Heebo', sans-serif";
  const lines = wrapText(ctx, title || "", W - 160);
  let ty = boxY + boxH + 120;
  lines.forEach((line) => {
    ctx.fillText(line, W / 2, ty);
    ty += 84;
  });

  // מחיר
  if (price > 0) {
    ctx.font = "800 88px 'Heebo', sans-serif";
    ctx.fillStyle = "#FFD9F2";
    ctx.fillText(`₪${price}`, W / 2, ty + 40);
  }

  // CTA + מיתוג
  ctx.font = "600 46px 'Heebo', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillText("קנייה בטוחה בקליק · Likelink 💜", W / 2, H - 140);

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
 * הרצת תהליך סטורי מלא בקליק אחד:
 * תמונה ← הורדה ← העתקת טקסט ← פתיחת האפליקציה.
 */
export async function runStoryShare({ network = "instagram", product, storeName = "", caption = "", link = "" }) {
  try {
    const blob = await buildStoryImage({
      title: product?.title,
      price: Number(product?.price) || 0,
      image: product?.image,
      storeName,
    });
    downloadBlob(blob, `likelink-${network}-story.png`);
    try {
      await navigator.clipboard.writeText(`${caption}\n${link}`.trim());
    } catch { /* clipboard optional */ }
    const target =
      network === "tiktok"
        ? "https://www.tiktok.com/upload"
        : "https://www.instagram.com/";
    window.open(target, "_blank", "noopener,noreferrer");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
