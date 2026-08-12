/**
 * Vision API Helper for Screenshot Search
 *
 * Clean interface for image analysis - ready to wire up to
 * Claude / Google Vision / OpenAI / custom ML later.
 * Currently a keyword-extraction stub.
 */

// Hebrew product categories and keywords for matching
const HEBREW_KEYWORDS = {
  fashion: ["שמלה", "חולצה", "מכנסיים", "חצאית", "ג׳סט", "סוודר", "מעיל", "מגפיים", "נעליים", "כובע", "תיק", "אבזור"],
  beauty: ["איפור", "קרם", "מסקרה", "ליפ גלוס", "פרדים", "שפתון", "קונסילר", "פוטר", "טונר", "סרום"],
  home: ["בית", "עיצוב", "כרית", "שטיח", "מנורה", "מזנון", "כיסא", "מיטה", "ארון", "מטבח"],
  tech: ["טלפון", "מסך", "אוזניות", "מצלמה", "לפטופ", "טבליה", "שעון חכם", "מחשב", "מקלדת", "עכבר"],
  fitness: ["כדור", "משקל", "ציוד כושר", "מחנה", "רצועה", "משקפי ספורט", "בקבוק", "תיק ספורט", "מגפי ריצה"],
  kids: ["ילדים", "תינוק", "צעצוע", "מגפי ילדים", "בגדי ילדים", "עגלה", "יונק", "מגן", "שמיכה"],
  accessories: ["שעון", "מסגרת", "תיק", "צמיד", "טבעת", "קישוט", "משקפיים", "כובע", "ציפה", "סיכה"],
};

/**
 * Analyze an uploaded image and extract keywords.
 * @param {File} imageFile
 * @returns {Promise<{keywords: string[], category: string, confidence: number, source: string}>}
 */
export async function analyzeImage(imageFile) {
  // STUB: simulate API call delay
  await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 700));

  // In production replace with:
  // const formData = new FormData();
  // formData.append('image', imageFile);
  // const res = await fetch('/api/analyze-image', { method: 'POST', body: formData });
  // return await res.json();

  const mock = extractMockKeywords(imageFile);
  return {
    keywords: mock.keywords,
    category: mock.category,
    confidence: 0.85,
    source: "stub",
  };
}

/** Stub keyword extractor (mock). */
function extractMockKeywords(imageFile) {
  const fileName = (imageFile && imageFile.name || "").toLowerCase();

  for (const [category, keywords] of Object.entries(HEBREW_KEYWORDS)) {
    for (const keyword of keywords) {
      if (fileName.includes(keyword)) {
        return { keywords: [keyword], category };
      }
    }
  }

  const categories = Object.keys(HEBREW_KEYWORDS);
  const randomCategory = categories[Math.floor(Math.random() * categories.length)];
  const categoryKeywords = HEBREW_KEYWORDS[randomCategory];
  const randomKeyword = categoryKeywords[Math.floor(Math.random() * categoryKeywords.length)];

  return { keywords: [randomKeyword], category: randomCategory };
}

/**
 * Filter products by extracted keywords/category.
 * @param {Array} products
 * @param {Array} keywords
 * @param {string} category
 * @param {number} limit
 * @returns {Array}
 */
export function filterProductsByKeywords(products, keywords, category, limit = 4) {
  if (!products || products.length === 0) return [];

  return products
    .filter((product) => {
      if (category && product.category === category) return true;
      const searchText = `${product.title || ""} ${product.description || ""}`.toLowerCase();
      return keywords.some((keyword) => searchText.includes(keyword.toLowerCase()));
    })
    .slice(0, limit);
}

/** Convert a file to a base64 data URL for preview. */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
}

/** Validate an image file. */
export function validateImageFile(file) {
  const validTypes = ["image/jpeg", "image/png", "image/webp", "image/heic"];
  const maxSize = 10 * 1024 * 1024; // 10MB

  if (!file) return { valid: false, error: "no_file" };
  if (!validTypes.includes(file.type)) return { valid: false, error: "invalid_type" };
  if (file.size > maxSize) return { valid: false, error: "too_large" };
  return { valid: true };
}
