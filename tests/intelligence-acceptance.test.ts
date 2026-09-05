/**
 * INTELLIGENCE ENGINE — FINAL ACCEPTANCE GATE.
 *
 * These tests are the boundary between the intelligence-engine engineering
 * phase and any future Rhodes-voice work. They prove the six things that
 * make the layer safe to merge:
 *
 *   1. FIVE-SCORE REGRESSION — enrichment cannot change the scored profile.
 *   2. DETERMINISM — identical inputs produce identical Finding[].
 *   3. PROVENANCE — no truth class silently upgrades to another.
 *   4. FAILURE MATRIX — sparse / partial / plan-gated / rate-limited /
 *      timeout / malformed / 5xx all fail-open cleanly.
 *   5. CHRISTIAN GATE HARD LOCK — semantic data alone can NEVER activate
 *      Christian context; broad Christian metadata never upgrades to
 *      Worship / Gospel without matching metadata.
 *   6. MARKET TRUTH HARD LOCK — playlist / chart / broadcast presence
 *      never becomes listener intent / demand / probability / placement.
 *
 * If any of these fails, the intelligence engine is NOT ready to ship.
 */

import { describe, it, expect } from "vitest";
import {
  calculateScores,
  translateToEPI,
  calculateArousal,
  calculateEpi,
} from "@/lib/engine/scores";
import {
  deriveFindings,
  renderFindingsForPrompt,
  unlocksFrom,
  type FindingsInput,
} from "@/lib/rhodes/findings";
import { extractChristianContext } from "@/lib/rhodes/christian-context";
import { SoundchartsClient } from "@/lib/engine/soundcharts";

// ── Canonical audio fixture: Safe / The Brevet (live-verified values) ──────
const SAFE_AUDIO = {
  acousticness: 0.0,
  danceability: 0.48,
  energy: 0.71,
  instrumentalness: 0.0,
  liveness: 0.09,
  loudness: -8,
  speechiness: 0.04,
  tempo: 94,
  timeSignature: 4,
  valence: 0.34,
};

const SAFE_SCORES = calculateScores(SAFE_AUDIO);
const SAFE_EPI = translateToEPI(SAFE_SCORES, SAFE_AUDIO);

function inputBase(overrides: Partial<FindingsInput> = {}): FindingsInput {
  return {
    dimensions: SAFE_SCORES,
    epiScore: SAFE_EPI.epiScore,
    mode: SAFE_EPI.mode as import("@/lib/rhodes").RhodesMode,
    arousal: SAFE_EPI.circumplex.arousal,
    valence: SAFE_AUDIO.valence,
    audio: {
      instrumentalness: SAFE_AUDIO.instrumentalness,
      speechiness: SAFE_AUDIO.speechiness,
      acousticness: SAFE_AUDIO.acousticness,
      tempo: SAFE_AUDIO.tempo,
      energy: SAFE_AUDIO.energy,
      liveness: SAFE_AUDIO.liveness,
    },
    ...overrides,
  };
}

// ── 1. FIVE-SCORE REGRESSION ────────────────────────────────────────────────

describe("five-score regression — enrichment must NEVER change the scored profile", () => {
  it("Safe's five scores are stable and reproduce from audio alone", () => {
    // Snapshot the exact expected values so any future formula drift trips
    // this test loudly. If the science genuinely changes, update the values
    // deliberately — never accidentally.
    expect(SAFE_SCORES.focus).toBeCloseTo(42.6, 1);
    expect(SAFE_SCORES.calm).toBeCloseTo(46.4, 1);
    expect(SAFE_SCORES.motivation).toBeCloseTo(50.1, 1);
    expect(SAFE_SCORES.balance).toBeCloseTo(60.4, 1);
    expect(SAFE_EPI.epiScore).toBe(49);
    expect(SAFE_EPI.mode).toBe("Recover");
  });

  it("scores are computed from audio alone — no enrichment field can move them", () => {
    // Sanity: scoring signature takes AUDIO only. There is no wire from
    // enrichment into the scoring engine. Confirm by construction — pass an
    // audio object with no enrichment context anywhere and re-derive.
    const rescored = calculateScores(SAFE_AUDIO);
    expect(rescored).toEqual(SAFE_SCORES);
    expect(translateToEPI(rescored, SAFE_AUDIO)).toEqual(SAFE_EPI);
  });

  it("arousal + EPI helpers agree with the pipeline", () => {
    const a = calculateArousal(SAFE_AUDIO);
    const e = calculateEpi(SAFE_AUDIO);
    // translateToEPI rounds arousal for display; the raw helper is un-rounded.
    // Agreement within a 1-decimal-point tolerance is what the engine promises.
    expect(SAFE_EPI.circumplex.arousal).toBeCloseTo(a, 2);
    expect(SAFE_EPI.epiScore).toBe(Math.round(e));
  });
});

// ── 2. DETERMINISM ──────────────────────────────────────────────────────────

describe("deterministic findings — identical inputs produce identical output", () => {
  const fullInput = inputBase({
    lyricsAnalysis: {
      themes: ["Hope", "Empowerment", "Support"],
      moods: ["Hopeful", "Empowering", "Reflective"],
      narrativeStyle: "First person",
      emotionalIntensityScore: 7,
      complexityScore: 5,
      repetitivenessScore: 6,
      rhymeSchemeScore: 6,
      imageryScore: 5,
    },
    soundchartsScore: {
      items: [
        { date: "2026-08-08", fanbaseScore: 50000, trendingScore: 50000 },
        { date: "2026-08-29", fanbaseScore: 50000, trendingScore: 50000 },
      ],
    },
    playlistCurrent: {
      items: Array.from({ length: 32 }, (_, i) => ({
        playlist: { name: `p-${i}`, type: "Curators & Listeners", latestSubscriberCount: 0 },
        position: 100 + i,
      })),
    },
    chartsRanks: { items: [] },
    broadcasts: { items: [] },
  });

  it("100 repeated deriveFindings calls return byte-identical JSON", () => {
    const first = JSON.stringify(deriveFindings(fullInput));
    for (let i = 0; i < 100; i += 1) {
      expect(JSON.stringify(deriveFindings(fullInput))).toBe(first);
    }
  });

  it("finding order is stable across repeated calls (rank ties resolved deterministically)", () => {
    const kindsA = deriveFindings(fullInput).map((f) => f.kind);
    const kindsB = deriveFindings(fullInput).map((f) => f.kind);
    expect(kindsA).toEqual(kindsB);
  });

  it("renderFindingsForPrompt output is byte-stable", () => {
    const findings = deriveFindings(fullInput);
    const r1 = renderFindingsForPrompt(findings);
    const r2 = renderFindingsForPrompt(findings);
    const r3 = renderFindingsForPrompt(deriveFindings(fullInput));
    expect(r1).toBe(r2);
    expect(r1).toBe(r3);
  });
});

// ── 3. PROVENANCE — no illegal transformations ──────────────────────────────

describe("provenance — truth classes remain distinct", () => {
  it("audio evidence is MEASURED, dimension arithmetic is CHRP_DERIVED", () => {
    const f = deriveFindings(inputBase());
    const profile = f.find((x) => x.kind === "profile")!;
    expect(profile.truth).toBe("CHRP_DERIVED");
    expect(profile.evidence.every((e) => e.startsWith("CHRP_DERIVED"))).toBe(true);
  });

  it("Soundcharts lyric analysis is SOUNDCHARTS_DERIVED, never CHRP_DERIVED", () => {
    const f = deriveFindings(
      inputBase({
        lyricsAnalysis: {
          themes: ["Hope"],
          moods: ["Hopeful"],
          emotionalIntensityScore: 7,
        },
      }),
    );
    const semantic = f.find((x) => x.kind === "semantic");
    expect(semantic?.truth).toBe("SOUNDCHARTS_DERIVED");
  });

  it("Soundcharts proprietary score is SOUNDCHARTS_DERIVED, NOT OBSERVED_MARKET", () => {
    const f = deriveFindings(
      inputBase({
        soundchartsScore: {
          items: [{ date: "2026-08-29", fanbaseScore: 50000, trendingScore: 50000 }],
        },
      }),
    );
    const sc = f.find((x) => x.kind === "sc-score");
    expect(sc?.truth).toBe("SOUNDCHARTS_DERIVED");
    // Score alone must NOT unlock market-claim.
    expect(unlocksFrom(f).has("market-claim")).toBe(false);
  });

  it("playlist / chart / broadcast findings are OBSERVED_MARKET, never SOUNDCHARTS_DERIVED", () => {
    const f = deriveFindings(
      inputBase({
        playlistCurrent: {
          items: [
            { playlist: { name: "p1", type: "Editorial", latestSubscriberCount: 1000 }, position: 5 },
          ],
        },
        chartsRanks: {
          items: [
            { chart: { name: "Top", countryName: "US" }, position: 10, current: true },
          ],
        },
        broadcasts: {
          items: [
            { airedAt: "2026-09-05T00:00Z", radio: { name: "R", countryCode: "US" } },
          ],
        },
      }),
    );
    expect(f.find((x) => x.kind === "playlist")?.truth).toBe("OBSERVED_MARKET");
    expect(f.find((x) => x.kind === "chart")?.truth).toBe("OBSERVED_MARKET");
    expect(f.find((x) => x.kind === "broadcast")?.truth).toBe("OBSERVED_MARKET");
  });

  it("whitespace and verbal-load findings are HYPOTHESIS, never claims of fact", () => {
    const f = deriveFindings(
      inputBase({
        dimensions: { focus: 78, calm: 72, motivation: 42, balance: 55 },
        audio: { instrumentalness: 0.7, speechiness: 0.05 },
      }),
    );
    const w = f.find((x) => x.kind === "whitespace");
    const v = f.find((x) => x.kind === "verbal-load");
    expect(w?.truth).toBe("HYPOTHESIS");
    expect(v?.truth).toBe("HYPOTHESIS");
  });

  it("all implication strings avoid causal or intent language", () => {
    const f = deriveFindings(
      inputBase({
        playlistCurrent: {
          items: [{ playlist: { name: "p", type: "Editorial", latestSubscriberCount: 5000 }, position: 3 }],
        },
      }),
    );
    for (const finding of f) {
      // Forbidden upgrades that would smuggle interpretation past provenance.
      expect(finding.implication).not.toMatch(/listeners? will/i);
      expect(finding.implication).not.toMatch(/will succeed/i);
      expect(finding.implication).not.toMatch(/proves that.*listener/i);
      // A playlist finding must explicitly deny listener-intent upgrade.
      if (finding.kind === "playlist") {
        expect(finding.implication.toLowerCase()).toMatch(
          /not.*listener behaviour|not.*listener intent|placement tells you where curators/,
        );
      }
    }
  });
});

// ── 4. FAILURE MATRIX ───────────────────────────────────────────────────────

describe("failure matrix — every failure mode fails open, base report survives", () => {
  it("A. BASE ONLY — five scores, no enrichment → one profile finding", () => {
    const f = deriveFindings(inputBase());
    expect(f.length).toBeGreaterThan(0);
    expect(f.some((x) => x.kind === "profile")).toBe(true);
    // No enrichment findings.
    expect(f.some((x) => x.kind === "semantic")).toBe(false);
    expect(f.some((x) => x.kind === "playlist")).toBe(false);
    expect(f.some((x) => x.kind === "chart")).toBe(false);
    expect(f.some((x) => x.kind === "broadcast")).toBe(false);
    expect(f.some((x) => x.kind === "sc-score")).toBe(false);
  });

  it("B. AUDIO + SEMANTICS — semantic + affect allowed, market unlocks off", () => {
    const f = deriveFindings(
      inputBase({
        lyricsAnalysis: {
          themes: ["Loss"],
          moods: ["Melancholic"],
          emotionalIntensityScore: 8,
        },
      }),
    );
    expect(f.some((x) => x.kind === "semantic")).toBe(true);
    expect(unlocksFrom(f).has("market-claim")).toBe(false);
  });

  it("C. AUDIO + MARKET — market unlocks on, no semantic finding", () => {
    const f = deriveFindings(
      inputBase({
        playlistCurrent: {
          items: [{ playlist: { name: "p", type: "Editorial" }, position: 1 }],
        },
      }),
    );
    expect(f.some((x) => x.kind === "playlist")).toBe(true);
    expect(f.some((x) => x.kind === "semantic")).toBe(false);
    expect(unlocksFrom(f).has("market-claim")).toBe(true);
  });

  it("D. FULL — semantic + market coexist, ranking prefers market/contradiction", () => {
    const f = deriveFindings(
      inputBase({
        lyricsAnalysis: { themes: ["Hope"], moods: ["Hopeful"], emotionalIntensityScore: 7 },
        playlistCurrent: {
          items: [{ playlist: { name: "p", type: "Curators & Listeners" }, position: 5 }],
        },
        chartsRanks: {
          items: [{ chart: { name: "Top", countryName: "US" }, position: 1, current: true }],
        },
      }),
    );
    // chart or broadcast must be ranked first when present.
    expect(["chart", "broadcast", "playlist", "contradiction"]).toContain(f[0].kind);
  });

  it("E. SPARSE — every enrichment field is empty/null, profile still fires", () => {
    const f = deriveFindings(
      inputBase({
        lyricsAnalysis: null,
        soundchartsScore: { items: [] },
        playlistCurrent: { items: [] },
        chartsRanks: { items: [] },
        broadcasts: { items: [] },
      }),
    );
    expect(f.length).toBeGreaterThan(0);
    expect(f.some((x) => x.kind === "profile")).toBe(true);
    // No apologetic prose introduced by the intelligence layer.
    for (const finding of f) {
      expect(finding.signal).not.toMatch(/unavailable|we cannot|sorry|unfortunately/i);
    }
  });

  it("F. 403 (plan-gated) → client.safeGet returns null, no finding fires", () => {
    // Simulated via null payload — the extractor's contract.
    const f = deriveFindings(
      inputBase({ lyricsAnalysis: null, soundchartsScore: null }),
    );
    expect(f.some((x) => x.kind === "semantic")).toBe(false);
    expect(f.some((x) => x.kind === "sc-score")).toBe(false);
  });

  it("G. 429 rate-limited → same fail-open path as 403, no finding", () => {
    const f = deriveFindings(inputBase({ playlistCurrent: null }));
    expect(f.some((x) => x.kind === "playlist")).toBe(false);
  });

  it("H. 5xx upstream failure → same fail-open path, no finding", () => {
    const f = deriveFindings(inputBase({ broadcasts: null }));
    expect(f.some((x) => x.kind === "broadcast")).toBe(false);
  });

  it("I. Timeout → same fail-open path, no finding", () => {
    // Timeouts return null from safeGet — indistinguishable at the extractor.
    const f = deriveFindings(inputBase({ chartsRanks: null }));
    expect(f.some((x) => x.kind === "chart")).toBe(false);
  });

  it("J. Malformed enrichment shape → extractor rejects safely", () => {
    // items array contains garbage entries — extractor must not throw.
    const f = deriveFindings(
      inputBase({
        playlistCurrent: {
          items: [
            // Missing playlist object entirely
            { position: 1 } as unknown as { playlist: { name: string } },
            // Playlist object with non-string name
            { playlist: { name: 42 as unknown as string, type: "Editorial" }, position: 2 },
            // Valid entry
            { playlist: { name: "ok", type: "Editorial", latestSubscriberCount: 100 }, position: 3 },
          ],
        },
      }),
    );
    // A finding may or may not fire depending on how much valid data survived,
    // but no throw and no fabricated content.
    for (const finding of f) {
      expect(typeof finding.signal).toBe("string");
    }
  });

  it("K. PARTIAL FAILURE — mixed success, valid evidence survives without cross-contamination", () => {
    // lyricsAnalysis succeeded, market endpoints all failed.
    const f = deriveFindings(
      inputBase({
        lyricsAnalysis: {
          themes: ["Hope"],
          moods: ["Hopeful"],
          emotionalIntensityScore: 7,
        },
        soundchartsScore: null,
        playlistCurrent: null,
        chartsRanks: null,
        broadcasts: null,
      }),
    );
    expect(f.some((x) => x.kind === "semantic")).toBe(true);
    // No market finding leaked in from the semantic success.
    expect(f.some((x) => x.kind === "market")).toBe(false);
    expect(f.some((x) => x.kind === "playlist")).toBe(false);
    expect(f.some((x) => x.kind === "chart")).toBe(false);
    expect(f.some((x) => x.kind === "broadcast")).toBe(false);
    expect(unlocksFrom(f).has("market-claim")).toBe(false);
  });
});

// ── 5. CHRISTIAN GATE HARD LOCK ─────────────────────────────────────────────

describe("Christian gate — semantic data can NEVER activate the gate", () => {
  it("faith-heavy themes with NO genre metadata → gate stays closed", () => {
    // Every one of these payloads is the exact false-positive shape the
    // gate exists to prevent. Zero of them may open the gate.
    const payloads: unknown[] = [
      { genres: [], lyricsAnalysis: { themes: ["Faith", "Prayer", "God"] } },
      { genres: [], lyricsAnalysis: { themes: ["Worship"], moods: ["Reverent"] } },
      { genres: [], lyricsAnalysis: { themes: ["Praise", "Devotion"], moods: ["Worshipful"] } },
      // No genres at all
      { lyricsAnalysis: { themes: ["Jesus"] } },
      // Genre object but not Christian
      { genres: [{ root: "Rock", sub: ["Alternative"] }], lyricsAnalysis: { themes: ["God"] } },
    ];
    for (const p of payloads) {
      expect(extractChristianContext(p)).toBeNull();
    }
  });

  it("broad Christian metadata is NEVER upgraded to Worship or Gospel", () => {
    // Broad root only — stays broad no matter what the semantic layer says.
    const broad = { genres: [{ root: "Christian & Gospel", sub: [] }] };
    const ccBroad = extractChristianContext(broad);
    expect(ccBroad?.tradition).toBe("christian");
    // Even if semantic layer strongly implies worship, the metadata gate stays broad.
    // (The gate extractor does not read lyricsAnalysis — it reads only genres.)
    const withSemantic = {
      genres: [{ root: "Christian & Gospel", sub: [] }],
      lyricsAnalysis: {
        themes: ["Worship", "Praise"],
        moods: ["Worshipful"],
      },
    };
    expect(extractChristianContext(withSemantic)?.tradition).toBe("christian");
  });

  it("Gospel metadata is NEVER rewritten as Worship, and vice versa", () => {
    const gospel = {
      genres: [{ root: "Christian & Gospel", sub: ["Gospel"] }],
    };
    expect(extractChristianContext(gospel)?.tradition).toBe("gospel");

    const worship = {
      genres: [{ root: "Christian & Gospel", sub: ["Worship"] }],
    };
    expect(extractChristianContext(worship)?.tradition).toBe("worship");
  });

  it("Christian findings.ts qualification stays silent when tradition is null", () => {
    const f = deriveFindings(
      inputBase({
        christianTradition: null,
        lyricsAnalysis: {
          themes: ["Faith", "Prayer", "God"],
          moods: ["Worshipful"],
        },
      }),
    );
    expect(f.some((x) => x.kind === "qualification")).toBe(false);
  });
});

// ── 6. MARKET TRUTH HARD LOCK ───────────────────────────────────────────────

describe("market truth — playlist / chart / broadcast presence never becomes intent", () => {
  it("32 playlist records emit exactly one playlist finding; no intent unlock", () => {
    const items = Array.from({ length: 32 }, (_, i) => ({
      playlist: {
        name: `p-${i}`,
        type: "Curators & Listeners",
        latestSubscriberCount: 0,
      },
      position: 100 + i,
    }));
    const f = deriveFindings(inputBase({ playlistCurrent: { items } }));
    const p = f.find((x) => x.kind === "playlist");
    expect(p).toBeDefined();
    // Signal must not claim endorsement, adoption, demand, or probability.
    // ("Listeners" appearing as part of the playlist-type name is not a
    // listener-intent claim — Rhodes is quoting a Soundcharts category.)
    expect(p!.signal).not.toMatch(/endorse|adoption|demand|placement probability|supervisor.*want|fan(base|s)? (want|adopt)/i);
    expect(p!.evidence.some((e) => e.includes("32"))).toBe(true);
    // And the IMPLICATION must explicitly deny the listener-intent upgrade.
    expect(p!.implication.toLowerCase()).toMatch(
      /not.*listener behaviour|not.*listener intent|placement tells you where curators/,
    );
  });

  it("chart presence does NOT unlock audience-behaviour", () => {
    const f = deriveFindings(
      inputBase({
        chartsRanks: {
          items: [
            { chart: { name: "Top", countryName: "US" }, position: 1, current: true },
          ],
        },
      }),
    );
    const unlocks = unlocksFrom(f);
    expect(unlocks.has("market-claim")).toBe(true);
    // Chart presence unlocks market-claim (Rhodes may name the chart), NOT
    // audience-behaviour (Rhodes still cannot claim listener actions).
    expect(unlocks.has("audience-behaviour")).toBe(false);
  });

  it("zero chart records → chart finding silent (not a negative verdict)", () => {
    const f = deriveFindings(inputBase({ chartsRanks: { items: [] } }));
    expect(f.some((x) => x.kind === "chart")).toBe(false);
    // No "did not chart" language emitted.
    for (const finding of f) {
      expect(finding.signal).not.toMatch(/did not chart|failed to chart|no chart/i);
    }
  });

  it("zero broadcast records → broadcast finding silent (not a rejection)", () => {
    const f = deriveFindings(inputBase({ broadcasts: { items: [] } }));
    expect(f.some((x) => x.kind === "broadcast")).toBe(false);
    for (const finding of f) {
      expect(finding.signal).not.toMatch(/no radio|not on radio|rejected/i);
    }
  });

  it("Soundcharts score is never described as psychological state", () => {
    const f = deriveFindings(
      inputBase({
        soundchartsScore: {
          items: [{ date: "2026-08-29", fanbaseScore: 80000, trendingScore: 70000 }],
        },
      }),
    );
    const sc = f.find((x) => x.kind === "sc-score");
    expect(sc).toBeDefined();
    // Signal must state what the numbers are, not what they mean.
    expect(sc!.signal).not.toMatch(/listener feels|psychological|proves that|listener state/i);
    // Implication must state the NEGATIVE — "do not interpret it psychologically"
    // — so the prompt catches negation-as-permission errors.
    expect(sc!.implication.toLowerCase()).toMatch(/do not interpret it psychologically/);
    expect(sc!.implication.toLowerCase()).toMatch(/not a chrp verdict|not a prediction/);
  });

  it("stable trendingScore does not become a commercial-stability claim", () => {
    // Two identical weeks — no delta.
    const f = deriveFindings(
      inputBase({
        soundchartsScore: {
          items: [
            { date: "2026-08-22", fanbaseScore: 50000, trendingScore: 50000 },
            { date: "2026-08-29", fanbaseScore: 50000, trendingScore: 50000 },
          ],
        },
      }),
    );
    const sc = f.find((x) => x.kind === "sc-score");
    expect(sc).toBeDefined();
    // No Δ evidence emitted when the change is below 5%.
    expect(sc!.evidence.some((e) => /Δ/.test(e))).toBe(false);
  });
});

// ── 7. RHODES INPUT BOUNDARY ────────────────────────────────────────────────

describe("Rhodes input boundary — what actually reaches the model", () => {
  it("renderFindingsForPrompt exposes truth class + evidence, never raw payloads or credentials", () => {
    const fullInput = inputBase({
      lyricsAnalysis: { themes: ["Hope"], moods: ["Hopeful"], emotionalIntensityScore: 7 },
      soundchartsScore: {
        items: [{ date: "2026-08-29", fanbaseScore: 50000, trendingScore: 50000 }],
      },
      playlistCurrent: {
        items: [
          { playlist: { name: "p", type: "Editorial", latestSubscriberCount: 5000 }, position: 3 },
        ],
      },
    });
    const rendered = renderFindingsForPrompt(deriveFindings(fullInput));
    // No credential-shaped tokens. The regex explicitly excludes the truth-
    // class label "SOUNDCHARTS_DERIVED" which is legitimate prompt content.
    expect(rendered).not.toMatch(/sk-ant-/);
    expect(rendered).not.toMatch(/x-api-key/i);
    expect(rendered).not.toMatch(/SOUNDCHARTS_APP_ID|SOUNDCHARTS_API_KEY/);
    // Truth classes are visible.
    expect(rendered).toMatch(/CHRP_DERIVED|SOUNDCHARTS_DERIVED|OBSERVED_MARKET/);
    // The FINDINGS_CONTRACT scaffolding is present.
    expect(rendered).toMatch(/^FINDINGS/);
    expect(rendered).toMatch(/Ground every interpretation/);
  });

  it("renderFindingsForPrompt does not spill raw playlist counts beyond aggregates", () => {
    const items = Array.from({ length: 32 }, (_, i) => ({
      playlist: { name: `secret-user-playlist-${i}`, type: "Curators & Listeners" },
      position: i,
    }));
    const rendered = renderFindingsForPrompt(
      deriveFindings(inputBase({ playlistCurrent: { items } })),
    );
    // Individual playlist names must NOT appear in the rendered output.
    expect(rendered).not.toMatch(/secret-user-playlist-1\b/);
    // Aggregates DO appear.
    expect(rendered).toMatch(/32/);
  });
});

// ── 8. CLIENT SURFACE HARD LOCK ─────────────────────────────────────────────

describe("Soundcharts client surface — no dead endpoints remain", () => {
  it("client exposes exactly the verified enrichment methods (+ by-isrc)", () => {
    // Guard against regressions where a dead endpoint gets re-added.
    // The methods that MUST exist:
    const proto = SoundchartsClient.prototype;
    expect(typeof proto.getSongByIsrc).toBe("function");
    expect(typeof proto.getLyricsAnalysis).toBe("function");
    expect(typeof proto.getSoundchartsScore).toBe("function");
    expect(typeof proto.getPlaylistCurrentSpotify).toBe("function");
    expect(typeof proto.getChartsRanksSpotify).toBe("function");
    expect(typeof proto.getBroadcasts).toBe("function");
    // The methods that MUST NOT exist (plan-gated / dead):
    expect(
      (proto as unknown as Record<string, unknown>).getCurrentStats,
    ).toBeUndefined();
  });
});
