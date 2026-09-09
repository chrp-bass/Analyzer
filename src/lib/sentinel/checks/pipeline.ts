/**
 * Boundary 4 — the intelligence pipeline (Spotify → Soundcharts → engine →
 * enrichments → Rhodes generation → persistence).
 *
 * Nothing is generated or regenerated. Configuration is presence-only.
 * Telemetry is read from the tables the pipeline already writes (`analyses`,
 * `reports`), as counts and durations. Stage latency lives only in
 * `[report-timing]` log lines, which have no queryable surface — reported as
 * NOT_EXERCISED rather than invented.
 */

import { boundaryResult, percentile, runCheck, type CheckOutcome } from "../evaluate";
import { envPresent } from "../http";
import type { PostgrestReader } from "../postgrest";
import { sanitizeText } from "../redact";
import { THRESHOLDS } from "../thresholds";
import type { BoundaryResult, CheckResult, CheckStatus, Evidence } from "../types";

export const PIPELINE_REQUIRED_ENV = [
  "ANTHROPIC_API_KEY",
  "SOUNDCHARTS_APP_ID",
  "SOUNDCHARTS_API_KEY",
  "SPOTIFY_CLIENT_ID",
  "SPOTIFY_CLIENT_SECRET",
] as const;

/** Must stay unset in production: it serves fixture prose as the paid product. */
export const FIXTURE_ESCAPE_HATCH = "CHRP_ALLOW_FIXTURE_REPORTS";

export interface PipelineCheckDeps {
  env: Record<string, string | undefined>;
  reader: PostgrestReader | null;
  /** The generator version current builds persist. */
  generatorVersion: string;
  now?: () => number;
  checkTimeoutMs?: number;
}

type ReportLatencyRow = { created_at: string; analyses: { created_at: string } | null };

export async function runPipelineChecks(deps: PipelineCheckDeps): Promise<BoundaryResult> {
  const now = deps.now ?? (() => Date.now());
  const timeout = deps.checkTimeoutMs ?? THRESHOLDS.checkTimeoutMs;
  const started = now();
  const opts = { now, sanitize: sanitizeText };
  const env = deps.env;

  const configuration = runCheck("configuration", timeout, async (): Promise<CheckOutcome> => {
    const missing = PIPELINE_REQUIRED_ENV.filter((n) => !envPresent(env, n));
    const evidence: Evidence = { required: PIPELINE_REQUIRED_ENV.length, missing };
    if (missing.length) return { status: "FAIL" as CheckStatus, summary: `missing: ${missing.join(", ")}`, evidence };
    return { status: "PASS" as CheckStatus, summary: "Anthropic, Soundcharts and Spotify configuration present", evidence };
  }, opts);

  const escapeHatch = runCheck("fixture_escape_hatch_unset", timeout, async (): Promise<CheckOutcome> => {
    const raw = env[FIXTURE_ESCAPE_HATCH]?.trim().toLowerCase();
    const set = Boolean(raw) && raw !== "false" && raw !== "0";
    if (set) {
      return { status: "FAIL" as CheckStatus, summary: `${FIXTURE_ESCAPE_HATCH} is set — fixture prose would be served as paid intelligence`, evidence: { set: true } };
    }
    return { status: "PASS" as CheckStatus, summary: `${FIXTURE_ESCAPE_HATCH} is unset`, evidence: { set: false } };
  }, opts);

  const analyses = runCheck("analyses_recent", timeout, async (): Promise<CheckOutcome> => {
    const r = deps.reader;
    if (!r) return { status: "NOT_EXERCISED" as CheckStatus, summary: "telemetry unavailable (Supabase unconfigured)" };
    const t = now();
    const since = new Date(t - THRESHOLDS.telemetryWindowMs).toISOString();
    const pendingBefore = new Date(t - THRESHOLDS.pendingAnalysisWarnMs).toISOString();
    const [complete, failed, pending, stuck] = await Promise.all([
      r.count("analyses", `status=eq.complete&created_at=gte.${encodeURIComponent(since)}`),
      r.count("analyses", `status=eq.failed&created_at=gte.${encodeURIComponent(since)}`),
      r.count("analyses", `status=eq.pending&created_at=gte.${encodeURIComponent(since)}`),
      r.count("analyses", `status=eq.pending&created_at=lt.${encodeURIComponent(pendingBefore)}`),
    ]);
    for (const c of [complete, failed, pending, stuck]) {
      if (!c.ok) return { status: "FAIL" as CheckStatus, summary: `analyses unreadable: ${c.kind}${c.status ? ` status=${c.status}` : ""}` };
    }
    const evidence: Evidence = {
      windowHours: THRESHOLDS.telemetryWindowMs / 3_600_000,
      complete: (complete as { count: number }).count,
      failed: (failed as { count: number }).count,
      pending: (pending as { count: number }).count,
      pendingStuck: (stuck as { count: number }).count,
    };
    const c = evidence.complete as number;
    const f = evidence.failed as number;
    if ((evidence.pendingStuck as number) > 0) {
      return { status: "WARN" as CheckStatus, summary: `${evidence.pendingStuck} analysis(es) pending for over ${THRESHOLDS.pendingAnalysisWarnMs / 60000} min`, evidence };
    }
    if (c + f >= THRESHOLDS.analysisMinSample && f / (c + f) > THRESHOLDS.analysisFailureRatioWarn) {
      return { status: "WARN" as CheckStatus, summary: `analysis failure ratio ${(100 * f / (c + f)).toFixed(0)}% over ${c + f} runs`, evidence };
    }
    if (c + f === 0) return { status: "PASS" as CheckStatus, summary: "idle: no analyses in the window", evidence };
    return { status: "PASS" as CheckStatus, summary: `${c} complete, ${f} failed analyses in the window`, evidence };
  }, opts);

  const reports = runCheck("reports_recent", timeout, async (): Promise<CheckOutcome> => {
    const r = deps.reader;
    if (!r) return { status: "NOT_EXERCISED" as CheckStatus, summary: "telemetry unavailable (Supabase unconfigured)" };
    const since = new Date(now() - THRESHOLDS.telemetryWindowMs).toISOString();
    // Governed text sections a complete payload always carries (see
    // `isCompletePaidPayload`). `complete_report` refuses empty strings, so a
    // null section is the persisted-incomplete signature.
    const incompleteFilter =
      "or=(payload->>signature.is.null,payload->>rhodes.is.null,payload->>throughline.is.null,payload->>placements.is.null)";
    const [created, current, incomplete] = await Promise.all([
      r.count("reports", `created_at=gte.${encodeURIComponent(since)}`),
      r.count("reports", `created_at=gte.${encodeURIComponent(since)}&generator_version=eq.${encodeURIComponent(deps.generatorVersion)}`),
      r.count("reports", incompleteFilter),
    ]);
    for (const c of [created, current, incomplete]) {
      if (!c.ok) return { status: "FAIL" as CheckStatus, summary: `reports unreadable: ${c.kind}${c.status ? ` status=${c.status}` : ""}` };
    }
    const evidence: Evidence = {
      windowHours: THRESHOLDS.telemetryWindowMs / 3_600_000,
      reportsPersisted: (created as { count: number }).count,
      onCurrentGenerator: (current as { count: number }).count,
      incompletePersistedAllTime: (incomplete as { count: number }).count,
    };
    if ((evidence.incompletePersistedAllTime as number) > 0) {
      return { status: "WARN" as CheckStatus, summary: `${evidence.incompletePersistedAllTime} persisted report(s) have empty governed sections — entitled reads answer 503 until the offline backfill runs`, evidence };
    }
    if ((evidence.reportsPersisted as number) > 0 && (evidence.onCurrentGenerator as number) < (evidence.reportsPersisted as number)) {
      return { status: "WARN" as CheckStatus, summary: "recent reports were persisted on a superseded generator version", evidence };
    }
    if ((evidence.reportsPersisted as number) === 0) return { status: "PASS" as CheckStatus, summary: "idle: no reports persisted in the window; none incomplete", evidence };
    return { status: "PASS" as CheckStatus, summary: `${evidence.reportsPersisted} complete report(s) persisted in the window`, evidence };
  }, opts);

  const latency = runCheck("preparation_latency", timeout, async (): Promise<CheckOutcome> => {
    const r = deps.reader;
    if (!r) return { status: "NOT_EXERCISED" as CheckStatus, summary: "telemetry unavailable (Supabase unconfigured)" };
    const since = new Date(now() - THRESHOLDS.telemetryWindowMs).toISOString();
    const rows = await r.rows<ReportLatencyRow>(
      "reports",
      "created_at,analyses(created_at)",
      `created_at=gte.${encodeURIComponent(since)}`,
      500,
    );
    if (!rows.ok) return { status: "FAIL" as CheckStatus, summary: `latency proxy unreadable: ${rows.kind}${rows.status ? ` status=${rows.status}` : ""}` };
    const samples: number[] = [];
    for (const row of rows.rows) {
      const a = row.analyses?.created_at ? Date.parse(row.analyses.created_at) : NaN;
      const b = Date.parse(row.created_at);
      if (Number.isFinite(a) && Number.isFinite(b) && b >= a) samples.push(b - a);
    }
    const evidence: Evidence = {
      windowHours: THRESHOLDS.telemetryWindowMs / 3_600_000,
      samples: samples.length,
      p50Ms: percentile(samples, 50),
      p95Ms: percentile(samples, 95),
      maxMs: percentile(samples, 100),
      warnAboveMs: THRESHOLDS.preparationLatencyWarnMs,
      proxy: "analysis row → persisted report row (wall clock)",
    };
    if (samples.length === 0) return { status: "PASS" as CheckStatus, summary: "idle: no preparations to time in the window", evidence };
    if ((evidence.p95Ms as number) > THRESHOLDS.preparationLatencyWarnMs) {
      return { status: "WARN" as CheckStatus, summary: `preparation p95 ${Math.round((evidence.p95Ms as number) / 1000)}s exceeds ${THRESHOLDS.preparationLatencyWarnMs / 1000}s`, evidence };
    }
    return { status: "PASS" as CheckStatus, summary: `preparation p50 ${Math.round((evidence.p50Ms as number) / 1000)}s, p95 ${Math.round((evidence.p95Ms as number) / 1000)}s over ${samples.length} report(s)`, evidence };
  }, opts);

  const notExercised: CheckResult[] = [
    {
      id: "stage_latency",
      status: "NOT_EXERCISED",
      summary: "per-stage timings exist only as [report-timing] log lines; no persisted telemetry surface to query",
    },
    {
      id: "generation",
      status: "NOT_EXERCISED",
      summary: "Anthropic generation is not exercised: it costs money and would persist a report",
    },
    {
      id: "upstream_engines",
      status: "NOT_EXERCISED",
      summary: "Soundcharts and Spotify are not called: metered quota; configuration is checked presence-only",
    },
  ];

  const checks: CheckResult[] = [
    ...(await Promise.all([configuration, escapeHatch, analyses, reports, latency])),
    ...notExercised,
  ];
  return boundaryResult("pipeline", checks, now() - started);
}
