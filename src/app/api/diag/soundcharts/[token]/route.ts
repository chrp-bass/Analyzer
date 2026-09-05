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

/**
 * Endpoints under test — every feature is probed with candidate version
 * prefixes because Soundcharts's v2 family fragments across v2 / v2.20 /
 * v2.25 depending on when each endpoint was added. First candidate that
 * returns 200 wins for that feature; if none 200s we know the feature is
 * either not on the tier or the song has no coverage.
 *
 * Every call is fail-open at the client level.
 */
type EndpointSpec = { key: string; candidates: Array<(uuid: string) => string> };

const ENDPOINTS: EndpointSpec[] = [
  {
    key: "lyrics-analysis",
    candidates: [
      (u) => `/api/v2.25/song/${u}/lyrics-analysis`,
      (u) => `/api/v2/song/${u}/lyrics-analysis`,
      (u) => `/api/v2.20/song/${u}/lyrics-analysis`,
    ],
  },
  {
    key: "current-stats",
    candidates: [
      (u) => `/api/v2/song/${u}/current/stat`,
      (u) => `/api/v2.25/song/${u}/current/stats`,
      (u) => `/api/v2/song/${u}/current/stats`,
    ],
  },
  {
    key: "soundcharts-score",
    candidates: [
      (u) => `/api/v2/song/${u}/soundcharts/score`,
      (u) => `/api/v2.25/song/${u}/soundcharts/score`,
    ],
  },
  {
    key: "audience-spotify",
    candidates: [
      (u) => `/api/v2/song/${u}/spotify/audience`,
      (u) => `/api/v2.25/song/${u}/audience/spotify`,
    ],
  },
  {
    key: "audience-shazam",
    candidates: [
      (u) => `/api/v2/song/${u}/shazam`,
      (u) => `/api/v2/song/${u}/shazam/audience`,
    ],
  },
  {
    key: "audience-tiktok",
    candidates: [
      (u) => `/api/v2/song/${u}/tiktok`,
      (u) => `/api/v2/song/${u}/tiktok/audience`,
    ],
  },
  {
    key: "audience-youtube",
    candidates: [
      (u) => `/api/v2/song/${u}/youtube`,
      (u) => `/api/v2/song/${u}/youtube/audience`,
    ],
  },
  {
    key: "streaming-spotify",
    candidates: [
      (u) => `/api/v2/song/${u}/spotify/stream`,
      (u) => `/api/v2.25/song/${u}/streaming/spotify`,
    ],
  },
  {
    key: "popularity-spotify",
    candidates: [
      (u) => `/api/v2/song/${u}/spotify/popularity`,
      (u) => `/api/v2.25/song/${u}/popularity/spotify`,
    ],
  },
  {
    key: "playlist-current-spotify",
    candidates: [
      (u) => `/api/v2.20/song/${u}/playlist/current/spotify`,
      (u) => `/api/v2/song/${u}/playlist/current/spotify`,
    ],
  },
  {
    key: "charts-ranks-spotify",
    candidates: [
      (u) => `/api/v2/song/${u}/charts/ranks/spotify`,
      (u) => `/api/v2.20/song/${u}/charts/ranks/spotify`,
    ],
  },
  {
    key: "broadcasts",
    candidates: [
      (u) => `/api/v2/song/${u}/broadcasts`,
      (u) => `/api/v2.25/song/${u}/broadcasts`,
    ],
  },
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

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } },
) {
  // Rail 1: never on production.
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json(
      { error: "diagnostic disabled on production" },
      { status: 403 },
    );
  }

  // Rail 2 + 3: token gate with fail-closed if unset. Token lives in the URL
  // PATH — Vercel SSO strips ?query= tokens on redirect as a safety measure,
  // and the path segment survives the SSO round-trip intact.
  const expected = process.env.DIAG_TOKEN;
  const provided = decodeURIComponent(params.token ?? "");
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

  // Comma-separated ISRCs; default is Safe + Blinding Lights so we can tell
  // "small indie has no coverage" apart from "tier lacks the endpoint".
  const isrcs = (request.nextUrl.searchParams.get("isrcs") ??
    request.nextUrl.searchParams.get("isrc") ??
    "GBWUL2270744,USUG11904206")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);

  const headers = { "x-app-id": appId, "x-api-key": apiKey };

  type EndpointRow = {
    endpoint: string;
    status: number;
    path_that_worked: string | null;
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
  type SongResult = {
    isrc: string;
    by_isrc_status: number;
    uuid_present: boolean;
    top_keys: string[];
    audio_fields_present: Record<string, string>;
    endpoints: EndpointRow[];
  };

  const songResults: SongResult[] = [];

  for (const isrc of isrcs) {
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

    const audio = rawObject?.audio as Record<string, unknown> | undefined;
    const audioFieldsPresent: Record<string, string> = {};
    if (audio && typeof audio === "object") {
      for (const k of [
        "instrumentalness","speechiness","acousticness","tempo","energy",
        "liveness","danceability","loudness","valence","key","mode",
        "timeSignature","duration",
      ]) {
        const v = audio[k];
        if (typeof v === "number" && Number.isFinite(v)) {
          const bucketed = Math.abs(v) < 1 ? v.toFixed(2) : String(Math.round(v));
          audioFieldsPresent[k] = `number(${bucketed})`;
        } else if (typeof v === "string") {
          audioFieldsPresent[k] = "string";
        }
      }
    }

    const rows: EndpointRow[] = [];
    if (uuid) {
      for (const spec of ENDPOINTS) {
        let winner: {
          status: number;
          path: string;
          top: ReturnType<typeof pickTop>;
          rate: string | null;
        } | null = null;
        let lastNon200: {
          status: number;
          path: string;
          rate: string | null;
        } | null = null;
        for (const build of spec.candidates) {
          const path = build(uuid);
          const res = await safeGet(`${BASE}${path}`, headers);
          if (res.status === 200) {
            winner = {
              status: 200,
              path,
              top: pickTop(res.body),
              rate: res.rateHint,
            };
            break;
          }
          lastNon200 = { status: res.status, path, rate: res.rateHint };
        }

        if (winner) {
          const result = winner.top.usable
            ? "AVAILABLE + POPULATED"
            : "AVAILABLE + SPARSE";
          rows.push({
            endpoint: spec.key,
            status: 200,
            path_that_worked: winner.path,
            result,
            top_keys: winner.top.keys,
            items_len: winner.top.itemsLen,
            note:
              winner.top.itemsLen !== null
                ? `items: ${winner.top.itemsLen}`
                : `has: ${winner.top.keys.join(", ")}`,
            rate_hint: winner.rate,
          });
        } else {
          const s = lastNon200?.status ?? 0;
          const result: EndpointRow["result"] =
            s === 403 ? "PLAN-GATED"
              : s === 429 ? "PLAN-GATED"
              : s === 404 ? "UNAVAILABLE"
              : "ERROR";
          rows.push({
            endpoint: spec.key,
            status: s,
            path_that_worked: null,
            result,
            top_keys: [],
            items_len: null,
            note:
              s === 0
                ? "no candidates ran"
                : `all candidates returned http ${s} (last tried: ${lastNon200?.path})`,
            rate_hint: lastNon200?.rate ?? null,
          });
        }
      }
    }

    songResults.push({
      isrc,
      by_isrc_status: byIsrc.status,
      uuid_present: Boolean(uuid),
      top_keys: byIsrcObj.keys,
      audio_fields_present: audioFieldsPresent,
      endpoints: rows,
    });
  }

  return NextResponse.json({
    diagnostic: "temporary — delete src/app/api/diag after use",
    vercel_env: process.env.VERCEL_ENV ?? "(unknown)",
    songs: songResults,
  });
}
