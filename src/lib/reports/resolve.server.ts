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
import {
  cachedAnalysis,
  soundchartsSongByIsrcSafe,
} from "@/lib/engine/analyze.server";
import { getSoundchartsClient } from "@/lib/engine/soundcharts";
import { extractChristianContext } from "@/lib/rhodes/christian-context";

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
    .select("epi_score,mode,circumplex,scores")
    .eq("creator_id", userId)
    .eq("scan_id", scanId)
    .limit(1);

  const row = data?.[0] as
    | {
        epi_score: number | null;
        mode: string | null;
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

  // Fetch the raw Soundcharts song ONCE. It carries the genre metadata (for
  // the Christian gate + genre roots), the audio-feature extras the
  // intelligence layer characterises against, and — indirectly, via the
  // song UUID it contains — the key for the enrichment endpoints. All of
  // this is fail-open: any missing piece silently reduces the intelligence
  // layer's output. Nothing here can block a report.
  let christianContext:
    | { tradition: import("@/lib/rhodes/christian-context").ChristianTradition; evidence: string[] }
    | null = null;
  let genres: string[] | undefined;
  let instrumentalness: number | undefined;
  let audioExtras: AnalysisFacts["audioExtras"] | undefined;
  let lyricsAnalysis: AnalysisFacts["lyricsAnalysis"] | null = null;
  let marketStats: AnalysisFacts["marketStats"] | null = null;
  let soundchartsScore: AnalysisFacts["soundchartsScore"] | null = null;

  const isrc = free.track.isrc;
  if (isrc) {
    void cachedAnalysis(isrc);
    const song = await soundchartsSongByIsrcSafe(isrc);
    if (song) {
      christianContext = extractChristianContext(song);
      const rawGenres = (song as { genres?: unknown }).genres;
      if (Array.isArray(rawGenres)) {
        const roots: string[] = [];
        for (const g of rawGenres) {
          if (g && typeof g === "object") {
            const root = (g as { root?: unknown }).root;
            if (typeof root === "string" && root.trim().length > 0) {
              roots.push(root.trim());
            }
          } else if (typeof g === "string" && g.trim().length > 0) {
            roots.push(g.trim());
          }
        }
        if (roots.length > 0) genres = roots;
      }

      // Audio extras — the by-isrc payload already carries them; the scoring
      // pipeline just doesn't need them. The intelligence layer does, so we
      // extract them defensively here. Never invented; always dropped when
      // absent.
      const audio = (song as { audio?: Record<string, unknown> }).audio;
      if (audio && typeof audio === "object") {
        const pickNum = (k: string): number | undefined => {
          const v = audio[k];
          return typeof v === "number" && Number.isFinite(v) ? v : undefined;
        };
        if (typeof audio.instrumentalness === "number") {
          instrumentalness = audio.instrumentalness;
        }
        const extras: NonNullable<AnalysisFacts["audioExtras"]> = {};
        const speechiness = pickNum("speechiness");
        if (speechiness !== undefined) extras.speechiness = speechiness;
        const acousticness = pickNum("acousticness");
        if (acousticness !== undefined) extras.acousticness = acousticness;
        const tempo = pickNum("tempo");
        if (tempo !== undefined) extras.tempo = tempo;
        const energy = pickNum("energy");
        if (energy !== undefined) extras.energy = energy;
        const liveness = pickNum("liveness");
        if (liveness !== undefined) extras.liveness = liveness;
        if (Object.keys(extras).length > 0) audioExtras = extras;
      }

      // Enrichment endpoints — every one is fail-open at the client. Run in
      // parallel; a slow one never blocks a fast one. A missing UUID means
      // we cannot address the endpoints at all, which is also fine.
      const uuid =
        typeof (song as { uuid?: unknown }).uuid === "string"
          ? ((song as { uuid: string }).uuid)
          : typeof (song as { id?: unknown }).id === "string"
            ? ((song as { id: string }).id)
            : null;
      if (uuid) {
        let client;
        try {
          client = getSoundchartsClient();
        } catch {
          client = null;
        }
        if (client) {
          const [la, ms, ss] = await Promise.all([
            client.getLyricsAnalysis(uuid),
            client.getCurrentStats(uuid),
            client.getSoundchartsScore(uuid),
          ]);
          if (la) {
            const pickString = (k: string): string | undefined => {
              const v = (la as Record<string, unknown>)[k];
              return typeof v === "string" && v.trim().length > 0 ? v : undefined;
            };
            const pickStringArray = (k: string): string[] | undefined => {
              const v = (la as Record<string, unknown>)[k];
              if (!Array.isArray(v)) return undefined;
              const clean = v.filter(
                (s): s is string => typeof s === "string" && s.trim().length > 0,
              );
              return clean.length > 0 ? clean : undefined;
            };
            const pickNum = (k: string): number | undefined => {
              const v = (la as Record<string, unknown>)[k];
              return typeof v === "number" && Number.isFinite(v) ? v : undefined;
            };
            lyricsAnalysis = {
              themes: pickStringArray("themes"),
              moods: pickStringArray("moods"),
              emotionalIntensityScore: pickNum("emotionalIntensityScore"),
              imageryScore: pickNum("imageryScore"),
              complexityScore: pickNum("complexityScore"),
              rhymeSchemeScore: pickNum("rhymeSchemeScore"),
              repetitivenessScore: pickNum("repetitivenessScore"),
              narrativeStyle: pickString("narrativeStyle"),
            };
          }
          if (ms) marketStats = ms;
          if (ss) soundchartsScore = ss;
        }
      }
    }
  }

  return {
    title: free.track.title,
    artist: free.track.artist,
    mode: (row.mode as Mode | null) ?? free.epi.mode,
    epiScore: row.epi_score ?? free.epi.score,
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
    // NOT energy. circumplex.arousal is CHRP's weighted arousal — energy is
    // only one of its five inputs — so passing it as spotify_energy would
    // have Rhodes report a composite as a raw audio feature. Raw energy is
    // not persisted, so the field is omitted rather than approximated.
    arousal: row.circumplex?.arousal,
    ...(typeof instrumentalness === "number" ? { instrumentalness } : {}),
    ...(audioExtras ? { audioExtras } : {}),
    ...(genres ? { genres } : {}),
    ...(lyricsAnalysis ? { lyricsAnalysis } : {}),
    ...(marketStats ? { marketStats } : {}),
    ...(soundchartsScore ? { soundchartsScore } : {}),
    ...(christianContext ? { christianContext } : {}),
  };
}
