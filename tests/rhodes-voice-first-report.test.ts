/**
 * The specification test for Rhodes on the FIRST FREE REPORT.
 *
 * The commercial contract of CHRP Song Intelligence is:
 *
 *   - the creator's FIRST complete Song Intelligence report is FREE
 *     (`grantFreeFirst` writes a real entitlement row on that first scan);
 *   - subsequent reports cost $19 (an entitlement created by a Stripe
 *     one-time charge);
 *   - Creator Intelligence at $149 remains unchanged.
 *
 * Rhodes must reach the creator on the first free report. If he does not,
 * the "one thing I noticed" moment never happens on the song that is
 * supposed to sell them on song #2. This file pins that contract at two
 * levels — the API and the render tree — so a future refactor of either
 * cannot silently break it.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/lib/reports/resolve.server", () => ({
  resolveEntitledReport: vi.fn(),
}));
vi.mock("@/lib/rhodes-voice/signed-url", () => ({
  mintRhodesSignedUrl: vi.fn(),
  rhodesAgentId: () => "vv1j1yrAGF0RdxJOSGIJ",
}));

import { resolveEntitledReport } from "@/lib/reports/resolve.server";
import { mintRhodesSignedUrl } from "@/lib/rhodes-voice/signed-url";
import { POST } from "@/app/api/rhodes/session/route";

const resolveMock = vi.mocked(resolveEntitledReport);
const mintMock = vi.mocked(mintRhodesSignedUrl);

function req(body: unknown): Request {
  return new Request("http://test.local/api/rhodes/session", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function reportPayload() {
  return {
    report_meta: {
      id: "R-1",
      version: "v2",
      scanned_at: "2026-08-01T00:00:00Z",
      scanned_at_display: "August 1, 2026",
    },
    track: { title: "Safe", artist: "The Brevet", isrc: "USTEST00001" },
    epi: {
      score: 62,
      mode: "Flow" as const,
      rank_in_mode: "top quarter",
      rank_overall: "well above the corpus median",
    },
    chrp_scores: [
      { name: "Focus", score: 71, rank: "top quarter", rank_class: "high" as const, anchor: "…" },
      { name: "Calm", score: 68, rank: "top third", rank_class: "high" as const, anchor: "…" },
      { name: "Motivation", score: 55, rank: "middle", rank_class: "mid" as const, anchor: "…" },
      { name: "Balance", score: 62, rank: "middle", rank_class: "mid" as const, anchor: "…" },
    ],
    hpv: [],
    creator: { name: "The Brevet", tracks_scored: 1, tease: "" },
    free_statement: "…",
    signature: "A settled architecture that never asks for attention.",
    rhodes: "Safe holds its posture with quiet confidence.",
    placements: [{ title: "Reflective long-form", body: "…" }],
    buyers: [{ category: "Documentary supervisors", lead: "…", why: "…" }],
    audience: "…",
    throughline: "A settled song for stories that ask their audience to slow down.",
    pitch: { sync: "…", promotion: "…" },
    consider: "…",
    where_this_music_lives: {
      verticals: [],
      confidence: "moderate" as const,
      n_briefs: null,
      sample_brief: null,
    },
  };
}

beforeEach(() => {
  resolveMock.mockReset();
  mintMock.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe("Rhodes on the free first report", () => {
  it("mints a signed URL for a creator whose free-first entitlement was granted", async () => {
    // The route delegates ownership to `resolveEntitledReport`, which reads
    // the entitlement store. A free-first grant writes the SAME row a $19
    // purchase would, so from this route's viewpoint the two are
    // indistinguishable — which is exactly the contract we want to prove.
    resolveMock.mockResolvedValueOnce({
      ok: true,
      source: "generated",
      report: reportPayload(),
    });
    mintMock.mockResolvedValueOnce({
      ok: true,
      signedUrl: "wss://api.elevenlabs.io/free-first/xyz",
      agentId: "vv1j1yrAGF0RdxJOSGIJ",
    });

    const res = await POST(req({ scanId: "scan-first-free" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.signedUrl).toBe("wss://api.elevenlabs.io/free-first/xyz");
    expect(body.overrides.agent.firstMessage).toContain("Safe");
    expect(body.dynamicVariables.song_title).toBe("Safe");
  });

  it("still refuses a caller whose second report has not been purchased", async () => {
    // The other side of the same coin — the entitlement store said no, so
    // the API says no. Rhodes never becomes a $19 bypass; a creator on
    // their second scan sees the same 403 shape the paid JSON route uses.
    resolveMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: "forbidden",
      entitled: false,
    });
    const res = await POST(req({ scanId: "scan-second-report" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
    // Cross-user isolation continues to hold: the endpoint cannot be used
    // to enumerate which scans exist or who owns them.
    expect(body.entitled).toBeUndefined();
    // No signed URL was minted — ElevenLabs was never called.
    expect(mintMock).not.toHaveBeenCalled();
  });

  it("mints a signed URL for a $19-entitled second report — same code path", async () => {
    // A purchased second report is the same shape to this route as a
    // free-first-granted first report: entitlement store said ok. The
    // route does not know or care which one it is; both reach Rhodes.
    resolveMock.mockResolvedValueOnce({
      ok: true,
      source: "generated",
      report: reportPayload(),
    });
    mintMock.mockResolvedValueOnce({
      ok: true,
      signedUrl: "wss://api.elevenlabs.io/paid/xyz",
      agentId: "vv1j1yrAGF0RdxJOSGIJ",
    });

    const res = await POST(req({ scanId: "scan-purchased" }));
    expect(res.status).toBe(200);
  });

  it("$149 Creator Intelligence remains unchanged: entitlements decide, not this route", async () => {
    // A $149 creator has an entitlement covering every scan they analyse.
    // resolveEntitledReport returns ok for every such scan; this route
    // simply mints. The scope-widening decision is elsewhere and is not
    // touched by this integration.
    resolveMock.mockResolvedValueOnce({
      ok: true,
      source: "generated",
      report: reportPayload(),
    });
    mintMock.mockResolvedValueOnce({
      ok: true,
      signedUrl: "wss://api.elevenlabs.io/creator/xyz",
      agentId: "vv1j1yrAGF0RdxJOSGIJ",
    });
    const res = await POST(req({ scanId: "scan-under-creator-intelligence" }));
    expect(res.status).toBe(200);
  });
});

describe("RhodesVoice is inside ReportBody — the render tree contract", () => {
  it("ReportBody renders RhodesVoice, so any entitled render path reaches it", () => {
    // The source-level check that keeps the contract honest across all four
    // entitled render paths at once:
    //   - free first report (claim-granted)
    //   - $19 purchased report
    //   - $149 covered report
    //   - legitimate re-open of any of the above
    // All of them land in the same ReportBody. Prove it once, here.
    const src = readFileSync(
      resolve(__dirname, "..", "src/components/ReportPage.tsx"),
      "utf8",
    );
    expect(src).toMatch(/from ["']@\/components\/report\/RhodesVoice["']/);
    // The RhodesVoice tag must be inside ReportBody, and must receive the
    // scanId — that scanId is what the API uses to re-check entitlement.
    const bodyMatch = src.match(
      /export function ReportBody[\s\S]*?return \([\s\S]*?<\/article>/,
    );
    expect(bodyMatch, "ReportBody body not found").toBeTruthy();
    expect(bodyMatch![0]).toMatch(/<RhodesVoice\s+scanId=\{id\}/);
  });

  it("ScanPreview's unlocked path — reached by both claim-granted and paid — renders ReportBody", () => {
    // The ScanPreview is the surface a first-time visitor actually sees.
    // Its unlocked path renders <ReportBody report={paid} id={scanId} />,
    // and unlocked is reached after either a successful entitlement fetch
    // OR a granted free-first claim. This test is the source-level pin.
    const src = readFileSync(
      resolve(__dirname, "..", "src/components/scan/ScanPreview.tsx"),
      "utf8",
    );
    expect(src).toContain("claimFirstReport");
    // The success branch of the free-first grant re-fetches and lands
    // in status === "unlocked".
    expect(src).toContain(`setStatus("unlocked")`);
    // And unlocked renders ReportBody with the scan id.
    expect(src).toMatch(/<ReportBody\s+report=\{paid\}\s+id=\{scanId\}/);
  });
});
