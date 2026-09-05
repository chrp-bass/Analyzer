/**
 * FINDINGS — the intelligence layer between Soundcharts and Rhodes.
 *
 * The old shape was: raw fields → Rhodes prompt → hope. Rhodes was expected to
 * find the interesting things AND explain them AND stay defensible. The result
 * was competent prose that rarely told the creator anything they didn't already
 * know from their own song.
 *
 * The new shape is: raw fields → deriveFindings() → tagged Finding[] → Rhodes.
 * The intelligence layer decides what is worth saying and CAN be said honestly.
 * Rhodes turns those findings into human language and adds no claims of his own.
 *
 * Every Finding carries the truth class of its evidence so nothing can quietly
 * cross the line from arithmetic to psychology, from correlation to causation,
 * from audio compatibility to observed listener behaviour, or from playlist
 * type to functional context.
 *
 *   MEASURED             direct source/audio/metadata evidence
 *   CHRP_DERIVED         existing CHRP calculations (dimensions, EPI, mode)
 *   SOUNDCHARTS_DERIVED  Soundcharts-generated semantic / proprietary analysis
 *   RESEARCH_SUPPORTED   a relationship adequately supported by evidence
 *   OBSERVED_MARKET      playlist / stream / audience / chart / radio evidence
 *   HYPOTHESIS           plausible, worth testing, not established
 *
 * Rhodes must never silently upgrade a HYPOTHESIS to a RESEARCH_SUPPORTED,
 * nor an audio-architecture reading to an OBSERVED_MARKET claim.
 *
 * The extractor is intentionally narrow: 8 to 10 well-designed extractors that
 * each answer a real question a creator would pay for. Adding a new field to
 * the input is cheap; adding a new EXTRACTOR is a decision worth making
 * carefully — an extractor's presence tells Rhodes "this is worth talking
 * about, and here is exactly what you may say about it".
 */

import type { ChristianTradition } from "./christian-context";
import {
  deriveRelationships,
  type Dimensions,
  type ProfileRelationships,
} from "./relationships";
import type { RhodesMode } from "./index";

/** The truth classes a Finding's evidence can belong to. */
export type TruthClass =
  | "MEASURED"
  | "CHRP_DERIVED"
  | "SOUNDCHARTS_DERIVED"
  | "RESEARCH_SUPPORTED"
  | "OBSERVED_MARKET"
  | "HYPOTHESIS";

/** What kind of statement a Finding is making. */
export type FindingKind =
  | "profile"        // characterisation of the emotional-performance shape
  | "verbal-load"    // interaction of instrumentalness / speechiness / complexity
  | "affect"         // audio ↔ lyric affective posture
  | "semantic"       // lyric-derived characteristic
  | "market"         // observable market behaviour
  | "agreement"      // independent signals reinforce
  | "contradiction"  // signals disagree
  | "qualification"  // one signal changes how another should be read
  | "whitespace";    // defensible characteristic worth testing in new context

/**
 * A governor rule a Finding grounds — passed through to buildUserMessage so
 * the audit knows a market/audience/genre claim in the reply is supported by
 * an actual finding rather than invented. `null` here means "grounds nothing
 * extra", which is the common case.
 */
export type UnlockableRule =
  | "market-claim"
  | "audience-behaviour"
  | "invented-genre"
  | "named-genre"
  | "invented-tempo"
  | "implied-timeline";

export interface Finding {
  kind: FindingKind;
  truth: TruthClass;
  /** One sentence naming what was found. */
  signal: string;
  /** Bullets naming the supporting evidence, each already provenance-tagged. */
  evidence: string[];
  /** One or two sentences: what this legitimately means. Restrained. */
  implication: string;
  /**
   * Optional: what the creator could test. Only supplied when there is a
   * defensible thing to try; never "consider your options".
   */
  action?: string;
  /** Governor rules this finding legitimises Rhodes to make claims within. */
  unlocks?: UnlockableRule[];
  /** Ranking hint: how confident the extractor is this matters for this song. */
  confidence: "high" | "medium" | "low";
}

/** Everything the extractors may read. All optional except CHRP facts. */
export interface FindingsInput {
  dimensions: Dimensions;
  epiScore: number;
  mode: RhodesMode;
  arousal?: number;
  valence?: number;
  /** Raw genre-root labels from Soundcharts (already filtered). */
  genres?: string[];
  /** Christian tradition established by the gate, if any. */
  christianTradition?: ChristianTradition | null;

  /**
   * Extra audio fields that the by-isrc payload already carries — these do
   * NOT contribute to the four dimension scores or to EPI (those are done),
   * they just widen what the intelligence layer can characterise.
   */
  audio?: {
    instrumentalness?: number;
    speechiness?: number;
    acousticness?: number;
    tempo?: number;
    energy?: number;
    liveness?: number;
  };

  /**
   * Soundcharts /lyrics-analysis payload, if reachable on this tier.
   * Every subfield stays optional — the endpoint's shape varies by tier and
   * the extractors read only what is actually there.
   */
  lyricsAnalysis?: {
    themes?: string[];
    moods?: string[];
    emotionalIntensityScore?: number;
    imageryScore?: number;
    complexityScore?: number;
    rhymeSchemeScore?: number;
    repetitivenessScore?: number;
    narrativeStyle?: string;
  } | null;

  /**
   * Soundcharts /current/stats payload if reachable. Shape varies wildly by
   * tier — extractors below match the shapes seen in the wild and ignore the
   * rest. Anything null-safe.
   */
  marketStats?: Record<string, unknown> | null;

  /** Soundcharts's own aggregate score for the song, if the tier exposes it. */
  soundchartsScore?: Record<string, unknown> | null;
}

/** Helper: coerce to a finite number or null. */
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Round to 1dp. Used only for prose formatting inside evidence lines. */
function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ─────────────────────────────────────────────────────────────────────────────
// The extractors. Each is a pure function of FindingsInput → Finding | null.
// A null return means "this extractor had nothing worth surfacing for this
// song"; that is the normal case for most extractors on most songs.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The one profile finding every song gets — the shape of the architecture,
 * stated as a relationship rather than a value. Rhodes can restate it or
 * lead with something more specific; either way there is one grounded
 * profile observation to build on.
 */
function extractProfileShape(
  input: FindingsInput,
  rel: ProfileRelationships,
): Finding {
  const widest = rel.pairs[0];
  const runner = rel.ranked[1];
  const leader = rel.highest;
  const followerGap = leader.score - runner.score;
  const shape =
    followerGap >= 20
      ? `${leader.name} leads clearly; the second-highest sits ${r1(followerGap)} points behind.`
      : followerGap >= 8
        ? `${leader.name} leads, but ${runner.name} is close — ${r1(followerGap)} points behind.`
        : `The profile is tight at the top: ${leader.name} and ${runner.name} sit within ${r1(followerGap)} points.`;
  return {
    kind: "profile",
    truth: "CHRP_DERIVED",
    signal: shape,
    evidence: [
      `CHRP_DERIVED: dimensions ${rel.ranked
        .map((r) => `${r.name} ${r.score}`)
        .join(", ")}`,
      `CHRP_DERIVED: widest gap is ${widest.higher} over ${widest.lower}, ${widest.gap} points`,
    ],
    implication:
      followerGap >= 20
        ? `The architecture is decisively shaped by ${leader.name}, so the song does one job well rather than sitting between several.`
        : followerGap >= 8
          ? `The song leans into ${leader.name} but carries real ${runner.name} weight; it can serve either function without feeling like the wrong tool.`
          : `A tight top pair usually reads as versatility: the same song can occupy two different functional roles at similar strength.`,
    confidence: "high",
  };
}

/**
 * A CONTRADICTION between profile lead and EPI direction is one of the most
 * useful things to name — high Motivation with low EPI is not a bug in the
 * score, it is a specific kind of song (driven but not upbeat), and creators
 * routinely misread it as either.
 */
function extractProfileEpiContradiction(
  input: FindingsInput,
  rel: ProfileRelationships,
): Finding | null {
  const epi = input.epiScore;
  const lead = rel.highest;
  const highEpi = epi >= 65;
  const lowEpi = epi <= 45;
  // Only flag when the two READ as opposite. Ready+lowEpi and Recharge+highEpi
  // are the two most misread configurations.
  if (input.mode === "Ready" && lowEpi) {
    return {
      kind: "contradiction",
      truth: "CHRP_DERIVED",
      signal: `The song is drive-forward but not upbeat: Motivation leads, and EPI sits low.`,
      evidence: [
        `CHRP_DERIVED: Motivation ${lead.score} is the leading dimension`,
        `CHRP_DERIVED: EPI ${epi} on the 0-100 scale`,
      ],
      implication: `EPI reads arousal-plus-valence; a low EPI on a Motivation-led song usually means the drive is serious rather than celebratory. That is a specific commercial texture — determined, not exuberant.`,
      confidence: "high",
    };
  }
  if (input.mode === "Recharge" && highEpi) {
    return {
      kind: "contradiction",
      truth: "CHRP_DERIVED",
      signal: `Calm leads, but EPI is high — the song reads as settled without being still.`,
      evidence: [
        `CHRP_DERIVED: Calm ${lead.score} is the leading dimension`,
        `CHRP_DERIVED: EPI ${epi} on the 0-100 scale`,
      ],
      implication: `Calm-led with a high EPI is not sleepy music. It is measured energy — the song holds its posture while carrying more brightness than a low-EPI Recharge would.`,
      confidence: "high",
    };
  }
  return highEpi ? null : null;
}

/**
 * The verbal-load finding. High instrumentalness with low speechiness is the
 * defensible profile for verbal-light listening (the audio side of what a
 * concentration playlist tends to look for). This is a HYPOTHESIS — we
 * cannot claim it improves concentration, only that its architecture is
 * compatible with contexts that request low verbal load.
 */
function extractVerbalLoad(input: FindingsInput): Finding | null {
  const inst = num(input.audio?.instrumentalness);
  const sp = num(input.audio?.speechiness);
  if (inst === null && sp === null) return null;

  // Only fire on the extremes — the middle of both fields is uninteresting.
  const lowVerbal = (inst ?? 0) >= 0.6 && (sp ?? 1) <= 0.06;
  const highVerbal = (sp ?? 0) >= 0.15 && (inst ?? 1) <= 0.15;
  if (!lowVerbal && !highVerbal) return null;

  if (lowVerbal) {
    const complexity = num(input.lyricsAnalysis?.complexityScore);
    const evidence: string[] = [
      `MEASURED: instrumentalness ${r1(inst ?? 0)}`,
      `MEASURED: speechiness ${r1(sp ?? 0)}`,
    ];
    if (complexity !== null) {
      evidence.push(
        `SOUNDCHARTS_DERIVED: lyric complexity ${r1(complexity)}`,
      );
    }
    return {
      kind: "verbal-load",
      truth: "HYPOTHESIS",
      signal: `Verbal-load-light: the recording carries little foreground language.`,
      evidence,
      implication: `That architecture is compatible with contexts that ask for low verbal load (background listening, instrumental beds, focus-adjacent sync). It does NOT mean listeners will use it for concentration — that is a behavioural claim CHRP has no evidence for.`,
      action: `Worth testing against instrumental-adjacent placements and against a stripped or reduced-vocal alternate mix if one exists.`,
      unlocks: ["invented-tempo"],
      confidence: "high",
    };
  }

  return {
    kind: "verbal-load",
    truth: "HYPOTHESIS",
    signal: `Verbal-load-heavy: the recording foregrounds language.`,
    evidence: [
      `MEASURED: speechiness ${r1(sp ?? 0)}`,
      `MEASURED: instrumentalness ${r1(inst ?? 0)}`,
    ],
    implication: `The song's foreground work is done with words. That widens what a supervisor or programmer can use it FOR — the lyric is part of what carries the moment — and narrows how it can be dropped underneath dialogue.`,
    confidence: "medium",
  };
}

/**
 * SEMANTIC characterisation. Lyric themes / moods / narrativeStyle read as
 * SOUNDCHARTS_DERIVED — they are analysis, not raw text — so the phrasing
 * stays "the lyric is characterised as…" rather than "the song is about…".
 */
function extractSemantic(input: FindingsInput): Finding | null {
  const la = input.lyricsAnalysis;
  if (!la) return null;
  const themes = (la.themes ?? []).slice(0, 3);
  const moods = (la.moods ?? []).slice(0, 3);
  const nar = typeof la.narrativeStyle === "string" ? la.narrativeStyle : null;
  if (themes.length === 0 && moods.length === 0 && !nar) return null;

  const pieces: string[] = [];
  if (themes.length > 0) pieces.push(`themes ${themes.join(", ")}`);
  if (moods.length > 0) pieces.push(`moods ${moods.join(", ")}`);
  if (nar) pieces.push(`narrative style ${nar}`);

  return {
    kind: "semantic",
    truth: "SOUNDCHARTS_DERIVED",
    signal: `Soundcharts's lyric analysis characterises this song as ${pieces.join("; ")}.`,
    evidence: [
      `SOUNDCHARTS_DERIVED: themes=[${themes.join(", ")}]`,
      `SOUNDCHARTS_DERIVED: moods=[${moods.join(", ")}]`,
      ...(nar ? [`SOUNDCHARTS_DERIVED: narrativeStyle=${nar}`] : []),
    ],
    implication: `Soundcharts analyses lyric semantics; the label is what its model saw, not what the song "is about". Use it as a second reading alongside the CHRP architecture, not as a substitute for it.`,
    confidence: "medium",
  };
}

/**
 * AGREEMENT / CONTRADICTION between the audio's affective posture (valence)
 * and the lyric's affective posture (moods, emotionalIntensityScore).
 * The most useful finding this produces is the CONTRADICTION shape — a bright
 * melody with heavy words is a specific commercial texture and one that
 * markets very differently from either half taken alone.
 */
function extractAffectAlignment(input: FindingsInput): Finding | null {
  const v = num(input.valence);
  const la = input.lyricsAnalysis;
  const intensity = num(la?.emotionalIntensityScore);
  const moods = (la?.moods ?? []).map((m) => m.toLowerCase());
  if (v === null || (intensity === null && moods.length === 0)) return null;

  const bright = v >= 0.6;
  const dark = v <= 0.4;
  const heavyLyric =
    (intensity !== null && intensity >= 0.65) ||
    moods.some((m) => /sad|angry|melanchol|heavy|somber|grief|loss/.test(m));
  const lightLyric =
    (intensity !== null && intensity <= 0.35) ||
    moods.some((m) => /joy|celebrat|uplift|bright|happy|romantic/.test(m));

  if (bright && heavyLyric) {
    return {
      kind: "contradiction",
      truth: "RESEARCH_SUPPORTED",
      signal: `The audio reads bright while the lyric analysis reads heavy — a "sweet with weight" configuration.`,
      evidence: [
        `MEASURED: source valence ${r1(v)}`,
        ...(intensity !== null
          ? [`SOUNDCHARTS_DERIVED: lyric emotionalIntensityScore ${r1(intensity)}`]
          : []),
        ...(moods.length > 0
          ? [`SOUNDCHARTS_DERIVED: moods=[${moods.join(", ")}]`]
          : []),
      ],
      implication: `Sync and positioning that lean on a first-listen mood alone will misread this song. The affective contrast is part of what it does, and it belongs in the pitch rather than being smoothed over.`,
      action: `In outreach, name the contrast explicitly — "bright surface with a heavier interior" reads more accurately than either "upbeat" or "melancholy".`,
      confidence: "high",
    };
  }
  if (dark && lightLyric) {
    return {
      kind: "contradiction",
      truth: "RESEARCH_SUPPORTED",
      signal: `The audio reads restrained while the lyric analysis reads lifted.`,
      evidence: [
        `MEASURED: source valence ${r1(v)}`,
        ...(intensity !== null
          ? [`SOUNDCHARTS_DERIVED: lyric emotionalIntensityScore ${r1(intensity)}`]
          : []),
        ...(moods.length > 0
          ? [`SOUNDCHARTS_DERIVED: moods=[${moods.join(", ")}]`]
          : []),
      ],
      implication: `The sonic quiet is doing the containment work while the words carry the lift — a specific kind of intimate optimism that reads very differently from a bright arrangement of the same words.`,
      confidence: "medium",
    };
  }
  if ((bright && lightLyric) || (dark && heavyLyric)) {
    return {
      kind: "agreement",
      truth: "RESEARCH_SUPPORTED",
      signal: `Audio affect and lyric affect agree: the song does not carry an inner-outer contradiction.`,
      evidence: [
        `MEASURED: source valence ${r1(v)}`,
        ...(intensity !== null
          ? [`SOUNDCHARTS_DERIVED: lyric emotionalIntensityScore ${r1(intensity)}`]
          : []),
      ],
      implication: `An aligned affect makes the song easier to place, because the first-listen impression is the accurate one — a supervisor or programmer will hear what a listener eventually hears.`,
      confidence: "medium",
    };
  }
  return null;
}

/**
 * MARKET finding: only fires when marketStats or soundchartsScore actually
 * carried something numeric worth mentioning. Every number here is treated
 * as OBSERVED_MARKET and prose about it becomes governor-supported (Rhodes
 * may name a market fact only when a market finding was supplied).
 */
function extractMarketSnapshot(input: FindingsInput): Finding | null {
  const stats = input.marketStats ?? {};
  const score = input.soundchartsScore ?? {};
  const evidence: string[] = [];

  // Soundcharts's own score, when present, is worth naming as a Soundcharts
  // proprietary metric — it is NOT a CHRP verdict, so the phrasing makes
  // that clear in evidence and implication.
  const sc = num((score as { value?: unknown }).value) ??
    num((score as { score?: unknown }).score);
  if (sc !== null) evidence.push(`SOUNDCHARTS_DERIVED: soundcharts-score ${r1(sc)}`);

  // Best-effort extraction — nothing here throws if the shape doesn't match.
  const spotify = (stats as { spotify?: Record<string, unknown> }).spotify;
  const streams = num((spotify as { streams?: unknown } | undefined)?.streams);
  if (streams !== null) evidence.push(`OBSERVED_MARKET: spotify streams (snapshot) ${streams}`);
  const popularity = num(
    (spotify as { popularity?: unknown } | undefined)?.popularity,
  );
  if (popularity !== null) evidence.push(`OBSERVED_MARKET: spotify popularity ${r1(popularity)}`);
  const shazam = (stats as { shazam?: Record<string, unknown> }).shazam;
  const shazamCount = num(
    (shazam as { count?: unknown } | undefined)?.count,
  );
  if (shazamCount !== null) evidence.push(`OBSERVED_MARKET: shazam count ${shazamCount}`);
  const tiktok = (stats as { tiktok?: Record<string, unknown> }).tiktok;
  const tiktokCreations = num(
    (tiktok as { videos?: unknown } | undefined)?.videos ??
      (tiktok as { creations?: unknown } | undefined)?.creations,
  );
  if (tiktokCreations !== null) evidence.push(`OBSERVED_MARKET: tiktok creations ${tiktokCreations}`);

  if (evidence.length === 0) return null;

  return {
    kind: "market",
    truth: "OBSERVED_MARKET",
    signal: `The song has an observed market footprint — the enrichment layer returned real market signals.`,
    evidence,
    implication: `These are OBSERVED market values at a snapshot in time, not predictions and not a CHRP verdict. If the observed footprint agrees with the architecture (e.g. a Motivation-led song showing TikTok creation activity), that agreement is worth naming; where it contradicts it, that is the more useful finding.`,
    unlocks: ["market-claim", "audience-behaviour"],
    confidence: "medium",
  };
}

/**
 * WHITESPACE finding: the audio architecture supports a functional context
 * that the standard playlist landscape rarely names for its genre. This is
 * the "worth testing" finding — always shipped as HYPOTHESIS, with an action.
 */
function extractWhitespace(
  input: FindingsInput,
  rel: ProfileRelationships,
): Finding | null {
  const focus = rel.ranked.find((r) => r.name === "Focus")!;
  const calm = rel.ranked.find((r) => r.name === "Calm")!;
  const motivation = rel.ranked.find((r) => r.name === "Motivation")!;
  const inst = num(input.audio?.instrumentalness) ?? 0;
  const sp = num(input.audio?.speechiness) ?? 1;

  // Focus-and-Calm both high with low verbal load = a sustained-attention
  // architecture. This is the only whitespace finding for now; adding more
  // is a deliberate act, not a reflex.
  const sustainedAttention =
    focus.score >= 60 && calm.score >= 55 && inst >= 0.5 && sp <= 0.08;
  if (sustainedAttention) {
    return {
      kind: "whitespace",
      truth: "HYPOTHESIS",
      signal: `Focus and Calm both sit high with low verbal load — the architecture that sustained-attention contexts tend to select for.`,
      evidence: [
        `CHRP_DERIVED: Focus ${focus.score}, Calm ${calm.score}`,
        `MEASURED: instrumentalness ${r1(inst)}, speechiness ${r1(sp)}`,
      ],
      implication: `CHRP cannot claim the song improves concentration — that would be a behavioural finding we do not have. What we can say is the architecture matches what those contexts commonly ask for.`,
      action: `Worth testing against focus-adjacent and study-adjacent placements; also worth naming this shape in outreach if a matching brief comes up.`,
      unlocks: ["invented-tempo"],
      confidence: "medium",
    };
  }

  const activationCue =
    motivation.score >= 70 &&
    focus.score >= 55 &&
    (num(input.audio?.energy) ?? 0) >= 0.6;
  if (activationCue) {
    return {
      kind: "whitespace",
      truth: "HYPOTHESIS",
      signal: `Motivation and Focus are both high alongside real energy — an activation-cue architecture.`,
      evidence: [
        `CHRP_DERIVED: Motivation ${motivation.score}, Focus ${focus.score}`,
        `MEASURED: energy ${r1(num(input.audio?.energy) ?? 0)}`,
      ],
      implication: `The song's architecture supports entrance moments and decisive movement — the emotional beat before something starts, not the celebration after it.`,
      action: `Worth testing against sports-content preparation, product-reveal, and campaign-entrance placements.`,
      confidence: "medium",
    };
  }

  return null;
}

/**
 * QUALIFICATION: when Christian context is open AND the lyric analysis
 * carries themes/moods that align with (or specifically don't align with)
 * the tradition, that qualification is worth handing to Rhodes for the ONE
 * permitted contextual sentence. Never a claim about ministry or adoption —
 * only what the two signals AGREE on.
 */
function extractChristianAlignment(input: FindingsInput): Finding | null {
  const tradition = input.christianTradition;
  if (!tradition) return null;
  const la = input.lyricsAnalysis;
  if (!la) return null;
  const themes = (la.themes ?? []).map((t) => t.toLowerCase());
  const moods = (la.moods ?? []).map((m) => m.toLowerCase());
  if (themes.length === 0 && moods.length === 0) return null;

  // Which posture the semantic side leans toward — reflective vs. activating.
  const reflective = moods.some((m) =>
    /reflect|contemplat|quiet|intimate|calm|still/.test(m),
  );
  const activating = moods.some((m) =>
    /celebrat|joyful|triumph|exuberant|uplift/.test(m),
  );
  const posture = reflective && !activating
    ? "reflective"
    : activating && !reflective
      ? "celebratory"
      : reflective && activating
        ? "mixed"
        : null;
  if (!posture) return null;

  return {
    kind: "qualification",
    truth: "SOUNDCHARTS_DERIVED",
    signal: `Semantic layer reads ${posture} within the ${tradition} label the metadata established.`,
    evidence: [
      `MEASURED: Soundcharts genre tradition = ${tradition}`,
      `SOUNDCHARTS_DERIVED: lyric themes=[${themes.slice(0, 3).join(", ")}]`,
      `SOUNDCHARTS_DERIVED: lyric moods=[${moods.slice(0, 3).join(", ")}]`,
    ],
    implication: `This is a semantic reading, not a theological one; it tells Rhodes which posture words the ONE contextual sentence may reach for. It never upgrades the tradition label and never predicts ministry, congregational adoption or spiritual outcome.`,
    confidence: "medium",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Ranking and assembly.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A crude but honest ranking: contradictions and whitespace above pure
 * characterisation, market findings kept near the top when present because
 * they were expensive to obtain. Ties by insertion order (stable sort).
 */
function rank(f: Finding): number {
  let s = 0;
  if (f.kind === "contradiction") s += 5;
  if (f.kind === "whitespace") s += 4;
  if (f.kind === "qualification") s += 3;
  if (f.kind === "market") s += 3;
  if (f.kind === "verbal-load") s += 2;
  if (f.kind === "affect") s += 2;
  if (f.kind === "semantic") s += 2;
  if (f.kind === "agreement") s += 1;
  if (f.kind === "profile") s += 1;
  if (f.confidence === "high") s += 2;
  if (f.confidence === "medium") s += 1;
  return s;
}

/**
 * Derive findings from what CHRP knows and whatever enrichment came back.
 * Never throws. Missing enrichment simply produces fewer findings — the
 * profile finding always fires, so Rhodes always has at least one anchor.
 */
export function deriveFindings(input: FindingsInput): Finding[] {
  const rel = deriveRelationships(input.dimensions);
  const raw: Array<Finding | null> = [
    extractProfileShape(input, rel),
    extractProfileEpiContradiction(input, rel),
    extractVerbalLoad(input),
    extractAffectAlignment(input),
    extractSemantic(input),
    extractMarketSnapshot(input),
    extractWhitespace(input, rel),
    extractChristianAlignment(input),
  ];
  const findings = raw.filter((f): f is Finding => f !== null);
  findings.sort((a, b) => rank(b) - rank(a));
  // Cap at 6. The point of the layer is a distilled set Rhodes can build
  // around, not a data dump that dilutes the reasoning back into raw fields.
  return findings.slice(0, 6);
}

/**
 * Render Findings for the Rhodes user message. Deliberately labelled and
 * structured so the model reads truth-class and grounding as part of the
 * data, not as decoration it can drop when it gets in the way.
 */
export function renderFindingsForPrompt(findings: Finding[]): string {
  if (findings.length === 0) {
    return "FINDINGS — none. The intelligence layer produced no findings for this song beyond the standard profile relationships. Interpret only from the ENGINE FACTS and DERIVED RELATIONSHIPS blocks; do not invent findings to fill the space.";
  }
  const lines: string[] = [
    "FINDINGS — the intelligence layer's read of what is worth talking about for THIS song. Each finding is tagged with the truth class of its evidence. Do not upgrade a HYPOTHESIS into a fact, do not upgrade a SOUNDCHARTS_DERIVED semantic reading into a claim about what the song means, do not upgrade a CHRP_DERIVED architecture reading into an OBSERVED_MARKET behaviour, and do not restate a finding using stronger language than its truth class allows.",
    "",
    "Ground every interpretation you write in one or more of these findings. If a claim you want to make has no supporting finding here, DO NOT MAKE IT.",
    "",
  ];
  for (const f of findings) {
    lines.push(`── ${f.kind.toUpperCase()} (${f.truth}) — confidence: ${f.confidence}`);
    lines.push(`   signal:      ${f.signal}`);
    for (const e of f.evidence) lines.push(`   evidence:    ${e}`);
    lines.push(`   implication: ${f.implication}`);
    if (f.action) lines.push(`   action:      ${f.action}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

/**
 * The set of governor rules a Findings[] permits Rhodes to write inside.
 * The presence of a market Finding, for example, permits Rhodes to name an
 * observed market fact without tripping `market-claim`. The absence of one
 * keeps the existing rule firing exactly as before.
 */
export function unlocksFrom(findings: Finding[]): Set<UnlockableRule> {
  const out = new Set<UnlockableRule>();
  for (const f of findings) {
    if (f.unlocks) for (const r of f.unlocks) out.add(r);
  }
  return out;
}
