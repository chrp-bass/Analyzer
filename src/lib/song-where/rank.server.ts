import "server-only";
import type { FitBand, Trust } from "./dto";

const fitRank: Record<FitBand, number> = { strong: 3, moderate: 2, worth_exploring: 1 };
const trustRank: Record<Trust, number> = { verified: 3, curated: 2, scraped: 1 };

export function rankMatches<T extends { fit: FitBand; trust: Trust; score: number; deadline: string | null }>(
  matches: T[],
): T[] {
  return [...matches].sort((a, b) =>
    fitRank[b.fit] - fitRank[a.fit] ||
    trustRank[b.trust] - trustRank[a.trust] ||
    b.score - a.score ||
    (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"),
  );
}
