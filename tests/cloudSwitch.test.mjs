// The site's cloud is named in one place (src/constants/cloud.js). Host
// settings the owner has not changed yet may still name the retired project
// (restricted with 402 since 2026-10-08): the browser client and the ops
// doctor then follow the current project instead. Anything else the env says
// (local dev with nothing set, test fixtures, the Edge Function's own project)
// is kept. Only public values live here: the URL and the anon key.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CLOUD, RETIRED_CLOUD_REFS, isRetiredCloud, resolveCloud } from "../src/constants/cloud.js";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const OLD = "https://sbzzgfthgaurgcuxiuql.supabase.co";
const NEXT = { url: "https://abcdefghijklmnopqrst.supabase.co", anonKey: "public-anon" };

test("a retired project gives way to the current one; nothing else is replaced", () => {
  assert.ok(RETIRED_CLOUD_REFS.includes("sbzzgfthgaurgcuxiuql"));
  assert.equal(isRetiredCloud(OLD), true);
  assert.equal(isRetiredCloud(`${OLD}/`), true);
  assert.equal(isRetiredCloud("https://fixture.supabase.co"), false);
  assert.equal(isRetiredCloud("https://evil.example/sbzzgfthgaurgcuxiuql.supabase.co"), false);
  assert.deepEqual(resolveCloud(OLD, "old-key", NEXT), { ...NEXT, source: "retired_env_replaced" }, "URL and its own key move together");
  assert.deepEqual(resolveCloud("https://fixture.supabase.co", "fixture", NEXT), { url: "https://fixture.supabase.co", anonKey: "fixture", source: "env" });
  assert.deepEqual(resolveCloud("", "", NEXT), { url: "", anonKey: "", source: "none" }, "local dev and tests stay unconfigured");
  assert.deepEqual(resolveCloud(OLD, "old-key", { url: "", anonKey: "" }), { url: OLD, anonKey: "old-key", source: "env" }, "no current project yet: env decides");
});

// 2026-10-17: the Netlify build behind likelink2.vercel.app had no VITE_SUPABASE_*
// variables. The site read everything from the shipped copy and refused every
// write — a buyer's shop click was "click tracking not saved snapshot_read_only".
test("a production browser build with no project set uses the current project; dev and tests stay unconfigured", () => {
  assert.deepEqual(resolveCloud("", "", NEXT, { production: true }), { ...NEXT, source: "production_default" });
  assert.deepEqual(resolveCloud("https://abcdefghijklmnopqrst.supabase.co", "", NEXT, { production: true }), { ...NEXT, source: "production_default" }, "a URL without its key is no pair: the current pair, together");
  assert.deepEqual(resolveCloud("", "", NEXT, { production: false }), { url: "", anonKey: "", source: "none" });
  assert.deepEqual(resolveCloud("", "", NEXT), { url: "", anonKey: "", source: "none" }, "the default is not production");
  assert.deepEqual(resolveCloud("https://fixture.supabase.co", "fixture", NEXT, { production: true }), { url: "https://fixture.supabase.co", anonKey: "fixture", source: "env" }, "a set pair is kept");
  assert.deepEqual(resolveCloud(OLD, "old-key", NEXT, { production: true }), { ...NEXT, source: "retired_env_replaced" });
  assert.deepEqual(resolveCloud("", "", { url: "", anonKey: "" }, { production: true }), { url: "", anonKey: "", source: "none" }, "no current project: nothing to fall back to");
});

test("the current project, once set, is a real public pair and never the retired one", () => {
  if (!CLOUD.url) return;
  assert.match(CLOUD.url, /^https:\/\/[a-z0-9]{20}\.supabase\.co$/);
  assert.equal(isRetiredCloud(CLOUD.url), false);
  assert.ok(CLOUD.anonKey.length > 20);
  const payload = CLOUD.anonKey.startsWith("eyJ") ? JSON.parse(Buffer.from(CLOUD.anonKey.split(".")[1], "base64url").toString()) : null;
  if (payload) {
    assert.equal(payload.role, "anon", "only the public anon key, never the service role");
    assert.equal(payload.ref, CLOUD.ref);
  }
  const redirects = read("public/_redirects");
  for (const ref of RETIRED_CLOUD_REFS) assert.doesNotMatch(redirects, new RegExp(ref), "the API proxy no longer points at a retired project");
  assert.match(redirects, new RegExp(`${CLOUD.ref}\\.supabase\\.co/functions/v1/api/:splat`));
});

test("scheduled runs never render into Storage (the quota that restricted the project)", () => {
  const wf = read(".github/workflows/media-render.yml");
  const step = wf.split(/\n\s+- name: /).find((s) => s.startsWith("Render, verify and publish reels"));
  assert.ok(step, "the render step exists");
  assert.match(step, /\n\s+if: github\.event_name == 'workflow_dispatch'\n/, "rendering into Storage is on demand only");
  assert.match(wf, /schedule:/, "the daily audit / Instagram / LikeLoop steps still run");
});

test("the browser client and the ops doctor both resolve through it", () => {
  assert.match(read("src/lib/supabaseClient.js"), /resolveCloud\(getEnv\("VITE_SUPABASE_URL"\), getEnv\("VITE_SUPABASE_ANON_KEY"\), CLOUD, \{ production: isBrowser\(\) && getEnv\("MODE"\) === "production" \}\)/, "a production browser build with no env follows CLOUD; dev and tests do not");
  assert.match(read("scripts/ops/doctor.mjs"), /resolveCloud\(process\.env\.VITE_SUPABASE_URL/);
  assert.doesNotMatch(read("src/constants/cloud.js"), /service_role|SERVICE_ROLE_KEY\s*[:=]/, "no server secret in a browser module");
});
