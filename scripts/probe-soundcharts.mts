#!/usr/bin/env -S npx tsx
/**
 * scripts/probe-soundcharts.mts
 *
 * ONE JOB: check which Soundcharts v2.25 endpoints beyond /song/by-isrc are
 * actually reachable on the current account tier, so the intelligence layer
 * only DEPENDS on data the account can retrieve.
 *
 * Reads SOUNDCHARTS_APP_ID / SOUNDCHARTS_API_KEY from the environment, never
 * prints or logs them, writes a summary to the scratchpad if given a path.
 *
 *   SOUNDCHARTS_APP_ID=… SOUNDCHARTS_API_KEY=… \
 *   npx tsx scripts/probe-soundcharts.mts [OUTFILE.json]
 *
 * The output is a table of endpoint → status → whether the shape looks usable,
 * for each ISRC. Rows tagged "usable" become candidates for the enrichment
 * layer. Nothing here mutates state.
 */

import { writeFileSync } from "node:fs";

const BASE = "https://customer.api.soundcharts.com";

/** The songs to probe against. Diverse in tier/genre/context. */
const SONGS: Array<{ label: string; isrc: string }> = [
  { label: "Safe — The Brevet",              isrc: "GBWUL2270744" },
  { label: "Highway to Hell — AC/DC",        isrc: "AUAP07900028" },
  { label: "Livin' On A Prayer — Bon Jovi",  isrc: "USPR38619998" },
  { label: "Stick Season — Noah Kahan",      isrc: "USUM72212470" },
  { label: "Thunderstruck — AC/DC",          isrc: "AUAP09000014" },
  { label: "Let's Dance — David Bowie",      isrc: "USJT11700482" },
  { label: "Weightless — Marconi Union",     isrc: "GBDDN1200510" },
  { label: "One More Time — Daft Punk",      isrc: "GBDUW0000053" },
  { label: "Someone Like You — Adele",       isrc: "GBBKS1000351" },
  { label: "Blinding Lights — The Weeknd",   isrc: "USUG11904206" },
];

/**
 * The endpoints called out in the intelligence brief as high-leverage.
 * Every one is probed independently; failure of one never blocks another.
 */
type EndpointSpec = {
  key: string;
  /** Path relative to BASE. `{uuid}` substituted per-song. */
  path: (uuid: string) => string;
  /** How to say whether the response body actually carries usable fields. */
  usable: (body: unknown) => { usable: boolean; note: string };
};

const ENDPOINTS: EndpointSpec[] = [
  {
    key: "lyrics-analysis",
    path: (u) => `/api/v2.25/song/${u}/lyrics-analysis`,
    usable: (b) => {
      const obj = pick(b);
      if (!obj) return { usable: false, note: "no object" };
      const fields = Object.keys(obj).slice(0, 8);
      const semantic =
        "themes" in obj || "moods" in obj || "narrativeStyle" in obj ||
        "emotionalIntensityScore" in obj || "imageryScore" in obj;
      return {
        usable: semantic,
        note: semantic ? `has: ${fields.join(", ")}` : `no semantic fields (${fields.join(", ")})`,
      };
    },
  },
  {
    key: "current-stats",
    path: (u) => `/api/v2.25/song/${u}/current/stats`,
    usable: (b) => shapeUsable(b, ["spotify", "shazam", "tiktok", "youtube", "audience"]),
  },
  {
    key: "soundcharts-score",
    path: (u) => `/api/v2.25/song/${u}/soundcharts/score`,
    usable: (b) => shapeUsable(b, ["score", "value", "rank", "history"]),
  },
  {
    key: "audience-spotify",
    path: (u) => `/api/v2.25/song/${u}/audience/spotify`,
    usable: (b) => shapeUsable(b, ["items", "audience", "countries", "listeners"]),
  },
  {
    key: "streaming-spotify",
    path: (u) => `/api/v2.25/song/${u}/streaming/spotify`,
    usable: (b) => shapeUsable(b, ["items", "streams", "value", "history"]),
  },
  {
    key: "playlist-current-spotify",
    path: (u) => `/api/v2.25/song/${u}/playlist/current/spotify`,
    usable: (b) => shapeUsable(b, ["items", "playlists", "total"]),
  },
  {
    key: "charts-ranks-spotify",
    path: (u) => `/api/v2.25/song/${u}/charts/ranks/spotify`,
    usable: (b) => shapeUsable(b, ["items", "ranks", "history"]),
  },
  {
    key: "broadcasts",
    path: (u) => `/api/v2.25/song/${u}/broadcasts`,
    usable: (b) => shapeUsable(b, ["items", "broadcasts", "total"]),
  },
];

/** Return whichever top-level object the payload actually carries. */
function pick(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.object && typeof b.object === "object") {
    return b.object as Record<string, unknown>;
  }
  if (Array.isArray(b.items)) {
    return { items: b.items } as Record<string, unknown>;
  }
  return b;
}

function shapeUsable(body: unknown, keys: string[]): { usable: boolean; note: string } {
  const obj = pick(body);
  if (!obj) return { usable: false, note: "no object" };
  const seen = keys.filter((k) => k in obj);
  return {
    usable: seen.length > 0,
    note: seen.length > 0 ? `has: ${seen.join(", ")}` : `top-level keys: ${Object.keys(obj).slice(0, 6).join(", ") || "(empty)"}`,
  };
}

async function callJson(
  path: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: unknown; rateHint: string | null }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { ...headers, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
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

async function main() {
  const appId = process.env.SOUNDCHARTS_APP_ID;
  const apiKey = process.env.SOUNDCHARTS_API_KEY;
  const outfile = process.argv[2];
  if (!appId || !apiKey) {
    console.error(
      "SOUNDCHARTS_APP_ID and SOUNDCHARTS_API_KEY must be present in the environment.",
    );
    process.exit(1);
  }
  const headers: Record<string, string> = {
    "x-app-id": appId,
    "x-api-key": apiKey,
  };

  type Row = {
    song: string;
    isrc: string;
    uuid: string | null;
    endpoint: string;
    status: number;
    usable: boolean;
    note: string;
    rateHint: string | null;
  };
  const rows: Row[] = [];

  for (const { label, isrc } of SONGS) {
    // First resolve UUID via by-isrc so every other endpoint has a target.
    const byIsrc = await callJson(
      `/api/v2.25/song/by-isrc/${encodeURIComponent(isrc)}`,
      headers,
    );
    const uuid =
      (pick(byIsrc.body) as { uuid?: unknown } | null)?.uuid;
    const uuidStr = typeof uuid === "string" ? uuid : null;

    console.log(`\n${label}  [${isrc}]`);
    console.log(`  by-isrc     -> ${byIsrc.status} uuid=${uuidStr ?? "<none>"} rate=${byIsrc.rateHint ?? "-"}`);
    rows.push({
      song: label,
      isrc,
      uuid: uuidStr,
      endpoint: "by-isrc",
      status: byIsrc.status,
      usable: Boolean(uuidStr),
      note: uuidStr ? "uuid present" : "no uuid",
      rateHint: byIsrc.rateHint,
    });

    if (!uuidStr) continue;

    for (const spec of ENDPOINTS) {
      const res = await callJson(spec.path(uuidStr), headers);
      const verdict =
        res.status >= 200 && res.status < 300
          ? spec.usable(res.body)
          : { usable: false, note: `http ${res.status}` };
      console.log(
        `  ${spec.key.padEnd(28)}-> ${res.status} ${verdict.usable ? "USABLE" : "no"} ${verdict.note}  rate=${res.rateHint ?? "-"}`,
      );
      rows.push({
        song: label,
        isrc,
        uuid: uuidStr,
        endpoint: spec.key,
        status: res.status,
        usable: verdict.usable,
        note: verdict.note,
        rateHint: res.rateHint,
      });
    }
  }

  console.log(`\n${"=".repeat(72)}\nSUMMARY — endpoint coverage (usable rows / total rows)`);
  const byEndpoint = new Map<string, { u: number; t: number }>();
  for (const r of rows) {
    if (r.endpoint === "by-isrc") continue;
    const cur = byEndpoint.get(r.endpoint) ?? { u: 0, t: 0 };
    cur.t += 1;
    if (r.usable) cur.u += 1;
    byEndpoint.set(r.endpoint, cur);
  }
  for (const [k, v] of byEndpoint) {
    console.log(`  ${k.padEnd(28)} ${v.u}/${v.t}`);
  }

  if (outfile) {
    writeFileSync(outfile, JSON.stringify({ rows, byEndpoint: Object.fromEntries(byEndpoint) }, null, 2));
    console.log(`\nWrote ${outfile}`);
  }
}

main().catch((e) => {
  console.error("probe failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
