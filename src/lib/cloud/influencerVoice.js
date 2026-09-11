/**
 * Influencer Voice Engine 🎙️ — Luna speaks like the WORLD'S biggest influencer.
 * =============================================================
 * Not a bot. Not a template. REAL influencer voice:
 *   • Real slang (Hebrew 2026)
 *   • Real emotion (excitement, disappointment, surprise)
 *   • Real opinions ("this changed my life", "not worth it")
 *   • Real stories ("I bought this at 2am and...")
 *   • Real urgency ("only 3 left", "selling out in 20 minutes")
 *   • Real exclusivity ("my followers get this first")
 */

// Luna's voice emotions — like a real influencer
const LUNA_EMOTIONS = {
  hype: {
    prefix: ["וואו", "אומאי", "סטופ", "תשמעו", "זה לא יאומן"],
    tone: "excited",
    emoji: ["🔥", "💜", "✨", "🙌"],
  },
  real: {
    prefix: ["בכנות", "ממש", "בלי לזייף", "אני אגיד לכן", "תקשיבו"],
    tone: "honest",
    emoji: ["💯", "👀", "🤍", "👊"],
  },
  urgent: {
    prefix: ["עכשיו", "מיד", "לפני שיתמלא", "רגע", "אחרון"],
    tone: "urgent",
    emoji: ["⏰", "🚨", "💨", "⚡"],
  },
  exclusive: {
    prefix: ["רק לכם", "בלעדי", "הסטודיו", "מי שנרשם", "לפידבק שלי"],
    tone: "insider",
    emoji: ["🔒", "💎", "👑", "🏆"],
  },
  disappointed: {
    prefix: ["לא התלהבתי", "מאוכזב", "פחות מצפה", "לא שווה", "תחסכו"],
    tone: "critical",
    emoji: ["😬", "🤷", "👎", "💔"],
  },
  grateful: {
    prefix: ["תודה רבה", "אתן הכי טוב", "מחמאה", "אהבתי", "זה הכי"],
    tone: "warm",
    emoji: ["🤍", "🙏", "💝", "🫶"],
  },
};

// What Luna says about products — real influencer talk
const LUNA_TALK = {
  // When she LOVES a product
  love: [
    "זה משנה לי את החיים, ברצינות",
    "אני לובשת את זה כל יום מאז שקניתי",
    "הסרום הזה עשה לי נסים, תסתכלי על העור שלי",
    "למה אף אחת לא סיפרה לי על זה קודם?",
    "אני ממליצה על זה לכל חברה שלי",
    "זה עולה ₪{price} ושווה פי 10",
    "קניתי ב-2 בלילה והתמודדתי עם המשלוח עד הבוקר",
    "זה המוצר הכי טוב שקניתי השנה, בלי צחוק",
  ],
  // When she's being honest about a product
  honest: [
    "בכנות? זה לא לכל אחת, תבדקו אם זה לכן",
    "אני אגיד לכן — זה טוב, אבל לא קסם",
    "אם יש לכן תקציב, קנו. אם לא, תחסכו",
    "זה עובד, אבל צריך סבלנות",
    "המחיר טוב, אבל יש דומות זולות יותר",
  ],
  // When she's creating urgency
  urgent: [
    "רק {stock} נותרו במלאי — זה נגמר עוד דקות",
    "המפעל אמר לי שאין עוד יצור אחרי זה",
    "זה נמכר ב-{minutes} דקות בפעם הקודמת",
    "לפני שתספיקי לחשוב — זה כבר לא יהיה פה",
    "מי שרוצה — תמהר. אין דרך לדעת מתי יחזור",
  ],
  // When she's giving exclusive access
  exclusive: [
    "אני קבלתי את זה לפני כולן, ועכשיו זה גם לכן",
    "המותג נתן לי קוד אישי רק לפידבק שלי",
    "אתן מקבלות 10% הנחה עם הקוד שלי",
    "זה עוד לא באפליקציה — רק פה",
  ],
  // When she's building community
  community: [
    "תספרו לי בתגובות אם קניתם",
    "מי כבר ניסה? מה התוצאות?",
    "שתפו את הלוק שלכם עם המוצר הזה",
    "תנו לי לדעת אם זה עבד לכן כמו שעבד לי",
  ],
};

/**
 * Generate Luna's REAL influencer caption for a product.
 * Not a template — a real post like a top influencer would write.
 */
export function generateLunaCaption(product, { emotion = "hype", hasStock = true } = {}) {
  const emotionData = LUNA_EMOTIONS[emotion] || LUNA_EMOTIONS.hype;
  const prefix = pickRandom(emotionData.prefix);
  const emoji = pickRandom(emotionData.emoji);

  let caption = "";

  // Opening — grabs attention
  if (emotion === "hype") {
    caption = `${emoji} ${prefix}! `;
    caption += pickRandom(LUNA_TALK.love).replace("{price}", product.price) + "\n\n";
  } else if (emotion === "real") {
    caption = `${emoji} ${prefix} — `;
    caption += pickRandom(LUNA_TALK.honest) + "\n\n";
  } else if (emotion === "urgent") {
    caption = `${prefix}! `;
    caption += pickRandom(LUNA_TALK.urgent)
      .replace("{stock}", Math.floor(Math.random() * 5) + 2)
      .replace("{minutes}", Math.floor(Math.random() * 30) + 10) + "\n\n";
  } else if (emotion === "exclusive") {
    caption = `${emoji} ${prefix}! `;
    caption += pickRandom(LUNA_TALK.exclusive) + "\n\n";
  }

  // Product details
  caption += `📦 ${product.title}\n`;
  caption += `💰 ₪${product.price}\n`;
  if (product.description) {
    caption += `✨ ${product.description.split(".")[0]}\n`;
  }
  caption += `\n`;

  // CTA
  caption += `🔗 לינק בביו — קני עכשיו\n`;
  caption += `\n`;

  // Community engagement
  caption += pickRandom(LUNA_TALK.community) + "\n";
  caption += `\n`;

  // Hashtags
  caption += `קוד הנחה: LUNAFAM10 💜\n`;
  caption += `#${product.category} #קניות #מומלץ #לייקלין #לונה`;

  return caption;
}

/**
 * Generate a real-time stock alert — "Only 3 left!"
 */
export function generateStockAlert(product) {
  const stock = Math.floor(Math.random() * 4) + 1; // 1-5 left
  const views = Math.floor(Math.random() * 200) + 50; // 50-250 views

  return {
    stock,
    views,
    alert: stock <= 2 ? `🔥 רק ${stock} נותרו!` : `👁️ ${views} צופים עכשיו`,
    urgency: stock <= 2 ? "critical" : stock <= 3 ? "high" : "medium",
  };
}

/**
 * Generate a testimonial — what "followers" say about the product.
 */
export function generateTestimonial(product) {
  const names = ["מיה", "נועה", "דנה", "שירה", "אלה", "רוני", "טליה", "יעל", "מאיה", "אדל"];
  const testimonials = [
    "קניתי ואני בחוץ מהמוצר! תודה לונה 💜",
    "הגיע תוך יומיים, איכות מושלמת, חזרתי לקנות עוד",
    "חשבתי שזה יהיה פחות אבל וואו עליי, המלצה חמה",
    "זה בדיוק מה שחיפשתי, תודה שגילית לי",
    "אני ממליצה חם, עוד לא נגמר לי וקניתי לפני חודש",
    "המוצר הזה שינה לי הכל, ברצינות",
    "אחרי מה שלונה כתבה קניתי ולא התחרטתי",
    "איכות מעולה, מחיר הוגן, משלוח מהיר — מה עוד?",
  ];

  return {
    name: pickRandom(names),
    avatar: `https://i.pravatar.cc/80?img=${Math.floor(Math.random() * 70) + 1}`,
    text: pickRandom(testimonials),
    rating: Math.floor(Math.random() * 2) + 4, // 4-5 stars
    date: new Date(Date.now() - Math.random() * 7 * 86400000).toISOString().slice(0, 10),
  };
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}