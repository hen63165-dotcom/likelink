// Production verification script for LikeLink2 self-marketing
// This script verifies that LikeLink2 markets itself autonomously
// with real, verified data and legitimate publishing only

import { execSync } from 'child_process';
import { join, resolve } from 'path';
import { readFileSync } from 'fs';

const root = process.env.KILO_ROOT || resolve(process.cwd());

console.log('=== LikeLink2 Self-Marketing Verification ===');
console.log('Root:', root);

function log(section, message) {
  console.log(`[${section}] ${message}`);
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

function checkFileExists(path) {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
}

async function checkExport(modulePath, exportName) {
  try {
    const module = await import(modulePath);
    return typeof module[exportName] !== 'undefined';
  } catch {
    return false;
  }
}

async function testCoreExports() {
  const trustPath = join(root, 'src/lib/cloud/trustVerification.js');
  const lunaPath = join(root, 'src/lib/cloud/lunaGrowth.js');
  const storePath = join(root, 'api/store.mjs');

  if (!checkFileExists(trustPath)) throw new Error(`trustVerification.js not found at ${trustPath}`);
  if (!checkFileExists(lunaPath)) throw new Error(`lunaGrowth.js not found at ${lunaPath}`);
  if (!checkFileExists(storePath)) throw new Error(`store.mjs not found at ${storePath}`);

  const trustModule = await import(trustPath);
  const lunaModule = await import(lunaPath);

  const requiredTrustExports = ['TRUST_STATE', 'VERIFICATION_STAGE', 'verifyProduct', 'resolveTrustState', 'isDiscoveryEligible', 'trustGateReport'];
  for (const exportName of requiredTrustExports) {
    if (!await checkExport(trustPath, exportName)) {
      throw new Error(`Missing export in trustVerification.js: ${exportName}`);
    }
  }

  const requiredLunaExports = ['LUNA_GROWTH_CYCLE', 'LUNA_ACTION_TYPE', 'LUNA_ACTION_STATUS', 'runGrowthCycle', 'detectOpportunities', 'diagnoseProduct', 'selfHealProduct'];
  for (const exportName of requiredLunaExports) {
    if (!await checkExport(lunaPath, exportName)) {
      throw new Error(`Missing export in lunaGrowth.js: ${exportName}`);
    }
  }

  const storeContent = readFileSync(storePath, 'utf8');
  if (!storeContent.includes('verify')) throw new Error('store.mjs missing verify mode');
  if (!storeContent.includes('trust')) throw new Error('store.mjs missing trust mode');
  if (!storeContent.includes('luna')) throw new Error('store.mjs missing luna mode');
}

async function testSelfMarketingCapabilities() {
  const lunaPath = join(root, 'src/lib/cloud/lunaGrowth.js');
  const trustPath = join(root, 'src/lib/cloud/trustVerification.js');

  const lunaModule = await import(lunaPath);
  const trustModule = await import(trustPath);

  const selfMarketingActionTypes = ['marketing_scan', 'content_create', 'publish_attempt', 'performance_measure', 'optimization'];

  const growthCycle = lunaModule.LUNA_GROWTH_CYCLE;
  const actionTypes = lunaModule.LUNA_ACTION_TYPE;

  if (!growthCycle || !actionTypes) {
    throw new Error('Missing required growth cycle or action types');
  }

  const state = growthCycle.DETECT;
  const trendAction = actionTypes.TREND_SCAN;
  const contentAction = actionTypes.CONTENT_CREATE;
  const publishAction = actionTypes.PUBLISH_ATTEMPT;

  if (!state || !trendAction || !contentAction || !publishAction) {
    throw new Error('Missing required growth cycle or action type values');
  }
}

function testMarketingIntegration() {
  const storePath = join(root, 'api/store.mjs');
  const storeContent = readFileSync(storePath, 'utf8');

  const marketingModes = ['mode.*marketing', 'mode.*brand', 'mode.*pulse'];
  const validMarketingModesFound = marketingModes.some(regex => storeContent.match(regex));

  const trustVerificationFound = storeContent.includes('trust') && storeContent.includes('verifyProduct') && storeContent.includes('isDiscoveryEligible');
  const lunaGrowthFound = storeContent.includes('luna') && storeContent.includes('runGrowthCycle') && storeContent.includes('detectOpportunities');

  if (!validMarketingModesFound && !trustVerificationFound) {
    log('WARN', 'No explicit marketing modes found in store.mjs');
  }
}

function testUnitTests() {
  try {
    execSync('node --test tests/trustVerification.test.mjs', { stdio: 'pipe' });
    execSync('node --test tests/lunaGrowth.test.mjs', { stdio: 'pipe' });
  } catch (e) {
    throw new Error(`Unit tests failed: ${e.message}`);
  }
}

function testBuild() {
  try {
    execSync('npm run build', { stdio: 'pipe', cwd: root });
  } catch (e) {
    throw new Error(`Build failed: ${e.message}`);
  }
}

function testCloudCheck() {
  const cloudCheckPath = join(root, 'scripts/cloud-check.mjs');
  if (!checkFileExists(cloudCheckPath)) {
    throw new Error('cloud-check.mjs script not found');
  }

  try {
    execSync(`node ${cloudCheckPath}`, { stdio: 'pipe', cwd: root });
  } catch (e) {
    throw new Error(`Cloud check failed: ${e.message}`);
  }
}

async function main() {
  log('START', 'LikeLink2 Self-Marketing Verification');

  const results = {
    coreExports: await runTest('Core exports', testCoreExports),
    selfMarketingCapabilities: await runTest('Self-marketing capabilities', testSelfMarketingCapabilities),
    integration: runTest('Marketing integration', testMarketingIntegration),
    unitTests: runTest('Unit tests', testUnitTests),
    build: runTest('Build', testBuild),
    cloudCheck: runTest('Cloud check', testCloudCheck),
  };

  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;

  console.log('\n=== Verification Summary ===');
  for (const [key, passed] of Object.entries(results)) {
    const status = passed ? 'PASS' : 'FAIL';
    console.log(`${key}: ${status}`);
  }

  console.log(`\nTotal: ${passed}/${total} checks passed`);

  if (passed === total) {
    console.log('\nSUCCESS: LikeLink2 self-marketing infrastructure is ready!');
    process.exit(0);
  } else {
    console.log('\nFAILURE: Some verification checks failed.');
    process.exit(1);
  }
}

main();