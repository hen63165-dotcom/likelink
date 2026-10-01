// Every generated static page, keyed by its path under public/.
import { renderPricingPage } from "./pricingPage.js";
import { renderLegalPages } from "./legalPages.js";

export async function renderAllStaticPages() {
  return { "pricing.html": renderPricingPage(), ...renderLegalPages() };
}
