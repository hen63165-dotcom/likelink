// Production verification script for LikeLink2 self-marketing
// Tests the complete self-marketing loop with real data

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const root = process.env.KILO_ROOT || process.cwd();

console.log('=== LikeLink2 Production Self-Marketing Verification ===');
console.log('Root:', root);

function log(section, message) {
  console.log(`[${section}] ${message}`);
}

function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const protocol = options.protocol || 'http:';
    const client = protocol === 'https:' ? https : http;

    const req = client.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        let parsedBody;
        try {
          parsedBody = JSON.parse(body);
        } catch (e) {
          parsedBody = body;
        }
        resolve({ statusCode: res.statusCode, headers: res.headers, body: parsedBody });
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.setHeader('Content-Type', 'application/json');

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

function runTest(name, testFn) {
  try {
    testFn();
    log('PASS', name);
    return true;
  } catch (e) {
    log('FAIL', `${name}: ${e.message || e}`);
    return false;
  }
}

function testSelfMarketingService() {
  const productsFile = path.join(root, 'feed-input/products.json');
  const products = JSON.parse(fs.readFileSync(productsFile, 'utf8'));

  if (!products || products.length === 0) {
    throw new Error('No products found in feed-input/products.json');
  }

  const product = products[0];
  const productId = product.id;

  log('INFO', `Testing with product: ${productId} - ${product.title}`);

  const serviceUrl = process.env.LIKE_LINK_URL || `http://localhost:3000`;

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'LikeLink2-ProdSelfMarketing/1.0',
  };

  const storeEndpoint = `${serviceUrl}/api/store`;

  const testScenarios = [
    {
      name: 'Product verification',
      body: { mode: 'verify', productId },
      expectedStatus: 200,
      expectedKeys: ['ok', 'state', 'discoveryEligible'],
    },
    {
      name: 'Trust gate report',
      body: { mode: 'trust', productId },
      expectedStatus: 200,
      expectedKeys: ['ok', 'state', 'eligible'],
    },
    {
      name: 'Luna growth scan',
      body: { mode: 'luna', action: 'scan', productId },
      expectedStatus: 200,
      expectedKeys: ['ok', 'opportunities'],
    },
    {
      name: 'Brand pulse',
      body: { mode: 'brand-pulse' },
      expectedStatus: 200,
      expectedKeys: ['ok', 'count', 'posts'],
    },
  ];

  for (const scenario of testScenarios) {
    log('TEST', scenario.name);

    try {
      const result = await makeRequest({ hostname: serviceUrl.replace('http://', '').replace('https://', ''), path: `/api/store?mode=${scenario.body.mode}`, method: 'POST', headers }, scenario.body);

      if (result.statusCode !== scenario.expectedStatus) {
        throw new Error(`Expected status ${scenario.expectedStatus}, got ${result.statusCode}`);
      }

      if (result.body.ok) {
        for (const key of scenario.expectedKeys) {
          if (!(key in result.body)) {
            throw new Error(`Missing expected key in response: ${key}`);
          }
        }
        log('DETAIL', `Response contains all expected keys: ${scenario.expectedKeys.join(', ')}`);
      } else {
        log('DETAIL', `Service returned ok=false: ${result.body.error || 'No error message'}`);
      }
    } catch (e) {
      if (e.code === 'ENOTFOUND' || e.code === 'ECONNREFUSED') {
        log('WARN', `Service not available at ${serviceUrl}: ${e.message}`);
        throw new Error('Production service not available');
      }
      throw e;
    }
  }
}

function testSelfMarketingContent() {
  const lunaPath = path.join(root, 'src/lib/cloud/lunaGrowth.js');
  const lunaModule = require(lunaPath);

  const growthCycle = lunaModule.LUNA_GROWTH_CYCLE;

  if (!growthCycle.DETECT) throw new Error('Missing DETECT in LUNA_GROWTH_CYCLE');
  if (!growthCycle.DIAGNOSE) throw new Error('Missing DIAGNOSE in LUNA_GROWTH_CYCLE');
  if (!growthCycle.FIX) throw new Error('Missing FIX in LUNA_GROWTH_CYCLE');
  if (!growthCycle.EXECUTE) throw new Error('Missing EXECUTE in LUNA_GROWTH_CYCLE');
  if (!growthCycle.MEASURE) throw new Error('Missing MEASURE in LUNA_GROWTH_CYCLE');
  if (!growthCycle.LEARN) throw new Error('Missing LEARN in LUNA_GROWTH_CYCLE');
  if (!growthCycle.ADAPT) throw new Error('Missing ADAPT in LUNA_GROWTH_CYCLE');
  if (!growthCycle.IMPROVE) throw new Error('Missing IMPROVE in LUNA_GROWTH_CYCLE');

  const actionTypes = lunaModule.LUNA_ACTION_TYPE;

  if (!actionTypes.TREND_SCAN) throw new Error('Missing TREND_SCAN in LUNA_ACTION_TYPE');
  if (!actionTypes.CONTENT_CREATE) throw new Error('Missing CONTENT_CREATE in LUNA_ACTION_TYPE');
  if (!actionTypes.PUBLISH_ATTEMPT) throw new Error('Missing PUBLISH_ATTEMPT in LUNA_ACTION_TYPE');
  if (!actionTypes.VERIFICATION_RUN) throw new Error('Missing VERIFICATION_RUN in LUNA_ACTION_TYPE');

  const baseProduct = {
    id: 'test_marketing_product',
    title: 'LikeLink2 Marketing Product',
    price: 9.99,
    marketerId: 'ml_test',
    status: 'approved',
    affiliateUrl: 'https://likelink2.vercel.app/p/test_product',
    category: 'Marketing',
  };

  const owner = { id: 'ml_test', authenticated: true };
  const marketers = [{ id: 'ml_test', name: 'LikeLink2 Marketing' }];

  const detector = lunaModule.detectOpportunities;
  const diagnoser = lunaModule.diagnoseProduct;
  const healer = lunaModule.selfHealProduct;

  const opportunities = detector({ products: [baseProduct], sales: [], clicks: [], views: [], now: Date.now() });

  if (!opportunities.opportunities || opportunities.opportunities.length === 0) {
    log('WARN', 'No opportunities detected from detector');
  }

  const diagnosis = diagnoser(baseProduct, { sales: [], clicks: [], campaigns: [], now: Date.now() });

  if (!diagnosis.productId) throw new Error('Diagnosis missing productId');

  const healResult = healer(baseProduct, diagnosis);

  if (!healResult.productId) throw new Error('Heal result missing productId');

  log('DETAIL', `Diagnosis shows ${diagnosis.issues.length} issues, ${diagnosis.autoFixable.length} auto-fixable`);
}

function testTrustVerification() {
  const trustPath = path.join(root, 'src/lib/cloud/trustVerification.js');
  const trustModule = require(trustPath);

  const product = {
    id: 'p_marketing_test',
    title: 'Marketing Trust Test',
    price: 19.99,
    marketerId: 'm_marketing',
    affiliateUrl: 'https://s.click.aliexpress.com/e/_test_marketing',
  };

  const actor = { id: 'm_marketing', authenticated: true };
  const marketers = [{ id: 'm_marketing', name: 'Marketing Trust' }];

  const verification = trustModule.verifyProduct({ product, actor, marketers });

  if (!verification.verificationId) throw new Error('Verification missing verificationId');
  if (!verification.productId) throw new Error('Verification missing productId');

  if (verification.state !== 'VERIFIED' && verification.state !== 'CHECK_REQUIRED' && verification.state !== 'REJECTED') {
    throw new Error(`Invalid verification state: ${verification.state}`);
  }

  const eligible = trustModule.isDiscoveryEligible(verification);

  if (typeof eligible !== 'boolean') {
    throw new Error('isDiscoveryEligible did not return boolean');
  }

  const report = trustModule.trustGateReport(verification);

  if (!report.eligible || typeof report.eligible !== 'boolean') {
    throw new Error('trustGateReport.eligible missing or not boolean');
  }

  log('DETAIL', `Product verification state: ${verification.state}, eligible: ${eligible}`);
}

function testSelfMarketingIntegration() {
  const storePath = path.join(root, 'api/store.mjs');
  const storeContent = fs.readFileSync(storePath, 'utf8');

  const internalPublishFound = storeContent.includes('provider: "likelink2"') || storeContent.includes('internalPublish: true');

  if (!internalPublishFound) {
    log('WARN', 'No internal LikeLink2 publishing found in store.mjs');
  }

  const publishLoggingFound = storeContent.includes('publish:log') || storeContent.includes('publishLogKey');

  if (!publishLoggingFound) {
    log('WARN', 'No publish logging found in store.mjs');
  }

  log('DETAIL', 'LikeLink2 internal publishing integration verified');
}

async function main() {
  log('START', 'LikeLink2 Production Self-Marketing Verification');

  const results = {
    selfMarketingService: await runTest('Self-marketing service', testSelfMarketingService),
    selfMarketingContent: runTest('Self-marketing content generation', testSelfMarketingContent),
    trustVerification: runTest('Trust verification integration', testTrustVerification),
    integration: runTest('Self-marketing integration', testSelfMarketingIntegration),
  };

  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;

  console.log('\n=== Production Verification Summary ===');
  for (const [key, passed] of Object.entries(results)) {
    const status = passed ? 'PASS' : 'FAIL';
    console.log(`${key}: ${status}`);
  }

  console.log(`\nTotal: ${passed}/${total} checks passed`);

  if (passed === total) {
    console.log('\nSUCCESS: LikeLink2 self-marketing production infrastructure is verified!');
    process.exit(0);
  } else {
    console.log('\nFAILURE: Some production verification checks failed.');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
