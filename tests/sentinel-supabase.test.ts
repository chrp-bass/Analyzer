/**
 * Boundary 2 — Supabase, against an injected PostgREST reader; and the real
 * reader against a fake fetch (count parsing, OpenAPI parsing, failures).
 */

import { describe, expect, it } from "vitest";
import type { CheckResult } from "@/lib/sentinel/types";
import { countDuplicates, runSupabaseChecks } from "@/lib/sentinel/checks/supabase";
import { createPostgrestReader } from "@/lib/sentinel/postgrest";
import { THRESHOLDS } from "@/lib/sentinel/thresholds";
import { fakeReader, hangingFetch, healthyPaths, jsonResponse, leaks, SECRETS } from "./support/sentinel-fakes";

const byId = (r: { checks: CheckResult[] }, id: string): CheckResult => r.checks.find((c) => c.id === id)!;
const T0 = Date.parse("2026-09-08T12:00:00Z");

describe("runSupabaseChecks", () => {
  it("healthy: connectivity, RPCs, isolation, claims and duplicates all PASS", async () => {
    const reader = fakeReader();
    const r = await runSupabaseChecks({ reader, now: () => T0 });
    expect(r.boundary).toBe("supabase");
    expect(r.status).toBe("PASS");
    expect(r.checks.map((c) => [c.id, c.status])).toEqual([
      ["connectivity_and_schema", "PASS"],
      ["lease_rpcs_exist", "PASS"],
      ["rls_client_isolation", "PASS"],
      ["report_claims_stale", "PASS"],
      ["duplicate_anomalies", "PASS"],
    ]);
    // The four RPCs were probed as BOTH roles, with null arguments only.
    expect(reader.calls.filter((c) => c.startsWith("rpc:") && c.endsWith(":service"))).toHaveLength(4);
    expect(reader.calls.filter((c) => c.startsWith("rpc:") && c.endsWith(":anon"))).toHaveLength(4);
  });

  it("a missing table or RPC is FAIL, naming what is missing", async () => {
    const paths = healthyPaths().filter((p) => p !== "/report_claims");
    const r = await runSupabaseChecks({
      reader: fakeReader({ paths, rpc: (fn, role) => (fn === "complete_report" && role === "service" ? { status: 404, code: "PGRST202" } : undefined as never) }),
    });
    expect(byId(r, "connectivity_and_schema")).toMatchObject({ status: "FAIL", evidence: { missingTables: ["report_claims"] } });
    expect(byId(r, "lease_rpcs_exist")).toMatchObject({ status: "FAIL", evidence: { missing: ["complete_report"] } });
    expect(r.status).toBe("FAIL");
  });

  it("PostgREST unreachable / malformed OpenAPI is FAIL, not a crash", async () => {
    const down = await runSupabaseChecks({ reader: fakeReader({ failOpenapi: { kind: "network" } }) });
    expect(byId(down, "connectivity_and_schema")).toMatchObject({ status: "FAIL", summary: expect.stringContaining("network") });
    const malformed = await runSupabaseChecks({ reader: fakeReader({ failOpenapi: { kind: "http", status: 200, code: "MALFORMED_OPENAPI" } }) });
    expect(byId(malformed, "connectivity_and_schema").summary).toContain("MALFORMED_OPENAPI");
  });

  it("a hanging dependency times out into FAIL within the check deadline", async () => {
    const r = await runSupabaseChecks({ reader: fakeReader({ hangOpenapi: true }), checkTimeoutMs: 25 });
    expect(byId(r, "connectivity_and_schema")).toMatchObject({ status: "FAIL", summary: "timed out after 25ms", evidence: { failure: "timeout" } });
    expect(byId(r, "lease_rpcs_exist").status).toBe("PASS");
  });

  it("anon reading a row from an entitlement table is FAIL; anon executing a lease RPC is FAIL", async () => {
    const r = await runSupabaseChecks({
      reader: fakeReader({
        anon: { entitlements: { status: 200, rowCount: 1 } },
        rpc: (fn, role) => (role === "anon" && fn === "claim_report_lease" ? { status: 400, code: "P0001" } : undefined as never),
      }),
    });
    const rls = byId(r, "rls_client_isolation");
    expect(rls.status).toBe("FAIL");
    expect(rls.evidence?.problems).toEqual(["entitlements:anon_can_read_rows", "claim_report_lease:anon_executable_status_400"]);
  });

  it("report_claims readable-but-empty by anon is WARN (grants not revoked), never PASS", async () => {
    const r = await runSupabaseChecks({ reader: fakeReader({ anon: { report_claims: { status: 200, rowCount: 0 } } }) });
    expect(byId(r, "rls_client_isolation")).toMatchObject({ status: "WARN", evidence: { notes: ["report_claims:grants_not_revoked"] } });
  });

  it("stale claims WARN past the lease TTL and FAIL when abandoned, using DB-time cut-offs", async () => {
    const stale = await runSupabaseChecks({ reader: fakeReader({ counts: { report_claims: 3, [`report_claims?claimed_at=lt.${encodeURIComponent(new Date(T0 - THRESHOLDS.staleClaimMs).toISOString())}`]: 2 } }), now: () => T0 });
    expect(byId(stale, "report_claims_stale")).toMatchObject({ status: "WARN", evidence: { activeClaims: 3, staleClaims: 2, abandonedClaims: 0 } });

    const reader = fakeReader({
      counts: {
        report_claims: 1,
        [`report_claims?claimed_at=lt.${encodeURIComponent(new Date(T0 - THRESHOLDS.staleClaimMs).toISOString())}`]: 1,
        [`report_claims?claimed_at=lt.${encodeURIComponent(new Date(T0 - THRESHOLDS.abandonedClaimMs).toISOString())}`]: 1,
      },
    });
    const abandoned = await runSupabaseChecks({ reader, now: () => T0 });
    expect(byId(abandoned, "report_claims_stale")).toMatchObject({ status: "FAIL", evidence: { abandonedClaims: 1 } });
    // Cut-offs are ISO timestamps derived from the injected clock.
    expect(reader.calls.some((c) => c.includes("claimed_at=lt.2026-09-08T11%3A58%3A30.000Z"))).toBe(true);
  });

  it("duplicate anomalies are counted in-process and reported as counts only — no ids leave", async () => {
    const u1 = "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0";
    const u2 = "1f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f1";
    const ent = (id: string, user: string, scan: string | null, offer: string, cs: string, limit: number | null = 1) => ({
      id, user_id: user, scan_id: scan, offer, stripe_checkout_session_id: cs, status: "active", track_limit: limit,
    });
    const r = await runSupabaseChecks({
      reader: fakeReader({
        rows: {
          entitlements: [
            ent("e1", u1, "scn_isrc-a_000001", "song_intelligence", "cs_live_A"),
            ent("e2", u1, "scn_isrc-a_000001", "song_intelligence", "cs_live_B"), // dup (user, scan)
            ent("e3", u2, "scn_isrc-b_000002", "song_intelligence", "cs_live_A"), // dup session
            ent("e4", u2, null, "song_intelligence", "cs_live_C"), // song without scan
            ent("e5", u2, null, "creator_intelligence", "cs_live_D", 1), // over-allowance below
          ],
          reports: [
            { creator_id: u1, scan_id: "s1", analysis_id: "a1" },
            { creator_id: u1, scan_id: "s1", analysis_id: "a2" }, // dup (creator, scan)
            { creator_id: u2, scan_id: "s2", analysis_id: "a1" }, // dup analysis
          ],
          entitlement_tracks: [{ entitlement_id: "e5" }, { entitlement_id: "e5" }],
        },
      }),
    });
    const dup = byId(r, "duplicate_anomalies");
    expect(dup.status).toBe("FAIL");
    expect(dup.evidence).toMatchObject({
      duplicateSongEntitlements: 1,
      duplicateCheckoutSessions: 1,
      songEntitlementsWithoutScan: 1,
      duplicateReports: 1,
      duplicateReportAnalyses: 1,
      creatorEntitlementsOverAllowance: 1,
      sampled: false,
    });
    const json = JSON.stringify(r);
    expect(json).not.toContain(u1);
    expect(json).not.toContain("cs_live_A");
    expect(leaks(json)).toEqual([]);
  });

  it("a truncated scan is still PASS but flagged as sampled", async () => {
    const r = await runSupabaseChecks({ reader: fakeReader({ truncated: true }) });
    expect(byId(r, "duplicate_anomalies")).toMatchObject({ status: "PASS", summary: expect.stringContaining("sampled"), evidence: { sampled: true } });
  });

  it("countDuplicates counts extra occurrences", () => {
    expect(countDuplicates([])).toBe(0);
    expect(countDuplicates(["a", "b"])).toBe(0);
    expect(countDuplicates(["a", "a", "a", "b", "b"])).toBe(3);
  });
});

describe("createPostgrestReader (real reader, fake fetch)", () => {
  const cfg = { url: "https://proj.supabase.co/", serviceKey: SECRETS.serviceKey, anonKey: SECRETS.anonKey, timeoutMs: 500 };

  it("sends the right role key per request and parses counts from Content-Range", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = async (url: string, init?: RequestInit) => {
      seen.push({ url, init: init ?? {} });
      if (url.endsWith("/rest/v1/")) return jsonResponse({ paths: { "/reports": {}, "/rpc/claim_report_lease": {} } });
      if (init?.method === "HEAD") return new Response(null, { status: 206, headers: { "Content-Range": "0-0/17" } });
      if (url.includes("/rpc/")) return jsonResponse({ code: "42501", message: "permission denied for function claim_report_lease" }, 401);
      return jsonResponse([], 200, { "Content-Range": "*/0" });
    };
    const reader = createPostgrestReader({ ...cfg, fetchImpl });

    expect(await reader.openapiPaths()).toMatchObject({ ok: true, paths: ["/reports", "/rpc/claim_report_lease"] });
    expect(await reader.count("report_claims", "claimed_at=lt.x")).toMatchObject({ ok: true, count: 17 });
    expect(seen[1].url).toBe("https://proj.supabase.co/rest/v1/report_claims?select=*&claimed_at=lt.x");
    expect((seen[1].init.headers as Record<string, string>).Prefer).toBe("count=exact");

    const anon = await reader.anonSelect("reports", "generator_version");
    expect(anon).toMatchObject({ ok: true, status: 200, rowCount: 0 });
    expect((seen[2].init.headers as Record<string, string>).apikey).toBe(SECRETS.anonKey);

    const probe = await reader.rpcNullProbe("claim_report_lease", ["p_creator", "p_scan"], "anon");
    expect(probe).toMatchObject({ ok: true, status: 401, code: "42501" });
    expect(seen[3].init.body).toBe('{"p_creator":null,"p_scan":null}');
    expect((seen[3].init.headers as Record<string, string>).Authorization).toBe(`Bearer ${SECRETS.anonKey}`);
    // The service key is used for service-role calls only.
    expect((seen[0].init.headers as Record<string, string>).apikey).toBe(SECRETS.serviceKey);
  });

  it("parses bounded rows and marks truncation from the total", async () => {
    const fetchImpl = async () => jsonResponse([{ a: 1 }, { a: 2 }], 206, { "Content-Range": "0-1/9" });
    const reader = createPostgrestReader({ ...cfg, fetchImpl });
    expect(await reader.rows("reports", "a", undefined, 2)).toMatchObject({ ok: true, truncated: true });
  });

  it("reports timeouts, network failures, HTTP refusals and malformed bodies as typed failures", async () => {
    const hanging = createPostgrestReader({ ...cfg, fetchImpl: hangingFetch, timeoutMs: 15 });
    expect(await hanging.openapiPaths()).toMatchObject({ ok: false, kind: "timeout" });

    const network = createPostgrestReader({ ...cfg, fetchImpl: async () => { throw new TypeError("fetch failed"); } });
    expect(await network.count("reports")).toMatchObject({ ok: false, kind: "network" });

    const refused = createPostgrestReader({ ...cfg, fetchImpl: async () => jsonResponse({ code: "PGRST301", message: "JWT expired" }, 401) });
    expect(await refused.openapiPaths()).toMatchObject({ ok: false, kind: "http", status: 401, code: "PGRST301" });

    const malformed = createPostgrestReader({ ...cfg, fetchImpl: async () => new Response("<html>gateway</html>", { status: 200 }) });
    expect(await malformed.openapiPaths()).toMatchObject({ ok: false, kind: "http", code: "MALFORMED_OPENAPI" });
    expect(await malformed.rows("reports", "a", undefined, 5)).toMatchObject({ ok: false, code: "MALFORMED_ROWS" });

    const noCount = createPostgrestReader({ ...cfg, fetchImpl: async () => new Response(null, { status: 200 }) });
    expect(await noCount.count("reports")).toMatchObject({ ok: false, code: "NO_COUNT" });
  });
});
