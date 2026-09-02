import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { auditInterpretation, hasFabrication } from "@/lib/rhodes";

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
    // "Comparable context" survives only as a fallback for persisted reports.
    expect(report).toMatch(/report\.audience \? \(/);
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
