import "server-only";
import type { FitBand } from "./dto";
import type { SongProfile } from "./profile.server";
import type { OpportunityTarget, Range } from "./normalize.server";

export const MATCHER_VERSION = "song-where-v1";

function rangeFit(value: number, { min, max }: Range, scale: number): number {
  if (value >= min && value <= max) return 1;
  const distance = value < min ? min - value : value - max;
  return Math.max(0, 1 - distance / scale);
}

export function matchSong(profile: SongProfile, target: OpportunityTarget):
  { score: number; band: FitBand } | null {
  if (target.epiFloor !== undefined && profile.epi < target.epiFloor) return null;
  let weighted = 0;
  let total = 0;
  let signals = 0;
  if (target.modes?.length) {
    weighted += (target.modes.includes(profile.mode) ? 1 : 0) * 3;
    total += 3;
    signals++;
  }
  for (const dimension of ["focus", "calm", "motivation", "balance"] as const) {
    const value = target.dimensions?.[dimension];
    if (!value) continue;
    weighted += rangeFit(profile.scores[dimension], value, 40) * 2;
    total += 2;
    signals++;
  }
  if (target.valence) { weighted += rangeFit(profile.valence, target.valence, 0.5); total++; signals++; }
  if (target.arousal) { weighted += rangeFit(profile.arousal, target.arousal, 0.5); total++; signals++; }
  if (!total) return null;
  const score = Math.round((weighted / total) * 1000) / 10;
  if (score < 50) return null;
  return { score, band: score >= 80 && signals >= 2 ? "strong" : score >= 65 ? "moderate" : "worth_exploring" };
}
