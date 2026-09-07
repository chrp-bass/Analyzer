import type { PaidSections } from "@/lib/fixtures/tracks";

/**
 * The persistence contract for paid reports.
 *
 * Two tables back this contract (0002 + 0003):
 *
 *   * `reports`       — the persisted report. Its presence with a COMPLETE
 *                       payload is the ONLY source of truth for "a report
 *                       exists". Post-payment reads consult only this.
 *   * `report_claims` — a FENCED lease. A row means a worker is generating
 *                       right now. It is claimed BEFORE any upstream work,
 *                       renewed by heartbeat on database time, and removed
 *                       when generation finishes or fails.
 *
 * FENCING. A lease is identified by an immutable `token` (uuid) plus a
 * monotonically increasing `fence`, minted fresh on every acquisition and
 * takeover — never by `claimed_at` alone. `renewClaim`, `completeClaim` and
 * `releaseClaim` succeed only when `(creator_id, scan_id, worker, token)`
 * still match the current claim, so a worker that lost the lease can neither
 * renew it, overwrite the report, complete preparation, nor delete the
 * successor's lease.
 *
 * ATOMIC COMPLETION. `completeClaim` persists the report and releases the
 * lease as ONE atomic step (a single Postgres function), gated on ownership.
 * There is no unfenced upsert followed by a separate delete.
 */

export interface StoredReport {
  id: string;
  analysisId: string;
  payload: unknown;
  generatorVersion: string;
  model: string | null;
  createdAt: string;
}

/** A fenced hold on preparation for one (creator, scan). */
export interface Lease {
  worker: string;
  token: string;
  fence: number;
}

/** A live preparation lease, as read back. */
export interface ClaimRow {
  worker: string;
  token: string;
  fence: number;
  reportVersion: string;
  claimedAt: Date;
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Is this payload a complete paid report?
 *
 * "Complete" means every field the report renders unconditionally is
 * present: the signature, the CHRP reading, the placement map and the pitch
 * throughline. Fields added by later contracts (buyers, audience, pitch,
 * consider) are rendered only when present, so a report persisted under an
 * earlier contract is still complete — it must keep serving after this
 * migration exactly as it did before.
 *
 * A partial or empty payload fails this, which is what keeps a broken write
 * from ever being delivered as the product — and what the offline backfill
 * uses to find reports that need regenerating out of band.
 */
export function isCompletePaidPayload(payload: unknown): payload is PaidSections {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  if (!nonEmptyString(p.signature)) return false;
  if (!nonEmptyString(p.rhodes)) return false;
  if (!nonEmptyString(p.throughline)) return false;
  if (!Array.isArray(p.placements) || p.placements.length === 0) return false;
  return p.placements.every(
    (pl) =>
      pl &&
      typeof pl === "object" &&
      nonEmptyString((pl as { title?: unknown }).title) &&
      nonEmptyString((pl as { body?: unknown }).body),
  );
}

export interface BeginClaimInput {
  userId: string;
  scanId: string;
  worker: string;
  /** The version this preparation will produce. */
  generatorVersion: string;
  /** A lease older than this (measured on DB time) may be taken over. */
  staleAfterMs: number;
}

export type BeginClaimOutcome =
  /** This worker holds the lease and must generate. */
  | { outcome: "acquired"; lease: Lease }
  /** A complete, current-version report already exists. Nothing to do. */
  | { outcome: "ready"; report: StoredReport }
  /** Another worker holds a live lease. Poll readiness; do NOT generate. */
  | { outcome: "held"; startedAt: Date };

export interface CompleteClaimInput {
  userId: string;
  scanId: string;
  /** The lease this worker holds. Completion is fenced on it. */
  lease: Lease;
  analysisId: string;
  payload: PaidSections;
  generatorVersion: string;
  model: string;
}

export type CompleteClaimOutcome =
  | { ok: true; reportId: string }
  /** Ownership was lost to a takeover; nothing was written. */
  | { ok: false; reason: "lost" };

export type RenewOutcome = { renewed: true; fence: number } | { renewed: false };

export interface ReportStore {
  /** The persisted report row for (user, scan), whatever its payload. */
  getReport(userId: string, scanId: string): Promise<StoredReport | null>;

  /** The live lease for (user, scan), or null when nobody is preparing. */
  getClaim(userId: string, scanId: string): Promise<ClaimRow | null>;

  /**
   * Acquire the generation lease. Called BEFORE any upstream work. Atomic and
   * fenced: of N simultaneous callers exactly one receives `acquired` (with a
   * fresh token + fence); the rest receive `held` (or `ready`). A lease older
   * than `staleAfterMs` on DB time is taken over with a NEW token and a
   * higher fence.
   */
  beginClaim(input: BeginClaimInput): Promise<BeginClaimOutcome>;

  /**
   * Heartbeat: extend the lease using DATABASE time. Succeeds only while this
   * worker + token still own it; a lost lease returns `{ renewed: false }` so
   * the caller can abort before persisting.
   */
  renewClaim(userId: string, scanId: string, lease: Lease): Promise<RenewOutcome>;

  /**
   * Atomically persist the generated report AND release this worker's lease,
   * only if the lease is still owned. Returns `{ ok: false, reason: "lost" }`
   * — writing nothing — when ownership was lost to a takeover.
   */
  completeClaim(input: CompleteClaimInput): Promise<CompleteClaimOutcome>;

  /**
   * Release a lease this worker holds without producing a report (a failed
   * attempt). Fenced on the token, so it can never delete a successor's lease;
   * a no-op when the lease is no longer this worker's.
   */
  releaseClaim(userId: string, scanId: string, lease: Lease): Promise<void>;
}
