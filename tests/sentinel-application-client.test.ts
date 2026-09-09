/**
 * Boundary 1 (application probes) and the `npm run health:production`
 * orchestrator, against a fake production origin.
 */

import { describe, expect, it, vi } from "vitest";
import type { CheckResult } from "@/lib/sentinel/types";
import { API_PROBES, PUBLIC_ROUTES, runApplicationChecks } from "@/lib/sentinel/checks/application";
import { exitCodeFor, HEALTH_PATH, isServerHealthReport, runSentinel } from "@/lib/sentinel/client";
import type { FetchLike } from "@/lib/sentinel/http";
import type { ServerHealthReport } from "@/lib/sentinel/types";
import { boundaryResult } from "@/lib/sentinel/evaluate";
import { hangingFetch, htmlResponse, jsonResponse, leaks, SECRETS } from "./support/sentinel-fakes";

const byId = (r: { checks: CheckResult[] }, id: string): CheckResult => r.checks.find((c) => c.id === id)!;
const BASE = "https://scan.chrp.ai";
const SHA = "066d2f5669d57fdf605f726a629210c283e152dd";

/** The production origin as it answers today (statuses observed on 2026-09-08). */
const PRODUCTION_ANSWERS: Record<string, () => Response> = {
  "GET /api/report/scn_probe": () => jsonResponse({ error: "forbidden" }, 403),
  "POST /api/rhodes/session": () => jsonResponse({ error: "invalid_body" }, 400),
  "POST /api/rhodes/session/outcome": () => new Response(null, { status: 400 }),
  "POST /api/stripe/webhook": () => jsonResponse({ error: "missing signature" }, 400),
  "POST /api/checkout": () => jsonResponse({ error: "unknown offer" }, 400),
  "GET /api/scan/prepare?scanId=bogus": () => jsonResponse({ error: "invalid scanId" }, 400),
  "POST /api/scan/prepare": () => jsonResponse({ error: "invalid scanId" }, 400),
  "GET /api/song-api/search": () => jsonResponse({ error: "query is required" }, 400),
  "POST /api/scan-report": () => jsonResponse({ error: "not_found" }, 404),
  "GET /api/health/production": () => jsonResponse({ error: "forbidden" }, 403),
  "GET /api/health/rhodes-agent": () => jsonResponse({ error: "forbidden" }, 403),
  "GET /api/catalog": () => jsonResponse({ catalog: [], credits: null, identified: false }),
};

interface OriginOptions {
  answers?: Record<string, () => Response>;
  server?: (auth: string | null) => Response | Promise<Response>;
  latencyMs?: Partial<Record<string, number>>;
}

function fakeOrigin(opts: OriginOptions = {}) {
  let clock = 1_000_000;
  const now = () => clock;
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const u = new URL(url);
    const key = `${init?.method ?? "GET"} ${u.pathname}${u.search}`;
    calls.push(key);
    clock += opts.latencyMs?.[u.pathname] ?? 50;
    if (u.pathname === HEALTH_PATH && (init?.headers as Record<string, string> | undefined)?.Authorization && opts.server) {
      return opts.server((init?.headers as Record<string, string>).Authorization);
    }
    const answer = { ...PRODUCTION_ANSWERS, ...opts.answers }[key];
    if (answer) return answer();
    const route = PUBLIC_ROUTES.find((r) => r.path === u.pathname);
    if (route?.redirectTo) return new Response(null, { status: 307, headers: { location: route.redirectTo } });
    if (route) return htmlResponse();
    return new Response("nope", { status: 404 });
  };
  return { fetchImpl, now, calls };
}

function serverReport(over: Partial<ServerHealthReport> = {}): ServerHealthReport {
  return {
    schemaVersion: 1,
    kind: "server",
    generatedAt: "2026-09-08T18:00:00.000Z",
    deployment: { sha: SHA, deploymentId: "dpl_HYo7SuSQwhtyKFKh8JHDhsYdnyoq", env: "production", region: "iad1", ref: "main" },
    boundaries: [
      boundaryResult("supabase", [{ id: "connectivity_and_schema", status: "PASS", summary: "ok" }], 10),
      boundaryResult("stripe", [{ id: "configuration", status: "PASS", summary: "ok" }], 10),
      boundaryResult("pipeline", [{ id: "configuration", status: "PASS", summary: "ok" }, { id: "generation", status: "NOT_EXERCISED", summary: "costs money" }], 10),
      boundaryResult("rhodes", [{ id: "signed_url_mint", status: "PASS", summary: `minted ${SECRETS.signedUrl}` }], 10),
    ],
    ms: 1234,
    ...over,
  };
}

describe("runApplicationChecks", () => {
  it("healthy production answers PASS every probe and reports the Vercel edge", async () => {
    const origin = fakeOrigin();
    const r = await runApplicationChecks({ baseUrl: BASE, fetchImpl: origin.fetchImpl, now: origin.now });
    expect(r.status).toBe("PASS");
    expect(r.checks.map((c) => [c.id, c.status])).toEqual([
      ["dns_tls_root", "PASS"],
      ["public_routes", "PASS"],
      ["api_guards", "PASS"],
      ["anonymous_catalog", "PASS"],
      ["vercel_error_rate", "NOT_EXERCISED"],
    ]);
    expect(byId(r, "api_guards").evidence).toMatchObject({ probes: API_PROBES.length, serverErrors: 0, failures: [] });
    // Every probe was issued exactly once, with a JSON body where one is defined.
    for (const p of API_PROBES) expect(origin.calls.filter((c) => c === `${p.method} ${p.path}`)).toHaveLength(1);
  });

  it("a guard that 404s or 5xxs is FAIL, naming the probe", async () => {
    const origin = fakeOrigin({
      answers: {
        "GET /api/report/scn_probe": () => jsonResponse({ error: "not_found" }, 404),
        "POST /api/stripe/webhook": () => jsonResponse({ error: "boom" }, 500),
        "POST /api/checkout": () => jsonResponse({ error: "invalid body" }, 400), // right status, wrong body
      },
    });
    const r = await runApplicationChecks({ baseUrl: BASE, fetchImpl: origin.fetchImpl, now: origin.now });
    expect(byId(r, "api_guards")).toMatchObject({
      status: "FAIL",
      evidence: { failures: ["report_forbidden:expected_403_got_404", "stripe_webhook_unsigned:expected_400_got_500", "checkout_unknown_offer:unexpected_error_body"], serverErrors: 1 },
    });
  });

  it("public routes: a non-200 or non-HTML answer is FAIL; slow is WARN; very slow is FAIL", async () => {
    const broken = fakeOrigin({
      answers: {
        "GET /contact": () => jsonResponse({}, 500),
        "GET /signin": () => jsonResponse({ ok: true }),
        "GET /privacy": () => new Response(null, { status: 307, headers: { location: "https://evil.example.com/privacy" } }),
        "GET /terms": () => htmlResponse(), // a legal page served locally instead of redirecting is drift
      },
    });
    const r1 = await runApplicationChecks({ baseUrl: BASE, fetchImpl: broken.fetchImpl, now: broken.now });
    expect(byId(r1, "public_routes")).toMatchObject({ status: "FAIL", evidence: { failures: ["/contact:500", "/signin:not_html", "/privacy:redirect_elsewhere", "/terms:200"] } });

    const slow = fakeOrigin({ latencyMs: { "/scan": 4_000 } });
    const r2 = await runApplicationChecks({ baseUrl: BASE, fetchImpl: slow.fetchImpl, now: slow.now });
    // The fake clock is shared, so every parallel probe observes the slow one; the
    // status and the named route are what matter.
    expect(byId(r2, "public_routes").status).toBe("WARN");
    expect((byId(r2, "public_routes").evidence?.slow as string[]).some((s) => s.startsWith("/scan:"))).toBe(true);

    const dead = fakeOrigin({ latencyMs: { "/": 9_000 } });
    const r3 = await runApplicationChecks({ baseUrl: BASE, fetchImpl: dead.fetchImpl, now: dead.now });
    expect(byId(r3, "dns_tls_root").status).toBe("FAIL");
    expect(byId(r3, "public_routes").status).toBe("FAIL");
  });

  it("root not served through Vercel is WARN; anonymous catalog leaking identity is FAIL", async () => {
    const origin = fakeOrigin({
      answers: {
        "GET /": () => new Response("<html></html>", { status: 200, headers: { "Content-Type": "text/html" } }),
        "GET /api/catalog": () => jsonResponse({ catalog: [{ title: "x" }], identified: true }),
      },
    });
    const r = await runApplicationChecks({ baseUrl: BASE, fetchImpl: origin.fetchImpl, now: origin.now });
    expect(byId(r, "dns_tls_root").status).toBe("WARN");
    expect(byId(r, "anonymous_catalog").status).toBe("FAIL");
  });

  it("an unreachable origin is FAIL everywhere and the boundary still returns", async () => {
    const r = await runApplicationChecks({ baseUrl: BASE, fetchImpl: hangingFetch, requestTimeoutMs: 15, checkTimeoutMs: 500 });
    expect(byId(r, "dns_tls_root")).toMatchObject({ status: "FAIL", summary: "root fetch failed: timeout" });
    expect(byId(r, "api_guards").status).toBe("FAIL");
    expect(r.status).toBe("FAIL");
  });
});

describe("runSentinel", () => {
  const authOk = (auth: string | null) => auth === `Bearer ${SECRETS.monitor}`;

  it("GREEN end-to-end: merges the server boundaries, verifies the SHA and sanitises the whole document", async () => {
    const origin = fakeOrigin({ server: (auth) => (authOk(auth) ? jsonResponse(serverReport()) : jsonResponse({ error: "forbidden" }, 403)) });
    const report = await runSentinel({ baseUrl: BASE, monitorSecret: SECRETS.monitor, expectedSha: SHA, fetchImpl: origin.fetchImpl, now: origin.now, sleep: async () => {} });
    expect(report.kind).toBe("sentinel");
    expect(report.target.baseUrl).toBe(BASE);
    expect(report.schemaVersion).toBe(1);
    expect(report.overall).toBe("GREEN");
    expect(report.boundaries.map((b) => b.boundary)).toEqual(["application", "supabase", "stripe", "pipeline", "rhodes"]);
    expect(report.deployment.sha).toBe(SHA);
    expect(report.deployment.deploymentId).toBe("dpl_HYo7SuSQwhtyKFKh8JHDhsYdnyoq");
    expect(byId(report.boundaries[0], "deployment_identity")).toMatchObject({ status: "PASS", evidence: { sha: SHA, settleAttempts: 1 } });
    const json = JSON.stringify(report);
    expect(leaks(json)).toEqual([]);
    expect(json).not.toContain(SECRETS.monitor);
    expect(json).toContain("minted <socket-url>"); // a careless server summary is still scrubbed client-side
    expect(exitCodeFor(report, false)).toBe(0);
  });

  it("a short SHA prefix from the workflow matches the full deployment SHA", async () => {
    const origin = fakeOrigin({ server: () => jsonResponse(serverReport()) });
    const report = await runSentinel({ baseUrl: BASE, monitorSecret: SECRETS.monitor, expectedSha: SHA.slice(0, 7).toUpperCase(), fetchImpl: origin.fetchImpl, now: origin.now });
    expect(byId(report.boundaries[0], "deployment_identity").status).toBe("PASS");
  });

  it("waits for the alias to settle on the expected SHA, then FAILs if it never does", async () => {
    let served = "1111111111111111111111111111111111111111";
    const sleeps: number[] = [];
    const origin = fakeOrigin({ server: () => jsonResponse(serverReport({ deployment: { sha: served, deploymentId: "dpl_old", env: "production", region: null, ref: null } })) });
    const settled = await runSentinel({
      baseUrl: BASE, monitorSecret: SECRETS.monitor, expectedSha: SHA, fetchImpl: origin.fetchImpl, now: origin.now,
      sleep: async (ms) => { sleeps.push(ms); if (sleeps.length === 2) served = SHA; },
      settleAttempts: 6, settleDelayMs: 100,
    });
    expect(byId(settled.boundaries[0], "deployment_identity")).toMatchObject({ status: "PASS", evidence: { settleAttempts: 3 } });
    expect(sleeps).toEqual([100, 100]);

    served = "1111111111111111111111111111111111111111";
    const never = await runSentinel({ baseUrl: BASE, monitorSecret: SECRETS.monitor, expectedSha: SHA, fetchImpl: origin.fetchImpl, now: origin.now, sleep: async () => {}, settleAttempts: 3, settleDelayMs: 1 });
    expect(byId(never.boundaries[0], "deployment_identity")).toMatchObject({ status: "FAIL", summary: expect.stringContaining("after 3 attempt(s)") });
    expect(never.overall).toBe("RED");
    expect(exitCodeFor(never, false)).toBe(1);
  });

  it("without a monitor secret the four vendor boundaries FAIL loudly (never silently GREEN)", async () => {
    const origin = fakeOrigin({ server: () => jsonResponse(serverReport()) });
    const report = await runSentinel({ baseUrl: BASE, monitorSecret: null, expectedSha: null, fetchImpl: origin.fetchImpl, now: origin.now });
    expect(report.overall).toBe("RED");
    for (const b of report.boundaries.slice(1)) expect(b.checks[0]).toMatchObject({ id: "server_health_surface", status: "FAIL", evidence: { reason: "no_secret" } });
    expect(byId(report.boundaries[0], "deployment_identity").status).toBe("FAIL");
    expect(origin.calls.filter((c) => c.endsWith(HEALTH_PATH))).toHaveLength(1); // only the unauthenticated guard probe
  });

  it("classifies a rejected secret, an unconfigured surface, a missing route, a 5xx and a malformed body", async () => {
    const run = (server: OriginOptions["server"]) => {
      const origin = fakeOrigin({ server });
      return runSentinel({ baseUrl: BASE, monitorSecret: SECRETS.monitor, expectedSha: null, fetchImpl: origin.fetchImpl, now: origin.now });
    };
    expect((await run(() => jsonResponse({ error: "forbidden" }, 403))).boundaries[1].checks[0].evidence).toMatchObject({ reason: "forbidden", status: 403 });
    expect((await run(() => jsonResponse({ error: "health_not_configured" }, 503))).boundaries[1].checks[0].evidence).toMatchObject({ reason: "not_configured" });
    expect((await run(() => new Response("nope", { status: 404 }))).boundaries[1].checks[0].evidence).toMatchObject({ reason: "route_missing" });
    expect((await run(() => new Response("oops", { status: 500 }))).boundaries[1].checks[0].evidence).toMatchObject({ reason: "server_error" });
    expect((await run(() => jsonResponse({ kind: "server", schemaVersion: 2 }))).boundaries[1].checks[0].evidence).toMatchObject({ reason: "malformed" });
  });

  it("a hanging health surface is a timeout FAIL, not a hung process", async () => {
    const origin = fakeOrigin({ server: () => hangingFetch("x", {}) as Promise<Response> });
    const fetchImpl: FetchLike = (url, init) => (new URL(url).pathname === HEALTH_PATH && (init?.headers as Record<string, string> | undefined)?.Authorization ? hangingFetch(url, init) : origin.fetchImpl(url, init));
    const report = await runSentinel({ baseUrl: BASE, monitorSecret: SECRETS.monitor, expectedSha: null, fetchImpl, now: origin.now, serverTimeoutMs: 20 });
    expect(report.boundaries[1].checks[0].evidence).toMatchObject({ reason: "timeout" });
  });

  it("without an expected SHA, a production deployment is PASS, a preview deployment is FAIL and a missing SHA is WARN", async () => {
    const mk = (deployment: ServerHealthReport["deployment"]) => {
      const origin = fakeOrigin({ server: () => jsonResponse(serverReport({ deployment })) });
      return runSentinel({ baseUrl: BASE, monitorSecret: SECRETS.monitor, expectedSha: null, fetchImpl: origin.fetchImpl, now: origin.now });
    };
    expect(byId((await mk({ sha: SHA, deploymentId: "d", env: "production", region: null, ref: null })).boundaries[0], "deployment_identity").status).toBe("PASS");
    expect(byId((await mk({ sha: SHA, deploymentId: "d", env: "preview", region: null, ref: null })).boundaries[0], "deployment_identity").status).toBe("FAIL");
    expect(byId((await mk({ sha: null, deploymentId: null, env: null, region: null, ref: null })).boundaries[0], "deployment_identity").status).toBe("WARN");
  });

  it("rolls up YELLOW from a server WARN and honours --strict", async () => {
    const origin = fakeOrigin({
      server: () => jsonResponse(serverReport({ boundaries: [boundaryResult("rhodes", [{ id: "system_prompt_drift", status: "WARN", summary: "differs" }], 1)] })),
    });
    const report = await runSentinel({ baseUrl: BASE, monitorSecret: SECRETS.monitor, expectedSha: null, fetchImpl: origin.fetchImpl, now: origin.now });
    expect(report.overall).toBe("YELLOW");
    expect(exitCodeFor(report, false)).toBe(0);
    expect(exitCodeFor(report, true)).toBe(1);
  });

  it("isServerHealthReport validates the versioned shape", () => {
    expect(isServerHealthReport(serverReport())).toBe(true);
    expect(isServerHealthReport({ ...serverReport(), kind: "sentinel" })).toBe(false);
    expect(isServerHealthReport({ ...serverReport(), boundaries: [{ nope: true }] })).toBe(false);
    expect(isServerHealthReport(null)).toBe(false);
  });

  it("never issues anything but GET/POST probes and never sends the secret anywhere but the health path", async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    const origin = fakeOrigin({ server: () => jsonResponse(serverReport()) });
    const fetchImpl: FetchLike = (url, init) => {
      seen.push({ url, init });
      return origin.fetchImpl(url, init);
    };
    await runSentinel({ baseUrl: BASE, monitorSecret: SECRETS.monitor, expectedSha: null, fetchImpl, now: origin.now });
    for (const { url, init } of seen) {
      expect(["GET", "POST", undefined]).toContain(init?.method);
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      if (auth) expect(new URL(url).pathname).toBe(HEALTH_PATH);
    }
    const spy = vi.fn();
    expect(spy).not.toHaveBeenCalled();
  });
});
