// LikeLink Studio, the owner's Claude Code plugin (2026-10-23: "build me my own
// skills system and publish it on GitHub"): installed with
//   /plugin marketplace add hen63165-dotcom/likelink
//   /plugin install likelink-studio@likelink
// These tests keep it installable and honest: the marketplace and manifest
// names agree, every skill has its frontmatter, every repository file a skill
// points to exists, the README lists every command, and no skill carries a
// secret or promises a viral result.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (f) => readFileSync(new URL(f, root), "utf8");
const market = JSON.parse(read(".claude-plugin/marketplace.json"));
const PLUGIN = "plugins/likelink-studio";
const manifest = JSON.parse(read(`${PLUGIN}/.claude-plugin/plugin.json`));
const skills = readdirSync(new URL(`${PLUGIN}/skills/`, root));

test("the marketplace lists the plugin under the manifest's own name", () => {
  assert.equal(market.name, "likelink");
  assert.ok(market.owner?.name);
  const entry = market.plugins.find((p) => p.name === manifest.name);
  assert.ok(entry, "entry name = manifest name (or installs fail)");
  assert.equal(entry.source, `./${PLUGIN}`);
  assert.ok(!entry.source.includes(".."));
  assert.ok(existsSync(new URL(`${PLUGIN}/.claude-plugin/icon.png`, root)));
});

test("every skill has its name and a description, and the README lists its command", () => {
  const readme = read(`${PLUGIN}/README.md`);
  assert.ok(skills.length >= 8);
  for (const s of skills) {
    const md = read(`${PLUGIN}/skills/${s}/SKILL.md`);
    const front = md.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(front, `${s}: frontmatter`);
    assert.match(front[1], new RegExp(`^name: ${s}$`, "m"));
    assert.match(front[1], /^description: .{60,}/m);
    assert.match(readme, new RegExp(`/likelink-studio:${s}\\b`), `${s} in the README`);
  }
});

test("every repository file a skill points to exists", () => {
  for (const s of skills) {
    const md = read(`${PLUGIN}/skills/${s}/SKILL.md`);
    const paths = [...md.matchAll(/`((?:scripts|src|tests|public|\.github|\.claude|plugins)\/[A-Za-z0-9_./-]+?)`/g)].map((m) => m[1]);
    for (const p of paths) {
      if (/[<>]|\*/.test(p) || /story-<|<id>/.test(p)) continue;
      assert.ok(existsSync(new URL(p, root)), `${s}: ${p} exists`);
    }
  }
});

test("no secret, no paid switch turned on, no promise of a viral reel", () => {
  for (const s of skills) {
    const md = read(`${PLUGIN}/skills/${s}/SKILL.md`);
    assert.doesNotMatch(md, /(sk-[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{12,})/, `${s}: no secrets`);
    assert.doesNotMatch(md, /PAID_GENERATION=enabled/, `${s}: never turns the paid lock on`);
    assert.doesNotMatch(md, /מובטח|guaranteed viral|בוודאות יתפוצץ/, `${s}: no promises`);
  }
});
