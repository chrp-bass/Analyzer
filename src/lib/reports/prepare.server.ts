import "server-only";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { decodeScanId } from "@/lib/scan-id";
import { ensureAnalysisPersisted, ENGINE_VERSION } from "@/lib/scan/fulfillment.server";
import { extractChristianContext } from "@/lib/rhodes/christian-context";
import {
  generatePaidSections,
  GENERATOR_MODEL,
  GENERATOR_VERSION,
} from "@/lib/reports/generate.server";
import { createSupabaseReportStore } from "@/lib/reports/store.supabase";
import { freeReportForScan } from "@/lib/reports/free-report.server";
import {
  assembleAnalysisFacts,
  EnrichmentError,
} from "@/lib/reports/analysis-facts.server";
import {
  checkReportReadiness,
  prepareFailureMessage,
  prepareReport,
  readReadiness,
  type PrepareResult,
  type ReadinessCheck,
  type ReadinessClaim,
  type ReadinessState,
} from "@/lib/reports/prepare";

/**
 * Production wiring for paid report preparation. The rules live in
 * `prepare.ts`; this module only supplies the real engine, the real
 * Soundcharts layer, the real Rhodes generator and the real store.
 */

export async function prepareReportForScan(
  userId: string,
  scanId: string,
): Promise<PrepareResult> {
  if (!adminConfigured()) {
    return {
      status: "failed",
      reason: "not_configured",
      message: prepareFailureMessage("not_configured"),
      timings: [],
    };
  }
  const db = createAdminClient();
  const trackKey = decodeScanId(scanId);

  return prepareReport(
    {
      store: createSupabaseReportStore(db),
      ensureAnalysis: ensureAnalysisPersisted,
      enrich: async (uid, sid) => {
        if (!trackKey) throw new EnrichmentError("invalid scan");
        const free = await freeReportForScan(db, uid, sid, trackKey);
        if (!free) throw new EnrichmentError("no analysis on file");
        return assembleAnalysisFacts(db, uid, sid, free);
      },
      christianContext: extractChristianContext,
      generate: generatePaidSections,
      generatorVersion: GENERATOR_VERSION,
      model: GENERATOR_MODEL,
    },
    userId,
    scanId,
  );
}

/** Current readiness for (identity, scan). Starts no work. */
export async function reportReadinessForScan(
  userId: string,
  scanId: string,
): Promise<ReadinessState> {
  if (!adminConfigured()) return { status: "none" };
  return readReadiness(
    createSupabaseReportStore(createAdminClient()),
    GENERATOR_VERSION,
    userId,
    scanId,
  );
}

/**
 * The checkout gate. Refuses unless a complete report is persisted for this
 * identity and scan, from the analysis on file, under the current versions,
 * and matching what the client says it prepared.
 */
export async function verifyCheckoutReadiness(
  userId: string,
  scanId: string,
  claim?: ReadinessClaim | null,
): Promise<ReadinessCheck> {
  if (!adminConfigured()) return { ok: false, reason: "not_ready" };
  const db = createAdminClient();
  return checkReportReadiness(
    {
      store: createSupabaseReportStore(db),
      findAnalysis: async (uid, sid) => {
        const { data } = await db
          .from("analyses")
          .select("id,status,engine_version")
          .eq("creator_id", uid)
          .eq("scan_id", sid)
          .limit(1);
        const row = data?.[0] as
          | { id: string; status: string; engine_version: string }
          | undefined;
        return row
          ? { id: row.id, status: row.status, engineVersion: row.engine_version }
          : null;
      },
      generatorVersion: GENERATOR_VERSION,
      engineVersion: ENGINE_VERSION,
    },
    userId,
    scanId,
    claim,
  );
}
