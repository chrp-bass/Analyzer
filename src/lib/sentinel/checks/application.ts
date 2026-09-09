/**
 * Boundary 1 — the application, probed from OUTSIDE (the CLI / GitHub
 * Actions), so DNS, TLS, the Vercel edge and the alias are all on the path.
 *
 * Pure module: no `@/` imports, no Node-only APIs. The CLI loads it under tsx.
 */

import { boundaryResult, runCheck, type CheckOutcome } from "../evaluate";
import { httpRequest, type FetchLike } from "../http";
import { sanitizeText } from "../redact";
import { THRESHOLDS } from "../thresholds";
import type { BoundaryResult, CheckResult, CheckStatus, Evidence } from "../types";

export interface PublicRoute {
  path: string;
  /** When set, the route must answer a redirect to exactly this location. */
  redirectTo?: string;
}

/** Critical public routes. `/privacy` and `/terms` deliberately redirect to chrp.ai. */
export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  { path: "/" },
  { path: "/scan" },
  { path: "/methodology" },
  { path: "/contact" },
  { path: "/signin" },
  { path: "/privacy", redirectTo: "https://chrp.ai/privacy" },
  { path: "/terms", redirectTo: "https://chrp.ai/terms" },
];

const REDIRECT_STATUSES = new Set([301, 302, 307, 308]);

export interface ApiProbe {
  id: string;
  method: "GET" | "POST";
  path: string;
  body?: string;
  /** Acceptable statuses. Anything else — 404 and 5xx above all — is FAIL. */
  expect: readonly number[];
  /** Optional JSON `error` value the body must carry. */
  expectError?: string;
  why: string;
}

/**
 * Controlled invalid / unauthorized probes. Each must answer with its own
 * typed 4xx: a 404 means a route vanished; a 5xx means a guard crashed.
 */
export const API_PROBES: readonly ApiProbe[] = [
  { id: "report_forbidden", method: "GET", path: "/api/report/scn_probe", expect: [403], expectError: "forbidden", why: "paid report without identity is the opaque 403" },
  { id: "rhodes_session_invalid_body", method: "POST", path: "/api/rhodes/session", body: "{}", expect: [400], expectError: "invalid_body", why: "voice route validates before touching entitlement or ElevenLabs" },
  { id: "rhodes_outcome_invalid_body", method: "POST", path: "/api/rhodes/session/outcome", body: "{}", expect: [400], why: "telemetry route rejects an empty event" },
  { id: "stripe_webhook_unsigned", method: "POST", path: "/api/stripe/webhook", body: "{}", expect: [400], expectError: "missing signature", why: "unsigned webhook bodies are refused before parsing" },
  { id: "checkout_unknown_offer", method: "POST", path: "/api/checkout", body: "{}", expect: [400], expectError: "unknown offer", why: "checkout refuses before any Stripe call" },
  { id: "scan_prepare_invalid_get", method: "GET", path: "/api/scan/prepare?scanId=bogus", expect: [400], expectError: "invalid scanId", why: "readiness read rejects a malformed scan id" },
  { id: "scan_prepare_invalid_post", method: "POST", path: "/api/scan/prepare", body: '{"scanId":"bogus"}', expect: [400], expectError: "invalid scanId", why: "preparation rejects a malformed scan id before identity" },
  { id: "song_search_missing_query", method: "GET", path: "/api/song-api/search", expect: [400], why: "search validates input before Spotify" },
  { id: "dev_bridge_hidden", method: "POST", path: "/api/scan-report", body: "{}", expect: [404], expectError: "not_found", why: "the fixture generation bridge must be unreachable in production (404 is the correct answer here)" },
  { id: "health_requires_monitor_secret", method: "GET", path: "/api/health/production", expect: [403], expectError: "forbidden", why: "the sentinel surface refuses callers without the monitor secret" },
];

export interface ApplicationCheckDeps {
  baseUrl: string;
  fetchImpl: FetchLike;
  now?: () => number;
  requestTimeoutMs?: number;
  checkTimeoutMs?: number;
}

export async function runApplicationChecks(deps: ApplicationCheckDeps): Promise<BoundaryResult> {
  const now = deps.now ?? (() => Date.now());
  const base = deps.baseUrl.replace(/\/$/, "");
  const requestTimeout = deps.requestTimeoutMs ?? THRESHOLDS.requestTimeoutMs;
  const timeout = deps.checkTimeoutMs ?? THRESHOLDS.checkTimeoutMs * 3;
  const started = now();
  const opts = { now, sanitize: sanitizeText };

  const root = runCheck("dns_tls_root", timeout, async (signal): Promise<CheckOutcome> => {
    const res = await httpRequest(deps.fetchImpl, { url: `${base}/`, timeoutMs: requestTimeout, signal }, now);
    if (!res.ok) return { status: "FAIL" as CheckStatus, summary: `root fetch failed: ${res.kind}`, evidence: { kind: res.kind } };
    const vercelId = res.headers.get("x-vercel-id");
    const html = (res.headers.get("content-type") ?? "").includes("text/html");
    const evidence: Evidence = { status: res.status, ms: Math.round(res.ms), servedByVercel: Boolean(vercelId), html };
    if (res.status !== 200) return { status: "FAIL" as CheckStatus, summary: `root answered ${res.status}`, evidence };
    if (!html) return { status: "FAIL" as CheckStatus, summary: "root did not serve HTML", evidence };
    if (!vercelId) return { status: "WARN" as CheckStatus, summary: "root served, but not through the Vercel edge (no x-vercel-id)", evidence };
    return { status: latencyStatus(res.ms), summary: `root resolves and serves HTML through Vercel in ${Math.round(res.ms)}ms`, evidence };
  }, opts);

  const routes = runCheck("public_routes", timeout, async (signal): Promise<CheckOutcome> => {
    const results = await Promise.all(
      PUBLIC_ROUTES.map(async (route) => {
        const res = await httpRequest(deps.fetchImpl, { url: `${base}${route.path}`, timeoutMs: requestTimeout, signal }, now);
        return { route, res };
      }),
    );
    const failures: string[] = [];
    const slow: string[] = [];
    let maxMs = 0;
    for (const { route, res } of results) {
      const { path } = route;
      if (!res.ok) {
        failures.push(`${path}:${res.kind}`);
        continue;
      }
      maxMs = Math.max(maxMs, res.ms);
      if (route.redirectTo) {
        const location = res.headers.get("location") ?? "";
        if (!REDIRECT_STATUSES.has(res.status)) failures.push(`${path}:${res.status}`);
        else if (location !== route.redirectTo) failures.push(`${path}:redirect_elsewhere`);
      } else if (res.status !== 200) failures.push(`${path}:${res.status}`);
      else if (!(res.headers.get("content-type") ?? "").includes("text/html")) failures.push(`${path}:not_html`);
      if (res.ms > THRESHOLDS.routeLatencyFailMs) failures.push(`${path}:slow_${Math.round(res.ms)}ms`);
      else if (res.ms > THRESHOLDS.routeLatencyWarnMs) slow.push(`${path}:${Math.round(res.ms)}ms`);
    }
    const evidence: Evidence = { routes: PUBLIC_ROUTES.length, failures, slow, maxMs: Math.round(maxMs), warnAboveMs: THRESHOLDS.routeLatencyWarnMs, failAboveMs: THRESHOLDS.routeLatencyFailMs };
    if (failures.length) return { status: "FAIL" as CheckStatus, summary: `public routes failing: ${failures.join(", ")}`, evidence };
    if (slow.length) return { status: "WARN" as CheckStatus, summary: `public routes slow: ${slow.join(", ")}`, evidence };
    return { status: "PASS" as CheckStatus, summary: `all ${PUBLIC_ROUTES.length} public routes answer as expected (max ${Math.round(maxMs)}ms)`, evidence };
  }, opts);

  const probes = runCheck("api_guards", timeout, async (signal): Promise<CheckOutcome> => {
    const results = await Promise.all(
      API_PROBES.map(async (probe) => {
        const res = await httpRequest(deps.fetchImpl, {
          url: `${base}${probe.path}`,
          method: probe.method,
          headers: probe.body !== undefined ? { "Content-Type": "application/json" } : undefined,
          body: probe.body,
          timeoutMs: requestTimeout,
          signal,
        }, now);
        return { probe, res };
      }),
    );
    const failures: string[] = [];
    let serverErrors = 0;
    let maxMs = 0;
    for (const { probe, res } of results) {
      if (!res.ok) {
        failures.push(`${probe.id}:${res.kind}`);
        continue;
      }
      maxMs = Math.max(maxMs, res.ms);
      if (res.status >= 500) serverErrors += 1;
      if (!probe.expect.includes(res.status)) {
        failures.push(`${probe.id}:expected_${probe.expect.join("|")}_got_${res.status}`);
        continue;
      }
      if (probe.expectError) {
        const err = res.json && typeof res.json === "object" ? (res.json as { error?: unknown }).error : undefined;
        if (err !== probe.expectError) failures.push(`${probe.id}:unexpected_error_body`);
      }
    }
    const evidence: Evidence = { probes: API_PROBES.length, failures, serverErrors, maxMs: Math.round(maxMs) };
    if (failures.length) {
      return { status: "FAIL" as CheckStatus, summary: `API guards misbehaving: ${failures.join(", ")}`, evidence };
    }
    return { status: "PASS" as CheckStatus, summary: `all ${API_PROBES.length} invalid/unauthorized probes answered their expected 4xx; no 5xx`, evidence };
  }, opts);

  const anonymousCatalog = runCheck("anonymous_catalog", timeout, async (signal): Promise<CheckOutcome> => {
    const res = await httpRequest(deps.fetchImpl, { url: `${base}/api/catalog`, timeoutMs: requestTimeout, signal }, now);
    if (!res.ok) return { status: "FAIL" as CheckStatus, summary: `catalog fetch failed: ${res.kind}` };
    const body = res.json as { identified?: unknown; catalog?: unknown } | undefined;
    const evidence: Evidence = { status: res.status, ms: Math.round(res.ms) };
    if (res.status !== 200) return { status: "FAIL" as CheckStatus, summary: `anonymous catalog answered ${res.status}`, evidence };
    if (body?.identified !== false || !Array.isArray(body?.catalog) || body.catalog.length !== 0) {
      return { status: "FAIL" as CheckStatus, summary: "anonymous catalog did not return an empty, unidentified catalog", evidence };
    }
    return { status: "PASS" as CheckStatus, summary: "anonymous caller gets an empty catalog (Supabase-backed route is up)", evidence };
  }, opts);

  const vercelEvidence: CheckResult = {
    id: "vercel_error_rate",
    status: "NOT_EXERCISED",
    summary: "Vercel 5xx rate and latency history need a Vercel API token; the sentinel keeps vendor tokens out of GitHub, so only its own probe latencies are reported",
  };

  const checks: CheckResult[] = [...(await Promise.all([root, routes, probes, anonymousCatalog])), vercelEvidence];
  return boundaryResult("application", checks, now() - started);
}

function latencyStatus(ms: number): CheckStatus {
  if (ms > THRESHOLDS.routeLatencyFailMs) return "FAIL";
  if (ms > THRESHOLDS.routeLatencyWarnMs) return "WARN";
  return "PASS";
}
