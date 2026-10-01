// The Studio's per-reel state comes only from the publishing ledger: green
// (truth VERIFIED) only after a fresh read-back; external only with a provider id.
import test from "node:test";
import assert from "node:assert/strict";
import { reelStudioStatus, STALE_MS } from "../src/lib/publishing/studioStatus.js";

const NOW = Date.parse("2026-10-02T00:00:00Z");
const reel = { id: "reel_p_ugc_style_1", source: "likelink_native_render", truth: "SYNTHETIC_ANIMATION", videoUrl: "https://x/api/og?mode=media&path=ugc/p/a.mp4", audio: "aac" };
const at = (ms) => new Date(NOW - ms).toISOString();
const NEEDS = [{ destination: "instagram", status: "NEEDS_CONNECTION", providerId: null }];

test("no video file → GENERATED, never verified", () => {
  const s = reelStudioStatus({ ...reel, videoUrl: "" }, null, NOW);
  assert.equal(s.media, "GENERATED");
  assert.equal(s.truth, "OBSERVED");
});

test("stored but not yet checked by the sweep → OBSERVED, not green", () => {
  assert.deepEqual([reelStudioStatus(reel, null, NOW).media, reelStudioStatus(reel, null, NOW).truth], ["PUBLICATION_READY", "OBSERVED"]);
  assert.equal(reelStudioStatus({ ...reel, audio: null }, { state: "PENDING_CHECK", checkedAt: null }, NOW).media, "STORED");
});

test("read back on public surfaces → VERIFIED; old read-back → STALE", () => {
  const e = { state: "VERIFIED", checkedAt: at(1000), verified: ["media", "reels"], external: NEEDS };
  const s = reelStudioStatus(reel, e, NOW);
  assert.equal(s.media, "VERIFIED");
  assert.equal(s.truth, "VERIFIED");
  assert.deepEqual(s.source, ["NATIVE", "SYNTHETIC"], "a render is always labelled synthetic");
  assert.equal(s.external.length, 0, "NEEDS_CONNECTION is never an external publication");
  assert.equal(s.externalMissing[0].destination, "instagram");
  assert.equal(reelStudioStatus(reel, { ...e, checkedAt: at(STALE_MS + 1) }, NOW).truth, "STALE");
});

test("VERIFIED state without any verified surface is not green", () => {
  const s = reelStudioStatus(reel, { state: "VERIFIED", checkedAt: at(1000), verified: [] }, NOW);
  assert.equal(s.media, "PUBLISHED");
  assert.equal(s.truth, "OBSERVED");
});

test("catalog-integrity block → BLOCKED", () => {
  const s = reelStudioStatus(reel, { state: "BLOCKED", checkedAt: at(1000), verified: ["media"], blockedReason: "shared_affiliate_link" }, NOW);
  assert.deepEqual([s.media, s.truth, s.reason], ["BLOCKED", "BLOCKED", "shared_affiliate_link"]);
});

test("external counts only with the provider's id", () => {
  const e = { state: "VERIFIED", checkedAt: at(1000), verified: ["media"], external: [{ destination: "instagram", status: "PUBLISHED", providerId: "1789" }, { destination: "tiktok", status: "PUBLISHED", providerId: null }] };
  const s = reelStudioStatus(reel, e, NOW);
  assert.deepEqual(s.external, [{ destination: "instagram", providerId: "1789", status: "PUBLISHED" }]);
  assert.ok(s.source.includes("EXTERNAL"));
  assert.equal(s.externalMissing[0].destination, "tiktok");
});
