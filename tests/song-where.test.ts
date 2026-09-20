import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { profileFromAnalysis } from "../src/lib/song-where/profile.server";
import { normalizeTarget } from "../src/lib/song-where/normalize.server";
import { matchSong } from "../src/lib/song-where/match.server";
import { rankMatches } from "../src/lib/song-where/rank.server";
import { qualityStatus } from "../src/lib/song-where/quality.server";
import { matchesForAnalysis, safeSubmissionUrl } from "../src/lib/song-where/store.supabase";
import { GET as getSongWhere } from "../src/app/api/song-where/[scanId]/route";
import { POST as runJob } from "../src/app/api/song-where/jobs/run/route";

const root = join(__dirname, "..");

describe("Song Where isolation", () => {
  it("keeps protected callgraphs free of Song Where imports", () => {
    const protectedPaths = [
      "src/lib/engine", "src/lib/rhodes", "src/lib/rhodes-voice",
      "src/lib/reports", "src/lib/commerce", "src/lib/auth",
      "src/app/api/checkout", "src/app/api/stripe", "src/app/api/scan",
    ];
    const visit = (path: string): string[] => readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? visit(join(path, entry.name)) : [join(path, entry.name)]);
    for (const path of protectedPaths) for (const file of visit(join(root, path))) {
      if (!/\.[jt]sx?$/.test(file)) continue;
      expect(readFileSync(file, "utf8"), file).not.toMatch(/(?:from|import)\s*["'][^"']*song-where/);
    }
  });

  it("guards every server module and keeps DTO private-field-free", () => {
    const visit = (path: string): string[] => readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? visit(join(path, entry.name)) : [join(path, entry.name)]);
    for (const file of visit(join(root, "src/lib/song-where"))) {
      if (!file.endsWith(".ts") || file.endsWith("dto.ts")) continue;
      expect(readFileSync(file, "utf8").startsWith('import "server-only";'), file).toBe(true);
    }
    const dto = readFileSync(join(root, "src/lib/song-where/dto.ts"), "utf8");
    expect(dto).not.toMatch(/match_score|submission_url|weights|reasons|creator_id/);
  });

  it("serializes only approved match metadata and never logs backend errors", async () => {
    const row = {
      id: "match-id", match_score: 91.357, fit_band: "strong",
      opportunities: { title: "Open brief", deadline: "2027-01-01T00:00:00Z", status: "open",
        submission_url: "https://example.org/private-submit-token",
        route_verified_at: new Date().toISOString(), provenance_url: "https://example.org/brief",
        applicant_count: null, competition_level: null, eligibility_requirements: {},
        opportunity_sources: { name: "Approved source", trust_level: "verified", active: true,
          terms_status: "permitted", robots_status: "allow", auth_scope: "none" } },
    };
    const query = {
      select: () => query, eq: () => query, limit: async () => ({ data: [row], error: null }),
    };
    const db = { from: () => query };
    const matches = await matchesForAnalysis(db as never, "analysis-id");
    expect(matches).toHaveLength(1);
    expect(Object.keys(matches[0]).sort()).toEqual(
      ["matchId", "title", "sourceName", "trust", "fit", "deadline", "goHref"].sort());
    expect(JSON.stringify(matches)).not.toMatch(/91\.357|private-submit-token|match_score|submission_url|weights|reasons|formula|threshold/i);

    const visit = (path: string): string[] => readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? visit(join(path, entry.name)) : [join(path, entry.name)]);
    for (const file of visit(join(root, "src/app/api/song-where"))) {
      if (!file.endsWith(".ts")) continue;
      expect(readFileSync(file, "utf8"), file).not.toMatch(/console\.(?:log|warn|error)\([^\n]*,\s*(?:error|profile|target|score|match)/);
    }
  });

  it("has a server-only default-off flag and no client-exposed flag", () => {
    const config = readFileSync(join(root, "src/lib/song-where/config.server.ts"), "utf8");
    expect(config).toContain('process.env.SONG_WHERE_ENABLED === "true"');
    expect(config).not.toContain("NEXT_PUBLIC_");
  });

  it("short-circuits reads and disables authenticated alerts when the feature is off", async () => {
    const previous = process.env.SONG_WHERE_ENABLED;
    const priorSecret = process.env.SONG_WHERE_JOB_SECRET;
    delete process.env.SONG_WHERE_ENABLED;
    process.env.SONG_WHERE_JOB_SECRET = "x".repeat(32);
    try {
      expect((await getSongWhere(new Request("https://scan.chrp.ai/api/song-where/scan"),
        { params: { scanId: "scan" } })).status).toBe(404);
      expect((await runJob(new Request("https://scan.chrp.ai/api/song-where/jobs/run?stage=alert",
        { method: "POST", headers: { Authorization: `Bearer ${"x".repeat(32)}` } }))).status).toBe(200);
    } finally {
      if (previous === undefined) delete process.env.SONG_WHERE_ENABLED;
      else process.env.SONG_WHERE_ENABLED = previous;
      if (priorSecret === undefined) delete process.env.SONG_WHERE_JOB_SECRET;
      else process.env.SONG_WHERE_JOB_SECRET = priorSecret;
    }
  });

  it("keeps the report insertion after interpretation and before ownership", () => {
    const report = readFileSync(join(root, "src/components/ReportPage.tsx"), "utf8");
    expect(report.indexOf("report.consider")).toBeLessThan(report.indexOf("<SongWhere"));
    expect(report.indexOf("<SongWhere")).toBeLessThan(report.indexOf("<ReportOwnership"));
  });
});

describe("Song Where matching", () => {
  const profile = profileFromAnalysis({
    id: "analysis", status: "complete", mode: "Ready", epi_score: 78,
    scores: { focus: 82, calm: 47, motivation: 89, balance: 66 },
    circumplex: { valence: 0.78, arousal: 0.84 },
  });

  it("uses only deterministic fields and rejects unknown briefs", () => {
    expect(profile).not.toBeNull();
    expect(normalizeTarget({ description: "energetic" })).toBeNull();
    expect(normalizeTarget({ modes: ["Ready"], arousal: { min: 0.7, max: 1 } }))
      .toEqual({ modes: ["Ready"], arousal: { min: 0.7, max: 1 } });
    expect(matchSong(profile!, { modes: ["Ready"], arousal: { min: 0.7, max: 1 } })?.band)
      .toBe("strong");
    expect(matchSong(profile!, { modes: ["Ready"] })?.band).toBe("moderate");
    expect(matchSong(profile!, { epiFloor: 90, modes: ["Ready"] })).toBeNull();
  });

  it("ranks fit and source trust with private fit strength", () => {
    const candidates = [
      { fit: "strong" as const, trust: "scraped" as const, score: 90, deadline: null },
      { fit: "strong" as const, trust: "verified" as const, score: 80, deadline: null },
      { fit: "moderate" as const, trust: "verified" as const, score: 98, deadline: null },
    ];
    expect(rankMatches(candidates)).toEqual([candidates[1], candidates[0], candidates[2]]);
  });

  it("rejects every non-live quality status and orders fresh, less saturated peers", () => {
    const now = new Date("2026-09-20T12:00:00Z");
    const base = { status: "open", deadline: "2026-09-27T12:00:00Z",
      submission_url: "https://example.org/apply", route_verified_at: now.toISOString(),
      provenance_url: "https://example.org/brief", applicant_count: 3,
      competition_level: "low", eligibility_requirements: {},
      opportunity_sources: { active: true, trust_level: "verified", terms_status: "permitted",
        robots_status: "allow", auth_scope: "none" } };
    expect(qualityStatus(base, "strong", now)).toBe("LIVE_VERIFIED");
    expect(qualityStatus({ ...base, opportunity_sources: { ...base.opportunity_sources,
      terms_status: "public_pointer" } }, "strong", now)).toBe("LIVE_VERIFIED");
    expect(qualityStatus({ ...base, deadline: "2026-09-19T12:00:00Z" }, "strong", now)).toBe("EXPIRED");
    expect(qualityStatus({ ...base, deadline: null }, "strong", now)).toBe("STALE");
    expect(qualityStatus({ ...base, route_verified_at: null }, "strong", now)).toBe("NO_SUBMISSION_PATH");
    expect(qualityStatus({ ...base, eligibility_requirements: { geography: "US" } }, "strong", now))
      .toBe("ELIGIBILITY_MISMATCH");
    expect(qualityStatus({ ...base, opportunity_sources: { ...base.opportunity_sources,
      terms_status: "unverified" } }, "strong", now)).toBe("SOURCE_UNCERTAIN");
    expect(qualityStatus({ ...base, applicant_count: 120 }, "strong", now)).toBe("LIVE_HIGH_COMPETITION");
    const fresh = { fit: "strong" as const, trust: "verified" as const, score: 85,
      deadline: "2026-09-27T12:00:00Z", applicantCount: 4 };
    const stale = { ...fresh, deadline: "2026-09-21T12:00:00Z" };
    const saturated = { ...fresh, applicantCount: 75 };
    expect(rankMatches([stale, saturated, fresh], now)).toEqual([fresh, saturated, stale]);
  });

  it("rejects dangerous submission URLs", () => {
    expect(safeSubmissionUrl("javascript:alert(1)")).toBeNull();
    expect(safeSubmissionUrl("https://user:pass@example.com/")).toBeNull();
    expect(safeSubmissionUrl("https://example.com/submit")?.hostname).toBe("example.com");
  });
});
