/**
 * THE EVIDENCE GOVERNOR — the half that actually checks.
 *
 * core.ts tells Rhodes the rules. This file reads what came back and reports
 * where he broke them. A prompt rule nobody verifies is a suggestion; this is
 * what makes the boundary enforceable, testable and visible in CI without an
 * API key.
 *
 * Two severities, because they earn different consequences:
 *
 *   FABRICATION — a claim about the world that no supplied fact supports:
 *                 invented song structure, a verdict, market knowledge,
 *                 credentials, demographics, a listener's psychology, a spec.
 *                 These are Level 0. Generation retries, and if the second
 *                 attempt still fabricates the report fails closed rather
 *                 than shipping the invention.
 *
 *   STYLE       — a real weakness that is not a lie: a population comparative,
 *                 an implied timeline, a low value described as an absence,
 *                 generic model prose, score narration. Worth one retry;
 *                 never worth denying someone a report they are entitled to.
 *
 * Every pattern here is deliberately conservative. A checker that cries wolf
 * gets switched off, and a switched-off governor governs nothing. Where a word
 * has an innocent use ("built for" against "builds toward") the pattern is
 * written to miss the innocent one.
 */

export type ViolationSeverity = "fabrication" | "style";

export interface Violation {
  rule: string;
  severity: ViolationSeverity;
  /** The exact text that tripped the rule, for feeding back into a retry. */
  match: string;
  why: string;
}

/**
 * What the model was actually given. A rule about inventing tempo must not
 * fire when tempo was supplied — the boundary is "unsupplied", not "musical".
 */
export interface AuditContext {
  hasTempo?: boolean;
  hasKey?: boolean;
  hasGenre?: boolean;
  hasComparableArtists?: boolean;
  hasCorpusRanking?: boolean;
  hasObservedBehaviour?: boolean;
  hasStructure?: boolean;
}

interface Rule {
  rule: string;
  severity: ViolationSeverity;
  pattern: RegExp;
  why: string;
  /** When present, the rule is skipped if this context flag is true. */
  suppressedBy?: keyof AuditContext;
}

const RULES: Rule[] = [
  // ── Fabrication: song structure the engine cannot see ────────────────────
  {
    rule: "invented-structure",
    severity: "fabrication",
    pattern:
      /\b(verse|chorus|pre-chorus|bridge|breakdown|the drop|final bar|opening bar|first bar|second half|last thirty)\b/gi,
    why: "Names a part of the song. The engine measures standing properties and has no time axis.",
    suppressedBy: "hasStructure",
  },
  {
    rule: "invented-lyrics",
    severity: "fabrication",
    pattern:
      /\b(the lyric|the lyrics|lyrically|lyrical (content|attention|focus|weight|detail|meaning)|the words|sings about|the singer says|the narrator)\b/gi,
    why: "No lyric content was supplied.",
  },
  {
    rule: "invented-instrumentation",
    severity: "fabrication",
    pattern:
      /\b(guitar|piano|synth|drums|bassline|riff|vocal take|reverb|the mix|production technique|chord progression)\b/gi,
    why: "No instrumentation or production detail was supplied.",
  },

  // ── Fabrication: verdicts, which CHRP does not issue ─────────────────────
  {
    rule: "verdict",
    severity: "fabrication",
    pattern:
      /\b(ready to (pitch|release|ship)|release[- ]ready|pitch[- ]ready|sync[- ]ready|commercially ready|not ready|worth pitching|should pitch|hold this (one|song|track)|a better song|a stronger song|a weaker song|higher quality song)\b/gi,
    why: "CHRP issues no readiness call, grade or quality judgement.",
  },
  {
    rule: "quality-grade",
    severity: "fabrication",
    pattern:
      /\b(grade of|scores? (well|badly|poorly)|out of ten|quality (score|tier|rating)|commercial potential|market score|readiness score)\b/gi,
    why: "No grade, tier or commercial-potential judgement exists.",
  },

  // ── Fabrication: market knowledge nobody has ─────────────────────────────
  {
    rule: "market-claim",
    severity: "fabrication",
    pattern:
      /\b(music supervisors?|supervisors are|A&R|playlist(s|ing)?|active brief|live brief|briefs? (for|are|show)|placement probability|demand signal|(sync|market|placement|commercial) demand|brand interest|brands? (are|want|seek|seeking|look|looking|interested)|labels? (are|want)|radio play|will (place|land|get picked))\b/gi,
    why: "No market, demand or placement data was supplied. Emotional affordance is not market intelligence.",
  },
  {
    rule: "external-science-claim",
    severity: "fabrication",
    pattern:
      /\b(research (shows|suggests|indicates|has shown|tells us|confirms)|stud(y|ies) (show|shows|have shown|suggest)|science (shows|tells us|says|confirms)|it is well[- ](documented|established)|evidence (shows|demonstrates|proves) that|clinical(ly)? proven|scientifically proven)\b/gi,
    why: "Cites external literature as proof. General research may support what music can influence in aggregate; it never establishes anything about this one song.",
  },
  {
    rule: "universal-response-claim",
    severity: "fabrication",
    pattern:
      /\b(every listener|all listeners|everyone who hears (this|it)|anyone who hears (this|it) will|every person who)\b/gi,
    why: "Claims a uniform response. A song can be characterised computationally without claiming that everyone encounters it identically.",
  },
  {
    rule: "audience-behaviour",
    severity: "fabrication",
    pattern:
      /\b(skip rate|skips?\b|retention|replay(s|ed)?|completion rate|save rate|streams?\b|stream count|chart(ed|ing|s)?\b|engagement rate)\b/gi,
    why: "No listening or behavioural data of any kind was supplied.",
    suppressedBy: "hasObservedBehaviour",
  },

  // ── Fabrication: demographics and listener psychology ────────────────────
  {
    rule: "demographics",
    severity: "fabrication",
    pattern:
      /\b(gen ?z|millennials?|boomers?|teenagers?|men who|women who|aged \d|demographic|fanbase|core audience)\b/gi,
    why: "No audience data was supplied. Human STATE is allowed; demographics are not.",
  },
  {
    rule: "listener-diagnosis",
    severity: "fabrication",
    pattern:
      /\b(people who listen to this are|listeners are (struggling|anxious|depressed|lonely)|proves the listener|the listener is (struggling|anxious|depressed))\b/gi,
    why: "A song's architecture is not a diagnosis of a real person.",
  },

  // ── Fabrication: credentials Rhodes does not have ────────────────────────
  {
    rule: "claimed-credentials",
    severity: "fabrication",
    pattern:
      /\b(my research|my practice|my patients|my clients|my stud(y|ies)|peer[- ]reviewed|Ph\.?D|in my (years|decades)|I have (studied|treated|analysed|analyzed) (thousands|hundreds)|decades of (study|research|practice))\b/gi,
    why: "Rhodes is fiction. The canon may shape the voice; it may never supply credentials or evidence.",
  },

  // ── Fabrication: specs and durations nobody supplied ─────────────────────
  {
    rule: "invented-spec",
    severity: "fabrication",
    pattern:
      /\b(\d+[- ]second|\d+[- ]sec\b|thirty[- ]second|sixty[- ]second|ninety[- ]second|\d+\s?bpm|\d+\s?beats per minute)\b/gi,
    why: "No duration, cut length or tempo was supplied.",
  },
  {
    rule: "invented-tempo",
    severity: "fabrication",
    pattern: /\b(the tempo|its tempo|the bpm|beats per minute)\b/gi,
    why: "Tempo was not supplied. It is an input to the scoring, not an output of it.",
    suppressedBy: "hasTempo",
  },
  {
    rule: "invented-key",
    severity: "fabrication",
    pattern: /\b(in [A-G](\s?(sharp|flat|#|b))?\s(major|minor)|the key of)\b/g,
    why: "No musical key was supplied.",
    suppressedBy: "hasKey",
  },
  {
    rule: "invented-genre",
    severity: "fabrication",
    pattern:
      /\b(this (is|reads as) (a )?(pop|rock|country|hip[- ]hop|rap|edm|folk|metal|jazz|r&b|indie)\b|the (pop|rock|country|hip[- ]hop|edm|folk|metal|jazz|indie) (song|track|record))/gi,
    why: "No genre was supplied.",
    suppressedBy: "hasGenre",
  },
  {
    // Genre words that are almost never innocent in this context.
    rule: "named-genre",
    severity: "style",
    pattern:
      /\b(folk|indie|metal|jazz|punk|techno|synthwave|americana|singer[- ]songwriter|hip[- ]hop|r&b|edm|ambient|bluegrass|reggae|disco)\b/gi,
    why: "Names a genre. None was supplied — describe the territory by its emotional function instead.",
    suppressedBy: "hasGenre",
  },
  {
    // rock / pop / soul / house / country have innocent everyday uses, so
    // they are only caught inside a frame that makes them a genre label:
    // "anthemic rock", "high-energy pop", "soul music".
    rule: "named-genre",
    severity: "style",
    pattern:
      /\b((?:anthemic|arena|classic|alt(?:ernative)?|hard|soft|synth|dream|art|prog|garage|glam|stadium|high[- ]energy|driving|melodic)[- \s](rock|pop|soul|house|country)|(rock|pop|soul|house|country|classical)\s+(music|territory|song|track|record|production))\b/gi,
    why: "Names a genre. None was supplied — describe the territory by its emotional function instead.",
    suppressedBy: "hasGenre",
  },

  // ── Style: population comparatives against a corpus nobody supplied ──────
  {
    rule: "population-comparative",
    severity: "style",
    pattern:
      /\b(rare(ly)?|unusual(ly)?|exceptional(ly)?|remarkabl[ey]|extraordinar(y|ily)|(most|many|other|some|few) (songs|tracks|music|records|artists)|unlike most|higher than most|one of the few|top \d+%|percentile)\b/gi,
    why: "Asserts a norm across other songs. One song was supplied; nothing about the population is known.",
    suppressedBy: "hasCorpusRanking",
  },
  {
    rule: "implied-corpus-superlative",
    severity: "style",
    pattern:
      /\b(among the (widest|largest|biggest|strongest|most)|one of the (widest|largest|biggest|strongest|starkest)|(widest|starkest|largest|most extreme) (you|I)('| wi)?ll ever see|you will see|I have (ever )?seen|as (wide|extreme|stark|high|low) as (any|most|it gets))\b/gi,
    why: "Ranks this profile against a population of profiles nobody supplied.",
    suppressedBy: "hasCorpusRanking",
  },

  // ── Style: implied timeline ─────────────────────────────────────────────
  {
    rule: "implied-timeline",
    severity: "style",
    pattern:
      /\b(builds?\b|build[- ]?up|building toward|escalates?|unfolds?|develops into|never lets up|holds longer|the instant it (starts|begins)|no ramp|as it (goes on|progresses)|by the end|from the (first|opening)|sustains across|over its (length|duration|run))\b/gi,
    why: "Implies a shape in time. Scores come from track-level aggregates; nothing observed the song unfolding.",
    suppressedBy: "hasStructure",
  },

  // ── Style: a low value reported as a void ───────────────────────────────
  {
    rule: "absence-from-low-value",
    severity: "style",
    pattern:
      /\b(there is no (focus|calm|motivation|balance)|no (focus|calm|motivation|balance) (at all|to|here)|completely lacks|entirely absent|zero (focus|calm|motivation|balance)|devoid of)\b/gi,
    why: "A dimension at the floor of the scale is a low value, not an absence. The floor is 30, not 0.",
  },

  // ── Style: prose that reads as generated ────────────────────────────────
  {
    rule: "generic-model-prose",
    severity: "style",
    pattern:
      /(^|\.\s+)(Overall|Ultimately|In conclusion|At its core|It(’|')s important to note|It is important to note|Based on the data|Here are|Let(’|')s explore|In summary)\b/g,
    why: "Generic model construction. Lead with the observation instead.",
  },
];

/**
 * FACT CONSISTENCY — the check that patterns alone cannot make.
 *
 * Every rule above asks "did he claim something nobody supplied?". This asks
 * the sharper question: "did he MISSTATE something that WAS supplied?" — and
 * that is the more dangerous failure, because a wrong statement about a real
 * fact reads with all the confidence of a right one.
 *
 * Real examples this was written for, both from canonical output that passed
 * every pattern rule:
 *
 *   Focus 34.5, prose said "Focus at the floor"        (the floor is 30)
 *   Motivation 79.1, prose said "drive at the ceiling" (the ceiling is 99)
 *
 * Neither invented anything. Both were simply false, and both would have
 * shipped. Grounding has to mean the supplied facts too, not only the absent
 * ones.
 */
const DIMENSION_NAMES = ["Focus", "Calm", "Motivation", "Balance"] as const;
type DimName = (typeof DIMENSION_NAMES)[number];

/** Boundary language, and which end of the scale it asserts. */
const BOUNDARY_CLAIMS: Array<{ pattern: RegExp; end: "ceiling" | "floor" }> = [
  {
    pattern:
      /\b(at (the|its) (absolute )?(ceiling|maximum|top of the scale)|maxed out|at maximum|at the very top)\b/gi,
    end: "ceiling",
  },
  {
    pattern:
      /\b(at (the|its) (absolute )?(floor|minimum|bottom of the scale)|at minimum|at the very bottom|bottomed out)\b/gi,
    end: "floor",
  },
];

/**
 * Explicit copular attribution only — "Focus is 34", "Motivation sits at 74".
 * Deliberately NOT matching "Motivation towers 40 points above Focus", which
 * is a gap, not a value, and would misfire constantly.
 */
const VALUE_CLAIM = /\b(Focus|Calm|Motivation|Balance)\s+(?:is|sits at|reads|scores|comes in at)\s+(\d{2,3}(?:\.\d)?)\b/gi;

/** The facts a claim can be checked against. */
export interface FactSheet {
  dimensions: Record<DimName, number>;
  atCeiling: string[];
  atFloor: string[];
}

/** The dimension a boundary phrase is talking about: the nearest one before it. */
function subjectOf(text: string, index: number): DimName | null {
  const window = text.slice(Math.max(0, index - 70), index);
  let best: { name: DimName; at: number } | null = null;
  for (const name of DIMENSION_NAMES) {
    const at = window.toLowerCase().lastIndexOf(name.toLowerCase());
    if (at >= 0 && (!best || at > best.at)) best = { name, at };
  }
  return best?.name ?? null;
}

/**
 * Check the text against what was actually measured.
 *
 * Only claims that can be attributed to a dimension are checked. An
 * unattributable boundary phrase is left alone rather than guessed at — this
 * check exists to catch definite errors, not to argue about ambiguous ones.
 */
export function auditAgainstFacts(
  text: string,
  facts: FactSheet,
): Violation[] {
  const found: Violation[] = [];
  const seen = new Set<string>();

  for (const { pattern, end } of BOUNDARY_CLAIMS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const subject = subjectOf(text, m.index);
      if (!subject) continue;
      const isThere =
        end === "ceiling"
          ? facts.atCeiling.includes(subject)
          : facts.atFloor.includes(subject);
      if (isThere) continue;
      const key = `boundary:${subject}:${end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({
        rule: "boundary-misstated",
        severity: "fabrication",
        match: `${subject} "${m[0]}"`,
        why: `${subject} is ${facts.dimensions[subject]}, which is not at the ${end} of the 30-99 scale. Say what the value is relative to the others, not that it is at a boundary it has not reached.`,
      });
    }
  }

  VALUE_CLAIM.lastIndex = 0;
  let v: RegExpExecArray | null;
  while ((v = VALUE_CLAIM.exec(text)) !== null) {
    const name = (v[1][0].toUpperCase() + v[1].slice(1).toLowerCase()) as DimName;
    const claimed = Number(v[2]);
    const actual = facts.dimensions[name];
    if (Math.abs(claimed - actual) <= 0.5) continue;
    const key = `value:${name}:${claimed}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({
      rule: "value-misstated",
      severity: "fabrication",
      match: v[0],
      why: `${name} is ${actual}, not ${claimed}.`,
    });
  }

  return found;
}

/**
 * Score narration is a shape, not a phrase, so it is counted rather than
 * matched: naming three or more dimensions with their numbers means the prose
 * has become a transcription of a chart the reader is already looking at.
 */
const SPELLED_NUMBER =
  "(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?";
const DIMENSION_VALUE = new RegExp(
  `\\b(Focus|Calm|Motivation|Balance)\\b[^.]{0,24}?\\b(?:\\d{2}|${SPELLED_NUMBER})\\b`,
  "gi",
);
const SCORE_NARRATION_LIMIT = 2;

/**
 * Audit one piece of generated interpretation.
 *
 * Returns every violation found, fabrications first. An empty array means the
 * text cleared the governor — not that it is good, only that it is honest.
 */
export function auditInterpretation(
  text: string,
  ctx: AuditContext = {},
  facts?: FactSheet,
): Violation[] {
  const found: Violation[] = facts ? auditAgainstFacts(text, facts) : [];
  const seen = new Set<string>();

  for (const rule of RULES) {
    if (rule.suppressedBy && ctx[rule.suppressedBy]) continue;
    // Fresh lastIndex each pass: these are module-level /g regexes.
    rule.pattern.lastIndex = 0;
    const matches = text.match(rule.pattern);
    if (!matches) continue;
    for (const raw of matches) {
      const match = raw.trim();
      const key = `${rule.rule}:${match.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({
        rule: rule.rule,
        severity: rule.severity,
        match,
        why: rule.why,
      });
    }
  }

  DIMENSION_VALUE.lastIndex = 0;
  const narrated = text.match(DIMENSION_VALUE);
  if (narrated && narrated.length > SCORE_NARRATION_LIMIT) {
    found.push({
      rule: "score-narration",
      severity: "style",
      match: narrated.slice(0, 3).join(" / "),
      why: `Names ${narrated.length} dimension values. The chart already shows them; the insight is what the gaps mean.`,
    });
  }

  return found.sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "fabrication" ? -1 : 1,
  );
}

/** True when anything in the list is a Level 0 claim about the world. */
export function hasFabrication(violations: Violation[]): boolean {
  return violations.some((v) => v.severity === "fabrication");
}

/**
 * Audit every interpretive field of a generated report as one body of text,
 * so a fabrication cannot hide in a placement while the reading stays clean.
 */
export function auditSections(
  sections: Record<string, unknown>,
  ctx: AuditContext = {},
  facts?: FactSheet,
): Violation[] {
  const parts: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") parts.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object")
      Object.values(value).forEach(walk);
  };
  walk(sections);
  return auditInterpretation(parts.join("\n\n"), ctx, facts);
}

/**
 * The correction handed back to the model on retry. Names what tripped and
 * why, without restating the whole rulebook it already has.
 */
export function correctionNote(violations: Violation[]): string {
  const lines = violations
    .slice(0, 12)
    .map((v) => `- "${v.match}" — ${v.why}`)
    .join("\n");
  return [
    "Your previous draft broke the evidence governor. These are the exact phrases that failed:",
    lines,
    "Rewrite it. Keep the insight where the insight was sound; replace every phrase above with something the supplied facts actually support. Do not add hedging to compensate — be more precise, not more cautious.",
  ].join("\n\n");
}
