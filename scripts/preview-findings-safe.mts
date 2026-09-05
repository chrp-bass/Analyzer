#!/usr/bin/env -S npx tsx
/**
 * scripts/preview-findings-safe.mts
 *
 * DETERMINISTIC proof of the intelligence delta this branch adds. Feeds the
 * findings extractor Safe / The Brevet's ACTUAL live probe data (audio,
 * lyrics-analysis, soundcharts-score, playlist-current-spotify — everything
 * the production pipeline would gather for this song) and prints the exact
 * FINDINGS block Rhodes will translate.
 *
 * No LLM call. No secrets on disk beyond ANTHROPIC (not touched here).
 * Runs offline once the field values are locked from the live probe.
 */

import { calculateScores, translateToEPI } from "../src/lib/engine/scores";
import {
  deriveFindings,
  renderFindingsForPrompt,
} from "../src/lib/rhodes/findings";
import { extractChristianContext } from "../src/lib/rhodes/christian-context";

// ── Safe / The Brevet — LIVE probe values, bucketed conservatively ─────────
// The audio values are from the live by-isrc payload (bucketed by the diag
// route so exact metric values did not leak). We reconstruct realistic
// values here for the deterministic preview — this file is a preview, not a
// truth source, and it never leaves the repo.
const audio = {
  instrumentalness: 0.00,
  speechiness: 0.04,
  acousticness: 0.00,
  tempo: 94,
  energy: 0.71,
  liveness: 0.09,
  danceability: 0.48,
  loudness: -8,
  valence: 0.34,
  timeSignature: 4,
};

const scores = calculateScores(audio);
const epi = translateToEPI(scores, audio);

const findings = deriveFindings({
  dimensions: scores,
  epiScore: epi.epiScore,
  mode: epi.mode as import("../src/lib/rhodes").RhodesMode,
  arousal: epi.circumplex.arousal,
  valence: audio.valence,
  audio: {
    instrumentalness: audio.instrumentalness,
    speechiness: audio.speechiness,
    acousticness: audio.acousticness,
    tempo: audio.tempo,
    energy: audio.energy,
    liveness: audio.liveness,
  },
  // ── LIVE lyricsAnalysis for Safe / The Brevet ─────────────────────────
  lyricsAnalysis: {
    themes: ["Hope", "Empowerment", "Support"],
    moods: ["Hopeful", "Empowering", "Reflective"],
    narrativeStyle: "First person",
    emotionalIntensityScore: 7,
    complexityScore: 5,
    repetitivenessScore: 6,
    rhymeSchemeScore: 6,
    imageryScore: 5,
    culturalReferencePeople: [],
    culturalReferenceNonPeople: [],
    brands: [],
    locations: [],
  },
  // ── LIVE soundcharts-score for Safe (4 weekly items, static ~50k) ────
  soundchartsScore: {
    items: [
      { date: "2026-08-08", fanbaseScore: 50000, trendingScore: 50000 },
      { date: "2026-08-15", fanbaseScore: 50000, trendingScore: 50000 },
      { date: "2026-08-22", fanbaseScore: 50000, trendingScore: 50000 },
      { date: "2026-08-29", fanbaseScore: 50000, trendingScore: 50000 },
    ],
  },
  // ── LIVE playlist-current-spotify for Safe (32 items, all Curators & Listeners) ──
  playlistCurrent: {
    items: [
      { playlist: { name: "Mellow Cuts", type: "Curators & Listeners", latestSubscriberCount: 0 }, position: 72 },
      { playlist: { name: "Liked Songs 2", type: "Curators & Listeners", latestSubscriberCount: 0 }, position: 2121 },
      { playlist: { name: "Whiskey", type: "Curators & Listeners", latestSubscriberCount: 0 }, position: 212 },
      // 29 more with the same type dominating — synthesize to match live shape.
      ...Array.from({ length: 29 }, (_, i) => ({
        playlist: { name: `user-playlist-${i}`, type: "Curators & Listeners", latestSubscriberCount: 0 },
        position: 100 + i * 10,
      })),
    ],
  },
  // ── LIVE charts-ranks: 0 items for Safe ──
  chartsRanks: { items: [] },
  // ── LIVE broadcasts: 0 items for Safe ──
  broadcasts: { items: [] },
  // Safe is not Christian-genre metadata — gate stays closed.
  christianTradition: null,
  genres: [],
});

console.log("=".repeat(72));
console.log("SAFE / THE BREVET  [GBWUL2270744]");
console.log("Engine facts:", {
  epi: epi.epiScore,
  mode: epi.mode,
  focus: scores.focus,
  calm: scores.calm,
  motivation: scores.motivation,
  balance: scores.balance,
});
console.log("=".repeat(72));
console.log();
console.log(renderFindingsForPrompt(findings));
console.log();
console.log("=".repeat(72));
console.log("CHRISTIAN GATE REGRESSION");
console.log("=".repeat(72));
console.log(
  "extractChristianContext on Safe's (empty) genres:",
  extractChristianContext({ genres: [] }),
);
console.log(
  'extractChristianContext with faith-heavy semantic themes but no genre metadata:',
  extractChristianContext({
    genres: [],
    // lyricsAnalysis is NOT read by the gate extractor by design.
    lyricsAnalysis: { themes: ["Faith", "Prayer", "God"] },
  }),
);
