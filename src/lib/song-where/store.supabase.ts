import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCompletePaidPayload } from "@/lib/reports/store";
import { rankMatches } from "./rank.server";
import type { FitBand, SongWhereMatch, Trust } from "./dto";

type Db = ReturnType<typeof createAdminClient>;

type Analysis = {
  id: string;
  creator_id: string;
  scan_id: string;
  status: string;
  epi_score: number | null;
  mode: string | null;
  scores: unknown;
  circumplex: unknown;
  song_id: string;
};

export async function completedAnalysisForScan(db: Db, creatorId: string, scanId: string): Promise<Analysis | null> {
  const { data, error } = await db.from("analyses")
    .select("id,creator_id,scan_id,status,epi_score,mode,scores,circumplex,song_id")
    .eq("creator_id", creatorId).eq("scan_id", scanId).eq("status", "complete").limit(1);
  if (error) throw error;
  const analysis = (data as Analysis[] | null)?.[0];
  if (!analysis) return null;
  const { data: reports, error: reportError } = await db.from("reports")
    .select("payload").eq("analysis_id", analysis.id).eq("creator_id", creatorId).limit(1);
  if (reportError) throw reportError;
  if (!reports?.[0] || !isCompletePaidPayload(reports[0].payload)) return null;
  return analysis;
}

type MatchRow = {
  id: string;
  match_score: number;
  fit_band: FitBand;
  opportunities: {
    title: string;
    deadline: string | null;
    status: string;
    submission_url: string;
    opportunity_sources: { name: string; trust_level: Trust; active: boolean } | null;
  } | null;
};

export async function matchesForAnalysis(db: Db, analysisId: string): Promise<SongWhereMatch[]> {
  const { data, error } = await db.from("song_opportunity_matches")
    .select("id,match_score,fit_band,opportunities!inner(title,deadline,status,submission_url,opportunity_sources!inner(name,trust_level,active))")
    .eq("analysis_id", analysisId).eq("opportunities.status", "open")
    .eq("opportunities.opportunity_sources.active", true).limit(100);
  if (error) throw error;
  const now = new Date().toISOString();
  const ranked = (data as unknown as MatchRow[] | null ?? []).flatMap((row) => {
    const opportunity = row.opportunities;
    const source = opportunity?.opportunity_sources;
    if (!opportunity || !source || !opportunity.submission_url ||
        (opportunity.deadline && opportunity.deadline < now)) return [];
    return [{
      matchId: row.id,
      title: opportunity.title,
      sourceName: source.name,
      trust: source.trust_level,
      fit: row.fit_band,
      deadline: opportunity.deadline,
      goHref: `/api/song-where/go/${encodeURIComponent(row.id)}`,
      score: Number(row.match_score),
    }];
  });
  return rankMatches(ranked).slice(0, 20).map((item) => ({
    matchId: item.matchId, title: item.title, sourceName: item.sourceName,
    trust: item.trust, fit: item.fit, deadline: item.deadline, goHref: item.goHref,
  }));
}

export async function matchForRedirect(db: Db, matchId: string): Promise<{
  analysisId: string; creatorId: string; scanId: string; url: string;
} | null> {
  const { data, error } = await db.from("song_opportunity_matches")
    .select("id,analysis_id,analyses!inner(creator_id,scan_id),opportunities!inner(status,deadline,submission_url,opportunity_sources!inner(active))")
    .eq("id", matchId).limit(1);
  if (error) throw error;
  const row = (data as unknown as Array<{
    analysis_id: string;
    analyses: { creator_id: string; scan_id: string };
    opportunities: { status: string; deadline: string | null; submission_url: string; opportunity_sources: { active: boolean } };
  }> | null)?.[0];
  if (!row || row.opportunities.status !== "open" || !row.opportunities.opportunity_sources.active ||
      (row.opportunities.deadline && row.opportunities.deadline < new Date().toISOString())) return null;
  return { analysisId: row.analysis_id, creatorId: row.analyses.creator_id,
    scanId: row.analyses.scan_id, url: row.opportunities.submission_url };
}

export function safeSubmissionUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if ((url.protocol !== "https:" && url.protocol !== "http:") ||
        url.username || url.password || !url.hostname ||
        ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return null;
    return url;
  } catch { return null; }
}
