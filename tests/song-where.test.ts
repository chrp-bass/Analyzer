import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { profileFromAnalysis } from "../src/lib/song-where/profile.server";
import { normalizeTarget } from "../src/lib/song-where/normalize.server";
import { matchSong } from "../src/lib/song-where/match.server";
import { rankMatches } from "../src/lib/song-where/rank.server";
import { safeSubmissionUrl } from "../src/lib/song-where/store.supabase";
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

  it("has a server-only default-off flag and no client-exposed flag", () => {
    const config = readFileSync(join(root, "src/lib/song-where/config.server.ts"), "utf8");
    expect(config).toContain('process.env.SONG_WHERE_ENABLED === "true"');
    expect(config).not.toContain("NEXT_PUBLIC_");
  });

  it("short-circuits reads and jobs when the feature is off", async () => {
    const previous = process.env.SONG_WHERE_ENABLED;
    delete process.env.SONG_WHERE_ENABLED;
    try {
      expect((await getSongWhere(new Request("https://scan.chrp.ai/api/song-where/scan"),
        { params: { scanId: "scan" } })).status).toBe(404);
      expect((await runJob(new Request("https://scan.chrp.ai/api/song-where/jobs/run?stage=match",
        { method: "POST" }))).status).toBe(404);
    } finally {
      if (previous === undefined) delete process.env.SONG_WHERE_ENABLED;
      else process.env.SONG_WHERE_ENABLED = previous;
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

  it("ranks fit first, then source trust, then score", () => {
    const candidates = [
      { fit: "strong" as const, trust: "scraped" as const, score: 99, deadline: null },
      { fit: "strong" as const, trust: "verified" as const, score: 80, deadline: null },
      { fit: "moderate" as const, trust: "verified" as const, score: 98, deadline: null },
    ];
    expect(rankMatches(candidates)).toEqual([candidates[1], candidates[0], candidates[2]]);
  });

  it("rejects dangerous submission URLs", () => {
    expect(safeSubmissionUrl("javascript:alert(1)")).toBeNull();
    expect(safeSubmissionUrl("https://user:pass@example.com/")).toBeNull();
    expect(safeSubmissionUrl("https://example.com/submit")?.hostname).toBe("example.com");
  });
});
