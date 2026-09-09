import type {
  BoundaryId,
  BoundaryResult,
  CheckResult,
  CheckStatus,
  OverallStatus,
} from "./types";

/** Severity order for rollups. NOT_EXERCISED is neutral. */
const RANK: Record<CheckStatus, number> = {
  NOT_EXERCISED: 0,
  PASS: 1,
  WARN: 2,
  FAIL: 3,
};

export function worstStatus(statuses: readonly CheckStatus[]): CheckStatus {
  if (statuses.length === 0) return "NOT_EXERCISED";
  let worst: CheckStatus = "NOT_EXERCISED";
  for (const s of statuses) if (RANK[s] > RANK[worst]) worst = s;
  return worst;
}

export function boundaryResult(
  boundary: BoundaryId,
  checks: CheckResult[],
  ms: number,
): BoundaryResult {
  return {
    boundary,
    status: worstStatus(checks.map((c) => c.status)),
    ms: Math.max(0, Math.round(ms)),
    checks,
  };
}

export function overallStatus(boundaries: readonly BoundaryResult[]): OverallStatus {
  const worst = worstStatus(boundaries.map((b) => b.status));
  if (worst === "FAIL") return "RED";
  if (worst === "WARN") return "YELLOW";
  return "GREEN";
}

/** What a check body returns; `runCheck` adds the id and timing. */
export type CheckOutcome = Omit<CheckResult, "id" | "ms">;

/**
 * Run one check body with a hard deadline. A check that throws or times out
 * becomes a FAIL with a sanitised summary — the sentinel itself never crashes
 * because a dependency misbehaved.
 */
export async function runCheck(
  id: string,
  timeoutMs: number,
  body: (signal: AbortSignal) => Promise<CheckOutcome>,
  opts: { now?: () => number; sanitize: (v: unknown) => string } = { sanitize: String },
): Promise<CheckResult> {
  const now = opts.now ?? (() => Date.now());
  const started = now();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new SentinelTimeout(id, timeoutMs));
    }, Math.max(1, timeoutMs));
  });
  try {
    const result = await Promise.race([body(controller.signal), timeout]);
    return { id, ...result, ms: now() - started };
  } catch (err) {
    const timedOut = err instanceof SentinelTimeout || controller.signal.aborted;
    return {
      id,
      status: "FAIL",
      summary: timedOut
        ? `timed out after ${timeoutMs}ms`
        : `check threw: ${opts.sanitize(err)}`,
      ms: now() - started,
      evidence: { failure: timedOut ? "timeout" : "exception" },
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class SentinelTimeout extends Error {
  override readonly name = "SentinelTimeout";
  constructor(
    readonly checkId: string,
    readonly timeoutMs: number,
  ) {
    super(`${checkId} timed out after ${timeoutMs}ms`);
  }
}

/** Percentile over a numeric sample (nearest-rank). */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}
