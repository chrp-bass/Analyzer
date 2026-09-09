/**
 * Fakes for the production sentinel tests. Every fake is healthy by default
 * and takes overrides, so a test states only the defect it is about.
 */

import type { FetchLike } from "@/lib/sentinel/http";
import type { PostgrestReader } from "@/lib/sentinel/postgrest";
import { LEASE_RPCS, REQUIRED_TABLES } from "@/lib/sentinel/checks/supabase";

export const NEVER = new Promise<never>(() => {});

/** A fetch that never settles until the request's signal aborts. */
export const hangingFetch: FetchLike = (_url, init) =>
  new Promise<Response>((_, reject) => {
    const signal = init?.signal;
    if (!signal) return;
    if (signal.aborted) reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
  });

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function htmlResponse(status = 200, headers: Record<string, string> = {}): Response {
  return new Response("<!doctype html><html><body>CHRP</body></html>", {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "x-vercel-id": "iad1::abc123-1700000000000-deadbeef", ...headers },
  });
}

export interface FakeReaderOptions {
  paths?: string[];
  counts?: Record<string, number>;
  rows?: Record<string, unknown[]>;
  truncated?: boolean;
  anon?: Record<string, { status: number; rowCount: number; code?: string }>;
  rpc?: (fn: string, role: "service" | "anon") => { status: number; code?: string };
  failOpenapi?: { kind: "timeout" | "network" | "http"; status?: number; code?: string };
  hangOpenapi?: boolean;
  failCount?: { kind: "timeout" | "network" | "http"; status?: number; code?: string };
}

/** A healthy production schema, as PostgREST would expose it. */
export function healthyPaths(): string[] {
  return ["/", ...REQUIRED_TABLES.map((t) => `/${t}`), ...LEASE_RPCS.map((r) => `/rpc/${r.fn}`)];
}

export function fakeReader(opts: FakeReaderOptions = {}): PostgrestReader & { calls: string[] } {
  const calls: string[] = [];
  const countFor = (table: string, filter?: string): number => {
    const counts = opts.counts ?? {};
    if (filter) {
      // "table?filter-substring" keys, first match in declaration order; a
      // filtered count with no matching key is 0, never the table total.
      for (const key of Object.keys(counts)) {
        const [t, sub] = key.split("?");
        if (t === table && sub && filter.includes(sub)) return counts[key];
      }
      return 0;
    }
    return counts[table] ?? 0;
  };
  return {
    calls,
    async openapiPaths() {
      calls.push("openapi");
      if (opts.hangOpenapi) return NEVER;
      if (opts.failOpenapi) return { ok: false, ...opts.failOpenapi, ms: 1 };
      return { ok: true, paths: opts.paths ?? healthyPaths(), ms: 1 };
    },
    async count(table, filter) {
      calls.push(`count:${table}${filter ? `?${filter}` : ""}`);
      if (opts.failCount) return { ok: false, ...opts.failCount, ms: 1 };
      return { ok: true, count: countFor(table, filter), ms: 1 };
    },
    async rows<T>(table: string, select: string, filter: string | undefined, cap: number) {
      calls.push(`rows:${table}:${select}${filter ? `?${filter}` : ""}`);
      const rows = ((opts.rows ?? {})[table] ?? []) as T[];
      return { ok: true, rows: rows.slice(0, cap), truncated: opts.truncated ?? rows.length > cap, ms: 1 };
    },
    async anonSelect(table, column) {
      calls.push(`anon:${table}:${column}`);
      const override = opts.anon?.[table];
      if (override) return { ok: true, ...override, ms: 1 };
      if (table === "report_claims") return { ok: true, status: 401, rowCount: 0, code: "42501", ms: 1 };
      return { ok: true, status: 200, rowCount: 0, ms: 1 };
    },
    async rpcNullProbe(fn, _args, role) {
      calls.push(`rpc:${fn}:${role}`);
      const r = opts.rpc?.(fn, role);
      if (r) return { ok: true, ...r, ms: 1 };
      return role === "service" ? { ok: true, status: 400, code: "P0001", ms: 1 } : { ok: true, status: 401, code: "42501", ms: 1 };
    },
  };
}

/**
 * Secret-shaped fixtures. Built at runtime so no literal in the repository
 * matches a vendor key pattern (GitHub push protection scans literals).
 */
export const SECRETS = {
  stripeKey: ["sk", "live", `FAKE${"0".repeat(20)}KEY${"1".repeat(8)}`].join("_"),
  webhookSecret: ["whsec", `FAKE${"2".repeat(28)}`].join("_"),
  elevenKey: "sk_0123456789abcdef0123456789abcdefFEEDFACE",
  serviceKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.service_signature_value",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.anon_signature_value_here",
  signedUrl: "wss://api.elevenlabs.io/v1/convai/conversation?agent_id=vv1j1yrAGF0RdxJOSGIJ&conversation_signature=sig123456789",
  monitor: "m0n1t0r-secret-value-that-is-long-enough-0123456789",
};

/** Every secret-ish token that must never appear in a report. */
export function leaks(json: string): string[] {
  const out: string[] = [];
  for (const [name, value] of Object.entries(SECRETS)) if (json.includes(value)) out.push(name);
  if (/sk_live_|whsec_|xi-api-key|wss:\/\//.test(json)) out.push("secret-shape");
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(json)) out.push("uuid");
  if (/@[a-z0-9.-]+\.[a-z]{2,}/i.test(json)) out.push("email");
  return out;
}
