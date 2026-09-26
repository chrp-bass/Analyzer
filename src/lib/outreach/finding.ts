/**
 * The finding: one sentence, verbatim, from the persisted Rhodes report.
 *
 * Founder outreach quotes the Analyzer — it never paraphrases it and never
 * writes a line of its own. So the only source of a finding is the stored
 * report payload, and every candidate returned here is checked, character
 * for character, against the field it was cut from. Titles and artist names
 * are data: nothing in this module builds a prompt, and nothing reaches a
 * model.
 *
 * Which sentence: the most specific one about THIS song. A sentence that
 * names the song's mode or describes a measured contrast beats one that
 * explains what CHRP measures. Anything with a number, a percentage, a
 * commercial or placement claim, or a comparison to another artist is out —
 * those are the claims a DM must not make.
 *
 * Pure module. No I/O.
 */

export interface FindingCandidate {
  text: string;
  /** JSON path into the report payload, e.g. `$.rhodes`. */
  source: string;
}

export interface FindingSelection {
  finding: FindingCandidate | null;
  /** Up to three alternatives that also qualify, best first. */
  candidates: FindingCandidate[];
}

/**
 * Fields a finding may be cut from. Placements, buyers and pitch language
 * are commercial by construction, so they are never quoted in a first DM.
 */
const QUOTABLE_FIELDS = ["signature", "rhodes", "audience", "consider", "throughline"] as const;

/** Words that turn a sentence into a claim the DM must not make. */
const BANNED_TERMS =
  /\b(placements?|sync|sync-ready|hits?|viral|commercial(?:ly)?|guaranteed?|markets?|briefs?|supervisors?|campaigns?|pitch(?:es|ed)?|charts?|playlists?|streams?|streaming|radio|licens\w*|revenue|comparable|reminiscent|similar to|in the vein|sounds like)\b/i;

/** Sentences about the method rather than the song. Penalised, not banned. */
const METHOD_TERMS = /\b(CHRP|EPI|scale|metric|measured?|scores?|scoring)\b/;

const MODE_TERMS = /\b(Flow|Ready|Recharge|Recover)\b/;
const CONTRAST_TERMS = /\b(while|but|rather than|instead|without|than|not|never|yet|gap|against|over)\b/i;
const DIMENSION_TERMS = /\b(focus|calm|motivation|balance|settled\w*|drive|stillness|activation|steadiness)\b/i;

const MIN_LENGTH = 40;
const MAX_LENGTH = 240;

const ABBREVIATION = /\b(?:Dr|Mr|Mrs|Ms|St|Jr|Sr|vs|etc|No)\.$/;

/**
 * Split prose into sentences. Conservative: a terminator followed by a
 * capital, and never after a title-style abbreviation ("Dr.").
 */
export function splitSentences(text: string): string[] {
  const pieces = text.split(/(?<=[.!?…])\s+(?=["“(]?[A-Z])/);
  const out: string[] = [];
  for (const raw of pieces) {
    const piece = raw.trim();
    if (!piece) continue;
    const last = out[out.length - 1];
    if (last && ABBREVIATION.test(last)) out[out.length - 1] = `${last} ${piece}`;
    else out.push(piece);
  }
  return out;
}

/** True when the sentence may be quoted in a DM at all. */
export function isQuotable(sentence: string): boolean {
  if (sentence.length < MIN_LENGTH || sentence.length > MAX_LENGTH) return false;
  if (/[\d%$]/.test(sentence)) return false;
  if (BANNED_TERMS.test(sentence)) return false;
  // A fragment, not a sentence.
  if (!/[.!?…]["”)]?$/.test(sentence)) return false;
  return true;
}

function scoreSentence(sentence: string, source: string): number {
  let score = 0;
  if (MODE_TERMS.test(sentence) && /\bmode\b/i.test(sentence)) score += 3;
  if (CONTRAST_TERMS.test(sentence)) score += 2;
  if (DIMENSION_TERMS.test(sentence)) score += 1;
  if (source === "$.signature") score += 2;
  if (METHOD_TERMS.test(sentence)) score -= 2;
  if (sentence.length > 180) score -= 1;
  return score;
}

/**
 * Choose the finding and its alternatives from a stored report payload.
 * Every returned sentence appears verbatim in the field its `source` names.
 */
export function selectFinding(payload: unknown): FindingSelection {
  if (!payload || typeof payload !== "object") return { finding: null, candidates: [] };
  const p = payload as Record<string, unknown>;

  const ranked: Array<FindingCandidate & { score: number; order: number }> = [];
  let order = 0;
  for (const field of QUOTABLE_FIELDS) {
    const text = p[field];
    if (typeof text !== "string" || !text.trim()) continue;
    const source = `$.${field}`;
    for (const sentence of splitSentences(text)) {
      order += 1;
      if (!isQuotable(sentence)) continue;
      // The one guarantee the DM rests on.
      if (!text.includes(sentence)) continue;
      ranked.push({ text: sentence, source, score: scoreSentence(sentence, source), order });
    }
  }

  ranked.sort((a, b) => b.score - a.score || a.order - b.order);
  const seen = new Set<string>();
  const unique = ranked.filter((c) => (seen.has(c.text) ? false : (seen.add(c.text), true)));
  const [best, ...rest] = unique;
  return {
    finding: best ? { text: best.text, source: best.source } : null,
    candidates: rest.slice(0, 3).map((c) => ({ text: c.text, source: c.source })),
  };
}
