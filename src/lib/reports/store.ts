import type { PaidSections } from "@/lib/fixtures/tracks";

/**
 * The persistence contract for paid reports.
 *
 * Same discipline as `EntitlementStore` in commerce/credit-service: the
 * rules that decide whether a report is READY and whether a second
 * preparation may start are written over plain records, and this interface
 * is the only thing the Supabase implementation and the in-memory test store
 * have to agree on. A passing test is therefore evidence about production
 * behaviour, not about a mock.
 *
 * Two tables back this contract (0002 + 0003):
 *
 *   * `reports`       — the persisted report. Its presence with a COMPLETE
 *                       payload is the ONLY source of truth for "a report
 *                       exists". Post-payment reads consult only this.
 *   * `report_claims` — a short-lived LEASE. A row here means a worker is
 *                       generating right now. It is inserted BEFORE any
 *                       upstream work (Soundcharts / enrichment / Anthropic),
 *                       and deleted when generation finishes or fails.
 *
 * The atomic claim is the INSERT of a `report_claims` row under its
 * (creator_id, scan_id) primary key: of N racing inserters exactly one wins.
 * A stale lease is taken over by a compare-and-swap on `claimed_at`.
 */

export interface StoredReport {
  id: string;
  analysisId: string;
  payload: unknown;
  generatorVersion: string;
  model: string | null;
  createdAt: string;
}

/** A live preparation lease. */
export interface ClaimRow {
  worker: string;
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
  startedAt: Date;
  /** The version this preparation will produce. */
  generatorVersion: string;
  /** A lease older than this may be taken over — its worker is presumed dead. */
  staleAfterMs: number;
}

export type BeginClaimOutcome =
  /** This worker holds the lease and must generate. */
  | { outcome: "acquired" }
  /** A complete, current-version report already exists. Nothing to do. */
  | { outcome: "ready"; report: StoredReport }
  /** Another worker holds a live lease. Poll readiness; do NOT generate. */
  | { outcome: "held"; startedAt: Date };

export interface CompleteClaimInput {
  userId: string;
  scanId: string;
  analysisId: string;
  payload: PaidSections;
  generatorVersion: string;
  model: string;
  /** The lease this worker holds; released as part of completing. */
  worker: string;
}

export interface ReportStore {
  /** The persisted report row for (user, scan), whatever its payload. */
  getReport(userId: string, scanId: string): Promise<StoredReport | null>;

  /** The live lease for (user, scan), or null when nobody is preparing. */
  getClaim(userId: string, scanId: string): Promise<ClaimRow | null>;

  /**
   * Acquire the generation lease. Called BEFORE any upstream work. Must be
   * safe under concurrency: of N simultaneous callers exactly one receives
   * `acquired`; the rest receive `held` (or `ready`, if a complete
   * current-version report already exists). A lease older than
   * `staleAfterMs` is taken over atomically.
   */
  beginClaim(input: BeginClaimInput): Promise<BeginClaimOutcome>;

  /**
   * Persist the generated report and release this worker's lease. The report
   * write and the lease delete are the transition from "preparing" to
   * "ready".
   */
  completeClaim(input: CompleteClaimInput): Promise<{ reportId: string }>;

  /**
   * Release a lease this worker holds without producing a report (a failed
   * attempt). A no-op when the lease is no longer this worker's.
   */
  releaseClaim(userId: string, scanId: string, worker: string): Promise<void>;
}
