import type { BatchRun } from "@/lib/outreach/batch-scan";

/**
 * The outreach queue worker, as orchestration.
 *
 * A scheduled run leases up to BATCH_SIZE rows from `outreach_queue` (one
 * atomic UPDATE … FOR UPDATE SKIP LOCKED, so overlapping runs never share a
 * row) and sends each through the admin batch scan's own `runBatch` — the
 * same search, identity gate, paid preparation and finding extraction. This
 * module only decides what each outcome means for the queue row:
 *
 *   scored / no_quotable_finding  → done, linked to its outreach_batch_items row
 *   identity_mismatch / not_found → skipped, with the reason
 *   deferred (search budget)      → back to pending, attempt not counted,
 *                                   and no further rows start this run
 *   deferred (deadline, still preparing) → back to pending, attempt not counted
 *   error / thrown                → pending again while attempts < MAX_ATTEMPTS,
 *                                   then failed with the error
 *
 * Rows leased but not started before the deadline go back to pending with
 * their attempt returned. Every write is fenced on (status, attempts), so a
 * run that lost its lease can never overwrite the run that took it over.
 *
 * A run also re-checks that it still holds the lease before it starts a row
 * (so a run that lost it spends nothing) and before it records a scored item
 * (so it never mints a second claim link). A lost row is left alone: it
 * belongs to whichever run holds it now.
 *
 * Pure module: every effect is an injected dependency.
 */

export const BATCH_SIZE = 5;
export const LEASE_SECONDS = 6 * 60;
export const MAX_ATTEMPTS = 3;
/** Stop STARTING rows after this; a started row is allowed to finish. */
export const QUEUE_DEADLINE_MS = 240_000;
export const QUEUE_PAUSE_MS = 1_000;
/** The error a recorder throws when the lease is gone; see `QueueDeps.holdsLease`. */
export const LEASE_LOST = "lease_lost";

export interface QueueRow {
  id: string;
  batch_id: string;
  artist: string;
  track: string;
  instagram: string | null;
  segment: string | null;
  /** Already incremented by the lease. */
  attempts: number;
}

export type QueueOutcome =
  | { status: "done"; outreach_item_id: string; error: string | null }
  | { status: "skipped"; error: string }
  | { status: "failed"; error: string }
  | { status: "pending"; error: string };

export interface QueueDeps {
  lease(limit: number, leaseSeconds: number, maxAttempts: number): Promise<QueueRow[]>;
  /**
   * Run ONE row through the batch scan. Returns the run and the id of the
   * outreach_batch_items row it recorded, if it recorded one.
   */
  scan(row: QueueRow, deadlineMs: number): Promise<{ run: BatchRun; itemId: string | null }>;
  finish(row: QueueRow, outcome: QueueOutcome): Promise<void>;
  /** Is this row still processing, on this attempt, with an unexpired lease? */
  holdsLease(row: QueueRow): Promise<boolean>;
  /** Back to pending, lease cleared, the attempt given back. */
  release(row: QueueRow): Promise<void>;
  now(): number;
  sleep(ms: number): Promise<void>;
  log(line: string): void;
  deadlineMs?: number;
  pauseMs?: number;
}

export interface QueueRunSummary {
  claimed: number;
  done: number;
  skipped: number;
  failed: number;
  retried: number;
  released: number;
  /** Rows this run no longer held when it came to start or record them. */
  lost: number;
  soundcharts_lookups: number;
  budget_exhausted: boolean;
}

function retryOrFail(row: QueueRow, error: string): QueueOutcome {
  const e = error.slice(0, 300);
  return row.attempts >= MAX_ATTEMPTS ? { status: "failed", error: e } : { status: "pending", error: e };
}

export async function runQueue(deps: QueueDeps): Promise<QueueRunSummary> {
  const started = deps.now();
  const deadlineMs = deps.deadlineMs ?? QUEUE_DEADLINE_MS;
  const pauseMs = deps.pauseMs ?? QUEUE_PAUSE_MS;
  const summary: QueueRunSummary = {
    claimed: 0, done: 0, skipped: 0, failed: 0, retried: 0, released: 0, lost: 0,
    soundcharts_lookups: 0, budget_exhausted: false,
  };

  const rows = await deps.lease(BATCH_SIZE, LEASE_SECONDS, MAX_ATTEMPTS);
  summary.claimed = rows.length;

  const apply = async (row: QueueRow, outcome: QueueOutcome) => {
    await deps.finish(row, outcome);
    if (outcome.status === "done") summary.done += 1;
    else if (outcome.status === "skipped") summary.skipped += 1;
    else if (outcome.status === "failed") summary.failed += 1;
    else summary.retried += 1;
  };

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const elapsed = deps.now() - started;
    if (summary.budget_exhausted || elapsed > deadlineMs) {
      await deps.release(row);
      summary.released += 1;
      continue;
    }
    if (i > 0) await deps.sleep(pauseMs);

    try {
      if (!(await deps.holdsLease(row))) {
        summary.lost += 1;
        continue;
      }
      const { run, itemId } = await deps.scan(row, Math.max(1, deadlineMs - (deps.now() - started)));
      summary.soundcharts_lookups += run.soundcharts_lookups;
      const item = run.items[0];
      if (!item) {
        await apply(row, retryOrFail(row, "no_result"));
        continue;
      }
      if (item.status === "error" && item.reason === LEASE_LOST) {
        summary.lost += 1;
        continue;
      }
      switch (item.status) {
        case "scored":
        case "no_quotable_finding":
          if (itemId) {
            await apply(row, {
              status: "done",
              outreach_item_id: itemId,
              error: item.status === "no_quotable_finding" ? "no_quotable_finding" : null,
            });
          } else {
            await apply(row, retryOrFail(row, "not_recorded"));
          }
          break;
        case "identity_mismatch":
          await apply(row, {
            status: "skipped",
            error: `identity_mismatch: search returned "${item.resolved_title ?? "?"}" by ${item.resolved_artist ?? "?"}`,
          });
          break;
        case "not_found":
          await apply(row, { status: "skipped", error: "not_found: no catalog match" });
          break;
        case "deferred":
          if (item.reason === "search_budget") summary.budget_exhausted = true;
          await deps.release(row);
          summary.released += 1;
          break;
        default:
          await apply(row, retryOrFail(row, item.reason ?? item.status));
      }
    } catch (err) {
      await apply(row, retryOrFail(row, err instanceof Error ? err.message : "unknown"));
    }
  }

  deps.log(
    `[cron/outreach-queue] claimed=${summary.claimed} done=${summary.done} skipped=${summary.skipped} ` +
      `failed=${summary.failed} retried=${summary.retried} released=${summary.released} lost=${summary.lost} ` +
      `soundcharts_lookups=${summary.soundcharts_lookups}` +
      (summary.budget_exhausted ? " budget_exhausted=true" : ""),
  );
  return summary;
}
