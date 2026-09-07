/**
 * Route-level tests for POST /api/checkout.
 *
 * The architectural rule: never charge until the complete paid report is
 * already generated and persisted. At the route this means Stripe is
 * contacted only after `verifyCheckoutReadiness` has said yes for THIS
 * identity, THIS scan and THE report the client says it prepared. Every
 * refusal below asserts that `checkout.sessions.create` was never called.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const sessionsCreate = vi.fn();
const pricesRetrieve = vi.fn();

vi.mock("@/lib/commerce/stripe", () => ({
  stripeConfigured: () => true,
  getStripe: () => ({
    prices: { retrieve: pricesRetrieve },
    checkout: { sessions: { create: sessionsCreate } },
  }),
}));
vi.mock("@/lib/commerce/entitlements", () => ({
  currentUserId: vi.fn(async () => "user_a"),
}));
vi.mock("@/lib/reports/prepare.server", () => ({
  verifyCheckoutReadiness: vi.fn(),
}));
vi.mock("@/lib/scan/fulfillment.server", () => ({
  ensureAnalysisPersisted: vi.fn(),
  fulfillmentMessage: () => "unavailable",
  ENGINE_VERSION: "chrp-epi-v2",
}));

import { verifyCheckoutReadiness } from "@/lib/reports/prepare.server";
import { POST } from "@/app/api/checkout/route";

const readinessMock = vi.mocked(verifyCheckoutReadiness);
const SCAN = "scn_isrc-ustest0000001_abc123";

function req(body: unknown): Request {
  return new Request("http://test.local/api/checkout", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", host: "test.local" },
  });
}

beforeEach(() => {
  sessionsCreate.mockReset();
  pricesRetrieve.mockReset();
  readinessMock.mockReset();
  process.env.STRIPE_SONG_INTELLIGENCE_PRICE_ID = "price_song";
  pricesRetrieve.mockResolvedValue({
    active: true,
    unit_amount: 1900,
    currency: "usd",
    recurring: null,
  });
  sessionsCreate.mockResolvedValue({ id: "cs_test_1", url: "https://checkout.stripe.com/c/x" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.STRIPE_SONG_INTELLIGENCE_PRICE_ID;
});

describe("checkout rejects a stale or mismatched report", () => {
  it("refuses when the client names no prepared report", async () => {
    const res = await POST(req({ offer: "song_intelligence", scanId: SCAN }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("report_not_ready");
    expect(readinessMock).not.toHaveBeenCalled();
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("refuses a mismatched report id before touching Stripe", async () => {
    readinessMock.mockResolvedValueOnce({ ok: false, reason: "mismatch" });
    const res = await POST(
      req({ offer: "song_intelligence", scanId: SCAN, reportId: "rep_x", reportVersion: "chrp-rhodes-v2" }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("report_stale");
    expect(body.reason).toBe("mismatch");
    expect(body.message).toMatch(/Nothing has been charged/);
    expect(sessionsCreate).not.toHaveBeenCalled();
    expect(pricesRetrieve).not.toHaveBeenCalled();
  });

  it("refuses a stale report version before touching Stripe", async () => {
    readinessMock.mockResolvedValueOnce({ ok: false, reason: "stale_version" });
    const res = await POST(
      req({ offer: "song_intelligence", scanId: SCAN, reportId: "rep_1", reportVersion: "chrp-report-v1" }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe("stale_version");
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("refuses when no complete report is persisted yet", async () => {
    readinessMock.mockResolvedValueOnce({ ok: false, reason: "not_ready" });
    const res = await POST(
      req({ offer: "song_intelligence", scanId: SCAN, reportId: "rep_1", reportVersion: "chrp-rhodes-v2" }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("report_not_ready");
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("passes the exact identity, scan and claim to the readiness check", async () => {
    readinessMock.mockResolvedValueOnce({ ok: false, reason: "not_ready" });
    await POST(
      req({ offer: "song_intelligence", scanId: SCAN, reportId: "rep_1", reportVersion: "chrp-rhodes-v2" }),
    );
    expect(readinessMock).toHaveBeenCalledWith("user_a", SCAN, {
      reportId: "rep_1",
      reportVersion: "chrp-rhodes-v2",
    });
  });
});

describe("checkout binds the charge to the prepared report", () => {
  it("creates the session only after readiness passes, with the report bound in metadata", async () => {
    readinessMock.mockResolvedValueOnce({
      ok: true,
      readiness: {
        scanId: SCAN,
        reportId: "rep_1",
        reportVersion: "chrp-rhodes-v2",
        analysisId: "an_1",
      },
      engineVersion: "chrp-epi-v2",
    });
    const res = await POST(
      req({ offer: "song_intelligence", scanId: SCAN, reportId: "rep_1", reportVersion: "chrp-rhodes-v2" }),
    );
    expect(res.status).toBe(200);
    expect(sessionsCreate).toHaveBeenCalledTimes(1);
    const args = sessionsCreate.mock.calls[0][0] as {
      metadata: Record<string, string>;
      client_reference_id: string;
    };
    expect(args.client_reference_id).toBe("user_a");
    expect(args.metadata).toMatchObject({
      offer: "song_intelligence",
      user_id: "user_a",
      scan_id: SCAN,
      report_id: "rep_1",
      report_version: "chrp-rhodes-v2",
      analysis_id: "an_1",
      engine_version: "chrp-epi-v2",
    });
    // Readiness is checked before the price is even read, so a missing
    // report never gets as far as Stripe.
    expect(readinessMock.mock.invocationCallOrder[0]).toBeLessThan(
      pricesRetrieve.mock.invocationCallOrder[0],
    );
  });
});
