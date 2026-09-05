/**
 * CHRISTIAN / WORSHIP / GOSPEL / CCM CONTEXT LENS — regression coverage.
 *
 * The tests below prove the two absolute behaviours:
 *
 *   POSITIVE: When trusted Soundcharts genre metadata specifically names a
 *             Christian tradition, the gate opens, Rhodes sees a labelled
 *             CHRISTIAN CONTEXT block, and the governor permits the exact
 *             kind of one-sentence contextual observation the brief allows.
 *
 *   NEGATIVE: When it does not, no Christian-context language may reach
 *             the report from any direction — not from the emotional
 *             profile, not from the artist name, not from the song title,
 *             not from anywhere. The governor treats the vocabulary itself
 *             as a fabrication in that state.
 *
 * The tests avoid the actual model call (that is exercised by the live
 * partition test post-deploy). They exercise the extractor, the input-shape
 * plumbing, the audit context, the governor, and the placement/dosage
 * checks — every piece the model interacts with, so a green suite here
 * describes exactly the surface the model sees on production.
 */

import { describe, it, expect } from "vitest";
import { extractChristianContext } from "@/lib/rhodes/christian-context";
import {
  auditContextFor,
  buildUserMessage,
  factSheetFor,
  type SongIntelligenceInput,
} from "@/lib/rhodes";
import {
  auditInterpretation,
  auditSections,
  auditChristianDosageAndPlacement,
} from "@/lib/rhodes/governor";
import { CHRISTIAN_CONTEXT_LENS } from "@/lib/rhodes/song-intelligence";

// ─── Fixtures ────────────────────────────────────────────────────────────

const worshipPayload = {
  uuid: "wq-1",
  isrc: "USUM70410870",
  name: "How Great Is Our God",
  genres: [{ root: "Christian & Gospel", sub: ["Worship", "CCM"] }],
  audio: {},
};

const ccmPayload = {
  uuid: "wq-2",
  isrc: "USCCM0000001",
  name: "Example CCM",
  genres: [{ root: "Christian", sub: ["Contemporary Christian"] }],
  audio: {},
};

const gospelPayload = {
  uuid: "wq-3",
  isrc: "USGOSP000001",
  name: "Example Gospel",
  genres: [{ root: "Christian & Gospel", sub: ["Gospel", "Contemporary Gospel"] }],
  audio: {},
};

const broadChristianPayload = {
  uuid: "wq-4",
  isrc: "USBRD0000001",
  name: "Example Broad",
  genres: [{ root: "Christian & Gospel", sub: [] }],
  audio: {},
};

const rockPayload = {
  uuid: "rk-1",
  isrc: "USELA9100001",
  name: "Enter Sandman",
  genres: [{ root: "Rock", sub: ["Alternative Metal"] }],
  audio: {},
};

const noGenresPayload = {
  uuid: "no-1",
  isrc: "XX0000000000",
  name: "Untitled",
  audio: {},
};

const ambiguousPayload = {
  uuid: "amb-1",
  isrc: "USAMB0000001",
  name: "Ambient Reflection",
  genres: [{ root: "Ambient", sub: ["Neoclassical"] }],
  audio: {},
};

// A minimal working Rhodes input. Used to drive buildUserMessage /
// auditContextFor across gate states without a real analysis pipeline.
function baseInput(): SongIntelligenceInput {
  return {
    identity: { title: "Sample", artist: "Sample Artist" },
    engine: {
      epiScore: 62,
      mode: "Recharge",
      dimensions: { focus: 48, calm: 76, motivation: 42, balance: 68 },
      arousal: 0.4,
      valence: 0.5,
    },
  };
}

// ─── 1–4. POSITIVE: gate opens on the specific traditions ────────────────

describe("extractChristianContext — gate opens on trusted metadata", () => {
  it("permits Worship when metadata names Worship", () => {
    const cc = extractChristianContext(worshipPayload);
    expect(cc).not.toBeNull();
    // Gospel wins if both are named. Here we have Worship + CCM only.
    expect(cc!.tradition).toBe("worship");
    expect(cc!.evidence).toContain("worship");
  });

  it("permits CCM when metadata names Contemporary Christian", () => {
    const cc = extractChristianContext(ccmPayload);
    expect(cc).not.toBeNull();
    expect(cc!.tradition).toBe("ccm");
  });

  it("preserves Gospel — never rewrites Gospel as Worship", () => {
    const cc = extractChristianContext(gospelPayload);
    expect(cc).not.toBeNull();
    expect(cc!.tradition).toBe("gospel");
    // Nothing in the extractor decides Gospel is "actually Worship". The
    // tradition guardrail is the whole point of this check.
    expect(cc!.tradition).not.toBe("worship");
  });

  it("stays broad when metadata is broad (Christian & Gospel, no sub)", () => {
    const cc = extractChristianContext(broadChristianPayload);
    expect(cc).not.toBeNull();
    expect(cc!.tradition).toBe("christian");
  });
});

// ─── 5–9. NEGATIVE: gate stays closed everywhere else ─────────────────────

describe("extractChristianContext — gate stays closed", () => {
  it("closes on non-Christian metadata (Rock / Alternative Metal)", () => {
    expect(extractChristianContext(rockPayload)).toBeNull();
  });

  it("closes when the payload has no genres at all", () => {
    expect(extractChristianContext(noGenresPayload)).toBeNull();
  });

  it("closes on ambiguous non-Christian metadata (Ambient / Neoclassical)", () => {
    expect(extractChristianContext(ambiguousPayload)).toBeNull();
  });

  it("closes on undefined / malformed input", () => {
    expect(extractChristianContext(undefined)).toBeNull();
    expect(extractChristianContext(null)).toBeNull();
    expect(extractChristianContext({})).toBeNull();
    expect(extractChristianContext({ genres: "not-an-array" })).toBeNull();
  });

  it("never opens the gate from artist name, song title, or audio profile", () => {
    // A payload with a spiritual-sounding title, a religious-sounding artist,
    // and a reflective audio profile — but no Christian genre metadata — must
    // remain closed. This is the exact false positive the lens exists to
    // prevent.
    const payload = {
      uuid: "np-1",
      isrc: "USREV0000001",
      name: "Revival",
      creditName: "The Faithful",
      audio: { energy: 0.2, valence: 0.6, acousticness: 0.9 },
      // Deliberately no `genres` field.
    };
    expect(extractChristianContext(payload)).toBeNull();
  });
});

// ─── 10. Rhodes input plumbing ────────────────────────────────────────────

describe("auditContextFor — reflects the gate state", () => {
  it("marks christianContextPermitted true only when the tradition is present", () => {
    const permitted = auditContextFor({
      ...baseInput(),
      context: {
        christianContext: { tradition: "worship", evidence: ["worship"] },
      },
    });
    expect(permitted.christianContextPermitted).toBe(true);
    expect(permitted.christianContextTradition).toBe("worship");

    const closed = auditContextFor({ ...baseInput(), context: {} });
    expect(closed.christianContextPermitted).toBe(false);
    expect(closed.christianContextTradition).toBeNull();

    const bare = auditContextFor(baseInput());
    expect(bare.christianContextPermitted).toBe(false);
  });
});

describe("buildUserMessage — the CHRISTIAN CONTEXT block is present in both states", () => {
  it("labels the block with the specific tradition when the gate is open", () => {
    const msg = buildUserMessage({
      ...baseInput(),
      context: {
        christianContext: { tradition: "gospel", evidence: ["gospel"] },
      },
    });
    expect(msg).toContain("CHRISTIAN CONTEXT — supplied by trusted Soundcharts");
    expect(msg).toContain("Tradition: gospel");
    // The one-sentence permission and the always-prohibited rider.
    expect(msg).toContain("AT MOST ONE restrained sentence");
    expect(msg).toContain("avoid theology");
  });

  it("carries the peer-voice directive and the anthropological-framing prohibition when the gate is open", () => {
    const msg = buildUserMessage({
      ...baseInput(),
      context: {
        christianContext: { tradition: "worship", evidence: ["worship"] },
      },
    });
    // Peer / native fluency instruction.
    expect(msg).toContain("already in the room");
    expect(msg).toContain("peer");
    // Anthropological framing must be explicitly named as wrong, so a
    // future regression that reintroduces "Within the Christian tradition"
    // to the prompt shows up here immediately.
    expect(msg).toContain('"Within the Christian tradition..."');
    expect(msg).toContain('"Among Christians..."');
    // Marketing-cliché rail.
    expect(msg).toContain("Christian-marketing clichés");
  });

  it("names the exact tradition envelope so broad Christian does not silently upgrade to Worship", () => {
    const broad = buildUserMessage({
      ...baseInput(),
      context: {
        christianContext: { tradition: "christian", evidence: ["christian"] },
      },
    });
    expect(broad).toContain("broad CHRISTIAN label");
    expect(broad).toContain("Do NOT silently upgrade");

    const worship = buildUserMessage({
      ...baseInput(),
      context: {
        christianContext: { tradition: "worship", evidence: ["worship"] },
      },
    });
    expect(worship).toContain("names WORSHIP");
    expect(worship).toContain("Do not rewrite this as Gospel or CCM");

    const gospel = buildUserMessage({
      ...baseInput(),
      context: {
        christianContext: { tradition: "gospel", evidence: ["gospel"] },
      },
    });
    expect(gospel).toContain("names GOSPEL");
    expect(gospel).toContain("Do not translate it into Worship or CCM");

    const ccm = buildUserMessage({
      ...baseInput(),
      context: {
        christianContext: { tradition: "ccm", evidence: ["ccm"] },
      },
    });
    expect(ccm).toContain("names CCM");
    expect(ccm).toContain("Prefer broad faith-context language");
  });

  it("labels the block as not supplied when the gate is closed", () => {
    const msg = buildUserMessage(baseInput());
    expect(msg).toContain("CHRISTIAN CONTEXT — not supplied by trusted metadata");
    expect(msg).toContain("Silence is the only correct answer");
  });
});

// ─── 11. Governor — vocab, dosage, placement, prohibited language ────────

describe("governor — Christian vocab is a fabrication when the gate is closed", () => {
  it("flags any Christian, Worship, Gospel or CCM word as unsupported context", () => {
    const violations = auditInterpretation(
      "This song reads as a personal devotional piece well suited to a worship set.",
      { christianContextPermitted: false },
    );
    const rules = violations.map((v) => v.rule);
    expect(rules).toContain("unsupported-christian-context");
  });

  it("does not flag ordinary reflective / contemplative language", () => {
    const violations = auditInterpretation(
      "This is a reflective, settling piece — the profile creates contemplative space.",
      { christianContextPermitted: false },
    );
    expect(
      violations.filter((v) => v.rule === "unsupported-christian-context"),
    ).toHaveLength(0);
  });
});

describe("governor — permit changes what counts as a fabrication", () => {
  it("permits the vocab in rhodes when the gate is open, but keeps prohibited claims fabrication", () => {
    const sections = {
      signature: "A settling piece with a leading Calm profile.",
      rhodes:
        "The profile is deeply settling, giving this a more contemplative than activating posture — closer to personal devotion than a high-energy collective moment.",
      placements: [
        {
          family: "Reflection",
          title: "Quiet ad reads",
          body: "The measured settling supports low-activation reads.",
        },
      ],
      buyers: [{ category: "Brand", lead: "settling openness", why: "…" }],
      audience: "Listeners reaching for regulation after a demanding day.",
      throughline: "It settles more than it lifts.",
      pitch: { sync: "…", promotion: "…" },
      consider: "Lead with settling function in outreach.",
    };
    const v = auditSections(
      sections as unknown as Record<string, unknown>,
      { christianContextPermitted: true },
      factSheetFor({
        ...baseInput(),
        context: {
          christianContext: { tradition: "worship", evidence: ["worship"] },
        },
      }),
    );
    // One permitted Christian-context sentence in `rhodes`, no leaks
    // elsewhere, no dosage issue.
    expect(v.filter((x) => x.rule === "unsupported-christian-context")).toHaveLength(0);
    expect(v.filter((x) => x.rule === "christian-dosage")).toHaveLength(0);
    expect(v.filter((x) => x.rule === "christian-placement")).toHaveLength(0);
  });

  it("rejects theology, divine activity and ministry predictions regardless of gate state", () => {
    const sections = {
      rhodes:
        "The Holy Spirit is invited into the room — God will use this to minister deeply, and it is biblically sound.",
    };
    const v = auditSections(
      sections as unknown as Record<string, unknown>,
      { christianContextPermitted: true },
    );
    const rules = v.map((x) => x.rule);
    expect(rules).toContain("christian-divine-activity");
    expect(rules).toContain("christian-spiritual-claim");
    expect(rules).toContain("christian-doctrinal-claim");
  });

  it("rejects congregational-adoption and specific-liturgical-setting claims", () => {
    const sections = {
      rhodes:
        "Perfect for your Sunday worship set — this belongs in church, and Young Life will love it.",
    };
    const v = auditSections(
      sections as unknown as Record<string, unknown>,
      { christianContextPermitted: true },
    );
    const rules = v.map((x) => x.rule);
    expect(rules).toContain("christian-congregational-prediction");
    expect(rules).toContain("christian-liturgical-setting");
    expect(rules).toContain("christian-named-organization");
  });

  it("enforces dosage: more than one Christian-context sentence in rhodes is a fabrication", () => {
    const sections = {
      rhodes:
        "This reads as personal devotion. The measured settling supports contemplative worship. And the profile is a worship posture through and through.",
    };
    const v = auditChristianDosageAndPlacement(sections);
    const rules = v.map((x) => x.rule);
    expect(rules).toContain("christian-dosage");
  });

  it("enforces placement: Christian vocab in a placement, buyer or pitch is a fabrication", () => {
    const sections = {
      rhodes: "The profile is contemplative.",
      signature: "A worship-adjacent piece for personal devotion.",
      placements: [
        {
          family: "Faith",
          title: "For a Christian brand film",
          body: "Fits a worship context.",
        },
      ],
      buyers: [{ category: "Worship music director", lead: "…", why: "…" }],
      pitch: { sync: "Great for Christian sync briefs.", promotion: "…" },
    };
    const v = auditChristianDosageAndPlacement(sections);
    const rules = v.map((x) => x.rule);
    expect(rules).toContain("christian-placement");
    // Multiple placement rules can fire — signature, placements, buyers, pitch.
    expect(
      v.filter((x) => x.rule === "christian-placement").length,
    ).toBeGreaterThanOrEqual(2);
  });
});

// ─── 11b. System prompt — peer voice, no anthropological framing ─────────

describe("CHRISTIAN_CONTEXT_LENS — the system prompt teaches native voice", () => {
  it("establishes Rhodes as a peer, not an outside observer", () => {
    expect(CHRISTIAN_CONTEXT_LENS).toContain("You are Christian");
    expect(CHRISTIAN_CONTEXT_LENS).toContain("Speak naturally from inside it");
  });

  it("explicitly prohibits anthropological outsider framing", () => {
    // Each of these phrasings appeared, or could re-appear, in gate-open
    // Rhodes output as an outside-the-room framing. The prompt now names
    // each one as wrong so the model does not reach for it.
    expect(CHRISTIAN_CONTEXT_LENS).toContain('"Within the Christian tradition..."');
    expect(CHRISTIAN_CONTEXT_LENS).toContain('"The Christian tradition specifically named..."');
    expect(CHRISTIAN_CONTEXT_LENS).toContain('"Within Christian music contexts..."');
    expect(CHRISTIAN_CONTEXT_LENS).toContain('"Among Christians..."');
    expect(CHRISTIAN_CONTEXT_LENS).toContain('"For Christian audiences..."');
    expect(CHRISTIAN_CONTEXT_LENS).toContain('"Within Christian communities..."');
  });

  it("prohibits Christian-marketing clichés", () => {
    expect(CHRISTIAN_CONTEXT_LENS).toContain("God-sized");
    expect(CHRISTIAN_CONTEXT_LENS).toContain("Kingdom impact");
    expect(CHRISTIAN_CONTEXT_LENS).toContain("heart for worship");
    expect(CHRISTIAN_CONTEXT_LENS).toContain("usher people into");
    expect(CHRISTIAN_CONTEXT_LENS).toContain("spirit-led");
  });

  it("keeps the always-prohibited theology / doctrine / ministry rules intact", () => {
    expect(CHRISTIAN_CONTEXT_LENS).toContain("divine activity");
    expect(CHRISTIAN_CONTEXT_LENS).toContain("doctrinal / theological correctness");
    expect(CHRISTIAN_CONTEXT_LENS).toContain("ministry effectiveness");
    expect(CHRISTIAN_CONTEXT_LENS).toContain("congregational adoption");
    expect(CHRISTIAN_CONTEXT_LENS).toContain("specific liturgical setting");
    expect(CHRISTIAN_CONTEXT_LENS).toContain("unmeasured musicology");
  });

  it("preserves the broad-Christian → do not upgrade rule", () => {
    expect(CHRISTIAN_CONTEXT_LENS).toContain("broad CHRISTIAN label");
    // Every previous tradition guardrail survives.
    expect(CHRISTIAN_CONTEXT_LENS).toContain("names WORSHIP");
    expect(CHRISTIAN_CONTEXT_LENS).toContain("names GOSPEL");
    expect(CHRISTIAN_CONTEXT_LENS).toContain("names CCM");
  });
});

// ─── 12. Science regression ───────────────────────────────────────────────

describe("science regression — EPI / Focus / Calm / Motivation / Balance / Mode untouched", () => {
  it("does not read audio features, dimensions, or EPI to open the gate", () => {
    // A high-activation, high-EPI song with no genre metadata must be closed.
    const highActivation = {
      uuid: "hx",
      isrc: "USACT0000001",
      audio: { energy: 0.95, valence: 0.9, danceability: 0.9 },
    };
    expect(extractChristianContext(highActivation)).toBeNull();

    // A reflective, low-arousal song with no genre metadata must be closed.
    const reflective = {
      uuid: "rx",
      isrc: "USREF0000001",
      audio: { energy: 0.15, valence: 0.4, acousticness: 0.9 },
    };
    expect(extractChristianContext(reflective)).toBeNull();
  });

  it("does not open the gate from Soundcharts lyrics-analysis themes or moods", () => {
    // The new enrichment layer can hand Rhodes a lyricsAnalysis carrying
    // themes like "faith" or moods like "worshipful". None of those may
    // open the gate — only trusted GENRE metadata may. This regression
    // pins that: the extractor only reads .genres.
    const semanticButNoGenre = {
      uuid: "sem-1",
      isrc: "USSEM0000001",
      audio: { energy: 0.3, valence: 0.5 },
      // A lyricsAnalysis field on the SONG payload is not something the
      // extractor is even wired to read — but pass it anyway to prove the
      // negative.
      lyricsAnalysis: {
        themes: ["faith", "worship", "prayer"],
        moods: ["worshipful", "reverent"],
      },
    };
    expect(extractChristianContext(semanticButNoGenre)).toBeNull();
  });

  it("Rhodes input flows through unchanged when no Christian context is supplied", () => {
    const input = baseInput();
    const ctx = auditContextFor(input);
    expect(ctx.christianContextPermitted).toBe(false);
    // Nothing about the gate changes what the other context flags say.
    expect(ctx.hasGenre).toBe(false);
    expect(ctx.hasTempo).toBe(false);
  });
});
