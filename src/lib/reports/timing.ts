/**
 * `[report-timing]` instrumentation for paid fulfillment.
 *
 * One line per stage, always the same shape, so the production log can be
 * grepped for a single scan and read as a timeline:
 *
 *   [report-timing] stage=rhodes_generation scan=scn_… ms=18342 outcome=ok
 *
 * Pure: no server-only import, no Next dependency. The preparation core and
 * the resolver both use it, and the tests read the recorded stages back to
 * prove which stages ran (and, more importantly, which did not).
 */

export type ReportTimingStage =
  | "analysis"
  | "enrichments"
  | "christian_context"
  | "rhodes_generation"
  | "report_persistence"
  | "entitlement_check"
  | "persisted_report_retrieval";

export interface ReportTiming {
  stage: ReportTimingStage;
  scanId: string;
  ms: number;
  outcome: "ok" | "error";
  detail?: string;
}

export type TimingSink = (timing: ReportTiming) => void;

/** Default sink: one structured log line on stdout. */
export function logTiming(t: ReportTiming): void {
  const detail = t.detail ? ` detail=${JSON.stringify(t.detail)}` : "";
  console.log(
    `[report-timing] stage=${t.stage} scan=${t.scanId} ms=${t.ms} outcome=${t.outcome}${detail}`,
  );
}

/**
 * Run one stage, record how long it took, and rethrow whatever it threw. A
 * stage that returns normally is `ok`; the caller decides what a returned
 * failure value means and may attach a detail via `annotate`.
 */
export async function timed<T>(
  stage: ReportTimingStage,
  scanId: string,
  fn: () => Promise<T>,
  opts: {
    sink?: TimingSink;
    now?: () => number;
    /** Derive a detail string (and optionally an error outcome) from a result. */
    annotate?: (result: T) => { outcome?: "ok" | "error"; detail?: string } | void;
  } = {},
): Promise<T> {
  const sink = opts.sink ?? logTiming;
  const now = opts.now ?? (() => Date.now());
  const started = now();
  try {
    const result = await fn();
    const note = opts.annotate?.(result) ?? undefined;
    sink({
      stage,
      scanId,
      ms: Math.max(0, now() - started),
      outcome: note?.outcome ?? "ok",
      ...(note?.detail ? { detail: note.detail } : {}),
    });
    return result;
  } catch (err) {
    sink({
      stage,
      scanId,
      ms: Math.max(0, now() - started),
      outcome: "error",
      detail: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
