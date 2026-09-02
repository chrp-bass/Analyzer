import { afterEach, describe, expect, it, vi } from "vitest";
import {
  factsToRhodesInput,
  generatePaidSections,
  type AnalysisFacts,
} from "@/lib/reports/generate.server";
import { buildUserMessage, auditContextFor } from "@/lib/rhodes";

/**
 * The honesty rules around paid intelligence: production never serves a
 * fixture as generated output, and the generator never invents an input.
 */

const FACTS: AnalysisFacts = {
  title: "Redline",
  artist: "Voss Black",
  mode: "Ready",
  epiScore: 91,
  dimensions: { focus: 84, calm: 21, motivation: 96, balance: 52 },
  valence: 0.62,
  arousal: 0.94,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("fixtures in production", () => {
  it("are refused when NODE_ENV is production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CHRP_ALLOW_FIXTURE_REPORTS", "");
    vi.resetModules();

    const mod = await import("@/lib/fixtures/report.server");
    expect(mod.fixtureReportsPermitted()).toBe(false);
    // Fail closed: no paid payload is assembled at all.
    expect(mod.getFullReport("redline")).toBeNull();
  });

  it("are permitted only behind the explicit demo escape hatch", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CHRP_ALLOW_FIXTURE_REPORTS", "true");
    vi.resetModules();

    const mod = await import("@/lib/fixtures/report.server");
    expect(mod.fixtureReportsPermitted()).toBe(true);
  });

  it("still yields generated content when real sections are supplied", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();

    const mod = await import("@/lib/fixtures/report.server");
    const { PAID_SECTIONS } = await import("@/lib/fixtures/tracks.paid");
    const assembled = mod.getFullReport("redline", PAID_SECTIONS.redline);
    expect(assembled?.source).toBe("generated");
  });
});

describe("paid prose is server-only", () => {
  it("keeps the paid fixture module behind the server-only guard", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/lib/fixtures/tracks.paid.ts", "utf8");

    // This import is what makes referencing paid prose from a client
    // component a BUILD error rather than a silent bundle leak. `next build`
    // enforces it; this asserts nobody quietly removes it.
    expect(source).toMatch(/^import\s+["']server-only["'];/m);
  });

  it("keeps the report assembler server-only too", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/lib/fixtures/report.server.ts", "utf8");
    expect(source).toMatch(/^import\s+["']server-only["'];/m);
  });
});

describe("generator inputs", () => {
  it("omits facts upstream did not supply rather than inventing them", () => {
    const input = factsToRhodesInput(FACTS);

    expect(input.identity.title).toBe("Redline");
    expect(input.engine.epiScore).toBe(91);
    expect(input.engine.dimensions.motivation).toBe(96);

    // The engine produces no tempo, key, genre, corpus percentile or
    // comparable artists. With none supplied there is no context block AT
    // ALL — absence is what the evidence governor reads to lock its rules.
    expect(input.context).toBeUndefined();
    expect(input.userTruth).toBeUndefined();

    const ctx = auditContextFor(input);
    expect(ctx.hasTempo).toBe(false);
    expect(ctx.hasKey).toBe(false);
    expect(ctx.hasGenre).toBe(false);
    expect(ctx.hasComparableArtists).toBe(false);
    expect(ctx.hasCorpusRanking).toBe(false);
    // The engine supplies neither behavioural events nor temporal structure.
    expect(ctx.hasObservedBehaviour).toBe(false);
    expect(ctx.hasStructure).toBe(false);
  });

  it("tells the model, in words, that nothing else was supplied", () => {
    const message = buildUserMessage(factsToRhodesInput(FACTS));
    expect(message).toContain("AVAILABLE CONTEXT — none");
    expect(message).toMatch(/No tempo, key, genre/);
    // Identity ownership is stated on the same line as the identity itself.
    expect(message).toContain("CANONICAL IDENTITY — owned by Spotify");
  });

  it("passes only supplied context through, never a stand-in", () => {
    const input = factsToRhodesInput({ ...FACTS, bpm: 152 });
    expect(input.context).toEqual({ bpm: 152 });
    expect(auditContextFor(input).hasTempo).toBe(true);
    expect(auditContextFor(input).hasKey).toBe(false);
  });
});

describe("generation fails closed", () => {
  it("refuses without an API key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const result = await generatePaidSections(FACTS);
    expect(result).toMatchObject({ ok: false, reason: "no_api_key" });
  });

  it("refuses when the analysis carries no dimension profile", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key-not-used");
    // Rhodes reasons from relationships. With no dimensions there are no
    // relationships — only a mode label — so there is nothing honest to
    // interpret and no request is made.
    const result = await generatePaidSections({ ...FACTS, dimensions: null });
    expect(result).toMatchObject({ ok: false, reason: "generation_failed" });
  });
});
