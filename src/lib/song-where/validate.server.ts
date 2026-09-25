import "server-only";
import { createHash } from "node:crypto";
import { calculateScores, translateToEPI } from "@/lib/engine/scores";

/** Runs inside the production server; only a bounded, non-sensitive verdict leaves it. */
export function validateEpi(): { result: "PASS" | "FAIL"; engineVersion: string;
  timestamp: string; errorCategory: "none" | "regression" | "execution" } {
  let category: "none" | "regression" | "execution" = "none";
  try {
    const samples = [
      { acousticness: 0.3, danceability: 0.5, energy: 0.6, instrumentalness: 0.2,
        liveness: 0.15, loudness: -8, speechiness: 0.08, tempo: 120,
        timeSignature: 4, valence: 0.5 },
      { acousticness: 0.1, danceability: 0.8, energy: 0.9, instrumentalness: 0.1,
        liveness: 0.2, loudness: -4, speechiness: 0.05, tempo: 160,
        timeSignature: 4, valence: 0.2 },
    ];
    const fingerprint = createHash("sha256").update(JSON.stringify(samples.map((audio) => {
      const { epiScore, mode } = translateToEPI(calculateScores(audio), audio);
      return [epiScore.toFixed(3), mode];
    }))).digest("hex");
    if (fingerprint !== "a61f28e3d6e17ea16b9a2fdad2897e4f081f181616de68f550399accd09e32c7") {
      category = "regression";
    }
  } catch {
    category = "execution";
  }
  return { result: category === "none" ? "PASS" : "FAIL", engineVersion: "epi-v1.0",
    timestamp: new Date().toISOString(), errorCategory: category };
}
