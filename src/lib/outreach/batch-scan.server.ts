import "server-only";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { getSpotifyClient } from "@/lib/engine/spotify";
import { getSoundchartsClient } from "@/lib/engine/soundcharts";
import { createSearchBudget } from "@/lib/engine/search-budget";
import { createSongSearch } from "@/lib/engine/song-search";
import { encodeIsrcScanId } from "@/lib/scan-id";
import { ENGINE_VERSION } from "@/lib/scan/fulfillment.server";
import { GENERATOR_VERSION } from "@/lib/reports/generate.server";
import {
  prepareReportForScan,
  reportReadinessForScan,
} from "@/lib/reports/prepare.server";
import {
  runBatch,
  type BatchDeps,
  type BatchItemInput,
  type BatchRun,
  type ExistingWork,
  type PreparedSong,
} from "@/lib/outreach/batch-scan";

/**
 * Production wiring for the admin batch scan. The rules live in
 * `batch-scan.ts`; this module supplies the real search (the scan page's
 * own, Spotify-first with the metered Soundcharts fallback and its daily
 * budget), the real paid preparation, and the real tables.
 *
 * IDENTITY. Analyses and reports are owned by a creator, and the batch has
 * no session. Every outreach scan is owned by ONE service identity — an
 * auth user with a fixed address that nobody signs in as — so batch songs
 * never land in a real creator's My Songs, and the idempotency lookup has
 * one place to look. Created on first real run if absent; the identity
 * trigger mints its `creators` row exactly as it does for anyone else.
 */

const OUTREACH_EMAIL_ENV = "ADMIN_BATCH_CREATOR_EMAIL";
const DEFAULT_OUTREACH_EMAIL = "outreach-batch@chrp.ai";

type Db = ReturnType<typeof createAdminClient>;

function outreachEmail(): string {
  return (process.env[OUTREACH_EMAIL_ENV] ?? DEFAULT_OUTREACH_EMAIL).trim().toLowerCase();
}

/** The outreach identity's creator id, or null when it does not exist yet. */
async function findOutreachCreator(db: Db): Promise<string | null> {
  const { data, error } = await db
    .from("creators")
    .select("id")
    .eq("email", outreachEmail())
    .limit(1);
  if (error) throw error;
  return (data?.[0] as { id: string } | undefined)?.id ?? null;
}

async function ensureOutreachCreator(db: Db): Promise<string> {
  const existing = await findOutreachCreator(db);
  if (existing) return existing;
  const { data, error } = await db.auth.admin.createUser({
    email: outreachEmail(),
    email_confirm: true,
    user_metadata: { service: "outreach_batch" },
  });
  if (error || !data.user) {
    throw new Error(`could not create outreach identity: ${error?.message ?? "no user"}`);
  }
  return data.user.id;
}

/**
 * The scan page's search, shared by every request this instance serves —
 * same provider order, same caches, same daily fallback budget.
 */
const search = createSongSearch({
  spotifySearch: (query, limit) => getSpotifyClient().searchTracks(query, limit),
  soundcharts: {
    searchSongs: (term, limit) => getSoundchartsClient().searchSongs(term, limit),
    getSongByUuid: (uuid) => getSoundchartsClient().getSongByUuid(uuid),
    getSongByPlatformId: (platform, id) =>
      getSoundchartsClient().getSongByPlatformId(platform, id),
  },
  budget: createSearchBudget(),
  log: (line) => console.log(line.replace("[song-api/search]", "[admin/batch-scan]")),
});

function depsFor(db: Db, creatorId: string | null, dryRun: boolean): BatchDeps {
  return {
    search,
    engineVersion: ENGINE_VERSION,
    generatorVersion: GENERATOR_VERSION,
    newScanId: encodeIsrcScanId,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: Date.now,

    async findExisting(isrc): Promise<ExistingWork | null> {
      if (!creatorId) return null;
      const { data, error } = await db
        .from("analyses")
        .select("id,scan_id,status,engine_version,analyzed_at,songs!inner(isrc)")
        .eq("creator_id", creatorId)
        .eq("songs.isrc", isrc)
        .order("analyzed_at", { ascending: false, nullsFirst: false })
        .limit(1);
      if (error) throw error;
      const row = data?.[0] as
        | { id: string; scan_id: string; status: string; engine_version: string }
        | undefined;
      if (!row) return null;
      const { data: reports, error: reportError } = await db
        .from("reports")
        .select("payload,generator_version")
        .eq("creator_id", creatorId)
        .eq("scan_id", row.scan_id)
        .limit(1);
      if (reportError) throw reportError;
      const report = reports?.[0] as { payload: unknown; generator_version: string } | undefined;
      return {
        scanId: row.scan_id,
        analysisId: row.id,
        analysisStatus: row.status,
        engineVersion: row.engine_version,
        reportPayload: report?.payload ?? null,
        generatorVersion: report?.generator_version ?? null,
      };
    },

    async prepare(scanId) {
      if (dryRun || !creatorId) throw new Error("prepare is not available in a dry run");
      return prepareReportForScan(creatorId, scanId);
    },

    async readiness(scanId) {
      if (!creatorId) return { status: "none" };
      return reportReadinessForScan(creatorId, scanId);
    },

    async readPrepared(scanId): Promise<PreparedSong | null> {
      if (!creatorId) return null;
      const { data, error } = await db
        .from("analyses")
        .select("id,epi_score,mode,scores")
        .eq("creator_id", creatorId)
        .eq("scan_id", scanId)
        .limit(1);
      if (error) throw error;
      const analysis = data?.[0] as
        | { id: string; epi_score: number | null; mode: string | null; scores: PreparedSong["scores"] }
        | undefined;
      if (!analysis) return null;
      const { data: reports, error: reportError } = await db
        .from("reports")
        .select("payload")
        .eq("creator_id", creatorId)
        .eq("scan_id", scanId)
        .limit(1);
      if (reportError) throw reportError;
      const payload = (reports?.[0] as { payload: unknown } | undefined)?.payload;
      if (!payload) return null;
      return {
        analysisId: analysis.id,
        mode: analysis.mode,
        epiScore: analysis.epi_score,
        scores: analysis.scores,
        reportPayload: payload,
      };
    },

    async record(row) {
      if (dryRun) return;
      const { error } = await db.from("outreach_batch_items").insert({
        batch_id: row.batch_id,
        scan_id: row.scan_id,
        analysis_id: row.analysis_id,
        requested_artist: row.artist,
        requested_title: row.title,
        resolved_artist: row.resolved_artist,
        resolved_title: row.resolved_title,
        isrc: row.isrc,
        instagram: row.instagram,
        status: row.status,
        reason: row.reason,
        mode: row.mode,
        epi_score: row.epi_score,
        flow_score: row.flow,
        ready_score: row.ready,
        recharge_score: row.recharge,
        recover_score: row.recover,
        finding: row.finding,
        finding_source: row.finding_source,
        finding_candidates: row.finding_candidates,
      });
      if (error) throw error;
    },
  };
}

export async function runOutreachBatch(input: {
  batch_id: string;
  dry_run: boolean;
  items: BatchItemInput[];
}): Promise<BatchRun> {
  if (!adminConfigured()) throw new Error("Supabase admin client is not configured");
  const db = createAdminClient();
  // A dry run spends nothing — not even an identity.
  const creatorId = input.dry_run
    ? await findOutreachCreator(db)
    : await ensureOutreachCreator(db);
  return runBatch(depsFor(db, creatorId, input.dry_run), input);
}
