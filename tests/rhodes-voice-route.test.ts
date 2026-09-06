/**
 * Route-level tests for /api/rhodes/session.
 *
 * These pin the security boundary rather than the happy path:
 *
 *   - A caller without entitlement gets the same opaque 403 the paid JSON
 *     route returns. The signed URL is never minted for them.
 *   - The signed URL is only minted after `resolveEntitledReport` says yes.
 *   - The ElevenLabs API key never appears in the response body.
 *   - A missing body / bad JSON fails cleanly with 400.
 *
 * We mock the entitlement resolver and the signed-URL helper — the point is
 * the route's decision graph, not the internals of either dependency.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock BEFORE the route imports its dependencies.
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

function goodReport() {
  return {
    ok: true as const,
    source: "generated" as const,
    report: {
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
      creator: { name: "The Brevet", tracks_scored: 4, tease: "" },
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
    },
  };
}

beforeEach(() => {
  resolveMock.mockReset();
  mintMock.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe("POST /api/rhodes/session", () => {
  it("400s an invalid body — before touching entitlement or ElevenLabs", async () => {
    const res = await POST(req("not-json{"));
    expect(res.status).toBe(400);
    expect(resolveMock).not.toHaveBeenCalled();
    expect(mintMock).not.toHaveBeenCalled();
  });

  it("400s a missing scanId", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(resolveMock).not.toHaveBeenCalled();
    expect(mintMock).not.toHaveBeenCalled();
  });

  it("refuses a caller without an entitlement — signed URL is never minted", async () => {
    resolveMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: "forbidden",
      entitled: false,
    });
    const res = await POST(req({ scanId: "scan-someone-else" }));
    expect(res.status).toBe(403);
    // The 403 must not leak whether the scan exists at all — same shape as
    // the paid JSON route's opaque 403.
    const body = await res.json();
    expect(body.error).toBe("forbidden");
    expect(body.entitled).toBeUndefined();
    // Critically, ElevenLabs is never called for an unauthorised caller.
    expect(mintMock).not.toHaveBeenCalled();
  });

  it("mints a signed URL only after entitlement passes", async () => {
    resolveMock.mockResolvedValueOnce(goodReport());
    mintMock.mockResolvedValueOnce({
      ok: true,
      signedUrl: "wss://api.elevenlabs.io/token/xyz",
      agentId: "vv1j1yrAGF0RdxJOSGIJ",
    });
    const res = await POST(req({ scanId: "scan-mine" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.signedUrl).toBe("wss://api.elevenlabs.io/token/xyz");
    expect(body.agentId).toBe("vv1j1yrAGF0RdxJOSGIJ");
    // Governed context reached the payload.
    expect(body.dynamicVariables.song_title).toBe("Safe");
    expect(body.dynamicVariables.epi_score).toBe("62");
    // First-message override carries Rhodes's personalised read.
    expect(body.overrides.agent.firstMessage).toContain("Safe");
    // The response is scoped private.
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("degrades voice gracefully when ElevenLabs is unavailable", async () => {
    resolveMock.mockResolvedValueOnce(goodReport());
    mintMock.mockResolvedValueOnce({
      ok: false,
      reason: "not_configured",
      detail: "ELEVENLABS_API_KEY is not configured",
    });
    // Silence the expected error log for this failure branch.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(req({ scanId: "scan-mine" }));
    // 503 — voice unavailable — the report itself keeps working, and the
    // client falls back to the written intelligence.
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("voice_unavailable");
    spy.mockRestore();
  });

  it("never leaks the ELEVENLABS_API_KEY into the response body", async () => {
    const secret = "sk_test_do_not_leak_me_ever";
    process.env.ELEVENLABS_API_KEY = secret;
    resolveMock.mockResolvedValueOnce(goodReport());
    mintMock.mockResolvedValueOnce({
      ok: true,
      signedUrl: "wss://api.elevenlabs.io/token/xyz",
      agentId: "vv1j1yrAGF0RdxJOSGIJ",
    });
    const res = await POST(req({ scanId: "scan-mine" }));
    const raw = await res.text();
    expect(raw).not.toContain(secret);
    delete process.env.ELEVENLABS_API_KEY;
  });
});
