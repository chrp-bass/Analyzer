/**
 * Rhodes voice can never block, delay, or fail report fulfillment.
 *
 * Two layers are pinned:
 *
 *   1. Runtime — the voice route reads the persisted report with recovery
 *      disabled and, when ElevenLabs is down, answers with a small 503 while
 *      the report route itself is untouched.
 *   2. Structure — the voice panel lives BELOW the rendered intelligence,
 *      starts only on a click, and the paid JSON route does not import a
 *      single voice module. So a voice failure is, by construction, a
 *      failure of one panel after the report is already on screen.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("@/lib/reports/resolve.server", () => ({
  resolveEntitledReport: vi.fn(),
}));
vi.mock("@/lib/rhodes-voice/signed-url", () => ({
  mintRhodesSignedUrl: vi.fn(),
}));

import { resolveEntitledReport } from "@/lib/reports/resolve.server";
import { mintRhodesSignedUrl } from "@/lib/rhodes-voice/signed-url";
import { POST } from "@/app/api/rhodes/session/route";

const resolveMock = vi.mocked(resolveEntitledReport);
const mintMock = vi.mocked(mintRhodesSignedUrl);

function report() {
  return {
    ok: true as const,
    source: "generated" as const,
    report: {
      report_meta: { id: "R-1", version: "v2", scanned_at: "", scanned_at_display: "" },
      track: { title: "Safe", artist: "The Brevet", isrc: "USTEST00001" },
      epi: { score: 62, mode: "Flow" as const, rank_in_mode: "", rank_overall: "" },
      chrp_scores: [],
      hpv: [],
      creator: { name: "The Brevet", tracks_scored: 1, tease: "" },
      free_statement: "",
      signature: "A settled architecture.",
      rhodes: "Safe holds its posture with quiet confidence.",
      placements: [{ title: "Reflective long-form", body: "…" }],
      throughline: "A settled song.",
      where_this_music_lives: { verticals: [], confidence: null, n_briefs: null, sample_brief: null },
    },
  };
}

beforeEach(() => {
  resolveMock.mockReset();
  mintMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("voice failure never affects report rendering", () => {
  it("the voice route reads the persisted report through the pure resolver", async () => {
    resolveMock.mockResolvedValueOnce(report());
    mintMock.mockResolvedValueOnce({ ok: true, signedUrl: "wss://x", agentId: "a", attempts: 1, ms: 5 });
    await POST(
      new Request("http://test.local/api/rhodes/session", {
        method: "POST",
        body: JSON.stringify({ scanId: "scn_x" }),
      }),
    );
    expect(resolveMock).toHaveBeenCalledWith("scn_x");
  });

  it("an ElevenLabs outage is a small, retryable 503 from the voice route, nothing more", async () => {
    resolveMock.mockResolvedValueOnce(report());
    mintMock.mockResolvedValueOnce({
      ok: false,
      reason: "upstream_error",
      category: "upstream_unavailable",
      retryable: true,
      upstreamStatus: 502,
      attempts: 3,
      ms: 900,
    });
    const res = await POST(
      new Request("http://test.local/api/rhodes/session", {
        method: "POST",
        body: JSON.stringify({ scanId: "scn_x" }),
      }),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ error: "voice_unavailable", retryable: true });
    // The failure state is small: no stack, no upstream body, no key.
    expect(JSON.stringify(body)).not.toMatch(/elevenlabs|xi-api-key|sk_/i);
  });

  it("the paid report route imports no voice module", () => {
    for (const path of [
      "src/app/api/report/[id]/route.ts",
      "src/lib/reports/resolve.server.ts",
      "src/lib/reports/free-report.server.ts",
      "src/lib/reports/prepare.ts",
      "src/lib/reports/prepare.server.ts",
    ]) {
      const src = readFileSync(path, "utf8");
      expect(src, path).not.toMatch(/rhodes-voice|elevenlabs/i);
    }
  });

  it("the voice panel renders after the intelligence and starts only on a click", () => {
    const page = readFileSync("src/components/ReportPage.tsx", "utf8");
    const body = page.match(/export function ReportBody[\s\S]*?<\/article>/)![0];
    // Below the signature and the CHRP reading — the report is already on
    // screen when the panel mounts.
    expect(body.indexOf("<RhodesVoice")).toBeGreaterThan(body.indexOf("<CHRPReading"));
    expect(body.indexOf("<RhodesVoice")).toBeGreaterThan(body.indexOf("report.signature"));

    const voice = readFileSync("src/components/report/RhodesVoice.tsx", "utf8");
    const controller = readFileSync("src/lib/rhodes-voice/session-controller.ts", "utf8");
    // Nothing auto-plays: the only invocation of startConversation is the
    // button's onClick, and the mount effect only tears down.
    const effects = voice.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\);/g) ?? [];
    expect(effects.length).toBeGreaterThan(0);
    for (const effect of effects) {
      expect(effect).not.toContain("startConversation");
      expect(effect).not.toContain("/api/rhodes/session");
    }
    expect(voice).toMatch(/onClick=\{startConversation\}/);
    // Every failure branch keeps the report usable and says so.
    expect(controller.match(/The report below is unaffected|You can still read the report below/g)?.length ?? 0)
      .toBeGreaterThanOrEqual(4);
    // The panel never redirects, throws, opens a modal or touches the page
    // outside its own section.
    expect(voice).not.toMatch(/router\.|redirect\(|window\.location|throw new|<dialog|alert\(/);
  });
});
