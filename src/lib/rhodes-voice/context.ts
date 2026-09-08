/**
 * The context adapter that binds ONE persisted, entitled CHRP report to ONE
 * Dr. Rhodes voice conversation, through ElevenLabs dynamic variables.
 *
 * WHAT THIS IS NOT:
 *   - A second intelligence engine. No scoring, no re-derivation, no new
 *     Soundcharts, Spotify or Anthropic traffic. Every value is read verbatim
 *     from the persisted payload the entitlement-guarded resolver returned.
 *   - A rewrite of the Rhodes voice. The ElevenLabs agent carries the
 *     governed persona; this module supplies the report as DATA.
 *
 * The output is a flat string map — the shape the agent's dynamic-variables
 * system consumes — whose centrepiece is `report_context`: a deterministic,
 * labelled, plain-text rendering of every report section the creator can
 * see, within a documented size budget. Sections are ranked; the budget can
 * shorten the LOWEST-ranked optional sections and it reports exactly what it
 * shortened. It never drops a critical section, and it never fabricates a
 * stand-in for a missing one.
 *
 * Stripped, by construction: report ids, versions, scan timestamps, ISRC,
 * artwork URLs, entitlement data, database metadata, secrets, raw provider
 * payloads. Report prose is treated as data (see `text.ts`): template braces,
 * control characters, block delimiters and role markers are neutralised so
 * injected text cannot become an instruction or a nested variable.
 *
 * Pure module. Takes a `ReportPayload`, returns strings.
 */

import type { ReportPayload } from "@/lib/fixtures/tracks";
import { asSpokenData, capText } from "./text";
import { firstSignal, renderFirstMessage } from "./first-read";

export interface RhodesVoiceContext {
  /** The song identity, for confirmation surfaces and telemetry. */
  song: { title: string; artist: string };
  /** Flat key/value map for the agent's `dynamicVariables`. */
  variables: Record<string, string>;
  /** The opening as the creator hears it (the agent renders the same template). */
  firstMessage: string;
  /** What the size budget did. Logged; never silent. */
  budget: ContextBudgetReport;
}

export interface ContextBudgetReport {
  /** Characters in `report_context`. */
  chars: number;
  /** Budget the rendering was held to. */
  limit: number;
  /** Optional sections that were shortened to fit, in the order applied. */
  trimmed: string[];
  /** Sections present in this report (legacy payloads omit some). */
  sections: string[];
}

/* ── Documented size budget ─────────────────────────────────────────────── */

/** Total budget for `report_context`. Fits comfortably in the initiation payload. */
export const REPORT_CONTEXT_LIMIT = 7000;

/**
 * Per-section caps. CRITICAL sections are never trimmed by the budget: their
 * caps sum to well under the limit. OPTIONAL sections are shortened, lowest
 * rank first, only when the total would exceed the limit.
 */
export const SECTION_CAPS = {
  // critical (never trimmed by the budget)
  measurement: 700,
  signature: 320,
  throughline: 320,
  analysis: 2000,
  consider: 700,
  // optional (trimmed lowest rank first when over budget)
  audience: 480,
  placements: 900,
  buyers: 900,
  where: 480,
  pitch: 520,
  comparable: 320,
} as const;

export type SectionKey = keyof typeof SECTION_CAPS;

export const CRITICAL_SECTIONS: readonly SectionKey[] = [
  "measurement",
  "signature",
  "throughline",
  "analysis",
  "consider",
];

/** Optional sections in trimming order: the first is shortened first. */
export const TRIM_ORDER: readonly SectionKey[] = [
  "comparable",
  "pitch",
  "where",
  "buyers",
  "placements",
  "audience",
];

/** Floor a trimmed optional section never goes below (keeps its lead intact). */
const TRIM_FLOOR = 160;

function head<T>(arr: T[] | undefined | null, n: number): T[] {
  return Array.isArray(arr) ? arr.slice(0, n) : [];
}

/* ── Section rendering ──────────────────────────────────────────────────── */

interface Section {
  key: SectionKey;
  label: string;
  text: string;
}

function measurement(report: ReportPayload): string {
  const parts: string[] = [];
  const epi = report.epi;
  if (epi && typeof epi.score === "number") {
    const rank = [
      epi.rank_in_mode ? `rank in mode: ${asSpokenData(epi.rank_in_mode)}` : "",
      epi.rank_overall ? `overall: ${asSpokenData(epi.rank_overall)}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    parts.push(`EPI ${epi.score} in ${asSpokenData(epi.mode)} mode${rank ? ` (${rank})` : ""}.`);
  }
  const dims = head(report.chrp_scores, 6)
    .filter((s) => s && typeof s.score === "number")
    .map((s) => `${asSpokenData(s.name)} ${s.score}${s.rank ? ` (${asSpokenData(s.rank)})` : ""}`);
  if (dims.length) parts.push(`Chirp dimensions: ${dims.join(", ")}.`);
  const hpv = head(report.hpv, 6)
    .filter((s) => s && typeof s.score === "number")
    .map((s) => `${asSpokenData(s.name)} ${s.score}`);
  if (hpv.length) parts.push(`Human-performance variables: ${hpv.join(", ")}.`);
  return parts.join(" ");
}

function placements(report: ReportPayload): string {
  return head(report.placements, 5)
    .filter((p) => p && typeof p.title === "string" && p.title.trim().length > 0)
    .map((p) => {
      const fam = p.family ? ` [${asSpokenData(p.family)}]` : "";
      const body = asSpokenData(p.body);
      return `${asSpokenData(p.title)}${fam}${body ? `: ${body}` : ""}`;
    })
    .join(" | ");
}

function buyers(report: ReportPayload): string {
  return head(report.buyers, 5)
    .filter((b) => b && typeof b.category === "string" && b.category.trim().length > 0)
    .map((b) => {
      const lead = asSpokenData(b.lead);
      const why = asSpokenData(b.why);
      return `${asSpokenData(b.category)}${lead ? ` — lead with: ${lead}` : ""}${why ? ` — why: ${why}` : ""}`;
    })
    .join(" | ");
}

function where(report: ReportPayload): string {
  const w = report.where_this_music_lives;
  if (!w) return "";
  const verts = head(w.verticals, 8)
    .filter((v) => v && typeof v.name === "string" && typeof v.pct === "number")
    .map((v) => `${asSpokenData(v.name)} ${Math.round(v.pct)}%`);
  const parts: string[] = [];
  if (verts.length) parts.push(`Verticals where music like this is briefed: ${verts.join(", ")}.`);
  if (w.confidence) parts.push(`Confidence: ${asSpokenData(w.confidence)}.`);
  if (typeof w.n_briefs === "number") parts.push(`Based on ${w.n_briefs} briefs.`);
  if (w.sample_brief) parts.push(`Sample brief: ${asSpokenData(w.sample_brief)}`);
  return parts.join(" ");
}

function pitch(report: ReportPayload): string {
  const p = report.pitch;
  if (!p) return "";
  const parts: string[] = [];
  if (p.sync) parts.push(`Sync: ${asSpokenData(p.sync)}`);
  if (p.promotion) parts.push(`Promotion: ${asSpokenData(p.promotion)}`);
  return parts.join(" ");
}

function sectionsFor(report: ReportPayload): Section[] {
  const all: Section[] = [
    { key: "measurement", label: "CHIRP MEASUREMENT (measured signals)", text: measurement(report) },
    { key: "signature", label: "EMOTIONAL SIGNATURE", text: asSpokenData(report.signature) },
    { key: "throughline", label: "THROUGHLINE", text: asSpokenData(report.throughline) },
    { key: "analysis", label: "CHIRP ANALYSIS (governed interpretation)", text: asSpokenData(report.rhodes) },
    {
      key: "consider",
      label: "CONSIDER (recommended considerations — the decision stays with the creator)",
      text: asSpokenData(report.consider),
    },
    {
      key: "audience",
      label: "AUDIENCE (the creator's listeners: state, use context, emotional job)",
      text: asSpokenData(report.audience),
    },
    { key: "placements", label: "PLACEMENTS", text: placements(report) },
    { key: "where", label: "WHERE THIS MUSIC LIVES (brief-based, measured)", text: where(report) },
    { key: "buyers", label: "BUYERS / INDUSTRY", text: buyers(report) },
    { key: "pitch", label: "PITCH LANGUAGE", text: pitch(report) },
    { key: "comparable", label: "COMPARABLE CONTEXT (legacy section)", text: asSpokenData(report.comparable) },
  ];
  // Per-section caps first; a missing section is omitted, never faked.
  return all.filter((s) => s.text.length > 0).map((s) => ({ ...s, text: capText(s.text, SECTION_CAPS[s.key]) }));
}

function render(identity: string, sections: Section[]): string {
  return [identity, ...sections.map((s) => `${s.label}: ${s.text}`)].join("\n");
}

/**
 * Build the runtime context for one governed report. Pure, deterministic,
 * caller responsible for entitlement and identity.
 */
export function buildRhodesVoiceContext(report: ReportPayload): RhodesVoiceContext {
  const title = asSpokenData(report.track?.title, 200) || "this song";
  const artist = asSpokenData(report.track?.artist, 200) || "the artist";
  const identity = `SONG: "${title}" by ${artist}.`;

  let sections = sectionsFor(report);
  const trimmed: string[] = [];

  // Budget: shorten optional sections, lowest rank first, until it fits.
  let text = render(identity, sections);
  for (const key of TRIM_ORDER) {
    if (text.length <= REPORT_CONTEXT_LIMIT) break;
    const idx = sections.findIndex((s) => s.key === key);
    if (idx === -1) continue;
    const over = text.length - REPORT_CONTEXT_LIMIT;
    const current = sections[idx].text.length;
    const target = Math.max(TRIM_FLOOR, current - over);
    if (target >= current) continue;
    sections = sections.map((s, i) => (i === idx ? { ...s, text: capText(s.text, target) } : s));
    trimmed.push(key);
    text = render(identity, sections);
  }

  const scoreByName = new Map(
    (Array.isArray(report.chrp_scores) ? report.chrp_scores : []).map((s) => [s.name, s.score] as const),
  );
  const num = (v: number | undefined) => (typeof v === "number" ? String(v) : "n/a");
  const signal = firstSignal(report);

  const variables: Record<string, string> = {
    // Identity — the first message and prompt address the song by name.
    song_title: title,
    song_artist: artist,
    // Measured signals the prompt cites directly.
    epi_score: report.epi && typeof report.epi.score === "number" ? String(report.epi.score) : "n/a",
    epi_mode: report.epi ? asSpokenData(report.epi.mode) || "n/a" : "n/a",
    focus_score: num(scoreByName.get("Focus")),
    calm_score: num(scoreByName.get("Calm")),
    motivation_score: num(scoreByName.get("Motivation")),
    balance_score: num(scoreByName.get("Balance")),
    // The single grounded observation the opening ends on.
    first_signal: signal,
    // The report the creator is reading, as data.
    report_context: text,
  };

  return {
    song: { title, artist },
    variables,
    firstMessage: renderFirstMessage({ song_title: title, first_signal: signal }),
    budget: {
      chars: text.length,
      limit: REPORT_CONTEXT_LIMIT,
      trimmed,
      sections: sections.map((s) => s.key),
    },
  };
}
