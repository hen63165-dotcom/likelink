// Nobody makes themselves an admin (supabase/migrations/20261016000000_profiles_no_self_admin.sql).
// profiles.is_admin feeds is_likelink_admin(), and the kv admin policy lets an
// admin's browser write any kv key past the server's write policy. The old
// INSERT policies checked only the row's id, and a column-level REVOKE does
// nothing while the table-level grant exists. Checked on a local Postgres 16
// (2026-10-16): with the production policy set minus its broken recursive
// admin policy, a signed-in user became admin by insert and by update; after
// the migration both are refused and the service role still appoints admins.
// These tests keep the SQL that does it from going away.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const MIGRATION = "supabase/migrations/20261016000000_profiles_no_self_admin.sql";
// Apply order for a new project: the baseline, then every migration by name.
const ordered = ["supabase/baseline/00_before_migrations.sql", ...readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((f) => f.endsWith(".sql")).sort().map((f) => `supabase/migrations/${f}`)];

test("a trigger refuses an is_admin change from the API roles, whatever the grants or policies say", () => {
  const sql = read(MIGRATION);
  assert.match(sql, /create trigger trg_profiles_admin_guard\s+before insert or update on public\.profiles/);
  const fn = sql.slice(sql.indexOf("create or replace function public.tg_profiles_admin_guard"), sql.indexOf("$function$;") + 11);
  assert.doesNotMatch(fn, /security definer/i, "invoker: current_user is the caller's API role");
  assert.match(fn, /current_user in \('anon', 'authenticated'\)/);
  assert.match(fn, /tg_op = 'INSERT' and coalesce\(new\.is_admin, false\)/);
  assert.match(fn, /tg_op = 'UPDATE' and new\.is_admin is distinct from old\.is_admin/);
});

test("after every file is applied, each profiles insert/update policy a user can use refuses is_admin", () => {
  const last = new Map();
  for (const f of ordered) {
    const sql = read(f).replace(/--[^\n]*/g, "");
    for (const m of sql.matchAll(/drop policy if exists ("[^"]+"|\w+) on public\.profiles/gi)) last.delete(m[1].replace(/"/g, ""));
    for (const m of sql.matchAll(/create policy ("[^"]+"|\w+)\s+on public\.profiles\s+for (insert|update)([\s\S]*?);/gi)) {
      last.set(m[1].replace(/"/g, ""), { cmd: m[2].toLowerCase(), body: m[3], file: f });
    }
  }
  const selfService = [...last.entries()].filter(([, p]) => /auth\.uid\(\)\s*=\s*id|id\s*=\s*auth\.uid\(\)/.test(p.body));
  assert.ok(selfService.length >= 2, "an own-row insert and an own-row update policy exist");
  for (const [name, p] of selfService) {
    assert.match(p.body, /with check \(\(auth\.uid\(\) = id\) and \(not is_admin\)\)/, `${name} (${p.cmd}, ${p.file})`);
  }
  assert.match(read(MIGRATION), /drop policy if exists "profile can be created by owner" on public\.profiles/, "the dashboard-era policies that checked only the id are dropped");
  assert.match(read(MIGRATION), /drop policy if exists "profile can be edited by owner" on public\.profiles/);
});
