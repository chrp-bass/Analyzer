/**
 * The sentinel's read-only view of production Postgres, through Supabase's
 * PostgREST surface. Deliberately NOT supabase-js: the checks need an
 * injectable, inspectable interface with hard timeouts, and they need to
 * issue requests as TWO roles — the service role (to count) and the anon role
 * (to prove RLS denies).
 *
 * Nothing here can write. Every request is GET/HEAD, or a POST to an RPC with
 * every argument null, which the shipped functions reject with
 * `invalid arguments` before any statement that could mutate.
 */

import { httpRequest, type FetchLike, type HttpOutcome } from "./http";

export type PostgrestRole = "service" | "anon";

export interface PostgrestConfig {
  url: string;
  serviceKey: string;
  anonKey: string;
  fetchImpl: FetchLike;
  timeoutMs: number;
  now?: () => number;
  signal?: AbortSignal;
}

export interface CountOutcome {
  ok: true;
  count: number;
  ms: number;
}
export interface RowsOutcome<T> {
  ok: true;
  rows: T[];
  /** True when the row cap was hit; aggregates are then over a sample. */
  truncated: boolean;
  ms: number;
}
export interface PostgrestFailure {
  ok: false;
  kind: "timeout" | "network" | "http";
  status?: number;
  /** PostgREST / Postgres error code (e.g. PGRST202, 42501, P0001). */
  code?: string;
  ms: number;
}

export interface PostgrestReader {
  /** OpenAPI document paths, as exposed to the service role. */
  openapiPaths(): Promise<{ ok: true; paths: string[]; ms: number } | PostgrestFailure>;
  /** Exact row count for a table with an optional PostgREST filter string. */
  count(table: string, filter?: string): Promise<CountOutcome | PostgrestFailure>;
  /** Bounded select of the named columns (service role). */
  rows<T>(table: string, select: string, filter: string | undefined, cap: number): Promise<RowsOutcome<T> | PostgrestFailure>;
  /** SELECT one column, limit 1, as the ANON role — proves what a client sees. */
  anonSelect(table: string, column: string): Promise<{ ok: true; status: number; rowCount: number; code?: string; ms: number } | PostgrestFailure>;
  /** POST an RPC with every named argument null, as a role. */
  rpcNullProbe(fn: string, argNames: readonly string[], role: PostgrestRole): Promise<{ ok: true; status: number; code?: string; ms: number } | PostgrestFailure>;
}

function readCode(json: unknown): string | undefined {
  if (json && typeof json === "object") {
    const c = (json as { code?: unknown }).code;
    if (typeof c === "string" && /^[A-Z0-9]{1,12}$/.test(c)) return c;
  }
  return undefined;
}

function failure(outcome: Extract<HttpOutcome, { ok: false }>): PostgrestFailure {
  return { ok: false, kind: outcome.kind, ms: outcome.ms };
}

export function createPostgrestReader(cfg: PostgrestConfig): PostgrestReader {
  const base = cfg.url.replace(/\/$/, "");
  const now = cfg.now ?? (() => Date.now());

  function headers(role: PostgrestRole, extra: Record<string, string> = {}) {
    const key = role === "service" ? cfg.serviceKey : cfg.anonKey;
    return {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...extra,
    };
  }

  async function request(
    role: PostgrestRole,
    path: string,
    init: { method?: string; headers?: Record<string, string>; body?: string } = {},
  ): Promise<HttpOutcome> {
    return httpRequest(
      cfg.fetchImpl,
      {
        url: `${base}${path}`,
        method: init.method,
        headers: headers(role, init.headers),
        body: init.body,
        timeoutMs: cfg.timeoutMs,
        signal: cfg.signal,
      },
      now,
    );
  }

  return {
    async openapiPaths() {
      const res = await request("service", "/rest/v1/");
      if (!res.ok) return failure(res);
      if (res.status !== 200) return { ok: false, kind: "http", status: res.status, code: readCode(res.json), ms: res.ms };
      const paths =
        res.json && typeof res.json === "object" && (res.json as { paths?: unknown }).paths
          ? Object.keys((res.json as { paths: Record<string, unknown> }).paths)
          : null;
      if (!paths) return { ok: false, kind: "http", status: res.status, code: "MALFORMED_OPENAPI", ms: res.ms };
      return { ok: true, paths, ms: res.ms };
    },

    async count(table, filter) {
      const qs = filter ? `?select=*&${filter}` : "?select=*";
      const res = await request("service", `/rest/v1/${table}${qs}`, {
        method: "HEAD",
        headers: { Prefer: "count=exact", Range: "0-0", "Range-Unit": "items" },
      });
      if (!res.ok) return failure(res);
      if (res.status !== 200 && res.status !== 206) {
        return { ok: false, kind: "http", status: res.status, code: readCode(res.json), ms: res.ms };
      }
      const range = res.headers.get("content-range") ?? "";
      const m = /\/(\d+|\*)$/.exec(range);
      if (!m || m[1] === "*") return { ok: false, kind: "http", status: res.status, code: "NO_COUNT", ms: res.ms };
      return { ok: true, count: Number(m[1]), ms: res.ms };
    },

    async rows<T>(table: string, select: string, filter: string | undefined, cap: number) {
      const qs = `?select=${encodeURIComponent(select)}${filter ? `&${filter}` : ""}`;
      const res = await request("service", `/rest/v1/${table}${qs}`, {
        headers: { Range: `0-${Math.max(0, cap - 1)}`, "Range-Unit": "items", Prefer: "count=exact" },
      });
      if (!res.ok) return failure(res);
      if (res.status !== 200 && res.status !== 206) {
        return { ok: false, kind: "http", status: res.status, code: readCode(res.json), ms: res.ms };
      }
      if (!Array.isArray(res.json)) return { ok: false, kind: "http", status: res.status, code: "MALFORMED_ROWS", ms: res.ms };
      const range = res.headers.get("content-range") ?? "";
      const total = /\/(\d+)$/.exec(range);
      const truncated = total ? Number(total[1]) > res.json.length : res.json.length >= cap;
      return { ok: true, rows: res.json as T[], truncated, ms: res.ms };
    },

    async anonSelect(table, column) {
      const res = await request("anon", `/rest/v1/${table}?select=${encodeURIComponent(column)}&limit=1`);
      if (!res.ok) return failure(res);
      const rowCount = Array.isArray(res.json) ? res.json.length : 0;
      return { ok: true, status: res.status, rowCount, code: readCode(res.json), ms: res.ms };
    },

    async rpcNullProbe(fn, argNames, role) {
      const args: Record<string, null> = {};
      for (const a of argNames) args[a] = null;
      const res = await request(role, `/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      if (!res.ok) return failure(res);
      return { ok: true, status: res.status, code: readCode(res.json), ms: res.ms };
    },
  };
}
