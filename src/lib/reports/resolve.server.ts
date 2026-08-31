import "server-only";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { assertReportAccess, currentUserId } from "@/lib/commerce/entitlements";
import { isFixtureKey } from "@/lib/scan-id";
import {
  getFreeReport,
  getFullReport,
  fixtureReportsPermitted,
} from "@/lib/fixtures/report.server";
import {
  findAnalysis,
  getPersistedReport,
  persistReport,
} from "@/lib/memory/catalog.server";
import { analysisToFreeReport } from "@/lib/engine/analysis-mapping";
import {
  generatePaidSections,
  GENERATOR_MODEL,
  GENERATOR_VERSION,
  type AnalysisFacts,
} from "@/lib/reports/generate.server";
import type { FreeReport, Mode, ReportPayload } from "@/lib/fixtures/tracks";

/**
 * The single answer to "may this caller read this paid report, and what is
 * it?" — shared by the JSON route and the PDF route so the two can never
 * drift apart on either authorization or content.
 *
 * Order of resolution:
 *   1. Entitlement. Denied callers learn nothing.
 *   2. A persisted report, if one exists. An authorized re-read must not
 *      re-invoke the model — that is what makes opening a report free.
 *   3. Real generation from the completed analysis, then persistence.
 *   4. Fail closed. In production a fixture is never substituted.
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

type Db = ReturnType<typeof createAdminClient>;

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

export async function resolveEntitledReport(
  scanId: string,
): Promise<ResolvedReport> {
  const access = await assertReportAccess(scanId);

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

  const userId = await currentUserId();
  if (!userId) return FORBIDDEN;

  const db = adminConfigured() ? createAdminClient() : null;

  // The free half of the payload. A bundled demo track carries its own; a
  // real song's is reconstructed from the analysis on file — which is why
  // this lookup is asynchronous rather than a synchronous fixture read.
  const free = await freeReportForScan(db, userId, scanId, trackKey);
  if (!free) {
    return unavailable("no analysis is on file for this scan");
  }

  if (db) {
    // ── 2. Already generated? Serve the stored payload. ───────────────────
    const stored = await getPersistedReport(db, userId, scanId);
    if (stored) {
      return { ok: true, report: { ...free, ...stored }, source: "generated" };
    }

    // ── 3. Generate once, from the completed analysis on file. ────────────
    const analysis = await findAnalysis(db, userId, scanId);
    if (analysis && analysis.status === "complete") {
      const facts = await factsForAnalysis(db, userId, scanId, free);
      if (facts) {
        const result = await generatePaidSections(facts);
        if (result.ok) {
          await persistReport(db, {
            userId,
            scanId,
            analysisId: analysis.id,
            payload: result.sections,
            generatorVersion: GENERATOR_VERSION,
            model: GENERATOR_MODEL,
          });
          return {
            ok: true,
            report: { ...free, ...result.sections },
            source: "generated",
          };
        }

        // Generation failed. The entitlement stands and NO credit was spent —
        // consumption is a separate, post-success step.
        console.error(
          `[report] generation failed for ${scanId}: ${result.reason} — ${result.detail}`,
        );
        return unavailable(GENERATION_UNAVAILABLE);
      }
    }
  }

  // ── 4. Fail closed, unless this is a development environment where the
  //       fixture IS the intended content.
  if (fixtureReportsPermitted() && isFixtureKey(trackKey)) {
    const assembled = getFullReport(trackKey);
    if (assembled) {
      return { ok: true, report: assembled.report, source: assembled.source };
    }
  }

  return unavailable(GENERATION_UNAVAILABLE);
}

/**
 * The free reveal for a scan.
 *
 * Fixture tracks resolve from the bundle. A real song resolves from its
 * persisted analysis — the same engine output the free reveal was rendered
 * from at scan time, mapped through the one shared adapter so the paid report
 * and the free reveal can never disagree about what was measured.
 */
async function freeReportForScan(
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
      "epi_score,mode,verdict,scores,circumplex,analyzed_at,status,songs!inner(title,artist_name,isrc)",
    )
    .eq("creator_id", userId)
    .eq("scan_id", scanId)
    .limit(1);

  type Row = {
    epi_score: number | null;
    mode: string | null;
    verdict: string | null;
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
      verdict: row.verdict ?? "",
    },
    row.analyzed_at ? new Date(row.analyzed_at) : new Date(),
  );
}

/**
 * Assemble the generator's inputs from the persisted analysis.
 *
 * Only real, pre-generation facts are read. Anything the engine did not
 * produce is left absent rather than filled in — `generatePaidSections`
 * refuses outright if a fact the report actually renders is missing.
 */
async function factsForAnalysis(
  db: Db,
  userId: string,
  scanId: string,
  free: FreeReport,
): Promise<AnalysisFacts | null> {
  const { data } = await db
    .from("analyses")
    .select("epi_score,mode,verdict,verdict_rationale,circumplex,scores")
    .eq("creator_id", userId)
    .eq("scan_id", scanId)
    .limit(1);

  const row = data?.[0] as
    | {
        epi_score: number | null;
        mode: string | null;
        verdict: string | null;
        verdict_rationale: string | null;
        circumplex: { valence?: number; arousal?: number } | null;
        scores: {
          focus?: number;
          calm?: number;
          motivation?: number;
          balance?: number;
        } | null;
      }
    | undefined;
  if (!row) return null;

  const verdict = row.verdict;
  if (verdict !== "Pitch Now" && verdict !== "Develop" && verdict !== "Hold") {
    return null;
  }

  return {
    title: free.track.title,
    artist: free.track.artist,
    mode: (row.mode as Mode | null) ?? free.epi.mode,
    epiScore: row.epi_score ?? free.epi.score,
    verdict,
    // Never defaulted. When the scoring pipeline has produced no grounded
    // rationale this stays null and generation refuses.
    verdictRationale: row.verdict_rationale,
    // The measured profile behind the mode. Without it the generator sees
    // only the winning number and has to reason around the song rather than
    // from it.
    dimensions:
      row.scores &&
      typeof row.scores.focus === "number" &&
      typeof row.scores.calm === "number" &&
      typeof row.scores.motivation === "number" &&
      typeof row.scores.balance === "number"
        ? {
            focus: row.scores.focus,
            calm: row.scores.calm,
            motivation: row.scores.motivation,
            balance: row.scores.balance,
          }
        : null,
    valence: row.circumplex?.valence,
    energy: row.circumplex?.arousal,
  };
}
