// Luna reel episodes (scripts/luna_reels/episodes/*.json) against the site's
// own claim rules, so the Python engine and the site never disagree:
//   • no hook or line says what LikeLink forbids (FORBIDDEN_CLAIMS, HOOK_FORBIDDEN),
//   • a product claim is in that product's own listing, and the product is listed,
//   • every episode ends with a call to action, and only a product episode asks for "רוצה".
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { FORBIDDEN_CLAIMS } from "../src/lib/discovery/distribution.js";
import { HOOK_FORBIDDEN } from "../src/lib/growth/likeloop.js";

const DIR = new URL("../scripts/luna_reels/episodes/", import.meta.url);
const episodes = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(new URL(f, DIR), "utf8")));
const products = JSON.parse(readFileSync(new URL("../public/snapshot/kv.json", import.meta.url), "utf8")).keys["marketplace:products"];

test("episodes exist and have ids that match their files", () => {
  assert.ok(episodes.length >= 5);
  for (const e of episodes) assert.match(e.id, /^[a-z0-9][a-z0-9-]{1,48}$/);
});

test("no episode says what the site forbids", () => {
  for (const e of episodes) {
    const texts = [e.hook, ...(e.hooks || []), ...e.lines.flatMap((l) => [l.say, l.caption]), e.cta?.title, e.cta?.sub].filter(Boolean);
    for (const t of texts) {
      assert.doesNotMatch(t, FORBIDDEN_CLAIMS, `${e.id}: ${t}`);
      // A product episode also keeps to the product-hook rule (no "sale", "everyone", "I bought").
      // A tip episode may name a sale to question it ("המבצע הזה באמת מבצע?").
      if (e.product) assert.doesNotMatch(t.replace(/\*/g, ""), HOOK_FORBIDDEN, `${e.id}: ${t}`);
    }
  }
});

test("a product claim is the seller's own words, on a listed product", () => {
  for (const e of episodes.filter((x) => x.product)) {
    const p = products.find((x) => x.id === e.product.id);
    assert.ok(p, `${e.id}: ${e.product.id} is not in the public catalog copy`);
    assert.ok(e.product.mustMatch, `${e.id}: a claim needs mustMatch`);
    assert.ok(`${p.title} ${p.description}`.includes(e.product.mustMatch), `${e.id}: "${e.product.mustMatch}" is not in the listing`);
    assert.match(e.product.claim, /^המוכר מציין/);
  }
});

test("every episode ends with a call to action; only product episodes ask for the comment keyword", () => {
  for (const e of episodes) {
    assert.ok(e.cta?.title, `${e.id}: no call to action`);
    assert.equal(/רוצה/.test(e.cta.title), Boolean(e.product), `${e.id}: "רוצה" belongs to product episodes (the bot sends that product's link)`);
  }
});
