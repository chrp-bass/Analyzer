import type { PaidSections } from "@/lib/fixtures/tracks";

/**
 * The persistence contract for paid reports.
 *
 * Same discipline as `EntitlementStore` in commerce/credit-service: the
 * rules that decide whether a report is READY, whether a second preparation
 * may start, and what a buyer is charged against are written over plain
 * records, and this interface is the only thing the Supabase implementation
 * and the in-memory test store have to agree on. A passing test is therefore
 * evidence about production behaviour, not about a mock.
 *
 * The `reports` table (0002_song_memory.sql) is unchanged. Readiness and the
 * preparation lock are both expressed through the existing columns:
 *
 *   * a row whose `payload` is a COMPLETE PaidSections is a ready report;
 *   * a row whose `payload` is a `PreparationMarker` is a preparation in
 *     flight — the unique index on (creator_id, scan_id) is what makes
 *     claiming that row a race exactly one worker can win;
 *   * `generator_version` is the report/methodology version the row was
 *     produced under. Checkout binds to it.
 */

export interface StoredReport {
  id: string;
  analysisId: string;
  payload: unknown;
  generatorVersion: string;
  model: string | null;
  createdAt: string;
}

/** What a placeholder row carries while a worker is generating. */
export interface PreparationMarker {
  _chrp_preparing: {
    worker: string;
    started_at: string;
  };
}

export const PREPARING_VERSION_PREFIX = "preparing:";

export function preparationMarker(
  worker: string,
  startedAt: Date,
): PreparationMarker {
  return {
    _chrp_preparing: { worker, started_at: startedAt.toISOString() },
  };
}

export function readPreparationMarker(
  payload: unknown,
): { worker: string; startedAt: Date } | null {
  if (!payload || typeof payload !== "object") return null;
  const m = (payload as Partial<PreparationMarker>)._chrp_preparing;
  if (!m || typeof m !== "object") return null;
  if (typeof m.worker !== "string" || typeof m.started_at !== "string") {
    return null;
  }
  const startedAt = new Date(m.started_at);
  if (Number.isNaN(startedAt.getTime())) return null;
  return { worker: m.worker, startedAt };
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
 * A preparation marker, an empty object, or a partial write all fail this,
 * which is what keeps an in-flight or broken generation from ever being
 * delivered as the product.
 */
export function isCompletePaidPayload(payload: unknown): payload is PaidSections {
  if (!payload || typeof payload !== "object") return false;
  if (readPreparationMarker(payload)) return false;
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

export interface BeginPreparationInput {
  userId: string;
  scanId: string;
  analysisId: string;
  worker: string;
  startedAt: Date;
  /** The version this preparation will produce. */
  generatorVersion: string;
  /** A marker older than this may be taken over — its worker is presumed dead. */
  staleAfterMs: number;
}

export type BeginPreparationOutcome =
  /** This worker holds the lock and must generate. */
  | { outcome: "acquired"; reportId: string }
  /** A complete, current-version report already exists. Nothing to do. */
  | { outcome: "ready"; report: StoredReport }
  /** Another worker is generating right now. Poll; do not generate. */
  | { outcome: "held"; startedAt: Date };

export interface CompletePreparationInput {
  userId: string;
  scanId: string;
  analysisId: string;
  payload: PaidSections;
  generatorVersion: string;
  model: string;
}

export interface ReportStore {
  /** The row for (user, scan), whatever state it is in. */
  getReport(userId: string, scanId: string): Promise<StoredReport | null>;

  /**
   * Claim the right to generate. Must be safe under concurrency: of N
   * simultaneous callers exactly one receives `acquired`; the rest receive
   * `held` (or `ready`, if a complete current report already exists).
   */
  beginPreparation(input: BeginPreparationInput): Promise<BeginPreparationOutcome>;

  /** Replace the marker (or an older report) with the generated payload. */
  completePreparation(input: CompletePreparationInput): Promise<{ reportId: string }>;

  /**
   * Release a lock this worker holds without producing a report. Must be a
   * no-op when the row is no longer this worker's marker.
   */
  abandonPreparation(userId: string, scanId: string, worker: string): Promise<void>;
}

/**
 * What to do when a preparation finds a row already in place. Shared by the
 * Supabase store and the in-memory test store so the policy exists once:
 *
 *   ready    — complete, current version, same analysis: nothing to do.
 *   held     — a live marker from another worker: poll, never generate.
 *   takeover — a stale marker (its worker is presumed dead), or a report
 *              from an earlier contract / a superseded analysis: this worker
 *              may claim the row and regenerate.
 */
export function classifyExistingRow(
  existing: StoredReport,
  input: Pick<
    BeginPreparationInput,
    "analysisId" | "generatorVersion" | "startedAt" | "staleAfterMs"
  >,
):
  | { kind: "ready" }
  | { kind: "held"; startedAt: Date }
  | { kind: "takeover" } {
  const marker = readPreparationMarker(existing.payload);
  if (marker) {
    const age = input.startedAt.getTime() - marker.startedAt.getTime();
    if (age < input.staleAfterMs) return { kind: "held", startedAt: marker.startedAt };
    return { kind: "takeover" };
  }
  if (
    isCompletePaidPayload(existing.payload) &&
    existing.generatorVersion === input.generatorVersion &&
    existing.analysisId === input.analysisId
  ) {
    return { kind: "ready" };
  }
  return { kind: "takeover" };
}
