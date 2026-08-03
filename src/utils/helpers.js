export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const CURRENCY = { he: "₪", en: "$" };

export function money(n, lang = "en") {
  return `${CURRENCY[lang] || "$"}${(Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2)}`;
}

export function slugify(str) {
  return (
    str
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\u0590-\u05FF]+/g, "-")
      .replace(/^-+|-+$/g, "") || "creator"
  );
}

export function uniqueSlug(base, existingSlugs) {
  let slug = base;
  let i = 2;
  while (existingSlugs.includes(slug)) {
    slug = `${base}-${i}`;
    i++;
  }
  return slug;
}

export function getTopCreatorIds(products, n = 3) {
  const totals = {};
  products.forEach((p) => {
    if (p.status === "approved") totals[p.marketerId] = (totals[p.marketerId] || 0) + (p.clicks || 0);
  });
  return new Set(
    Object.entries(totals)
      .filter(([, c]) => c > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([id]) => id)
  );
}

export function groupByDay(sales, valueKey, days = 14) {
  const now = new Date();
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets.push({ key, label: `${d.getDate()}/${d.getMonth() + 1}`, value: 0 });
  }
  const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]));
  sales.forEach((s) => {
    const key = new Date(s.ts).toISOString().slice(0, 10);
    if (byKey[key]) byKey[key].value += s[valueKey] || 0;
  });
  return buckets;
}
