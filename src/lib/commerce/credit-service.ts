import { OFFERS, type OfferKey } from "@/lib/commerce/offers";

/**
 * Creator Intelligence credit rules.
 *
 * Deliberately free of Supabase, `server-only` and Next: every rule below is
 * a decision over plain records, so the behaviour that protects real money
 * can be tested directly instead of inferred from integration wiring. The
 * Supabase-backed store is one implementation of `EntitlementStore`; the
 * in-memory store used by the tests is another. The RULES are shared, so a
 * passing test is evidence about production and not about a mock.
 *
 * The commercial contract these encode:
 *   $19  Song Intelligence     — one named scan, 60 days.
 *   $149 Creator Intelligence  — 10 DISTINCT songs, 12 months, usable across
 *                                any number of sessions.
 *
 * Distinctness is a property of the SONG (`track_key`), never of the scan
 * handle. Re-opening a report, refreshing, retrying a failed generation and
 * replaying a Stripe webhook all resolve to a key that is already attached,
 * so they cost nothing.
 */

export type EntitlementStatus = "active" | "revoked" | "refunded";

export interface EntitlementRecord {
  id: string;
  user_id: string;
  offer: OfferKey;
  /** Song Intelligence only: the single scan this entitlement covers. */
  scan_id: string | null;
  track_limit: number | null;
  status: EntitlementStatus;
  granted_at: string;
  expires_at: string;
}

export interface TrackRecord {
  entitlement_id: string;
  /** Song identity. The credit ceiling counts distinct values of this. */
  track_key: string;
  scan_id: string;
  analysis_id?: string | null;
  attached_at: string;
}

export interface AttachInput {
  entitlementId: string;
  trackKey: string;
  scanId: string;
  analysisId?: string | null;
}

/**
 * The persistence surface the rules need. Implementations must make
 * `attachTrack` idempotent on (entitlementId, trackKey) — the unique index
 * in 0002_song_memory.sql is what enforces that under concurrency — and
 * must report `inserted: false` when the row already existed.
 */
export interface EntitlementStore {
  findSongEntitlement(
    userId: string,
    scanId: string,
  ): Promise<EntitlementRecord | null>;
  findCreatorEntitlement(userId: string): Promise<EntitlementRecord | null>;
  listTracks(entitlementId: string): Promise<TrackRecord[]>;
  attachTrack(input: AttachInput): Promise<{ inserted: boolean }>;
}

export type DenyReason =
  | "not_configured"
  | "no_identity"
  | "invalid_scan"
  | "no_entitlement"
  | "expired"
  | "revoked"
  | "limit_reached";

export type AccessResult =
  | { ok: true; entitlement: EntitlementRecord; trackKey: string }
  | { ok: false; reason: DenyReason };

export type ConsumeResult =
  | { ok: true; entitlement: EntitlementRecord; consumed: boolean; remaining: number }
  | { ok: false; reason: DenyReason };

export interface CreditSummary {
  offer: OfferKey;
  limit: number;
  used: number;
  remaining: number;
  expiresAt: string;
  expired: boolean;
}

export function isExpired(row: EntitlementRecord, now: Date): boolean {
  return new Date(row.expires_at).getTime() <= now.getTime();
}

/** An entitlement is usable only when active AND inside its window. */
function liveness(
  row: EntitlementRecord,
  now: Date,
): { ok: true } | { ok: false; reason: DenyReason } {
  if (row.status !== "active") return { ok: false, reason: "revoked" };
  if (isExpired(row, now)) return { ok: false, reason: "expired" };
  return { ok: true };
}

function limitFor(row: EntitlementRecord): number {
  return row.track_limit ?? OFFERS[row.offer].trackLimit;
}

/**
 * May this caller read the paid report for this scan?
 *
 * Song Intelligence answers yes for exactly the scan it was bought against.
 * Creator Intelligence answers yes for any song already attached to it —
 * which is what lets a buyer come back months later and re-open track 3
 * without paying again.
 */
export async function resolveAccess(
  store: EntitlementStore,
  userId: string,
  scanId: string,
  trackKey: string,
  now: Date = new Date(),
): Promise<AccessResult> {
  const song = await store.findSongEntitlement(userId, scanId);
  if (song) {
    const live = liveness(song, now);
    if (!live.ok) return live;
    return { ok: true, entitlement: song, trackKey };
  }

  const creator = await store.findCreatorEntitlement(userId);
  if (creator) {
    const live = liveness(creator, now);
    if (!live.ok) return live;
    const tracks = await store.listTracks(creator.id);
    if (tracks.some((t) => t.track_key === trackKey)) {
      return { ok: true, entitlement: creator, trackKey };
    }
    // Held a Creator entitlement, but this song was never attached to it —
    // an unstarted credit is not access.
    return { ok: false, reason: "no_entitlement" };
  }

  return { ok: false, reason: "no_entitlement" };
}

/**
 * Consume one credit for a COMPLETED analysis of a distinct song.
 *
 * Call this only once an analysis has actually succeeded. A failed or
 * pending run must never reach here — that is the whole reason consumption
 * is a separate step from starting an analysis rather than a side effect
 * of it.
 *
 * Returns `consumed: false` when the song was already attached: the caller
 * still has access, and no second credit was spent.
 */
export async function consumeCreditForCompletedAnalysis(
  store: EntitlementStore,
  userId: string,
  scanId: string,
  trackKey: string,
  analysisId: string | null = null,
  now: Date = new Date(),
): Promise<ConsumeResult> {
  const creator = await store.findCreatorEntitlement(userId);
  if (!creator) return { ok: false, reason: "no_entitlement" };

  const live = liveness(creator, now);
  if (!live.ok) return live;

  const limit = limitFor(creator);
  const tracks = await store.listTracks(creator.id);

  // Already attached: idempotent success, nothing spent. This is the path a
  // refresh, a re-open and a webhook replay all take.
  if (tracks.some((t) => t.track_key === trackKey)) {
    return {
      ok: true,
      entitlement: creator,
      consumed: false,
      remaining: Math.max(0, limit - tracks.length),
    };
  }

  if (tracks.length >= limit) {
    return { ok: false, reason: "limit_reached" };
  }

  const { inserted } = await store.attachTrack({
    entitlementId: creator.id,
    trackKey,
    scanId,
    analysisId,
  });

  // `inserted: false` means a concurrent request won the race on the unique
  // index. Both callers are entitled; only one credit was spent.
  const used = inserted ? tracks.length + 1 : tracks.length;
  return {
    ok: true,
    entitlement: creator,
    consumed: inserted,
    remaining: Math.max(0, limit - used),
  };
}

/**
 * The authoritative balance for presentation. Derived from persisted rows
 * every time it is asked for — there is no stored counter to drift, and no
 * browser value that can contradict it.
 */
export async function creditSummary(
  store: EntitlementStore,
  userId: string,
  now: Date = new Date(),
): Promise<CreditSummary | null> {
  const creator = await store.findCreatorEntitlement(userId);
  if (!creator) return null;

  const limit = limitFor(creator);
  const tracks = await store.listTracks(creator.id);
  const used = Math.min(tracks.length, limit);

  return {
    offer: creator.offer,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    expiresAt: creator.expires_at,
    expired: creator.status !== "active" || isExpired(creator, now),
  };
}
