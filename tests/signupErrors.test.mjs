// Signup errors name the real problem: a missing name is never reported as an
// invalid email (that mix-up showed "invalid email" and then "already
// registered" for the same address). Source contract — the context needs a
// browser to run.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ctx = readFileSync("src/context/MarketplaceContext.jsx", "utf8");
const signup = ctx.slice(ctx.indexOf("onSignup: async"), ctx.indexOf("onSignup: async") + 1500);

test("signup checks the email and the name separately", () => {
  assert.match(signup, /if \(!isValidEmail\(cleanEmail\)\) return \{ ok: false, error: t\("auth\.errEmail"\) \};/);
  assert.match(signup, /if \(!cleanName\) return \{ ok: false, error: t\("auth\.errName"\) \};/);
  assert.doesNotMatch(signup, /!cleanName \|\| !isValidEmail/);
});

test("an existing account with the right password signs in instead of a dead end", () => {
  assert.match(ctx, /const login = await signInSeller\(\{ email: cleanEmail, password \}\);\s*if \(login\.ok\) return openStudioForVerifiedUser/);
});
