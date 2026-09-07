import "server-only";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { assertReportAccess, currentUserId } from "@/lib/commerce/entitlements";
import { isFixtureKey } from "@/lib/scan-id";
import { getFullReport, fixtureReportsPermitted } from "@/lib/fixtures/report.server";
import type { FreeReport, ReportPayload } from "@/lib/fixtures/tracks";
import type { AccessResult } from "@/lib/commerce/credit-service";
import { isCompletePaidPayload, type ReportStore } from "@/lib/reports/store";
import { createSupabaseReportStore } from "@/lib/reports/store.supabase";
import { freeReportForScan } from "@/lib/reports/free-report.server";
import { timed, type TimingSink } from "@/lib/reports/timing";

/**
 * The single answer to "may this caller read this paid report, and what is
 * it?" — shared by the JSON route, the PDF route and the Rhodes voice route
 * so they can never drift apart on either authorization or content.
 *
 * The paid path is EXACTLY:
 *
 *   verify entitlement → read the persisted report → render
 *
 * This module PERFORMS NO GENERATION and imports no upstream client. It does
 * not call Soundcharts, the enrichment endpoints, or Anthropic, and it cannot
 * reach code that does — that is enforced structurally (its only report
 * dependency is the store, which touches Postgres alone) and by the isolation
 * test that greps this module's import graph. A buyer's first paid read never
 * performs upstream work, even for a legacy or incomplete report.
 *
 * An entitled caller whose persisted payload is missing or incomplete gets an
 * honest 503 ("still being prepared"), NOT a synchronous regeneration.
 * Regenerating incomplete entitled reports is an OFFLINE, operator-run
 * concern — see `scripts/backfill-reports.mts` and `docs/paid-fulfillment.md`.
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

export interface ResolveDeps {
  access(scanId: string): Promise<AccessResult>;
  userId(): Promise<string | null>;
  store: ReportStore | null;
  freeReport(userId: string, scanId: string, trackKey: string): Promise<FreeReport | null>;
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

/**
 * An entitled caller whose report is not yet complete. This is NOT a
 * generation trigger: the message tells them their access is safe and the
 * report is being prepared. In steady state this never fires — preparation
 * runs and persists before checkout — and any legacy incomplete report is
 * fixed by the offline backfill, not by this read.
 */
const NOT_YET_READY =
  "your report is being prepared; your purchase is safe and access is retained";

export async function resolveEntitledReportWith(
  deps: ResolveDeps,
  scanId: string,
): Promise<ResolvedReport> {
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
    // ── 2. The persisted report. This is the whole paid path. ─────────────
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
    // Entitled, but nothing complete on file. Honest, non-generating 503.
    if (stored) {
      console.error(
        `[report] entitled read for ${scanId} found an INCOMPLETE persisted report (${stored.id}); serving 503, NOT regenerating. Run the offline backfill.`,
      );
    }
    return unavailable(NOT_YET_READY);
  }

  // ── 3. Fail closed, unless this is a development environment where the
  //       fixture IS the intended content.
  if (isFixtureKey(trackKey)) {
    const assembled = deps.fixture(trackKey);
    if (assembled) return { ok: true, report: assembled.report, source: assembled.source };
  }

  return unavailable(NOT_YET_READY);
}

/** Production wiring. Pure read — no preparer, no upstream client. */
export async function resolveEntitledReport(scanId: string): Promise<ResolvedReport> {
  const db = adminConfigured() ? createAdminClient() : null;
  return resolveEntitledReportWith(
    {
      access: assertReportAccess,
      userId: currentUserId,
      store: db ? createSupabaseReportStore(db) : null,
      freeReport: (userId, sid, trackKey) => freeReportForScan(db, userId, sid, trackKey),
      fixture: (trackKey) => (fixtureReportsPermitted() ? getFullReport(trackKey) : null),
    },
    scanId,
  );
}
