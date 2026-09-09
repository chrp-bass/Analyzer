/**
 * Boundary 3 — Stripe.
 *
 * Read-only: `prices.retrieve` (the same harmless read checkout already
 * performs) and `webhookEndpoints.list`. Never a Checkout Session, payment,
 * customer, refund or entitlement. Fulfillment evidence comes from the
 * `stripe_events` ledger and `entitlements`, as counts.
 */

import { boundaryResult, runCheck, type CheckOutcome } from "../evaluate";
import { envPresent } from "../http";
import type { PostgrestReader } from "../postgrest";
import { sanitizeText } from "../redact";
import { THRESHOLDS } from "../thresholds";
import type { BoundaryResult, CheckResult, CheckStatus, Evidence } from "../types";

/** The subset of the Stripe SDK the check needs — injectable. */
export interface StripeReader {
  retrievePrice(priceId: string): Promise<{
    active: boolean;
    unit_amount: number | null;
    currency: string;
    recurring: unknown | null;
    livemode: boolean;
  }>;
  listWebhookEndpoints(): Promise<
    Array<{ url: string; status: string; enabled_events: string[]; livemode: boolean }>
  >;
}

/** Locked commercial expectations. Mirrors `src/lib/commerce/offers.ts`. */
export const EXPECTED_PRICES = [
  { envVar: "STRIPE_SONG_INTELLIGENCE_PRICE_ID", amountCents: 1900, currency: "usd", label: "song_intelligence" },
  { envVar: "STRIPE_CREATOR_INTELLIGENCE_PRICE_ID", amountCents: 14900, currency: "usd", label: "creator_intelligence" },
] as const;

export const WEBHOOK_PATH = "/api/stripe/webhook";
export const REQUIRED_WEBHOOK_EVENTS = ["checkout.session.completed"] as const;
export const RECOMMENDED_WEBHOOK_EVENTS = ["charge.refunded", "charge.dispute.created"] as const;

export interface StripeCheckDeps {
  env: Record<string, string | undefined>;
  stripe: StripeReader | null;
  reader: PostgrestReader | null;
  /** The production origin the webhook must point at. */
  siteUrl: string | null;
  now?: () => number;
  checkTimeoutMs?: number;
}

/** Map a thrown Stripe error to a category, without its message. */
export function classifyStripeError(err: unknown): string {
  const type = err && typeof err === "object" ? (err as { type?: unknown }).type : undefined;
  const code = err && typeof err === "object" ? (err as { code?: unknown }).code : undefined;
  const status = err && typeof err === "object" ? (err as { statusCode?: unknown }).statusCode : undefined;
  if (type === "StripeAuthenticationError" || status === 401) return "invalid_credentials";
  if (type === "StripePermissionError" || status === 403) return "missing_permissions";
  if (type === "StripeRateLimitError" || status === 429) return "rate_limited";
  if (type === "StripeConnectionError") return "network";
  if (type === "StripeAPIError" || (typeof status === "number" && status >= 500)) return "upstream_unavailable";
  if (type === "StripeInvalidRequestError" || status === 404) return code === "resource_missing" ? "resource_missing" : "invalid_request";
  if (err instanceof Error && err.name === "AbortError") return "timeout";
  return "unknown";
}

export async function runStripeChecks(deps: StripeCheckDeps): Promise<BoundaryResult> {
  const now = deps.now ?? (() => Date.now());
  const timeout = deps.checkTimeoutMs ?? THRESHOLDS.checkTimeoutMs;
  const started = now();
  const opts = { now, sanitize: sanitizeText };
  const env = deps.env;

  const configuration = runCheck("configuration", timeout, async (): Promise<CheckOutcome> => {
    const required = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", ...EXPECTED_PRICES.map((p) => p.envVar)];
    const missing = required.filter((n) => !envPresent(env, n));
    const secret = env.STRIPE_SECRET_KEY?.trim() ?? "";
    const livemodeKey = secret.startsWith("sk_live_") || secret.startsWith("rk_live_");
    const webhookShape = (env.STRIPE_WEBHOOK_SECRET?.trim() ?? "").startsWith("whsec_");
    const evidence: Evidence = { missing, livemodeKey, webhookSecretShapeValid: webhookShape };
    if (missing.length) return { status: "FAIL" as CheckStatus, summary: `missing: ${missing.join(", ")}`, evidence };
    if (!webhookShape) return { status: "FAIL" as CheckStatus, summary: "STRIPE_WEBHOOK_SECRET is present but not a whsec_ signing secret", evidence };
    if (!livemodeKey) return { status: "WARN" as CheckStatus, summary: "STRIPE_SECRET_KEY is not a live-mode key", evidence };
    return { status: "PASS" as CheckStatus, summary: "Stripe key, webhook secret and both price ids present (live mode)", evidence };
  }, opts);

  const prices = runCheck("credentials_and_prices", timeout, async (): Promise<CheckOutcome> => {
    if (!deps.stripe) return { status: "NOT_EXERCISED" as CheckStatus, summary: "Stripe client unavailable (unconfigured)" };
    const problems: string[] = [];
    let livemode: boolean | null = null;
    let authenticated = false;
    for (const p of EXPECTED_PRICES) {
      const id = env[p.envVar]?.trim();
      if (!id) {
        problems.push(`${p.label}:price_id_missing`);
        continue;
      }
      try {
        const price = await deps.stripe.retrievePrice(id);
        authenticated = true;
        livemode = livemode === null ? price.livemode : livemode && price.livemode;
        if (!price.active) problems.push(`${p.label}:inactive`);
        if (price.unit_amount !== p.amountCents) problems.push(`${p.label}:amount_mismatch`);
        if (price.currency !== p.currency) problems.push(`${p.label}:currency_mismatch`);
        if (price.recurring) problems.push(`${p.label}:recurring`);
      } catch (err) {
        const category = classifyStripeError(err);
        if (category === "invalid_credentials" || category === "missing_permissions") {
          return { status: "FAIL" as CheckStatus, summary: `Stripe rejected the production key: ${category}`, evidence: { category } };
        }
        if (category === "network" || category === "timeout" || category === "upstream_unavailable" || category === "rate_limited") {
          return { status: "FAIL" as CheckStatus, summary: `Stripe unreachable: ${category}`, evidence: { category } };
        }
        problems.push(`${p.label}:${category}`);
      }
    }
    const evidence: Evidence = { authenticated, livemode, problems, pricesChecked: EXPECTED_PRICES.length };
    if (problems.length) return { status: "FAIL" as CheckStatus, summary: `checkout price configuration wrong: ${problems.join(", ")}`, evidence };
    if (livemode === false) return { status: "WARN" as CheckStatus, summary: "credentials authenticate, but prices are test-mode objects", evidence };
    return { status: "PASS" as CheckStatus, summary: "credentials authenticate; both prices active, one-time, at the locked amounts", evidence };
  }, opts);

  const webhook = runCheck("webhook_endpoint", timeout, async (): Promise<CheckOutcome> => {
    if (!deps.stripe) return { status: "NOT_EXERCISED" as CheckStatus, summary: "Stripe client unavailable (unconfigured)" };
    let endpoints;
    try {
      endpoints = await deps.stripe.listWebhookEndpoints();
    } catch (err) {
      const category = classifyStripeError(err);
      if (category === "missing_permissions") {
        return { status: "NOT_EXERCISED" as CheckStatus, summary: "key lacks permission to list webhook endpoints", evidence: { category } };
      }
      return { status: "FAIL" as CheckStatus, summary: `could not list webhook endpoints: ${category}`, evidence: { category } };
    }
    const host = deps.siteUrl ? safeHost(deps.siteUrl) : null;
    const matching = endpoints.filter((e) => {
      const h = safeHost(e.url);
      let path = "";
      try {
        path = new URL(e.url).pathname;
      } catch {
        return false;
      }
      return path === WEBHOOK_PATH && (host ? h === host : true);
    });
    const enabled = matching.filter((e) => e.status === "enabled");
    const evidence: Evidence = {
      endpointsTotal: endpoints.length,
      matchingProductionEndpoints: matching.length,
      enabledMatching: enabled.length,
      siteHostKnown: Boolean(host),
    };
    if (enabled.length === 0) {
      return { status: "FAIL" as CheckStatus, summary: host ? `no enabled webhook endpoint at ${host}${WEBHOOK_PATH}` : `no enabled webhook endpoint for ${WEBHOOK_PATH}`, evidence };
    }
    const events = new Set(enabled.flatMap((e) => e.enabled_events));
    const all = events.has("*");
    const missingRequired = all ? [] : REQUIRED_WEBHOOK_EVENTS.filter((e) => !events.has(e));
    const missingRecommended = all ? [] : RECOMMENDED_WEBHOOK_EVENTS.filter((e) => !events.has(e));
    Object.assign(evidence, { missingRequiredEvents: missingRequired, missingRecommendedEvents: missingRecommended });
    if (missingRequired.length) return { status: "FAIL" as CheckStatus, summary: `webhook missing required events: ${missingRequired.join(", ")}`, evidence };
    if (missingRecommended.length) return { status: "WARN" as CheckStatus, summary: `webhook missing revocation events: ${missingRecommended.join(", ")}`, evidence };
    return { status: "PASS" as CheckStatus, summary: "an enabled production webhook endpoint receives completion and revocation events", evidence };
  }, opts);

  const fulfillment = runCheck("fulfillment_recent", timeout, async (): Promise<CheckOutcome> => {
    const r = deps.reader;
    if (!r) return { status: "NOT_EXERCISED" as CheckStatus, summary: "ledger unavailable (Supabase unconfigured)" };
    const t = now();
    const since = new Date(t - THRESHOLDS.telemetryWindowMs).toISOString();
    const stuckBefore = new Date(t - THRESHOLDS.unprocessedStripeEventMs).toISOString();
    const [completed, unprocessed, granted, refunded] = await Promise.all([
      r.count("stripe_events", `type=eq.checkout.session.completed&received_at=gte.${encodeURIComponent(since)}`),
      r.count("stripe_events", `processed_at=is.null&received_at=lt.${encodeURIComponent(stuckBefore)}`),
      r.count("entitlements", `stripe_checkout_session_id=like.cs_*&granted_at=gte.${encodeURIComponent(since)}`),
      r.count("entitlements", `status=eq.refunded&updated_at=gte.${encodeURIComponent(since)}`),
    ]);
    for (const c of [completed, unprocessed, granted, refunded]) {
      if (!c.ok) return { status: "FAIL" as CheckStatus, summary: `ledger unreadable: ${c.kind}${c.status ? ` status=${c.status}` : ""}` };
    }
    const evidence: Evidence = {
      windowHours: THRESHOLDS.telemetryWindowMs / 3_600_000,
      checkoutCompletedEvents: (completed as { count: number }).count,
      paidEntitlementsGranted: (granted as { count: number }).count,
      unprocessedEventsStuck: (unprocessed as { count: number }).count,
      refundedEntitlements: (refunded as { count: number }).count,
    };
    if ((unprocessed as { count: number }).count > 0) {
      return { status: "FAIL" as CheckStatus, summary: `${evidence.unprocessedEventsStuck} Stripe event(s) received but never processed — a webhook crashed mid-grant`, evidence };
    }
    const c = evidence.checkoutCompletedEvents as number;
    const g = evidence.paidEntitlementsGranted as number;
    if (c > g) {
      return { status: "WARN" as CheckStatus, summary: `${c - g} completed checkout(s) without a paid entitlement in the window`, evidence };
    }
    if (c === 0 && g === 0) return { status: "PASS" as CheckStatus, summary: "idle: no paid checkouts in the window; no stuck events", evidence };
    return { status: "PASS" as CheckStatus, summary: `${g} paid entitlement(s) granted for ${c} completed checkout(s); no stuck events`, evidence };
  }, opts);

  const checks: CheckResult[] = await Promise.all([configuration, prices, webhook, fulfillment]);
  return boundaryResult("stripe", checks, now() - started);
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}
