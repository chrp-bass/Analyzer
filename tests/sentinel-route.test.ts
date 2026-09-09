/**
 * GET /api/health/production — authorisation, response shape, and the
 * structural guarantees of the health surface: its import graph never reaches
 * generation or preparation, its wiring pins the constants it mirrors, and the
 * automation only ever needs the one monitor secret.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { SECRETS } from "./support/sentinel-fakes";

vi.mock("@/lib/sentinel/run.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sentinel/run.server")>();
  return {
    ...actual,
    runServerHealth: vi.fn(async () => ({
      schemaVersion: 1,
      kind: "server",
      generatedAt: "2026-09-08T18:00:00.000Z",
      deployment: { sha: "066d2f5669d57fdf605f726a629210c283e152dd", deploymentId: "dpl_x", env: "production", region: "iad1", ref: "main" },
      boundaries: [],
      ms: 5,
    })),
  };
});

import { GET } from "@/app/api/health/production/route";
import { readDeploymentIdentity, runServerHealth, SENTINEL_GENERATOR_VERSION } from "@/lib/sentinel/run.server";
import { GENERATOR_VERSION } from "@/lib/reports/generate.server";

const ORIGINAL = process.env.HEALTH_MONITOR_SECRET;

describe("GET /api/health/production", () => {
  beforeEach(() => {
    process.env.HEALTH_MONITOR_SECRET = SECRETS.monitor;
    vi.mocked(runServerHealth).mockClear();
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.HEALTH_MONITOR_SECRET;
    else process.env.HEALTH_MONITOR_SECRET = ORIGINAL;
  });

  const req = (auth?: string) => new Request("https://scan.chrp.ai/api/health/production", { headers: auth ? { Authorization: auth } : {} });

  it("refuses a missing or wrong secret with the same opaque 403 and runs nothing", async () => {
    for (const r of [req(), req("Bearer wrong"), req(`Bearer ${SECRETS.monitor}x`), req(SECRETS.monitor)]) {
      const res = await GET(r);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "forbidden" });
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(runServerHealth).not.toHaveBeenCalled();
  });

  it("answers 503 when the surface is not configured, even to a caller presenting a token", async () => {
    delete process.env.HEALTH_MONITOR_SECRET;
    const res = await GET(req(`Bearer ${SECRETS.monitor}`));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "health_not_configured" });
    expect(runServerHealth).not.toHaveBeenCalled();
  });

  it("a too-short configured secret counts as not configured", async () => {
    process.env.HEALTH_MONITOR_SECRET = "short";
    const res = await GET(req("Bearer short"));
    expect(res.status).toBe(503);
  });

  it("returns the versioned server report to the monitor", async () => {
    const res = await GET(req(`Bearer ${SECRETS.monitor}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ schemaVersion: 1, kind: "server", deployment: { sha: "066d2f5669d57fdf605f726a629210c283e152dd" } });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(runServerHealth).toHaveBeenCalledTimes(1);
  });
});

describe("server wiring", () => {
  it("pins the generator version it reports against", () => {
    expect(SENTINEL_GENERATOR_VERSION).toBe(GENERATOR_VERSION);
  });

  it("reads the deployment identity from Vercel system variables, rejecting junk", () => {
    expect(readDeploymentIdentity({ VERCEL_GIT_COMMIT_SHA: "ABCDEF0123456789ABCDEF0123456789ABCDEF01", VERCEL_DEPLOYMENT_ID: "dpl_1", VERCEL_ENV: "production", VERCEL_REGION: "iad1", VERCEL_GIT_COMMIT_REF: "main" })).toEqual({
      sha: "abcdef0123456789abcdef0123456789abcdef01",
      deploymentId: "dpl_1",
      env: "production",
      region: "iad1",
      ref: "main",
    });
    expect(readDeploymentIdentity({ VERCEL_GIT_COMMIT_SHA: "not a sha <script>" })).toEqual({ sha: null, deploymentId: null, env: null, region: null, ref: null });
  });
});

/** Runtime import graph walker (same rules as the Rhodes session graph test). */
function resolveSpec(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join("src", spec.slice(2));
  else if (spec.startsWith(".")) base = normalize(join(dirname(from), spec));
  else return null;
  for (const cand of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) if (existsSync(cand)) return cand;
  return null;
}
const IMPORT_RE = /import\s+(type\s+)?(?:[^;'"]*?\s+from\s*)?['"]([^'"]+)['"]/g;
function runtimeGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, "utf8");
    IMPORT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = IMPORT_RE.exec(src))) {
      if (m[1]) continue;
      const r = resolveSpec(m[2], file);
      if (r) walk(r);
    }
  };
  walk(entry);
  return seen;
}

describe("health route runtime call graph", () => {
  const graph = Array.from(runtimeGraph("src/app/api/health/production/route.ts"));

  it("reaches the read-only sentinel modules and the ElevenLabs signed-URL client", () => {
    expect(graph).toContain("src/lib/sentinel/run.server.ts");
    expect(graph).toContain("src/lib/rhodes-voice/elevenlabs.ts");
    expect(graph).toContain("src/lib/rhodes-voice/agent-prompt.ts");
  });

  it("never reaches report generation, preparation, the engines, the entitlement writer or the mailer", () => {
    const forbidden = [
      /src\/lib\/rhodes\//, // the Anthropic text generator
      /src\/lib\/reports\/(prepare|generate|analysis-facts|free-report|resolve|store\.supabase)/,
      /src\/lib\/engine\//,
      /src\/lib\/scan\//,
      /src\/lib\/memory\//,
      /src\/lib\/commerce\/(entitlements|credit-service|free-first|store\.supabase)/,
      /src\/lib\/email/,
      /src\/lib\/supabase\//, // the sentinel uses its own read-only PostgREST reader
    ];
    for (const file of graph) for (const re of forbidden) expect(file, file).not.toMatch(re);
  });
});

describe("automation contract", () => {
  const workflow = readFileSync(".github/workflows/production-sentinel.yml", "utf8");

  it("runs after production deployments and nightly, on demand, and uploads the JSON", () => {
    expect(workflow).toMatch(/deployment_status:/);
    expect(workflow).toMatch(/schedule:/);
    expect(workflow).toMatch(/cron:/);
    expect(workflow).toMatch(/workflow_dispatch:/);
    expect(workflow).toMatch(/npm run health:production/);
    expect(workflow).toMatch(/upload-artifact/);
    expect(workflow).toMatch(/GITHUB_STEP_SUMMARY/);
    expect(workflow).toMatch(/deployment_status\.state == 'success'/);
    expect(workflow).toMatch(/environment == 'Production'/);
  });

  it("needs exactly one GitHub secret — the monitor secret — and no vendor credential", () => {
    const secrets = Array.from(workflow.matchAll(/secrets\.([A-Z0-9_]+)/g)).map((m) => m[1]);
    expect(new Set(secrets)).toEqual(new Set(["HEALTH_MONITOR_SECRET"]));
    expect(workflow).not.toMatch(/STRIPE|SUPABASE|ELEVENLABS|ANTHROPIC|VERCEL_TOKEN/);
    expect(workflow).toMatch(/permissions:\s*\n\s*contents: read/);
  });

  it("the npm script exists and the CLI never imports server-only or aliased modules", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["health:production"]).toBe("tsx scripts/health-production.mts");
    const cliGraph = new Set<string>();
    const walk = (file: string) => {
      if (cliGraph.has(file)) return;
      cliGraph.add(file);
      const src = readFileSync(file, "utf8");
      IMPORT_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = IMPORT_RE.exec(src))) {
        if (m[1]) continue;
        const spec = m[2];
        expect(spec, `${file} imports ${spec}`).not.toMatch(/^@\//);
        expect(spec, `${file} imports ${spec}`).not.toBe("server-only");
        if (spec.startsWith(".")) {
          const base = normalize(join(dirname(file), spec.replace(/\.ts$/, "")));
          for (const cand of [`${base}.ts`, `${base}.mts`]) if (existsSync(cand)) walk(cand);
        }
      }
    };
    walk("scripts/health-production.mts");
    expect(cliGraph).toContain("src/lib/sentinel/client.ts");
    expect(cliGraph).toContain("src/lib/sentinel/checks/application.ts");
  });
});
