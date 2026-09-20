/**
 * The audit must reflect the data that was actually supplied.
 *
 * Three rules contradicted the pipeline, so Rhodes was retried — and could
 * fail closed — for using data he had been given:
 *
 *   LYRICS  "the lyric" was a fabrication even with a lyric analysis in the
 *           input, although the prompt prescribes "the lyric analysis reads
 *           as…" and the findings layer writes "the lyric is part of…".
 *   CHARTS  chart language lived inside `audience-behaviour`, whose only
 *           off-switch nothing ever set, so a charting song's own finding
 *           sentence failed.
 *   TEMPO   `hasTempo` read `context.bpm`, which nothing populates; tempo
 *           arrives as `context.audioExtras.tempo`.
 *
 * Every case below builds the audit context from a real input through
 * `auditContextFor`, the way generation does — never by hand-setting a flag.
 * And every fix is paired with its guard: what must STILL be caught.
 */

import { describe, expect, it } from "vitest";
import {
  auditContextFor,
  auditInterpretation,
  buildUserMessage,
  deriveFindings,
  findingsInputFor,
  unlocksFrom,
  SONG_INTELLIGENCE_SYSTEM_PROMPT,
  type SongIntelligenceInput,
} from "@/lib/rhodes";

const BASE: SongIntelligenceInput = {
  identity: { title: "T", artist: "A" },
  engine: {
    epiScore: 60,
    mode: "Ready",
    dimensions: { focus: 50, calm: 40, motivation: 80, balance: 55 },
    arousal: 0.6,
    valence: 0.6,
  },
};
const withContext = (
  context: NonNullable<SongIntelligenceInput["context"]>,
): SongIntelligenceInput => ({ ...BASE, context });

const rules = (input: SongIntelligenceInput, text: string) =>
  auditInterpretation(text, auditContextFor(input)).map((v) => v.rule);

describe("BUG 1 — lyrics", () => {
  const supplied = withContext({
    lyricsAnalysis: { themes: ["escape"], moods: ["wistful"], narrativeStyle: "First person" },
  });

  it("the prompt's own prescribed phrasing passes when a lyric analysis was supplied", () => {
    expect(SONG_INTELLIGENCE_SYSTEM_PROMPT).toContain("the lyric analysis reads as");
    expect(rules(supplied, "The lyric analysis reads as wistful against a bright surface.")).toEqual([]);
    expect(rules(supplied, "Lyrically the analysis leans reflective, and the words carry that weight.")).toEqual([]);
  });

  it("the findings layer's own sentences pass", () => {
    const heavy = withContext({
      instrumentalness: 0,
      audioExtras: { speechiness: 0.2 },
      lyricsAnalysis: { moods: ["sad"], emotionalIntensityScore: 8, complexityScore: 6 },
    });
    const ctx = auditContextFor(heavy);
    for (const f of deriveFindings(findingsInputFor(heavy))) {
      const v = auditInterpretation(`${f.signal} ${f.implication}`, ctx).filter(
        (x) => x.rule === "invented-lyrics",
      );
      expect(v).toEqual([]);
    }
  });

  it("GUARD: with NO lyric analysis, lyric vocabulary is still a fabrication", () => {
    expect(rules(BASE, "The lyric carries the weight here.")).toContain("invented-lyrics");
    expect(rules(BASE, "Lyrically it is about leaving.")).toContain("invented-lyrics");
  });

  it("GUARD: an EMPTY lyric-analysis shell is not a lyric analysis", () => {
    const shell = withContext({ lyricsAnalysis: { themes: [], moods: [], narrativeStyle: "" } });
    expect(auditContextFor(shell).hasLyricAnalysis).toBe(false);
    expect(rules(shell, "The lyric carries the weight here.")).toContain("invented-lyrics");
  });

  it("GUARD: reporting what the words SAY is a fabrication even with the analysis supplied", () => {
    for (const text of [
      "The lyric declares a new start.",
      "The song says it is time to go.",
      "She sings about leaving home.",
      "The narrator is at the end of something.",
      "The chorus preaches resilience.",
    ]) {
      expect(rules(supplied, text)).toContain("lyric-interpretation");
      expect(rules(BASE, text)).toContain("lyric-interpretation");
    }
  });
});

describe("BUG 2 — charts", () => {
  const charting = withContext({
    chartsRanks: {
      items: [{ chart: { name: "Top 50", countryName: "USA" }, position: 12, peakPosition: 9, current: true }],
    },
  });

  it("a charting song may name its chart facts — including the finding's own sentence", () => {
    const chart = deriveFindings(findingsInputFor(charting)).find((f) => f.kind === "chart")!;
    expect(chart.signal).toMatch(/currently charting/);
    expect(rules(charting, chart.signal)).toEqual([]);
    expect(rules(charting, "The song is currently charting at number 12 in the USA, having charted as high as 9.")).toEqual([]);
  });

  it("the chart finding unlocks chart language and NOT listener behaviour", () => {
    const unlocks = unlocksFrom(deriveFindings(findingsInputFor(charting)));
    expect(unlocks.has("chart-claim")).toBe(true);
    expect(unlocks.has("audience-behaviour")).toBe(false);
    const ctx = auditContextFor(charting);
    expect(ctx.hasChartEvidence).toBe(true);
    expect(ctx.hasObservedBehaviour).toBe(false);
  });

  it("GUARD: on a charting song, streams / skips / retention are still fabrications", () => {
    for (const text of [
      "It is charting because the streams keep climbing.",
      "Chart position aside, retention is what matters.",
      "This is what makes it sync rather than skip.",
    ]) {
      expect(rules(charting, text)).toContain("audience-behaviour");
    }
  });

  it("GUARD: with no chart data, chart language is still a fabrication", () => {
    expect(rules(BASE, "The song is currently charting in three countries.")).toContain("chart-claim");
    // Not-current entries produce no finding, so they unlock nothing.
    const lapsed = withContext({ chartsRanks: { items: [{ chart: { name: "c" }, position: 3, current: false }] } });
    expect(auditContextFor(lapsed).hasChartEvidence).toBe(false);
    expect(rules(lapsed, "It charted well.")).toContain("chart-claim");
  });

  it("GUARD: playlists and radio alone do not unlock chart language", () => {
    const playlisted = withContext({
      playlistCurrent: { items: [{ playlist: { type: "Editorial", latestSubscriberCount: 10 }, position: 3 }] },
      broadcasts: { items: [{ radio: { name: "r", countryCode: "US" } }] },
    });
    expect(auditContextFor(playlisted).hasMarketEvidence).toBe(true);
    expect(rules(playlisted, "It is charting.")).toContain("chart-claim");
  });
});

describe("BUG 3 — tempo", () => {
  const withTempo = withContext({ audioExtras: { tempo: 125.4, energy: 0.5 } });

  it("tempo supplied as audioExtras.tempo is tempo supplied", () => {
    // It really is in front of the model…
    expect(buildUserMessage(withTempo)).toContain('"tempo": 125.4');
    // …so he may speak about it, in words and as a number.
    expect(auditContextFor(withTempo).hasTempo).toBe(true);
    expect(rules(withTempo, "The tempo sits in a walking range.")).toEqual([]);
    expect(rules(withTempo, "At 125 bpm the tempo does real work.")).toEqual([]);
  });

  it("the legacy bpm field still counts", () => {
    expect(auditContextFor(withContext({ bpm: 152 })).hasTempo).toBe(true);
  });

  it("GUARD: with no tempo supplied, tempo words AND numbers are fabrications", () => {
    const noTempo = withContext({ audioExtras: { energy: 0.5 } });
    expect(auditContextFor(noTempo).hasTempo).toBe(false);
    expect(rules(noTempo, "The tempo sits in a walking range.")).toContain("invented-tempo");
    expect(rules(noTempo, "At 125 bpm it moves.")).toContain("invented-tempo");
    expect(rules(BASE, "At 125 bpm it moves.")).toContain("invented-tempo");
  });

  it("GUARD: a finding that carries no tempo evidence no longer unlocks tempo", () => {
    // Verbal-load-light fires on instrumentalness + speechiness. It used to
    // unlock tempo talk while supplying no tempo at all.
    const verbalLight = withContext({ instrumentalness: 0.9, audioExtras: { speechiness: 0.03 } });
    const findings = deriveFindings(findingsInputFor(verbalLight));
    expect(findings.some((f) => f.kind === "verbal-load")).toBe(true);
    expect(unlocksFrom(findings).has("invented-tempo")).toBe(false);
    expect(rules(verbalLight, "The tempo keeps it moving.")).toContain("invented-tempo");
  });

  it("GUARD: durations stay forbidden whatever was supplied", () => {
    expect(rules(withTempo, "Perfect for the right sixty-second moment.")).toContain("invented-spec");
    expect(rules(withTempo, "Cut it to a 30-second spot.")).toContain("invented-spec");
  });
});

describe("the profile/EPI contradiction finding", () => {
  const f = (mode: "Ready" | "Recharge" | "Flow" | "Recover", epiScore: number, d: SongIntelligenceInput["engine"]["dimensions"]) =>
    deriveFindings(findingsInputFor({ ...BASE, engine: { ...BASE.engine, mode, epiScore, dimensions: d } }))
      .filter((x) => x.kind === "contradiction" && x.truth === "CHRP_DERIVED");

  it("fires for exactly the two misread configurations", () => {
    expect(f("Ready", 40, { focus: 50, calm: 40, motivation: 80, balance: 55 })).toHaveLength(1);
    expect(f("Recharge", 70, { focus: 50, calm: 85, motivation: 40, balance: 55 })).toHaveLength(1);
  });

  it("stays silent for every other pairing, at both ends of EPI", () => {
    expect(f("Ready", 70, { focus: 50, calm: 40, motivation: 80, balance: 55 })).toEqual([]);
    expect(f("Recharge", 40, { focus: 50, calm: 85, motivation: 40, balance: 55 })).toEqual([]);
    for (const epi of [30, 55, 80]) {
      expect(f("Flow", epi, { focus: 90, calm: 50, motivation: 40, balance: 55 })).toEqual([]);
      expect(f("Recover", epi, { focus: 50, calm: 50, motivation: 40, balance: 85 })).toEqual([]);
    }
  });
});

describe("INVARIANT — the intelligence layer never contradicts the audit", () => {
  // The three bugs were one bug: a Finding handed Rhodes a sentence, and the
  // audit called that sentence a fabrication. This sweeps every extractor's
  // own text through the audit under the context its input produces.
  const eng = (
    mode: "Ready" | "Recharge" | "Flow" | "Recover",
    epiScore: number,
    dimensions: SongIntelligenceInput["engine"]["dimensions"],
    valence = 0.6,
  ): SongIntelligenceInput => ({
    identity: { title: "T", artist: "A" },
    engine: { epiScore, mode, dimensions, arousal: 0.6, valence },
  });
  const READY = { focus: 50, calm: 40, motivation: 80, balance: 55 };

  const inputs: Record<string, SongIntelligenceInput> = {
    "ready / low EPI": eng("Ready", 40, READY),
    "recharge / high EPI": eng("Recharge", 70, { focus: 50, calm: 85, motivation: 40, balance: 55 }),
    "tight top pair": eng("Flow", 55, { focus: 70, calm: 68, motivation: 40, balance: 55 }),
    "verbal-heavy from audio alone": { ...eng("Ready", 60, READY), context: { instrumentalness: 0, audioExtras: { speechiness: 0.2 } } },
    "verbal-light + sustained attention": { ...eng("Flow", 55, { focus: 80, calm: 70, motivation: 40, balance: 55 }), context: { instrumentalness: 0.9, audioExtras: { speechiness: 0.03 } } },
    "activation cue": { ...eng("Ready", 60, { focus: 60, calm: 40, motivation: 85, balance: 55 }), context: { audioExtras: { energy: 0.8 } } },
    "bright audio, heavy lyric": { ...eng("Ready", 60, READY, 0.8), context: { lyricsAnalysis: { moods: ["sad"], emotionalIntensityScore: 8, themes: ["loss"], locations: ["Texas"] } } },
    "dark audio, light lyric": { ...eng("Recover", 45, { focus: 50, calm: 60, motivation: 40, balance: 80 }, 0.2), context: { lyricsAnalysis: { moods: ["hopeful"], emotionalIntensityScore: 3 } } },
    "aligned affect": { ...eng("Ready", 70, READY, 0.8), context: { lyricsAnalysis: { moods: ["joyful"], emotionalIntensityScore: 3 } } },
    "every market signal": {
      ...eng("Ready", 60, READY),
      context: {
        soundchartsScore: { items: [{ date: "2026-08-01", fanbaseScore: 50, trendingScore: 30 }, { date: "2026-09-01", fanbaseScore: 60, trendingScore: 45 }] },
        playlistCurrent: { items: [{ playlist: { type: "Curators & Listeners", latestSubscriberCount: 900 }, position: 4 }, { playlist: { type: "Editorial", latestSubscriberCount: 50000 }, position: 20 }] },
        chartsRanks: { items: [{ chart: { name: "Top 50", countryName: "USA" }, position: 12, peakPosition: 9, timeOnChart: 6, timeOnChartUnit: "weeks", current: true }, { chart: { name: "Viral", countryName: "UK" }, position: 30, current: true }] },
        broadcasts: { items: [{ radio: { name: "KXYZ", countryCode: "US", cityName: "Austin" } }, { radio: { name: "BBC", countryCode: "GB", cityName: "London" } }] },
      },
    },
    "worship, reflective lyric": {
      ...eng("Recharge", 50, { focus: 50, calm: 85, motivation: 40, balance: 55 }),
      context: { genres: ["Christian & Gospel"], christianContext: { tradition: "worship", evidence: ["Worship"] }, lyricsAnalysis: { moods: ["reflective"], themes: ["grace"] } },
    },
  };

  for (const [name, input] of Object.entries(inputs)) {
    it(`every finding for "${name}" passes the audit it will be held to`, () => {
      const ctx = auditContextFor(input);
      const findings = deriveFindings(findingsInputFor(input));
      expect(findings.length).toBeGreaterThan(0);
      for (const f of findings) {
        const text = [f.signal, f.implication, f.action ?? ""].join(" ");
        const fabrications = auditInterpretation(text, ctx)
          .filter((v) => v.severity === "fabrication")
          .map((v) => `${f.kind}: ${v.rule}("${v.match}")`);
        expect(fabrications).toEqual([]);
      }
    });
  }

  it("the fanbase SCORE may be named when supplied; a fanbase may never be described", () => {
    const scored = inputs["every market signal"];
    expect(auditContextFor(scored).hasFanbaseScore).toBe(true);
    expect(rules(scored, "Soundcharts puts its fanbase score at 60, up from 50.")).toEqual([]);
    expect(rules(scored, "Its fanbase skews young and loyal.")).toContain("demographics");
    expect(rules(BASE, "A fanbase score of 60 says a lot.")).toContain("fanbase-score");
    expect(rules(BASE, "It has a devoted fanbase.")).toContain("demographics");
  });

  it("lyric vocabulary from the audio-only finding is licensed; interpretation still is not", () => {
    const audioOnly = inputs["verbal-heavy from audio alone"];
    expect(rules(audioOnly, "The lyric is doing the foreground work here.")).toEqual([]);
    expect(rules(audioOnly, "The lyric declares independence.")).toContain("lyric-interpretation");
  });
});
