import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AnalysisFacts } from "@/lib/reports/generate.server";
import type { FreeReport, Mode } from "@/lib/fixtures/tracks";
import { soundchartsSongByIsrcSafe } from "@/lib/engine/analyze.server";
import { getSoundchartsClient } from "@/lib/engine/soundcharts";
import type { EnrichmentBundle } from "@/lib/reports/prepare";

/**
 * The inputs Rhodes reasons from, read back from the persisted analysis and
 * widened by the Soundcharts intelligence layer.
 *
 * This code moved here unchanged from the resolver, where it used to run
 * AFTER payment on the first read of a report. It now runs during
 * preparation, BEFORE checkout — the same facts, assembled the same way,
 * just earlier. Nothing about what is fetched, what is sanitised, or what
 * is left absent has changed.
 *
 * One rule is new: the Soundcharts song record is required. It is the only
 * permitted input to the Christian context gate, so a report generated
 * without it would be sold with the gate silently closed. If Soundcharts
 * has no data for the song, the paid tier is unavailable for that song
 * (`song_unavailable`), and nobody is charged.
 */

type Db = ReturnType<typeof createAdminClient>;

export class EnrichmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnrichmentError";
  }
}

/**
 * Assemble the generator's inputs from the persisted analysis.
 *
 * Only real, pre-generation facts are read. Anything the engine did not
 * produce is left absent rather than filled in — `generatePaidSections`
 * refuses outright if a fact the report actually renders is missing.
 *
 * Returns the facts WITHOUT the Christian context lens, plus the raw
 * Soundcharts song object the gate reads. Keeping the gate a separate stage
 * is what lets preparation time it and log it on its own.
 */
export async function assembleAnalysisFacts(
  db: Db,
  userId: string,
  scanId: string,
  free: FreeReport,
): Promise<EnrichmentBundle> {
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
  if (!row) throw new EnrichmentError("no analysis on file");

  // Fetch the raw Soundcharts song ONCE. It carries the genre metadata (for
  // the Christian gate + genre roots), the audio-feature extras the
  // intelligence layer characterises against, and — indirectly, via the
  // song UUID it contains — the key for the enrichment endpoints. The song
  // record itself is required; every enrichment endpoint below it is
  // fail-open: any missing piece silently reduces the intelligence layer's
  // output.
  let genres: string[] | undefined;
  let instrumentalness: number | undefined;
  let audioExtras: AnalysisFacts["audioExtras"] | undefined;
  let lyricsAnalysis: AnalysisFacts["lyricsAnalysis"] | null = null;
  let soundchartsScore: AnalysisFacts["soundchartsScore"] | null = null;
  let playlistCurrent: AnalysisFacts["playlistCurrent"] | null = null;
  let chartsRanks: AnalysisFacts["chartsRanks"] | null = null;
  let broadcasts: AnalysisFacts["broadcasts"] | null = null;

  const isrc = free.track.isrc;
  if (!isrc) throw new EnrichmentError("song_unavailable");
  // soundchartsSongByIsrcSafe honours the in-process rawSongCache first,
  // so a same-invocation scan → prepare pays zero extra by-isrc traffic.
  // Cold-cache preparation pays one call.
  const song = await soundchartsSongByIsrcSafe(isrc);
  if (!song) throw new EnrichmentError("song_unavailable");

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
      // FIVE enrichment fetches, all fail-open at the client. Run in
      // parallel; a slow or dead one never blocks a fast one. Paths
      // verified against the production tier: lyrics-analysis on v2,
      // soundcharts/score on v2, playlist/current on v2.20, charts/ranks
      // on v2, broadcasts on v2. current/stats was 403 plan-gated on
      // our tier and is deliberately NOT called — useless network is
      // itself a defect worth removing.
      const [la, ss, pc, cr, br] = await Promise.all([
        client.getLyricsAnalysis(uuid),
        client.getSoundchartsScore(uuid),
        client.getPlaylistCurrentSpotify(uuid),
        client.getChartsRanksSpotify(uuid),
        client.getBroadcasts(uuid),
      ]);

      // ── lyrics-analysis ────────────────────────────────────────────
      // Response shape is `{ object: { lyricsAnalysis: {...}, related:
      // {...} } }` — safeGet already returned `object`, so we dig once
      // more into `.lyricsAnalysis` before reading the fields.
      if (la) {
        const inner =
          (la as { lyricsAnalysis?: Record<string, unknown> })
            .lyricsAnalysis ?? la;
        const pickString = (k: string): string | undefined => {
          const v = (inner as Record<string, unknown>)[k];
          return typeof v === "string" && v.trim().length > 0 ? v : undefined;
        };
        const pickStringArray = (k: string): string[] | undefined => {
          const v = (inner as Record<string, unknown>)[k];
          if (!Array.isArray(v)) return undefined;
          const clean = v.filter(
            (s): s is string => typeof s === "string" && s.trim().length > 0,
          );
          return clean.length > 0 ? clean : undefined;
        };
        const pickNum = (k: string): number | undefined => {
          const v = (inner as Record<string, unknown>)[k];
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
          culturalReferencePeople: pickStringArray("culturalReferencePeople"),
          culturalReferenceNonPeople: pickStringArray("culturalReferenceNonPeople"),
          brands: pickStringArray("brands"),
          locations: pickStringArray("locations"),
        };
      }

      // ── soundcharts-score ──────────────────────────────────────────
      // `{ items: [{ date, fanbaseScore, trendingScore }, ...] }`.
      // Pass through unchanged; extractor reads items.
      if (ss) {
        const items = Array.isArray((ss as { items?: unknown }).items)
          ? ((ss as { items: unknown[] }).items as Array<
              Record<string, unknown>
            >)
          : [];
        const cleaned = items
          .map((it) => ({
            date: typeof it.date === "string" ? it.date : undefined,
            fanbaseScore:
              typeof it.fanbaseScore === "number"
                ? it.fanbaseScore
                : undefined,
            trendingScore:
              typeof it.trendingScore === "number"
                ? it.trendingScore
                : undefined,
          }))
          .filter((it) => it.date || it.fanbaseScore || it.trendingScore);
        if (cleaned.length > 0) soundchartsScore = { items: cleaned };
      }

      // ── playlist/current/spotify ───────────────────────────────────
      // Sanitize to only the fields extractPlaylistFootprint reads —
      // discard imageUrls, identifiers, uuids, latestCrawlDate. Cap the
      // list at 100 items to keep the prompt bounded.
      if (pc) {
        const items = Array.isArray((pc as { items?: unknown }).items)
          ? ((pc as { items: unknown[] }).items as Array<
              Record<string, unknown>
            >)
          : [];
        const cleaned = items.slice(0, 100).map((it) => {
          const p = (it.playlist as Record<string, unknown> | undefined) ?? {};
          return {
            playlist: {
              name: typeof p.name === "string" ? p.name : undefined,
              type: typeof p.type === "string" ? p.type : undefined,
              countryCode:
                typeof p.countryCode === "string" ? p.countryCode : undefined,
              latestSubscriberCount:
                typeof p.latestSubscriberCount === "number"
                  ? p.latestSubscriberCount
                  : undefined,
              latestTrackCount:
                typeof p.latestTrackCount === "number"
                  ? p.latestTrackCount
                  : undefined,
            },
            position:
              typeof it.position === "number" ? it.position : undefined,
            peakPosition:
              typeof it.peakPosition === "number"
                ? it.peakPosition
                : undefined,
            entryDate:
              typeof it.entryDate === "string" ? it.entryDate : undefined,
          };
        });
        if (cleaned.length > 0) playlistCurrent = { items: cleaned };
      }

      // ── charts/ranks/spotify ───────────────────────────────────────
      if (cr) {
        const items = Array.isArray((cr as { items?: unknown }).items)
          ? ((cr as { items: unknown[] }).items as Array<
              Record<string, unknown>
            >)
          : [];
        const cleaned = items.slice(0, 50).map((it) => {
          const c = (it.chart as Record<string, unknown> | undefined) ?? {};
          return {
            chart: {
              name: typeof c.name === "string" ? c.name : undefined,
              countryCode:
                typeof c.countryCode === "string" ? c.countryCode : undefined,
              countryName:
                typeof c.countryName === "string" ? c.countryName : undefined,
              cityName:
                typeof c.cityName === "string" ? c.cityName : undefined,
              frequency:
                typeof c.frequency === "string" ? c.frequency : undefined,
            },
            position:
              typeof it.position === "number" ? it.position : undefined,
            peakPosition:
              typeof it.peakPosition === "number"
                ? it.peakPosition
                : undefined,
            positionEvolution:
              typeof it.positionEvolution === "number"
                ? it.positionEvolution
                : undefined,
            timeOnChart:
              typeof it.timeOnChart === "number"
                ? it.timeOnChart
                : undefined,
            timeOnChartUnit:
              typeof it.timeOnChartUnit === "string"
                ? it.timeOnChartUnit
                : undefined,
            current: typeof it.current === "boolean" ? it.current : undefined,
          };
        });
        if (cleaned.length > 0) chartsRanks = { items: cleaned };
      }

      // ── broadcasts ────────────────────────────────────────────────
      // High-volume songs return up to 100 items; the extractor only
      // needs radio metadata to aggregate, so drop everything else.
      if (br) {
        const items = Array.isArray((br as { items?: unknown }).items)
          ? ((br as { items: unknown[] }).items as Array<
              Record<string, unknown>
            >)
          : [];
        const cleaned = items.slice(0, 100).map((it) => {
          const r = (it.radio as Record<string, unknown> | undefined) ?? {};
          return {
            airedAt:
              typeof it.airedAt === "string" ? it.airedAt : undefined,
            radio: {
              name: typeof r.name === "string" ? r.name : undefined,
              countryCode:
                typeof r.countryCode === "string" ? r.countryCode : undefined,
              countryName:
                typeof r.countryName === "string" ? r.countryName : undefined,
              cityName:
                typeof r.cityName === "string" ? r.cityName : undefined,
            },
          };
        });
        if (cleaned.length > 0) broadcasts = { items: cleaned };
      }
    }
  }

  const facts: AnalysisFacts = {
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
    ...(soundchartsScore ? { soundchartsScore } : {}),
    ...(playlistCurrent ? { playlistCurrent } : {}),
    ...(chartsRanks ? { chartsRanks } : {}),
    ...(broadcasts ? { broadcasts } : {}),
  };

  return { facts, song };
}
