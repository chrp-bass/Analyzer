import "server-only";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { assertReportAccess, currentUserId } from "@/lib/commerce/entitlements";
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
import {
  generatePaidSections,
  GENERATOR_MODEL,
  GENERATOR_VERSION,
  type AnalysisFacts,
} from "@/lib/reports/generate.server";
import type { Mode, ReportPayload } from "@/lib/fixtures/tracks";

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

const FORBIDDEN = {
  ok: false as const,
  status: 403,
  error: "forbidden",
  entitled: false,
};

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
  const free = getFreeReport(trackKey);
  if (!free) {
    return {
      ok: false,
      status: 503,
      error: "report_unavailable",
      entitled: true,
      detail: "no analysis is on file for this scan",
    };
  }

  const userId = await currentUserId();
  if (!userId) return FORBIDDEN;

  // ── 2. Already generated? Serve the stored payload. ─────────────────────
  if (adminConfigured()) {
    const db = createAdminClient();
    const stored = await getPersistedReport(db, userId, scanId);
    if (stored) {
      return { ok: true, report: { ...free, ...stored }, source: "generated" };
    }

    // ── 3. Generate once, from the completed analysis on file. ────────────
    const analysis = await findAnalysis(db, userId, scanId);
    if (analysis && analysis.status === "complete") {
      const facts = await factsForAnalysis(db, userId, scanId, free.track.title, free.track.artist, free.epi.mode, free.epi.score);
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
        return {
          ok: false,
          status: 503,
          error: "report_unavailable",
          entitled: true,
          detail:
            "report generation unavailable; your purchase is safe and access is retained",
        };
      }
    }
  }

  // ── 4. Fail closed, unless this is a development environment where the
  //       fixture IS the intended content.
  if (fixtureReportsPermitted()) {
    const assembled = getFullReport(trackKey);
    if (assembled) {
      return { ok: true, report: assembled.report, source: assembled.source };
    }
  }

  return {
    ok: false,
    status: 503,
    error: "report_unavailable",
    entitled: true,
    detail:
      "report generation unavailable; your purchase is safe and access is retained",
  };
}

/**
 * Assemble the generator's inputs from the persisted analysis.
 *
 * Only real, pre-generation facts are read. Anything the engine did not
 * produce is left absent rather than filled in — `generatePaidSections`
 * refuses outright if a fact the report actually renders is missing.
 */
async function factsForAnalysis(
  db: ReturnType<typeof createAdminClient>,
  userId: string,
  scanId: string,
  title: string,
  artist: string,
  fallbackMode: Mode,
  fallbackScore: number,
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
      }
    | undefined;
  if (!row) return null;

  const verdict = row.verdict;
  if (verdict !== "Pitch Now" && verdict !== "Develop" && verdict !== "Hold") {
    return null;
  }

  return {
    title,
    artist,
    mode: (row.mode as Mode | null) ?? fallbackMode,
    epiScore: row.epi_score ?? fallbackScore,
    verdict,
    verdictRationale: row.verdict_rationale,
    valence: row.circumplex?.valence,
    energy: row.circumplex?.arousal,
  };
}
