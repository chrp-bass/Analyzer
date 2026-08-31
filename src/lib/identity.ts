"use client";

import { createClient, supabaseConfigured } from "@/lib/supabase/client";

/**
 * Identity, established late.
 *
 * The locked experience forbids a front-door login: a first-time creator
 * searches, scans and sees the free reveal with no account. Identity only
 * has to exist at the moment it means something — when someone pays, or
 * asks us to save their reveal.
 *
 * At that point we sign them in anonymously via Supabase Auth. That creates
 * a real auth.users row and an HttpOnly session cookie, which is what the
 * webhook binds the purchase to. No password, no interstitial, no form.
 *
 * Later, `linkEmail` upgrades the same user to an email identity with a
 * magic link — so the entitlement they already own follows them to another
 * browser without ever having created an "account".
 */

/** Ensure a server-verifiable session exists. Returns the user id, or null. */
export async function ensureIdentity(): Promise<string | null> {
  if (!supabaseConfigured()) return null;
  const supabase = createClient();

  const { data: existing } = await supabase.auth.getUser();
  if (existing.user) return existing.user.id;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.error("[identity] anonymous sign-in failed:", error.message);
    return null;
  }
  return data.user?.id ?? null;
}

/**
 * Attach an email to the current identity and send a magic link, so the
 * person can return to their songs from any browser.
 */
export async function linkEmail(email: string): Promise<boolean> {
  if (!supabaseConfigured()) return false;
  const supabase = createClient();
  await ensureIdentity();
  const { error } = await supabase.auth.updateUser({ email });
  if (error) {
    // Already-registered email: send a sign-in link instead of failing.
    const { error: otpError } = await supabase.auth.signInWithOtp({ email });
    if (otpError) {
      console.error("[identity] magic link failed:", otpError.message);
      return false;
    }
  }
  return true;
}
