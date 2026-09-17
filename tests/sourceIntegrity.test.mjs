// Source integrity guard: every source file must stay clean UTF-8 text.
//
// A previous edit appended a UTF-16-encoded blob (raw NUL bytes) after the
// final catch block of scripts/add-product.mjs. Git treated the whole file as
// binary and Node refused to parse it ("Invalid or unexpected token"). This
// test fails if any raw NUL byte or BOM ever re-enters a source file.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".vercel", "coverage", ".kilo"]);
const SOURCE_EXT = /\.(js|jsx|mjs|cjs|ts|tsx|json|css|html|txt|xml|md)$/;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // unreadable dir (permissions) — skip, not a source problem
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue; // dot-dirs/dotfiles are not shipped source
    if (SKIP_DIRS.has(entry.name)) continue; // third-party/build output — not our source
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full, out); continue; }
    if (SOURCE_EXT.test(entry.name)) out.push(full);
  }
  return out;
}

test("no source file contains raw NUL bytes or a stray BOM mid-file", () => {
  const offenders = [];
  for (const file of walk(ROOT)) {
    const buf = readFileSync(file);
    if (buf.includes(0)) {
      offenders.push(`${path.relative(ROOT, file)}: contains raw NUL byte(s) (encoding corruption)`);
      continue;
    }
    // A UTF-8 BOM is legal only as the very first bytes of a file. Anywhere
    // else (EF BB BF at an offset > 0) it is concatenation corruption.
    if (buf.indexOf(Buffer.from([0xef, 0xbb, 0xbf]), 1) > 0) {
      offenders.push(`${path.relative(ROOT, file)}: UTF-8 BOM found at a non-zero offset`);
    }
  }
  assert.deepEqual(offenders, [], `encoding corruption found:\n${offenders.join("\n")}`);
});
