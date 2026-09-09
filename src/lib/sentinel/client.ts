/**
 * The sentinel orchestrator behind `npm run health:production`.
 *
 *   1. probes the application from outside (boundary 1);
 *   2. calls the protected Vercel-side surface for boundaries 2–5, which run
 *      where the vendor secrets already live;
 *   3. verifies the alias serves the expected deployment (retrying briefly
 *      while a fresh production alias settles);
 *   4. merges, sanitises and rolls up to GREEN / YELLOW / RED.
 *
 * Pure module (no `@/` imports, no Node-only APIs) — loaded by tsx.
 */

import { runApplicationChecks } from "./checks/application";
import { boundaryResult, overallStatus } from "./evaluate";
import { httpRequest, type FetchLike } from "./http";
import { sanitizeDeep, sanitizeText } from "./redact";
import { THRESHOLDS } from "./thresholds";
import {
  SENTINEL_SCHEMA_VERSION,
  type BoundaryId,
  type BoundaryResult,
  type CheckResult,
  type DeploymentIdentity,
  type SentinelReport,
  type ServerHealthReport,
} from "./types";

export const HEALTH_PATH = "/api/health/production";
export const SERVER_BOUNDARIES: readonly BoundaryId[] = ["supabase", "stripe", "pipeline", "rhodes"];

export interface SentinelClientDeps {
  baseUrl: string;
  monitorSecret: string | null;
  expectedSha: string | null;
  fetchImpl: FetchLike;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  serverTimeoutMs?: number;
  settleAttempts?: number;
  settleDelayMs?: number;
}

type ServerFetch =
  | { ok: true; report: ServerHealthReport; ms: number }
  | { ok: false; reason: "no_secret" | "forbidden" | "not_configured" | "route_missing" | "server_error" | "malformed" | "timeout" | "network"; status?: number; ms: number };

export function isServerHealthReport(v: unknown): v is ServerHealthReport {
  if (!v || typeof v !== "object") return false;
  const r = v as Partial<ServerHealthReport>;
  return (
    r.schemaVersion === SENTINEL_SCHEMA_VERSION &&
    r.kind === "server" &&
    typeof r.generatedAt === "string" &&
    !!r.deployment &&
    typeof r.deployment === "object" &&
    Array.isArray(r.boundaries) &&
    r.boundaries.every((b) => b && typeof b === "object" && typeof (b as BoundaryResult).boundary === "string" && Array.isArray((b as BoundaryResult).checks))
  );
}

async function fetchServerHealth(deps: SentinelClientDeps, now: () => number): Promise<ServerFetch> {
  if (!deps.monitorSecret) return { ok: false, reason: "no_secret", ms: 0 };
  const res = await httpRequest(
    deps.fetchImpl,
    {
      url: `${deps.baseUrl.replace(/\/$/, "")}${HEALTH_PATH}`,
      headers: { Authorization: `Bearer ${deps.monitorSecret}`, Accept: "application/json" },
      timeoutMs: deps.serverTimeoutMs ?? THRESHOLDS.serverBudgetMs + 10_000,
    },
    now,
  );
  if (!res.ok) return { ok: false, reason: res.kind, ms: res.ms };
  if (res.status === 403 || res.status === 401) return { ok: false, reason: "forbidden", status: res.status, ms: res.ms };
  if (res.status === 503) return { ok: false, reason: "not_configured", status: res.status, ms: res.ms };
  if (res.status === 404 || res.status === 405) return { ok: false, reason: "route_missing", status: res.status, ms: res.ms };
  if (res.status !== 200) return { ok: false, reason: "server_error", status: res.status, ms: res.ms };
  if (!isServerHealthReport(res.json)) return { ok: false, reason: "malformed", status: res.status, ms: res.ms };
  return { ok: true, report: res.json, ms: res.ms };
}

const SERVER_FAILURE_SUMMARY: Record<Exclude<ServerFetch, { ok: true }>["reason"], string> = {
  no_secret: "HEALTH_MONITOR_SECRET not provided to the sentinel; vendor boundaries cannot be checked",
  forbidden: "the production health surface rejected the monitor secret",
  not_configured: "the production health surface reports HEALTH_MONITOR_SECRET is not configured on Vercel",
  route_missing: "the production deployment has no /api/health/production route (predates the sentinel?)",
  server_error: "the production health surface returned a server error",
  malformed: "the production health surface returned an unrecognised document",
  timeout: "the production health surface timed out",
  network: "the production health surface could not be reached",
};

function unavailableBoundaries(failure: Exclude<ServerFetch, { ok: true }>): BoundaryResult[] {
  return SERVER_BOUNDARIES.map((boundary) =>
    boundaryResult(
      boundary,
      [
        {
          id: "server_health_surface",
          status: "FAIL",
          summary: SERVER_FAILURE_SUMMARY[failure.reason],
          evidence: { reason: failure.reason, status: failure.status ?? null },
        },
      ],
      failure.ms,
    ),
  );
}

const UNKNOWN_DEPLOYMENT: DeploymentIdentity = { sha: null, deploymentId: null, env: null, region: null, ref: null };

export async function runSentinel(deps: SentinelClientDeps): Promise<SentinelReport> {
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const started = now();
  const expectedSha = deps.expectedSha?.trim().toLowerCase() || null;

  const applicationP = runApplicationChecks({ baseUrl: deps.baseUrl, fetchImpl: deps.fetchImpl, now });

  // Server side, with a short settle loop while the alias moves to the
  // expected deployment. Only a SHA mismatch is retried; failures are final.
  const attempts = deps.settleAttempts ?? THRESHOLDS.shaSettleAttempts;
  const delay = deps.settleDelayMs ?? THRESHOLDS.shaSettleDelayMs;
  let server = await fetchServerHealth(deps, now);
  let settleTries = 1;
  while (expectedSha && server.ok && !shaMatches(server.report.deployment.sha, expectedSha) && settleTries < attempts) {
    await sleep(delay);
    server = await fetchServerHealth(deps, now);
    settleTries += 1;
  }

  const application = await applicationP;
  const deployment = server.ok ? server.report.deployment : UNKNOWN_DEPLOYMENT;

  const identity: CheckResult = ((): CheckResult => {
    if (!server.ok) {
      return { id: "deployment_identity", status: "FAIL", summary: "deployment identity unavailable: " + SERVER_FAILURE_SUMMARY[server.reason], evidence: { expectedSha } };
    }
    const sha = deployment.sha;
    if (expectedSha) {
      if (!sha) return { id: "deployment_identity", status: "FAIL", summary: "expected a deployment SHA but the deployment does not expose one", evidence: { expectedSha } };
      if (!shaMatches(sha, expectedSha)) {
        return { id: "deployment_identity", status: "FAIL", summary: `alias serves ${sha.slice(0, 7)}, expected ${expectedSha.slice(0, 7)} after ${settleTries} attempt(s)`, evidence: { sha, expectedSha, settleAttempts: settleTries } };
      }
      return { id: "deployment_identity", status: "PASS", summary: `alias serves the expected deployment ${sha.slice(0, 7)}`, evidence: { sha, expectedSha, deploymentId: deployment.deploymentId, env: deployment.env, settleAttempts: settleTries } };
    }
    if (!sha) return { id: "deployment_identity", status: "WARN", summary: "deployment does not expose its git SHA (Vercel system env not exposed?)", evidence: { deploymentId: deployment.deploymentId } };
    const prod = deployment.env === null || deployment.env === "production";
    return {
      id: "deployment_identity",
      status: prod ? "PASS" : "FAIL",
      summary: prod ? `alias serves deployment ${sha.slice(0, 7)} (${deployment.env ?? "env unknown"})` : `alias serves a non-production deployment (${deployment.env})`,
      evidence: { sha, deploymentId: deployment.deploymentId, env: deployment.env, region: deployment.region },
    };
  })();
  application.checks.push(identity);
  const applicationFinal = boundaryResult("application", application.checks, application.ms);

  const serverBoundaries = server.ok ? server.report.boundaries : unavailableBoundaries(server);
  const boundaries = [applicationFinal, ...serverBoundaries];

  const report: SentinelReport = {
    schemaVersion: SENTINEL_SCHEMA_VERSION,
    kind: "sentinel",
    generatedAt: new Date(now()).toISOString(),
    target: { baseUrl: deps.baseUrl, expectedSha },
    overall: overallStatus(boundaries),
    deployment,
    boundaries,
    ms: Math.max(0, Math.round(now() - started)),
  };
  return sanitizeDeep(report);
}

function shaMatches(actual: string | null, expected: string): boolean {
  if (!actual) return false;
  const a = actual.toLowerCase();
  return a === expected || a.startsWith(expected) || expected.startsWith(a);
}

/** Exit code policy: RED (or YELLOW under --strict) fails the process. */
export function exitCodeFor(report: SentinelReport, strict: boolean): number {
  if (report.overall === "RED") return 1;
  if (report.overall === "YELLOW" && strict) return 1;
  return 0;
}

export { sanitizeText };
