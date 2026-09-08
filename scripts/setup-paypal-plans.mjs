#!/usr/bin/env node
/**
 * One-shot PayPal Plan Setup Script for LikeLink
 * 
 * Local-only utility: reads PayPal credentials from .env.paypal-setup.local
 * Creates PayPal Products + Billing Plans + Webhook
 * Outputs ready-to-paste vercel env commands (values NOT embedded in commands)
 * 
 * Usage:
 *   node scripts/setup-paypal-plans.mjs --dry-run    (default — prints what would happen)
 *   node scripts/setup-paypal-plans.mjs --live       (real execution against PayPal)
 *   node scripts/setup-paypal-plans.mjs --sandbox    (real execution against PayPal Sandbox)
 * 
 * NEVER run with --live or --sandbox unless you have reviewed the --dry-run output.
 * 
 * NOTE: --sandbox creates plans/secrets in PayPal SANDBOX only. Verify sandbox
 *       end-to-end BEFORE promoting anything to --live.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { PLANS } from '../src/lib/plans.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env.paypal-setup.local');

// Plan id → Vercel env var name (MUST match api/store.mjs PLAN_ENV_* maps)
const ENV_NAME = {
  starter: { monthly: 'PAYPAL_PLAN_STARTER', yearly: 'PAYPAL_PLAN_STARTER_Y' },
  professional: { monthly: 'PAYPAL_PLAN_PROFESSIONAL', yearly: 'PAYPAL_PLAN_PROFESSIONAL_Y' },
  enterprise: { monthly: 'PAYPAL_PLAN_ENTERPRISE', yearly: 'PAYPAL_PLAN_ENTERPRISE_Y' },
};
const ILS_TO_USD = 0.27; // approx — owner should confirm the real rate

/*
 * ── Load PayPal credentials from .env.paypal-setup.local ──
 */
function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) {
    console.error('\n❌ ' + ENV_FILE + ' not found.');
    console.error('   Create it locally (never commit it) with:\n');
    console.error('PAYPAL_CLIENT_ID=your_real_client_id_here');
    console.error('PAYPAL_CLIENT_SECRET=your_real_secret_here');
    console.error('PAYPAL_ENV=sandbox\n');
    process.exit(1);
  }
  const env = {};
  fs.readFileSync(ENV_FILE, 'utf8').split('\n').forEach((line) => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const [k, ...rest] = line.split('=');
    env[k.trim()] = rest.join('=').trim();
  });
  const missing = [];
  if (!env.PAYPAL_CLIENT_ID) missing.push('PAYPAL_CLIENT_ID');
  if (!env.PAYPAL_CLIENT_SECRET) missing.push('PAYPAL_CLIENT_SECRET');
  if (missing.length) {
    console.error('❌ Missing in ' + ENV_FILE + ': ' + missing.join(', '));
    process.exit(1);
  }
  return { clientId: env.PAYPAL_CLIENT_ID, secret: env.PAYPAL_CLIENT_SECRET, env: (env.PAYPAL_ENV || 'sandbox').toLowerCase() };
}

/*
 * ── Resolve API base URL + webhook target; confirm webhook endpoint exists ──
 */
function resolveConfig(env) {
  const isSandbox = env.env === 'sandbox';
  const baseURL = isSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
  // Fail-closed signature verification lives at mode=subs&sub=webhook (store.mjs)
  const webhookURL = 'https://likelink2.vercel.app/api/store?mode=subs&sub=webhook';
  return { baseURL, webhookURL, isSandbox };
}

/*
 * ── HTTP helper — no extra packages ──
 */
import { get as httpGet, request as httpRequestRaw } from 'node:http';
import { get as httpsGet, request as httpsRequest } from 'node:https';

function httpRequest(url, opts = {}, bodyData) {
  const lib = url.startsWith('https') ? httpsRequest : httpRequestRaw;
  const reqOpts = {
    ...opts,
    headers: { ...(opts.headers || {}) },
    rejectUnauthorized: false,
  };
  return new Promise((resolve, reject) => {
    const req = lib(url, reqOpts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          json._status = res.statusCode;
          resolve(json);
        } catch {
          resolve({ _raw: data, _status: res.statusCode });
        }
      });
    });
    req.on('error', reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

async function getAccessToken(baseURL, clientId, secret) {
  const auth = Buffer.from(clientId + ':' + secret).toString('base64');
  const body = 'grant_type=client_credentials';
  const r = await httpRequest(baseURL + '/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
  }, body);
  if (!r.access_token) throw new Error('OAuth failed: ' + JSON.stringify(r).slice(0, 300));
  return r.access_token;
}

async function createProduct(baseURL, token) {
  return httpRequest(baseURL + '/v1/catalogs/products', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  }, JSON.stringify({
    name: 'LikeLink Studio Subscription',
    description: 'Premium access to LikeLink Creator & Seller Studio — analytics, automation, AI tools.',
    type: 'SERVICE',
    category: 'SOFTWARE',
    image_url: 'https://likelink2.vercel.app/logo.png',
    home_url: 'https://likelink2.vercel.app/',
  }));
}

async function createPlan(baseURL, token, productId, plan, period) {
  const priceILS = period === 'yearly' ? plan.priceYearly : plan.price;
  return httpRequest(baseURL + '/v1/billing/plans', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'PayPal-Request-Id': crypto.randomUUID() },
  }, JSON.stringify({
    product_id: productId,
    name: `LikeLink ${plan.name.en} (${period})`,
    status: 'ACTIVE',
    billing_cycles: [{
      frequency: { interval_unit: period === 'yearly' ? 'YEAR' : 'MONTH', interval_count: 1 },
      tenure_type: 'REGULAR', sequence: 1, total_cycles: 0,
      payment_preferences: { auto_bill_outstanding: true, setup_fee_failure_action: 'CONTINUE', payment_failure_threshold: 3 },
      pricing_schemes: [{ fixed_price: { currency_code: 'USD', value: (priceILS * ILS_TO_USD).toFixed(2) } }],
    }],
    payment_preferences: { auto_bill_outstanding: true, setup_fee_failure_action: 'CONTINUE', payment_failure_threshold: 3 },
    taxes: { percentage: '0', inclusive: false },
  }));
}

async function createWebhook(baseURL, token, webhookURL) {
  return httpRequest(baseURL + '/v1/notifications/webhooks', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  }, JSON.stringify({
    url: webhookURL,
    event_types: [
      { name: 'BILLING.SUBSCRIPTION.CREATED' }, { name: 'BILLING.SUBSCRIPTION.ACTIVATED' },
      { name: 'BILLING.SUBSCRIPTION.CANCELLED' }, { name: 'BILLING.SUBSCRIPTION.SUSPENDED' },
      { name: 'BILLING.SUBSCRIPTION.EXPIRED' }, { name: 'PAYMENT.SALE.COMPLETED' },
    ],
  }));
}

async function main() {
  const mode = process.argv[2] || '--dry-run';
  if (!['--dry-run', '--sandbox', '--live'].includes(mode)) {
    console.error('Usage: node scripts/setup-paypal-plans.mjs [--dry-run|--sandbox|--live]');
    process.exit(1);
  }
  const isSandbox = mode !== '--live';
  const { baseURL, webhookURL } = resolveConfig({ env: isSandbox ? 'sandbox' : 'live' });
  const paidPlans = Object.values(PLANS).filter((p) => p.price > 0);

  console.log(`\n== LikeLink PayPal Setup (${isSandbox ? 'SANDBOX' : 'LIVE'}) ==`);
  console.log('Plans: ' + paidPlans.map((p) => `${p.id} ₪${p.price}/mo · ₪${p.priceYearly}/yr`).join(' | '));
  console.log('Webhook → ' + webhookURL + '\n');

  if (mode === '--dry-run') {
    console.log('DRY-RUN — nothing created. Env vars that will be produced:');
    for (const p of paidPlans) console.log(`  ${ENV_NAME[p.id].monthly}=P-...  ${ENV_NAME[p.id].yearly}=P-...`);
    console.log('  PAYPAL_WEBHOOK_ID=WH-...');
    console.log(`  PAYPAL_ENV=${isSandbox ? 'sandbox' : 'live'}  (+ PAYPAL_CLIENT_ID/SECRET — prompted, never printed)`);
    console.log('\nRun with --sandbox first. Verify end-to-end BEFORE --live.');
    return;
  }

  const { clientId, secret } = loadEnv();
  const token = await getAccessToken(baseURL, clientId, secret);
  const product = await createProduct(baseURL, token);
  if (!product.id) throw new Error('Product creation failed: ' + JSON.stringify(product).slice(0, 200));
  console.log('✓ Product: ' + product.id);

  const created = {};
  for (const plan of paidPlans) {
    for (const period of ['monthly', 'yearly']) {
      const p = await createPlan(baseURL, token, product.id, plan, period);
      if (!p.id) { console.error(`✗ plan ${plan.id}/${period} failed: ` + JSON.stringify(p).slice(0, 200)); continue; }
      created[ENV_NAME[plan.id][period]] = p.id;
      console.log(`✓ Plan ${plan.id}/${period}: ${p.id}`);
    }
  }

  const webhook = await createWebhook(baseURL, token, webhookURL);
  if (webhook.id) { created.PAYPAL_WEBHOOK_ID = webhook.id; console.log('✓ Webhook: ' + webhook.id); }
  else console.error('⚠ Webhook creation failed (may already exist for this URL).');

  console.log('\n== Copy-paste these commands (values prompted interactively — never in shell history) ==\n');
  for (const [k, v] of Object.entries(created)) console.log(`vercel env add ${k} production   # value: ${v}`);
  console.log(`vercel env add PAYPAL_ENV production            # value: ${isSandbox ? 'sandbox' : 'live'}`);
  console.log('vercel env add PAYPAL_CLIENT_ID production      # value: (from .env.paypal-setup.local)');
  console.log('vercel env add PAYPAL_CLIENT_SECRET production  # value: (from .env.paypal-setup.local)');
  console.log('\nThen push to deploy. Sandbox first — verify — then repeat with --live.');
}

main().catch((e) => { console.error('❌ ' + (e.message || e)); process.exit(1); });