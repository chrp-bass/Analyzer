/**
 * Boundaries 3 (Stripe) and 4 (intelligence pipeline), with injected
 * dependencies. Nothing here can create a Stripe object or generate a report:
 * the fakes expose only the two read methods the checks are allowed to call.
 */

import { describe, expect, it, vi } from "vitest";
import type { CheckResult } from "@/lib/sentinel/types";
import { classifyStripeError, runStripeChecks, type StripeReader } from "@/lib/sentinel/checks/stripe";
import { FIXTURE_ESCAPE_HATCH, runPipelineChecks } from "@/lib/sentinel/checks/pipeline";
import { THRESHOLDS } from "@/lib/sentinel/thresholds";
import { fakeReader, leaks, SECRETS } from "./support/sentinel-fakes";

const byId = (r: { checks: CheckResult[] }, id: string): CheckResult => r.checks.find((c) => c.id === id)!;
const T0 = Date.parse("2026-09-08T12:00:00Z");
const SINCE = encodeURIComponent(new Date(T0 - THRESHOLDS.telemetryWindowMs).toISOString());

const stripeEnv = {
  STRIPE_SECRET_KEY: SECRETS.stripeKey,
  STRIPE_WEBHOOK_SECRET: SECRETS.webhookSecret,
  STRIPE_SONG_INTELLIGENCE_PRICE_ID: "price_1Song000000000000",
  STRIPE_CREATOR_INTELLIGENCE_PRICE_ID: "price_1Creator0000000000",
};

function fakeStripe(overrides: Partial<StripeReader> = {}): StripeReader & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async retrievePrice(id) {
      calls.push(`price:${id}`);
      const song = id.includes("Song");
      return { active: true, unit_amount: song ? 1900 : 14900, currency: "usd", recurring: null, livemode: true };
    },
    async listWebhookEndpoints() {
      calls.push("webhooks");
      return [
        { url: "https://scan.chrp.ai/api/stripe/webhook", status: "enabled", enabled_events: ["checkout.session.completed", "charge.refunded", "charge.dispute.created"], livemode: true },
        { url: "https://old.example.com/api/stripe/webhook", status: "disabled", enabled_events: ["*"], livemode: true },
      ];
    },
    ...overrides,
  };
}

describe("runStripeChecks", () => {
  it("healthy: configuration, credentials/prices, webhook and fulfillment PASS with read-only calls only", async () => {
    const stripe = fakeStripe();
    const r = await runStripeChecks({ env: stripeEnv, stripe, reader: fakeReader(), siteUrl: "https://scan.chrp.ai", now: () => T0 });
    expect(r.status).toBe("PASS");
    expect(r.checks.map((c) => [c.id, c.status])).toEqual([
      ["configuration", "PASS"],
      ["credentials_and_prices", "PASS"],
      ["webhook_endpoint", "PASS"],
      ["fulfillment_recent", "PASS"],
    ]);
    expect([...stripe.calls].sort()).toEqual(["price:price_1Creator0000000000", "price:price_1Song000000000000", "webhooks"]);
    expect(byId(r, "fulfillment_recent").summary).toContain("idle");
    expect(leaks(JSON.stringify(r))).toEqual([]);
  });

  it("missing or malformed configuration is FAIL; a test-mode key is WARN", async () => {
    const missing = await runStripeChecks({ env: { STRIPE_SECRET_KEY: SECRETS.stripeKey }, stripe: null, reader: null, siteUrl: null });
    expect(byId(missing, "configuration")).toMatchObject({ status: "FAIL", evidence: { missing: ["STRIPE_WEBHOOK_SECRET", "STRIPE_SONG_INTELLIGENCE_PRICE_ID", "STRIPE_CREATOR_INTELLIGENCE_PRICE_ID"] } });
    expect(byId(missing, "credentials_and_prices").status).toBe("NOT_EXERCISED");
    expect(byId(missing, "fulfillment_recent").status).toBe("NOT_EXERCISED");

    const badWebhook = await runStripeChecks({ env: { ...stripeEnv, STRIPE_WEBHOOK_SECRET: "not-a-signing-secret-value-at-all" }, stripe: null, reader: null, siteUrl: null });
    expect(byId(badWebhook, "configuration").status).toBe("FAIL");

    const test = await runStripeChecks({ env: { ...stripeEnv, STRIPE_SECRET_KEY: ["sk", "test", `FAKE${"3".repeat(24)}`].join("_") }, stripe: null, reader: null, siteUrl: null });
    expect(byId(test, "configuration").status).toBe("WARN");
  });

  it("an authentication failure is FAIL with a category, and the provider message never leaks", async () => {
    const stripe = fakeStripe({
      async retrievePrice() {
        throw Object.assign(new Error(`Invalid API Key provided: ${SECRETS.stripeKey}`), { type: "StripeAuthenticationError", statusCode: 401 });
      },
    });
    const r = await runStripeChecks({ env: stripeEnv, stripe, reader: fakeReader(), siteUrl: null, now: () => T0 });
    expect(byId(r, "credentials_and_prices")).toMatchObject({ status: "FAIL", summary: "Stripe rejected the production key: invalid_credentials", evidence: { category: "invalid_credentials" } });
    expect(JSON.stringify(r)).not.toContain("sk_live");
  });

  it("a wrong price is FAIL (amount, currency, recurring, inactive, missing)", async () => {
    const stripe = fakeStripe({
      async retrievePrice(id) {
        if (id.includes("Song")) return { active: true, unit_amount: 2900, currency: "usd", recurring: null, livemode: true };
        throw Object.assign(new Error("No such price"), { type: "StripeInvalidRequestError", code: "resource_missing", statusCode: 404 });
      },
    });
    const r = await runStripeChecks({ env: stripeEnv, stripe, reader: fakeReader(), siteUrl: null, now: () => T0 });
    expect(byId(r, "credentials_and_prices")).toMatchObject({ status: "FAIL", evidence: { problems: ["song_intelligence:amount_mismatch", "creator_intelligence:resource_missing"] } });
  });

  it("webhook: no enabled production endpoint is FAIL; missing revocation events is WARN; no permission is NOT_EXERCISED", async () => {
    const none = await runStripeChecks({ env: stripeEnv, stripe: fakeStripe({ async listWebhookEndpoints() { return [{ url: "https://scan.chrp.ai/api/stripe/webhook", status: "disabled", enabled_events: ["*"], livemode: true }]; } }), reader: fakeReader(), siteUrl: "https://scan.chrp.ai", now: () => T0 });
    expect(byId(none, "webhook_endpoint")).toMatchObject({ status: "FAIL", evidence: { matchingProductionEndpoints: 1, enabledMatching: 0 } });

    const partial = await runStripeChecks({ env: stripeEnv, stripe: fakeStripe({ async listWebhookEndpoints() { return [{ url: "https://scan.chrp.ai/api/stripe/webhook", status: "enabled", enabled_events: ["checkout.session.completed"], livemode: true }]; } }), reader: fakeReader(), siteUrl: "https://scan.chrp.ai", now: () => T0 });
    expect(byId(partial, "webhook_endpoint")).toMatchObject({ status: "WARN", evidence: { missingRecommendedEvents: ["charge.refunded", "charge.dispute.created"] } });

    const wrongHost = await runStripeChecks({ env: stripeEnv, stripe: fakeStripe(), reader: fakeReader(), siteUrl: "https://staging.chrp.ai", now: () => T0 });
    expect(byId(wrongHost, "webhook_endpoint").status).toBe("FAIL");

    const forbidden = await runStripeChecks({ env: stripeEnv, stripe: fakeStripe({ async listWebhookEndpoints() { throw Object.assign(new Error("restricted"), { type: "StripePermissionError", statusCode: 403 }); } }), reader: fakeReader(), siteUrl: null, now: () => T0 });
    expect(byId(forbidden, "webhook_endpoint").status).toBe("NOT_EXERCISED");
  });

  it("fulfillment: a stuck unprocessed event is FAIL; completed checkouts without grants is WARN", async () => {
    const stuck = await runStripeChecks({ env: stripeEnv, stripe: fakeStripe(), reader: fakeReader({ counts: { "stripe_events?processed_at=is.null": 1 } }), siteUrl: null, now: () => T0 });
    expect(byId(stuck, "fulfillment_recent")).toMatchObject({ status: "FAIL", evidence: { unprocessedEventsStuck: 1 } });

    const reader = fakeReader({ counts: { "stripe_events?type=eq.checkout.session.completed": 3, "entitlements?stripe_checkout_session_id=like.cs_*": 2 } });
    const gap = await runStripeChecks({ env: stripeEnv, stripe: fakeStripe(), reader, siteUrl: null, now: () => T0 });
    expect(byId(gap, "fulfillment_recent")).toMatchObject({ status: "WARN", evidence: { checkoutCompletedEvents: 3, paidEntitlementsGranted: 2 } });
    expect(reader.calls.some((c) => c.includes(`received_at=gte.${SINCE}`))).toBe(true);
  });

  it("network / timeout / upstream failures are FAIL with a category", async () => {
    const stripe = fakeStripe({ async retrievePrice() { throw Object.assign(new Error("socket hang up"), { type: "StripeConnectionError" }); } });
    const r = await runStripeChecks({ env: stripeEnv, stripe, reader: fakeReader(), siteUrl: null, now: () => T0 });
    expect(byId(r, "credentials_and_prices")).toMatchObject({ status: "FAIL", evidence: { category: "network" } });
    expect(classifyStripeError({ type: "StripeAPIError", statusCode: 502 })).toBe("upstream_unavailable");
    expect(classifyStripeError({ type: "StripeRateLimitError" })).toBe("rate_limited");
    expect(classifyStripeError(Object.assign(new Error("x"), { name: "AbortError" }))).toBe("timeout");
    expect(classifyStripeError(null)).toBe("unknown");
  });

  it("a hanging Stripe call times out into FAIL", async () => {
    const stripe = fakeStripe({ retrievePrice: () => new Promise(() => {}) });
    const r = await runStripeChecks({ env: stripeEnv, stripe, reader: fakeReader(), siteUrl: null, now: () => T0, checkTimeoutMs: 20 });
    expect(byId(r, "credentials_and_prices")).toMatchObject({ status: "FAIL", evidence: { failure: "timeout" } });
    expect(byId(r, "webhook_endpoint").status).toBe("PASS");
  });
});

const pipelineEnv = {
  ANTHROPIC_API_KEY: "sk-ant-api03-0123456789abcdefghijklmnop",
  SOUNDCHARTS_APP_ID: "CHRP_APP",
  SOUNDCHARTS_API_KEY: "soundcharts-key",
  SPOTIFY_CLIENT_ID: "spotify-id",
  SPOTIFY_CLIENT_SECRET: "spotify-secret",
};

describe("runPipelineChecks", () => {
  const deps = (over: Partial<Parameters<typeof runPipelineChecks>[0]> = {}) => ({
    env: pipelineEnv,
    reader: fakeReader(),
    generatorVersion: "chrp-rhodes-v2",
    now: () => T0,
    ...over,
  });

  it("idle telemetry is PASS (never a FAIL for silence) and the unexercisable stages are NOT_EXERCISED", async () => {
    const r = await runPipelineChecks(deps());
    expect(r.status).toBe("PASS");
    expect(r.checks.map((c) => [c.id, c.status])).toEqual([
      ["configuration", "PASS"],
      ["fixture_escape_hatch_unset", "PASS"],
      ["analyses_recent", "PASS"],
      ["reports_recent", "PASS"],
      ["preparation_latency", "PASS"],
      ["stage_latency", "NOT_EXERCISED"],
      ["generation", "NOT_EXERCISED"],
      ["upstream_engines", "NOT_EXERCISED"],
    ]);
    expect(byId(r, "analyses_recent").summary).toContain("idle");
    expect(byId(r, "preparation_latency").summary).toContain("idle");
    expect(leaks(JSON.stringify(r))).toEqual([]);
  });

  it("missing configuration is FAIL naming variables only; the fixture escape hatch set is FAIL", async () => {
    const r = await runPipelineChecks(deps({ env: { ...pipelineEnv, ANTHROPIC_API_KEY: "", [FIXTURE_ESCAPE_HATCH]: "true" } }));
    expect(byId(r, "configuration")).toMatchObject({ status: "FAIL", evidence: { missing: ["ANTHROPIC_API_KEY"] } });
    expect(byId(r, "fixture_escape_hatch_unset").status).toBe("FAIL");
    const off = await runPipelineChecks(deps({ env: { ...pipelineEnv, [FIXTURE_ESCAPE_HATCH]: "false" } }));
    expect(byId(off, "fixture_escape_hatch_unset").status).toBe("PASS");
  });

  it("partial telemetry (analyses but no reports yet) is PASS with counts", async () => {
    const r = await runPipelineChecks(deps({ reader: fakeReader({ counts: { "analyses?status=eq.complete&created_at=gte": 5, "analyses?status=eq.failed&created_at=gte": 1 } }) }));
    expect(byId(r, "analyses_recent")).toMatchObject({ status: "PASS", evidence: { complete: 5, failed: 1 } });
    expect(byId(r, "reports_recent")).toMatchObject({ status: "PASS", evidence: { reportsPersisted: 0 } });
  });

  it("a high failure ratio or a stuck pending analysis is WARN", async () => {
    const ratio = await runPipelineChecks(deps({ reader: fakeReader({ counts: { "analyses?status=eq.complete&created_at=gte": 2, "analyses?status=eq.failed&created_at=gte": 2 } }) }));
    expect(byId(ratio, "analyses_recent")).toMatchObject({ status: "WARN", summary: expect.stringContaining("50%") });
    const small = await runPipelineChecks(deps({ reader: fakeReader({ counts: { "analyses?status=eq.complete&created_at=gte": 1, "analyses?status=eq.failed&created_at=gte": 1 } }) }));
    expect(byId(small, "analyses_recent").status).toBe("PASS"); // below the minimum sample
    const stuck = await runPipelineChecks(deps({ reader: fakeReader({ counts: { "analyses?status=eq.pending&created_at=lt": 1 } }) }));
    expect(byId(stuck, "analyses_recent")).toMatchObject({ status: "WARN", evidence: { pendingStuck: 1 } });
  });

  it("incomplete persisted reports or a superseded generator version is WARN", async () => {
    const inc = await runPipelineChecks(deps({ reader: fakeReader({ counts: { "reports?or=": 2 } }) }));
    expect(byId(inc, "reports_recent")).toMatchObject({ status: "WARN", evidence: { incompletePersistedAllTime: 2 } });
    const old = await runPipelineChecks(deps({ reader: fakeReader({ counts: { "reports?generator_version=eq.": 1, "reports?created_at=gte": 3 } }) }));
    expect(byId(old, "reports_recent")).toMatchObject({ status: "WARN", summary: expect.stringContaining("superseded") });
  });

  it("preparation latency is a percentile over analysis→report wall clock; p95 over the budget is WARN", async () => {
    const row = (secs: number) => ({ created_at: new Date(T0).toISOString(), analyses: { created_at: new Date(T0 - secs * 1000).toISOString() } });
    const ok = await runPipelineChecks(deps({ reader: fakeReader({ rows: { reports: [row(20), row(40), row(60)] } }) }));
    expect(byId(ok, "preparation_latency")).toMatchObject({ status: "PASS", evidence: { samples: 3, p50Ms: 40_000, maxMs: 60_000 } });
    const slow = await runPipelineChecks(deps({ reader: fakeReader({ rows: { reports: [row(20), row(300), { created_at: "bad", analyses: null }] } }) }));
    expect(byId(slow, "preparation_latency")).toMatchObject({ status: "WARN", evidence: { samples: 2 } });
  });

  it("an unreadable telemetry table is FAIL; no reader at all is NOT_EXERCISED", async () => {
    const bad = await runPipelineChecks(deps({ reader: fakeReader({ failCount: { kind: "http", status: 500 } }) }));
    expect(byId(bad, "analyses_recent")).toMatchObject({ status: "FAIL", summary: expect.stringContaining("status=500") });
    const none = await runPipelineChecks(deps({ reader: null }));
    expect(byId(none, "analyses_recent").status).toBe("NOT_EXERCISED");
    expect(byId(none, "configuration").status).toBe("PASS");
  });

  it("never calls anything that could generate: only count and rows are used", async () => {
    const reader = fakeReader();
    const spy = vi.spyOn(reader, "rpcNullProbe");
    await runPipelineChecks(deps({ reader }));
    expect(spy).not.toHaveBeenCalled();
    expect(reader.calls.every((c) => c.startsWith("count:") || c.startsWith("rows:"))).toBe(true);
  });
});
