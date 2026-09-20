import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFixtureKey } from "@/lib/scan-id";
import { profileFromAnalysis } from "./profile.server";
import { normalizeTarget } from "./normalize.server";
import { matchSong, MATCHER_VERSION } from "./match.server";
import { configuredSources } from "./sources/feed.server";
import { registeredSources } from "./sources/registered.server";
import { isCompletePaidPayload } from "@/lib/reports/store";
import { qualityStatus, verifySubmissionRoute, type QualityEvidence } from "./quality.server";

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
  const sources = [...configuredSources(), ...await registeredSources(db)];
  const stopAt = Date.now() + 40_000;
  let ingested = 0;
  let failed = 0;
  for (const adapter of sources.slice(0, 10)) {
    if (Date.now() >= stopAt) break;
    try {
    const items = await adapter.fetch();
    const { data: source, error: sourceError } = await db.from("opportunity_sources")
      .upsert({ name: adapter.name, kind: adapter.kind, trust_level: adapter.trust,
        base_url: adapter.baseUrl, active: true }, { onConflict: "name" }).select("id").single();
    if (sourceError || !source) throw sourceError ?? new Error("source upsert failed");
    for (const item of items) {
      if (Date.now() >= stopAt) break;
      const { data: duplicate, error: duplicateError } = await db.from("opportunities")
        .select("id,external_ref").eq("source_id", source.id)
        .eq("content_hash", item.contentHash).limit(1);
      if (duplicateError) throw duplicateError;
      if (duplicate?.length && duplicate[0].external_ref !== item.externalRef) continue;
      const { error } = await db.from("opportunities").upsert({
        source_id: source.id, external_ref: item.externalRef, title: item.title,
        raw_text: item.rawText, status: item.status, submission_url: item.submissionUrl,
        deadline: item.deadline, target: item.target, normalizer_version: "explicit-v1",
        content_hash: item.contentHash, last_seen_at: new Date().toISOString(),
        provenance_url: item.provenanceUrl ?? null, budget_text: item.budgetText ?? null,
        use_text: item.useText ?? null, territory_text: item.territoryText ?? null,
        mood_context: item.moodContext ?? null, synthetic: false,
        route_verified_at: await verifySubmissionRoute(item.submissionUrl),
        applicant_count: item.applicantCount ?? null,
        competition_level: item.competitionLevel ?? null,
        eligibility_requirements: item.eligibilityRequirements ?? {},
      }, { onConflict: "source_id,external_ref" });
      if (error) throw error;
      ingested++;
    }
    const { error: healthyError } = await db.from("opportunity_sources").update({
      active: true, failure_count: 0, quarantine_reason: null,
      last_successful_ingest_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", source.id);
    if (healthyError) throw healthyError;
    } catch {
      failed++;
      // A broken feed cannot stop other sources or produce user-facing records.
      const { data: current } = await db.from("opportunity_sources")
        .select("failure_count").eq("name", adapter.name).limit(1);
      const { error } = await db.from("opportunity_sources")
        .update({ active: false, quarantine_reason: "ingest_failed",
          failure_count: Math.min(1000, Number(current?.[0]?.failure_count ?? 0) + 1),
          updated_at: new Date().toISOString() }).eq("name", adapter.name);
      if (error) console.error("[song-where] source quarantine failed");
    }
  }
  return { sources: sources.length, ingested, failed };
}

export async function healthOnce(db: Db = createAdminClient()): Promise<Record<string, number>> {
  const queries = [
    ["activeSources", db.from("opportunity_sources").select("id", { count: "exact", head: true }).eq("active", true)],
    ["opportunities", db.from("opportunities").select("id", { count: "exact", head: true }).eq("synthetic", false)],
    ["parseFailures", db.from("opportunity_inbox_messages").select("id", { count: "exact", head: true }).eq("status", "quarantined")],
    ["matches", db.from("song_opportunity_matches").select("id", { count: "exact", head: true })],
    ["routingClicks", db.from("submission_clicks").select("id", { count: "exact", head: true })],
    ["alertsSent", db.from("opportunity_alerts").select("id", { count: "exact", head: true }).eq("status", "sent")],
    ["sourceFailures", db.from("opportunity_sources").select("id", { count: "exact", head: true }).gt("failure_count", 0)],
  ] as const;
  const results = await Promise.all(queries.map(async ([name, query]) => {
    const { count, error } = await query;
    if (error) throw error;
    return [name, count ?? 0] as const;
  }));
  return Object.fromEntries(results);
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
    .select("id,target,status,deadline,submission_url,route_verified_at,provenance_url,applicant_count,competition_level,eligibility_requirements,opportunity_sources!inner(active,trust_level,terms_status,robots_status,auth_scope)")
    .eq("status", "open").eq("synthetic", false)
    .eq("opportunity_sources.active", true).limit(100);
  if (opportunityError) throw opportunityError;
  const now = new Date().toISOString();
  let matches = 0;
  for (const row of rows) {
    if (isFixtureKey(row.songs.track_key) || !isCompletePaidPayload(row.reports.payload)) continue;
    const profile = profileFromAnalysis(row);
    if (!profile) continue;
    for (const opportunity of (opportunities ?? []) as unknown as Array<{
      id: string; target: unknown;
      opportunity_sources: { trust_level: string };
    } & QualityEvidence>) {
      const gate = qualityStatus(opportunity, "worth_exploring", new Date(now));
      if (gate !== "LIVE_VERIFIED") continue;
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
