// Which fields AliExpress's affiliate search really returns (field names, the
// rating/orders formats and the coupon block), so the deals rules are built on
// what the API answers and not on a guess. Prints no credential.
import { aeCall, aeEnv, aeStatus } from "../../api/_utils/aliexpressAffiliate.mjs";
import { productsOf } from "./trend-finder.mjs";

const env = aeEnv(process.env);
if (!aeStatus(env).configured) { console.log("REQUIRES_CONNECTION"); process.exit(0); }
const out = [];
for (const [method, keywords, extra] of [
  ["aliexpress.affiliate.hotproduct.query", "women ring zircon", {}],
  ["aliexpress.affiliate.product.query", "women earrings", {}],
  ["aliexpress.affiliate.product.query", "home decor", { max_sale_price: "3000", min_sale_price: "500" }],
]) {
  try {
    const list = productsOf(await aeCall(method, {
      keywords, tracking_id: env.ALIEXPRESS_TRACKING_ID, target_currency: "ILS", target_language: "HE",
      ship_to_country: "IL", page_size: "50", sort: "LAST_VOLUME_DESC", ...extra,
    }, { env }), method);
    const keys = new Set(list.flatMap((x) => Object.keys(x || {})));
    const promo = list.filter((x) => x?.promo_code_info);
    out.push({
      method, keywords, extra, n: list.length, keys: [...keys].sort(),
      sample: list.slice(0, 4).map((x) => ({ evaluate_rate: x.evaluate_rate, lastest_volume: x.lastest_volume, discount: x.discount, target_sale_price: x.target_sale_price, target_original_price: x.target_original_price, sale_price: x.sale_price, cat1: x.first_level_category_name, cat2: x.second_level_category_name, shop: x.shop_id ? "yes" : "no" })),
      prices: list.map((x) => Number(x.target_sale_price)).sort((a, b) => a - b),
      withPromo: promo.length,
      promoSample: promo.slice(0, 3).map((x) => x.promo_code_info),
      rates: list.map((x) => x.evaluate_rate).slice(0, 30),
      volumes: list.map((x) => x.lastest_volume).slice(0, 30),
    });
  } catch (e) {
    out.push({ method, keywords, error: String(e?.message || e).slice(0, 200) });
  }
}
console.log(JSON.stringify(out, null, 1));
