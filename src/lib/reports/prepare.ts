import type { ChristianContext } from "@/lib/rhodes/christian-context";
import type { AnalysisFacts, GenerationResult } from "@/lib/reports/generate.server";
import type {
  FulfillmentFailure,
  FulfillmentResult,
} from "@/lib/scan/fulfillment.server";
import {
  isCompletePaidPayload,
  readPreparationMarker,
  type ReportStore,
  type StoredReport,
} from "@/lib/reports/store";
import { logTiming, timed, type ReportTiming, type TimingSink } from "@/lib/reports/timing";

/**
 * Paid report preparation — the whole intelligence chain, BEFORE checkout.
 *
 *   Spotify identity + Soundcharts audio → CHRP scoring     (analysis)
 *   → Soundcharts enrichment endpoints                       (enrichments)
 *   → Christian context gate from genre metadata             (christian_context)
 *   → governed Dr. Rhodes generation                         (rhodes_generation)
 *   → persisted to the protected `reports` table             (report_persistence)
 *
 * Only a scan whose report is persisted and complete may reach Stripe. After
 * payment the paid path reads that row and nothing else.
 *
 * Deliberately free of Supabase, Next and `server-only`: every decision here
 * is made over the injected `PrepareDeps`, so the guarantees that protect a
 * buyer — one generation per scan, no charge without a report, enrichment
 * failure closing checkout — are tested against the same code production
 * runs. `prepare.server.ts` supplies the real dependencies.
 *
 * Idempotency has two layers:
 *   1. In-process: concurrent calls for the same (user, scan) on one instance
 *      share one promise.
 *   2. Cross-instance: `ReportStore.beginPreparation` claims the row under
 *      the (creator_id, scan_id) unique index, so of N simultaneous callers
 *      on N instances exactly one generates and the rest are told to poll.
 */

export type PrepareFailureReason =
  | FulfillmentFailure
  | "enrichment_failed"
  | "context_failed"
  | "no_api_key"
  | "generation_failed"
  | "governor_rejected"
  | "persist_failed";

/** Readiness metadata. Never carries report content. */
export interface ReportReadiness {
  scanId: string;
  reportId: string;
  reportVersion: string;
  analysisId: string;
}

export type PrepareResult =
  | {
      status: "ready";
      readiness: ReportReadiness;
      /** True when a complete current report already existed and no stage ran. */
      reused: boolean;
      timings: ReportTiming[];
    }
  | { status: "preparing"; startedAt: string; timings: ReportTiming[] }
  | {
      status: "failed";
      reason: PrepareFailureReason;
      message: string;
      detail?: string;
      timings: ReportTiming[];
    };

/** What the enrichment stage hands forward. */
export interface EnrichmentBundle {
  /** Facts for Rhodes — everything except the Christian context lens. */
  facts: AnalysisFacts;
  /** The raw Soundcharts song object, the only permitted input to the gate. */
  song: unknown;
}

export interface PrepareDeps {
  store: ReportStore;
  /** Stage 1: the same engine that produced the free reveal, persisted. */
  ensureAnalysis(userId: string, scanId: string): Promise<FulfillmentResult>;
  /** Stage 2: Soundcharts song + enrichment endpoints. Throws on hard failure. */
  enrich(userId: string, scanId: string, analysisId: string): Promise<EnrichmentBundle>;
  /** Stage 3: the Christian / Worship / Gospel / CCM gate. */
  christianContext(song: unknown): ChristianContext | null;
  /** Stage 4: governed Rhodes generation. */
  generate(facts: AnalysisFacts): Promise<GenerationResult>;
  generatorVersion: string;
  model: string;
  now?: () => Date;
  worker?: () => string;
  sink?: TimingSink;
  staleAfterMs?: number;
  /** Per-instance in-flight table. Injectable so tests can model two instances. */
  inFlight?: Map<string, Promise<PrepareResult>>;
}

/**
 * How long a preparation marker stands before another worker may assume its
 * owner died (a timed-out function, a crashed instance) and take over.
 * Generation with the governor's retry runs well under this.
 */
export const DEFAULT_STALE_AFTER_MS = 4 * 60 * 1000;

const defaultInFlight = new Map<string, Promise<PrepareResult>>();

function randomWorker(): string {
  return `w_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function isReadyReport(
  stored: StoredReport | null,
  generatorVersion: string,
  analysisId?: string,
): boolean {
  if (!stored) return false;
  if (!isCompletePaidPayload(stored.payload)) return false;
  if (stored.generatorVersion !== generatorVersion) return false;
  if (analysisId && stored.analysisId !== analysisId) return false;
  return true;
}

export function readinessOf(stored: StoredReport, scanId: string): ReportReadiness {
  return {
    scanId,
    reportId: stored.id,
    reportVersion: stored.generatorVersion,
    analysisId: stored.analysisId,
  };
}

/** Buyer-facing copy for a preparation failure. Never leaks internals. */
export function prepareFailureMessage(reason: PrepareFailureReason): string {
  switch (reason) {
    case "song_unavailable":
      return "This song isn't available for analysis yet. Try a different version or another track.";
    case "audio_unavailable":
      return "Audio data isn't available for this track, so a report can't be produced. Try another version.";
    case "fixture_not_purchasable":
      return "This is a sample track and isn't for sale. Scan one of your own songs.";
    case "enrichment_failed":
      return "We couldn't gather this song's source data just now, so we haven't taken any payment. Please try again shortly.";
    default:
      return "We can't prepare this report right now, so we haven't taken any payment. Please try again shortly.";
  }
}

/**
 * Prepare the paid report for one scan, owned by one identity. Returns
 * readiness metadata only.
 */
export function prepareReport(
  deps: PrepareDeps,
  userId: string,
  scanId: string,
): Promise<PrepareResult> {
  const inFlight = deps.inFlight ?? defaultInFlight;
  const key = `${userId}:${scanId}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const run: Promise<PrepareResult> = runPreparation(deps, userId, scanId).finally(
    () => {
      if (inFlight.get(key) === run) inFlight.delete(key);
    },
  );
  inFlight.set(key, run);
  return run;
}

async function runPreparation(
  deps: PrepareDeps,
  userId: string,
  scanId: string,
): Promise<PrepareResult> {
  const timings: ReportTiming[] = [];
  const emit = deps.sink ?? logTiming;
  const sink: TimingSink = (t) => {
    timings.push(t);
    emit(t);
  };
  const now = deps.now ?? (() => new Date());
  const failed = (
    reason: PrepareFailureReason,
    detail?: string,
  ): PrepareResult => ({
    status: "failed",
    reason,
    message: prepareFailureMessage(reason),
    ...(detail ? { detail } : {}),
    timings,
  });
  const ready = (stored: StoredReport, reused: boolean): PrepareResult => ({
    status: "ready",
    readiness: readinessOf(stored, scanId),
    reused,
    timings,
  });

  // ── 1. Analysis ──────────────────────────────────────────────────────────
  const analysis = await timed(
    "analysis",
    scanId,
    () => deps.ensureAnalysis(userId, scanId),
    {
      sink,
      annotate: (r) =>
        r.ok
          ? { detail: `analysis=${r.analysisId}` }
          : { outcome: "error", detail: r.reason },
    },
  );
  if (!analysis.ok) return failed(analysis.reason, analysis.detail);

  // ── Already prepared? A complete report under the current contract for
  //    this exact analysis is reused, so a refresh, a retry or a second tab
  //    costs nothing. ─────────────────────────────────────────────────────
  const stored = await deps.store.getReport(userId, scanId);
  if (stored && isReadyReport(stored, deps.generatorVersion, analysis.analysisId)) {
    return ready(stored, true);
  }

  // ── Claim the row. Exactly one worker across all instances wins. ────────
  const worker = (deps.worker ?? randomWorker)();
  const begin = await deps.store.beginPreparation({
    userId,
    scanId,
    analysisId: analysis.analysisId,
    worker,
    startedAt: now(),
    generatorVersion: deps.generatorVersion,
    staleAfterMs: deps.staleAfterMs ?? DEFAULT_STALE_AFTER_MS,
  });
  if (begin.outcome === "ready") return ready(begin.report, true);
  if (begin.outcome === "held") {
    return { status: "preparing", startedAt: begin.startedAt.toISOString(), timings };
  }

  const abandon = () =>
    deps.store.abandonPreparation(userId, scanId, worker).catch((err) => {
      console.error(`[prepare] could not release marker for ${scanId}:`, err);
    });

  // ── 2. Enrichments ──────────────────────────────────────────────────────
  let bundle: EnrichmentBundle;
  try {
    bundle = await timed(
      "enrichments",
      scanId,
      () => deps.enrich(userId, scanId, analysis.analysisId),
      { sink },
    );
  } catch (err) {
    await abandon();
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[prepare] enrichment failed for ${scanId}: ${detail}`);
    return failed(
      detail === "song_unavailable" ? "song_unavailable" : "enrichment_failed",
      detail,
    );
  }

  // ── 3. Christian context ────────────────────────────────────────────────
  let context: ChristianContext | null;
  try {
    context = await timed(
      "christian_context",
      scanId,
      async () => deps.christianContext(bundle.song),
      {
        sink,
        annotate: (c) => ({ detail: c ? `tradition=${c.tradition}` : "gate=closed" }),
      },
    );
  } catch (err) {
    await abandon();
    return failed("context_failed", err instanceof Error ? err.message : String(err));
  }
  const facts: AnalysisFacts = context
    ? { ...bundle.facts, christianContext: context }
    : bundle.facts;

  // ── 4. Rhodes ───────────────────────────────────────────────────────────
  let generated: GenerationResult;
  try {
    generated = await timed("rhodes_generation", scanId, () => deps.generate(facts), {
      sink,
      annotate: (r) => (r.ok ? {} : { outcome: "error", detail: r.reason }),
    });
  } catch (err) {
    await abandon();
    return failed("generation_failed", err instanceof Error ? err.message : String(err));
  }
  if (!generated.ok) {
    await abandon();
    console.error(
      `[prepare] generation failed for ${scanId}: ${generated.reason} — ${generated.detail}`,
    );
    return failed(generated.reason, generated.detail);
  }

  // ── 5. Persist ──────────────────────────────────────────────────────────
  try {
    const persisted = await timed(
      "report_persistence",
      scanId,
      () =>
        deps.store.completePreparation({
          userId,
          scanId,
          analysisId: analysis.analysisId,
          payload: generated.sections,
          generatorVersion: deps.generatorVersion,
          model: deps.model,
        }),
      { sink, annotate: (r) => ({ detail: `report=${r.reportId}` }) },
    );
    return ready(
      {
        id: persisted.reportId,
        analysisId: analysis.analysisId,
        payload: generated.sections,
        generatorVersion: deps.generatorVersion,
        model: deps.model,
        createdAt: now().toISOString(),
      },
      false,
    );
  } catch (err) {
    await abandon();
    console.error(`[prepare] persist failed for ${scanId}:`, err);
    return failed("persist_failed", err instanceof Error ? err.message : String(err));
  }
}

// ─── Readiness (no work) ─────────────────────────────────────────────────────

export type ReadinessState =
  | { status: "ready"; readiness: ReportReadiness }
  | { status: "preparing"; startedAt: string }
  | { status: "none" };

/** Report the current state without starting or continuing any work. */
export async function readReadiness(
  store: ReportStore,
  generatorVersion: string,
  userId: string,
  scanId: string,
  now: Date = new Date(),
  staleAfterMs: number = DEFAULT_STALE_AFTER_MS,
): Promise<ReadinessState> {
  const stored = await store.getReport(userId, scanId);
  if (!stored) return { status: "none" };
  if (isReadyReport(stored, generatorVersion)) {
    return { status: "ready", readiness: readinessOf(stored, scanId) };
  }
  const marker = readPreparationMarker(stored.payload);
  if (marker && now.getTime() - marker.startedAt.getTime() < staleAfterMs) {
    return { status: "preparing", startedAt: marker.startedAt.toISOString() };
  }
  return { status: "none" };
}

// ─── Checkout binding ────────────────────────────────────────────────────────

export interface ReadinessClaim {
  reportId: string;
  reportVersion: string;
}

export interface AnalysisLookup {
  (userId: string, scanId: string): Promise<{
    id: string;
    status: string;
    engineVersion: string;
  } | null>;
}

export type ReadinessCheck =
  | { ok: true; readiness: ReportReadiness; engineVersion: string }
  | {
      ok: false;
      reason: "not_ready" | "analysis_incomplete" | "mismatch" | "stale_version";
    };

/**
 * May a checkout be created for this (identity, scan)?
 *
 * Yes only when a complete report is persisted for THIS identity and THIS
 * scan, produced from the analysis currently on file, under the current
 * report and engine versions — and, when the client names what it prepared,
 * only when that name matches exactly. Anything stale or mismatched is
 * refused before Stripe is contacted.
 */
export async function checkReportReadiness(
  deps: {
    store: ReportStore;
    findAnalysis: AnalysisLookup;
    generatorVersion: string;
    engineVersion: string;
  },
  userId: string,
  scanId: string,
  claim?: ReadinessClaim | null,
): Promise<ReadinessCheck> {
  const stored = await deps.store.getReport(userId, scanId);
  if (!stored || !isCompletePaidPayload(stored.payload)) {
    return { ok: false, reason: "not_ready" };
  }
  const analysis = await deps.findAnalysis(userId, scanId);
  if (!analysis || analysis.status !== "complete") {
    return { ok: false, reason: "analysis_incomplete" };
  }
  if (stored.analysisId !== analysis.id) return { ok: false, reason: "mismatch" };
  if (stored.generatorVersion !== deps.generatorVersion) {
    return { ok: false, reason: "stale_version" };
  }
  if (analysis.engineVersion !== deps.engineVersion) {
    return { ok: false, reason: "stale_version" };
  }
  if (claim) {
    if (claim.reportId !== stored.id) return { ok: false, reason: "mismatch" };
    if (claim.reportVersion !== stored.generatorVersion) {
      return { ok: false, reason: "stale_version" };
    }
  }
  return {
    ok: true,
    readiness: readinessOf(stored, scanId),
    engineVersion: analysis.engineVersion,
  };
}
