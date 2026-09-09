/**
 * CHRP Analyzer Production Sentinel — result schema.
 *
 * One versioned JSON shape for every run. `schemaVersion` changes only when
 * a consumer of the JSON (the workflow summary, a dashboard) would break.
 *
 * Status vocabulary:
 *
 *   PASS           the invariant held
 *   WARN           degraded or drifting, but the product works
 *   FAIL           the invariant is broken
 *   NOT_EXERCISED  the dependency cannot be tested without cost or mutation,
 *                  or the evidence surface does not exist. Honest, never PASS.
 *
 * Rollup: any FAIL → RED; else any WARN → YELLOW; else GREEN.
 * NOT_EXERCISED never changes the colour on its own.
 *
 * Pure module: no Next, no Node-only imports, so both the Vercel route and
 * the CLI share it.
 */

export const SENTINEL_SCHEMA_VERSION = 1 as const;

export type CheckStatus = "PASS" | "WARN" | "FAIL" | "NOT_EXERCISED";
export type OverallStatus = "GREEN" | "YELLOW" | "RED";

export type BoundaryId = "application" | "supabase" | "stripe" | "pipeline" | "rhodes";

/** Evidence is a flat, sanitised bag of scalars — never identities or content. */
export type EvidenceValue = string | number | boolean | null | readonly string[];
export type Evidence = Record<string, EvidenceValue>;

export interface CheckResult {
  id: string;
  status: CheckStatus;
  /** One sentence, sanitised. */
  summary: string;
  ms?: number;
  evidence?: Evidence;
}

export interface BoundaryResult {
  boundary: BoundaryId;
  status: CheckStatus;
  ms: number;
  checks: CheckResult[];
}

/** Which production deployment answered. Read from Vercel system env. */
export interface DeploymentIdentity {
  sha: string | null;
  deploymentId: string | null;
  env: string | null;
  region: string | null;
  ref: string | null;
}

/** What the protected Vercel-side surface returns. */
export interface ServerHealthReport {
  schemaVersion: typeof SENTINEL_SCHEMA_VERSION;
  kind: "server";
  generatedAt: string;
  deployment: DeploymentIdentity;
  boundaries: BoundaryResult[];
  ms: number;
}

/** What `npm run health:production` emits. */
export interface SentinelReport {
  schemaVersion: typeof SENTINEL_SCHEMA_VERSION;
  kind: "sentinel";
  generatedAt: string;
  target: { baseUrl: string; expectedSha: string | null };
  overall: OverallStatus;
  deployment: DeploymentIdentity;
  boundaries: BoundaryResult[];
  ms: number;
}

export const BOUNDARY_ORDER: readonly BoundaryId[] = [
  "application",
  "supabase",
  "stripe",
  "pipeline",
  "rhodes",
];
