import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isCompletePaidPayload,
  type BeginClaimInput,
  type BeginClaimOutcome,
  type ClaimRow,
  type CompleteClaimInput,
  type ReportStore,
  type StoredReport,
} from "@/lib/reports/store";

/**
 * The production `ReportStore`: the `reports` table (0002) plus the
 * `report_claims` lease table (0003), reached with the service-role key from
 * server code only.
 *
 * Service role bypasses RLS, so every method filters on `creator_id`
 * explicitly. Neither table has an owner-read policy — a paid report is
 * reachable only through the entitlement-checked resolver, and a claim is
 * reachable to nobody but this code.
 *
 * The atomic claim is the INSERT of a `report_claims` row under its
 * (creator_id, scan_id) primary key. It runs BEFORE analysis, enrichment or
 * generation. A stale lease is taken over by a compare-and-swap on
 * `claimed_at`, so two takeovers can never both succeed.
 */

const REPORT_COLUMNS = "id,analysis_id,payload,generator_version,model,created_at";
const CLAIM_COLUMNS = "worker,report_version,claimed_at";

type Db = ReturnType<typeof createAdminClient>;

type ReportRowShape = {
  id: string;
  analysis_id: string;
  payload: unknown;
  generator_version: string;
  model: string | null;
  created_at: string;
};

type ClaimRowShape = {
  worker: string;
  report_version: string;
  claimed_at: string;
};

function toReport(row: ReportRowShape): StoredReport {
  return {
    id: row.id,
    analysisId: row.analysis_id,
    payload: row.payload,
    generatorVersion: row.generator_version,
    model: row.model,
    createdAt: row.created_at,
  };
}

function toClaim(row: ClaimRowShape): ClaimRow {
  return {
    worker: row.worker,
    reportVersion: row.report_version,
    claimedAt: new Date(row.claimed_at),
  };
}

function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "23505" ||
    `${error.message ?? ""}`.toLowerCase().includes("duplicate key")
  );
}

export function createSupabaseReportStore(db: Db = createAdminClient()): ReportStore {
  async function getReport(userId: string, scanId: string): Promise<StoredReport | null> {
    const { data, error } = await db
      .from("reports")
      .select(REPORT_COLUMNS)
      .eq("creator_id", userId)
      .eq("scan_id", scanId)
      .limit(1);
    if (error) throw error;
    const row = (data as ReportRowShape[] | null)?.[0];
    return row ? toReport(row) : null;
  }

  async function getClaim(userId: string, scanId: string): Promise<ClaimRow | null> {
    const { data, error } = await db
      .from("report_claims")
      .select(CLAIM_COLUMNS)
      .eq("creator_id", userId)
      .eq("scan_id", scanId)
      .limit(1);
    if (error) throw error;
    const row = (data as ClaimRowShape[] | null)?.[0];
    return row ? toClaim(row) : null;
  }

  return {
    getReport,
    getClaim,

    async beginClaim(input: BeginClaimInput): Promise<BeginClaimOutcome> {
      // A complete, current-version report already exists → nobody generates.
      const existing = await getReport(input.userId, input.scanId);
      if (
        existing &&
        isCompletePaidPayload(existing.payload) &&
        existing.generatorVersion === input.generatorVersion
      ) {
        return { outcome: "ready", report: existing };
      }

      // The atomic claim: first INSERT under the (creator_id, scan_id) primary
      // key wins. This precedes ALL upstream work.
      const { error } = await db.from("report_claims").insert({
        creator_id: input.userId,
        scan_id: input.scanId,
        worker: input.worker,
        report_version: input.generatorVersion,
        claimed_at: input.startedAt.toISOString(),
      });
      if (!error) return { outcome: "acquired" };
      if (!isUniqueViolation(error)) throw error;

      // Someone already holds the lease. Fresh → poll. Stale → take over.
      const claim = await getClaim(input.userId, input.scanId);
      if (!claim) {
        // Deleted between our failed insert and this read (the holder just
        // finished or failed). Try once more to acquire.
        const retry = await db.from("report_claims").insert({
          creator_id: input.userId,
          scan_id: input.scanId,
          worker: input.worker,
          report_version: input.generatorVersion,
          claimed_at: input.startedAt.toISOString(),
        });
        if (!retry.error) return { outcome: "acquired" };
        if (!isUniqueViolation(retry.error)) throw retry.error;
        const again = await getClaim(input.userId, input.scanId);
        return { outcome: "held", startedAt: again?.claimedAt ?? input.startedAt };
      }

      const age = input.startedAt.getTime() - claim.claimedAt.getTime();
      if (age < input.staleAfterMs) {
        return { outcome: "held", startedAt: claim.claimedAt };
      }

      // Stale lease. Take it over with a compare-and-swap on claimed_at: only
      // the caller whose observed timestamp still matches wins, so two
      // concurrent takeovers cannot both succeed.
      const { data: taken, error: casError } = await db
        .from("report_claims")
        .update({
          worker: input.worker,
          report_version: input.generatorVersion,
          claimed_at: input.startedAt.toISOString(),
        })
        .eq("creator_id", input.userId)
        .eq("scan_id", input.scanId)
        .eq("claimed_at", claim.claimedAt.toISOString())
        .select("worker");
      if (casError) throw casError;
      if (taken && taken.length > 0) return { outcome: "acquired" };
      // Another worker won the takeover. Poll.
      const current = await getClaim(input.userId, input.scanId);
      return { outcome: "held", startedAt: current?.claimedAt ?? input.startedAt };
    },

    async completeClaim(input: CompleteClaimInput): Promise<{ reportId: string }> {
      // Persist the report first — the reports row is the source of truth for
      // "ready". Only then release the lease.
      const { data, error } = await db
        .from("reports")
        .upsert(
          {
            creator_id: input.userId,
            scan_id: input.scanId,
            analysis_id: input.analysisId,
            payload: input.payload,
            generator_version: input.generatorVersion,
            model: input.model,
          },
          { onConflict: "creator_id,scan_id" },
        )
        .select("id")
        .single();
      if (error) throw error;

      await db
        .from("report_claims")
        .delete()
        .eq("creator_id", input.userId)
        .eq("scan_id", input.scanId)
        .eq("worker", input.worker);

      return { reportId: (data as { id: string }).id };
    },

    async releaseClaim(userId, scanId, worker) {
      const { error } = await db
        .from("report_claims")
        .delete()
        .eq("creator_id", userId)
        .eq("scan_id", scanId)
        .eq("worker", worker);
      if (error) throw error;
    },
  };
}
