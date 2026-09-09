/**
 * Production wiring for the Vercel-side health surface: the real environment,
 * the real PostgREST endpoint, the real Stripe SDK and the real ElevenLabs
 * API — all read-only — behind the injectable check modules.
 *
 * This module is the ONLY place the sentinel touches `process.env` or a live
 * SDK, so the checks stay unit-testable with fakes.
 */

import "server-only";
import { getStripe, stripeConfigured } from "@/lib/commerce/stripe";
import { mintSignedUrl } from "@/lib/rhodes-voice/elevenlabs";
import { runPipelineChecks } from "./checks/pipeline";
import { runRhodesChecks, type SignedUrlMinter } from "./checks/rhodes";
import { runStripeChecks, type StripeReader } from "./checks/stripe";
import { runSupabaseChecks } from "./checks/supabase";
import { createPostgrestReader, type PostgrestReader } from "./postgrest";
import { sanitizeDeep } from "./redact";
import { THRESHOLDS } from "./thresholds";
import { SENTINEL_SCHEMA_VERSION, type BoundaryResult, type DeploymentIdentity, type ServerHealthReport } from "./types";

/**
 * The generator version current builds persist. Pinned here as a literal so
 * the health route's import graph never reaches the generator, the Anthropic
 * client or the preparation pipeline; `tests/sentinel-route.test.ts` asserts
 * it equals `GENERATOR_VERSION`.
 */
export const SENTINEL_GENERATOR_VERSION = "chrp-rhodes-v2";

export function readDeploymentIdentity(env: Record<string, string | undefined> = process.env): DeploymentIdentity {
  const clean = (v: string | undefined) => (typeof v === "string" && /^[A-Za-z0-9_.:/-]{1,80}$/.test(v.trim()) ? v.trim() : null);
  return {
    sha: clean(env.VERCEL_GIT_COMMIT_SHA)?.toLowerCase() ?? null,
    deploymentId: clean(env.VERCEL_DEPLOYMENT_ID),
    env: clean(env.VERCEL_ENV),
    region: clean(env.VERCEL_REGION),
    ref: clean(env.VERCEL_GIT_COMMIT_REF),
  };
}

function postgrestReader(env: Record<string, string | undefined>, signal?: AbortSignal): PostgrestReader | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !serviceKey || !anonKey) return null;
  return createPostgrestReader({ url, serviceKey, anonKey, fetchImpl: fetch, timeoutMs: THRESHOLDS.requestTimeoutMs, signal });
}

function stripeReader(): StripeReader | null {
  if (!stripeConfigured()) return null;
  const stripe = getStripe();
  return {
    async retrievePrice(priceId) {
      const p = await stripe.prices.retrieve(priceId, undefined, { timeout: THRESHOLDS.requestTimeoutMs, maxNetworkRetries: 0 });
      return { active: p.active, unit_amount: p.unit_amount, currency: p.currency, recurring: p.recurring, livemode: p.livemode };
    },
    async listWebhookEndpoints() {
      const list = await stripe.webhookEndpoints.list({ limit: 100 }, { timeout: THRESHOLDS.requestTimeoutMs, maxNetworkRetries: 0 });
      return list.data.map((e) => ({ url: e.url, status: e.status, enabled_events: e.enabled_events, livemode: e.livemode }));
    },
  };
}

/** Exactly one mint through the production client; the URL is dropped here. */
const productionMinter: SignedUrlMinter = async (config, signal) => {
  const result = await mintSignedUrl({
    config,
    requestId: `sentinel-${Date.now().toString(36)}`,
    fetchImpl: (input, init) => fetch(input, { ...init, signal: signal.aborted ? signal : init?.signal }),
    log: () => {}, // the sentinel reports its own evidence; no [rhodes-voice] lines
  });
  if (result.ok) return { ok: true, attempts: result.attempts, ms: result.ms };
  return { ok: false, category: result.category, upstreamStatus: result.upstreamStatus, attempts: result.attempts, ms: result.ms };
};

export async function runServerHealth(env: Record<string, string | undefined> = process.env): Promise<ServerHealthReport> {
  const started = Date.now();
  const controller = new AbortController();
  const budget = setTimeout(() => controller.abort(), THRESHOLDS.serverBudgetMs);
  try {
    const reader = postgrestReader(env, controller.signal);
    const siteUrl = env.NEXT_PUBLIC_SITE_URL ?? null;

    const supabase: Promise<BoundaryResult> = reader
      ? runSupabaseChecks({ reader })
      : Promise.resolve({
          boundary: "supabase",
          status: "FAIL",
          ms: 0,
          checks: [{ id: "configuration", status: "FAIL", summary: "Supabase URL, anon key or service-role key missing" }],
        });

    const [supabaseR, stripeR, pipelineR, rhodesR] = await Promise.all([
      supabase,
      runStripeChecks({ env, stripe: stripeReader(), reader, siteUrl }),
      runPipelineChecks({ env, reader, generatorVersion: SENTINEL_GENERATOR_VERSION }),
      runRhodesChecks({ env, fetchImpl: fetch, mint: productionMinter }),
    ]);

    const report: ServerHealthReport = {
      schemaVersion: SENTINEL_SCHEMA_VERSION,
      kind: "server",
      generatedAt: new Date().toISOString(),
      deployment: readDeploymentIdentity(env),
      boundaries: [supabaseR, stripeR, pipelineR, rhodesR],
      ms: Date.now() - started,
    };
    return sanitizeDeep(report);
  } finally {
    clearTimeout(budget);
  }
}
