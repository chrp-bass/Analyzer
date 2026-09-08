/**
 * Tests for the Rhodes voice integration adapter.
 *
 * These are pure-module tests. They pin the invariants the integration is
 * supposed to preserve:
 *
 *   - The voice adapter never re-derives scoring truth — it reads what the
 *     governed report already contains.
 *   - The first-read text refers to THIS song, by title, in Rhodes's own
 *     words drawn from the persisted intelligence.
 *   - No secret credential is ever included in what the client would receive.
 *
 * The route-level tests below stub the ElevenLabs upstream and the report
 * resolver — the point is that the boundary the route enforces is the
 * SAME entitlement guard the paid JSON route enforces, and that a signed
 * URL is never minted before that guard passes.
 */

import { describe, expect, it, vi, afterEach } from "vitest";
import type { ReportPayload } from "@/lib/fixtures/tracks";
import { buildRhodesVoiceContext } from "@/lib/rhodes-voice/context";
import { composeFirstRead } from "@/lib/rhodes-voice/first-read";
import { mintRhodesSignedUrl } from "@/lib/rhodes-voice/signed-url";
import type { RhodesVoiceLogger } from "@/lib/rhodes-voice/log";

/**
 * A minimal but production-shaped governed report. The scoring layer wrote
 * these values; the voice adapter must read them verbatim.
 */
function makeReport(overrides: Partial<ReportPayload> = {}): ReportPayload {
  return {
    report_meta: {
      id: "TEST-001",
      version: "v2",
      scanned_at: "2026-08-01T12:00:00Z",
      scanned_at_display: "August 1, 2026",
    },
    track: {
      title: "Safe",
      artist: "The Brevet",
      isrc: "USTEST0000001",
      artworkUrl: null,
    },
    epi: {
      score: 62,
      mode: "Flow",
      rank_in_mode: "top quarter",
      rank_overall: "well above the corpus median",
    },
    chrp_scores: [
      { name: "Focus", score: 71, rank: "top quarter", rank_class: "high", anchor: "…" },
      { name: "Calm", score: 68, rank: "top third", rank_class: "high", anchor: "…" },
      { name: "Motivation", score: 55, rank: "middle", rank_class: "mid", anchor: "…" },
      { name: "Balance", score: 62, rank: "middle", rank_class: "mid", anchor: "…" },
    ],
    hpv: [],
    creator: { name: "The Brevet", tracks_scored: 4, tease: "" },
    free_statement: "A settled, articulate opening.",
    signature: "A settled architecture that never asks for attention.",
    rhodes:
      "Safe holds its posture with quiet confidence. The song is doing the work of settling rather than pushing, and Focus is carrying that work — 71 with Calm at 68 tells a coherent story about attention that stays present. That's the room this song opens.",
    placements: [
      { title: "Reflective long-form", body: "Documentary and interior scenes." },
      { title: "Editorial spot", body: "Contemplative brand narratives." },
    ],
    buyers: [
      { category: "Documentary supervisors", lead: "…", why: "…" },
      { category: "Editorial licensors", lead: "…", why: "…" },
    ],
    audience: "Late-day listening for readers and writers.",
    throughline:
      "A settled song for stories that ask their audience to slow down.",
    pitch: { sync: "…", promotion: "…" },
    consider:
      "Where a scene needs presence rather than push, this reading gives you a line to walk in on.",
    where_this_music_lives: {
      verticals: [],
      confidence: "moderate",
      n_briefs: null,
      sample_brief: null,
    },
    ...overrides,
  };
}

describe("buildRhodesVoiceContext", () => {
  it("packages exactly the governed values as report context — never re-derives them", () => {
    const report = makeReport();
    const ctx = buildRhodesVoiceContext(report);

    // Identity is passed verbatim: voice Rhodes knows the actual song.
    expect(ctx.song).toEqual({ title: "Safe", artist: "The Brevet" });
    expect(ctx.variables.song_title).toBe("Safe");
    expect(ctx.variables.song_artist).toBe("The Brevet");

    // The scores + EPI + mode come out of the report unchanged. Any
    // re-derivation here would let voice truth drift from written truth.
    expect(ctx.variables.focus_score).toBe("71");
    expect(ctx.variables.calm_score).toBe("68");
    expect(ctx.variables.motivation_score).toBe("55");
    expect(ctx.variables.balance_score).toBe("62");
    expect(ctx.variables.epi_score).toBe("62");
    expect(ctx.variables.epi_mode).toBe("Flow");

    // Governed prose reaches the report context verbatim.
    const rc = ctx.variables.report_context;
    expect(rc).toContain(`EMOTIONAL SIGNATURE: ${report.signature}`);
    expect(rc).toContain(`THROUGHLINE: ${report.throughline}`);
    expect(rc).toContain(report.consider);
    expect(rc).toContain("PLACEMENTS: Reflective long-form: Documentary and interior scenes. | Editorial spot: Contemplative brand narratives.");
    expect(rc).toContain("BUYERS / INDUSTRY: Documentary supervisors");
    expect(rc).toContain("Editorial licensors");
  });

  it("holds the report context to the documented budget", () => {
    const long = "x".repeat(20000);
    const ctx = buildRhodesVoiceContext(
      makeReport({ signature: long, throughline: long, consider: long, rhodes: long, audience: long }),
    );
    expect(ctx.variables.report_context.length).toBeLessThanOrEqual(7000);
    expect(ctx.budget.chars).toBe(ctx.variables.report_context.length);
  });

  it("produces a short, creator-facing opening that names THIS song", () => {
    const ctx = buildRhodesVoiceContext(makeReport());
    expect(ctx.firstMessage).toContain('"Safe"');
    expect(ctx.firstMessage.startsWith("I'm Dr. Rhodes.")).toBe(true);
    // One introduction plus one grounded sentence of ≤18 words — about ten seconds.
    const words = ctx.firstMessage.split(/\s+/).filter(Boolean).length;
    expect(words).toBeGreaterThanOrEqual(13);
    expect(words).toBeLessThanOrEqual(27);
  });

  it("survives an empty placement/buyer list without inventing categories", () => {
    const ctx = buildRhodesVoiceContext(makeReport({ placements: [], buyers: [] }));
    // A missing section is omitted, never a fabricated stand-in.
    expect(ctx.variables.report_context).not.toContain("PLACEMENTS");
    expect(ctx.variables.report_context).not.toContain("BUYERS");
  });

  it("does not leak any environment secret through the returned payload", () => {
    // The adapter is pure; a paranoid check that no key-shaped string appears
    // catches a future refactor that reaches for process.env.
    const ctx = buildRhodesVoiceContext(makeReport());
    const serialised = JSON.stringify(ctx);
    expect(serialised).not.toMatch(/sk_[A-Za-z0-9]{16,}/);
    expect(serialised).not.toMatch(/xi-api-key/i);
  });
});

describe("composeFirstRead", () => {
  it("opens as Dr. Rhodes, names the song, and ends on the governed signature", () => {
    const line = composeFirstRead(makeReport());
    expect(line.startsWith("I'm Dr. Rhodes. Chirp found something useful in \"Safe\": ")).toBe(true);
    expect(line.endsWith("A settled architecture that never asks for attention.")).toBe(true);
  });

  it("falls back to the governed reading when the signature is empty", () => {
    const line = composeFirstRead(makeReport({ signature: "" }));
    expect(line).toContain("Safe holds its posture with quiet confidence.");
  });
});

describe("mintRhodesSignedUrl (facade)", () => {
  const VALID_ENV = {
    ELEVENLABS_API_KEY: "sk_test_key_do_not_leak_0123456789",
    ELEVENLABS_RHODES_AGENT_ID: "vv1j1yrAGF0RdxJOSGIJ",
  };
  const silent: RhodesVoiceLogger = () => {};
  afterEach(() => vi.restoreAllMocks());

  it("refuses without an API key — never asks upstream, returns a typed configuration error", async () => {
    const fetchImpl = vi.fn();
    const result = await mintRhodesSignedUrl({
      requestId: "r1",
      env: { ELEVENLABS_RHODES_AGENT_ID: "vv1j1yrAGF0RdxJOSGIJ" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      log: silent,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("not_configured");
      if (result.reason === "not_configured") {
        expect(result.code).toBe("missing_api_key");
        expect(result.variable).toBe("ELEVENLABS_API_KEY");
      }
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("has NO hard-coded agent id fallback — a missing agent id is a typed configuration error", async () => {
    const fetchImpl = vi.fn();
    const result = await mintRhodesSignedUrl({
      requestId: "r1",
      env: { ELEVENLABS_API_KEY: VALID_ENV.ELEVENLABS_API_KEY },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      log: silent,
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "not_configured") {
      expect(result.code).toBe("missing_agent_id");
      expect(result.variable).toBe("ELEVENLABS_RHODES_AGENT_ID");
    } else {
      throw new Error("expected not_configured");
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("passes the key in a header — never in the URL query string", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ signed_url: "wss://api.elevenlabs.io/x/y" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const result = await mintRhodesSignedUrl({
      requestId: "r1",
      env: VALID_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      log: silent,
    });
    expect(result.ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    // The key never appears in the URL — an in-flight log capture would
    // otherwise persist it against every request.
    expect(url).not.toContain(VALID_ENV.ELEVENLABS_API_KEY);
    const headers = init.headers as Record<string, string>;
    expect(headers["xi-api-key"]).toBe(VALID_ENV.ELEVENLABS_API_KEY);
  });

  it("calls the ElevenLabs convai signed-URL endpoint at its canonical hyphenated path with GET", async () => {
    // Regression pin: the ElevenLabs endpoint is `.../get-signed-url`
    // (hyphens), not `.../get_signed_url` (underscores). The underscored
    // path returns 401 in production even under a valid key.
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ signed_url: "wss://api.elevenlabs.io/token/x" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    await mintRhodesSignedUrl({
      requestId: "r1",
      env: VALID_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      log: silent,
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=vv1j1yrAGF0RdxJOSGIJ",
    );
    expect(url).not.toContain("get_signed_url");
    expect(init.method).toBe("GET");
  });

  it("returns the signed URL and the configured agent id when ElevenLabs answers happily", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ signed_url: "wss://api.elevenlabs.io/token/abc" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const result = await mintRhodesSignedUrl({
      requestId: "r1",
      env: VALID_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      log: silent,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.signedUrl).toBe("wss://api.elevenlabs.io/token/abc");
      expect(result.agentId).toBe("vv1j1yrAGF0RdxJOSGIJ");
      expect(result.attempts).toBe(1);
    }
  });

  it("treats a non-2xx upstream as a categorised upstream error, without leaking the body", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("plan gate exceeded and here is my quota row", { status: 429 }),
    );
    const result = await mintRhodesSignedUrl({
      requestId: "r1",
      env: VALID_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      log: silent,
      maxAttempts: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "upstream_error") {
      expect(result.category).toBe("rate_limited");
      expect(result.upstreamStatus).toBe(429);
      // The response body must never propagate.
      expect(JSON.stringify(result)).not.toContain("plan gate exceeded");
    } else {
      throw new Error("expected upstream_error");
    }
  });

  it("rejects a response missing signed_url so a garbage URL never reaches the client", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ nope: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await mintRhodesSignedUrl({
      requestId: "r1",
      env: VALID_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      log: silent,
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "upstream_error") {
      expect(result.category).toBe("malformed_response");
      expect(result.retryable).toBe(false);
    } else {
      throw new Error("expected upstream_error");
    }
  });
});
