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
 * Attach an email to the current identity and send the return link.
 *
 * This upgrades the SAME anonymous user rather than creating a second one,
 * so the creator's id — and with it their report, their My Songs history,
 * their entitlements and their first-free-used state — is preserved exactly.
 * One creator, one identity.
 *
 * The result is deliberately explicit. Saving is only "done" when the auth
 * service accepted the send; a queued-but-undeliverable message is a
 * failure, and the caller must not tell the creator their report was saved
 * when no email will arrive.
 */
export type LinkEmailResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "in_use" | "send_failed" };

export async function linkEmail(email: string): Promise<LinkEmailResult> {
  if (!supabaseConfigured()) return { ok: false, reason: "not_configured" };
  const supabase = createClient();
  const userId = await ensureIdentity();
  if (!userId) return { ok: false, reason: "not_configured" };

  const { error } = await supabase.auth.updateUser({ email });
  if (!error) return { ok: true };

  // Already-registered address: this email belongs to an existing identity.
  // Send that identity a sign-in link instead of attaching the address here
  // — two creator histories must never be silently merged.
  const message = `${error.message ?? ""}`.toLowerCase();
  const alreadyRegistered =
    message.includes("already registered") ||
    message.includes("already been registered") ||
    message.includes("already exists");

  if (alreadyRegistered) {
    const { error: otpError } = await supabase.auth.signInWithOtp({ email });
    if (!otpError) return { ok: true };
    console.error("[identity] sign-in link failed:", otpError.message);
    return { ok: false, reason: "send_failed" };
  }

  console.error("[identity] email link failed:", error.message);
  return { ok: false, reason: "send_failed" };
}
