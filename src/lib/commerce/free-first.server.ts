import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { OFFERS } from "@/lib/commerce/offers";
import { expiresAtFor } from "@/lib/commerce/offers";

/**
 * The first complete report is included.
 *
 * A creator's first eligible song gets the full Song Intelligence report at
 * no charge. Every song after that is $19, or covered by Creator
 * Intelligence.
 *
 * This is deliberately NOT a new table or a new flag. The free first report
 * IS an entitlement — the same row, the same offer, the same 60-day window,
 * read by the same `assertReportAccess`. Only its origin differs.
 *
 * "Once per creator" is enforced by the DATABASE, not by application logic:
 * `entitlements.stripe_checkout_session_id` is unique, and the free grant
 * uses a value derived from the creator's own id. A second attempt — from a
 * refresh, a revisit, two tabs, or a forged client — loses the insert race
 * and grants nothing. There is no counter to drift and no client value that
 * can contradict it.
 */

type Db = ReturnType<typeof createAdminClient>;

/** The reserved, per-creator session id that marks the free grant. */
export function freeFirstMarker(userId: string): string {
  return `free_first_${userId}`;
}

export type FreeFirstOutcome =
  | "granted"
  | "already_entitled"
  | "already_used"
  | "not_eligible";

/** Has this creator already received their included first report? */
export async function hasUsedFreeFirst(
  db: Db,
  userId: string,
): Promise<boolean> {
  const { data } = await db
    .from("entitlements")
    .select("id")
    .eq("stripe_checkout_session_id", freeFirstMarker(userId))
    .limit(1);
  return Boolean(data && data.length > 0);
}

/**
 * Grant the included first report for this scan, if the creator has not used
 * theirs. Call ONLY after the analysis has been persisted as complete — a
 * failed or unavailable song must never consume the free report.
 */
export async function grantFreeFirst(
  db: Db,
  userId: string,
  scanId: string,
  trackKey: string,
): Promise<FreeFirstOutcome> {
  // Already holds access to this exact song — nothing to spend.
  const { data: existing } = await db
    .from("entitlements")
    .select("id")
    .eq("user_id", userId)
    .eq("offer", "song_intelligence")
    .eq("scan_id", scanId)
    .limit(1);
  if (existing && existing.length > 0) return "already_entitled";

  if (await hasUsedFreeFirst(db, userId)) return "already_used";

  const offer = OFFERS.song_intelligence;
  const { error } = await db.from("entitlements").insert({
    user_id: userId,
    offer: offer.key,
    scan_id: scanId,
    track_slug: trackKey,
    stripe_checkout_session_id: freeFirstMarker(userId),
    amount_total_cents: 0,
    currency: "usd",
    track_limit: offer.trackLimit,
    status: "active",
    expires_at: expiresAtFor(offer),
  });

  if (error) {
    // 23505: a concurrent request already claimed it. Either the marker
    // (one free report per creator) or the per-song uniqueness fired. Both
    // mean "no second grant", which is the correct answer.
    if (
      error.code === "23505" ||
      `${error.message ?? ""}`.toLowerCase().includes("duplicate key")
    ) {
      return "already_used";
    }
    throw error;
  }

  return "granted";
}
