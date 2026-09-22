import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCompletePaidPayload } from "@/lib/reports/store";
import { rankMatches } from "./rank.server";
import type { FitBand, SongWhereMatch, Trust } from "./dto";
import { publicHttpsUrl } from "./sources/public-url.server";
import { qualityStatus, type QualityEvidence } from "./quality.server";

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
  opportunities: QualityEvidence & {
    title: string;
    submission_requirement: "free" | "paid" | "membership" | "credits" | "unknown";
    submission_cost: string | null;
    opportunity_sources: (NonNullable<QualityEvidence["opportunity_sources"]> & { name: string; trust_level: Trust }) | null;
  } | null;
};

export async function matchesForAnalysis(db: Db, analysisId: string): Promise<SongWhereMatch[]> {
  const { data, error } = await db.from("song_opportunity_matches")
    .select("id,match_score,fit_band,opportunities!inner(title,deadline,status,access_class,submission_requirement,submission_cost,submission_url,route_verified_at,provenance_url,applicant_count,competition_level,eligibility_requirements,specificity_tier,song_matchable,opportunity_sources!inner(name,trust_level,active,terms_status,robots_status,auth_scope))")
    .eq("analysis_id", analysisId).eq("opportunities.status", "open")
    .neq("opportunities.access_class", "PRIVATE_TO_CREATOR")
    .eq("opportunities.synthetic", false)
    .eq("opportunities.opportunity_sources.active", true).limit(100);
  if (error) throw error;
  const now = new Date().toISOString();
  const ranked = (data as unknown as MatchRow[] | null ?? []).flatMap((row) => {
    const opportunity = row.opportunities;
    const source = opportunity?.opportunity_sources;
    if (!opportunity || !source || qualityStatus(opportunity, row.fit_band, new Date(now)) !== "LIVE_VERIFIED") return [];
    return [{
      matchId: row.id,
      title: opportunity.title,
      sourceName: source.name,
      trust: source.trust_level,
      fit: row.fit_band,
      deadline: opportunity.deadline,
      goHref: `/api/song-where/go/${encodeURIComponent(row.id)}`,
      score: Number(row.match_score),
      applicantCount: opportunity.applicant_count,
      competitionLevel: opportunity.competition_level,
      routeVerifiedAt: opportunity.route_verified_at,
      submissionRequirement: opportunity.submission_requirement,
      submissionCost: opportunity.submission_cost,
    }];
  });
  return rankMatches(ranked).slice(0, 20).map((item) => ({
    matchId: item.matchId, title: item.title, sourceName: item.sourceName,
    trust: item.trust, fit: item.fit, deadline: item.deadline, goHref: item.goHref,
    submissionRequirement: item.submissionRequirement, submissionCost: item.submissionCost,
  }));
}

export async function matchForRedirect(db: Db, matchId: string): Promise<{
  analysisId: string; creatorId: string; scanId: string; url: string; accessClass: string;
} | null> {
  const { data, error } = await db.from("song_opportunity_matches")
    .select("id,analysis_id,fit_band,analyses!inner(creator_id,scan_id),opportunities!inner(status,deadline,access_class,owner_creator_id,submission_url,route_verified_at,provenance_url,applicant_count,competition_level,eligibility_requirements,specificity_tier,song_matchable,opportunity_sources!inner(active,trust_level,terms_status,robots_status,auth_scope))")
    .eq("id", matchId).eq("opportunities.synthetic", false).limit(1);
  if (error) throw error;
  const row = (data as unknown as Array<{
    analysis_id: string;
    fit_band: FitBand;
    analyses: { creator_id: string; scan_id: string };
    opportunities: QualityEvidence & { access_class: string; owner_creator_id: string | null };
  }> | null)?.[0];
  if (!row) return null;
  // Redirect uses a wider route-verification window (72 h) than display (24 h)
  // so links shown on the dashboard stay clickable while the opportunity is live.
  const REDIRECT_ROUTE_TTL_MS = 72 * 60 * 60 * 1000;
  if (row.opportunities.access_class === "PRIVATE_TO_CREATOR") {
    const brief = row.opportunities;
    if (brief.owner_creator_id !== row.analyses.creator_id || brief.status !== "open" ||
        brief.specificity_tier !== "A" || !brief.song_matchable ||
        !brief.deadline || Date.parse(brief.deadline) <= Date.now() ||
        !brief.route_verified_at || Date.now() - Date.parse(brief.route_verified_at) > REDIRECT_ROUTE_TTL_MS ||
        !publicHttpsUrl(brief.submission_url)) return null;
  } else if (qualityStatus(row.opportunities, row.fit_band, new Date(), REDIRECT_ROUTE_TTL_MS) !== "LIVE_VERIFIED") return null;
  // Creator-forwarded briefs: link to the listing page (provenance) rather than
  // the submission gate (which may be a generic login/registration page).
  const url = row.opportunities.access_class === "PRIVATE_TO_CREATOR" && row.opportunities.provenance_url
    ? row.opportunities.provenance_url : row.opportunities.submission_url;
  return { analysisId: row.analysis_id, creatorId: row.analyses.creator_id,
    scanId: row.analyses.scan_id, url, accessClass: row.opportunities.access_class };
}

export function safeSubmissionUrl(raw: string): URL | null {
  return publicHttpsUrl(raw);
}
