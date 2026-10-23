// "האינסטגרם של LikeLink2": nine posts in one look, the way a strong creator
// grid works (the owner showed @ravitrecommends, 2026-10-22: one character
// style, a small name tag in the corner, one hook bar at the bottom, and most
// posts teach something before they sell).
//
// The LikeLink2 version keeps the site's own rules: product posts use the
// product's own photo and open with "#פרסומת · קישור שותפים"; tip posts are
// the free guide's checks (general advice, no claims) with the AI character
// labelled "דמות AI"; every hook passes the copy rules (no prices, urgency,
// superlatives); no other company's brand or logo. Comment "רוצה" (product)
// or "מדריך" (tip) is answered by the existing comment bot. Nothing is posted
// from here: scripts/marketing/instagram-grid.mjs renders the images and the
// page the owner posts from.
import { DROP_AD, dropHooks, dropHashtags, safeCopy } from "./dailyDrop.js";
import { GUIDE, guideExamples } from "../guide.js";
import { PRODUCTION_ORIGIN } from "../../constants/domain.js";

export const GRID_POST = Object.freeze({ width: 1080, height: 1440 });
export const BRAND_TAG = "LikeLink2 ממליצה";
export const AI_TAG = "דמות AI";
export const SELLER_PHOTO_TAG = "תמונת המוכר";
// The grid, three by three: a tip opens each row, so the profile reads as
// "she teaches me something", not as a catalog.
export const GRID_ORDER = Object.freeze(["tip", "product", "product", "tip", "product", "product", "tool", "product", "tip"]);

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const short = (s, n) => {
  const t = clean(s);
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
};
const firstSentence = (s) => (clean(s).split(/(?<=[.!?])\s/)[0] || "");

const PRODUCT_CTA = 'כתבי "רוצה" בתגובות ואשלח לך את הקישור בפרטי 📩';
const GUIDE_CTA = 'רוצה את כל 8 הבדיקות? כתבי "מדריך" בתגובות ואשלח לך בפרטי 📩';
const AFFILIATE_LINE = "קישור שותפים: אם תקני דרכו ייתכן שאקבל עמלה, בלי עלות נוספת לך.";
const TIP_TAGS = ["#טיפים", "#קניותאונליין", "#אליאקספרס", "#LikeLink2"];

/** The guide's checks a tip post can carry: ones the catalog has an example for first. */
export function tipChecks(products = []) {
  const withExample = GUIDE.checks.filter((c) => guideExamples(c, products, 1).length);
  const general = GUIDE.checks.filter((c) => !c.match);
  return [...new Set([...withExample, ...general])];
}

function productPost(product, picture, i, { origin }) {
  // A picture is a src, or { src, note } when it says more than "the seller's photo" (a luxe set's own background).
  const image = typeof picture === "object" && picture ? picture.src : picture;
  const note = (typeof picture === "object" && picture?.note) || SELLER_PHOTO_TAG;
  const hooks = dropHooks(product);
  const hook = hooks.length ? hooks[i % hooks.length] : "";
  const title = short(product.displayTitle || product.title, 60);
  const fact = firstSentence(product.description);
  const tags = dropHashtags(product);
  const written = [DROP_AD, hook, "", title, fact, "", PRODUCT_CTA, "", AFFILIATE_LINE, "", tags.join(" ")].join("\n");
  // A store's own title or description can carry a claim the copy rules keep out: then the post is the hook and the CTA only.
  const caption = safeCopy(written) ? written : [DROP_AD, hook, "", PRODUCT_CTA, "", AFFILIATE_LINE].join("\n");
  return {
    kind: "product",
    productId: product.id,
    hook,
    sub: safeCopy(title) ? short(title, 42) : "",
    image,
    tags: ["#פרסומת", BRAND_TAG],
    imageNote: note,
    caption,
    link: `${origin}/p/${product.id}`,
    alt: `${title} · ${note}`,
  };
}

function tipPost(check, presenter, example, n) {
  const hook = check.title.he;
  const caption = [`💡 ${hook}`, "", check.body.he, "", GUIDE_CTA, "", "הדמות בתמונה היא דמות AI.", "", TIP_TAGS.join(" ")].join("\n");
  return {
    kind: "tip",
    checkId: check.id,
    hook,
    sub: `טיפ ${n} מתוך ${GUIDE.checks.length} · המדריך החינמי`,
    image: presenter,
    // A product the tip talks about, in its own photo, so each tip looks different and leads to the shop.
    inset: example?.image || "",
    insetProductId: example?.id || "",
    tags: [AI_TAG, BRAND_TAG],
    imageNote: example?.image ? `בתמונה הקטנה: ${SELLER_PHOTO_TAG}` : "",
    caption,
    link: "",
    alt: `${hook} · ${AI_TAG}`,
  };
}

function toolPost(presenter, origin) {
  const hook = "מה מידת הטבעת שלך?";
  const link = `${origin}/size?utm_source=instagram&utm_medium=social&utm_campaign=ig_grid`;
  const caption = [`📏 ${hook}`, "", "מודדים מהמסך של הטלפון, בחינם: טבעת לפי כרטיס אשראי או פס נייר, וגם אורך צמיד.", "", "הקישור למודד בביו 🔗", "", "הדמות בתמונה היא דמות AI.", "", TIP_TAGS.join(" ")].join("\n");
  return { kind: "tool", hook, sub: "המודד החינמי של LikeLink2", image: presenter, tags: [AI_TAG, BRAND_TAG], imageNote: "", caption, link, alt: `${hook} · ${AI_TAG}` };
}

/**
 * The nine posts, in grid order. `imageOf(product)` gives the product's own
 * clean photo (none → the product is skipped); `presenter` is the AI
 * character's image, or a list of images of the same character that the tip
 * posts take in turn (none → tip posts are skipped). Fewer than nine when the
 * catalog is smaller; never a post without a real picture.
 */
export function instagramGrid({ products = [], imageOf = () => "", presenter = "", origin = PRODUCTION_ORIGIN } = {}) {
  const withImage = products.filter((p) => p?.id && imageOf(p));
  const faces = (Array.isArray(presenter) ? presenter : [presenter]).filter(Boolean);
  const tips = faces.length ? tipChecks(products) : [];
  const posts = [];
  let pi = 0;
  let ti = 0;
  let tool = false;
  for (const slot of GRID_ORDER) {
    if (slot === "product" && pi < withImage.length) {
      posts.push(productPost(withImage[pi], imageOf(withImage[pi]), pi, { origin }));
      pi += 1;
    } else if (slot === "tip" && ti < tips.length) {
      const ex = guideExamples(tips[ti], withImage, 1)[0];
      const n = GUIDE.checks.indexOf(tips[ti]) + 1;
      const exPic = ex ? imageOf(ex) : "";
      posts.push(tipPost(tips[ti], faces[ti % faces.length], ex ? { id: ex.id, image: typeof exPic === "object" ? exPic.src : exPic } : null, n));
      ti += 1;
    } else if (slot === "tool" && faces.length && !tool) {
      posts.push(toolPost(faces[(ti + 1) % faces.length], origin));
      tool = true;
    }
  }
  return posts.map((p, i) => ({ id: `ig-${String(i + 1).padStart(2, "0")}-${p.kind}`, ...p }));
}

// Luna's stories (scripts/luna_reels, look "story"): posted as a Reel, then
// shared to the story with Instagram's own link sticker to the product page.
export const STORY_STEPS = Object.freeze([
  "מורידים את הסרטון.",
  "באינסטגרם: ➕ ← ריל ← בוחרים את הסרטון, ומדביקים את הכיתוב.",
  "הגדרות מתקדמות ← „תווית AI” ← מפעילים (לונה היא דמות AI).",
  "אחרי שהריל עלה: כפתור השיתוף ← „הוספה לסטורי”.",
  "בסטורי: מדבקות ← „קישור” ← מדביקים את הקישור למוצר, ועל המדבקה כותבים „לפרטים על המוצר”.",
  "מי שכותבת „רוצה” מתחת לריל מקבלת את הקישור בפרטי.",
]);
export const STORY_STICKER = "לפרטים על המוצר";

/**
 * The stories the kit page offers: each one's video and caption (written by
 * the engine, the disclosure first) and the product page link for the story's
 * link sticker. A story without the ad tag or a product is left out.
 */
export function storyCards(stories = [], { origin = PRODUCTION_ORIGIN } = {}) {
  return (Array.isArray(stories) ? stories : [])
    .filter((x) => x?.productId && x?.video && String(x.caption || "").startsWith(DROP_AD) && safeCopy(x.caption))
    .map((x) => ({
      id: String(x.id),
      productId: String(x.productId),
      title: clean(x.title),
      video: String(x.video),
      seconds: Number(x.seconds) || 0,
      caption: String(x.caption),
      link: `${origin}/p/${encodeURIComponent(x.productId)}?utm_source=instagram&utm_medium=story&utm_campaign=luna_story`,
      sticker: STORY_STICKER,
    }));
}

/** Every line a post says on the picture or in its caption passes the copy rules. */
export function gridIsClean(posts = []) {
  return posts.every((p) => safeCopy(p.hook) && safeCopy(p.sub || "") && safeCopy(p.caption) && (p.kind !== "product" || p.caption.startsWith(DROP_AD)));
}
