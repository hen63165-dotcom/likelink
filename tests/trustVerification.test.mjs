import test from "node:test";
import assert from "node:assert/strict";
import {
  TRUST_STATE,
  VERIFICATION_STAGE,
  verifyDestinationUrl,
  verifyDomainIdentity,
  verifyRedirectSafety,
  verifyProductIdentity,
  checkPolicyViolations,
  verifyOwnership,
  verifyAttribution,
  verifyAffiliateDisclosure,
  createVerificationRecord,
  verifyProduct,
  verifyCatalog,
  isDiscoveryEligible,
  trustGateReport,
  resolveTrustState,
} from "../src/lib/cloud/trustVerification.js";

const { VERIFIED, CHECK_REQUIRED, REJECTED, EXPIRED, SUSPENDED, SOURCE_UNAVAILABLE } = TRUST_STATE;

test("verifyDestinationUrl accepts valid https URL", () => {
  const result = verifyDestinationUrl("https://s.click.aliexpress.com/e/_test");
  assert.equal(result.status, VERIFIED);
  assert.equal(result.parsed.hostname, "s.click.aliexpress.com");
});

test("verifyDestinationUrl rejects non-http scheme (javascript:)", () => {
  const result = verifyDestinationUrl("javascript:alert(1)");
  assert.equal(result.status, REJECTED);
});

test("verifyDestinationUrl rejects invalid URL format", () => {
  const result = verifyDestinationUrl("not-a-url");
  assert.equal(result.status, REJECTED);
});

test("verifyDestinationUrl rejects empty URL", () => {
  const result = verifyDestinationUrl("");
  assert.equal(result.status, REJECTED);
});

test("verifyDestinationUrl rejects url shorteners", () => {
  const result = verifyDestinationUrl("https://bit.ly/123abc");
  assert.equal(result.status, REJECTED);
});

test("verifyDomainIdentity recognizes known affiliate platform", () => {
  const result = verifyDomainIdentity("https://s.click.aliexpress.com/e/_test");
  assert.equal(result.status, VERIFIED);
  assert.equal(result.sourceType, "affiliate_platform");
});

test("verifyDomainIdentity flags unknown domain for manual review", () => {
  const result = verifyDomainIdentity("https://example-unknown-store.com/product");
  assert.equal(result.status, CHECK_REQUIRED);
});

test("verifyRedirectSafety rejects excessive query params", () => {
  let url = "https://example.com?";
  for (let i = 0; i < 20; i++) url += "p" + i + "=v" + i + "&";
  const result = verifyRedirectSafety(url);
  assert.equal(result.status, CHECK_REQUIRED);
});

test("verifyRedirectSafety accepts normal URL", () => {
  const result = verifyRedirectSafety("https://s.click.aliexpress.com/e/_test");
  assert.equal(result.status, VERIFIED);
});

test("verifyProductIdentity accepts complete product", () => {
  const product = { id: "p1", title: "Test Product", price: 99, affiliateUrl: "https://s.click.aliexpress.com/e/_test" };
  const result = verifyProductIdentity(product);
  assert.equal(result.status, VERIFIED);
});

test("verifyProductIdentity rejects missing title", () => {
  const result = verifyProductIdentity({ id: "p1", price: 99 });
  assert.equal(result.status, CHECK_REQUIRED);
});

test("verifyProductIdentity rejects no product", () => {
  const result = verifyProductIdentity(null);
  assert.equal(result.status, REJECTED);
});

test("checkPolicyViolations flags scarcity language", () => {
  const product = { title: "Limited time offer!", description: "Buy now, only today!" };
  const result = checkPolicyViolations(product);
  assert.equal(result.status, REJECTED);
});

test("checkPolicyViolations accepts clean product", () => {
  const result = checkPolicyViolations({ title: "Silver Ring 925", description: "Elegant ring." });
  assert.equal(result.status, VERIFIED);
});

test("verifyOwnership accepts correct owner", () => {
  const product = { id: "p1", marketerId: "marketer_1" };
  const actor = { id: "marketer_1", authenticated: true };
  const result = verifyOwnership(product, actor);
  assert.equal(result.status, VERIFIED);
});

test("verifyOwnership rejects ownership mismatch", () => {
  const product = { id: "p1", marketerId: "marketer_1" };
  const actor = { id: "marketer_2", authenticated: true };
  const result = verifyOwnership(product, actor);
  assert.equal(result.status, REJECTED);
});

test("verifyOwnership rejects unauthenticated actor", () => {
  const result = verifyOwnership({ id: "p1", marketerId: "m1" }, null);
  assert.equal(result.status, REJECTED);
});

test("verifyAttribution accepts known marketer", () => {
  const product = { id: "p1", marketerId: "m1" };
  const marketers = [{ id: "m1", name: "Test Marketer" }];
  const result = verifyAttribution(product, marketers);
  assert.equal(result.status, VERIFIED);
});

test("verifyAttribution flags unknown marketer", () => {
  const result = verifyAttribution({ id: "p1", marketerId: "m_unknown" }, [{ id: "m1" }]);
  assert.equal(result.status, CHECK_REQUIRED);
});

test("verifyAffiliateDisclosure detects disclosure keywords", () => {
  const product = { title: "Product", description: "This is an affiliate link" };
  const result = verifyAffiliateDisclosure(product);
  assert.equal(result.status, VERIFIED);
});

test("verifyProduct returns record for valid product", () => {
  const product = { id: "p1", title: "Ring", price: 10, affiliateUrl: "https://s.click.aliexpress.com/e/_t", marketerId: "m1" };
  const record = verifyProduct({ product, actor: { id: "m1", authenticated: true }, marketers: [{ id: "m1", name: "Creator" }] });
  assert.ok(record.verificationId);
  assert.ok(record.assertions.length > 0);
});

test("isDiscoveryEligible rejects non-verified records", () => {
  assert.equal(isDiscoveryEligible({ state: CHECK_REQUIRED, assertions: [] }), false);
});

test("isDiscoveryEligible accepts verified with ownership + attribution", () => {
  const record = {
    state: VERIFIED,
    assertions: [
      { stage: VERIFICATION_STAGE.OWNERSHIP, status: VERIFIED },
      { stage: VERIFICATION_STAGE.ATTRIBUTION, status: VERIFIED },
    ],
  };
  assert.equal(isDiscoveryEligible(record), true);
});

test("isDiscoveryEligible rejects verified without attribution", () => {
  const record = {
    state: VERIFIED,
    assertions: [
      { stage: VERIFICATION_STAGE.OWNERSHIP, status: VERIFIED },
      { stage: VERIFICATION_STAGE.ATTRIBUTION, status: CHECK_REQUIRED },
    ],
  };
  assert.equal(isDiscoveryEligible(record), false);
});

test("trustGateReport explains failures to owner", () => {
  const report = trustGateReport({
    state: REJECTED,
    assertions: [],
    evidence: [],
    failures: [{ stage: VERIFICATION_STAGE.OWNERSHIP, status: REJECTED, reason: "ownership_mismatch" }],
    repairAction: "fix_violation",
  });
  assert.equal(report.eligible, false);
  assert.ok(report.details.length > 0);
});

test("trustGateReport handles missing record", () => {
  const report = trustGateReport(null);
  assert.equal(report.eligible, false);
});

test("resolveTrustState prioritizes REJECTED over VERIFIED", () => {
  const assertions = [
    { stage: "a", status: VERIFIED },
    { stage: "b", status: REJECTED, reason: "ownership_mismatch" },
  ];
  const result = resolveTrustState(assertions);
  assert.equal(result.state, TRUST_STATE.REJECTED);
});

test("resolveTrustState returns VERIFIED when all pass", () => {
  const result = resolveTrustState([
    { stage: "a", status: VERIFIED },
    { stage: "b", status: VERIFIED },
  ]);
  assert.equal(result.state, TRUST_STATE.VERIFIED);
});

test("verifyProduct rejects policy violations", () => {
  const product = { id: "p1", title: "Limited time!!!", price: 99, affiliateUrl: "https://s.click.aliexpress.com/e/_t", marketerId: "m1" };
  const record = verifyProduct({ product, actor: { id: "m1", authenticated: true }, marketers: [{ id: "m1" }] });
  const policyCheck = record.assertions.find((a) => a.stage === VERIFICATION_STAGE.POLICY_VIOLATION);
  assert.equal(policyCheck.status, REJECTED);
});

test("TRUST_STATE contains all required states", () => {
  assert.ok(VERIFIED);
  assert.ok(CHECK_REQUIRED);
  assert.ok(REJECTED);
  assert.ok(EXPIRED);
  assert.ok(SUSPENDED);
  assert.ok(SOURCE_UNAVAILABLE);
});

test("VERIFICATION_STAGE contains all required stages", () => {
  assert.ok(VERIFICATION_STAGE.DESTINATION_URL);
  assert.ok(VERIFICATION_STAGE.OWNERSHIP);
  assert.ok(VERIFICATION_STAGE.ATTRIBUTION);
  assert.ok(VERIFICATION_STAGE.PROVENANCE);
});
