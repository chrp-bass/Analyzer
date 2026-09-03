import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  auditInterpretation,
  auditExternalCopy,
  hasFabrication,
} from "@/lib/rhodes";

/**
 * The commercial payoff, and the discipline that keeps it defensible.
 *
 * Removing the Hold / Develop / Pitch Now verdict also removed the reason a
 * musician pays for this: where the song could work, who might care, and how
 * to explain it. These lock the four outputs back in and lock the two things
 * that must never come back with them — claimed demand and creative judgement.
 */

const contract = readFileSync("src/lib/rhodes/song-intelligence.ts", "utf8");
const report = readFileSync("src/components/ReportPage.tsx", "utf8");
const pdf = readFileSync("src/components/ReportPDF.tsx", "utf8");
const boundary = readFileSync("src/components/scan/ScanPreview.tsx", "utf8");
const landing = readFileSync("src/components/MarketingLanding.tsx", "utf8");
const methodology = readFileSync("src/app/methodology/page.tsx", "utf8");

describe("the four commercial outputs are contracted", () => {
  it("placement map, buyer map, audience map and pitch language", () => {
    for (const field of ['"placements"', '"buyers"', '"audience"', '"pitch"']) {
      expect(contract).toContain(field);
    }
    expect(contract).toMatch(/"family"/);
    expect(contract).toMatch(/"sync"/);
    expect(contract).toMatch(/"promotion"/);
  });

  it("the report renders them, and retires the section they replaced", () => {
    expect(report).toContain("Where this could live");
    expect(report).toContain("Who to put it in front of");
    expect(report).toContain("Who responds, and when");
    expect(report).toContain("PitchSection");
    expect(report).toMatch(/report\.audience \? \(/);
  });

  it("never ships Comparable to a customer, on screen or in the PDF", () => {
    // Comparable named an emotional territory by comparison, which is
    // prohibited customer-facing output. It used to survive as a fallback
    // for reports persisted before `audience` existed, and the PDF rendered
    // its heading UNCONDITIONALLY — so a report without the field printed a
    // bare "05 · Comparable context" over nothing. Both are gone. A report
    // with no audience map omits the movement rather than substituting a
    // comparison for it.
    for (const source of [report, pdf]) {
      expect(source).not.toMatch(/title="Comparable context"/);
      expect(source).not.toMatch(/Comparable context<\/Text>/);
      expect(source).not.toMatch(/\{report\.comparable\}/);
    }
    // Nor is it promised anywhere a visitor is told what they get.
    for (const source of [boundary, landing, methodology]) {
      expect(source).not.toContain("Comparable context");
    }
  });

  it("derives from the song rather than running a fixed taxonomy", () => {
    expect(contract).toMatch(/do not run down a standard list/i);
    expect(contract).toMatch(/Choose from the profile, not from a standard list/i);
  });

  it("forbids demographics in the audience map", () => {
    expect(contract).toMatch(/NOT demographics/);
    expect(contract).toMatch(/never an age range, gender, location or fanbase/);
  });

  it("permits analogy and forbids demand, explicitly", () => {
    expect(contract).toContain("ANALOGY IS ALLOWED. DEMAND IS NOT.");
    expect(contract).toMatch(/Never a company, agency,\s+show, director or person/);
  });

  it("keeps commercial application separate from creative judgement", () => {
    expect(contract).toContain("GUIDANCE, NOT PROPHECY, AND NEVER CREATIVE JUDGEMENT");
    expect(contract).toMatch(/Nothing about rewriting, developing, finishing, holding, releasing/);
  });

  it("states the template failure as a failure", () => {
    expect(contract).toMatch(/you have written a template rather than read a song/);
  });
});

describe("claimed demand is a fabrication", () => {
  for (const text of [
    "Subaru needs this song for their next campaign.",
    "Music supervisors are looking for this.",
    "This will land a sync placement.",
    "There is demand for this sound right now.",
  ]) {
    it(`catches: ${text.slice(0, 42)}`, () => {
      expect(hasFabrication(auditInterpretation(text))).toBe(true);
    });
  }
});

describe("commercial prediction is a fabrication", () => {
  for (const text of [
    "Strong hit potential here.",
    "Real revenue potential.",
    "The track is commercially ready.",
    "High placement probability.",
  ]) {
    it(`catches: ${text.slice(0, 42)}`, () => {
      expect(hasFabrication(auditInterpretation(text))).toBe(true);
    });
  }
});

describe("creative direction is a fabrication — the verdict never returns", () => {
  for (const text of [
    "Rewrite the chorus.",
    "Increase the tempo.",
    "Develop the bridge.",
    "Hold this song.",
    "Do not pitch it yet.",
    "Pitch it now.",
  ]) {
    it(`catches: ${text.slice(0, 42)}`, () => {
      expect(hasFabrication(auditInterpretation(text))).toBe(true);
    });
  }
});

describe("analogy and guidance stay clean", () => {
  for (const text of [
    "Think Subaru-style adventure storytelling.",
    "Emotionally adjacent to the kind of open-road storytelling common in automotive advertising.",
    "The stronger commercial territory may be preparation and entrance moments.",
    "If I were positioning this for sync, I would lead with motion rather than genre.",
    "Could fit the emotional territory often used in performance-oriented athletic campaigns.",
  ]) {
    it(`permits: ${text.slice(0, 46)}`, () => {
      expect(hasFabrication(auditInterpretation(text))).toBe(false);
    });
  }
});

describe("the dead verdict concepts have not returned", () => {
  it("are still refused outright, and are never a returnable field", () => {
    // They appear in the contract only as prohibitions, which is correct.
    expect(contract).toContain("CHRP ISSUES NO VERDICT");
    expect(contract).toMatch(/no readiness call/i);
    // What matters is that no output field asks for one.
    const outputBlock = contract.slice(contract.indexOf("WHAT TO RETURN"));
    expect(outputBlock).not.toMatch(/"verdict"|"readiness"|"grade"|"score_out_of"/);
  });
});

describe("external pitch copy carries no internal measurement", () => {
  it("the rule is stated in the contract", () => {
    expect(contract).toContain("THE PITCH-LANGUAGE RULE");
    expect(contract).toMatch(/not the words Focus, Calm, Motivation,\s+Balance or Mode/);
  });

  it("catches a dimension label in copy the creator forwards", () => {
    const v = auditExternalCopy(
      "With Motivation at 74 and Focus at 33, this is an activation cue.",
    );
    expect(v.map((x) => x.rule)).toContain("internal-label-in-external-copy");
    expect(v.map((x) => x.rule)).toContain("internal-score-in-external-copy");
  });

  it("catches EPI, arousal and valence too", () => {
    for (const w of ["EPI", "arousal", "valence", "Mode"]) {
      expect(
        auditExternalCopy(`This track sits high on ${w}.`).length,
      ).toBeGreaterThan(0);
    }
  });

  it("passes copy written as function rather than measurement", () => {
    expect(
      auditExternalCopy(
        "A sharp activation cue built for entrances, decisive movement and high-energy transitions.",
      ),
    ).toEqual([]);
  });

  it("applies to the pitch fields only, not to the reading", () => {
    // The same words are correct inside the interpretation.
    expect(hasFabrication(auditInterpretation("Motivation leads this profile."))).toBe(false);
  });
});

describe("naming a buyer category is not claiming demand", () => {
  it("permits the categories the Buyer Map is built from", () => {
    for (const t of [
      "Music supervisors working in reflective drama.",
      "Playlist programmers in the focus and study space.",
      "Sync agents and A&R contacts at independent publishers.",
      "Trailer houses and sports content producers.",
    ]) {
      expect(hasFabrication(auditInterpretation(t))).toBe(false);
    }
  });

  it("still catches the same categories asserting demand", () => {
    for (const t of [
      "Music supervisors are looking for this.",
      "Supervisors want this sound right now.",
      "Strong playlist interest for this track.",
      "Brands are seeking exactly this.",
    ]) {
      expect(hasFabrication(auditInterpretation(t))).toBe(true);
    }
  });
});
