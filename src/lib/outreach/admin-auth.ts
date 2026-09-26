import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Admin-secret authorisation for internal routes.
 *
 * One header (`x-admin-secret`), one env var, a minimum length so a blank
 * or placeholder value cannot open the surface, and a constant-time compare
 * over fixed-length digests so neither the length nor the content of the
 * secret leaks through timing. A caller that fails gets 404, not 401: the
 * route is not meant to be discoverable.
 *
 * Pure apart from hashing.
 */

export const ADMIN_SECRET_HEADER = "x-admin-secret";
export const ADMIN_SECRET_ENV = "ADMIN_BATCH_SECRET";
export const ADMIN_SECRET_MIN_LENGTH = 32;

export function adminSecretConfigured(secret: string | undefined): secret is string {
  return (
    typeof secret === "string" &&
    secret.trim().length >= ADMIN_SECRET_MIN_LENGTH &&
    !/\s/.test(secret.trim())
  );
}

export function authorizeAdmin(
  presented: string | null,
  configured: string | undefined,
): boolean {
  if (!adminSecretConfigured(configured)) return false;
  if (typeof presented !== "string" || !presented) return false;
  const a = createHash("sha256").update(presented.trim()).digest();
  const b = createHash("sha256").update(configured.trim()).digest();
  return timingSafeEqual(a, b);
}
