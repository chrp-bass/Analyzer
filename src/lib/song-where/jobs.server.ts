import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFixtureKey } from "@/lib/scan-id";
import { profileFromAnalysis } from "./profile.server";
import { normalizeTarget } from "./normalize.server";
import { matchSong, MATCHER_VERSION } from "./match.server";
import { configuredSources } from "./sources/feed.server";
import { isCompletePaidPayload } from "@/lib/reports/store";

type Db = ReturnType<typeof createAdminClient>;
type Stage = "ingest" | "match" | "alert";

async function cursorFor(db: Db, stage: Stage): Promise<string | null> {
  const { data, error } = await db.from("song_where_job_state").select("cursor").eq("stage", stage).limit(1);
  if (error) throw error;
  return data?.[0]?.cursor ?? null;
}

async function saveCursor(db: Db, stage: Stage, cursor: string | null): Promise<void> {
  const { error } = await db.from("song_where_job_state")
    .upsert({ stage, cursor, updated_at: new Date().toISOString() }, { onConflict: "stage" });
  if (error) throw error;
}

export async function ingestOnce(db: Db = createAdminClient()): Promise<{ sources: number; ingested: number; failed: number }> {
  const sources = configuredSources();
  let ingested = 0;
  let failed = 0;
  for (const adapter of sources.slice(0, 10)) {
    try {
    const items = await adapter.fetch();
    const { data: source, error: sourceError } = await db.from("opportunity_sources")
      .upsert({ name: adapter.name, kind: adapter.kind, trust_level: adapter.trust,
        base_url: adapter.baseUrl, active: true }, { onConflict: "name" }).select("id").single();
    if (sourceError || !source) throw sourceError ?? new Error("source upsert failed");
    for (const item of items) {
      const { error } = await db.from("opportunities").upsert({
        source_id: source.id, external_ref: item.externalRef, title: item.title,
        raw_text: item.rawText, status: item.status, submission_url: item.submissionUrl,
        deadline: item.deadline, target: item.target, normalizer_version: "explicit-v1",
        content_hash: item.contentHash, last_seen_at: new Date().toISOString(),
      }, { onConflict: "source_id,external_ref" });
      if (error) throw error;
      ingested++;
    }
    } catch {
      failed++;
      // A broken feed cannot stop other sources or produce user-facing records.
      const { error } = await db.from("opportunity_sources")
        .update({ active: false }).eq("name", adapter.name);
      if (error) console.error("[song-where] source quarantine failed");
    }
  }
  return { sources: sources.length, ingested, failed };
}

export async function expireOnce(db: Db = createAdminClient()): Promise<{ expired: number }> {
  const now = new Date().toISOString();
  const { data: due, error: listError } = await db.from("opportunities")
    .select("id").eq("status", "open").lt("deadline", now).limit(100);
  if (listError) throw listError;
  if (!due?.length) return { expired: 0 };
  const { data, error } = await db.from("opportunities")
    .update({ status: "expired" }).eq("status", "open")
    .in("id", due.map((row) => row.id)).select("id");
  if (error) throw error;
  return { expired: data?.length ?? 0 };
}

export async function matchBatch(db: Db = createAdminClient()): Promise<{ analyzed: number; matches: number; more: boolean }> {
  const cursor = await cursorFor(db, "match");
  let query = db.from("analyses")
    .select("id,status,epi_score,mode,scores,circumplex,songs!inner(track_key),reports!inner(payload)")
    .eq("status", "complete").order("id", { ascending: true }).limit(25);
  if (cursor) query = query.gt("id", cursor);
  const { data: analyses, error } = await query;
  if (error) throw error;
  const rows = (analyses ?? []) as unknown as Array<{
    id: string; status: string; epi_score: number; mode: string; scores: unknown;
    circumplex: unknown; songs: { track_key: string }; reports: { payload: unknown };
  }>;
  const { data: opportunities, error: opportunityError } = await db.from("opportunities")
    .select("id,target,deadline,opportunity_sources!inner(active,trust_level)")
    .eq("status", "open").eq("opportunity_sources.active", true).limit(100);
  if (opportunityError) throw opportunityError;
  const now = new Date().toISOString();
  let matches = 0;
  for (const row of rows) {
    if (isFixtureKey(row.songs.track_key) || !isCompletePaidPayload(row.reports.payload)) continue;
    const profile = profileFromAnalysis(row);
    if (!profile) continue;
    for (const opportunity of (opportunities ?? []) as unknown as Array<{
      id: string; target: unknown; deadline: string | null;
      opportunity_sources: { trust_level: string };
    }>) {
      if (opportunity.deadline && opportunity.deadline < now) continue;
      const target = normalizeTarget(opportunity.target);
      if (!target) continue;
      const result = matchSong(profile, target);
      if (!result) {
        const { data: removed, error: deleteError } = await db.from("song_opportunity_matches")
          .delete().eq("analysis_id", row.id).eq("opportunity_id", opportunity.id).select("id");
        if (deleteError) throw deleteError;
        if (removed?.length) {
          const { error: historyError } = await db.from("song_opportunity_match_history").insert({
            analysis_id: row.id, opportunity_id: opportunity.id, match_score: null,
            fit_band: null, matcher_version: MATCHER_VERSION, event: "dropped",
          });
          if (historyError) throw historyError;
        }
        continue;
      }
      const trustRank = opportunity.opportunity_sources.trust_level === "verified" ? 3
        : opportunity.opportunity_sources.trust_level === "curated" ? 2 : 1;
      const { data: existing, error: findError } = await db.from("song_opportunity_matches")
        .select("id,match_score,fit_band").eq("analysis_id", row.id)
        .eq("opportunity_id", opportunity.id).limit(1);
      if (findError) throw findError;
      const old = existing?.[0];
      if (!old || Number(old.match_score) !== result.score || old.fit_band !== result.band) {
        const { error: upsertError } = await db.from("song_opportunity_matches").upsert({
          analysis_id: row.id, opportunity_id: opportunity.id, match_score: result.score,
          fit_band: result.band, trust_rank: trustRank, matcher_version: MATCHER_VERSION,
          matched_at: now,
        }, { onConflict: "analysis_id,opportunity_id" });
        if (upsertError) throw upsertError;
        const { error: historyError } = await db.from("song_opportunity_match_history").insert({
          analysis_id: row.id, opportunity_id: opportunity.id, match_score: result.score,
          fit_band: result.band, matcher_version: MATCHER_VERSION,
          event: old ? "rescored" : "created",
        });
        if (historyError) throw historyError;
      }
      matches++;
    }
  }
  await saveCursor(db, "match", rows.length === 25 ? rows[rows.length - 1].id : null);
  return { analyzed: rows.length, matches, more: rows.length === 25 };
}
