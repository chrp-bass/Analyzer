#!/usr/bin/env -S npx tsx
/** Production-safe, output-constrained regression check. Never log inputs or results. */
import { calculateScores, translateToEPI } from "../src/lib/engine/scores";
import { createHash } from "node:crypto";

const version = "epi-v1.0";
let category = "none";
let passed = false;

try {
  const samples = [
    { acousticness: 0.3, danceability: 0.5, energy: 0.6, instrumentalness: 0.2,
      liveness: 0.15, loudness: -8, speechiness: 0.08, tempo: 120,
      timeSignature: 4, valence: 0.5 },
    { acousticness: 0.1, danceability: 0.8, energy: 0.9, instrumentalness: 0.1,
      liveness: 0.2, loudness: -4, speechiness: 0.05, tempo: 160,
      timeSignature: 4, valence: 0.2 },
  ];
  const outcomes = samples.map((audio) => translateToEPI(calculateScores(audio), audio));
  // Accepted output fingerprints are checked inside the process only.
  const fingerprint = createHash("sha256").update(JSON.stringify(
    outcomes.map(({ epiScore, mode }) => [epiScore.toFixed(3), mode]),
  )).digest("hex");
  passed = fingerprint === "ee53bd9dfb8d359d921ac50ce5f167f5d0ddc10717acdf73678b0ba03a36c2bd";
  if (!passed) category = "regression";
} catch {
  category = "execution";
}

process.stdout.write(JSON.stringify({ result: passed ? "PASS" : "FAIL", engineVersion: version,
  timestamp: new Date().toISOString(), errorCategory: category }) + "\n");
if (!passed) process.exitCode = 1;
