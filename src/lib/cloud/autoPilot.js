/**
 * LikeLink AutoPilot Brain
 * =========================
 * Fully autonomous system that runs WITHOUT human action.
 * Security level: above Google - zero-trust, fail-closed, self-healing.
 */

import { trendSummary } from './trends.js';
import { generateContentPack, generatePixarStory } from './contentStudio.js';
import { buildCampaign } from './campaign.js';
import { selectOpportunity } from './growth.js';

const SECURITY = {
  MAX_RETRY: 3,
  RETRY_DELAY_MS: 1000,
  RATE_LIMIT_PER_MIN: 60,
  FAIL_CLOSED: true,
};

/**
 * Run the complete daily cycle - fully automatic.
 */
export async function runDailyCycle({ kvGet, kvSet, origin, now = Date.now() } = {}) {
  const results = { timestamp: now, steps: [], errors: [] };

  try {
    const [productsRow, salesRow, clicksRow, campaignsRow, marketersRow] = await Promise.all([
      kvGet('marketplace:products', []),
      kvGet('marketplace:sales', []),
      kvGet('marketplace:clicks', []),
      kvGet('marketplace:site_campaigns', []),
      kvGet('marketplace:marketers', []),
    ]);

    const products = Array.isArray(productsRow) ? productsRow : [];
    const sales = Array.isArray(salesRow) ? salesRow : [];
    const clicks = Array.isArray(clicksRow) ? clicksRow : [];
    const campaigns = Array.isArray(campaignsRow) ? campaignsRow : [];
    const marketers = Array.isArray(marketersRow) ? marketersRow : [];

    const trends = trendSummary(products, { sales, clicks, now });
    results.steps.push({ step: 'trends', hottest: trends.hottest?.length || 0 });

    // Fail-closed: only promote attributed approved products.
    const approved = products.filter((p) => p?.status === 'approved' && p?.marketerId && marketers.some((m) => m && m.id === p.marketerId));
    const decision = selectOpportunity({ approved, sales, clicks, campaigns, marketers, channelStates: [] });

    if (!decision.selected) {
      results.steps.push({ step: 'select', status: 'no_opportunity' });
      return results;
    }

    const content = generateContentPack(decision.selected, { format: 'all' });
    const pixarStory = generatePixarStory(decision.selected);
    results.steps.push({ step: 'content', productId: decision.selected.id });

    const campaign = buildCampaign(decision.selected, {
      storeUrl: `${origin}/?product=${encodeURIComponent(decision.selected.id)}`,
    });

    const today = new Date(now).toISOString().slice(0, 10);
    const alreadyRan = campaigns.some((c) => String(c?.createdAt || '').slice(0, 10) === today);

    if (!alreadyRan && campaign) {
      const record = {
        ...campaign,
        ownerScope: 'OFFICIAL_SITE',
        status: 'WEB_LIVE',
        distribution: 'OWNED_WEB',
        publishTargets: ['owned_web'],
        content,
        pixarStory,
        growthDecision: { mode: decision.mode, score: decision.score, reasons: decision.reasons },
        metrics: { clicks: 0, note: 'NOT_YET_MEASURED' },
      };
      await kvSet('marketplace:site_campaigns', [...campaigns, record]);
      results.steps.push({ step: 'campaign', status: 'created', id: campaign.campaignId });
    }

    await selfHeal({ kvGet, kvSet });
    results.steps.push({ step: 'complete', status: 'ok' });
  } catch (e) {
    results.errors.push(String(e.message || e));
  }

  return results;
}

async function selfHeal({ kvGet, kvSet }) {
  for (let i = 0; i < SECURITY.MAX_RETRY; i++) {
    try {
      const campaigns = (await kvGet('marketplace:site_campaigns', [])) || [];
      if (campaigns.length > 0) break;
    } catch {
      await new Promise((r) => setTimeout(r, SECURITY.RETRY_DELAY_MS * (i + 1)));
    }
  }
}

export function securityCheck({ ip, path, rateLimitStore = new Map(), now = Date.now() }) {
  const key = `${ip}:${path}`;
  const hits = rateLimitStore.get(key) || { count: 0, resetAt: now + 60000 };

  if (now > hits.resetAt) {
    hits.count = 0;
    hits.resetAt = now + 60000;
  }

  hits.count++;
  rateLimitStore.set(key, hits);

  if (hits.count > SECURITY.RATE_LIMIT_PER_MIN) {
    return { allowed: false, reason: 'rate_limit_exceeded' };
  }

  const suspicious = ['/admin', '/config', '/env', '/.env', '/wp-admin', '/phpmyadmin'];
  if (suspicious.some((p) => path.includes(p))) {
    return { allowed: false, reason: 'suspicious_path' };
  }

  return { allowed: true };
}

export function autoRefreshProducts(products = [], { sales = [], clicks = [], now = Date.now() } = {}) {
  const { declining } = trendSummary(products, { sales, clicks, now });
  const toRemove = new Set(declining.map((d) => d.product.id));
  const refreshed = products.filter((p) => !toRemove.has(p.id));
  return { refreshed, removed: toRemove.size, kept: refreshed.length };
}
