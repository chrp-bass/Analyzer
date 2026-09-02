import { describe, expect, it } from "vitest";
import {
  auditInterpretation,
  auditSections,
  auditAgainstFacts,
  factSheetFor,
  hasFabrication,
  deriveRelationships,
  buildUserMessage,
  SONG_INTELLIGENCE_SYSTEM_PROMPT,
  RHODES_CORE,
  type SongIntelligenceInput,
} from "@/lib/rhodes";
import { gapBetween } from "@/lib/rhodes/relationships";

/**
 * The adversarial Rhodes suite.
 *
 * These run without an API key, because they test the two halves of the
 * boundary that can be tested deterministically: the relationships the
 * application computes before prompting, and the governor that reads what
 * comes back. Model output for the canonical songs is validated separately by
 * scripts/rhodes-canonical.mts, which needs a key.
 *
 * Lettering follows the adversarial set in the implementation standard.
 */

const profile = (
  focus: number,
  calm: number,
  motivation: number,
  balance: number,
) => ({ focus, calm, motivation, balance });

const inputFor = (
  dimensions: ReturnType<typeof profile>,
  mode: SongIntelligenceInput["engine"]["mode"],
  epiScore: number,
  extra: Partial<SongIntelligenceInput> = {},
): SongIntelligenceInput => ({
  identity: { title: "Test", artist: "Test Artist" },
  engine: { epiScore, mode, dimensions },
  ...extra,
});

// ─── The relationship layer: what Rhodes is pointed at ──────────────────────

describe("derived relationships are arithmetic, not judgement", () => {
  it("A — high Motivation over low Focus surfaces as the widest gap", () => {
    const rel = deriveRelationships(profile(31, 36, 95, 44));
    expect(rel.highest.name).toBe("Motivation");
    expect(rel.lowest.name).toBe("Focus");
    expect(rel.pairs[0]).toMatchObject({
      higher: "Motivation",
      lower: "Focus",
    });
    expect(gapBetween(profile(31, 36, 95, 44), "Motivation", "Focus")).toBe(64);
  });

  it("B — high Focus over low Motivation surfaces the inverse asymmetry", () => {
    const rel = deriveRelationships(profile(96, 58, 32, 61));
    expect(rel.highest.name).toBe("Focus");
    expect(rel.pairs[0]).toMatchObject({ higher: "Focus", lower: "Motivation" });
  });

  it("C — Calm and Motivation both prominent are reported close, not opposed", () => {
    const rel = deriveRelationships(profile(62, 84, 78, 66));
    // Six points apart on a 69-point scale. Nothing in the layer calls that
    // a contradiction, because arithmetic cannot.
    expect(gapBetween(profile(62, 84, 78, 66), "Calm", "Motivation")).toBe(6);
    expect(rel.spread).toBe(22);
    expect(JSON.stringify(rel)).not.toMatch(/contradict|conflict|tension/i);
  });

  it("D — prominent Balance is ranked, never characterised", () => {
    const rel = deriveRelationships(profile(55, 52, 49, 93));
    expect(rel.highest.name).toBe("Balance");
    // No wellness, health, stability or moral vocabulary may leak from here.
    expect(JSON.stringify(rel)).not.toMatch(
      /wellness|healthy|well-being|stable|mature|positive|good|better/i,
    );
  });

  it("names the scale floor so a low value is never read as an absence", () => {
    const rel = deriveRelationships(profile(30, 44.6, 79.1, 46.8));
    expect(rel.scale.dimensionFloor).toBe(30);
    expect(rel.atFloor).toEqual(["Focus"]);
    expect(rel.observations.join(" ")).toContain(
      "not the same as the property being absent",
    );
  });

  it("states the boundaries in both directions, including the negative", () => {
    // The negative case is the one that gets misstated, so it is said out loud
    // rather than left to be inferred from silence.
    const none = deriveRelationships(profile(55, 52, 49, 93));
    expect(none.observations.join(" ")).toContain(
      "NO dimension is at the ceiling",
    );
    expect(none.observations.join(" ")).toContain("NO dimension is at the floor");

    const some = deriveRelationships(profile(99, 92.2, 33.9, 79.6));
    expect(some.observations.join(" ")).toContain(
      "At the ceiling of the scale (99): Focus",
    );
    expect(some.observations.join(" ")).toContain("NO dimension is at the floor");
  });

  it("names the ceiling without claiming anything about other songs", () => {
    const rel = deriveRelationships(profile(99, 92.2, 33.9, 79.6));
    expect(rel.atCeiling).toEqual(["Focus"]);
    expect(JSON.stringify(rel)).not.toMatch(
      /rare|unusual|exceptional|remarkable|most songs/i,
    );
  });

  it("invents no threshold for 'meaningfully exceeds'", () => {
    // CHRP defines no such cut point. If one is ever introduced here it must
    // come from validated science, not from prompt convenience.
    const rel = deriveRelationships(profile(60, 61, 62, 63));
    expect(JSON.stringify(rel)).not.toMatch(
      /meaningfully|materially|significant|dominant profile|balanced profile|threshold/i,
    );
  });
});

// ─── The input contract ─────────────────────────────────────────────────────

describe("input contract", () => {
  it("G — states plainly when no optional metadata was supplied", () => {
    const message = buildUserMessage(inputFor(profile(30, 44.6, 79.1, 46.8), "Ready", 57.9));
    expect(message).toContain("AVAILABLE CONTEXT — none");
    expect(message).toMatch(/Nothing in those categories may appear/);
    // Nothing was supplied, so nothing may be implied.
    expect(message).not.toMatch(/"bpm"|"key"|"genres"/);
  });

  it("H — hands over one canonical identity, owned by Spotify", () => {
    const message = buildUserMessage(
      inputFor(profile(99, 92.2, 33.9, 79.6), "Flow", 67.9, {
        identity: {
          title: "Stick Season",
          artist: "Noah Kahan",
          isrc: "USUM72212470",
        },
      }),
    );
    expect(message).toContain("CANONICAL IDENTITY — owned by Spotify");
    expect(message).toContain("Noah Kahan");
    // There is no second candidate in the prompt for the model to prefer:
    // an analytical provider's credit never reaches this layer at all.
    expect(message).not.toMatch(/Samy Jebari|creditName|credit_name/);
  });

  it("hands over the computed relationships rather than asking for them", () => {
    const message = buildUserMessage(inputFor(profile(33.4, 38.2, 74.4, 56.3), "Ready", 59.5));
    expect(message).toContain("DERIVED RELATIONSHIPS");
    expect(message).toContain("Motivation over Focus: 41");
    expect(message).toContain("30-99");
  });

  it("marks engine facts as already final, and arousal as CHRP's own", () => {
    const message = buildUserMessage({
      identity: { title: "Test", artist: "Test Artist" },
      engine: {
        epiScore: 59.5,
        mode: "Ready",
        dimensions: profile(33.4, 38.2, 74.4, 56.3),
        arousal: 0.7696,
        valence: 0.42,
      },
    });
    expect(message).toContain("ENGINE FACTS — owned by the CHRP engine");
    expect(message).toContain("Already final");
    // Arousal is never labelled energy anywhere in the contract.
    expect(message).toContain("chrp_arousal");
    expect(message).not.toMatch(/"energy"|spotify_energy/);
  });

  it("carries user truth above inference when the creator supplied any", () => {
    const message = buildUserMessage(
      inputFor(profile(84, 21, 96, 52), "Ready", 91, {
        userTruth: ["I wrote this for the end credits of a documentary."],
      }),
    );
    expect(message).toContain("USER TRUTH");
    expect(message).toContain("Outranks anything you would otherwise infer");
  });
});

// ─── The system prompt's non-negotiables ────────────────────────────────────

describe("the locked science survives in the prompt", () => {
  it("E — states that Ready mode is not commercial readiness", () => {
    expect(SONG_INTELLIGENCE_SYSTEM_PROMPT).toContain(
      "READY MODE DOES NOT MEAN READY",
    );
    expect(SONG_INTELLIGENCE_SYSTEM_PROMPT).toMatch(
      /not a commercial verdict/i,
    );
  });

  it("F — states that a higher EPI is not a better song", () => {
    expect(SONG_INTELLIGENCE_SYSTEM_PROMPT).toMatch(
      /higher EPI is not a better song/i,
    );
    expect(SONG_INTELLIGENCE_SYSTEM_PROMPT).toMatch(/HIGHER IS NOT BETTER/);
  });

  it("keeps EPI separate from the dimensions and from quality", () => {
    expect(SONG_INTELLIGENCE_SYSTEM_PROMPT).toMatch(
      /not the highest\s+dimension, not an average of the four/i,
    );
    expect(SONG_INTELLIGENCE_SYSTEM_PROMPT).toMatch(
      /NOT quality, commercial potential/i,
    );
  });

  it("keeps CHRP arousal distinct from a provider energy field", () => {
    expect(SONG_INTELLIGENCE_SYSTEM_PROMPT).toMatch(
      /NOT a provider "energy" field/,
    );
  });

  it("refuses verdicts outright", () => {
    expect(SONG_INTELLIGENCE_SYSTEM_PROMPT).toContain(
      "CHRP ISSUES NO VERDICT",
    );
    // The dead concepts must not be reintroduced, in any casing.
    expect(SONG_INTELLIGENCE_SYSTEM_PROMPT).not.toMatch(/pitch now/i);
  });

  it("I — states there is no time axis", () => {
    expect(RHODES_CORE).toContain("NO TIME AXIS");
    expect(RHODES_CORE).toMatch(/verse, chorus, bridge/);
  });

  it("J — separates emotional affordance from market demand", () => {
    expect(SONG_INTELLIGENCE_SYSTEM_PROMPT).toMatch(
      /It is NOT market intelligence/,
    );
  });

  it("keeps the fiction boundary and claims no credentials", () => {
    expect(RHODES_CORE).toMatch(/Dr\. August Elias Rhodes is a fiction/);
    expect(RHODES_CORE).toMatch(/may not supply a single piece\s+of evidence/);
  });

  it("keeps song architecture separate from listener psychology", () => {
    expect(RHODES_CORE).toContain("DO NOT COLLAPSE THE SUBJECT INTO THE PERSON");
  });

  it("holds the personality calibration", () => {
    expect(RHODES_CORE).toMatch(
      /80 percent intelligence, 15 percent humanity, 5 percent\s+personality/,
    );
  });

  it("carries no song science in the context-free core", () => {
    // The core must stay reusable. If CHRP semantics leak into it, a second
    // context cannot adopt it without inheriting Song Intelligence's science.
    expect(RHODES_CORE).not.toMatch(/\bEPI\b|Soundcharts|Spotify/);
    expect(RHODES_CORE).not.toMatch(/\bFocus\b|\bCalm\b|\bMotivation\b/);
  });
});

/**
 * Rhodes Truth v1.2 reconciliation.
 *
 * Each of these locks a canonical requirement that the implementation brief
 * either omitted or stated less precisely than the source of truth. They cite
 * the SOT section so a future edit that drops one fails loudly rather than
 * quietly de-canonicalising the core.
 */
describe("Rhodes Truth v1.2 — canonical requirements", () => {
  it("§2 — carries the external-mechanism row of the truth table", () => {
    expect(RHODES_CORE).toContain("EXTERNAL MECHANISM");
    expect(RHODES_CORE).toMatch(/never establishes what happened for\s+this one subject/);
  });

  it("§4 — confidence rises through convergence, not through phrasing", () => {
    expect(RHODES_CORE).toContain("CONFIDENCE RISES THROUGH CONVERGENCE");
    // The five conditions the SOT names.
    expect(RHODES_CORE).toMatch(/independent signals point the same way/);
    expect(RHODES_CORE).toMatch(/departs meaningfully\s+from an established baseline/);
    expect(RHODES_CORE).toMatch(/context is known/);
    expect(RHODES_CORE).toMatch(/stated their intent/);
    expect(RHODES_CORE).toMatch(/repeated outcome evidence agrees/);
  });

  it("§4 — Level 0 has the canonical language posture, not only silence", () => {
    expect(RHODES_CORE).toMatch(/data\s+does not establish it/);
  });

  it("character canon + §14 — beside the person, guide not authority", () => {
    expect(RHODES_CORE).toContain("WHERE YOU STAND");
    expect(RHODES_CORE).toMatch(/Two chairs and a readout/);
    expect(RHODES_CORE).toMatch(/never a desk, never a diagnosis, never a lecture/);
    expect(RHODES_CORE).toMatch(/guide, not an authority over them/);
  });

  it("§14 — recognition is the job, prediction is not", () => {
    expect(RHODES_CORE).toContain("RECOGNITION IS THE JOB. PREDICTION IS NOT");
    expect(RHODES_CORE).toMatch(/more choice in what happens next/);
  });

  it("§3 — computational characterisation does not claim a uniform experience", () => {
    expect(RHODES_CORE).toMatch(/without claiming that everyone\s+encounters it identically/);
  });

  it("keeps every canonical addition context-free", () => {
    // The additions above must not smuggle song science into the reusable core.
    expect(RHODES_CORE).not.toMatch(/\bEPI\b|Soundcharts|Spotify/);
    expect(RHODES_CORE).not.toMatch(/\bFocus\b|\bCalm\b|\bMotivation\b/);
  });
});

describe("Rhodes Truth v1.2 — prohibitions the governor now enforces", () => {
  it("§2 — external literature cited as proof", () => {
    for (const t of [
      "Research shows music at this level improves performance.",
      "Studies have shown listeners respond to this.",
      "It is well established that this kind of drive helps.",
    ]) {
      expect(auditInterpretation(t).map((v) => v.rule)).toContain(
        "external-science-claim",
      );
      expect(hasFabrication(auditInterpretation(t))).toBe(true);
    }
  });

  it("§3 — a uniform response claimed for everyone", () => {
    expect(
      auditInterpretation("Every listener will feel the same push.").map(
        (v) => v.rule,
      ),
    ).toContain("universal-response-claim");
    // The compatible-with reading the SOT permits must stay clean.
    expect(
      auditInterpretation(
        "This may work well for someone trying to create momentum.",
      ),
    ).toEqual([]);
  });

  it("§9 — brand interest and sync demand, both named in the prohibition list", () => {
    expect(
      auditInterpretation("Brands are looking for exactly this.").map((v) => v.rule),
    ).toContain("market-claim");
    expect(
      auditInterpretation("There is real sync demand for this territory.").map(
        (v) => v.rule,
      ),
    ).toContain("market-claim");
  });
});

// ─── The governor ───────────────────────────────────────────────────────────

describe("the evidence governor catches fabrication", () => {
  const fabricates = (text: string, rule: string) => {
    const v = auditInterpretation(text);
    expect(hasFabrication(v)).toBe(true);
    expect(v.map((x) => x.rule)).toContain(rule);
  };

  it("I — song structure the engine cannot see", () => {
    fabricates(
      "The chorus lands harder than anything around it.",
      "invented-structure",
    );
  });

  it("I — a timeline implied without naming a section", () => {
    const v = auditInterpretation("It builds toward release and never lets up.");
    expect(v.map((x) => x.rule)).toContain("implied-timeline");
  });

  it("E — a readiness verdict in any wording", () => {
    fabricates("This one is ready to pitch.", "verdict");
    fabricates("Release-ready, without question.", "verdict");
  });

  it("F — one song called better than another", () => {
    fabricates("A better song than most of what sits near it.", "verdict");
  });

  it("J — market knowledge nobody supplied", () => {
    fabricates(
      "Music supervisors are actively looking for exactly this.",
      "market-claim",
    );
    fabricates("There is strong playlist interest for this.", "market-claim");
    // The boundary moved when the Buyer Map arrived: naming a category to
    // approach is legitimate guidance, asserting that it wants the song is
    // not. The bare noun is no longer a fabrication on its own.
    expect(
      hasFabrication(
        auditInterpretation("Music supervisors working in reflective drama."),
      ),
    ).toBe(false);
  });

  it("audience behaviour with no behavioural data", () => {
    fabricates("This is what makes it sync rather than skip.", "audience-behaviour");
  });

  it("demographics standing in for human state", () => {
    fabricates("Gen Z will find this immediately.", "demographics");
  });

  it("a listener diagnosed from a song profile", () => {
    fabricates(
      "People who listen to this are struggling to get moving.",
      "listener-diagnosis",
    );
  });

  it("credentials the fiction does not confer", () => {
    fabricates("In my years of clinical work, my patients responded to this.", "claimed-credentials");
  });

  it("a spec, a duration or a tempo nobody gave it", () => {
    fabricates("Perfect for the right sixty-second moment.", "invented-spec");
    fabricates("At 152 bpm it drives hard.", "invented-spec");
  });

  it("instrumentation and lyrics", () => {
    fabricates("The guitar carries it.", "invented-instrumentation");
    fabricates("Lyrically it is about leaving.", "invented-lyrics");
  });
});

describe("the governor separates style from fabrication", () => {
  it("treats population comparatives as style, not invention", () => {
    const v = auditInterpretation("A rare architecture, unlike most tracks.");
    expect(v.length).toBeGreaterThan(0);
    expect(hasFabrication(v)).toBe(false);
    expect(v.map((x) => x.rule)).toContain("population-comparative");
  });

  it("catches a low value described as a void", () => {
    const v = auditInterpretation("There is no calm to soften it.");
    expect(v.map((x) => x.rule)).toContain("absence-from-low-value");
    expect(hasFabrication(v)).toBe(false);
  });

  it("catches score narration, which the chart already does", () => {
    const v = auditInterpretation(
      "Motivation is 74, Focus is 34, Calm is 38 and Balance is 56.",
    );
    expect(v.map((x) => x.rule)).toContain("score-narration");
  });

  it("catches score narration spelled out in words", () => {
    const v = auditInterpretation(
      "Focus dominates at ninety-six, Motivation sits at thirty-two and Calm reads fifty-eight.",
    );
    expect(v.map((x) => x.rule)).toContain("score-narration");
  });

  it("catches generic model prose", () => {
    const v = auditInterpretation(
      "It leans toward ignition. Overall, this is a song with momentum.",
    );
    expect(v.map((x) => x.rule)).toContain("generic-model-prose");
  });
});

describe("the governor unlocks rules from what was actually supplied", () => {
  it("permits tempo once tempo was supplied", () => {
    const text = "At 152 bpm the tempo does real work here.";
    expect(hasFabrication(auditInterpretation(text))).toBe(true);
    expect(
      auditInterpretation(text, { hasTempo: true }).filter(
        (v) => v.rule === "invented-tempo",
      ),
    ).toHaveLength(0);
  });

  it("permits a corpus comparative once a ranking was supplied", () => {
    const text = "This sits unusually high against the corpus.";
    expect(
      auditInterpretation(text).map((v) => v.rule),
    ).toContain("population-comparative");
    expect(
      auditInterpretation(text, { hasCorpusRanking: true }).map((v) => v.rule),
    ).not.toContain("population-comparative");
  });
});

/**
 * These four cases are verbatim from real canonical output that passed every
 * pattern rule. Each states something FALSE about a fact it was given, which
 * is a worse failure than inventing one — it reads with all the confidence of
 * a correct statement.
 */
describe("the governor checks claims against the facts it supplied", () => {
  const bonJovi = factSheetFor({
    identity: { title: "Livin' On A Prayer", artist: "Bon Jovi" },
    engine: {
      epiScore: 78.7,
      mode: "Ready",
      dimensions: profile(34.5, 53.8, 74.4, 35.3),
    },
  });
  const weeknd = factSheetFor({
    identity: { title: "Blinding Lights", artist: "The Weeknd" },
    engine: {
      epiScore: 57.9,
      mode: "Ready",
      dimensions: profile(30, 44.6, 79.1, 46.8),
    },
  });

  it("catches a floor claimed for a dimension that is not at the floor", () => {
    // Focus is 34.5. The floor is 30.
    const v = auditAgainstFacts("with Focus at the floor and Motivation leading", bonJovi);
    expect(v.map((x) => x.rule)).toContain("boundary-misstated");
    expect(v[0].severity).toBe("fabrication");
    expect(v[0].why).toContain("34.5");
  });

  it("catches a ceiling claimed for a dimension that is not at the ceiling", () => {
    // Motivation is 79.1. The ceiling is 99.
    const v = auditAgainstFacts(
      "Motivation towers over everything — this is drive at the ceiling",
      weeknd,
    );
    expect(v.map((x) => x.rule)).toContain("boundary-misstated");
    expect(v[0].why).toContain("79.1");
  });

  it("allows a boundary claim that is actually true", () => {
    // Focus IS exactly 30 on this profile.
    expect(
      auditAgainstFacts("Focus sits at the absolute floor.", weeknd),
    ).toEqual([]);
  });

  it("catches a misstated value under explicit attribution", () => {
    const v = auditAgainstFacts("Motivation is 88 on this profile.", weeknd);
    expect(v.map((x) => x.rule)).toContain("value-misstated");
  });

  it("does not mistake a gap for a value", () => {
    // "40 points above" is a relationship, not a claim that Motivation is 40.
    expect(
      auditAgainstFacts(
        "Motivation towers nearly 40 points above Focus.",
        bonJovi,
      ),
    ).toEqual([]);
  });

  it("leaves an unattributable boundary phrase alone", () => {
    // Nothing to check it against; the rule catches definite errors only.
    expect(auditAgainstFacts("It sits at the ceiling.", weeknd)).toEqual([]);
  });
});

describe("comparatives and genre that slipped past the first pass", () => {
  it("catches a superlative against an implied corpus", () => {
    const v = auditInterpretation(
      "The gap here is among the widest you will see.",
    );
    expect(v.map((x) => x.rule)).toContain("implied-corpus-superlative");
  });

  it("catches 'many songs', not only 'most songs'", () => {
    const v = auditInterpretation("Where many songs create energy, this holds it.");
    expect(v.map((x) => x.rule)).toContain("population-comparative");
  });

  it("catches a genre inside a descriptive frame", () => {
    // Both verbatim from canonical output that passed the first pass.
    expect(
      auditInterpretation("Anthemic rock built for collective energy.").map(
        (x) => x.rule,
      ),
    ).toContain("named-genre");
    expect(
      auditInterpretation("Songwriting that privileges lyrical attention.").map(
        (x) => x.rule,
      ),
    ).toContain("invented-lyrics");
  });

  it("leaves the innocent uses of ambiguous genre words alone", () => {
    expect(auditInterpretation("It does not hit rock bottom.")).toEqual([]);
    expect(auditInterpretation("Momentum that carries a room.")).toEqual([]);
  });

  it("catches a genre named when none was supplied", () => {
    expect(
      auditInterpretation("Introspective folk and singer-songwriter work.").map(
        (x) => x.rule,
      ),
    ).toContain("named-genre");
    expect(
      auditInterpretation("The territory is high-energy pop, built for movement.").map(
        (x) => x.rule,
      ),
    ).toContain("named-genre");
  });

  it("permits a genre once one was supplied", () => {
    expect(
      auditInterpretation("High-energy pop, built for movement.", {
        hasGenre: true,
      }),
    ).toEqual([]);
  });
});

/**
 * The fixture prose predates the governor and would not survive it (see the
 * note at the top of tracks.paid.ts). The `consider` lines were written under
 * it, and this keeps them that way — they are the only fixture text a
 * developer should read as representative.
 */
describe("the fixture decision-advantage lines clear the governor", async () => {
  const { PAID_SECTIONS } = await import("@/lib/fixtures/tracks.paid");
  for (const [slug, sections] of Object.entries(PAID_SECTIONS)) {
    it(`${slug}`, () => {
      expect(sections.consider).toBeTruthy();
      expect(auditInterpretation(sections.consider!)).toEqual([]);
    });
  }
});

describe("the governor does not cry wolf", () => {
  it("passes a clean, specific interpretation untouched", () => {
    const clean =
      "Motivation leads this profile by a wide margin and Focus sits far below it. " +
      "That gap is the whole observation: this architecture is better at producing " +
      "movement than at holding attention on one thing, and those are different jobs. " +
      "It leans toward ignition rather than concentration. Someone already pointed at " +
      "something, who needs a push more than a place to think, is where this lands " +
      "hardest. Worth testing against a moment that needs arrival rather than aftermath.";
    expect(auditInterpretation(clean)).toEqual([]);
  });

  it("does not mistake 'built for' for a claim about time", () => {
    expect(
      auditInterpretation("Built for the moment before a decision."),
    ).toEqual([]);
  });

  it("audits every field together, so nothing hides in a placement", () => {
    const sections = {
      signature: "A profile that favours movement over concentration.",
      rhodes: "The gap between the two leading dimensions is the observation.",
      placements: [
        { title: "A moment of arrival", body: "The chorus does the work here." },
      ],
      throughline: "For the moment before something starts.",
      comparable: "Lives in the same functional territory as high-activation cues.",
      consider: "Worth testing where preparation has already happened.",
    };
    const v = auditSections(sections);
    expect(v.map((x) => x.rule)).toContain("invented-structure");
    expect(hasFabrication(v)).toBe(true);
  });
});
