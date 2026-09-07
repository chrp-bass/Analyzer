import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  BeginClaimInput,
  BeginClaimOutcome,
  ClaimRow,
  CompleteClaimInput,
  CompleteClaimOutcome,
  RenewOutcome,
  ReportStore,
  StoredReport,
} from "@/lib/reports/store";

/**
 * The production `ReportStore`: the `reports` table (0002) plus the
 * `report_claims` fenced-lease table and its functions (0003), reached with
 * the service-role key from server code only.
 *
 * Every mutation goes through a Postgres function so that fencing and
 * atomicity live in the database, not in the application:
 *
 *   beginClaim    → claim_report_lease   (atomic acquire-or-takeover)
 *   renewClaim    → renew_report_lease   (heartbeat on DB time, fenced)
 *   completeClaim → complete_report      (persist + release in one tx, fenced)
 *   releaseClaim  → release_report_lease (fenced delete of own lease)
 *
 * Reads (`getReport`, `getClaim`) are ordinary selects scoped by creator_id.
 */

const REPORT_COLUMNS = "id,analysis_id,payload,generator_version,model,created_at";
const CLAIM_COLUMNS = "worker,lease_token,fence,report_version,claimed_at";

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
  lease_token: string;
  fence: number;
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
    return row
      ? {
          worker: row.worker,
          token: row.lease_token,
          fence: row.fence,
          reportVersion: row.report_version,
          claimedAt: new Date(row.claimed_at),
        }
      : null;
  }

  return {
    getReport,
    getClaim,

    async beginClaim(input: BeginClaimInput): Promise<BeginClaimOutcome> {
      const staleSeconds = Math.max(1, Math.ceil(input.staleAfterMs / 1000));
      const { data, error } = await db.rpc("claim_report_lease", {
        p_creator: input.userId,
        p_scan: input.scanId,
        p_worker: input.worker,
        p_version: input.generatorVersion,
        p_stale_seconds: staleSeconds,
      });
      if (error) throw error;

      const row = (data as Array<{
        acquired: boolean;
        out_token: string | null;
        out_fence: number | null;
        out_claimed_at: string | null;
      }> | null)?.[0];

      // Zero rows → a FRESH lease is held by someone else.
      if (!row) {
        const claim = await getClaim(input.userId, input.scanId);
        return { outcome: "held", startedAt: claim?.claimedAt ?? new Date() };
      }

      // acquired=false → a complete current-version report exists.
      if (!row.acquired) {
        const report = await getReport(input.userId, input.scanId);
        if (report) return { outcome: "ready", report };
        // The report vanished between the RPC's check and our read (a
        // rebind, say). Fall back to a poll rather than racing.
        const claim = await getClaim(input.userId, input.scanId);
        return { outcome: "held", startedAt: claim?.claimedAt ?? new Date() };
      }

      return {
        outcome: "acquired",
        lease: {
          worker: input.worker,
          token: row.out_token as string,
          fence: row.out_fence as number,
        },
      };
    },

    async renewClaim(userId, scanId, lease): Promise<RenewOutcome> {
      const { data, error } = await db.rpc("renew_report_lease", {
        p_creator: userId,
        p_scan: scanId,
        p_worker: lease.worker,
        p_token: lease.token,
      });
      if (error) throw error;
      const row = (data as Array<{ out_fence: number }> | null)?.[0];
      return row ? { renewed: true, fence: row.out_fence } : { renewed: false };
    },

    async completeClaim(input: CompleteClaimInput): Promise<CompleteClaimOutcome> {
      const { data, error } = await db.rpc("complete_report", {
        p_creator: input.userId,
        p_scan: input.scanId,
        p_worker: input.lease.worker,
        p_token: input.lease.token,
        p_analysis: input.analysisId,
        p_payload: input.payload,
        p_version: input.generatorVersion,
        p_model: input.model,
      });
      if (error) throw error;
      const row = (data as Array<{ ok: boolean; out_report_id: string | null }> | null)?.[0];
      if (row && row.ok && row.out_report_id) {
        return { ok: true, reportId: row.out_report_id };
      }
      return { ok: false, reason: "lost" };
    },

    async releaseClaim(userId, scanId, lease) {
      const { error } = await db.rpc("release_report_lease", {
        p_creator: userId,
        p_scan: scanId,
        p_worker: lease.worker,
        p_token: lease.token,
      });
      if (error) throw error;
    },
  };
}
