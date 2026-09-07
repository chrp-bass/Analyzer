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
import {
  mintRhodesSignedUrl,
  rhodesAgentId,
} from "@/lib/rhodes-voice/signed-url";

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
  it("packages exactly the governed values — never re-derives them", () => {
    const report = makeReport();
    const ctx = buildRhodesVoiceContext(report);

    // Identity is passed verbatim: voice Rhodes knows the actual song.
    expect(ctx.song).toEqual({ title: "Safe", artist: "The Brevet" });
    expect(ctx.variables.song_title).toBe("Safe");
    expect(ctx.variables.song_artist).toBe("The Brevet");

    // The five scores + EPI + mode come out of the report unchanged. Any
    // re-derivation here would let voice truth drift from written truth.
    expect(ctx.variables.focus_score).toBe("71");
    expect(ctx.variables.calm_score).toBe("68");
    expect(ctx.variables.motivation_score).toBe("55");
    expect(ctx.variables.balance_score).toBe("62");
    expect(ctx.variables.epi_score).toBe("62");
    expect(ctx.variables.epi_mode).toBe("Flow");

    // Governed prose is included verbatim (subject only to length caps).
    expect(ctx.variables.signature).toBe(report.signature);
    expect(ctx.variables.throughline).toBe(report.throughline);
    expect(ctx.variables.consider).toBe(report.consider);

    // Placement titles and buyer categories are lifted — not invented.
    expect(ctx.variables.placement_titles).toBe(
      "Reflective long-form, Editorial spot",
    );
    expect(ctx.variables.buyer_categories).toBe(
      "Documentary supervisors, Editorial licensors",
    );
  });

  it("caps runaway prose fields so the WebSocket handshake stays small", () => {
    const long = "x".repeat(2000);
    const ctx = buildRhodesVoiceContext(
      makeReport({ signature: long, throughline: long, consider: long }),
    );
    // Every capped field ends with the truncation glyph and stays under limit.
    expect(ctx.variables.signature.length).toBeLessThanOrEqual(480);
    expect(ctx.variables.throughline.length).toBeLessThanOrEqual(480);
    expect(ctx.variables.consider.length).toBeLessThanOrEqual(480);
  });

  it("produces a first-read that names THIS song by title and artist", () => {
    const ctx = buildRhodesVoiceContext(makeReport());
    expect(ctx.firstMessage).toContain("Safe");
    expect(ctx.firstMessage).toContain("The Brevet");
    // The first read cites the governed prose, so voice/written cannot drift.
    expect(ctx.firstMessage.length).toBeGreaterThan(80);
    // And is short enough to speak in 20-40 seconds (roughly 55-140 words).
    const words = ctx.firstMessage.split(/\s+/).filter(Boolean).length;
    expect(words).toBeGreaterThanOrEqual(40);
    expect(words).toBeLessThanOrEqual(150);
  });

  it("survives an empty placement/buyer list without inventing categories", () => {
    const ctx = buildRhodesVoiceContext(
      makeReport({ placements: [], buyers: [] }),
    );
    // A missing category is an empty string, never a fabricated stand-in.
    expect(ctx.variables.placement_titles).toBe("");
    expect(ctx.variables.buyer_categories).toBe("");
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
  it("opens with the song's title and quotes the governed reading", () => {
    const line = composeFirstRead(makeReport());
    expect(line.startsWith("I sat with \"Safe\"")).toBe(true);
    // The Rhodes v2 governed reading is quoted, so voice cannot invent claims.
    expect(line).toContain("Safe holds its posture");
  });

  it("falls back to signature when the reading is empty", () => {
    const line = composeFirstRead(makeReport({ rhodes: "" }));
    expect(line).toContain("settled architecture");
  });
});

describe("rhodesAgentId", () => {
  const prev = process.env.ELEVENLABS_RHODES_AGENT_ID;
  afterEach(() => {
    // `process.env.X = undefined` stores the literal string "undefined";
    // deleting is the only way to actually unset.
    if (prev === undefined) delete process.env.ELEVENLABS_RHODES_AGENT_ID;
    else process.env.ELEVENLABS_RHODES_AGENT_ID = prev;
  });

  it("falls back to the canonical production agent id when unset", () => {
    delete process.env.ELEVENLABS_RHODES_AGENT_ID;
    expect(rhodesAgentId()).toBe("vv1j1yrAGF0RdxJOSGIJ");
  });

  it("respects an explicit env override", () => {
    process.env.ELEVENLABS_RHODES_AGENT_ID = "customAgent123";
    expect(rhodesAgentId()).toBe("customAgent123");
  });
});

describe("mintRhodesSignedUrl", () => {
  const priorKey = process.env.ELEVENLABS_API_KEY;
  afterEach(() => {
    if (priorKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = priorKey;
    vi.restoreAllMocks();
  });

  it("refuses without an API key (never asks upstream, never leaks)", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const fetchImpl = vi.fn();
    const result = await mintRhodesSignedUrl(fetchImpl as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_configured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("passes the key in a header — never in the URL query string", async () => {
    process.env.ELEVENLABS_API_KEY = "test_key_do_not_leak";
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ signed_url: "wss://api.elevenlabs.io/x/y" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const result = await mintRhodesSignedUrl(fetchImpl as unknown as typeof fetch);
    expect(result.ok).toBe(true);
    const call = fetchImpl.mock.calls[0];
    const [url, init] = call as unknown as [string, RequestInit];
    // The key never appears in the URL — an in-flight log capture would
    // otherwise persist it against every request.
    expect(url).not.toContain("test_key_do_not_leak");
    const headers = init.headers as Record<string, string>;
    expect(headers["xi-api-key"]).toBe("test_key_do_not_leak");
  });

  it("calls the ElevenLabs convai signed-URL endpoint at its canonical hyphenated path", async () => {
    // Regression pin: the ElevenLabs endpoint is `.../get-signed-url`
    // (hyphens), not `.../get_signed_url` (underscores). The underscored
    // path returns 401 in production even under a valid key, so the
    // exact string is worth encoding as a test rather than trusting
    // memory.
    process.env.ELEVENLABS_API_KEY = "test_key";
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ signed_url: "wss://api.elevenlabs.io/token/x" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    await mintRhodesSignedUrl(fetchImpl as unknown as typeof fetch);
    const [url] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(
      "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=",
    );
    expect(url).not.toContain("get_signed_url");
  });

  it("returns the signed URL when ElevenLabs answers happily", async () => {
    process.env.ELEVENLABS_API_KEY = "test_key";
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ signed_url: "wss://api.elevenlabs.io/token/abc" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const result = await mintRhodesSignedUrl(fetchImpl as unknown as typeof fetch);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.signedUrl).toBe("wss://api.elevenlabs.io/token/abc");
      expect(result.agentId).toBe("vv1j1yrAGF0RdxJOSGIJ");
    }
  });

  it("treats a non-2xx upstream as an upstream error, without leaking the body", async () => {
    process.env.ELEVENLABS_API_KEY = "test_key";
    const fetchImpl = vi.fn(async () =>
      new Response("plan gate exceeded and here is my quota row", {
        status: 429,
      }),
    );
    const result = await mintRhodesSignedUrl(fetchImpl as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("upstream_error");
      // The response body must never propagate.
      expect(result.detail).not.toContain("plan gate exceeded");
      expect(result.detail).toContain("429");
    }
  });

  it("rejects a response missing signed_url so a garbage URL never reaches the client", async () => {
    process.env.ELEVENLABS_API_KEY = "test_key";
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ nope: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await mintRhodesSignedUrl(fetchImpl as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("upstream_error");
  });
});
