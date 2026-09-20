import "server-only";
import type { FitBand, Trust } from "./dto";

const fitRank: Record<FitBand, number> = { strong: 3, moderate: 2, worth_exploring: 1 };
const trustRank: Record<Trust, number> = { verified: 3, curated: 2, scraped: 1 };

export function rankMatches<T extends { fit: FitBand; trust: Trust; score: number; deadline: string | null;
  applicantCount?: number | null; competitionLevel?: string | null; routeVerifiedAt?: string | null }>(
  matches: T[], now = new Date(),
): T[] {
  const priority = (match: T): number => {
    const hours = match.deadline ? Math.max(0, (Date.parse(match.deadline) - now.getTime()) / 3_600_000) : 0;
    const freshness = 0.75 + 0.25 * Math.min(1, hours / 168);
    const routeAge = match.routeVerifiedAt ? Math.max(0, now.getTime() - Date.parse(match.routeVerifiedAt)) : 0;
    const actionability = 1 - Math.min(0.1, routeAge / 864_000_000);
    const saturation = match.competitionLevel === "medium" ? 0.85 :
      match.applicantCount == null ? 1 : Math.max(0.7, 1 - match.applicantCount / 400);
    return match.score * freshness * actionability * saturation * (0.8 + trustRank[match.trust] / 15);
  };
  return [...matches].sort((a, b) =>
    fitRank[b.fit] - fitRank[a.fit] ||
    priority(b) - priority(a) ||
    (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"),
  );
}
