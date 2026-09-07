import "server-only";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { assertReportAccess, currentUserId } from "@/lib/commerce/entitlements";
import { isFixtureKey } from "@/lib/scan-id";
import { getFullReport, fixtureReportsPermitted } from "@/lib/fixtures/report.server";
import type { FreeReport, ReportPayload } from "@/lib/fixtures/tracks";
import type { AccessResult } from "@/lib/commerce/credit-service";
import { isCompletePaidPayload, type ReportStore } from "@/lib/reports/store";
import { createSupabaseReportStore } from "@/lib/reports/store.supabase";
import { freeReportForScan } from "@/lib/reports/analysis-facts.server";
import { prepareReportForScan } from "@/lib/reports/prepare.server";
import type { PrepareResult } from "@/lib/reports/prepare";
import { timed, type TimingSink } from "@/lib/reports/timing";

/**
 * The single answer to "may this caller read this paid report, and what is
 * it?" — shared by the JSON route, the PDF route and the Rhodes voice route
 * so they can never drift apart on either authorization or content.
 *
 * The paid path is exactly:
 *
 *   verify entitlement → read the persisted report → render
 *
 * No Soundcharts call, no enrichment, no Anthropic generation. The report
 * was generated and persisted BEFORE checkout (see prepare.ts); an
 * authorized read only ever serves that row.
 *
 * One deliberate exception, `recover`: an ENTITLED caller whose persisted
 * payload is missing or incomplete. Every such row predates this flow (a
 * purchase made when generation ran after payment and then failed), and the
 * migration rule is explicit that an already-purchased report may be
 * regenerated only when its persisted payload is incomplete. That path goes
 * through the same idempotent preparer, is logged, and is disabled for the
 * voice route — voice can never trigger generation.
 */

export type ResolvedReport =
  | { ok: true; report: ReportPayload; source: "generated" | "fixture" }
  | {
      ok: false;
      status: number;
      error: string;
      entitled: boolean;
      detail?: string;
    };

export interface ResolveOptions {
  /** Allow regeneration for an entitled caller with no complete persisted report. */
  recover?: boolean;
}

export interface ResolveDeps {
  access(scanId: string): Promise<AccessResult>;
  userId(): Promise<string | null>;
  store: ReportStore | null;
  freeReport(userId: string, scanId: string, trackKey: string): Promise<FreeReport | null>;
  recover(userId: string, scanId: string): Promise<PrepareResult>;
  fixture(trackKey: string): { report: ReportPayload; source: "generated" | "fixture" } | null;
  sink?: TimingSink;
}

const FORBIDDEN = {
  ok: false as const,
  status: 403,
  error: "forbidden",
  entitled: false,
};

function unavailable(detail: string): ResolvedReport {
  return {
    ok: false,
    status: 503,
    error: "report_unavailable",
    entitled: true,
    detail,
  };
}

const GENERATION_UNAVAILABLE =
  "report generation unavailable; your purchase is safe and access is retained";
const STILL_PREPARING =
  "your report is still being prepared; your purchase is safe and access is retained";

export async function resolveEntitledReportWith(
  deps: ResolveDeps,
  scanId: string,
  opts: ResolveOptions = {},
): Promise<ResolvedReport> {
  const recover = opts.recover ?? true;
  const sink = deps.sink;

  // ── 1. Entitlement. Denied callers learn nothing. ────────────────────────
  const access = await timed("entitlement_check", scanId, () => deps.access(scanId), {
    sink,
    annotate: (a) => (a.ok ? {} : { outcome: "error", detail: a.reason }),
  });

  if (!access.ok) {
    if (access.reason === "not_configured") {
      return {
        ok: false,
        status: 503,
        error: "entitlement_unavailable",
        entitled: false,
      };
    }
    // Every other denial returns the same opaque 403, so the endpoint cannot
    // be used to enumerate which scans exist or who owns them.
    return FORBIDDEN;
  }

  const trackKey = access.trackKey;

  const userId = await deps.userId();
  if (!userId) return FORBIDDEN;

  // The free half of the payload. A bundled demo track carries its own; a
  // real song's is reconstructed from the analysis on file.
  const free = await deps.freeReport(userId, scanId, trackKey);
  if (!free) {
    return unavailable("no analysis is on file for this scan");
  }

  if (deps.store) {
    // ── 2. The persisted report. This is the paid path. ───────────────────
    const stored = await timed(
      "persisted_report_retrieval",
      scanId,
      () => deps.store!.getReport(userId, scanId),
      {
        sink,
        annotate: (r) =>
          r
            ? isCompletePaidPayload(r.payload)
              ? { detail: `report=${r.id} version=${r.generatorVersion}` }
              : { outcome: "error", detail: "incomplete" }
            : { outcome: "error", detail: "none" },
      },
    );
    if (stored && isCompletePaidPayload(stored.payload)) {
      return { ok: true, report: { ...free, ...stored.payload }, source: "generated" };
    }

    // ── 3. Recovery, for an entitled caller with nothing complete on file. ─
    if (recover) {
      console.log(
        `[report] recovery: entitled caller has no complete persisted report for ${scanId}; preparing`,
      );
      const prepared = await deps.recover(userId, scanId);
      if (prepared.status === "ready") {
        const again = await deps.store.getReport(userId, scanId);
        if (again && isCompletePaidPayload(again.payload)) {
          return { ok: true, report: { ...free, ...again.payload }, source: "generated" };
        }
        return unavailable(GENERATION_UNAVAILABLE);
      }
      if (prepared.status === "preparing") return unavailable(STILL_PREPARING);
      // Generation failed. The entitlement stands and NO credit was spent —
      // consumption is a separate, post-success step.
      console.error(
        `[report] recovery failed for ${scanId}: ${prepared.reason} — ${prepared.detail ?? ""}`,
      );
      return unavailable(GENERATION_UNAVAILABLE);
    }
  }

  // ── 4. Fail closed, unless this is a development environment where the
  //       fixture IS the intended content.
  if (isFixtureKey(trackKey)) {
    const assembled = deps.fixture(trackKey);
    if (assembled) return { ok: true, report: assembled.report, source: assembled.source };
  }

  return unavailable(GENERATION_UNAVAILABLE);
}

/** Production wiring. */
export async function resolveEntitledReport(
  scanId: string,
  opts: ResolveOptions = {},
): Promise<ResolvedReport> {
  const db = adminConfigured() ? createAdminClient() : null;
  return resolveEntitledReportWith(
    {
      access: assertReportAccess,
      userId: currentUserId,
      store: db ? createSupabaseReportStore(db) : null,
      freeReport: (userId, sid, trackKey) => freeReportForScan(db, userId, sid, trackKey),
      recover: prepareReportForScan,
      fixture: (trackKey) => (fixtureReportsPermitted() ? getFullReport(trackKey) : null),
    },
    scanId,
    opts,
  );
}
