/**
 * TEMPORARY DIAGNOSTIC — DEEP FIELD INSPECTION (still deleted before final review).
 *
 * Now that the live probe has locked which endpoints are reachable and at
 * which versions, this variant returns a NARROWLY SANITIZED field-shape
 * summary of each verified endpoint's actual payload — the minimum needed to
 * write correct extractors. Never returns credentials, headers, tokens, or
 * raw payloads. Every string/array value is truncated and count-limited.
 *
 * Same gates as before: refuses on production, requires DIAG_TOKEN in the
 * URL path, and lives at src/app/api/diag/soundcharts/[token]/route.ts —
 * every rail preserved.
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BASE = "https://customer.api.soundcharts.com";

/** The VERIFIED endpoint contract — locked by the previous probe. */
const VERIFIED_ENDPOINTS: Array<{
  key: string;
  path: (uuid: string) => string;
}> = [
  { key: "lyrics-analysis",         path: (u) => `/api/v2/song/${u}/lyrics-analysis` },
  { key: "soundcharts-score",       path: (u) => `/api/v2/song/${u}/soundcharts/score` },
  { key: "playlist-current-spotify",path: (u) => `/api/v2.20/song/${u}/playlist/current/spotify` },
  { key: "charts-ranks-spotify",    path: (u) => `/api/v2/song/${u}/charts/ranks/spotify` },
  { key: "broadcasts",              path: (u) => `/api/v2/song/${u}/broadcasts` },
];

function safeCompare(a: string, b: string): boolean {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  if (A.length !== B.length) {
    timingSafeEqual(A, A);
    return false;
  }
  return timingSafeEqual(A, B);
}

async function safeGet(
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, {
    headers: { ...headers, Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  let body: unknown = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}

/** Bucket a numeric value so exact metric values never leak. */
function bucketNum(n: number): string {
  if (!Number.isFinite(n)) return "NaN";
  const a = Math.abs(n);
  if (a < 1) return n.toFixed(2);
  if (a < 100) return String(Math.round(n));
  if (a < 10_000) return `~${Math.round(n / 100) * 100}`;
  if (a < 1_000_000) return `~${Math.round(n / 10_000) * 10_000}`;
  return `~${Math.round(n / 100_000) * 100_000}`;
}

/**
 * Describe a value: type + trimmed length or bucketed magnitude.
 * Strings truncated to 40 chars. Nested objects show only field names.
 */
function describe(v: unknown, depth = 0): unknown {
  if (v === null) return null;
  if (typeof v === "number") return `number(${bucketNum(v)})`;
  if (typeof v === "boolean") return `bool(${v})`;
  if (typeof v === "string") {
    return v.length <= 40 ? `string("${v}")` : `string(len:${v.length})`;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return "array(empty)";
    if (depth >= 2) return `array(len:${v.length})`;
    // Sample up to 3 items to reveal item shape.
    const sample = v.slice(0, 3).map((it) => describe(it, depth + 1));
    return { _array_len: v.length, _sample_first_3: sample };
  }
  if (typeof v === "object") {
    if (depth >= 3) return "object(...)";
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = describe(val, depth + 1);
      count += 1;
      if (count >= 30) {
        out["_more_keys_omitted"] = Object.keys(v as object).length - count;
        break;
      }
    }
    return out;
  }
  return `unknown(${typeof v})`;
}

/** Read the endpoint payload's "primary content" — object OR items. */
function payloadContent(body: unknown): {
  kind: "object" | "items" | "other";
  content: unknown;
  count: number;
} {
  if (!body || typeof body !== "object")
    return { kind: "other", content: body, count: 0 };
  const b = body as Record<string, unknown>;
  if (Array.isArray(b.items))
    return { kind: "items", content: b.items, count: b.items.length };
  if (b.object && typeof b.object === "object")
    return { kind: "object", content: b.object, count: 1 };
  return { kind: "other", content: b, count: 0 };
}

/** Count value frequencies for a field across a list of items. */
function distribution(
  items: unknown[],
  field: string,
  cap = 12,
): Array<{ value: string; count: number }> {
  const bag = new Map<string, number>();
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const v = (it as Record<string, unknown>)[field];
    if (v === null || v === undefined) continue;
    const k = typeof v === "string" ? v : JSON.stringify(v);
    bag.set(k, (bag.get(k) ?? 0) + 1);
  }
  const entries: Array<[string, number]> = [];
  bag.forEach((count, value) => entries.push([value, count]));
  return entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, cap)
    .map(([value, count]) => ({ value: value.slice(0, 60), count }));
}

/** Deep sanitized field walk for a single endpoint. */
function sanitizedFor(
  endpointKey: string,
  body: unknown,
): Record<string, unknown> {
  const pc = payloadContent(body);

  if (endpointKey === "lyrics-analysis") {
    // Prefer the `.object.lyricsAnalysis` shape if present.
    const container = (pc.content as Record<string, unknown>) ?? {};
    const la =
      (container.lyricsAnalysis as Record<string, unknown> | undefined) ??
      container;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(la ?? {})) {
      out[k] = describe(la[k], 0);
    }
    // Also enumerate what siblings exist alongside lyricsAnalysis (e.g. related).
    const siblings = pc.content && typeof pc.content === "object"
      ? Object.keys(pc.content as object).filter((k) => k !== "lyricsAnalysis")
      : [];
    return { lyricsAnalysis_fields: out, sibling_keys: siblings };
  }

  if (endpointKey === "soundcharts-score") {
    const items = pc.kind === "items" ? (pc.content as unknown[]) : [];
    return {
      item_count: pc.count,
      first_3_items: items.slice(0, 3).map((it) => describe(it, 0)),
    };
  }

  if (endpointKey === "playlist-current-spotify") {
    const items = pc.kind === "items" ? (pc.content as unknown[]) : [];
    // Sample one item's full field-shape.
    const sampleShape = items[0] ? describe(items[0], 0) : null;
    return {
      item_count: pc.count,
      sample_item_shape: sampleShape,
      distributions: {
        type: distribution(items, "type"),
        subType: distribution(items, "subType"),
        country: distribution(items, "country"),
        countryCode: distribution(items, "countryCode"),
        platform: distribution(items, "platform"),
        genre: distribution(items, "genre"),
      },
      three_representative_names: items
        .slice(0, 3)
        .map((it) => {
          const o = it as Record<string, unknown>;
          const p = (o.playlist as Record<string, unknown> | undefined);
          return {
            playlist_name:
              typeof p?.name === "string" ? p.name.slice(0, 60) : null,
            type: typeof o.type === "string" ? o.type : null,
            country: typeof o.country === "string" ? o.country : null,
            position:
              typeof o.position === "number" ? Math.round(o.position) : null,
          };
        }),
    };
  }

  if (endpointKey === "charts-ranks-spotify") {
    const items = pc.kind === "items" ? (pc.content as unknown[]) : [];
    return {
      item_count: pc.count,
      sample_item_shape: items[0] ? describe(items[0], 0) : null,
      distributions: {
        country: distribution(items, "country"),
        countryCode: distribution(items, "countryCode"),
        chart_type: distribution(items, "type"),
        platform: distribution(items, "platform"),
      },
    };
  }

  if (endpointKey === "broadcasts") {
    const items = pc.kind === "items" ? (pc.content as unknown[]) : [];
    return {
      item_count: pc.count,
      sample_item_shape: items[0] ? describe(items[0], 0) : null,
      distributions: {
        radioType: distribution(items, "radioType"),
        radio_country: distribution(items, "country"),
        country_code: distribution(items, "countryCode"),
        format: distribution(items, "format"),
      },
    };
  }

  return { top_level: describe(body, 0) };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } },
) {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "diagnostic disabled on production" }, { status: 403 });
  }
  const expected = process.env.DIAG_TOKEN;
  const provided = decodeURIComponent(params.token ?? "");
  if (!expected) return NextResponse.json({ error: "unauthorized", hint: "env_missing" }, { status: 401 });
  if (!safeCompare(provided, expected))
    return NextResponse.json({ error: "unauthorized", hint: "token_mismatch" }, { status: 401 });

  const appId = process.env.SOUNDCHARTS_APP_ID;
  const apiKey = process.env.SOUNDCHARTS_API_KEY;
  if (!appId || !apiKey)
    return NextResponse.json({ error: "creds not configured" }, { status: 500 });

  const isrcs = (request.nextUrl.searchParams.get("isrcs") ??
    "GBWUL2270744,USUG11904206")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 2);

  const headers = { "x-app-id": appId, "x-api-key": apiKey };

  const results: Array<Record<string, unknown>> = [];

  for (const isrc of isrcs) {
    const byIsrc = await safeGet(
      `${BASE}/api/v2.25/song/by-isrc/${encodeURIComponent(isrc)}`,
      headers,
    );
    const rawObject =
      (byIsrc.body as { object?: Record<string, unknown> } | null)?.object ??
      null;
    const uuid = typeof rawObject?.uuid === "string" ? rawObject.uuid : null;

    if (!uuid) {
      results.push({ isrc, by_isrc_status: byIsrc.status, uuid_present: false });
      continue;
    }

    const perEndpoint: Record<string, unknown> = {};
    for (const spec of VERIFIED_ENDPOINTS) {
      const res = await safeGet(`${BASE}${spec.path(uuid)}`, headers);
      if (res.status !== 200) {
        perEndpoint[spec.key] = {
          _status: res.status,
          _note: "non-200; skipped inspection",
        };
        continue;
      }
      perEndpoint[spec.key] = {
        _status: 200,
        _path: spec.path(uuid),
        ...sanitizedFor(spec.key, res.body),
      };
    }

    results.push({
      isrc,
      by_isrc_status: byIsrc.status,
      uuid_present: true,
      endpoints: perEndpoint,
    });
  }

  return NextResponse.json({
    diagnostic: "temporary — delete src/app/api/diag after use",
    vercel_env: process.env.VERCEL_ENV ?? "(unknown)",
    verified_contract: VERIFIED_ENDPOINTS.map((e) => ({
      key: e.key,
      path_pattern: e.path("{uuid}"),
    })),
    songs: results,
  });
}
