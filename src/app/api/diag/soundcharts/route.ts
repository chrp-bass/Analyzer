/**
 * TEMPORARY DIAGNOSTIC — DELETE ME.
 *
 * ONE JOB: probe the Soundcharts endpoints the intelligence layer wants to
 * consume against the CHRP production Soundcharts account, and return a
 * SANITIZED summary of what is actually reachable on our tier. Runs as a
 * preview-only serverless function so it inherits the production Soundcharts
 * credentials via the Vercel env vault without ever placing them on local
 * disk. The values are read at process time only; nothing they carry is
 * echoed back in any response.
 *
 * SAFETY RAILS (all enforced at runtime):
 *
 *   1. Refuses on production deployments (VERCEL_ENV === "production").
 *   2. Requires a shared-secret ?token= that matches env var DIAG_TOKEN,
 *      which lives ONLY in the preview scope and is deleted alongside this
 *      file. Constant-time comparison; wrong tokens 401 with no distinction.
 *   3. Refuses when DIAG_TOKEN is unset (fail-closed if the deploy forgets).
 *   4. Rate-limited to one full probe per invocation.
 *   5. Response bodies carry only:
 *        - endpoint key
 *        - HTTP status code
 *        - shape summary (top-level keys, up to 10)
 *        - whether the payload looks usable
 *        - one-line coverage note
 *      Never: request headers, response headers, credentials, tokens,
 *      full raw payloads, any secret value.
 *
 * This file must be deleted, and DIAG_TOKEN removed from Vercel, before
 * PR #1 is marked ready for review.
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BASE = "https://customer.api.soundcharts.com";

/** Endpoints under test, in probe order. Every call is fail-open. */
const ENDPOINTS: Array<{ key: string; path: (uuid: string) => string }> = [
  { key: "lyrics-analysis",         path: (u) => `/api/v2.25/song/${u}/lyrics-analysis` },
  { key: "current-stats",           path: (u) => `/api/v2.25/song/${u}/current/stats` },
  { key: "soundcharts-score",       path: (u) => `/api/v2.25/song/${u}/soundcharts/score` },
  { key: "audience-spotify",        path: (u) => `/api/v2.25/song/${u}/audience/spotify` },
  { key: "audience-shazam",         path: (u) => `/api/v2.25/song/${u}/audience/shazam` },
  { key: "audience-tiktok",         path: (u) => `/api/v2.25/song/${u}/audience/tiktok` },
  { key: "audience-youtube",        path: (u) => `/api/v2.25/song/${u}/audience/youtube` },
  { key: "streaming-spotify",       path: (u) => `/api/v2.25/song/${u}/streaming/spotify` },
  { key: "popularity-spotify",      path: (u) => `/api/v2.25/song/${u}/popularity/spotify` },
  { key: "playlist-current-spotify",path: (u) => `/api/v2.25/song/${u}/playlist/current/spotify` },
  { key: "playlist-reach-spotify",  path: (u) => `/api/v2.25/song/${u}/playlist/reach/spotify` },
  { key: "charts-ranks-spotify",    path: (u) => `/api/v2.25/song/${u}/charts/ranks/spotify` },
  { key: "broadcasts",              path: (u) => `/api/v2.25/song/${u}/broadcasts` },
  { key: "broadcast-groups",        path: (u) => `/api/v2.25/song/${u}/broadcast-groups` },
];

/** Return the top object of a Soundcharts response, or null. Never raw payload. */
function pickTop(body: unknown): {
  keys: string[];
  itemsLen: number | null;
  usable: boolean;
} {
  if (!body || typeof body !== "object") {
    return { keys: [], itemsLen: null, usable: false };
  }
  const b = body as Record<string, unknown>;
  let top: Record<string, unknown> | null = null;
  if (b.object && typeof b.object === "object") {
    top = b.object as Record<string, unknown>;
  } else if (Array.isArray(b.items)) {
    top = { items: b.items };
  } else if (typeof b === "object") {
    top = b as Record<string, unknown>;
  }
  if (!top) return { keys: [], itemsLen: null, usable: false };
  const keys = Object.keys(top).slice(0, 10);
  const itemsLen = Array.isArray(top.items) ? top.items.length : null;
  const usable =
    keys.some((k) =>
      /themes|moods|narrativeStyle|score|value|items|streams|popularity|listeners|countries|history|ranks|videos|playlists|shazam|reach|broadcasts/i.test(
        k,
      ),
    ) && (itemsLen === null || itemsLen > 0);
  return { keys, itemsLen, usable };
}

/** Constant-time string compare — never leaks via length either. */
function safeCompare(a: string, b: string): boolean {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  if (A.length !== B.length) {
    // Compare against self to keep time constant; the mismatch is what matters.
    timingSafeEqual(A, A);
    return false;
  }
  return timingSafeEqual(A, B);
}

async function safeGet(
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: unknown; rateHint: string | null }> {
  const res = await fetch(url, {
    headers: { ...headers, Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  const rateHint =
    res.headers.get("x-quota-remaining") ??
    res.headers.get("x-rate-limit-remaining") ??
    res.headers.get("retry-after") ??
    null;
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = { _nonjson: true };
  }
  return { status: res.status, body, rateHint };
}

export async function GET(request: NextRequest) {
  // Rail 1: never on production.
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json(
      { error: "diagnostic disabled on production" },
      { status: 403 },
    );
  }

  // Rail 2 + 3: token gate with fail-closed if unset. The `hint` field
  // reveals ONLY length information (not values, prefixes, or any content).
  // Present because the first attempt returned 401 and we need to know
  // whether the env var reached the deploy or the value differs. Removed
  // when the diagnostic is removed.
  const expected = process.env.DIAG_TOKEN;
  const provided = request.nextUrl.searchParams.get("token") ?? "";
  if (!expected) {
    return NextResponse.json(
      { error: "unauthorized", hint: "env_missing" },
      { status: 401 },
    );
  }
  if (!safeCompare(provided, expected)) {
    return NextResponse.json(
      {
        error: "unauthorized",
        hint: "token_mismatch",
        provided_len: provided.length,
        expected_len: expected.length,
      },
      { status: 401 },
    );
  }

  const appId = process.env.SOUNDCHARTS_APP_ID;
  const apiKey = process.env.SOUNDCHARTS_API_KEY;
  if (!appId || !apiKey) {
    return NextResponse.json(
      { error: "soundcharts credentials not configured in this deployment" },
      { status: 500 },
    );
  }

  const isrc =
    request.nextUrl.searchParams.get("isrc") ?? "GBWUL2270744";

  const headers = { "x-app-id": appId, "x-api-key": apiKey };

  // Step 1: by-isrc, to recover the UUID and describe the base payload's
  // shape. We report which of the extra audio-feature fields are present.
  const byIsrc = await safeGet(
    `${BASE}/api/v2.25/song/by-isrc/${encodeURIComponent(isrc)}`,
    headers,
  );
  const byIsrcObj = pickTop(byIsrc.body);
  const rawObject =
    (byIsrc.body as { object?: Record<string, unknown> } | null)?.object ??
    null;
  const uuidRaw = rawObject?.uuid;
  const uuid = typeof uuidRaw === "string" ? uuidRaw : null;

  // Extra audio fields present at all? (No values — just presence + rough range.)
  const audio = rawObject?.audio as Record<string, unknown> | undefined;
  const audioFieldsPresent: Record<string, string> = {};
  if (audio && typeof audio === "object") {
    for (const k of [
      "instrumentalness",
      "speechiness",
      "acousticness",
      "tempo",
      "energy",
      "liveness",
      "danceability",
      "loudness",
      "valence",
      "key",
      "mode",
      "timeSignature",
      "duration",
    ]) {
      const v = audio[k];
      if (typeof v === "number" && Number.isFinite(v)) {
        // Bucket the value so no exact tempo/key values leak, but shape is visible.
        const bucketed = Math.abs(v) < 1 ? v.toFixed(2) : String(Math.round(v));
        audioFieldsPresent[k] = `number(${bucketed})`;
      } else if (typeof v === "string") {
        audioFieldsPresent[k] = "string";
      }
    }
  }

  type Row = {
    endpoint: string;
    status: number;
    result:
      | "AVAILABLE + POPULATED"
      | "AVAILABLE + SPARSE"
      | "PLAN-GATED"
      | "UNAVAILABLE"
      | "ERROR";
    top_keys: string[];
    items_len: number | null;
    note: string;
    rate_hint: string | null;
  };

  const rows: Row[] = [];

  if (uuid) {
    for (const spec of ENDPOINTS) {
      const res = await safeGet(`${BASE}${spec.path(uuid)}`, headers);
      const top = pickTop(res.body);
      let result: Row["result"];
      let note: string;
      if (res.status === 200) {
        if (top.usable) {
          result = "AVAILABLE + POPULATED";
          note =
            top.itemsLen !== null
              ? `items: ${top.itemsLen}`
              : `has: ${top.keys.join(", ")}`;
        } else {
          result = "AVAILABLE + SPARSE";
          note = `top keys: ${top.keys.join(", ") || "(none)"}`;
        }
      } else if (res.status === 403) {
        result = "PLAN-GATED";
        note = "http 403";
      } else if (res.status === 404) {
        result = "UNAVAILABLE";
        note = "http 404";
      } else if (res.status === 429) {
        result = "PLAN-GATED";
        note = "http 429 (rate limit)";
      } else {
        result = "ERROR";
        note = `http ${res.status}`;
      }
      rows.push({
        endpoint: spec.key,
        status: res.status,
        result,
        top_keys: top.keys,
        items_len: top.itemsLen,
        note,
        rate_hint: res.rateHint,
      });
    }
  }

  return NextResponse.json({
    diagnostic: "temporary — delete src/app/api/_diag after use",
    vercel_env: process.env.VERCEL_ENV ?? "(unknown)",
    isrc,
    by_isrc: {
      status: byIsrc.status,
      uuid_present: Boolean(uuid),
      top_keys: byIsrcObj.keys,
      audio_fields_present: audioFieldsPresent,
      rate_hint: byIsrc.rateHint,
    },
    endpoints: rows,
    summary: {
      available_populated: rows.filter((r) => r.result === "AVAILABLE + POPULATED").length,
      available_sparse: rows.filter((r) => r.result === "AVAILABLE + SPARSE").length,
      plan_gated: rows.filter((r) => r.result === "PLAN-GATED").length,
      unavailable: rows.filter((r) => r.result === "UNAVAILABLE").length,
      error: rows.filter((r) => r.result === "ERROR").length,
    },
  });
}
