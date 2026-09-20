import "server-only";
import { publicHttpsUrl } from "./sources/public-url.server";
import type { FitBand } from "./dto";

export type QualityStatus = "LIVE_VERIFIED" | "LIVE_HIGH_COMPETITION" | "STALE" |
  "EXPIRED" | "NO_SUBMISSION_PATH" | "ELIGIBILITY_MISMATCH" | "SOURCE_UNCERTAIN";

export type QualityEvidence = {
  status: string; deadline: string | null; submission_url: string;
  route_verified_at: string | null; provenance_url: string | null;
  applicant_count: number | null; competition_level: string | null;
  eligibility_requirements: unknown;
  opportunity_sources: { active: boolean; trust_level: string; terms_status: string;
    robots_status: string; auth_scope: string } | null;
};

/** Unknown artist attributes cannot satisfy an explicit requirement. */
export function qualityStatus(opportunity: QualityEvidence, fit: FitBand | null,
  now = new Date()): QualityStatus {
  if (opportunity.status === "expired" || opportunity.deadline &&
      Date.parse(opportunity.deadline) <= now.getTime()) return "EXPIRED";
  if (opportunity.status !== "open" || !opportunity.deadline ||
      !Number.isFinite(Date.parse(opportunity.deadline))) return "STALE";
  const source = opportunity.opportunity_sources;
  if (!source?.active || !["verified", "curated"].includes(source.trust_level) ||
      !["cc0", "permitted", "public_pointer"].includes(source.terms_status) ||
      source.robots_status !== "allow" || source.auth_scope !== "none" ||
      !opportunity.provenance_url || !publicHttpsUrl(opportunity.provenance_url)) return "SOURCE_UNCERTAIN";
  if (!publicHttpsUrl(opportunity.submission_url) || !opportunity.route_verified_at ||
      !Number.isFinite(Date.parse(opportunity.route_verified_at)) ||
      now.getTime() - Date.parse(opportunity.route_verified_at) > 24 * 60 * 60 * 1000) return "NO_SUBMISSION_PATH";
  const requirements = opportunity.eligibility_requirements;
  if (!requirements || typeof requirements !== "object" || Array.isArray(requirements) ||
      Object.keys(requirements).length > 0) return "ELIGIBILITY_MISMATCH";
  if (!fit) return "ELIGIBILITY_MISMATCH";
  if (opportunity.competition_level === "high" ||
      opportunity.applicant_count !== null && opportunity.applicant_count >= 100) return "LIVE_HIGH_COMPETITION";
  return "LIVE_VERIFIED";
}

/** HEAD is deliberately fail-closed: redirects and unknown response codes are not proof. */
export async function verifySubmissionRoute(raw: string): Promise<string | null> {
  const url = publicHttpsUrl(raw);
  if (!url) return null;
  try {
    const response = await fetch(url, { method: "HEAD", redirect: "error", cache: "no-store",
      signal: AbortSignal.timeout(3000) });
    return response.ok ? new Date().toISOString() : null;
  } catch { return null; }
}
