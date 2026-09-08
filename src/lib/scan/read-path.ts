import type { FreeReport, ReportPayload } from "@/lib/fixtures/tracks";
import type { ClaimOutcome, ReportFetchResult } from "@/lib/data-source";

/**
 * The preview read path, as one ordered decision.
 *
 * Every route that knows a scan id — /success (which redirects here),
 * /preview?paid=1, a bookmark, a dashboard link, a refresh — runs this and
 * nothing else. The order is the point:
 *
 *   1. Ask the entitled, persisted-report endpoint FIRST.
 *        200 → render that report. The free analysis is never re-run, the
 *              preparer is never invoked, and no "building" copy is shown,
 *              because nothing is being built.
 *        503 (entitled) → the purchase stands but no complete report is on
 *              file. Say so quietly. This path NEVER regenerates.
 *        403 → not entitled. Only now does the unpaid flow run: the free
 *              analysis, then the included-first-report claim, then the
 *              reveal behind the checkout boundary.
 *
 *   2. On the immediate return from Stripe the entitlement row can trail the
 *      redirect by a beat (cookie rebind, webhook delivery). That window is
 *      handled by a BOUNDED re-check of the same read endpoint, labelled as
 *      confirming access — never as report building — before the unpaid
 *      flow is allowed to run.
 *
 * This module is deliberately free of React, fetch and any server import so
 * the ordering above is testable as a plain function with recorded calls.
 */

export interface ReadPathDeps {
  /** GET /api/report/{scanId} — the entitled, persisted report. A pure read. */
  fetchEntitledReport(scanId: string): Promise<ReportFetchResult>;
  /**
   * The free reveal for a scan. For a real song this is the live analysis
   * (POST /api/song-api/analyze); for a bundled demo track it is the fixture.
   * May throw an error carrying `userMessage`.
   */
  loadFreeReport(scanId: string): Promise<FreeReport | null>;
  /** Establish a cookie identity so an included report has an owner. */
  ensureIdentity(): Promise<string | null>;
  /** POST /api/scan/claim — the included first complete report. */
  claimFirstReport(scanId: string): Promise<ClaimOutcome>;
  /** Injected so tests do not wait on real timers. */
  sleep?(ms: number): Promise<void>;
}

export type ReadPhase =
  /** The persisted-report read is in flight. Quiet; nothing is being built. */
  | "opening"
  /** Paid return, entitlement not visible yet: bounded re-check of the read. */
  | "confirming_access"
  /** Unpaid: the free analysis is running (or being read from cache). */
  | "analyzing"
  /** Unpaid: the included first report is being prepared by the server. */
  | "preparing_included";

export type ReadOutcome =
  | { kind: "persisted"; report: ReportPayload; includedFirst: boolean }
  | { kind: "unavailable"; detail: string | null }
  | { kind: "reveal"; free: FreeReport }
  | { kind: "error"; message: string };

export type ReadState =
  | { status: "working"; phase: ReadPhase; free: FreeReport | null }
  | { status: "settled"; outcome: ReadOutcome };

export interface ReadPathOptions {
  /** True on the return from a successful Stripe checkout (`?paid=1`). */
  paidReturn: boolean;
  /** A bundled demo track's free report, when the scan names one. */
  fixture?: FreeReport | null;
  /** Observes phase transitions so the UI can narrate honestly. */
  onPhase?(phase: ReadPhase, free: FreeReport | null): void;
}

/**
 * The bound on entitlement confirmation after a paid return: at most this
 * many re-reads, this far apart, before the unpaid flow is allowed to run.
 * /success only redirects once the server has seen the entitlement, so in
 * practice the first read answers; this exists for the cookie/webhook race.
 */
export const PAID_RETURN_CONFIRM_ATTEMPTS = 4;
export const PAID_RETURN_CONFIRM_DELAY_MS = 1500;

const NOT_FOUND_MESSAGE =
  "This song isn't available for analysis yet. Try a different version or another track.";
const GENERIC_MESSAGE = "Something went wrong. Please try again.";

function userMessage(err: unknown): string {
  if (
    err &&
    typeof err === "object" &&
    "userMessage" in err &&
    typeof (err as { userMessage: unknown }).userMessage === "string"
  ) {
    return (err as { userMessage: string }).userMessage;
  }
  return GENERIC_MESSAGE;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function resolveScanReadPath(
  scanId: string,
  deps: ReadPathDeps,
  opts: ReadPathOptions,
): Promise<ReadOutcome> {
  const sleep = deps.sleep ?? defaultSleep;
  const fixture = opts.fixture ?? null;
  const phase = (p: ReadPhase, free: FreeReport | null) => opts.onPhase?.(p, free);

  // ── 1. The persisted report, first and alone. ─────────────────────────
  phase("opening", fixture);
  let result = await deps.fetchEntitledReport(scanId);

  // ── 2. Paid return: bounded confirmation, labelled as such. ───────────
  if (opts.paidReturn && result.status === "forbidden") {
    for (let attempt = 1; attempt < PAID_RETURN_CONFIRM_ATTEMPTS; attempt++) {
      phase("confirming_access", fixture);
      await sleep(PAID_RETURN_CONFIRM_DELAY_MS);
      result = await deps.fetchEntitledReport(scanId);
      if (result.status !== "forbidden") break;
    }
  }

  if (result.status === "ok") {
    return { kind: "persisted", report: result.data.report, includedFirst: false };
  }
  if (result.status === "unavailable" && result.entitled) {
    // Entitled, nothing complete on file. Quiet, recoverable, non-generating.
    return { kind: "unavailable", detail: result.detail ?? null };
  }

  // ── 3. Not entitled. The unpaid flow, unchanged. ──────────────────────
  phase("analyzing", fixture);
  let free: FreeReport | null = fixture;
  if (!free) {
    try {
      free = await deps.loadFreeReport(scanId);
    } catch (err) {
      return { kind: "error", message: userMessage(err) };
    }
    if (!free) return { kind: "error", message: NOT_FOUND_MESSAGE };
  }

  if (result.status !== "forbidden") {
    // The read endpoint itself was unavailable for a non-entitled caller
    // (an unconfigured environment, a network failure). Show the reveal;
    // do not spend the creator's included report on a guess.
    return { kind: "reveal", free };
  }

  // A creator's FIRST complete report is included. Identity is established
  // silently so the included report has an owner; the server decides
  // whether this song qualifies and prepares it in full before granting.
  await deps.ensureIdentity();
  phase("preparing_included", free);
  const claim = await deps.claimFirstReport(scanId);
  if (claim === "granted" || claim === "already_entitled") {
    const after = await deps.fetchEntitledReport(scanId);
    if (after.status === "ok") {
      return {
        kind: "persisted",
        report: after.data.report,
        includedFirst: claim === "granted",
      };
    }
    if (after.status === "unavailable" && after.entitled) {
      return { kind: "unavailable", detail: after.detail ?? null };
    }
  }
  return { kind: "reveal", free };
}
