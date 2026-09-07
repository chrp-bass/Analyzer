import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFixtureKey } from "@/lib/scan-id";
import { getFreeReport } from "@/lib/fixtures/report.server";
import { analysisToFreeReport } from "@/lib/engine/analysis-mapping";
import type { FreeReport } from "@/lib/fixtures/tracks";

/**
 * The free half of a report's payload, reconstructed from the persisted
 * analysis.
 *
 * DELIBERATELY isolated from every upstream client. This module imports only
 * the analysis→report adapter, the fixture bundle and Supabase — no
 * Soundcharts, no Anthropic, no enrichment. It is imported by the
 * post-payment resolver, so keeping it clean is what makes the paid read
 * path provably free of upstream code: adding an upstream import here would
 * pull that client into the read path's module graph, and the isolation test
 * fails.
 *
 * Fixture tracks resolve from the bundle. A real song resolves from its
 * persisted analysis — the same engine output the free reveal was rendered
 * from at scan time, mapped through the one shared adapter so the paid report
 * and the free reveal can never disagree about what was measured.
 */

type Db = ReturnType<typeof createAdminClient>;

export async function freeReportForScan(
  db: Db | null,
  userId: string,
  scanId: string,
  trackKey: string,
): Promise<FreeReport | null> {
  if (isFixtureKey(trackKey)) return getFreeReport(trackKey);
  if (!db) return null;

  const { data } = await db
    .from("analyses")
    .select(
      "epi_score,mode,scores,circumplex,analyzed_at,status,songs!inner(title,artist_name,isrc)",
    )
    .eq("creator_id", userId)
    .eq("scan_id", scanId)
    .limit(1);

  type Row = {
    epi_score: number | null;
    mode: string | null;
    scores: {
      focus?: number;
      calm?: number;
      motivation?: number;
      balance?: number;
    } | null;
    circumplex: { valence?: number; arousal?: number } | null;
    analyzed_at: string | null;
    status: string;
    songs: {
      title: string;
      artist_name: string | null;
      isrc: string | null;
    } | null;
  };

  const row = (data as unknown as Row[] | null)?.[0];
  // Only a COMPLETED analysis describes a song. Anything else has nothing
  // honest to report yet.
  if (!row || row.status !== "complete" || !row.songs) return null;
  if (row.epi_score === null || !row.mode || !row.scores) return null;

  return analysisToFreeReport(
    {
      song: {
        songId: null,
        isrc: row.songs.isrc ?? "",
        songName: row.songs.title,
        artistName: row.songs.artist_name,
        artworkUrl: null,
      },
      scores: {
        focus: row.scores.focus ?? 0,
        calm: row.scores.calm ?? 0,
        motivation: row.scores.motivation ?? 0,
        balance: row.scores.balance ?? 0,
      },
      epiScore: row.epi_score,
      mode: row.mode,
      circumplex: {
        valence: row.circumplex?.valence ?? 0,
        arousal: row.circumplex?.arousal ?? 0,
      },
    },
    row.analyzed_at ? new Date(row.analyzed_at) : new Date(),
  );
}
