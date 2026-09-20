import "server-only";
import { normalizeTarget, type OpportunityTarget } from "./normalize.server";

export type SpecificityTier = "A" | "B" | "C";
export type SongCriteria = Partial<Record<"mood" | "energy" | "genre" | "style" |
  "vocal" | "tempo" | "reference" | "usage" | "audience", string>>;

const meaningful = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 2 &&
  !/^(?:all|any|various|open to all|no preference|not specified|unknown)(?:\s+(?:genres?|styles?|music))?\.?$/i.test(value.trim());

/** Only an explicit request or structured field counts; generic eligibility never does. */
export function classifySpecificity(input: {
  target?: OpportunityTarget | null; criteria?: SongCriteria; requestText?: string | null;
}): SpecificityTier {
  const signals = new Set<string>();
  const target = normalizeTarget(input.target);
  if (target?.modes?.length) signals.add("mode");
  if (target?.dimensions) for (const key of Object.keys(target.dimensions)) signals.add(key);
  if (target?.valence) signals.add("valence");
  if (target?.arousal) signals.add("arousal");
  for (const [key, value] of Object.entries(input.criteria ?? {})) {
    if (meaningful(value) && (key !== "usage" ||
        !/^(?:film|tv|television|advertising|games?|sync|media)(?:\s*[,/]\s*(?:film|tv|television|advertising|games?|sync|media))*$/i.test(value.trim()))) {
      signals.add(key);
    }
  }
  const request = input.requestText?.slice(0, 1200) ?? "";
  if (/\b(?:high[- ]energy|low[- ]energy|upbeat|downtempo)\b/i.test(request)) signals.add("energy");
  if (/\b(?:uplifting|melancholic|tense|dreamy|hopeful|somber|playful)\b/i.test(request)) signals.add("mood");
  if (/\b(?:pop|rock|jazz|hip[- ]hop|folk|electronic|ambient|classical|country|disco)\b/i.test(request)) signals.add("genre");
  if (/\b(?:instrumental only|vocals? only|female vocals?|male vocals?)\b/i.test(request)) signals.add("vocal");
  if (/\b(?:\d{2,3}\s*bpm|fast tempo|slow tempo)\b/i.test(request)) signals.add("tempo");
  if (/\b(?:sports? (?:ad|commercial)|period drama|nightlife scene|children.s animation)\b/i.test(request)) signals.add("usage");
  return signals.size >= 2 ? "A" : signals.size === 1 ? "B" : "C";
}

/** Tier A is necessary but not sufficient: CHRP still needs an approved target. */
export function songMatchable(tier: SpecificityTier, target: unknown): boolean {
  const parsed = normalizeTarget(target);
  return tier === "A" && !!parsed && !!(parsed.modes?.length || parsed.dimensions ||
    parsed.valence || parsed.arousal);
}
