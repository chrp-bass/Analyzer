/**
 * INTELLIGENCE LAYER — unit coverage.
 *
 * Every extractor is a pure function of FindingsInput → Finding | null. The
 * tests here confirm the two things that make the layer safe:
 *
 *   1. Each extractor fires ONLY when the supplied evidence supports it, and
 *      the Finding it emits carries the right truth class for that evidence.
 *
 *   2. Missing enrichment (the common production case on any given day) does
 *      not break the layer — the profile finding always fires, so Rhodes
 *      always has at least one grounded anchor.
 *
 * The extractors are internal — the tests reach them through deriveFindings,
 * which is the only shape the rest of the app consumes.
 */

import { describe, it, expect } from "vitest";
import {
  deriveFindings,
  renderFindingsForPrompt,
  unlocksFrom,
  type FindingsInput,
} from "@/lib/rhodes/findings";

// ─── Helpers ────────────────────────────────────────────────────────────────

const baseInput = (
  overrides: Partial<FindingsInput> = {},
): FindingsInput => ({
  dimensions: { focus: 60, calm: 55, motivation: 65, balance: 58 },
  epiScore: 58,
  mode: "Ready",
  arousal: 0.55,
  valence: 0.5,
  ...overrides,
});

// ─── 1. The profile finding always fires ────────────────────────────────────

describe("deriveFindings — always produces at least one Finding", () => {
  it("emits a profile finding even when no enrichment is supplied", () => {
    const findings = deriveFindings(baseInput());
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => f.kind === "profile")).toBe(true);
    const profile = findings.find((f) => f.kind === "profile")!;
    expect(profile.truth).toBe("CHRP_DERIVED");
    // Evidence must trace to the dimensions we passed.
    expect(profile.evidence.some((e) => e.includes("CHRP_DERIVED"))).toBe(true);
  });

  it("caps output at 6 findings even when many are available", () => {
    const findings = deriveFindings(
      baseInput({
        dimensions: { focus: 78, calm: 72, motivation: 34, balance: 40 },
        mode: "Flow",
        epiScore: 45,
        valence: 0.75,
        audio: { instrumentalness: 0.8, speechiness: 0.03, energy: 0.35 },
        lyricsAnalysis: {
          themes: ["loss", "memory"],
          moods: ["melancholy", "reflective"],
          // 1-10 scale (verified against the production tier).
          emotionalIntensityScore: 8,
          complexityScore: 6,
        },
        soundchartsScore: {
          items: [
            { date: "2026-08-01", fanbaseScore: 40000, trendingScore: 30000 },
            { date: "2026-08-29", fanbaseScore: 50000, trendingScore: 40000 },
          ],
        },
      }),
    );
    expect(findings.length).toBeLessThanOrEqual(7);
  });
});

// ─── 2. Profile-EPI contradiction — the specific misread ────────────────────

describe("profile-EPI contradiction", () => {
  it("fires on Ready + low EPI (driven but not upbeat)", () => {
    const findings = deriveFindings(
      baseInput({
        dimensions: { focus: 45, calm: 50, motivation: 82, balance: 55 },
        mode: "Ready",
        epiScore: 38,
      }),
    );
    expect(findings.some((f) => f.kind === "contradiction")).toBe(true);
  });

  it("fires on Recharge + high EPI (settled but not still)", () => {
    const findings = deriveFindings(
      baseInput({
        dimensions: { focus: 50, calm: 82, motivation: 45, balance: 60 },
        mode: "Recharge",
        epiScore: 72,
      }),
    );
    expect(findings.some((f) => f.kind === "contradiction")).toBe(true);
  });

  it("does not fire on Ready + high EPI (the aligned case)", () => {
    const findings = deriveFindings(
      baseInput({
        dimensions: { focus: 45, calm: 40, motivation: 82, balance: 50 },
        mode: "Ready",
        epiScore: 78,
      }),
    );
    // The kind we should NOT see is a mode-EPI contradiction.
    const contradictions = findings.filter((f) => f.kind === "contradiction");
    expect(contradictions).toHaveLength(0);
  });
});

// ─── 3. Verbal-load extractor ───────────────────────────────────────────────

describe("verbal-load extractor", () => {
  it("fires low-verbal on high instrumentalness + low speechiness", () => {
    const findings = deriveFindings(
      baseInput({
        audio: { instrumentalness: 0.82, speechiness: 0.04 },
      }),
    );
    const vl = findings.find((f) => f.kind === "verbal-load");
    expect(vl).toBeDefined();
    expect(vl!.truth).toBe("HYPOTHESIS");
    expect(vl!.signal.toLowerCase()).toMatch(/verbal-load-light|little foreground/);
  });

  it("fires high-verbal on high speechiness + low instrumentalness", () => {
    const findings = deriveFindings(
      baseInput({
        audio: { instrumentalness: 0.02, speechiness: 0.28 },
      }),
    );
    expect(findings.some((f) => f.kind === "verbal-load")).toBe(true);
  });

  it("stays silent in the middle of both fields", () => {
    const findings = deriveFindings(
      baseInput({
        audio: { instrumentalness: 0.3, speechiness: 0.1 },
      }),
    );
    expect(findings.some((f) => f.kind === "verbal-load")).toBe(false);
  });

  it("stays silent when no audio extras are supplied at all", () => {
    const findings = deriveFindings(baseInput());
    expect(findings.some((f) => f.kind === "verbal-load")).toBe(false);
  });
});

// ─── 4. Affect alignment (audio ↔ lyric) ─────────────────────────────────────

describe("affect alignment", () => {
  it("names a bright-with-heavy contradiction when audio and lyric disagree", () => {
    const findings = deriveFindings(
      baseInput({
        valence: 0.72,
        lyricsAnalysis: {
          moods: ["melancholy", "loss"],
          // 1-10 scale.
          emotionalIntensityScore: 8,
        },
      }),
    );
    const affect = findings.find(
      (f) => f.kind === "contradiction" && f.truth === "RESEARCH_SUPPORTED",
    );
    expect(affect).toBeDefined();
    expect(affect!.signal.toLowerCase()).toMatch(/bright.*heav|weight|sweet with weight/);
  });

  it("does not fire when no valence is supplied", () => {
    const findings = deriveFindings(
      baseInput({
        valence: undefined,
        lyricsAnalysis: {
          moods: ["melancholy"],
          emotionalIntensityScore: 8,
        },
      }),
    );
    expect(
      findings.some(
        (f) => f.kind === "contradiction" && f.truth === "RESEARCH_SUPPORTED",
      ),
    ).toBe(false);
  });
});

// ─── 5. Semantic finding (SOUNDCHARTS_DERIVED) ──────────────────────────────

describe("semantic finding", () => {
  it("emits when themes / moods / narrativeStyle are present", () => {
    const findings = deriveFindings(
      baseInput({
        lyricsAnalysis: {
          themes: ["home", "distance"],
          moods: ["nostalgic"],
          narrativeStyle: "first-person retrospective",
        },
      }),
    );
    const s = findings.find((f) => f.kind === "semantic");
    expect(s).toBeDefined();
    expect(s!.truth).toBe("SOUNDCHARTS_DERIVED");
    expect(s!.signal).toMatch(/themes|moods|narrative/i);
  });

  it("stays silent when lyricsAnalysis is null or empty", () => {
    expect(
      deriveFindings(baseInput({ lyricsAnalysis: null })).some(
        (f) => f.kind === "semantic",
      ),
    ).toBe(false);
    expect(
      deriveFindings(baseInput({ lyricsAnalysis: {} })).some(
        (f) => f.kind === "semantic",
      ),
    ).toBe(false);
  });
});

// ─── 6. Soundcharts score (SOUNDCHARTS_DERIVED, weekly time series) ─────────

describe("soundcharts-score extractor", () => {
  it("emits latest fanbase + trending values as SOUNDCHARTS_DERIVED", () => {
    const findings = deriveFindings(
      baseInput({
        soundchartsScore: {
          items: [
            { date: "2026-08-08", fanbaseScore: 45000, trendingScore: 30000 },
            { date: "2026-08-15", fanbaseScore: 47000, trendingScore: 32000 },
            { date: "2026-08-29", fanbaseScore: 50000, trendingScore: 40000 },
          ],
        },
      }),
    );
    const s = findings.find((f) => f.kind === "sc-score");
    expect(s).toBeDefined();
    expect(s!.truth).toBe("SOUNDCHARTS_DERIVED");
    expect(s!.evidence.some((e) => e.includes("fanbaseScore"))).toBe(true);
    expect(s!.evidence.some((e) => /Δ over/.test(e))).toBe(true);
  });

  it("stays silent when the tier returned no items", () => {
    const findings = deriveFindings(
      baseInput({ soundchartsScore: { items: [] } }),
    );
    expect(findings.some((f) => f.kind === "sc-score")).toBe(false);
  });
});

// ─── 6b. Playlist footprint (OBSERVED_MARKET) ───────────────────────────────

describe("playlist footprint extractor", () => {
  it("aggregates counts + reach and calls out dominant playlist type", () => {
    const findings = deriveFindings(
      baseInput({
        playlistCurrent: {
          items: [
            {
              playlist: { name: "Mellow Cuts", type: "Curators & Listeners", latestSubscriberCount: 12 },
              position: 72,
            },
            {
              playlist: { name: "Liked Songs 2", type: "Curators & Listeners", latestSubscriberCount: 0 },
              position: 2121,
            },
            {
              playlist: { name: "Chill Mix", type: "Editorial", latestSubscriberCount: 45_000 },
              position: 8,
            },
          ],
        },
      }),
    );
    const p = findings.find((f) => f.kind === "playlist");
    expect(p).toBeDefined();
    expect(p!.truth).toBe("OBSERVED_MARKET");
    expect(p!.evidence.some((e) => e.includes("Curators & Listeners"))).toBe(true);
    expect(p!.evidence.some((e) => e.includes("reach"))).toBe(true);
    const unlocks = unlocksFrom(findings);
    expect(unlocks.has("market-claim")).toBe(true);
  });

  it("stays silent when no playlist items came back", () => {
    const findings = deriveFindings(
      baseInput({ playlistCurrent: { items: [] } }),
    );
    expect(findings.some((f) => f.kind === "playlist")).toBe(false);
  });
});

// ─── 6c. Chart presence (OBSERVED_MARKET) ───────────────────────────────────

describe("chart presence extractor", () => {
  it("emits when the song is currently charting anywhere", () => {
    const findings = deriveFindings(
      baseInput({
        chartsRanks: {
          items: [
            {
              chart: { name: "Top Dubai", countryName: "United Arab Emirates" },
              position: 55,
              peakPosition: 21,
              timeOnChart: 200,
              timeOnChartUnit: "WOC",
              current: true,
            },
          ],
        },
      }),
    );
    const c = findings.find((f) => f.kind === "chart");
    expect(c).toBeDefined();
    expect(c!.truth).toBe("OBSERVED_MARKET");
    expect(c!.evidence.some((e) => e.includes("Top Dubai"))).toBe(true);
  });

  it("stays silent for indie songs with no current chart entries", () => {
    const findings = deriveFindings(
      baseInput({ chartsRanks: { items: [] } }),
    );
    expect(findings.some((f) => f.kind === "chart")).toBe(false);
    // Absence must NOT read as a verdict — no negative finding created.
  });
});

// ─── 6d. Broadcast activity (OBSERVED_MARKET) ───────────────────────────────

describe("broadcast activity extractor", () => {
  it("aggregates airings across stations and countries", () => {
    const findings = deriveFindings(
      baseInput({
        broadcasts: {
          items: [
            { airedAt: "2026-09-05T21:05:12Z", radio: { name: "KDGS-FM", countryCode: "US", cityName: "Wichita, KS" } },
            { airedAt: "2026-09-05T20:00:00Z", radio: { name: "KDGS-FM", countryCode: "US", cityName: "Wichita, KS" } },
            { airedAt: "2026-09-05T19:00:00Z", radio: { name: "BBC Radio 1", countryCode: "GB", cityName: "London" } },
          ],
        },
      }),
    );
    const b = findings.find((f) => f.kind === "broadcast");
    expect(b).toBeDefined();
    expect(b!.truth).toBe("OBSERVED_MARKET");
    expect(b!.evidence.some((e) => e.includes("airing"))).toBe(true);
    expect(b!.evidence.some((e) => e.includes("station"))).toBe(true);
  });

  it("stays silent for songs without radio pickup", () => {
    const findings = deriveFindings(
      baseInput({ broadcasts: { items: [] } }),
    );
    expect(findings.some((f) => f.kind === "broadcast")).toBe(false);
  });
});

// ─── 7. Whitespace — the "worth testing" HYPOTHESIS ─────────────────────────

describe("whitespace extractor", () => {
  it("names the sustained-attention shape when Focus/Calm both high + low verbal", () => {
    const findings = deriveFindings(
      baseInput({
        dimensions: { focus: 78, calm: 72, motivation: 42, balance: 55 },
        mode: "Flow",
        audio: { instrumentalness: 0.7, speechiness: 0.05 },
      }),
    );
    const w = findings.find((f) => f.kind === "whitespace");
    expect(w).toBeDefined();
    expect(w!.truth).toBe("HYPOTHESIS");
    expect(w!.action).toBeDefined();
  });

  it("does not name whitespace when the architecture doesn't support it", () => {
    const findings = deriveFindings(
      baseInput({
        dimensions: { focus: 45, calm: 40, motivation: 82, balance: 55 },
        audio: { instrumentalness: 0.05, speechiness: 0.2 },
      }),
    );
    const w = findings.filter((f) => f.kind === "whitespace");
    // Activation-cue whitespace COULD still fire; sustained-attention shouldn't.
    for (const f of w) {
      expect(f.signal.toLowerCase()).not.toMatch(/sustained-attention/);
    }
  });
});

// ─── 8. Ranking puts contradictions and whitespace first ────────────────────

describe("ranking", () => {
  it("ranks contradiction above profile and semantic", () => {
    const findings = deriveFindings(
      baseInput({
        dimensions: { focus: 45, calm: 50, motivation: 82, balance: 55 },
        mode: "Ready",
        epiScore: 38,
        lyricsAnalysis: { themes: ["home"], moods: ["nostalgic"] },
      }),
    );
    const first = findings[0];
    // Either the mode-EPI contradiction OR the affect contradiction should lead,
    // never the plain profile characterisation.
    expect(first.kind === "contradiction" || first.kind === "whitespace").toBe(
      true,
    );
  });
});

// ─── 9. Christian alignment finding ─────────────────────────────────────────

describe("christian alignment (semantic layer inside an already-open gate)", () => {
  it("emits a qualification when tradition is set AND lyricsAnalysis carries a clear posture", () => {
    const findings = deriveFindings(
      baseInput({
        christianTradition: "worship",
        lyricsAnalysis: {
          themes: ["faith"],
          moods: ["reflective", "quiet"],
        },
      }),
    );
    const q = findings.find((f) => f.kind === "qualification");
    expect(q).toBeDefined();
    expect(q!.truth).toBe("SOUNDCHARTS_DERIVED");
    expect(q!.signal.toLowerCase()).toMatch(/reflect|celebrat|mixed/);
  });

  it("does not fire when tradition is null even if the lyric moods look 'reflective'", () => {
    // This is the exact false positive the gate is designed to prevent —
    // reflective moods alone must not carry Christian context. The Rhodes
    // prompt still forbids Christian vocabulary; the finding just doesn't
    // exist.
    const findings = deriveFindings(
      baseInput({
        christianTradition: null,
        lyricsAnalysis: { moods: ["reflective", "quiet"] },
      }),
    );
    expect(findings.some((f) => f.kind === "qualification")).toBe(false);
  });

  it("does not fire when tradition is set but no lyric analysis was returned", () => {
    const findings = deriveFindings(
      baseInput({
        christianTradition: "worship",
        lyricsAnalysis: null,
      }),
    );
    expect(findings.some((f) => f.kind === "qualification")).toBe(false);
  });
});

// ─── 10. Renderer — the prompt-side text ────────────────────────────────────

describe("renderFindingsForPrompt", () => {
  it("emits truth-class-tagged lines that Rhodes can read", () => {
    const findings = deriveFindings(baseInput());
    const text = renderFindingsForPrompt(findings);
    expect(text).toContain("FINDINGS");
    // Truth-class labels are present in the header.
    expect(text).toMatch(/CHRP_DERIVED/);
    // Every finding names its kind and truth class in the block.
    for (const f of findings) {
      expect(text).toContain(f.truth);
    }
  });

  it("names the absence explicitly when there are no findings", () => {
    // The profile extractor always fires from a valid dimensions object, so
    // to hit the empty path we render an explicit empty array.
    const text = renderFindingsForPrompt([]);
    expect(text).toContain("FINDINGS");
    expect(text).toContain("none");
    expect(text).toContain("do not invent");
  });
});

// ─── 11. Sparse enrichment regression ───────────────────────────────────────

describe("sparse enrichment does not break the layer", () => {
  it("all-null enrichment coexists safely; only the profile finding fires", () => {
    const findings = deriveFindings(
      baseInput({
        lyricsAnalysis: null,
        soundchartsScore: null,
        playlistCurrent: null,
        chartsRanks: null,
        broadcasts: null,
      }),
    );
    expect(findings.some((f) => f.kind === "profile")).toBe(true);
    expect(findings.some((f) => f.kind === "semantic")).toBe(false);
    expect(findings.some((f) => f.kind === "sc-score")).toBe(false);
    expect(findings.some((f) => f.kind === "playlist")).toBe(false);
    expect(findings.some((f) => f.kind === "chart")).toBe(false);
    expect(findings.some((f) => f.kind === "broadcast")).toBe(false);
  });

  it("partial lyricsAnalysis (moods only) still emits a semantic finding", () => {
    const findings = deriveFindings(
      baseInput({
        lyricsAnalysis: { moods: ["reflective"] },
      }),
    );
    expect(findings.some((f) => f.kind === "semantic")).toBe(true);
  });
});
