import { afterEach, describe, expect, it, vi } from "vitest";
import {
  factsToTrackData,
  generatePaidSections,
  type AnalysisFacts,
} from "@/lib/reports/generate.server";

/**
 * The honesty rules around paid intelligence: production never serves a
 * fixture as generated output, and the generator never invents an input.
 */

const FACTS: AnalysisFacts = {
  title: "Redline",
  artist: "Voss Black",
  mode: "Ready",
  epiScore: 91,
  bpm: 152,
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
    const data = factsToTrackData(FACTS);

    expect(data.track).toBe("Redline");
    expect(data.epi_score).toBe(91);
    expect(data.bpm).toBe(152);

    // The engine produces no corpus percentiles, key, popularity, release
    // date, genres, duration or demand signal. None may appear.
    for (const absent of [
      "percentile_corpus",
      "percentile_mode",
      "demand_signal",
      "key",
      "spotify_popularity",
      "release_date",
      "genres",
      "duration_seconds",
    ] as const) {
      expect(data[absent]).toBeUndefined();
    }

    // And they must not survive serialization into the prompt payload.
    const serialized = JSON.parse(JSON.stringify(data));
    expect(Object.keys(serialized)).not.toContain("demand_signal");
    expect(Object.keys(serialized)).not.toContain("percentile_corpus");
  });
});

describe("generation fails closed", () => {
  it("refuses without an API key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const result = await generatePaidSections(FACTS);
    expect(result).toMatchObject({ ok: false, reason: "no_api_key" });
  });

});
