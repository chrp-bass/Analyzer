import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

/**
 * The Dr. Rhodes voice session route's runtime call graph.
 *
 * POST /api/rhodes/session MAY, after resolving the persisted report, call the
 * ElevenLabs signed-URL module to mint a short-lived voice token. It must
 * NEVER reach Rhodes TEXT generation (`@/lib/rhodes` / the Anthropic call) or
 * report PREPARATION (`@/lib/reports/prepare*`, the generator). Voice is a
 * pure read plus an ElevenLabs handshake; it can neither generate a report nor
 * start one.
 *
 * This walks the real import graph from the route, following only first-party
 * (`@/…` and relative) RUNTIME imports — type-only imports are erased before
 * execution, so they are excluded, exactly as the bundler would.
 */

function resolveSpec(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join("src", spec.slice(2));
  else if (spec.startsWith(".")) base = normalize(join(dirname(from), spec));
  else return null; // external package
  for (const cand of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(cand)) return cand;
  }
  return null;
}

/**
 * Matches every static import statement, single- or multi-line. Group 1 is
 * the `type` keyword when the whole statement is type-only (erased before
 * execution, so it is skipped exactly as the bundler would).
 */
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
      if (m[1]) continue; // `import type … from` — erased at runtime
      const resolved = resolveSpec(m[2], file);
      if (resolved) walk(resolved);
    }
  };
  walk(entry);
  return seen;
}

describe("POST /api/rhodes/session/outcome runtime call graph", () => {
  const graph = runtimeGraph("src/app/api/rhodes/session/outcome/route.ts");

  it("reaches neither ElevenLabs nor the report store — entitlement gate and logger only", () => {
    const files = Array.from(graph);
    expect(files.some((f) => f.includes("rhodes-voice/elevenlabs") || f.includes("rhodes-voice/signed-url"))).toBe(false);
    expect(files.some((f) => f.includes("reports/") || /lib\/rhodes\//.test(f) || /stripe|checkout|engine\//i.test(f))).toBe(false);
    expect(files.some((f) => f.includes("commerce/entitlements"))).toBe(true);
    expect(files.some((f) => f.includes("rhodes-voice/log"))).toBe(true);
  });
});

describe("POST /api/rhodes/session runtime call graph", () => {
  const graph = runtimeGraph("src/app/api/rhodes/session/route.ts");

  it("reaches the ElevenLabs signed-URL facade and the typed client (voice is allowed)", () => {
    const files = Array.from(graph);
    expect(files.some((f) => f.includes("rhodes-voice/signed-url"))).toBe(true);
    expect(files.some((f) => f.includes("rhodes-voice/elevenlabs"))).toBe(true);
    expect(files.some((f) => f.includes("rhodes-voice/config"))).toBe(true);
  });

  it("never reaches Rhodes text generation or the report generator", () => {
    const forbidden = Array.from(graph).filter(
      (f) =>
        /lib\/rhodes\//.test(f) || // Rhodes text-intelligence / Anthropic call
        f.includes("reports/generate"),
    );
    expect(forbidden).toEqual([]);
  });

  it("never reaches report preparation", () => {
    const forbidden = Array.from(graph).filter(
      (f) => f.includes("reports/prepare") || f.includes("analysis-facts.server"),
    );
    expect(forbidden).toEqual([]);
  });

  it("never reaches checkout, Stripe, email, or the claim/prepare routes", () => {
    const forbidden = Array.from(graph).filter(
      (f) =>
        /stripe/i.test(f) ||
        /checkout/i.test(f) ||
        /commerce\/(checkout|purchase|webhook)/.test(f) ||
        /lib\/email/.test(f) ||
        /purchase-email/.test(f) ||
        /api\/scan\/(prepare|claim)/.test(f),
    );
    expect(forbidden).toEqual([]);
    // And no reachable module even names the Stripe SDK or the Anthropic SDK.
    for (const f of Array.from(graph)) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/from\s+["']stripe["']/);
      expect(src, f).not.toMatch(/from\s+["']@anthropic-ai\//);
    }
  });

  it("the ONLY report dependency is the persisted-report resolver (pure read)", () => {
    const route = readFileSync("src/app/api/rhodes/session/route.ts", "utf8");
    const imports = Array.from(route.matchAll(/from\s+["']([^"']+)["']/g)).map((m) => m[1]);
    expect(imports.filter((i) => i.startsWith("@/lib/reports/"))).toEqual([
      "@/lib/reports/resolve.server",
    ]);
    // The resolver itself performs no generation — pinned elsewhere, but the
    // voice route must not grow a second path to the report.
    expect(route).not.toMatch(/import[^;]*\b(prepare|generate|getFullReport|createSupabaseReportStore|ReportStore)\b[^;]*from/);
  });

  it("never reaches the live Soundcharts, Spotify, or analyze upstream", () => {
    const forbidden = Array.from(graph).filter(
      (f) =>
        f.includes("engine/soundcharts") ||
        f.includes("engine/spotify") ||
        f.includes("engine/analyze.server"),
    );
    expect(forbidden).toEqual([]);
  });
});
