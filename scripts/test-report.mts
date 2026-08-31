#!/usr/bin/env -S npx tsx
/**
 * scripts/test-report.mts
 *
 * Runner for src/lib/prompts/report.ts. Takes a track slug from the fixture
 * (defaults to "redline"), maps it into the TrackData shape the prompts
 * expect, and prints the generated CHRP report + the CHRP reading.
 *
 * Usage:
 *   npx tsx scripts/test-report.mts               # runs redline
 *   npx tsx scripts/test-report.mts sea-glass     # runs a different slug
 *   npm run test:report -- copper-static          # via package.json alias
 *
 * Notes:
 *   - Loads .env.local manually (tsx doesn't do it the way `next dev` does).
 *     ANTHROPIC_API_KEY must be populated in .env.local at the repo root.
 *   - The ReportPayload fixture in src/lib/fixtures/tracks.ts has CHRP
 *     scoring data but NO Spotify metadata (BPM, key, valence, etc.). This
 *     runner fabricates plausible Spotify values per mode so the prompt can
 *     execute end-to-end. When the real Spotify integration lands, drop the
 *     `SPOTIFY_STUBS` table and read from the actual scan record.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");

// ── .env.local loader ───────────────────────────────────────────────────────
function loadDotEnvLocal() {
  const p = path.join(REPO_ROOT, ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadDotEnvLocal();

// ── imports after env is loaded ─────────────────────────────────────────────
import {
  generateReport,
  generateChrpReading,
  type TrackData,
} from "../src/lib/prompts/report.ts";
import { reports } from "../src/lib/fixtures/tracks.ts";

// ── fabricated Spotify stubs per mode ───────────────────────────────────────
// Real values come from the Spotify API on scan. These are stand-ins so the
// prompt has believable inputs while that integration is still being built.
const SPOTIFY_STUBS = {
  Ready:    { bpm: 152, key: "E minor", spotify_valence: 0.62, spotify_energy: 0.94, spotify_instrumentalness: 0.18 },
  Flow:     { bpm: 118, key: "F# minor", spotify_valence: 0.55, spotify_energy: 0.72, spotify_instrumentalness: 0.42 },
  Recharge: { bpm: 92,  key: "G major",  spotify_valence: 0.78, spotify_energy: 0.44, spotify_instrumentalness: 0.28 },
  Recover:  { bpm: 74,  key: "A minor",  spotify_valence: 0.31, spotify_energy: 0.36, spotify_instrumentalness: 0.55 },
} as const;

// ── slug → TrackData ────────────────────────────────────────────────────────
function toTrackData(slug: string): TrackData {
  const rl = reports[slug];
  if (!rl) {
    const available = Object.keys(reports).join(", ");
    throw new Error(`No fixture for slug "${slug}". Available: ${available}`);
  }
  const stub = SPOTIFY_STUBS[rl.epi.mode];
  // Pull artist names out of "Artist's 'Song'" clauses in the comparable
  // prose. Split on "'s '", then take the trailing capitalized-word run from
  // each left-side chunk (which is the artist name).
  const parts = rl.comparable.split(/'s '/);
  const extracted = parts
    .slice(0, -1)
    .map((chunk) => {
      const m = chunk.match(/([A-Z][\w.]*(?:\s+[A-Z][\w.]*)*)\s*$/);
      return m?.[1]?.trim();
    })
    .filter((s): s is string => !!s);
  const comparable_artists = extracted.length > 0 ? extracted.slice(0, 2) : [rl.creator.name];
  const top = rl.where_this_music_lives.verticals[0];
  return {
    track: rl.track.title,
    artist: rl.track.artist,
    mode: rl.epi.mode,
    epi_score: rl.epi.score,
    percentile_corpus: rl.epi.rank_overall,
    percentile_mode: rl.epi.rank_in_mode,
    verdict: rl.verdict.call === "Pitch now" ? "Pitch Now" : rl.verdict.call,
    verdict_reasoning: rl.verdict.rationale,
    comparable_artists,
    demand_signal: `${rl.where_this_music_lives.confidence} — ${rl.where_this_music_lives.n_briefs} active briefs, top vertical "${top.name}" at ${top.pct}%`,
    ...stub,
    spotify_popularity: 42,
    release_date: rl.report_meta.scanned_at.slice(0, 10),
    genres: [rl.epi.mode.toLowerCase(), "cinematic", "editorial"],
    duration_seconds: 218,
  };
}

// ── entrypoint ──────────────────────────────────────────────────────────────
async function main() {
  const slug = process.argv[2] ?? "redline";
  console.log(`▸ CHRP report runner — slug: ${slug}`);
  console.log(
    `  ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? "present" : "EMPTY (see .env.local at repo root)"}`,
  );
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "\nNo ANTHROPIC_API_KEY found. Add one to .env.local:\n  ANTHROPIC_API_KEY=sk-ant-api03-...\nthen re-run.",
    );
    process.exit(1);
  }

  const data = toTrackData(slug);
  console.log("\n▸ TrackData sent to prompts:");
  console.log(JSON.stringify(data, null, 2));

  console.log("\n▸ Calling generateReport()…");
  const sections = await generateReport(data);
  const sectionsJson = JSON.stringify(sections, null, 2);
  console.log("\n═══ CHRP REPORT (structured sections) ═══\n");
  console.log(sectionsJson);

  console.log("\n▸ Calling generateChrpReading()…");
  const rhodes = await generateChrpReading(data, sectionsJson);
  console.log("\n═══ DR. RHODES READING ═══\n");
  console.log(rhodes);
}

main().catch((err) => {
  console.error("\n✖ FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
