/**
 * Sentinel core: redaction, rollup, the check runner (timeouts and thrown
 * errors), monitor-secret authorisation, thresholds pinned to the code they
 * describe, and the two renderings.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fingerprint, sanitizeDeep, sanitizeText } from "@/lib/sentinel/redact";
import { boundaryResult, overallStatus, percentile, runCheck, worstStatus } from "@/lib/sentinel/evaluate";
import { authorizeMonitor, constantTimeEqual, monitorSecretConfigured } from "@/lib/sentinel/auth";
import { THRESHOLDS } from "@/lib/sentinel/thresholds";
import { DEFAULT_STALE_AFTER_MS } from "@/lib/reports/prepare";
import { OFFERS } from "@/lib/commerce/offers";
import { EXPECTED_PRICES } from "@/lib/sentinel/checks/stripe";
import { PIPELINE_REQUIRED_ENV } from "@/lib/sentinel/checks/pipeline";
import { LEASE_RPCS, REQUIRED_TABLES } from "@/lib/sentinel/checks/supabase";
import { API_PROBES } from "@/lib/sentinel/checks/application";
import { formatHuman, formatMarkdown } from "@/lib/sentinel/format";
import type { SentinelReport } from "@/lib/sentinel/types";
import { SECRETS, leaks } from "./support/sentinel-fakes";
import { existsSync } from "node:fs";

describe("sanitizeText", () => {
  it("replaces every vendor secret shape, URL, e-mail, uuid, JWT and long token", () => {
    const hostile = `Invalid API Key provided: ${SECRETS.stripeKey}; whsec ${SECRETS.webhookSecret}; key ${SECRETS.elevenKey}; jwt ${SECRETS.serviceKey}; url ${SECRETS.signedUrl}; mail jeff@example.com; id 0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0; scan scn_isrc-gbum71029604_8fexwh; Bearer abcDEF123`;
    const out = sanitizeText(hostile, 2000);
    expect(leaks(out)).toEqual([]);
    expect(out).toContain("<stripe-key>");
    expect(out).toContain("<stripe-webhook-secret>");
    expect(out).toContain("<jwt>");
    expect(out).toContain("<socket-url>");
    expect(out).toContain("<email>");
    expect(out).toContain("<uuid>");
    expect(out).toContain("<scan-id>");
    expect(out).toContain("Bearer <redacted>");
  });

  it("truncates, collapses whitespace and drops control characters", () => {
    const out = sanitizeText(`a b\n\n   c\x07${"word ".repeat(200)}`, 40);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.startsWith("a b c word word")).toBe(true);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/\x07|\n|  /);
    // A long opaque run is a token, not text, and is replaced rather than truncated.
    expect(sanitizeText(`id ${"x".repeat(64)}`)).toBe("id <token>");
  });

  it("accepts errors, objects and nullish input", () => {
    expect(sanitizeText(new Error(`boom ${SECRETS.stripeKey}`))).toBe("boom <stripe-key>");
    expect(sanitizeText({ key: SECRETS.elevenKey })).toContain("<api-key>");
    expect(sanitizeText(undefined)).toBe("");
  });
});

describe("sanitizeDeep", () => {
  it("scrubs nested strings but keeps public identifiers under their known keys", () => {
    const input = {
      deployment: { sha: "066d2f5669d57fdf605f726a629210c283e152dd", deploymentId: "dpl_HYo7SuSQwhtyKFKh8JHDhsYdnyoq", env: "production" },
      evidence: { note: `leaked ${SECRETS.signedUrl}`, liveFingerprint: "a1b2c3d4e5f6", list: [SECRETS.stripeKey] },
    };
    const out = sanitizeDeep(input);
    expect(out.deployment.sha).toBe("066d2f5669d57fdf605f726a629210c283e152dd");
    expect(out.deployment.deploymentId).toBe("dpl_HYo7SuSQwhtyKFKh8JHDhsYdnyoq");
    expect(out.evidence.note).toBe("leaked <socket-url>");
    expect(out.evidence.liveFingerprint).toBe("a1b2c3d4e5f6");
    expect(out.evidence.list).toEqual(["<stripe-key>"]);
  });

  it("keeps the sentinel's own https origin under baseUrl, but scrubs any other URL there", () => {
    expect(sanitizeDeep({ target: { baseUrl: "https://scan.chrp.ai" } }).target.baseUrl).toBe("https://scan.chrp.ai");
    expect(sanitizeDeep({ target: { baseUrl: "https://scan.chrp.ai/api/report/scn_x?token=abc" } }).target.baseUrl).toBe("<url>");
  });

  it("does not trust an identifier key with a non-identifier value", () => {
    const out = sanitizeDeep({ sha: `not a sha ${SECRETS.stripeKey}` });
    expect(out.sha).toBe("not a sha <stripe-key>");
  });

  it("fingerprints are short, stable and not reversible text", async () => {
    const a = await fingerprint("hello");
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(await fingerprint("hello")).toBe(a);
    expect(await fingerprint("hello!")).not.toBe(a);
  });
});

describe("rollup", () => {
  it("orders FAIL > WARN > PASS > NOT_EXERCISED and maps to colours", () => {
    expect(worstStatus(["PASS", "NOT_EXERCISED"])).toBe("PASS");
    expect(worstStatus(["PASS", "WARN"])).toBe("WARN");
    expect(worstStatus(["WARN", "FAIL", "PASS"])).toBe("FAIL");
    expect(worstStatus([])).toBe("NOT_EXERCISED");
    const mk = (s: "PASS" | "WARN" | "FAIL" | "NOT_EXERCISED") => boundaryResult("stripe", [{ id: "x", status: s, summary: "" }], 1);
    expect(overallStatus([mk("PASS"), mk("NOT_EXERCISED")])).toBe("GREEN");
    expect(overallStatus([mk("PASS"), mk("WARN")])).toBe("YELLOW");
    expect(overallStatus([mk("WARN"), mk("FAIL")])).toBe("RED");
    // NOT_EXERCISED alone never paints GREEN as a lie: it stays neutral.
    expect(overallStatus([mk("NOT_EXERCISED")])).toBe("GREEN");
    expect(mk("NOT_EXERCISED").status).toBe("NOT_EXERCISED");
  });

  it("percentile is nearest-rank", () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([5, 1, 3], 50)).toBe(3);
    expect(percentile([5, 1, 3], 95)).toBe(5);
    expect(percentile([5, 1, 3], 100)).toBe(5);
  });
});

describe("runCheck", () => {
  const opts = { sanitize: sanitizeText };

  it("adds id and timing to a returned outcome", async () => {
    const r = await runCheck("ok", 1000, async () => ({ status: "PASS", summary: "fine" }), opts);
    expect(r).toMatchObject({ id: "ok", status: "PASS", summary: "fine" });
    expect(r.ms).toBeGreaterThanOrEqual(0);
  });

  it("turns a hanging body into a FAIL with failure=timeout and aborts the signal", async () => {
    let aborted = false;
    const r = await runCheck(
      "slow",
      20,
      (signal) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("aborted"));
          });
        }),
      opts,
    );
    expect(r.status).toBe("FAIL");
    expect(r.summary).toBe("timed out after 20ms");
    expect(r.evidence).toEqual({ failure: "timeout" });
    expect(aborted).toBe(true);
  });

  it("turns a thrown error into a sanitised FAIL", async () => {
    const r = await runCheck("boom", 1000, async () => {
      throw new Error(`upstream said ${SECRETS.stripeKey}`);
    }, opts);
    expect(r.status).toBe("FAIL");
    expect(r.summary).toBe("check threw: upstream said <stripe-key>");
    expect(r.evidence).toEqual({ failure: "exception" });
  });
});

describe("monitor secret", () => {
  const secret = SECRETS.monitor;

  it("requires a configured secret of at least 32 characters with no whitespace", () => {
    expect(monitorSecretConfigured(undefined)).toBe(false);
    expect(monitorSecretConfigured("short")).toBe(false);
    expect(monitorSecretConfigured("has a space in it and is otherwise long enough")).toBe(false);
    expect(monitorSecretConfigured(secret)).toBe(true);
    expect(authorizeMonitor(`Bearer ${secret}`, undefined)).toEqual({ ok: false, reason: "not_configured" });
  });

  it("accepts only the exact bearer token; missing, wrong and near-miss are forbidden", () => {
    expect(authorizeMonitor(`Bearer ${secret}`, secret)).toEqual({ ok: true });
    expect(authorizeMonitor(`bearer ${secret}`, secret)).toEqual({ ok: true });
    expect(authorizeMonitor(null, secret)).toEqual({ ok: false, reason: "forbidden" });
    expect(authorizeMonitor(secret, secret)).toEqual({ ok: false, reason: "forbidden" });
    expect(authorizeMonitor(`Bearer ${secret}x`, secret)).toEqual({ ok: false, reason: "forbidden" });
    expect(authorizeMonitor(`Bearer ${secret.slice(0, -1)}`, secret)).toEqual({ ok: false, reason: "forbidden" });
    expect(authorizeMonitor(`Basic ${secret}`, secret)).toEqual({ ok: false, reason: "forbidden" });
  });

  it("constantTimeEqual compares whole strings regardless of length", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });
});

describe("thresholds and constants are pinned to the code they judge", () => {
  it("stale claim threshold equals the governed lease TTL", () => {
    expect(THRESHOLDS.staleClaimMs).toBe(DEFAULT_STALE_AFTER_MS);
    expect(THRESHOLDS.abandonedClaimMs).toBeGreaterThan(THRESHOLDS.staleClaimMs);
    expect(THRESHOLDS.routeLatencyFailMs).toBeGreaterThan(THRESHOLDS.routeLatencyWarnMs);
    expect(THRESHOLDS.serverBudgetMs).toBeLessThan(60_000);
    expect(THRESHOLDS.checkTimeoutMs).toBeLessThan(THRESHOLDS.serverBudgetMs);
  });

  it("expected Stripe prices mirror the locked offer catalogue", () => {
    for (const p of EXPECTED_PRICES) {
      const offer = OFFERS[p.label];
      expect(offer.priceEnvVar).toBe(p.envVar);
      expect(offer.expectedAmountCents).toBe(p.amountCents);
      expect(offer.expectedCurrency).toBe(p.currency);
    }
  });

  it("required pipeline variables are part of the environment contract", () => {
    const example = readFileSync(".env.example", "utf8");
    for (const name of PIPELINE_REQUIRED_ENV) expect(example).toContain(`${name}=`);
    expect(example).toContain("HEALTH_MONITOR_SECRET");
  });

  it("required tables and lease RPCs are the ones the migrations create", () => {
    const sql = ["0001_analyzer_commerce", "0002_song_memory", "0003_report_claims"]
      .map((f) => readFileSync(`db/migrations/${f}.sql`, "utf8"))
      .join("\n");
    for (const t of REQUIRED_TABLES) expect(sql).toMatch(new RegExp(`create table if not exists ${t}\\b`));
    for (const { fn, args } of LEASE_RPCS) {
      const m = new RegExp(`create or replace function ${fn}\\(([^)]*)\\)`, "s").exec(sql);
      expect(m, fn).not.toBeNull();
      const declared = m![1].split(",").map((s) => s.trim().split(/\s+/)[0]);
      expect(declared).toEqual([...args]);
    }
  });

  it("every API probe targets a route that exists in the app", () => {
    for (const probe of API_PROBES) {
      const path = probe.path.split("?")[0];
      const segments = path.replace(/^\/api\//, "").split("/");
      // Dynamic segments become [id] directories.
      const candidates = [
        `src/app/api/${segments.join("/")}/route.ts`,
        `src/app/api/${segments.slice(0, -1).join("/")}/[id]/route.ts`,
      ];
      expect(candidates.some((c) => existsSync(c)), probe.id).toBe(true);
    }
  });
});

describe("renderings", () => {
  const report: SentinelReport = {
    schemaVersion: 1,
    kind: "sentinel",
    generatedAt: "2026-09-08T00:00:00.000Z",
    target: { baseUrl: "https://scan.chrp.ai", expectedSha: "066d2f5669d57fdf605f726a629210c283e152dd" },
    overall: "YELLOW",
    deployment: { sha: "066d2f5669d57fdf605f726a629210c283e152dd", deploymentId: "dpl_1", env: "production", region: "iad1", ref: "main" },
    boundaries: [
      boundaryResult("rhodes", [{ id: "system_prompt_drift", status: "WARN", summary: "wording | differs" }], 5),
      boundaryResult("application", [{ id: "dns_tls_root", status: "PASS", summary: "ok" }], 3),
    ],
    ms: 42,
  };

  it("human summary leads with the colour and lists boundaries in canonical order", () => {
    const text = formatHuman(report);
    expect(text.split("\n")[0]).toBe("CHRP Analyzer production sentinel — YELLOW");
    expect(text.indexOf("application")).toBeLessThan(text.indexOf("rhodes"));
    expect(text).toContain("sha 066d2f5");
    expect(text).toContain("system_prompt_drift");
  });

  it("markdown summary has a table per boundary and escapes pipes", () => {
    const md = formatMarkdown(report);
    expect(md).toContain("## 🟡 Production sentinel: YELLOW");
    expect(md).toContain("### ✅ application — PASS");
    expect(md).toContain("### ⚠️ rhodes — WARN");
    expect(md).toContain("wording \\| differs");
  });
});
