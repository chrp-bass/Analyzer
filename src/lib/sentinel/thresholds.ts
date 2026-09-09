/**
 * Every numeric threshold the sentinel judges against, in one place, so the
 * documentation (`docs/production-sentinel.md`) and the tests cite the same
 * numbers. Change a threshold here, and only here.
 *
 * Pure module (no `@/` imports): the CLI loads it under tsx.
 */

export const THRESHOLDS = {
  /** Per-check hard deadline on the Vercel side. */
  checkTimeoutMs: 12_000,
  /** Per-request timeout inside a check. */
  requestTimeoutMs: 8_000,
  /** Whole server-side run budget (the route's maxDuration is 60s). */
  serverBudgetMs: 45_000,

  /** Public route latency: WARN above, FAIL above. */
  routeLatencyWarnMs: 3_000,
  routeLatencyFailMs: 8_000,

  /** A report claim older than the governed lease TTL is stale (WARN)… */
  staleClaimMs: 90_000, // = DEFAULT_STALE_AFTER_MS in reports/prepare.ts (pinned by a test)
  /** …and older than this it is abandoned (FAIL): TTL + route maxDuration, ×5. */
  abandonedClaimMs: 15 * 60_000,

  /** Row cap for in-process duplicate detection. Above it, aggregates are a sample. */
  duplicateScanCap: 5_000,

  /** Telemetry window for pipeline and fulfillment aggregates. */
  telemetryWindowMs: 24 * 60 * 60_000,
  /** Analyses stuck in `pending` longer than this are WARN. */
  pendingAnalysisWarnMs: 60 * 60_000,
  /** Failed/(failed+complete) above this ratio, with at least `minSample`, is WARN. */
  analysisFailureRatioWarn: 0.25,
  analysisMinSample: 4,
  /** Analysis→persisted-report wall clock above this is WARN (route maxDuration). */
  preparationLatencyWarnMs: 120_000,

  /** A Stripe event received but unprocessed for longer than this is FAIL. */
  unprocessedStripeEventMs: 10 * 60_000,

  /** The sentinel waits this long, this many times, for the alias to serve the expected SHA. */
  shaSettleAttempts: 6,
  shaSettleDelayMs: 15_000,
} as const;
