#!/usr/bin/env -S npx tsx
/**
 * scripts/validate-epi.mts
 *
 * Proves the corrected EPI against REAL Soundcharts audio features.
 *
 * Reads SOUNDCHARTS_API_KEY and SOUNDCHARTS_APP_ID from the environment and
 * never prints, logs or writes them. Every number below is computed from the
 * live feature set — nothing is hand-entered.
 *
 * Run it where the credentials already are, e.g. from a shell that has them
 * exported. It writes nothing to disk.
 *
 *   SOUNDCHARTS_API_KEY=… SOUNDCHARTS_APP_ID=… npx tsx scripts/validate-epi.mts
 */

import { getSoundchartsClient } from "../src/lib/engine/soundcharts";
import { getSpotifyClient } from "../src/lib/engine/spotify";
import {
  calculateScores,
  calculateArousal,
  calculateEpi,
  translateToEPI,
  clamp,
} from "../src/lib/engine/scores";

/** Canonical recordings, resolved by ISRC. */
const SONGS: Array<{ label: string; isrc: string }> = [
  { label: "Highway to Hell — AC/DC", isrc: "AUAP07900028" },
  { label: "Livin' On A Prayer — Bon Jovi", isrc: "USPR38619998" },
  { label: "Stick Season — Noah Kahan", isrc: "USUM72212470" },
  // Already-scanned songs, reused for the distribution sample rather than
  // spending quota on new lookups.
  { label: "Thunderstruck — AC/DC", isrc: "AUAP09000014" },
  { label: "Let's Dance — David Bowie", isrc: "USJT11700482" },
  { label: "Weightless — Marconi Union", isrc: "GBDDN1200510" },
  { label: "One More Time — Daft Punk", isrc: "GBDUW0000053" },
  { label: "Someone Like You — Adele", isrc: "GBBKS1000351" },
  { label: "Blinding Lights — The Weeknd", isrc: "USUG11904206" },
];

const n = (v: number, d = 3) => Number(v.toFixed(d));

async function main() {
  if (!process.env.SOUNDCHARTS_API_KEY || !process.env.SOUNDCHARTS_APP_ID) {
    console.error(
      "SOUNDCHARTS_API_KEY and SOUNDCHARTS_APP_ID must be present in the environment.",
    );
    process.exit(1);
  }

  const client = getSoundchartsClient();
  const epis: number[] = [];

  for (const { label, isrc } of SONGS) {
    let song: Record<string, unknown>;
    try {
      song = await client.getSongByIsrc(isrc);
    } catch (err) {
      console.log(`\n${label}  [${isrc}]  LOOKUP FAILED: ${String(err).slice(0, 90)}`);
      continue;
    }

    const audio = (song as { audio?: unknown }).audio as
      | Record<string, number>
      | undefined;
    if (!audio) {
      console.log(`\n${label}  [${isrc}]  no audio features`);
      continue;
    }

    // Recording identity as the engine sees it.
    const artistNested = (song as { artist?: { name?: string } }).artist;
    const artist =
      (song as { creditName?: string }).creditName ?? artistNested?.name ?? "?";

    const scores = calculateScores(audio);
    const epi = translateToEPI(scores, audio);
    const arousal = calculateArousal(audio);
    const oldEpi = Math.max(
      scores.focus, scores.calm, scores.motivation, scores.balance,
    );

    const tempoNorm = clamp((audio.tempo - 60) / 120);
    const loudNorm = clamp((audio.loudness + 60) / 60);
    const epiRaw = (arousal + clamp(audio.valence)) / 2;

    epis.push(epi.epiScore);

    console.log(`\n${"=".repeat(72)}`);
    console.log(`${label}`);
    console.log(`  SOUNDCHARTS META : ${song.name} — ${artist}   (analytical source only)`);
    console.log(`  ISRC             : ${isrc}`);
    console.log(`  energy ${n(audio.energy)} | tempo ${n(audio.tempo,1)} -> ${n(tempoNorm)} | loudness ${n(audio.loudness,1)} -> ${n(loudNorm)}`);
    console.log(`  danceability ${n(audio.danceability)} | acousticness ${n(audio.acousticness)} | valence ${n(audio.valence)}`);
    console.log(`  arousal          = ${n(arousal, 4)}`);
    console.log(`  epi_raw          = (${n(arousal,4)} + ${n(clamp(audio.valence),4)}) / 2 = ${n(epiRaw, 4)}`);
    console.log(`  DISPLAYED EPI    = ${epi.epiScore}`);
    console.log(`  F ${scores.focus}  C ${scores.calm}  M ${scores.motivation}  B ${scores.balance}   mode ${epi.mode}`);
    console.log(`  OLD EPI (max F/C/M/B) = ${oldEpi}   ->   CORRECTED = ${epi.epiScore}`);
    console.log(`  EPI != max(F/C/M/B)   : ${epi.epiScore !== oldEpi ? "CONFIRMED" : "EQUAL (coincidence — inspect)"}`);
  }

  // ── Identity: exercise the REAL production function ───────────────────
  // analyzeByIsrc is what the product calls. Importing it here proves the
  // shipped path returns Spotify identity, not a re-implementation of it.
  console.log(`\n${"=".repeat(72)}\nIDENTITY REGRESSION (via analyzeByIsrc — the production path)`);
  const { analyzeByIsrc } = await import("../src/lib/engine/analyze.server");
  const expected: Record<string, string> = {
    USUM72212470: "Noah Kahan",
    USUG11904206: "The Weeknd",
  };
  for (const isrc of Object.keys(expected)) {
    const sc = await getSoundchartsClient().getSongByIsrc(isrc);
    const scArtist =
      (sc as { creditName?: string }).creditName ??
      (sc as { artist?: { name?: string } }).artist?.name ?? "?";
    const payload = await analyzeByIsrc(isrc);
    const ok = payload.song.artistName === expected[isrc];
    console.log(`  ${isrc}`);
    console.log(`    soundcharts credit (REJECTED) : ${sc.name} — ${scArtist}`);
    console.log(`    PRODUCTION PAYLOAD (Spotify)  : ${payload.song.songName} — ${payload.song.artistName}`);
    console.log(`    expected artist               : ${expected[isrc]}`);
    console.log(`    features still from Soundcharts: EPI ${payload.epiScore}, F${payload.scores.focus} C${payload.scores.calm} M${payload.scores.motivation} B${payload.scores.balance}, mode ${payload.mode}`);
    console.log(`    RESULT                        : ${ok ? "PASS" : "FAIL"}`);
  }

  if (epis.length === 0) return;
  const sorted = [...epis].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;

  console.log(`\n${"=".repeat(72)}\nTRUE EPI DISTRIBUTION  (n=${sorted.length})`);
  console.log(`  min ${n(sorted[0],1)} | P25 ${n(at(0.25),1)} | median ${n(at(0.5),1)} | mean ${n(mean,1)} | P75 ${n(at(0.75),1)} | max ${n(sorted[sorted.length-1],1)}`);
  console.log(`  >= 80        : ${sorted.filter((v) => v >= 80).length}`);
  console.log(`  60 - 79.9    : ${sorted.filter((v) => v >= 60 && v < 80).length}`);
  console.log(`  < 60         : ${sorted.filter((v) => v < 60).length}`);
  console.log(`  at ceiling(>=99): ${sorted.filter((v) => v >= 99).length}   at floor(<=1): ${sorted.filter((v) => v <= 1).length}`);
}

main().catch((e) => {
  console.error("validation failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
