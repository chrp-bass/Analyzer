import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  classifyExistingRow,
  preparationMarker,
  readPreparationMarker,
  PREPARING_VERSION_PREFIX,
  type BeginPreparationInput,
  type BeginPreparationOutcome,
  type CompletePreparationInput,
  type ReportStore,
  type StoredReport,
} from "@/lib/reports/store";

/**
 * The production `ReportStore`: the `reports` table, reached with the
 * service-role key from server code only.
 *
 * Service role bypasses RLS, so every method filters on `creator_id`
 * explicitly. The table itself has no owner-read policy — paid intelligence
 * is reachable only through the entitlement-checked resolver.
 *
 * No schema change. The preparation lock is the (creator_id, scan_id) unique
 * index: the first insert of a marker row wins, everyone else sees a
 * unique-violation and reads the row that beat them. Taking over a stale
 * marker is a conditional UPDATE keyed on the dead worker's id, so two
 * takeovers cannot both succeed.
 */

const COLUMNS = "id,analysis_id,payload,generator_version,model,created_at";

type Db = ReturnType<typeof createAdminClient>;

type Row = {
  id: string;
  analysis_id: string;
  payload: unknown;
  generator_version: string;
  model: string | null;
  created_at: string;
};

function toRecord(row: Row): StoredReport {
  return {
    id: row.id,
    analysisId: row.analysis_id,
    payload: row.payload,
    generatorVersion: row.generator_version,
    model: row.model,
    createdAt: row.created_at,
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
      .select(COLUMNS)
      .eq("creator_id", userId)
      .eq("scan_id", scanId)
      .limit(1);
    if (error) throw error;
    const row = (data as Row[] | null)?.[0];
    return row ? toRecord(row) : null;
  }

  async function takeOver(
    existing: StoredReport,
    input: BeginPreparationInput,
  ): Promise<BeginPreparationOutcome> {
    const marker = preparationMarker(input.worker, input.startedAt);
    let query = db
      .from("reports")
      .update({
        payload: marker,
        analysis_id: input.analysisId,
        generator_version: PREPARING_VERSION_PREFIX + input.generatorVersion,
        model: null,
      })
      .eq("id", existing.id)
      .eq("creator_id", input.userId);
    const previous = readPreparationMarker(existing.payload);
    // The predicate is what makes this atomic: it only matches the exact
    // row state we observed, so a concurrent takeover matches nothing.
    query = previous
      ? query.contains("payload", { _chrp_preparing: { worker: previous.worker } })
      : query.eq("generator_version", existing.generatorVersion);
    const { data, error } = await query.select("id");
    if (error) throw error;
    if (data && data.length > 0) {
      return { outcome: "acquired", reportId: existing.id };
    }
    return { outcome: "held", startedAt: input.startedAt };
  }

  return {
    getReport,

    async beginPreparation(input) {
      const { data, error } = await db
        .from("reports")
        .insert({
          creator_id: input.userId,
          scan_id: input.scanId,
          analysis_id: input.analysisId,
          payload: preparationMarker(input.worker, input.startedAt),
          generator_version: PREPARING_VERSION_PREFIX + input.generatorVersion,
          model: null,
        })
        .select("id")
        .single();
      if (!error) return { outcome: "acquired", reportId: (data as { id: string }).id };
      if (!isUniqueViolation(error)) throw error;

      const existing = await getReport(input.userId, input.scanId);
      if (!existing) throw error;

      const verdict = classifyExistingRow(existing, input);
      if (verdict.kind === "ready") return { outcome: "ready", report: existing };
      if (verdict.kind === "held") return { outcome: "held", startedAt: verdict.startedAt };
      return takeOver(existing, input);
    },

    async completePreparation(input: CompletePreparationInput) {
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
      return { reportId: (data as { id: string }).id };
    },

    async abandonPreparation(userId, scanId, worker) {
      const { error } = await db
        .from("reports")
        .delete()
        .eq("creator_id", userId)
        .eq("scan_id", scanId)
        .contains("payload", { _chrp_preparing: { worker } });
      if (error) throw error;
    },
  };
}
