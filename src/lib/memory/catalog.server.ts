import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PaidSections } from "@/lib/fixtures/tracks";

/**
 * Song memory.
 *
 * Everything CHRP has already learned about a creator's songs lives here, so
 * a returning creator is never asked for it again. After a magic link on a
 * brand-new browser, this module is what makes their catalog, their scores
 * and their reports reappear — the browser contributes nothing but a session
 * cookie.
 *
 * Every read is filtered by `creator_id` taken from a cookie-verified
 * session. Nothing accepts a creator id from the caller.
 */

type Db = ReturnType<typeof createAdminClient>;

export type SongSource = "spotify" | "soundcharts" | "direct_upload";

export interface CatalogEntry {
  scanId: string;
  trackKey: string;
  title: string;
  artistName: string | null;
  isrc: string | null;
  source: SongSource;
  epiScore: number | null;
  mode: string | null;
  verdict: string | null;
  scores: unknown;
  circumplex: unknown;
  engineVersion: string;
  analyzedAt: string | null;
  status: "pending" | "complete" | "failed";
}

export interface RecordAnalysisInput {
  userId: string;
  scanId: string;
  /** Stable per-creator song identity. Credits are counted on this. */
  trackKey: string;
  title: string;
  artistName?: string | null;
  isrc?: string | null;
  source: SongSource;
  engineVersion: string;
  epiScore?: number | null;
  mode?: string | null;
  verdict?: string | null;
  scores?: unknown;
  circumplex?: unknown;
}

/**
 * The creators row normally arrives via the auth trigger in 0002. This is
 * the belt-and-braces path for an environment where the trigger has not been
 * installed yet, so a scan is never lost to a missing parent row.
 */
export async function ensureCreator(
  db: Db,
  userId: string,
  email?: string | null,
): Promise<void> {
  await db
    .from("creators")
    .upsert({ id: userId, ...(email ? { email } : {}) }, { onConflict: "id" });
}

/**
 * Persist (or find) the song, its version, and a COMPLETED analysis record.
 *
 * Idempotent on (creator_id, scan_id): re-running the same scan updates the
 * existing analysis rather than creating a second one, which is what keeps a
 * refresh from ever looking like new work to the credit ledger.
 */
export async function recordCompletedAnalysis(
  db: Db,
  input: RecordAnalysisInput,
): Promise<{ analysisId: string; songId: string }> {
  await ensureCreator(db, input.userId);

  // Song — one row per (creator, track_key).
  const { data: song, error: songError } = await db
    .from("songs")
    .upsert(
      {
        creator_id: input.userId,
        track_key: input.trackKey,
        title: input.title,
        artist_name: input.artistName ?? null,
        isrc: input.isrc ?? null,
        source: input.source,
      },
      { onConflict: "creator_id,track_key" },
    )
    .select("id")
    .single();
  if (songError) throw songError;
  const songId = song.id as string;

  // Version — the released master unless an upload says otherwise. Looked up
  // before insert so repeat analyses reuse it.
  const { data: existingVersion } = await db
    .from("song_versions")
    .select("id")
    .eq("song_id", songId)
    .eq("label", "original")
    .limit(1);

  let versionId = existingVersion?.[0]?.id as string | undefined;
  if (!versionId) {
    const { data: created, error: versionError } = await db
      .from("song_versions")
      .insert({ song_id: songId, label: "original", source: input.source })
      .select("id")
      .single();
    if (versionError) throw versionError;
    versionId = created.id as string;
  }

  if (input.isrc) {
    await db
      .from("song_external_ids")
      .upsert(
        { song_id: songId, provider: "isrc", external_id: input.isrc },
        { onConflict: "song_id,provider,external_id" },
      );
  }

  const { data: analysis, error: analysisError } = await db
    .from("analyses")
    .upsert(
      {
        creator_id: input.userId,
        song_id: songId,
        song_version_id: versionId,
        scan_id: input.scanId,
        status: "complete",
        epi_score: input.epiScore ?? null,
        mode: input.mode ?? null,
        verdict: input.verdict ?? null,
        scores: input.scores ?? null,
        circumplex: input.circumplex ?? null,
        engine_version: input.engineVersion,
        source: input.source,
        analyzed_at: new Date().toISOString(),
      },
      { onConflict: "creator_id,scan_id" },
    )
    .select("id")
    .single();
  if (analysisError) throw analysisError;

  return { analysisId: analysis.id as string, songId };
}

/**
 * A creator's catalog, newest first. This is the server truth the dashboard
 * renders — not a browser cache.
 */
export async function getCatalog(
  db: Db,
  userId: string,
): Promise<CatalogEntry[]> {
  const { data, error } = await db
    .from("analyses")
    .select(
      "scan_id,status,epi_score,mode,verdict,scores,circumplex,engine_version,analyzed_at,source,songs!inner(track_key,title,artist_name,isrc)",
    )
    .eq("creator_id", userId)
    .order("analyzed_at", { ascending: false, nullsFirst: false });

  if (error) throw error;

  type Row = {
    scan_id: string;
    status: CatalogEntry["status"];
    epi_score: number | null;
    mode: string | null;
    verdict: string | null;
    scores: unknown;
    circumplex: unknown;
    engine_version: string;
    analyzed_at: string | null;
    source: SongSource;
    songs: {
      track_key: string;
      title: string;
      artist_name: string | null;
      isrc: string | null;
    } | null;
  };

  return ((data as unknown as Row[] | null) ?? [])
    .filter((r) => r.songs)
    .map((r) => ({
      scanId: r.scan_id,
      trackKey: r.songs!.track_key,
      title: r.songs!.title,
      artistName: r.songs!.artist_name,
      isrc: r.songs!.isrc,
      source: r.source,
      epiScore: r.epi_score,
      mode: r.mode,
      verdict: r.verdict,
      scores: r.scores,
      circumplex: r.circumplex,
      engineVersion: r.engine_version,
      analyzedAt: r.analyzed_at,
      status: r.status,
    }));
}

/** The persisted paid report for a scan, or null if none has been generated. */
export async function getPersistedReport(
  db: Db,
  userId: string,
  scanId: string,
): Promise<PaidSections | null> {
  const { data } = await db
    .from("reports")
    .select("payload")
    .eq("creator_id", userId)
    .eq("scan_id", scanId)
    .limit(1);
  const row = data?.[0] as { payload: PaidSections } | undefined;
  return row?.payload ?? null;
}

/**
 * Store a generated report so an authorized re-read never re-invokes the
 * model. Unique on (creator_id, scan_id), so two concurrent generations
 * settle on one stored payload instead of racing.
 */
export async function persistReport(
  db: Db,
  input: {
    userId: string;
    scanId: string;
    analysisId: string;
    payload: PaidSections;
    generatorVersion: string;
    model: string;
  },
): Promise<void> {
  const { error } = await db.from("reports").upsert(
    {
      creator_id: input.userId,
      scan_id: input.scanId,
      analysis_id: input.analysisId,
      payload: input.payload,
      generator_version: input.generatorVersion,
      model: input.model,
    },
    { onConflict: "creator_id,scan_id" },
  );
  if (error) throw error;
}

/** The analysis row backing a scan, if one exists for this creator. */
export async function findAnalysis(
  db: Db,
  userId: string,
  scanId: string,
): Promise<{ id: string; status: string } | null> {
  const { data } = await db
    .from("analyses")
    .select("id,status")
    .eq("creator_id", userId)
    .eq("scan_id", scanId)
    .limit(1);
  return (data?.[0] as { id: string; status: string } | undefined) ?? null;
}
