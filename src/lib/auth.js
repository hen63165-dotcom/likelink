/**
 * Likelink — Supabase Auth (real account security) + admin role check.
 *
 * STATUS: SCAFFOLDING READY. These functions are written and correct, but the
 * app still currently runs its original DEMO auth ("open a studio with a name
 * + email, no password"). To switch to real auth:
 *   1. Fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in .env (see NEXT_STEPS.md).
 *   2. Enable Email / Magic Link in Supabase → Auth → Providers.
 *   3. In MarketplaceContext, replace the demo onLogin/onSignup so they call
 *      the functions exported here, and load the seller's row by auth.uid().
 *   4. Apply the RLS policies in NEXT_STEPS.md so each seller can only touch
 *      their own products and earnings.
 *
 * This module is import-safe when Supabase is NOT configured: every function
 * checks `authConfigured` and returns a clear error or null instead of crashing.
 */
import { supabase, supabaseConfigured } from "./supabaseClient";

export const authConfigured = supabaseConfigured;

/** Sign up a seller with email + password (or magic link). */
export async function signUpSeller({ email, password }) {
  if (!authConfigured) return { ok: false, error: "Supabase Auth not configured (missing .env)." };
  const { data, error } = await supabase.auth.signUp({ email, password });
  return error ? { ok: false, error: error.message } : { ok: true, data };
}

/** Sign in an existing seller. */
export async function signInSeller({ email, password }) {
  if (!authConfigured) return { ok: false, error: "Supabase Auth not configured (missing .env)." };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? { ok: false, error: error.message } : { ok: true, data };
}

/** Send a password reset email (Supabase). Returns { ok, error }. */
export async function resetPassword(email) {
  if (!authConfigured) return { ok: false, error: "Supabase Auth not configured (missing .env)." };
  const { error } = await supabase.auth.resetPasswordForEmail(String(email || "").trim(), {
    redirectTo: window.location.origin,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Sign out the current seller. */
export async function signOutSeller() {
  if (!authConfigured) return;
  await supabase.auth.signOut();
}

/** Current signed-in seller, or null when logged out / not configured. */
export async function getCurrentSeller() {
  if (!authConfigured) return null;
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

/**
 * Role-based admin check — replaces the old VITE_ADMIN_CODE passcode.
 *
 * The admin role lives on the seller's `profiles` row (keyed by auth.uid()),
 * in an `is_admin` boolean. Only an admin may change platform settings.
 */
export async function isAdmin(userId) {
  if (!authConfigured || !userId) return false;
  const { data, error } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return false;
  return Boolean(data.is_admin);
}
