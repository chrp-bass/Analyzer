/**
 * Monitor-secret authorisation for the Vercel-side health surface.
 *
 * One secret (`HEALTH_MONITOR_SECRET`), one header (`Authorization: Bearer`),
 * constant-time comparison, and a minimum length so a blank or placeholder
 * value cannot accidentally open the surface. Pure module.
 */

export const MONITOR_SECRET_ENV = "HEALTH_MONITOR_SECRET";
export const MONITOR_SECRET_MIN_LENGTH = 32;

export type MonitorAuth = { ok: true } | { ok: false; reason: "not_configured" | "forbidden" };

/** Compare two strings without an early exit on the first differing byte. */
export function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export function monitorSecretConfigured(secret: string | undefined): boolean {
  return typeof secret === "string" && secret.trim().length >= MONITOR_SECRET_MIN_LENGTH && !/\s/.test(secret.trim());
}

export function authorizeMonitor(authorizationHeader: string | null, configuredSecret: string | undefined): MonitorAuth {
  if (!monitorSecretConfigured(configuredSecret)) return { ok: false, reason: "not_configured" };
  const m = /^Bearer\s+(\S+)\s*$/i.exec(authorizationHeader ?? "");
  if (!m) return { ok: false, reason: "forbidden" };
  return constantTimeEqual(m[1], (configuredSecret as string).trim()) ? { ok: true } : { ok: false, reason: "forbidden" };
}
