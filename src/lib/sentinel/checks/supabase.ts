/**
 * Boundary 2 — Supabase (production Postgres through PostgREST).
 *
 * Read-only, aggregates only. Rows are fetched into memory for duplicate
 * detection and discarded; no identity, report content or internal id is
 * ever placed in a result.
 */

import { boundaryResult, runCheck, type CheckOutcome } from "../evaluate";
import type { PostgrestReader } from "../postgrest";
import { sanitizeText } from "../redact";
import { THRESHOLDS } from "../thresholds";
import type { BoundaryResult, CheckResult, CheckStatus, Evidence } from "../types";

export const REQUIRED_TABLES = [
  "creators",
  "songs",
  "analyses",
  "reports",
  "report_claims",
  "entitlements",
  "entitlement_tracks",
  "stripe_events",
] as const;

/** The four lease RPCs and their argument names (all passed as null in probes). */
export const LEASE_RPCS: ReadonlyArray<{ fn: string; args: readonly string[] }> = [
  { fn: "claim_report_lease", args: ["p_creator", "p_scan", "p_worker", "p_version", "p_stale_seconds"] },
  { fn: "renew_report_lease", args: ["p_creator", "p_scan", "p_worker", "p_token"] },
  { fn: "complete_report", args: ["p_creator", "p_scan", "p_worker", "p_token", "p_analysis", "p_payload", "p_version", "p_model"] },
  { fn: "release_report_lease", args: ["p_creator", "p_scan", "p_worker", "p_token"] },
];

/**
 * What a client (anon) must be able to see of each table.
 *   denied → table privileges revoked: PostgREST answers 401/403 (42501)
 *   empty  → RLS on with no applicable policy: 200 and zero rows
 * Either proves no client can read; `rows` is the failure.
 */
export const ANON_EXPECTATIONS: ReadonlyArray<{ table: string; column: string; expect: "denied" | "empty" }> = [
  { table: "report_claims", column: "fence", expect: "denied" },
  { table: "reports", column: "generator_version", expect: "empty" },
  { table: "entitlements", column: "offer", expect: "empty" },
  { table: "stripe_events", column: "type", expect: "empty" },
];

export interface SupabaseCheckDeps {
  reader: PostgrestReader;
  now?: () => number;
  checkTimeoutMs?: number;
}

type EntitlementRow = {
  user_id: string;
  scan_id: string | null;
  offer: string;
  stripe_checkout_session_id: string;
  status: string;
  track_limit: number | null;
  id: string;
};
type ReportRow = { creator_id: string; scan_id: string; analysis_id: string };
type TrackRow = { entitlement_id: string };

function failureSummary(prefix: string, f: { kind: string; status?: number; code?: string }): string {
  const bits = [f.kind];
  if (f.status !== undefined) bits.push(`status=${f.status}`);
  if (f.code) bits.push(`code=${f.code}`);
  return `${prefix}: ${bits.join(" ")}`;
}

export async function runSupabaseChecks(deps: SupabaseCheckDeps): Promise<BoundaryResult> {
  const now = deps.now ?? (() => Date.now());
  const timeout = deps.checkTimeoutMs ?? THRESHOLDS.checkTimeoutMs;
  const started = now();
  const r = deps.reader;
  const opts = { now, sanitize: sanitizeText };

  const connectivity = runCheck("connectivity_and_schema", timeout, async (): Promise<CheckOutcome> => {
    const api = await r.openapiPaths();
    if (!api.ok) {
      return {
        status: "FAIL" as CheckStatus,
        summary: failureSummary("PostgREST unreachable or refused the service role", api),
        evidence: { kind: api.kind, status: api.status ?? null },
      };
    }
    const present = new Set(api.paths.map((p) => p.replace(/^\//, "").split("?")[0]));
    const missing = REQUIRED_TABLES.filter((t) => !present.has(t));
    return {
      status: missing.length ? ("FAIL" as CheckStatus) : ("PASS" as CheckStatus),
      summary: missing.length
        ? `required tables missing from the exposed schema: ${missing.join(", ")}`
        : `connected; all ${REQUIRED_TABLES.length} required tables exposed`,
      evidence: { requiredTables: REQUIRED_TABLES.length, missingTables: missing },
    };
  }, opts);

  const rpcs = runCheck("lease_rpcs_exist", timeout, async (): Promise<CheckOutcome> => {
    const missing: string[] = [];
    const unexpected: string[] = [];
    for (const { fn, args } of LEASE_RPCS) {
      const probe = await r.rpcNullProbe(fn, args, "service");
      if (!probe.ok) {
        return { status: "FAIL" as CheckStatus, summary: failureSummary(`probe of ${fn} failed`, probe) };
      }
      // PGRST202 = no such function in the schema cache. A present function
      // rejects null arguments with P0001 ("invalid arguments") → HTTP 400.
      if (probe.status === 404 || probe.code === "PGRST202") missing.push(fn);
      else if (!(probe.status === 400 && (probe.code === "P0001" || probe.code === undefined))) {
        unexpected.push(`${fn}:${probe.status}${probe.code ? `/${probe.code}` : ""}`);
      }
    }
    if (missing.length) {
      return { status: "FAIL" as CheckStatus, summary: `lease RPCs missing: ${missing.join(", ")}`, evidence: { missing, unexpected } };
    }
    if (unexpected.length) {
      return { status: "WARN" as CheckStatus, summary: `lease RPCs answered unexpectedly to a null-argument probe: ${unexpected.join(", ")}`, evidence: { unexpected } };
    }
    return { status: "PASS" as CheckStatus, summary: "all four lease RPCs exist and reject null arguments", evidence: { rpcs: LEASE_RPCS.map((x) => x.fn) } };
  }, opts);

  const rls = runCheck("rls_client_isolation", timeout, async (): Promise<CheckOutcome> => {
    const problems: string[] = [];
    const notes: string[] = [];
    for (const { table, column, expect } of ANON_EXPECTATIONS) {
      const res = await r.anonSelect(table, column);
      if (!res.ok) {
        return { status: "FAIL" as CheckStatus, summary: failureSummary(`anon probe of ${table} failed`, res) };
      }
      const denied = res.status === 401 || res.status === 403;
      const empty = res.status === 200 && res.rowCount === 0;
      if (res.status === 200 && res.rowCount > 0) problems.push(`${table}:anon_can_read_rows`);
      else if (expect === "denied" && !denied) {
        if (empty) notes.push(`${table}:grants_not_revoked`);
        else problems.push(`${table}:status_${res.status}`);
      } else if (expect === "empty" && !denied && !empty) problems.push(`${table}:status_${res.status}`);
    }
    // The lease RPCs must not be executable by anon at all (42501 → 401/403).
    for (const { fn, args } of LEASE_RPCS) {
      const probe = await r.rpcNullProbe(fn, args, "anon");
      if (!probe.ok) return { status: "FAIL" as CheckStatus, summary: failureSummary(`anon RPC probe of ${fn} failed`, probe) };
      if (probe.status === 401 || probe.status === 403) continue;
      if (probe.status === 404) continue; // PostgREST hides functions the role cannot see
      problems.push(`${fn}:anon_executable_status_${probe.status}`);
    }
    if (problems.length) {
      return { status: "FAIL" as CheckStatus, summary: `client isolation broken: ${problems.join(", ")}`, evidence: { problems, notes } };
    }
    return {
      status: notes.length ? ("WARN" as CheckStatus) : ("PASS" as CheckStatus),
      summary: notes.length
        ? `anon reads nothing, but: ${notes.join(", ")}`
        : "anon role cannot read reports, entitlements, claims or the Stripe ledger, and cannot execute the lease RPCs",
      evidence: { tablesProbed: ANON_EXPECTATIONS.length, rpcsProbed: LEASE_RPCS.length, notes },
    };
  }, opts);

  const claims = runCheck("report_claims_stale", timeout, async (): Promise<CheckOutcome> => {
    const t = now();
    const staleBefore = new Date(t - THRESHOLDS.staleClaimMs).toISOString();
    const abandonedBefore = new Date(t - THRESHOLDS.abandonedClaimMs).toISOString();
    const [total, stale, abandoned] = await Promise.all([
      r.count("report_claims"),
      r.count("report_claims", `claimed_at=lt.${encodeURIComponent(staleBefore)}`),
      r.count("report_claims", `claimed_at=lt.${encodeURIComponent(abandonedBefore)}`),
    ]);
    for (const c of [total, stale, abandoned]) {
      if (!c.ok) return { status: "FAIL" as CheckStatus, summary: failureSummary("could not count report_claims", c) };
    }
    const evidence: Evidence = {
      activeClaims: (total as { count: number }).count,
      staleClaims: (stale as { count: number }).count,
      abandonedClaims: (abandoned as { count: number }).count,
      staleThresholdMs: THRESHOLDS.staleClaimMs,
      abandonedThresholdMs: THRESHOLDS.abandonedClaimMs,
    };
    if ((abandoned as { count: number }).count > 0) {
      return { status: "FAIL" as CheckStatus, summary: `${evidence.abandonedClaims} report claim(s) older than ${THRESHOLDS.abandonedClaimMs / 60000} min — a lease was never released`, evidence };
    }
    if ((stale as { count: number }).count > 0) {
      return { status: "WARN" as CheckStatus, summary: `${evidence.staleClaims} report claim(s) past the ${THRESHOLDS.staleClaimMs / 1000}s lease TTL`, evidence };
    }
    return { status: "PASS" as CheckStatus, summary: `no stale report claims (${evidence.activeClaims} live)`, evidence };
  }, opts);

  const duplicates = runCheck("duplicate_anomalies", timeout, async (): Promise<CheckOutcome> => {
    const cap = THRESHOLDS.duplicateScanCap;
    const [ents, reps, tracks] = await Promise.all([
      r.rows<EntitlementRow>("entitlements", "id,user_id,scan_id,offer,stripe_checkout_session_id,status,track_limit", undefined, cap),
      r.rows<ReportRow>("reports", "creator_id,scan_id,analysis_id", undefined, cap),
      r.rows<TrackRow>("entitlement_tracks", "entitlement_id", undefined, cap * 4),
    ]);
    for (const x of [ents, reps, tracks]) {
      if (!x.ok) return { status: "FAIL" as CheckStatus, summary: failureSummary("could not read rows for anomaly detection", x) };
    }
    const e = (ents as { rows: EntitlementRow[]; truncated: boolean });
    const p = (reps as { rows: ReportRow[]; truncated: boolean });
    const tr = (tracks as { rows: TrackRow[]; truncated: boolean });

    const dupSongEntitlements = countDuplicates(
      e.rows.filter((x) => x.offer === "song_intelligence" && x.scan_id).map((x) => `${x.user_id}|${x.scan_id}`),
    );
    const dupSessions = countDuplicates(e.rows.map((x) => x.stripe_checkout_session_id));
    const songWithoutScan = e.rows.filter((x) => x.offer === "song_intelligence" && !x.scan_id).length;
    const dupReports = countDuplicates(p.rows.map((x) => `${x.creator_id}|${x.scan_id}`));
    const dupReportAnalyses = countDuplicates(p.rows.map((x) => x.analysis_id));

    const attached = new Map<string, number>();
    for (const t of tr.rows) attached.set(t.entitlement_id, (attached.get(t.entitlement_id) ?? 0) + 1);
    let overAllowance = 0;
    for (const x of e.rows) {
      if (x.offer !== "creator_intelligence" || x.track_limit === null) continue;
      if ((attached.get(x.id) ?? 0) > x.track_limit) overAllowance += 1;
    }

    const anomalies = dupSongEntitlements + dupSessions + songWithoutScan + dupReports + dupReportAnalyses + overAllowance;
    const evidence: Evidence = {
      entitlementsScanned: e.rows.length,
      reportsScanned: p.rows.length,
      tracksScanned: tr.rows.length,
      sampled: e.truncated || p.truncated || tr.truncated,
      duplicateSongEntitlements: dupSongEntitlements,
      duplicateCheckoutSessions: dupSessions,
      songEntitlementsWithoutScan: songWithoutScan,
      duplicateReports: dupReports,
      duplicateReportAnalyses: dupReportAnalyses,
      creatorEntitlementsOverAllowance: overAllowance,
    };
    if (anomalies > 0) {
      return { status: "FAIL" as CheckStatus, summary: `${anomalies} duplicate/entitlement anomaly(ies) found`, evidence };
    }
    return {
      status: "PASS" as CheckStatus,
      summary: `no duplicate report or entitlement anomalies${evidence.sampled ? " (sampled)" : ""}`,
      evidence,
    };
  }, opts);

  const checks: CheckResult[] = await Promise.all([connectivity, rpcs, rls, claims, duplicates]);
  return boundaryResult("supabase", checks, now() - started);
}

/** Number of extra occurrences beyond the first, summed across keys. */
export function countDuplicates(keys: readonly string[]): number {
  const seen = new Map<string, number>();
  for (const k of keys) seen.set(k, (seen.get(k) ?? 0) + 1);
  let dup = 0;
  seen.forEach((n) => {
    if (n > 1) dup += n - 1;
  });
  return dup;
}
