import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { decodeScanId } from "@/lib/scan-id";
import { createSupabaseEntitlementStore } from "@/lib/commerce/store.supabase";
import {
  consumeCreditForCompletedAnalysis,
  creditSummary,
  resolveAccess,
  type AccessResult,
  type ConsumeResult,
  type CreditSummary,
  type DenyReason,
  type EntitlementRecord,
} from "@/lib/commerce/credit-service";

/**
 * The entitlement authority.
 *
 * Every paid surface asks exactly one question — `assertReportAccess` — and
 * that question is answered from the database against a cookie-verified
 * Supabase identity. Nothing here reads localStorage, a query parameter, or
 * any client-supplied flag.
 *
 * The rules themselves live in `credit-service`, which knows nothing about
 * Supabase; this module supplies identity, the scan -> song mapping, and the
 * production store. Failure is always closed: an unconfigured environment, a
 * missing session, an expired window or an unattached song all deny.
 */

export type { DenyReason, AccessResult, CreditSummary };
export type EntitlementRow = EntitlementRecord;

/**
 * Server-verified identity for the current request. Returns null when the
 * caller presents no valid Supabase session cookie.
 */
export async function currentUserId(): Promise<string | null> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null;
  }
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

/**
 * The stable song identity a scan refers to.
 *
 * Credits are counted on this, not on the scan handle, so two scans of one
 * song cost one credit. For catalog tracks the slug encoded in the scan id
 * IS the song identity.
 */
export function trackKeyForScan(scanId: string): string | null {
  return decodeScanId(scanId);
}

/**
 * Does the caller hold a live entitlement covering this scan?
 *
 * Song Intelligence  — the entitlement is bound to one scan_id.
 * Creator Intelligence — the entitlement covers any song already attached to
 * it. Attachment happens server-side when an analysis completes; the browser
 * cannot add to its own allowance.
 */
export async function assertReportAccess(
  scanId: string,
): Promise<AccessResult> {
  if (!adminConfigured()) return { ok: false, reason: "not_configured" };

  const trackKey = trackKeyForScan(scanId);
  if (!trackKey) return { ok: false, reason: "invalid_scan" };

  const userId = await currentUserId();
  if (!userId) return { ok: false, reason: "no_identity" };

  const store = createSupabaseEntitlementStore(createAdminClient());
  return resolveAccess(store, userId, scanId, trackKey);
}

/**
 * Spend one credit for a completed analysis of a distinct song.
 *
 * Call this ONLY after an analysis has actually succeeded. A failed or
 * pending run must never reach here — keeping consumption separate from
 * starting an analysis is what guarantees a failed generation is free.
 */
export async function consumeCreditForScan(
  scanId: string,
  analysisId: string | null = null,
): Promise<ConsumeResult> {
  if (!adminConfigured()) return { ok: false, reason: "not_configured" };

  const trackKey = trackKeyForScan(scanId);
  if (!trackKey) return { ok: false, reason: "invalid_scan" };

  const userId = await currentUserId();
  if (!userId) return { ok: false, reason: "no_identity" };

  const store = createSupabaseEntitlementStore(createAdminClient());
  return consumeCreditForCompletedAnalysis(
    store,
    userId,
    scanId,
    trackKey,
    analysisId,
  );
}

/**
 * The authoritative Creator Intelligence balance for the current caller.
 * Derived from persisted rows on every call — there is no counter to drift
 * and no browser value that can contradict it.
 */
export async function currentCreditSummary(): Promise<CreditSummary | null> {
  if (!adminConfigured()) return null;
  const userId = await currentUserId();
  if (!userId) return null;
  const store = createSupabaseEntitlementStore(createAdminClient());
  return creditSummary(store, userId);
}
